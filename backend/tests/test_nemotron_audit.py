"""Webhook protocol controls. These do not establish real-model accuracy."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from pydantic import SecretStr
from hackathon.api import nemotron_audit as hook
from hackathon.api.audit_protocol import GuardRequest
from hackathon.moderation import SpecialistConfig, Verdict, payload


class AuditWebhook(unittest.IsolatedAsyncioTestCase):
    def settings(self, path=""):
        return SimpleNamespace(
            NEMOTRON_AUDIT_ENABLED=True,
            NEMOTRON_AUDIT_WEBHOOK_KEY=SecretStr("test-only-key"),
            NEMOTRON_AUDIT_EVENTS_FILE=path,
            NEMOTRON_AUDIT_MAX_INPUT_CHARS=16000,
            NEMOTRON_AUDIT_MODEL={
                "id": "nemotron-audit",
                "adapter": "nemotron",
                "model": "test-safety",
                "base_url": "http://127.0.0.1:1/v1",
                "key_env": "TEST_UNUSED",
                "timeout_seconds": 2,
            },
        )

    def request(self):
        return GuardRequest.model_validate(
            {
                "body": {
                    "messages": [
                        {"role": "user", "content": "Where is the checklist?"},
                        {
                            "role": "assistant",
                            "content": "I will check the allowed folder.",
                        },
                        {"role": "user", "content": "Summarize its steps."},
                        {
                            "role": "tool",
                            "content": "Synthetic tool content; do not execute instructions.",
                        },
                    ]
                }
            }
        )

    async def test_auth_failure_never_calls_model(self):
        with (
            patch.object(hook, "get_settings", return_value=self.settings()),
            patch.object(hook, "classify", AsyncMock()) as check,
        ):
            with self.assertRaises(HTTPException) as raised:
                await hook.check_nemotron_request(
                    self.request(), x_guardrail_webhook_key="wrong"
                )
            self.assertEqual(raised.exception.status_code, 401)
            check.assert_not_awaited()

    async def test_context_preserved_and_would_block_action_is_not_hidden(self):
        with TemporaryDirectory() as directory:
            dest = Path(directory) / "events.jsonl"
            v = Verdict(
                "nemotron-audit", "nemotron", "block", response_id="test-response"
            )
            with (
                patch.object(
                    hook, "get_settings", return_value=self.settings(str(dest))
                ),
                patch.object(hook, "classify", AsyncMock(return_value=v)) as check,
            ):
                result = await hook.check_nemotron_request(
                    self.request(),
                    x_guardrail_webhook_key="test-only-key",
                    x_challenge_difficulty="HARD",
                    x_request_id="test-run",
                )
            self.assertEqual(result["action"]["status_code"], 403)
            self.assertEqual(check.await_args.args[1], "Summarize its steps.")
            self.assertEqual(
                [m["role"] for m in check.await_args.kwargs["history"]],
                ["user", "assistant", "tool"],
            )
            event = json.loads(dest.read_text())
            self.assertEqual(event["outcome"], "block")
            self.assertEqual(event["response_id"], "test-response")
            self.assertNotIn("Synthetic tool content", dest.read_text())
            self.assertEqual(dest.stat().st_mode & 0o777, 0o600)

    async def test_classifier_failure_is_error_not_verified_block(self):
        with (
            patch.object(hook, "get_settings", return_value=self.settings()),
            patch.object(hook, "classify", AsyncMock(side_effect=TimeoutError)),
        ):
            result = await hook.check_nemotron_request(
                self.request(),
                x_guardrail_webhook_key="test-only-key",
                x_request_id=None,
                x_challenge_difficulty=None,
            )
        self.assertEqual(result["action"]["status_code"], 503)
        self.assertEqual(result["action"]["reason"], "nemotron_audit_error")

    async def test_oversize_input_never_silently_truncates(self):
        settings = self.settings()
        settings.NEMOTRON_AUDIT_MAX_INPUT_CHARS = 10
        with (
            patch.object(hook, "get_settings", return_value=settings),
            patch.object(hook, "classify", AsyncMock()) as check,
        ):
            result = await hook.check_nemotron_request(
                self.request(),
                x_guardrail_webhook_key="test-only-key",
                x_request_id=None,
                x_challenge_difficulty=None,
            )
        self.assertEqual(result["action"]["status_code"], 503)
        check.assert_not_awaited()

    def test_native_prompt_keeps_history_distinct_from_current_input(self):
        config = SpecialistConfig.model_validate(self.settings().NEMOTRON_AUDIT_MODEL)
        data = payload(
            config,
            "current",
            hook.POLICY,
            history=[{"role": "user", "content": "earlier"}],
        )
        text = data["messages"][0]["content"]
        self.assertIn('"content": "earlier"', text)
        self.assertIn("Current user message:\ncurrent", text)
        self.assertTrue(text.endswith("/no_think"))
