"""Optional policy classifier; the gateway suppresses would-block actions in audit mode."""

import asyncio
from datetime import datetime, timezone
import hashlib
import hmac
import json
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException
import structlog

from hackathon.api.audit_protocol import GuardRequest
from hackathon.api.nemotron_audit import POLICY, write_event
from hackathon.config import get_settings
from hackathon.moderation import SpecialistConfig, Verdict, classify

router = APIRouter()
logger = structlog.get_logger(__name__)


@router.post("/guardrails/safety/request")
async def check_safety_request(
    request: GuardRequest,
    x_guardrail_webhook_key: str | None = Header(default=None),
    x_challenge_difficulty: str | None = Header(default=None),
    x_request_id: str | None = Header(default=None),
) -> dict:
    settings = get_settings()
    if not settings.SAFETY_AUDIT_ENABLED:
        return {"action": {"reason": "safety_audit_disabled"}}
    expected = settings.SAFETY_AUDIT_WEBHOOK_KEY.get_secret_value()
    if (
        not expected
        or not x_guardrail_webhook_key
        or not hmac.compare_digest(expected.encode(), x_guardrail_webhook_key.encode())
    ):
        raise HTTPException(status_code=401, detail="Webhook authentication required")
    rows = [m.model_dump() for m in request.body.messages]
    canonical = json.dumps(rows, ensure_ascii=False, sort_keys=True)
    event = {
        "event_id": str(uuid4()),
        "checked_at_utc": datetime.now(timezone.utc).isoformat(),
        "mode": "audit",
        "phase": "request",
        "difficulty": x_challenge_difficulty,
        "request_id": x_request_id[:128] if x_request_id else None,
        "input_sha256": hashlib.sha256(canonical.encode()).hexdigest(),
        "policy_sha256": hashlib.sha256(POLICY.encode()).hexdigest(),
        "message_roles": [m["role"] for m in rows],
        "message_count": len(rows),
        "model": settings.SAFETY_AUDIT_MODEL.get("model"),
    }
    try:
        if len(canonical) > settings.SAFETY_AUDIT_MAX_INPUT_CHARS:
            raise ValueError("InputTooLarge")
        last = next(
            i for i in range(len(rows) - 1, -1, -1) if rows[i]["role"] == "user"
        )
        config = SpecialistConfig.model_validate(settings.SAFETY_AUDIT_MODEL)
        async with asyncio.timeout(config.timeout_seconds):
            verdict = await classify(
                config,
                rows[last]["content"],
                POLICY,
                history=[m for i, m in enumerate(rows) if i != last],
            )
    except Exception as exc:
        verdict = Verdict(
            "safety-audit",
            settings.SAFETY_AUDIT_MODEL.get("adapter", "unknown"),
            "error",
            error_code=type(exc).__name__,
        )
    event.update(verdict.public())
    try:
        write_event(settings.SAFETY_AUDIT_EVENTS_FILE, event)
    except OSError:
        logger.warning(
            "Safety audit event could not be persisted", event_id=event["event_id"]
        )
    logger.info("Safety audit evaluated", **event)
    action = {"reason": "safety_audit_" + verdict.outcome}
    if verdict.outcome in {"block", "review"}:
        action.update(status_code=403, body="Request flagged by safety audit.")
    elif verdict.outcome == "error":
        action.update(status_code=503, body="Safety audit evaluation unavailable.")
    return {"action": action}
