# Episode 8 evidence register

Issue [#40](https://github.com/gearstack-studio/kitloop/issues/40). Procedure: [Episode 8 runbook](../../episode-8-persistence.md).

| Observation | JSON / screenshot | Current result |
| --- | --- | --- |
| Public HTTP endpoints | [public-readiness.json](public-readiness.json) | PASS — root, health and readiness returned 200 |
| Serving release identity, database and backup | Operator inventory and baseline snapshot | PENDING — capture from Cloud Shell |
| Initial request created through UI | `baseline.json` and baseline screenshot | NOT RUN |
| Same record after controlled same-image restart | `after-restart.json` and screenshot | NOT RUN |
| Same record after successful main pipeline redeploy | `after-redeploy.json`, screenshot and deployment attempt link | NOT RUN |
| Compatible traffic rollback | `after-rollback.json` and screenshot, or approved deferral note | NOT RUN |
| Roll-forward to the recorded main revision | `after-rollforward.json` and screenshot, or deferral note | NOT RUN |
| Independent review | yiiipunn review link and evidence PR | PENDING |

The first URL checks returned 404 before deployment. The latest recorded public observation returns 200 for root, health and readiness. Main workflow [43687921737](https://github.com/gearstack-studio/kitloop/actions/runs/43687921737) passed CI but skipped its deployment job; a successful automated redeploy remains pending under #38. The JSON records HTTP readiness only, with `persistenceResult: NOT_RUN` and the running revision source SHA still awaiting cloud inventory.

For each real capture, preserve the exact command, capture time, harness SHA, successful deployment SHA/run attempt, immutable digest and serving revision. Retain sanitized `failed-*.json` reports and diagnoses. Record UI UUID/status before and after each operation. Do not attach passwords, cookies, request headers, private keys, database URLs, raw service descriptions or credential files. Review all screenshots and JSON before committing them here.

Only after required live rows pass, an optional rollback decision is documented, and teammate review is complete should #40's acceptance criteria be marked complete. Closed prerequisite issues must be backed by their live evidence.
