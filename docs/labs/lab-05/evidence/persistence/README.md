# Episode 8 evidence register

Issue [#40](https://github.com/gearstack-studio/kitloop/issues/40). Procedure: [Episode 8 runbook](../../episode-8-persistence.md).

| Observation | JSON / screenshot | Current result |
| --- | --- | --- |
| Public HTTP endpoints | [public-readiness.json](public-readiness.json) | PASS: root, health and readiness returned 200 |
| Serving release identity, database and backup | [baseline.json](baseline.json), [after-redeploy.json](after-redeploy.json) | PASS: captured revision/source/digest and successful backup identity/time |
| Initial request created through UI | [baseline-ui.png](baseline-ui.png), [baseline.json](baseline.json) | PASS: baseline observed 2026-11-15T09:04:12.831675Z |
| Same record after controlled same-image restart | [after-restart.json](after-restart.json) | PASS: observed 2026-11-15T09:07:13.485988Z |
| Same record after successful main pipeline redeploy | [after-redeploy.json](after-redeploy.json), [deployment attempt](https://github.com/gearstack-studio/kitloop/actions/runs/43717180011/attempts/2) | PASS: observed 2026-11-15T15:23:22.831879Z |
| Compatible traffic rollback | [Proposed deferral](https://github.com/gearstack-studio/kitloop/issues/38#issuecomment-6896642784), [DEV4952 acceptance](https://github.com/gearstack-studio/kitloop/issues/38#issuecomment-6896877114) | DEFERRED (Reviewer Approved): not executed |
| Roll-forward to the recorded main revision | Same accepted deferral | DEFERRED (Reviewer Approved): not executed |
| Independent review | [PR #41](https://github.com/gearstack-studio/kitloop/pull/41), reviewer yiiipunn | COMPLETE: approved at `4c71c07`, merged as `959f3fa` |

The original UI screenshot is preserved byte for byte. It shows request `899544f9-d5a8-4248-829e-db75a44cbbf1`, asset `LAB5-CAMERA-001`, status `PENDING`; its crop excludes the address bar/account identity. No additional post-operation UI screenshot is claimed. The authenticated API observations match the original request ID, database and fingerprint across all three phases; see [the verified issue evidence](https://github.com/gearstack-studio/kitloop/issues/40#issuecomment-6896828582).

The earlier HTTP 404 and skipped run 43687921737 describe historical states. Public-readiness JSON retains its original `persistenceResult: NOT_RUN`; the three phase reports provide the completed persistence evidence. Harness commit: `81e57bdc0225675cccbc5daf79152310d809bd11`. The recorded backup completed at `2026-11-15T08:43:12.278Z`; no new backup-freshness check is claimed.

SHA-256 checksums:
- `baseline.json`: `9dbedba749375f7315c7ad9e6f1a7fbba19f99cc275a888065a9d7f549adc9da`
- `after-restart.json`: `83076103a753e7d34df38d475076e23c6a223b2263cf33cb522e26a9e5394833`
- `after-redeploy.json`: `1e2de05639dde6c4aed03397826f3d1de9b1c71a7b798a2aab06ab3863bc69d7`

For each real capture, preserve the exact command, capture time, harness SHA, successful deployment SHA/run attempt, immutable digest and serving revision. Retain sanitized `failed-*.json` reports and diagnoses. Record UI UUID/status before and after each operation. Do not attach passwords, cookies, request headers, private keys, database URLs, raw service descriptions or credential files. Review all screenshots and JSON before committing them here.

Status on 16 November 2026: the required live rows pass, the rollback decision is a reviewer-approved deferral, and teammate review is complete. Live rollback remains unverified and must not be reported as PASS. Issue #40 stays open until its owner closes it. Closed prerequisite issues must be backed by their live evidence.
