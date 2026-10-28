"""Transport tests are safeguards, not evidence of actual model inference."""

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx

from hackathon.moderation import (
    SpecialistConfig,
    Verdict,
    aggregate,
    apply_specialists,
    classify,
    parse_qwen,
)


class Parsers(unittest.TestCase):
    def test_controversial_is_not_silently_safe(self):
        outcome, categories = parse_qwen("Safety: Controversial\nCategories: PII")
        v = Verdict("q", "qwen3guard", outcome, categories)
        self.assertEqual(outcome, "review")
        self.assertEqual(aggregate([v]), "block")
        self.assertEqual(aggregate([v], block_controversial=False), "allow")

    def test_ambiguous_verdict_rejected(self):
        with self.assertRaises(ValueError):
            parse_qwen("Safety: Safe\nSafety: Unsafe\nCategories: None")

    def test_incomplete_coverage_does_not_allow(self):
        self.assertEqual(
            aggregate(
                [Verdict("q", "qwen3guard", "allow"), Verdict("n", "nemotron", "error")]
            ),
            "error",
        )
        self.assertEqual(aggregate([]), "error")


class Transport(unittest.IsolatedAsyncioTestCase):
    async def test_length_finish_is_error_not_block(self):
        config = SpecialistConfig(
            id="q",
            adapter="qwen3guard",
            model="guard",
            base_url="http://127.0.0.1:1/v1",
            key_env="LAB_TEST_KEY",
        )

        def respond(request):
            self.assertEqual(request.headers["Authorization"], "Bearer dummy-test-only")
            return httpx.Response(
                200,
                json={
                    "id": "test-only-response",
                    "model": "guard",
                    "choices": [
                        {
                            "finish_reason": "length",
                            "message": {"content": "Safety: Unsafe\nCategories: PII"},
                        }
                    ],
                },
            )

        with patch.dict("os.environ", {"LAB_TEST_KEY": "dummy-test-only"}):
            async with httpx.AsyncClient(
                transport=httpx.MockTransport(respond)
            ) as client:
                v = await classify(config, "example", "policy", client)
        self.assertEqual(v.outcome, "error")
        self.assertNotIn("dummy-test-only", repr(v.evidence))

    async def test_wrong_model_rejected(self):
        config = SpecialistConfig(
            id="n",
            adapter="nemotron",
            model="expected",
            base_url="http://127.0.0.1:1/v1",
            key_env="LAB_TEST_KEY",
        )
        response = {
            "id": "test-only",
            "model": "wrong",
            "choices": [
                {
                    "finish_reason": "stop",
                    "message": {"content": "Prompt harm: unharmful"},
                }
            ],
        }
        with patch.dict("os.environ", {"LAB_TEST_KEY": "dummy-test-only"}):
            async with httpx.AsyncClient(
                transport=httpx.MockTransport(
                    lambda r: httpx.Response(200, json=response)
                )
            ) as client:
                v = await classify(config, "example", "policy", client)
        self.assertEqual(v.outcome, "error")


class Integration(unittest.IsolatedAsyncioTestCase):
    def settings(self, mode):
        return SimpleNamespace(
            SPECIALIST_MODERATION_MODE=mode,
            SPECIALIST_MODERATION_MODELS=[
                {
                    "id": "q",
                    "adapter": "qwen3guard",
                    "model": "guard",
                    "base_url": "http://127.0.0.1:1/v1",
                    "key_env": "TEST_UNUSED",
                }
            ],
        )

    async def test_shadow_observes_without_changing_existing_action(self):
        action = {"action": {"reason": "hard_input_passed"}}
        with patch(
            "hackathon.moderation.classify",
            AsyncMock(return_value=Verdict("q", "qwen3guard", "block")),
        ):
            self.assertEqual(
                await apply_specialists(
                    "example",
                    action,
                    self.settings("shadow"),
                    "policy",
                    SimpleNamespace(info=lambda *a, **k: None),
                ),
                action,
            )

    async def test_off_mode_makes_no_specialist_request(self):
        action = {"action": {"reason": "hard_input_passed"}}
        with patch("hackathon.moderation.classify", AsyncMock()) as check:
            self.assertEqual(
                await apply_specialists(
                    "example", action, SimpleNamespace(), "policy", None
                ),
                action,
            )
        check.assert_not_awaited()

    async def test_invalid_enforcement_config_fails_closed(self):
        settings = SimpleNamespace(
            SPECIALIST_MODERATION_MODE="enforce", SPECIALIST_MODERATION_MODELS=[]
        )
        result = await apply_specialists(
            "example",
            {"action": {}},
            settings,
            "policy",
            SimpleNamespace(warning=lambda *a, **k: None),
        )
        self.assertEqual(result["action"]["status_code"], 503)

    async def test_multiple_models_preserve_verified_rejection(self):
        settings = self.settings("enforce")
        settings.SPECIALIST_MODERATION_MODELS.append(
            {
                **settings.SPECIALIST_MODERATION_MODELS[0],
                "id": "n",
                "adapter": "nemotron",
            }
        )

        async def verdict(config, *args):
            return Verdict(
                config.id, config.adapter, "block" if config.id == "q" else "error"
            )

        with patch(
            "hackathon.moderation.classify", AsyncMock(side_effect=verdict)
        ) as check:
            result = await apply_specialists(
                "example",
                {"action": {}},
                settings,
                "policy",
                SimpleNamespace(info=lambda *a, **k: None),
            )
        self.assertEqual(check.await_count, 2)
        self.assertEqual(result["action"]["status_code"], 403)

    async def test_enforce_returns_service_error_on_checker_failure(self):
        with patch(
            "hackathon.moderation.classify",
            AsyncMock(return_value=Verdict("q", "qwen3guard", "error")),
        ):
            result = await apply_specialists(
                "example",
                {"action": {}},
                self.settings("enforce"),
                "policy",
                SimpleNamespace(info=lambda *a, **k: None),
            )
        self.assertEqual(result["action"]["status_code"], 503)

    async def test_original_policy_block_cannot_be_overridden(self):
        action = {"action": {"status_code": 403, "reason": "hard_input"}}
        with patch(
            "hackathon.moderation.classify",
            AsyncMock(return_value=Verdict("q", "qwen3guard", "allow")),
        ):
            result = await apply_specialists(
                "example",
                action,
                self.settings("enforce"),
                "policy",
                SimpleNamespace(info=lambda *a, **k: None),
            )
        self.assertEqual(result, action)


if __name__ == "__main__":
    unittest.main()
