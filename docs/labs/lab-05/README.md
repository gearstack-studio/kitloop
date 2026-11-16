# KitLoop Lab 5 evidence index

Audit date: 16 November 2026 (Asia/Bangkok), tracked in [Issue #49](https://github.com/gearstack-studio/kitloop/issues/49). The updated CPE 334 Lab 5 handout is the requirement source. Its release path is a reviewed feature PR into staging, a reviewed release PR from staging into main, and deployment **only from main**, with the serving Cloud Run revision traceable to that main commit (R-07, R-08, C-06). A separate cloud staging environment is optional.

The official handout and grading rubric are not stored in this repository. Requirement IDs below are the R-xx and C-xx identifiers already quoted in the Lab 5 documents. The complete mapping is in the [requirement traceability matrix](traceability.md).

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
| 3. Docker containerization | [#27](https://github.com/gearstack-studio/kitloop/issues/27) | [#28](https://github.com/gearstack-studio/kitloop/pull/28) | `PARTIAL` | C-03 browser refresh check not recorded |
| 4. CI on pull requests | [#29](https://github.com/gearstack-studio/kitloop/issues/29) | [#30](https://github.com/gearstack-studio/kitloop/pull/30) | `PASS` | None |
| 5. First GCP deployment | [#31](https://github.com/gearstack-studio/kitloop/issues/31) | [#32](https://github.com/gearstack-studio/kitloop/pull/32), [#33](https://github.com/gearstack-studio/kitloop/pull/33), [#42](https://github.com/gearstack-studio/kitloop/pull/42) | `PASS` | First-release Cloud Build ID and console screenshots not in repository |
| 6A. GitHub OIDC and WIF | [#34](https://github.com/gearstack-studio/kitloop/issues/34) | [#36](https://github.com/gearstack-studio/kitloop/pull/36) | `PASS` | Inherited-access analysis is partial |
| 6B. IAM review and merge gates | [#35](https://github.com/gearstack-studio/kitloop/issues/35) | [#37](https://github.com/gearstack-studio/kitloop/pull/37) | `PARTIAL` | Inherited-access analysis is partial; merge gates now verified |
| 7. Automated main release | [#38](https://github.com/gearstack-studio/kitloop/issues/38) | [#39](https://github.com/gearstack-studio/kitloop/pull/39), [#43](https://github.com/gearstack-studio/kitloop/pull/43) to [#46](https://github.com/gearstack-studio/kitloop/pull/46) | `PASS` | No visible UI change in the release; live rollback `DEFERRED` |
| 8. Persistence and rollback | [#40](https://github.com/gearstack-studio/kitloop/issues/40) | [#41](https://github.com/gearstack-studio/kitloop/pull/41) | `PASS` | Live rollback `DEFERRED (Reviewer Approved)`; issue still open |

Step 9 of the handout is the final documentation and PDF submission. It is tracked by Issue #49, not by an episode issue.

## Required check status

| Check | Evidence | Result | Notes |
|:--|:--|:--|:--|
| C-01: PR build and tests | [PR #37 CI run](https://github.com/gearstack-studio/kitloop/actions/runs/43618541536) and later PR runs | `PASS` | Job context `Build, test and Docker smoke` |
| C-02: failing CI blocks merge | [Disposable PR #50](evidence/merge-gate/README.md#c-02-disposable-failing-ci-test), [run 43819010572](https://github.com/gearstack-studio/kitloop/actions/runs/43819010572) | `PASS` | Required check failed and GitHub reported `BLOCKED`; the missing approval was a second blocker |
| C-03: clean clone, Docker and configuration | [C-03 execution record](c-03-evidence.md), [PR A hosted CI](evidence/README.md) | `PARTIAL` | Browser refresh check not recorded |
| C-04: public URL, sign-in, action, rejection | [Baseline UI screenshot](evidence/persistence/baseline-ui.png), [rejection probes](evidence/public-access/README.md) | `PASS` | Unauthenticated read and write attempts returned 401; live role-based denial not run |
| C-05: record survives restart and redeploy | [Persistence register](evidence/persistence/README.md) | `PASS` | Same record, database and fingerprint in all three phases |
| C-06: reviewed main release and matching revision | [Release PR #46](https://github.com/gearstack-studio/kitloop/pull/46), [run 43717180011 attempt 2](https://github.com/gearstack-studio/kitloop/actions/runs/43717180011/attempts/2) | `PARTIAL`, requires confirmation | Revision matches main SHA; no visible change, which may not be required ([confirmation needed](evidence-gaps.md#c-06-requirement-confirmation)) |

## Production release evidence

The authorized production release is [Main Cloud Run Deployment run 43717180011, attempt 2](https://github.com/gearstack-studio/kitloop/actions/runs/43717180011/attempts/2). Attempt 1 and the earlier [run 43687921737](https://github.com/gearstack-studio/kitloop/actions/runs/43687921737) passed CI but skipped the release job, so they are not deployment evidence.

| Item | Observed value | Source |
|:--|:--|:--|
| Release PR | [#46](https://github.com/gearstack-studio/kitloop/pull/46), approved by DEV4952 at `53d2532` | GitHub review record |
| Protected-main SHA | `be72f87e15a6ea0efdac75ac38e51ad2e5a03949` | Workflow run and deployment record |
| Environment approval | `lab5-production`, approved by DEV4952 | Run approvals API |
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

## Missing evidence

Each item below is missing or incomplete. None is fabricated or replaced by a substitute. The [evidence gap matrix](evidence-gaps.md) gives the safe next action for each.

1. Episode 1: the Free Trial, billing, budget and IAM screenshots are [issue attachments](https://github.com/gearstack-studio/kitloop/issues/24#issuecomment-6853959906) only. Copy them into the repository only after masking the email addresses visible in the IAM image.
2. Episode 5: GCP Console screenshots of the Cloud Run service, Cloud SQL instance and backups, Artifact Registry and Cloud Build. A [Cloud Shell first-release capture](evidence/deployment/first-release-publish-cloud-shell.png) exists.
3. C-02: a merge-box screenshot. The blocked state is [recorded through the API](evidence/merge-gate/README.md#c-02-disposable-failing-ci-test).
4. C-03: the browser borrow-request and refresh check.
5. C-04: optional live role-based denial. Unauthenticated rejection is [recorded](evidence/public-access/README.md).
6. C-06: a visible application change on the public URL, if the handout requires one. This [needs confirmation](evidence-gaps.md#c-06-requirement-confirmation) before any release.
7. Episode 7: a screenshot of the `lab5-production` approval panel. The [run summary](evidence/deployment/release-run-43717180011-summary.png) and [job log excerpt](evidence/deployment/release-run-43717180011-log-excerpt.txt) are now in the repository.
8. Episode 8: UI screenshots taken after the restart and the redeploy were never saved and cannot be recreated; see the [Episode 8 note](evidence-gaps.md#episode-8-ui-evidence). API observations PASS.
9. Architecture and CI/CD diagrams captured for the PDF report; the Mermaid sources are in the [traceability matrix](traceability.md#architecture-and-release-pipeline).

## Document map

| Document | Purpose |
|:--|:--|
| [traceability.md](traceability.md) | Requirement-to-evidence matrix and diagrams |
| [evidence-gaps.md](evidence-gaps.md) | Evidence gap matrix, approval-gated test plans and ruleset history |
| [evidence/deployment/README.md](evidence/deployment/README.md), [evidence/public-access/README.md](evidence/public-access/README.md) | Release, first-release and public rejection evidence with provenance |
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
