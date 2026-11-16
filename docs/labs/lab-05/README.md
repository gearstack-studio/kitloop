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
| 6B. IAM review and merge gates | [#35](https://github.com/gearstack-studio/kitloop/issues/35) | [#37](https://github.com/gearstack-studio/kitloop/pull/37) | `PARTIAL` | Blocked-merge demonstration missing; staging review rule not active now |
| 7. Automated main release | [#38](https://github.com/gearstack-studio/kitloop/issues/38) | [#39](https://github.com/gearstack-studio/kitloop/pull/39), [#43](https://github.com/gearstack-studio/kitloop/pull/43) to [#46](https://github.com/gearstack-studio/kitloop/pull/46) | `PASS` | No visible UI change in the release; live rollback `DEFERRED` |
| 8. Persistence and rollback | [#40](https://github.com/gearstack-studio/kitloop/issues/40) | [#41](https://github.com/gearstack-studio/kitloop/pull/41) | `PASS` | Live rollback `DEFERRED (Reviewer Approved)`; issue still open |

Step 9 of the handout is the final documentation and PDF submission. It is tracked by Issue #49, not by an episode issue.

## Required check status

| Check | Evidence | Result | Notes |
|:--|:--|:--|:--|
| C-01: PR build and tests | [PR #37 CI run](https://github.com/gearstack-studio/kitloop/actions/runs/43618541536) and later PR runs | `PASS` | Job context `Build, test and Docker smoke` |
| C-02: failing CI blocks merge | [Failing run on PR #42](https://github.com/gearstack-studio/kitloop/actions/runs/43683951193), [main protection](#branch-protection-observed-on-16-november-2026) | `PARTIAL` | Required check is configured on main; GitHub's blocked-merge state was not captured |
| C-03: clean clone, Docker and configuration | [C-03 execution record](c-03-evidence.md), [PR A hosted CI](evidence/README.md) | `PARTIAL` | Browser refresh check not recorded |
| C-04: public URL, sign-in, action, rejection | [Baseline UI screenshot](evidence/persistence/baseline-ui.png), [public readiness](evidence/persistence/public-readiness.json) | `PARTIAL` | Public sign-in and request creation shown; a public rejection case is not recorded |
| C-05: record survives restart and redeploy | [Persistence register](evidence/persistence/README.md) | `PASS` | Same record, database and fingerprint in all three phases |
| C-06: reviewed main release and matching revision | [Release PR #46](https://github.com/gearstack-studio/kitloop/pull/46), [run 43717180011 attempt 2](https://github.com/gearstack-studio/kitloop/actions/runs/43717180011/attempts/2) | `PARTIAL` | Revision matches main SHA; the release had no visible application change |

## Production release evidence

The authorized production release is [Main Cloud Run Deployment run 43717180011, attempt 2](https://github.com/gearstack-studio/kitloop/actions/runs/43717180011/attempts/2). Attempt 1 and the earlier [run 43687921737](https://github.com/gearstack-studio/kitloop/actions/runs/43687921737) passed CI but skipped the release job, so they are not deployment evidence.

| Item | Observed value | Source |
|:--|:--|:--|
| Release PR | [#46](https://github.com/gearstack-studio/kitloop/pull/46), approved by DEV4952 at `53d2532` | GitHub review record |
| Protected-main SHA | `be72f87e15a6ea0efdac75ac38e51ad2e5a03949` | Workflow run and deployment record |
| Environment approval | `lab5-production`, approved by DEV4952 | Run approvals API |
| CI job | [Build, test and Docker smoke](https://github.com/gearstack-studio/kitloop/actions/runs/43717180011/job/132842505247): success | Job steps |
| Release job | [Approved Cloud Run release](https://github.com/gearstack-studio/kitloop/actions/runs/43717180011/job/132843368366): success | Job steps |
| Cloud Build | `676619ea-a64f-4e49-89d5-cdb2a884a312`, SUCCESS | [Release record comment](https://github.com/gearstack-studio/kitloop/issues/38#issuecomment-6896493578) |
| App image digest | `sha256:f149e6dba8e94305b2ee817f4c371cd5764ebdf5b2224cd1f16b42677ebeb46b` | Release record and [after-redeploy.json](evidence/persistence/after-redeploy.json) |
| Migration image digest | `sha256:e35d98349622aba0d38ec04600c84f889eab779fa4b67b025437be6c85233114` | Release record comment |
| Migration execution | `kitloop-migrate-4d8sw`, one success, zero failures | Release record comment |
| Serving revision | `kitloop-be72f87e15a6-20261115143840`, Ready, 100% traffic | Release record and after-redeploy.json |
| Health | `/`, `/api/health`, `/api/ready` returned HTTP 200 | Release job verification step and release record |
| Automatic rollback step | Skipped because release and verification succeeded | Job steps |
| Deployment gate after release | `LAB5_DEPLOY_ENABLED=false`, read back after the run | Release record comment |

The build, migration and digest values come from the operator's release record on Issue #38. The job logs that contain them require repository access; the public job step list confirms each step's result.

## Persistence and rollback

| Phase | Revision | Result | Evidence |
|:--|:--|:--|:--|
| Baseline (UI request created) | `kitloop-284f41973f61-20261115080104` | `PASS` | [baseline.json](evidence/persistence/baseline.json), [baseline-ui.png](evidence/persistence/baseline-ui.png) |
| After controlled same-image restart | `kitloop-284f41973f61-20261115090539` | `PASS` | [after-restart.json](evidence/persistence/after-restart.json) |
| After main pipeline redeploy | `kitloop-be72f87e15a6-20261115143840` | `PASS` | [after-redeploy.json](evidence/persistence/after-redeploy.json) |
| Live traffic rollback and roll-forward | Not executed | `DEFERRED (Reviewer Approved)` | [Proposal](https://github.com/gearstack-studio/kitloop/issues/38#issuecomment-6896642784), [DEV4952 acceptance](https://github.com/gearstack-studio/kitloop/issues/38#issuecomment-6896877114) |

All three phases record request `899544f9-d5a8-4248-829e-db75a44cbbf1`, database `lab-5-cloud-deployment-514310:asia-southeast1:kitloop-pg` and fingerprint `8ed64726bbc9291bc61aca6f41825e7e95cb5261d0ca03f0d1816e61ff9c81ed`. Rollback coverage is limited to CI regression tests and the reviewed `release.sh rollback` procedure. Live rollback remains unverified.

## Branch protection observed on 16 November 2026

These values come from unauthenticated reads of the public GitHub API. Review requirements for classic branch protection are visible only to repository administrators.

| Control | Observed state | Status |
|:--|:--|:--|
| `main` | Protected; required check `Build, test and Docker smoke` (app 15368), enforced for everyone | `PASS` for the required check |
| `main` review rules | One fresh approval, code-owner review and admin enforcement are reported in the [restoration record](https://github.com/gearstack-studio/kitloop/issues/38#issuecomment-6895828916) | `NOT VERIFIED` independently |
| `sprint-1-staging` ruleset 27310627 | Active; deletion, non-fast-forward and required check rules; strict check policy off | `PARTIAL` |
| Staging PR review rule | Absent from the ruleset since its update at 2026-11-15T15:45:00Z, although the restoration record lists it | `NOT VERIFIED`; needs administrator review |
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

Each item below is absent from the repository and from public GitHub records. None is fabricated or replaced by a substitute.

1. Episode 1: the Free Trial, billing, budget and IAM screenshots are [issue attachments](https://github.com/gearstack-studio/kitloop/issues/24#issuecomment-6853959906) only. Copy them into the repository only after masking the email addresses visible in the IAM image.
2. Episode 5: first-release Cloud Build ID, Cloud Run and Cloud SQL console screenshots, and backup configuration screenshot.
3. C-02: a screenshot of a PR whose merge is blocked by a failing required check or a missing approval.
4. C-03: the browser borrow-request and refresh check.
5. C-04: a public-URL rejection case, such as a Borrower denied a Custodian action.
6. C-06: a visible application change on the public URL in the main release.
7. Episode 7: screenshots of the environment approval and release job summary; raw job logs are visible only with repository access.
8. Episode 8: UI screenshots of the same record after restart and after redeploy (API observations exist).
9. Architecture and CI/CD diagrams captured for the PDF report; the Mermaid sources are in the [traceability matrix](traceability.md#architecture-and-release-pipeline).

## Document map

| Document | Purpose |
|:--|:--|
| [traceability.md](traceability.md) | Requirement-to-evidence matrix and diagrams |
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
