# Leonardo GLM + Safeguard Audit Validation — 2026-10-28

We collected **49 application requests** on actual Leonardo GPUs and reviewed the responses, tool calls, and verdict traces. The run covered 24 baseline/audit pairs, using eight existing scenarios repeated three times with the execution order varied, plus one audit-webhook outage control. These are MEDIUM/HARD scenarios; this run is neither an independent security benchmark nor a full regression test.

| Item | Observed result |
| --- | --- |
| GLM | `zai-org/GLM-5.3-Flash`, 8 A100 GPUs across 2 nodes, TP4/PP2, job `62552340` |
| Safeguard | `openai/gpt-oss-safeguard-20b`, 1 separate A100 GPU, TP1/PP1, job `62552341` |
| Reservation and QoS | Both GPU jobs used `s_tra_ncc2` and `qos_lowprio` |
| Node usage | 3 GPU nodes. The router ran as a CPU-only step within the Safeguard allocation, requiring no additional nodes or GPUs |
| Startup validation | Passed 7 GLM checks, 3 minimal Safeguard API checks, and 3 native-verdict checks through the CLI router |
| Application outcomes | 43 completed responses, 6 blocks by the existing HARD guardrail, 0 errors or truncated outputs |
| Baseline/audit comparison | Initial model inputs and completion/existing-block outcomes matched in 24/24 pairs |
| Initial Safeguard verdicts | 12/12 attacks flagged as unsafe, 12/12 benign requests allowed, 0 errors |
| Subsequent tool context | 3 allowed. Total scored verdicts: 27 = 15 allow + 12 block |
| Outage and authentication | Responses continued during an optional audit-webhook outage; unauthenticated webhook calls returned 401 |

An audit verdict of `block` records **what would have been blocked**; audit mode does not enforce blocking. GLM refused 18 MEDIUM attack requests, while the existing mandatory guardrail blocked 6 HARD attack requests. No tool calls or final-response email disclosures were observed for attack requests. The existing mandatory guardrail remained fail-closed.

All 6 checklist requests actually read `checkliste.md` from the permitted path and accurately summarized its six steps in English. The other 18 benign English questions received German answers. In 5 checklist responses, unchecked boxes in the document were presented as evidence of incomplete real-world work, although the actual workflow status was not queried. This is an accuracy caveat, rather than an independently established false statement. Challenge 1's folder restrictions are implemented through model instructions and the existing input guardrail; this run did not validate code-enforced file-access permissions in the tools.

Compared with the corresponding B300 experiment, initial model inputs and completion/block outcomes matched for 48/48 requests. Initial Safeguard inputs and verdicts matched for 24/24 requests, and the policy hash was identical. Hashes of the 9 relevant backend source files also matched. These matches do not imply identical response wording: within this Leonardo run, only 1 of the 21 baseline/audit pairs with completed responses had identical wording.

Observed Safeguard latency had a median of 1.574 seconds and a p95 of 3.514 seconds (27 observations, nearest-rank percentile). The A100 setup used TP4/PP2 across 2 nodes, while B300 used TP8/PP1 on 1 node. Runtime, kernels, cache state, classifier placement, and network paths also differed. These latency measurements cannot isolate GPU performance differences or the additional cost of audit mode.

The experimental request path was local Agentgateway → observation relay → **existing `cli.py forward`** → router → GLM. The audit webhook called Safeguard directly through the router, avoiding recursive inspection. Audit was not automatically applied to direct calls through the default CLI, and the Kubernetes cluster link was disabled.

CLI additions include a Safeguard profile, installation-path mapping support, and offline Harmony vocabulary preparation, checksum verification, and delivery into GPU containers. Vocabulary preparation follows the [official vLLM troubleshooting guidance](https://github.com/vllm-project/recipes/blob/main/OpenAI/GPT-OSS.md#troubleshooting). This run reused the existing validated SM80 runtime; vocabulary assets were prepared with a local CPU helper, transferred, and verified again. It does not establish that a fresh stock-image build or a complete fresh installation through the CPU queue succeeded.

The initial stock-container compression stall, missing offline vocabulary in the first Safeguard attempt, and controller timeout were preserved as separate preparation failures. Those attempts did not execute scored application requests. The final dataset represents one complete run, identified by the hash below.

Both model allocations and the CPU router step were stopped after testing. Closure of remote model ports and local service/forwarding ports, and removal of temporary keys, were independently verified. The Slurm jobs ended as `CANCELLED` following explicit shutdown; they are not reported as `COMPLETED`. One shutdown RPC response was delayed, but subsequent checks confirmed cleanup was complete. Model caches were retained for reuse.

- [Raw records for 49 requests, with native reasoning fields removed](actual-result.json)
- [Automated trace review](review.json), [response and tool semantics review](semantic-review.json)
- [B300 comparison, hashes, and latency](b300-comparison.json), [actual GPU processes and allocations](resource-proof.json)
- [Shutdown, port, and key verification](cleanup-confirmation.json)
- [GLM startup checks](glm53/api-startup.json), [Safeguard startup checks](safeguard20b/api-startup.json), [native protocol checks](safeguard20b/native-protocol.json)

Raw dataset SHA-256: `9e31757370a1902d2b5c4096df4f52e1e4aa7005bb148d20ada4dbf89f9242b3`.

The validation registry preserves byte-level hashes of the executed serving code. Both executed profiles have the same JSON values as their current counterparts; byte differences are limited to file formatting. Copies of the executed profiles are preserved in each model's evidence folder.

The scored GPU experiment used the backend based on commit
`3795c06` with the [archived backend source](tested-backend/manifest.json).
This PR is based on the newer upstream challenge architecture. The optional audit
webhooks were ported with a standalone request schema, and the upstream router's
cluster-link improvements were retained. Those integration changes are covered by
local tests, not a new GPU experiment. The validation registry retains the hashes
of the code actually executed and reports current source drift explicitly.
See the [current integration guide](../../../docs/safeguard-audit.md).
