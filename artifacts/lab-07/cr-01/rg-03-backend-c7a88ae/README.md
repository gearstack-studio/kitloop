# Part B backend RG-03 verification and release handoff

28 November 2026 ICT. Operator DEV4952. Independent frontend and production verifier yiiipunn. Refs [#85](https://github.com/gearstack-studio/kitloop/issues/85) and [#83](https://github.com/gearstack-studio/kitloop/issues/83).

## Baseline and provenance

- Tested staging `c7a88aeca70607da0cfed8966bf4074b1c2a2e24` incorporates backend [#88](https://github.com/gearstack-studio/kitloop/pull/88), frontend [#89](https://github.com/gearstack-studio/kitloop/pull/89), rollout preparation [#90](https://github.com/gearstack-studio/kitloop/pull/90), frontend follow-up [#92](https://github.com/gearstack-studio/kitloop/pull/92) and independent local evidence [#93](https://github.com/gearstack-studio/kitloop/pull/93). Production main was `e5ed70dbd65ac03d633fc7b8e0b73a72aa262490`.
- `git diff --quiet 1dca78a c7a88ae -- server client e2e infra/gcp .github` exited 0. The reviewed application and test trees match [yiiipunn's independent evidence at 1dca78a](../rg-03-independent-1dca78a/README.md). This record separately verifies backend and infrastructure at `c7a88ae`.
- Local Windows worktree, Node.js 24.22.3, Prisma 6.19.3, PostgreSQL 18.7 on loopback. Backend regression and the variant probe used different migrated synthetic databases. Offline guard suites ran on an LF export under Ubuntu. The logs include command, timestamp in ICT, exit status and source SHA.

| Verification | Result |
| --- | --- |
| Prisma client generation, migrations, backend build | 4/4 migrations applied to each local database, build and TypeScript passed. [Backend log](backend.txt) |
| Backend regression | 152/152 across 17 suites. [Backend log](backend.txt) |
| Focused lifecycle, quota, concurrency and reconciliation | 55/55 across four suites. [Backend log](backend.txt) |
| STS variant probe on the committed application | 38/38. [Variant log](variants.txt) |
| Offline deployment safeguards, GCP release guards, WIF, persistence and standalone build | All five commands exited 0. The three Python suites passed 28/28, 14/14 and 12/12. [Guard log](guards.txt) |
| Frontend and browser corroboration, application-equivalent `1dca78a` | Frontend 105/105 across three runs. Guarded Playwright 93 passed, 2 evidence-only skips. Quota-on real API browser/rehearsal evidence in [#93](../rg-03-independent-1dca78a/README.md). |

TC08a's focused rerun covered 20 rounds at P=1 and 10 at P=0. Every round admitted the expected number of submissions, and all 30 rejections were `BORROWING_QUOTA_EXCEEDED`. Injected exhaustion passed separately. TC20's five ten-round distributions are in the backend log. Checkout at P=1 returned 409 in 6/10 races, within the existing contract and tracked under R-04. Each run asserted final state.

## Active CR-01 STS mapping

The aggregate remains **19 mapped, 17 fully verified, 2 partial** under the [independent variant audit](../rg-03-independent-1dca78a/README.md). Here **B** refers to the backend log and **V** to the variant log. Frontend and browser observations come from the independent evidence.

| Case | Applicable result |
| --- | --- |
| TC01 | B first submission and V API quota grid P=0–5 passed. Unit grid remains partial. |
| TC02 | B second valid submission and V quota readback passed. |
| TC03 | B repeated 409 at capacity with unchanged writes and V boundary readback passed. |
| TC05 | B checkout recovery and V negative checkout variants passed. |
| TC06 | B and V excluded terminal requests and loans from quota. |
| TC07 | B preserved historical over-limit requests and V verified checkout at P=3. |
| TC08 | B concurrent capacity and injected serialization retry/exhaustion passed. |
| TC09 | B precedence and V AC09 variants at P=0 and P=2 passed, including no-write assertions. Duplicate tested at P=1 and P=2. |
| TC10 | B borrower isolation and rejected quota queries, V foreign request and loan readback restrictions. |
| TC11 | Frontend and real-API browser coverage from #93, including stale 409. |
| TC12 | B reconnect and V persisted readback, plus #93 browser reload. |
| TC13 | B owner cancellation restores capacity. |
| TC14 | B assigned decline and checkout auto-decline restore capacity. |
| TC16 | B history and recovery at or above capacity. |
| TC17 | B ownership, role, input and unchanged state, V missing-CSRF code. |
| TC18 | Frontend/browser recovery evidence from #93. Browser-level Refresh re-read remains partial. |
| TC19 | B flag-off behavior and valid runtime coupling, with the independent disabled-release rehearsal. |
| TC20 | B submission races with lifecycle actions and final state assertions. |
| TC21 | B three and five active loans with the exact four-field quota readback. |

## Production and release handoff

Read-only preflight on 28 November ICT reported `/api/version` = `e5ed70d` and `/api/ready` = ready. GitHub showed `LAB5_DEPLOY_ENABLED=false` and `KITLOOP_REQUEST_LIFECYCLE_WRITES=disabled`. Quota and loan maximum were unset in the observed production environment variables. The `lab5-production` environment has a required reviewer rule with `prevent_self_review=true`. Cloud Run's actual serving revision, digest and effective configuration still need authenticated operator readback.

| Gate | Status and next owner action |
| --- | --- |
| Release 1 | Await the spec 09 decision and reviewed E2E change, then verify the final staging source and its release PR CI. Both developers record an ICT window and joint authorization. yiiipunn merges staging to main, DEV4952 approves the protected deployment with both flags disabled, and yiiipunn verifies the new baseline. |
| RG-01 | Blocked on joint authorization, phase-1 readback and approved synthetic fixtures. DEV4952 performs the approved same-SHA lifecycle deploy and reviewed reconciliation; yiiipunn verifies. Follow the [runbook](../../../../infra/gcp/CR-01-RG-01.md) and [OD-13 proposal](https://github.com/gearstack-studio/kitloop/issues/83#issuecomment-7226005417). |
| RG-03 | Backend and infrastructure local verification recorded. Spec 09 is proposed as a separate quota-on configuration, with the existing quota-off suite preserved. Final candidate, candidate CI and peer review are pending. |
| RG-04 | Await approved production readback. DEV4952 executes the [contract query](../../../../docs/labs/lab-07/CR-01-impact-analysis.md#11-historical-data-handling) in a read-only transaction. Record sanitized counts and retain restricted borrower identifiers for independent verification. |
| RG-05 | Blocked by RG-01, RG-03, RG-04 and separate explicit activation approval from both developers. DEV4952 deploys quota-on with lifecycle enabled. yiiipunn verifies E1–E11. |

No release merge, production flag change, deployment, fixture creation, reconciliation, or quota activation was performed. A production result must identify the workflow run or manual deployment record, exact SHA, image digest, revision, effective flags, backup/rollback target, and verifier. Use the same approved scope for reconciliation dry run, apply and rerun. Stop on any mismatch.
