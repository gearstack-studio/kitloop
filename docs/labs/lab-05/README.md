# KitLoop Lab 5 evidence index

Audit date: 16 November 2026 (Asia/Bangkok), tracked in [Issue #49](https://github.com/gearstack-studio/kitloop/issues/49). The requirement source is the updated CPE 334 Lab 5 handout (`01_SE_Lab_5_updated.pdf`). Its rubric weights are CI and quality gate 30, Docker and reproducible configuration 20, GCP deployment and persistence 35, and repeatable release pipeline 15. Releases follow a reviewed feature PR into staging, a reviewed release PR into main, and deployment **only from main** (R-07, R-08, C-06). A separate cloud staging environment is not required.

The handout is course material and is not committed to this repository. Requirement and check wording below follows its Sections 4.1, 7, 8 and 12. The complete mapping is in the [requirement traceability matrix](traceability.md).

## Status vocabulary

| Label | Meaning |
|:--|:--|
| `PASS` | Verified by an authentic execution record linked here. |
| `COMPLETE` | Required work or documentation is finished; no live execution is implied. |
| `DEFERRED` | Postponed with a recorded justification and any required approval. |
| `PARTIAL` | Some, but not all, parts of the requirement have evidence. |
| `PENDING` | Waiting for a named action or review. |
| `NOT VERIFIED` | Evidence in this repository or on GitHub is insufficient. |

Simulated or offline tests are never reported as live `PASS`. A reviewer-approved deferral is reported as `DEFERRED`, not as an executed check.

## Episode issue register

An issue's closed state records tracking only. It does not prove that the episode's acceptance checks passed.

| Episode | Issue | Main PRs | Status | Remaining gap |
|:--|:--|:--|:--|:--|
| 1. GCP account and cost control | [#24](https://github.com/gearstack-studio/kitloop/issues/24) | None | `PASS` | Screenshots exist only as [issue attachments](https://github.com/gearstack-studio/kitloop/issues/24#issuecomment-6853959906), not repository files |
| 2. Cloud readiness | [#25](https://github.com/gearstack-studio/kitloop/issues/25) | [#26](https://github.com/gearstack-studio/kitloop/pull/26) | `COMPLETE` | None recorded |
| 3. Docker containerization | [#27](https://github.com/gearstack-studio/kitloop/issues/27) | [#28](https://github.com/gearstack-studio/kitloop/pull/28) | `PASS` | None for the handout check; a team-added browser refresh check was not recorded |
| 4. CI on pull requests | [#29](https://github.com/gearstack-studio/kitloop/issues/29) | [#30](https://github.com/gearstack-studio/kitloop/pull/30) | `PASS` | None |
| 5. First GCP deployment | [#31](https://github.com/gearstack-studio/kitloop/issues/31) | [#32](https://github.com/gearstack-studio/kitloop/pull/32), [#33](https://github.com/gearstack-studio/kitloop/pull/33), [#42](https://github.com/gearstack-studio/kitloop/pull/42) | `PASS` | [Console captures](evidence/console/README.md): 6 of 8 verified; networking and Cloud SQL overview pending |
| 6A. GitHub OIDC and WIF | [#34](https://github.com/gearstack-studio/kitloop/issues/34) | [#36](https://github.com/gearstack-studio/kitloop/pull/36) | `PASS` | Inherited-access analysis is partial |
| 6B. IAM review and merge gates | [#35](https://github.com/gearstack-studio/kitloop/issues/35) | [#37](https://github.com/gearstack-studio/kitloop/pull/37) | `PARTIAL` | Inherited-access analysis is partial; merge gates now verified |
| 7. Automated main release | [#38](https://github.com/gearstack-studio/kitloop/issues/38) | [#39](https://github.com/gearstack-studio/kitloop/pull/39), [#43](https://github.com/gearstack-studio/kitloop/pull/43) to [#46](https://github.com/gearstack-studio/kitloop/pull/46) | `PASS` | Step 7 "URL shows the change" not shown; live rollback `DEFERRED` |
| 8. Persistence and rollback | [#40](https://github.com/gearstack-studio/kitloop/issues/40) | [#41](https://github.com/gearstack-studio/kitloop/pull/41) | `PASS` | Live rollback `DEFERRED (Reviewer Approved)`; issue still open |

Step 9 of the handout is the final documentation and PDF submission. It is tracked by Issue #49, not by an episode issue.

## Required check status

The handout (Section 8) defines each check and the evidence it expects. **Behavior** records whether the check itself was verified. **Handout evidence** records whether the expected evidence form exists.

| Check | Evidence | Behavior | Handout evidence |
|:--|:--|:--|:--|
| C-01: PR build and tests pass | [PR #37 CI run](https://github.com/gearstack-studio/kitloop/actions/runs/43618541536) and later PR runs | `PASS` | Met: CI run link and test summary |
| C-02: failing PR cannot be merged | [Disposable PR #50](evidence/merge-gate/README.md#c-02-disposable-failing-ci-test), [failed run 43819010572](https://github.com/gearstack-studio/kitloop/actions/runs/43819010572) | `PASS` | `PARTIAL`: PR link and failed check present; blocked merge recorded through the API, no screenshot |
| C-03: fresh clone builds and runs | [C-03 execution record](c-03-evidence.md), [PR A hosted CI](evidence/README.md) | `PASS` | Met: commands and output |
| C-04: sign-in, main action, rejection on the public URL | [Baseline UI](evidence/persistence/baseline-ui.png), [rejection probes](evidence/public-access/README.md) | `PASS` | `PARTIAL`: screenshots with the URL visible are missing |
| C-05: record survives restart and redeploy | [Persistence register](evidence/persistence/README.md) | `PASS` | `PARTIAL`: before screenshot only; after phases are API records |
| C-06: reviewed change from staging to main, deployed, revision matches commit | [PR #45](https://github.com/gearstack-studio/kitloop/pull/45), [release PR #46](https://github.com/gearstack-studio/kitloop/pull/46), [run 43717180011 attempt 2](https://github.com/gearstack-studio/kitloop/actions/runs/43717180011/attempts/2) | `PASS` | Met: PR links, pipeline run, revision `kitloop-be72f87e15a6-20261115143840` |

Notes:

- **C-02:** when the merge state was captured, both the failing required check and the missing approval (`REVIEW_REQUIRED`) were active. GitHub reports `BLOCKED` without separating the causes. The handout's reference setup also requires both a passing check and one approval, but the CI cause alone is not isolated.
- **C-04:** the baseline screenshot crops out the address bar, and the rejection evidence is JSON. Both behaviors are verified, but the handout asks for screenshots with the URL visible.
- **C-05:** after-restart and after-redeploy UI screenshots were never taken and cannot be recreated.
- **C-06:** the check does not require a visible change. Execution step 7 does ("the URL shows the change"), and release `be72f87` changed no application code. PRs #45 and #46 carry the `lab5` label that R-10 requires, labelled retroactively on 2026-11-16 at 08:08 UTC.

## Production release evidence

The authorized production release is [Main Cloud Run Deployment run 43717180011, attempt 2](https://github.com/gearstack-studio/kitloop/actions/runs/43717180011/attempts/2). Attempt 1 and the earlier [run 43687921737](https://github.com/gearstack-studio/kitloop/actions/runs/43687921737) passed CI but skipped the release job, so they are not deployment evidence.

| Item | Observed value | Source |
|:--|:--|:--|
| Release PR | [#46](https://github.com/gearstack-studio/kitloop/pull/46), approved by DEV4952 at `53d2532` | GitHub review record |
| Protected-main SHA | `be72f87e15a6ea0efdac75ac38e51ad2e5a03949` | Workflow run and deployment record |
| Environment approval | `lab5-production`, approved by DEV4952 | Run approvals API and [approval screenshot](evidence/deployment/release-run-43717180011-environment-approval.png) |
| CI job | [Build, test and Docker smoke](https://github.com/gearstack-studio/kitloop/actions/runs/43717180011/job/132842505247): success | Job steps |
| Release job | [Approved Cloud Run release](https://github.com/gearstack-studio/kitloop/actions/runs/43717180011/job/132843368366): success | Job steps |
| Cloud Build | `676619ea-a64f-4e49-89d5-cdb2a884a312`, SUCCESS | [job log excerpt](evidence/deployment/release-run-43717180011-log-excerpt.txt) |
| App image digest | `sha256:f149e6dba8e94305b2ee817f4c371cd5764ebdf5b2224cd1f16b42677ebeb46b` | Release record and [after-redeploy.json](evidence/persistence/after-redeploy.json) |
| Migration image digest | `sha256:e35d98349622aba0d38ec04600c84f889eab779fa4b67b025437be6c85233114` | [job log excerpt](evidence/deployment/release-run-43717180011-log-excerpt.txt) |
| Migration execution | `kitloop-migrate-4d8sw`, completed successfully | [job log excerpt](evidence/deployment/release-run-43717180011-log-excerpt.txt) |
| Serving revision | `kitloop-be72f87e15a6-20261115143840`, Ready, 100% traffic | Release record and after-redeploy.json |
| Health | `/`, `/api/health`, `/api/ready` returned HTTP 200 | Release job verification step and release record |
| Automatic rollback step | Skipped because release and verification succeeded | Job steps |
| Deployment gate after release | `LAB5_DEPLOY_ENABLED=false`, read back after the run | Release record comment |

The build, digest, migration, candidate and traffic values are confirmed by the release job's own log, read with repository access on 16 November 2026, and match the operator's [release record](https://github.com/gearstack-studio/kitloop/issues/38#issuecomment-6896493578). The [run summary screenshot](evidence/deployment/release-run-43717180011-summary.png) shows the same result.

## Persistence and rollback

| Phase | Revision | Result | Evidence |
|:--|:--|:--|:--|
| Baseline (UI request created) | `kitloop-284f41973f61-20261115080104` | `PASS` | [baseline.json](evidence/persistence/baseline.json), [baseline-ui.png](evidence/persistence/baseline-ui.png) |
| After controlled same-image restart | `kitloop-284f41973f61-20261115090539` | `PASS` | [after-restart.json](evidence/persistence/after-restart.json) |
| After main pipeline redeploy | `kitloop-be72f87e15a6-20261115143840` | `PASS` | [after-redeploy.json](evidence/persistence/after-redeploy.json) |
| Live traffic rollback and roll-forward | Not executed | `DEFERRED (Reviewer Approved)` | [Proposal](https://github.com/gearstack-studio/kitloop/issues/38#issuecomment-6896642784), [DEV4952 acceptance](https://github.com/gearstack-studio/kitloop/issues/38#issuecomment-6896877114) |

All three phases record request `899544f9-d5a8-4248-829e-db75a44cbbf1`, database `lab-5-cloud-deployment-514310:asia-southeast1:kitloop-pg` and fingerprint `8ed64726bbc9291bc61aca6f41825e7e95cb5261d0ca03f0d1816e61ff9c81ed`. Rollback coverage is limited to CI regression tests and the reviewed `release.sh rollback` procedure. Live rollback remains unverified.

## Branch protection observed on 16 November 2026

Read on 16 November 2026 with repository-admin access through the GitHub API. The staging ruleset's version history is in the [evidence gap matrix](evidence-gaps.md#staging-ruleset-history).

| Control | Observed state | Status |
|:--|:--|:--|
| `main` | Strict required check `Build, test and Docker smoke` (app 15368); no force pushes or deletions | `PASS` |
| `main` review rules | One approving review, stale-review dismissal, code-owner review, administrators included; last-push approval off | `PASS` |
| `sprint-1-staging` ruleset 27310627 | Restored on 16 November as version 57946025: active, no bypass actors; deletion, non-fast-forward, strict required check | `PASS` |
| Staging PR review rule | 1 approval, last-push approval, stale dismissal, thread resolution; [restored and read back](evidence/merge-gate/README.md#staging-ruleset-restoration). Removed twice on 15 November before restoration | `PASS` |
| `lab5-production` environment | Required reviewer DEV4952, self-review prevented, admin bypass disabled, custom branch policy | `PASS` |

## Collaboration record

Both teammates authored issues and PRs, and each Lab 5 PR has an approving review from the other teammate on its final head commit. In the Base column, `staging` means `sprint-1-staging`.

| PR | Author | Base | Approved by | Purpose |
|:--|:--|:--|:--|:--|
| [#26](https://github.com/gearstack-studio/kitloop/pull/26) | yiiipunn | staging | DEV4952 | Episode 2 cloud readiness |
| [#28](https://github.com/gearstack-studio/kitloop/pull/28) | DEV4952 | staging | yiiipunn | Episode 3 Docker |
| [#30](https://github.com/gearstack-studio/kitloop/pull/30) | DEV4952 | staging | yiiipunn | Episode 4 PR CI |
| [#32](https://github.com/gearstack-studio/kitloop/pull/32) | DEV4952 | staging | yiiipunn | Episode 5 production runtime |
| [#33](https://github.com/gearstack-studio/kitloop/pull/33) | yiiipunn | staging | DEV4952 | Episode 5 GCP infrastructure |
| [#36](https://github.com/gearstack-studio/kitloop/pull/36) | DEV4952 | staging | yiiipunn | Episode 6 OIDC and WIF |
| [#37](https://github.com/gearstack-studio/kitloop/pull/37) | yiiipunn | staging | DEV4952 | Episode 6 IAM review and gates |
| [#39](https://github.com/gearstack-studio/kitloop/pull/39) | yiiipunn | staging | DEV4952 | Episode 7 deployment workflow |
| [#42](https://github.com/gearstack-studio/kitloop/pull/42) | yiiipunn | main | DEV4952 | First release to main (changes requested, then approved) |
| [#43](https://github.com/gearstack-studio/kitloop/pull/43) | yiiipunn | staging | DEV4952 | Concurrent checkout 409 fix for PR #42's CI failure |
| [#44](https://github.com/gearstack-studio/kitloop/pull/44) | yiiipunn | staging | DEV4952 | Episode 7 security evidence |
| [#45](https://github.com/gearstack-studio/kitloop/pull/45) | yiiipunn | staging | DEV4952 | Standalone Cloud Build security |
| [#46](https://github.com/gearstack-studio/kitloop/pull/46) | yiiipunn | main | DEV4952 | Reviewed automated release to main |
| [#47](https://github.com/gearstack-studio/kitloop/pull/47), [#48](https://github.com/gearstack-studio/kitloop/pull/48) | yiiipunn | staging | DEV4952 | Sync main back into staging |
| [#41](https://github.com/gearstack-studio/kitloop/pull/41) | DEV4952 | staging | yiiipunn | Episode 8 persistence evidence |

Handout gaps in this record:

- **R-09, specific reviews:** four approvals state no specific check or finding: [#26](https://github.com/gearstack-studio/kitloop/pull/26#pullrequestreview-5873577028) ("Approve"), the first of two on [#33](https://github.com/gearstack-studio/kitloop/pull/33#pullrequestreview-5896073874) ("Ok kub"), [#43](https://github.com/gearstack-studio/kitloop/pull/43#pullrequestreview-5909496249) ("LGTM") and [#44](https://github.com/gearstack-studio/kitloop/pull/44#pullrequestreview-5910352309) ("Overall look good kub"). The other reviews are specific.
- **R-10, labels:** all 10 Lab 5 issues and all 17 Lab 5 PRs now carry `lab5`. PRs [#26](https://github.com/gearstack-studio/kitloop/pull/26), [#44](https://github.com/gearstack-studio/kitloop/pull/44), [#45](https://github.com/gearstack-studio/kitloop/pull/45) and [#46](https://github.com/gearstack-studio/kitloop/pull/46) were labelled retroactively on 2026-11-16 at 08:08 UTC by yiiipunn; their existing labels, content, reviews and states were not changed.

## Missing evidence

Each item below is missing or incomplete. None is fabricated or replaced by a substitute. The [evidence gap matrix](evidence-gaps.md) gives the safe next action for each.

1. C-02: a screenshot of the blocked merge button. PR #50 is closed, so its merge box can no longer be captured.
2. C-04: screenshots of sign-in, the request action and a rejection with the public URL visible.
3. C-05: after-restart and after-redeploy UI screenshots, which cannot be recreated; see the [Episode 8 note](evidence-gaps.md#episode-8-ui-evidence).
4. Episode 5: the Cloud Run networking and Cloud SQL overview [Console captures](evidence/console/README.md#still-needed). Six of eight are verified.
5. Episode 7: a visible change on the public URL (execution step 7). The `lab5-production` approval is [captured](evidence/deployment/release-run-43717180011-environment-approval.png).
6. R-09: the non-specific reviews listed under [Collaboration record](#collaboration-record). They cannot be changed retroactively.
7. Episode 1: the Free Trial, billing, budget and IAM screenshots are [issue attachments](https://github.com/gearstack-studio/kitloop/issues/24#issuecomment-6853959906) only. Mask the email addresses in the IAM image before copying it into the PDF or repository.
8. Architecture and CI/CD diagrams for the PDF; the Mermaid sources are in the [traceability matrix](traceability.md#architecture-and-release-pipeline).

## Document map

| Document | Purpose |
|:--|:--|
| [traceability.md](traceability.md) | Requirement-to-evidence matrix and diagrams |
| [evidence-gaps.md](evidence-gaps.md) | Evidence gap matrix, approval-gated test plans and ruleset history |
| [evidence/deployment/README.md](evidence/deployment/README.md), [evidence/public-access/README.md](evidence/public-access/README.md), [evidence/merge-gate/README.md](evidence/merge-gate/README.md) | Release, public rejection, ruleset and C-02 evidence with provenance |
| [evidence/console/README.md](evidence/console/README.md) | Pending GCP Console capture checklist |
| [GITHUB-COLLABORATION-LOG.md](GITHUB-COLLABORATION-LOG.md) | Issue, PR, review and approval history for every Lab 5 issue |
| [deployment.md](deployment.md) | Stack, environment settings and episode deployment runbooks |
| [episode-7-deployment.md](episode-7-deployment.md) | Release workflow, WIF and IAM contract |
| [episode-7-security-review.md](episode-7-security-review.md) | Point-in-time security inventory, 15 November |
| [episode-7-standalone-build.md](episode-7-standalone-build.md) | Cloud Build IAM approach for the standalone project |
| [episode-8-persistence.md](episode-8-persistence.md) | Persistence runbook and current result |
| [evidence/persistence/README.md](evidence/persistence/README.md) | Persistence evidence register and checksums |
| [wif-iam-merge-gates.md](wif-iam-merge-gates.md), [evidence/iam/README.md](evidence/iam/README.md) | Episode 6 IAM review and screenshots |
| [c-03-evidence.md](c-03-evidence.md), [production-runtime-review.md](production-runtime-review.md) | Episode 3 and Episode 5 runtime verification |

Point-in-time records keep the statements that were true when they were written. A dated status note at the top of each one points back to this index.
