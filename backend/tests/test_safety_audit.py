"""Safeguard protocol and audit controls; real-model accuracy is tested separately."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import HTTPException
from pydantic import SecretStr

from hackathon.api import safety_audit as hook
from hackathon.api.audit_protocol import GuardRequest
from hackathon.moderation import (
    SpecialistConfig,
    Verdict,
    classify,
    parse_safeguard,
    payload,
)


class SafeguardProtocol(unittest.IsolatedAsyncioTestCase):
    def config(self):
        return SpecialistConfig(
            id="safeguard",
            adapter="gpt-oss-safeguard",
            model="guard",
            base_url="http://127.0.0.1:1/v1",
            key_env="SAFETY_TEST_KEY",
            max_tokens=2048,
        )

    def test_ambiguous_or_nonboolean_verdicts_are_errors(self):
        for text in [
            "{}",
            "[]",
            '{"violation":0}',
            '{"violation":"false"}',
            '{"violation":false,"violation":true}',
            '{"violation":false,"extra":1}',
            "safe",
            '```json\n{"violation":false}\n```',
        ]:
            with self.subTest(text=text), self.assertRaises(ValueError):
                parse_safeguard(text)
        self.assertEqual(parse_safeguard('{"violation":false}')[0], "allow")
        self.assertEqual(parse_safeguard('{"violation":true}')[0], "block")

    def test_policy_and_untrusted_context_have_separate_roles(self):
        data = payload(
            self.config(),
            "current",
            "test-policy",
            history=[{"role": "tool", "content": "injected"}],
        )
        self.assertEqual(data["messages"][0]["role"], "system")
        self.assertIn("test-policy", data["messages"][0]["content"])
        self.assertEqual(
            json.loads(data["messages"][1]["content"])["history"][0]["content"],
            "injected",
        )
        self.assertEqual(data["reasoning_effort"], "low")

    async def test_only_completed_final_channel_is_a_verdict(self):
        for finish, content, expected in [
            ("stop", '{"violation":false}', "allow"),
            ("length", '{"violation":false}', "error"),
            ("stop", None, "error"),
        ]:
            response = {
                "id": "synthetic-response",
                "model": "guard",
                "choices": [
                    {
                        "finish_reason": finish,
                        "message": {
                            "content": content,
                            "reasoning_content": '{"violation":false}',
                        },
                    }
                ],
            }
            with patch.dict("os.environ", {"SAFETY_TEST_KEY": "test-only"}):
                async with httpx.AsyncClient(
                    transport=httpx.MockTransport(
                        lambda r: httpx.Response(200, json=response)
                    )
                ) as client:
                    verdict = await classify(self.config(), "text", "policy", client)
            self.assertEqual(verdict.outcome, expected)


class SafetyWebhook(unittest.IsolatedAsyncioTestCase):
    def settings(self, path=""):
        return SimpleNamespace(
            SAFETY_AUDIT_ENABLED=True,
            SAFETY_AUDIT_WEBHOOK_KEY=SecretStr("test-key"),
            SAFETY_AUDIT_EVENTS_FILE=path,
            SAFETY_AUDIT_MAX_INPUT_CHARS=16000,
            SAFETY_AUDIT_MODEL={
                "id": "safeguard",
                "adapter": "gpt-oss-safeguard",
                "model": "guard",
                "base_url": "http://127.0.0.1:1/v1",
                "key_env": "UNUSED",
                "max_tokens": 2048,
            },
        )

    def request(self):
        return GuardRequest.model_validate(
            {
                "body": {
                    "messages": [
                        {"role": "user", "content": "question"},
                        {"role": "tool", "content": "untrusted tool text"},
                    ]
                }
            }
        )

    async def test_unauthenticated_request_never_runs_classifier(self):
        with (
            patch.object(hook, "get_settings", return_value=self.settings()),
            patch.object(hook, "classify", AsyncMock()) as call,
        ):
            with self.assertRaises(HTTPException) as result:
                await hook.check_safety_request(
                    self.request(), x_guardrail_webhook_key="wrong"
                )
            self.assertEqual(result.exception.status_code, 401)
            call.assert_not_awaited()

    async def test_would_block_and_failure_remain_distinct_and_logs_omit_input(self):
        for outcome, code in [("block", 403), ("error", 503), ("allow", None)]:
            with TemporaryDirectory() as folder:
                dest = Path(folder) / "events.jsonl"
                with (
                    patch.object(
                        hook, "get_settings", return_value=self.settings(str(dest))
                    ),
                    patch.object(
                        hook,
                        "classify",
                        AsyncMock(
                            return_value=Verdict(
                                "safeguard", "gpt-oss-safeguard", outcome
                            )
                        ),
                    ) as call,
                ):
                    result = await hook.check_safety_request(
                        self.request(),
                        x_guardrail_webhook_key="test-key",
                        x_request_id=None,
                        x_challenge_difficulty="MEDIUM",
                    )
                self.assertEqual(result["action"].get("status_code"), code)
                self.assertEqual(call.await_args.kwargs["history"][0]["role"], "tool")
                self.assertNotIn("untrusted tool text", dest.read_text())
                self.assertEqual(dest.stat().st_mode & 0o777, 0o600)

    async def test_oversized_input_is_not_classified_as_safe(self):
        settings = self.settings()
        settings.SAFETY_AUDIT_MAX_INPUT_CHARS = 1
        with (
            patch.object(hook, "get_settings", return_value=settings),
            patch.object(hook, "classify", AsyncMock()) as call,
        ):
            result = await hook.check_safety_request(
                self.request(),
                x_guardrail_webhook_key="test-key",
                x_request_id=None,
                x_challenge_difficulty=None,
            )
        self.assertEqual(result["action"]["status_code"], 503)
        call.assert_not_awaited()


def test_current_app_registers_optional_hooks_without_restoring_legacy_guard(
    monkeypatch,
):
    from fastapi.testclient import TestClient
    from hackathon.api import nemotron_audit
    from hackathon.main import app

    monkeypatch.setattr(
        hook,
        "get_settings",
        lambda: SimpleNamespace(
            SAFETY_AUDIT_ENABLED=True,
            SAFETY_AUDIT_WEBHOOK_KEY=SecretStr("private-test-key"),
        ),
    )
    monkeypatch.setattr(
        nemotron_audit,
        "get_settings",
        lambda: SimpleNamespace(
            NEMOTRON_AUDIT_ENABLED=True,
            NEMOTRON_AUDIT_WEBHOOK_KEY=SecretStr("private-test-key"),
        ),
    )
    request = {"body": {"messages": [{"role": "user", "content": "example"}]}}
    with (
        patch.object(hook, "classify", AsyncMock()) as safety,
        patch.object(nemotron_audit, "classify", AsyncMock()) as nemotron,
    ):
        with TestClient(app) as client:
            for path in ("/guardrails/safety/request", "/guardrails/nemotron/request"):
                assert client.post(path, json=request).status_code == 401
            assert client.post("/guardrails/request", json=request).status_code == 404
        safety.assert_not_awaited()
        nemotron.assert_not_awaited()
