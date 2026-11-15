# Episode 8 evidence register

Issue [#40](https://github.com/gearstack-studio/kitloop/issues/40). Procedure: [Episode 8 runbook](../../episode-8-persistence.md).

| Observation | JSON / screenshot | Current result |
| --- | --- | --- |
| Public service, release identity and backup | Operator inventory and baseline snapshot | BLOCKED — no service rows in target region were reported |
| Initial request created through UI | `baseline.json` and baseline screenshot | NOT RUN |
| Same record after controlled same-image restart | `after-restart.json` and screenshot | NOT RUN |
| Same record after successful main pipeline redeploy | `after-redeploy.json`, screenshot and deployment attempt link | NOT RUN |
| Compatible traffic rollback | `after-rollback.json` and screenshot, or approved deferral note | NOT RUN |
| Roll-forward to the recorded main revision | `after-rollforward.json` and screenshot, or deferral note | NOT RUN |
| Independent review | yiiipunn review link and evidence PR | PENDING |

The current URL checks returned 404 for `/api/health` and `/api/ready` at the configured canonical origin. This table contains no fabricated successful cloud evidence. Offline tests of the capture tool are separate from live observations.

For each real capture, preserve the exact command, capture time, harness SHA, successful deployment SHA/run attempt, immutable digest and serving revision. Retain sanitized `failed-*.json` reports and diagnoses. Record UI UUID/status before and after each operation. Do not attach passwords, cookies, request headers, private keys, database URLs, raw service descriptions or credential files. Review all screenshots and JSON before committing them here.

Only after required live rows pass, an optional rollback decision is documented, and teammate review is complete should #40's acceptance criteria be marked complete. Closed prerequisite issues must be backed by their live evidence.
