# Optional Safeguard audit integration

The current backend exposes `/guardrails/safety/request` and
`/guardrails/nemotron/request` as optional Agentgateway webhooks. Both are disabled
by default. The current `ChallengeGuardrails` capability and the separate
`guardrail/` service remain in place. The generic specialist aggregation helpers
in `hackathon.moderation` are not automatically attached to challenge requests.

For Safeguard, configure these backend environment variables through the local
process environment or the deployment's secret/configuration mechanism:

| Variable | Value or purpose |
| --- | --- |
| `SAFETY_AUDIT_ENABLED` | `true` to evaluate the optional webhook |
| `SAFETY_AUDIT_WEBHOOK_KEY` | A private random key shared only with the gateway |
| `SAFETY_AUDIT_MODEL` | JSON configuration shown below |
| `SAFETY_AUDIT_EVENTS_FILE` | Optional server-owned JSONL destination; created with mode `0600` |
| `SAFETY_AUDIT_MAX_INPUT_CHARS` | Default `16000`; oversized input produces an evaluation error |

Example model configuration (replace the endpoint and private key-file path):

```json
{
  "id": "safeguard-audit",
  "adapter": "gpt-oss-safeguard",
  "model": "gpt-oss-safeguard-20b-leonardo",
  "base_url": "http://127.0.0.1:18090/v1",
  "key_file": "/private/runtime/router-token",
  "timeout_seconds": 45,
  "max_tokens": 2048
}
```

The endpoint must reach Safeguard directly through the CLI/router, rather than
through the gateway route being audited. This avoids recursive moderation.
Run the classifier with the pinned `safeguard20b` profile; its Harmony vocabulary
assets must be installed and verified before scheduling offline GPU inference.
The laptop port above is an example of a router forward, not a fixed profile port.

Add the optional request webhook to the **target model's** gateway route. Set its
path to `/guardrails/safety/request`, send the matching private
`x-guardrail-webhook-key`, and forward `x-challenge-difficulty` and a request ID
where available. Keep `action: audit` and `failureMode: failOpen` on this optional
webhook only. Give its HTTP timeout more time than the configured classifier
budget (the measured run used 50 seconds for a 45-second classifier budget).
Do not commit the generated gateway configuration containing the private key.
The generated Leonardo model catalog does not enable this optional webhook by
itself; it only makes the classifier routable.

The webhook returns a would-block action for `block`/`review` (403), an evaluation
error action for `error` (503), and a pass action for `allow`. Its HTTP response is
200 for these protocol actions. Agentgateway's audit mode suppresses the action;
without `action: audit`, a returned would-block action can become enforcement.
Authentication failures return HTTP 401 without invoking the classifier.
Keep existing mandatory guardrails and their failure policies unchanged.

Only a completed final-channel JSON verdict with exactly one boolean `violation`
field is accepted. Truncation, malformed output, wrong model identity, and transport
failures are errors, not successful safety verdicts. Events record hashes, roles,
verdicts, and timing rather than prompt text or native reasoning. Optional webhook
paths are excluded from automatic FastAPI request tracing.

For Nemotron, use the corresponding `NEMOTRON_AUDIT_*` variables, the
`/guardrails/nemotron/request` path, and the `nemotron` adapter with a compatible
self-hosted model. This is a separate classifier protocol, not a claim that the
two models have identical safety coverage.

## Validation scope

The [28 October GPU report](../validation/runs/2026-10-28-safeguard-audit/README.md)
records the historical Challenge 1 implementation used for 49 scored application
requests. Its [backend snapshot](../validation/runs/2026-10-28-safeguard-audit/tested-backend/manifest.json)
preserves those exact source bytes. After the upstream challenge refactor, the
optional webhooks were ported to the current backend with a standalone request
schema and tracing exclusions. That port is covered by local tests; it has not
been rerun on GPUs. The report's model verdict counts do not validate the new
Challenge 2/3 policies or the current end-to-end deployment.
