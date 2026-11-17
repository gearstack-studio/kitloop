# Lab 5 GitHub collaboration log

Record date: 16 November 2026, last updated at 16:20 UTC after PR #51 merged, Issues #40 and #49 closed and the project board was corrected. Repository: [gearstack-studio/kitloop](https://github.com/gearstack-studio/kitloop). Tracked in [Issue #49](https://github.com/gearstack-studio/kitloop/issues/49).

## Overview

Two developers, **yiiipunn** and **DEV4952**, delivered Lab 5 between 10 and 16 November 2026 through 10 GitHub Issues and 17 merged Pull Requests. Every merged PR was reviewed by the other developer. Responsibilities alternated by episode, and Episode 5 was split so that both developers contributed to the first deployment.

| Measure | Count |
|:--|:--|
| Lab 5 Issues | 10, all closed |
| Related Pull Requests | 17 merged, plus 1 disposable test PR closed unmerged (#50) |
| Formal GitHub reviews | 19: 18 `APPROVED`, 1 `CHANGES_REQUESTED`, 0 `COMMENTED`, 0 `DISMISSED` |
| Inline review comments | 0 |
| Review cycles with requested changes | 2 (PR #39 by comment, PR #42 by formal review) |
| Production environment approvals | 1 (DEV4952, run 43717180011 attempt 2) |

### Method and limits

- Issues and PRs were discovered from the repository's full issue and PR list, the `lab5` label, the "Lab 5: Cloud Deployment & CI/CD" milestone, PR body references and timeline cross-references. Issues #1 to #23 belong to Sprint 1 and are excluded.
- Events come from GitHub's public REST API (issues, PR timelines, reviews, workflow runs, deployment approvals) and from local `git` history. Times are UTC.
- People are identified by GitHub login only.
- A merged PR is never treated as approved without a recorded `APPROVED` review. Approvals given in comments are labelled as comments.
- Screenshots marked **TODO** do not exist yet. None were created for this log.
- Each closure is verified by two GitHub records: the issue's `closed_by` and the timeline `closed` event. Their actors match for all ten closed issues, and their timestamps differ by at most 2 seconds; the tables use the issue's `closed_at` minute. All closures were manual, with no closing commit or PR keyword, and no issue was reopened.

## Contents

- [Master traceability matrix](#master-traceability-matrix)
- [Episode 1: GCP account and cost control](#episode-1-gcp-account-and-cost-control)
- [Episode 2: Cloud readiness](#episode-2-cloud-readiness)
- [Episode 3: Docker containerization](#episode-3-docker-containerization)
- [Episode 4: CI on pull requests](#episode-4-ci-on-pull-requests)
- [Episode 5: First GCP deployment](#episode-5-first-gcp-deployment)
- [Episode 6: WIF, IAM and merge gates](#episode-6-wif-iam-and-merge-gates)
- [Episode 7: Automated deployment](#episode-7-automated-deployment)
- [Episode 8: Persistence and rollback](#episode-8-persistence-and-rollback)
- [Final documentation](#final-documentation)
- [Project board](#project-board)
- [Collaboration patterns](#collaboration-patterns)
- [Issue checklist change log](#issue-checklist-change-log)

## Master traceability matrix

PR types: **impl** implementation, **docs** documentation or evidence, **sec** security review, **rel** release to `main`, **sync** branch synchronization, **fix** defect fix.

| Episode | Issue | Developer | Related PR(s) | Reviewer(s) | Review outcome | Issue status |
|:--|:--|:--|:--|:--|:--|:--|
| 1 | [#24](https://github.com/gearstack-studio/kitloop/issues/24) | yiiipunn | None | DEV4952 (comment) | Verified in comment | CLOSED |
| 2 | [#25](https://github.com/gearstack-studio/kitloop/issues/25) | yiiipunn | [#26](https://github.com/gearstack-studio/kitloop/pull/26) impl | DEV4952 | `APPROVED` | CLOSED |
| 3 | [#27](https://github.com/gearstack-studio/kitloop/issues/27) | DEV4952 | [#28](https://github.com/gearstack-studio/kitloop/pull/28) impl | yiiipunn | `APPROVED` | CLOSED |
| 4 | [#29](https://github.com/gearstack-studio/kitloop/issues/29) | DEV4952 | [#30](https://github.com/gearstack-studio/kitloop/pull/30) impl | yiiipunn | `APPROVED` | CLOSED |
| 5 | [#31](https://github.com/gearstack-studio/kitloop/issues/31) | DEV4952, yiiipunn | [#32](https://github.com/gearstack-studio/kitloop/pull/32) impl, [#33](https://github.com/gearstack-studio/kitloop/pull/33) impl, [#42](https://github.com/gearstack-studio/kitloop/pull/42) rel, [#43](https://github.com/gearstack-studio/kitloop/pull/43) fix | yiiipunn, DEV4952 | `APPROVED`; #42 `CHANGES_REQUESTED` then `APPROVED` | CLOSED |
| 6A | [#34](https://github.com/gearstack-studio/kitloop/issues/34) | DEV4952 | [#36](https://github.com/gearstack-studio/kitloop/pull/36) impl | yiiipunn | `APPROVED` | CLOSED |
| 6B | [#35](https://github.com/gearstack-studio/kitloop/issues/35) | yiiipunn | [#37](https://github.com/gearstack-studio/kitloop/pull/37) sec | DEV4952 | `APPROVED` | CLOSED |
| 7 | [#38](https://github.com/gearstack-studio/kitloop/issues/38) | yiiipunn | [#39](https://github.com/gearstack-studio/kitloop/pull/39) impl, [#44](https://github.com/gearstack-studio/kitloop/pull/44) sec, [#45](https://github.com/gearstack-studio/kitloop/pull/45) sec, [#46](https://github.com/gearstack-studio/kitloop/pull/46) rel, [#47](https://github.com/gearstack-studio/kitloop/pull/47) sync, [#48](https://github.com/gearstack-studio/kitloop/pull/48) sync | DEV4952 | `APPROVED`; #39 changes requested by comment | CLOSED |
| 8 | [#40](https://github.com/gearstack-studio/kitloop/issues/40) | DEV4952 | [#41](https://github.com/gearstack-studio/kitloop/pull/41) docs | yiiipunn | `APPROVED` | CLOSED |
| Final | [#49](https://github.com/gearstack-studio/kitloop/issues/49) | yiiipunn | [#50](https://github.com/gearstack-studio/kitloop/pull/50) test, closed unmerged; [#51](https://github.com/gearstack-studio/kitloop/pull/51) docs | DEV4952 | `APPROVED` (non-specific) | CLOSED |

PRs #44 to #48 also reference Issue #40 in their descriptions. Issue #24 is the only closed Lab 5 Issue with no related PR, because its work was account and billing setup.

## Episode 1: GCP account and cost control

### Issue #24: [Lab 5] Episode 1 - GCP Account & Cost Control

**Issue:** [#24](https://github.com/gearstack-studio/kitloop/issues/24)\
**Episode:** 1\
**Developer:** yiiipunn\
**Reviewer:** DEV4952 (issue comment, not a PR review)\
**Status:** CLOSED

#### Scope & Implementation

- Activate the GCP Free Trial, create project `lab-5-cloud-deployment-514310`, enable billing, configure a budget alert and grant the teammate access.
- Delivered as cloud console and Cloud Shell work, documented in an issue comment with four screenshots.
- The budget is "฿0 Monthly Budget Alert" with alerts at 50%, 90%, 100% and 150%. Budget alerts notify; they do not stop charges.

#### Related Pull Requests

None. This episode changed no repository files.

#### Review & Approval Timeline

| Date (UTC) | Actor | Event | Outcome | Evidence |
|:--|:--|:--|:--|:--|
| 2026-11-10 09:50 | yiiipunn | Issue created | OPEN | [#24](https://github.com/gearstack-studio/kitloop/issues/24) |
| 2026-11-13 13:12 | yiiipunn | Free Trial, billing and budget evidence posted | Evidence 1 to 4 | [Comment](https://github.com/gearstack-studio/kitloop/issues/24#issuecomment-6853959906) |
| 2026-11-13 13:59 | DEV4952 | Confirmed own project access and reviewed screenshots | Accepted | [Comment](https://github.com/gearstack-studio/kitloop/issues/24#issuecomment-6855081953) |
| 2026-11-13 13:59 | DEV4952 | Issue closed manually | CLOSED | Issue `closed_by` and timeline event |

#### Reviewer Feedback & Developer Response

DEV4952 verified access with their own account and raised no concerns. No changes were requested.

#### Final Verification

- Screenshots show the Free Trial credit and 87 days remaining, `billingEnabled: true`, the monthly budget alert, and an IAM listing with the teammate as `roles/editor`.
- The evidence comment's own closing line still says final checks were pending, while its summary table marks them completed. The later screenshots and DEV4952's confirmation resolve that.

#### Evidence

- [Evidence comment with four screenshots](https://github.com/gearstack-studio/kitloop/issues/24#issuecomment-6853959906)
- [DEV4952 access confirmation with screenshot](https://github.com/gearstack-studio/kitloop/issues/24#issuecomment-6855081953)
- **TODO:** the screenshots exist only as issue attachments. If they are copied into `docs/labs/lab-05/evidence/`, first mask the email addresses visible in the IAM listing.

## Episode 2: Cloud readiness

### Issue #25: [Lab 5] Episode 2 - Cloud Readiness

**Issue:** [#25](https://github.com/gearstack-studio/kitloop/issues/25)\
**Episode:** 2\
**Developer:** yiiipunn\
**Reviewer:** DEV4952\
**Status:** CLOSED

#### Scope & Implementation

- Make the API cloud-ready: PostgreSQL-backed `/api/ready` returning 503 on database failure, `0.0.0.0` binding on `PORT`, production build and start path, and a production guard on the demo seed.
- Audit environment variables, complete `.env.example` files and create [deployment.md](deployment.md).
- Delivered in commit `2c57170`, merged as `17316f8`.

#### Related Pull Requests

| PR | Purpose | Author | Base Branch | Merge Status |
|:--|:--|:--|:--|:--|
| [#26](https://github.com/gearstack-studio/kitloop/pull/26) | Cloud readiness refactor | yiiipunn | `sprint-1-staging` | MERGED `17316f8` |

#### Review & Approval Timeline

| Date (UTC) | Actor | Event | Outcome | Evidence |
|:--|:--|:--|:--|:--|
| 2026-11-12 09:25 | yiiipunn | Issue created | OPEN | [#25](https://github.com/gearstack-studio/kitloop/issues/25) |
| 2026-11-12 10:51 | yiiipunn | PR #26 opened, review requested from DEV4952 | Pending | [PR #26](https://github.com/gearstack-studio/kitloop/pull/26) |
| 2026-11-12 11:27 | DEV4952 | Review submitted | `APPROVED` | [Review](https://github.com/gearstack-studio/kitloop/pull/26#pullrequestreview-5873577028) |
| 2026-11-12 11:27 | DEV4952 | PR merged | MERGED | `17316f8` |
| 2026-11-13 14:14 | yiiipunn | Issue closed manually | CLOSED | Issue `closed_by` and timeline event |

#### Reviewer Feedback & Developer Response

The approval body is "Approve". No discussion or requested changes are recorded.

#### Final Verification

- The PR predates the CI workflow, so no hosted check ran on it. The Episode 2 record in [deployment.md](deployment.md#episode-2-historical-readiness-record) reports backend 58/58, frontend 21/21 and both builds passing locally.
- The readiness 200 and 503 tests run in every later CI backend job.

#### Evidence

- [PR #26 review](https://github.com/gearstack-studio/kitloop/pull/26#pullrequestreview-5873577028)
- [Episode 2 readiness audit](deployment.md#six-point-readiness-audit)

## Episode 3: Docker containerization

### Issue #27: [Lab 5] Episode 3 Docker Containerization for KitLoop

**Issue:** [#27](https://github.com/gearstack-studio/kitloop/issues/27)\
**Episode:** 3\
**Developer:** DEV4952\
**Reviewer:** yiiipunn\
**Status:** CLOSED

#### Scope & Implementation

- Add the Dockerfile, `.dockerignore` and `docker-compose.yml`, run the app with PostgreSQL locally, and record clean-clone C-03 evidence.
- Commits `aef044a` (containerization) and `d262aa3` (clean-clone verification record).

#### Related Pull Requests

| PR | Purpose | Author | Base Branch | Merge Status |
|:--|:--|:--|:--|:--|
| [#28](https://github.com/gearstack-studio/kitloop/pull/28) | Docker containerization | DEV4952 | `sprint-1-staging` | MERGED `e10c8c7` |

#### Review & Approval Timeline

| Date (UTC) | Actor | Event | Outcome | Evidence |
|:--|:--|:--|:--|:--|
| 2026-11-12 13:51 | DEV4952 | Issue created | OPEN | [#27](https://github.com/gearstack-studio/kitloop/issues/27) |
| 2026-11-12 14:33 | DEV4952 | PR #28 opened, review requested from yiiipunn | Pending | [PR #28](https://github.com/gearstack-studio/kitloop/pull/28) |
| 2026-11-12 16:45 | yiiipunn | Review after local Docker testing | `APPROVED` | [Review](https://github.com/gearstack-studio/kitloop/pull/28#pullrequestreview-5878394746) |
| 2026-11-12 16:45 | yiiipunn | PR merged | MERGED | `e10c8c7` |
| 2026-11-13 14:14 | yiiipunn | Issue closed manually | CLOSED | Issue `closed_by` and timeline event |

#### Reviewer Feedback & Developer Response

yiiipunn tested the containers locally and reported that the build, health checks, tests and restart persistence worked. No changes were requested.

#### Final Verification

- The [C-03 record](c-03-evidence.md) passed clean-clone container checks at `aef044a`.
- The handout defines C-03 as a fresh clone that builds and runs with `.env.example` values, which this record shows, so C-03 is `PASS`. A team-added browser refresh check was not recorded.

#### Evidence

- [C-03 execution record](c-03-evidence.md)
- **TODO:** screenshot of the browser borrow-request and refresh check, if it is performed.

## Episode 4: CI on pull requests

### Issue #29: [Lab 5] Episode 4 CI on Pull Requests for KitLoop

**Issue:** [#29](https://github.com/gearstack-studio/kitloop/issues/29)\
**Episode:** 4\
**Developer:** DEV4952\
**Reviewer:** yiiipunn\
**Status:** CLOSED

#### Scope & Implementation

- Add a GitHub Actions workflow for PRs into `sprint-1-staging` and `main`: lockfile installs, backend and frontend checks, isolated PostgreSQL tests, Docker image builds, and synthetic CI credentials.
- Delivered in commit `a529943`. The job context `Build, test and Docker smoke` later became the required check on both branches.

#### Related Pull Requests

| PR | Purpose | Author | Base Branch | Merge Status |
|:--|:--|:--|:--|:--|
| [#30](https://github.com/gearstack-studio/kitloop/pull/30) | PR CI workflow | DEV4952 | `sprint-1-staging` | MERGED `bc582d8` |

#### Review & Approval Timeline

| Date (UTC) | Actor | Event | Outcome | Evidence |
|:--|:--|:--|:--|:--|
| 2026-11-12 16:48 | DEV4952 | Issue created | OPEN | [#29](https://github.com/gearstack-studio/kitloop/issues/29) |
| 2026-11-12 16:55 | DEV4952 | PR #30 opened, review requested from yiiipunn | Pending | [PR #30](https://github.com/gearstack-studio/kitloop/pull/30) |
| 2026-11-12 16:55 | GitHub Actions | CI on `a529943` | success | [Run 43263932716](https://github.com/gearstack-studio/kitloop/actions/runs/43263932716) |
| 2026-11-13 13:32 | yiiipunn | Review of the workflow and hosted run | `APPROVED` | [Review](https://github.com/gearstack-studio/kitloop/pull/30#pullrequestreview-5891856574) |
| 2026-11-13 13:32 | yiiipunn | PR merged | MERGED | `bc582d8` |
| 2026-11-13 14:14 | yiiipunn | Issue closed manually | CLOSED | Issue `closed_by` and timeline event |

#### Reviewer Feedback & Developer Response

yiiipunn suggested a non-blocking follow-up: also trigger CI on PR edits, so that a retargeted PR runs immediately. No later change implementing this suggestion is recorded in this PR.

#### Final Verification

The hosted run passed build, tests, migrations, HTTP smoke checks and cleanup. The issue body has no task checklist.

#### Evidence

- [CI run 43263932716](https://github.com/gearstack-studio/kitloop/actions/runs/43263932716)
- **TODO:** screenshot of the PR #30 checks tab showing `Build, test and Docker smoke` passing.

## Episode 5: First GCP deployment

### Issue #31: [Lab 5] Episode 5 First GCP Deployment for KitLoop

**Issue:** [#31](https://github.com/gearstack-studio/kitloop/issues/31)\
**Episode:** 5\
**Developer:** DEV4952 (production runtime), yiiipunn (GCP infrastructure and release)\
**Reviewer:** yiiipunn for PR #32; DEV4952 for PRs #33, #42 and #43\
**Status:** CLOSED

#### Scope & Implementation

- yiiipunn [split the episode](https://github.com/gearstack-studio/kitloop/issues/31#issuecomment-6856142873): DEV4952 built the Cloud Run production image, migration job and bootstrap (PR A); yiiipunn prepared Artifact Registry, Cloud SQL, Secret Manager and release scripts (PR B).
- Key decision: one Cloud Run service serves the SPA and API on the same origin, with private-IP Cloud SQL and immutable image digests.
- The first release reached `main` through PR #42 as `284f419`. It was deployed as revision `kitloop-284f41973f61-20261115080104`.

#### Related Pull Requests

| PR | Purpose | Author | Base Branch | Merge Status |
|:--|:--|:--|:--|:--|
| [#32](https://github.com/gearstack-studio/kitloop/pull/32) | Production runtime (PR A) | DEV4952 | `sprint-1-staging` | MERGED `978dec8` |
| [#33](https://github.com/gearstack-studio/kitloop/pull/33) | GCP infrastructure (PR B) | yiiipunn | `sprint-1-staging` | MERGED `ed80306` |
| [#42](https://github.com/gearstack-studio/kitloop/pull/42) | First release to `main` | yiiipunn | `main` | MERGED `284f419` |
| [#43](https://github.com/gearstack-studio/kitloop/pull/43) | Concurrent checkout fix for #42's failing CI | yiiipunn | `sprint-1-staging` | MERGED `c76e077` |

#### Review & Approval Timeline

| Date (UTC) | Actor | Event | Outcome | Evidence |
|:--|:--|:--|:--|:--|
| 2026-11-13 14:36 | yiiipunn | Issue created | OPEN | [#31](https://github.com/gearstack-studio/kitloop/issues/31) |
| 2026-11-13 15:46 | DEV4952 | PR #32 opened, review requested from yiiipunn | Pending | [PR #32](https://github.com/gearstack-studio/kitloop/pull/32) |
| 2026-11-13 15:46 | GitHub Actions | CI on `f489ac2` | success | [Run 43456008323](https://github.com/gearstack-studio/kitloop/actions/runs/43456008323) |
| 2026-11-13 16:02 | yiiipunn | Review of PR #32 | `APPROVED` | [Review](https://github.com/gearstack-studio/kitloop/pull/32#pullrequestreview-5894228297) |
| 2026-11-13 16:03 | yiiipunn | PR #32 merged | MERGED | `978dec8` |
| 2026-11-13 18:03 | yiiipunn | Merged PR #32 into PR B and fixed release lifecycle | Revised | `e338789`, `3e822dc` |
| 2026-11-13 18:17 | yiiipunn | PR #33 opened, review requested from DEV4952 | Pending | [PR #33](https://github.com/gearstack-studio/kitloop/pull/33) |
| 2026-11-13 18:27 | DEV4952 | Two reviews of PR #33 | `APPROVED` twice | [Review 1](https://github.com/gearstack-studio/kitloop/pull/33#pullrequestreview-5896073874), [Review 2](https://github.com/gearstack-studio/kitloop/pull/33#pullrequestreview-5896084022) |
| 2026-11-13 18:27 | DEV4952 | PR #33 merged | MERGED | `ed80306` |
| 2026-11-14 15:31 | DEV4952 | Issue closed manually | CLOSED | Issue `closed_by` and timeline event |
| 2026-11-15 06:06 | GitHub Actions | PR #42 CI on `ca597ff` | **failure** | [Run 43683951193](https://github.com/gearstack-studio/kitloop/actions/runs/43683951193) |
| 2026-11-15 06:15 | DEV4952 | Review of PR #42 | `CHANGES_REQUESTED` | [Review](https://github.com/gearstack-studio/kitloop/pull/42#pullrequestreview-5909399254) |
| 2026-11-15 06:42 | yiiipunn | PR #43 opened with fix `b8e0c29`; CI success | Pending | [Run 43686710907](https://github.com/gearstack-studio/kitloop/actions/runs/43686710907) |
| 2026-11-15 06:49 | DEV4952 | Review of PR #43 ("LGTM"), then merge | `APPROVED`, MERGED | [Review](https://github.com/gearstack-studio/kitloop/pull/43#pullrequestreview-5909496249) |
| 2026-11-15 06:49 | GitHub Actions | PR #42 CI on `c76e077` | success | [Run 43687195763](https://github.com/gearstack-studio/kitloop/actions/runs/43687195763) |
| 2026-11-15 06:59 | DEV4952 | Re-review of PR #42 at `c76e077` | `APPROVED` | [Review](https://github.com/gearstack-studio/kitloop/pull/42#pullrequestreview-5909535487) |
| 2026-11-15 06:59 | DEV4952 | PR #42 merged into `main` | MERGED | `284f419` |
| 2026-11-15 07:02 | GitHub Actions | Main run on `284f419` | CI success, release job skipped | [Run 43687921737](https://github.com/gearstack-studio/kitloop/actions/runs/43687921737) |
| 2026-11-15 08:19 | yiiipunn | First deployment from `main` announced | Public URL live | [Comment on PR #41](https://github.com/gearstack-studio/kitloop/pull/41#issuecomment-6891599464) |

#### Reviewer Feedback & Developer Response

- **PR #32:** yiiipunn approved and noted integration mismatches in their own release scripts. yiiipunn then merged PR #32 into PR B and pushed `3e822dc` before requesting review.
- **PR #42:** DEV4952 requested changes because the concurrent-checkout test returned `[201, 500]` instead of `[201, 409]`. The cause was an unmapped PostgreSQL serialization failure (Prisma `P2010`, SQLSTATE `40001`). PR #43 mapped it to HTTP 409 and added unit tests, without changing the integration test's expectations. yiiipunn [asked for a recheck](https://github.com/gearstack-studio/kitloop/pull/42#issuecomment-6890744561), and DEV4952 re-reviewed and approved at `c76e077`.
- **PR #33:** the first approval body is "Ok kub". The second, 51 seconds later, contains the substantive review of the scripts and their integration with PR #32.

#### Final Verification

- PR #32 hosted CI: backend 70/70, frontend 21/21, and production image checks passed ([evidence](evidence/README.md)).
- The public URL returned 200 for `/`, `/api/health` and `/api/ready` ([public-readiness.json](evidence/persistence/public-readiness.json)).
- The issue was closed on 14 November, before the first live deployment on 15 November. Live acceptance evidence was recorded later under #40.

#### Evidence

- [PR A hosted CI screenshots](evidence/README.md)
- [Baseline revision and digest](evidence/persistence/baseline.json)
- [First release in Cloud Shell](evidence/deployment/first-release-publish-cloud-shell.png), copied from the PR #41 comment attachment
- [GCP Console captures](evidence/console/README.md#verified-captures): revisions, backups, registry, build, migration job and secret names (16 November)
- **TODO:** Cloud Run networking and Cloud SQL overview captures; see the [checklist](evidence/console/README.md#still-needed).
- **TODO:** screenshot of PR #42's `CHANGES_REQUESTED` review followed by the approval.

## Episode 6: WIF, IAM and merge gates

### Issue #34: [Lab 5] Episode 6/1 Configure GitHub OIDC and Workload Identity Federation

**Issue:** [#34](https://github.com/gearstack-studio/kitloop/issues/34)\
**Episode:** 6, Part A\
**Developer:** DEV4952\
**Reviewer:** yiiipunn\
**Status:** CLOSED

#### Scope & Implementation

- Add GitHub OIDC authentication to GCP through Workload Identity Federation, with no service-account keys, and a read-only verification workflow.
- Commits `884ed57` (WIF setup), `bd7fd15` (permission diagnostics) and `d6dd68a` (hosted denial probes).

#### Related Pull Requests

| PR | Purpose | Author | Base Branch | Merge Status |
|:--|:--|:--|:--|:--|
| [#36](https://github.com/gearstack-studio/kitloop/pull/36) | GitHub OIDC and WIF | DEV4952 | `sprint-1-staging` | MERGED `c75cdf1` |

#### Review & Approval Timeline

| Date (UTC) | Actor | Event | Outcome | Evidence |
|:--|:--|:--|:--|:--|
| 2026-11-14 13:42 | DEV4952 | Issue created | OPEN | [#34](https://github.com/gearstack-studio/kitloop/issues/34) |
| 2026-11-14 14:05 | DEV4952 | PR #36 opened, review requested from yiiipunn | Pending | [PR #36](https://github.com/gearstack-studio/kitloop/pull/36) |
| 2026-11-14 15:25 | GitHub Actions | CI and hosted negative probes on `d6dd68a` | success | [CI](https://github.com/gearstack-studio/kitloop/actions/runs/43610143485), [probes](https://github.com/gearstack-studio/kitloop/actions/runs/43610138984) |
| 2026-11-14 15:35 | yiiipunn | Review | `APPROVED` | [Review](https://github.com/gearstack-studio/kitloop/pull/36#pullrequestreview-5905451320) |
| 2026-11-14 15:35 | yiiipunn | PR merged | MERGED | `c75cdf1` |
| 2026-11-14 15:39 | DEV4952 | Post-merge WIF authentication reported | Attempt 3 passed | [Comment](https://github.com/gearstack-studio/kitloop/pull/36#issuecomment-6879914313) |
| 2026-11-14 15:42 | yiiipunn | Issue closed manually | CLOSED | Issue `closed_by` and timeline event |

#### Reviewer Feedback & Developer Response

yiiipunn asked for evidence of the first successful post-merge authentication. DEV4952 supplied [run 43611041165 attempt 3](https://github.com/gearstack-studio/kitloop/actions/runs/43611041165/attempts/3) four minutes later. Attempts 1 and 2 had failed at the project lookup until the operator granted the lookup role. That history is preserved in the comment.

#### Final Verification

Hosted authentication and project lookup passed. The feature-ref, wrong-audience and missing-permission probes were denied as expected.

#### Evidence

- [WIF success screenshot](evidence/iam/08-wif-authentication-success.png) and [IAM evidence index](evidence/iam/README.md)
- [PR A record](wif-pr-a.md)

### Issue #35: [Lab 5] Episode 6/2 Review IAM Permissions and Enforce Pull Request Merge Gates

**Issue:** [#35](https://github.com/gearstack-studio/kitloop/issues/35)\
**Episode:** 6, Part B\
**Developer:** yiiipunn (assignee; issue opened by DEV4952)\
**Reviewer:** DEV4952\
**Status:** CLOSED

#### Scope & Implementation

- Review the verifier's IAM roles and scopes, and prepare required-check and review gates for `sprint-1-staging`.
- Commits `d5b9ae1` (IAM audit and ruleset proposal) and `024698c` (sanitized IAM screenshots).
- The ruleset was applied later, during Episode 7, as ruleset 27310627.

#### Related Pull Requests

| PR | Purpose | Author | Base Branch | Merge Status |
|:--|:--|:--|:--|:--|
| [#37](https://github.com/gearstack-studio/kitloop/pull/37) | IAM review and merge-gate proposal | yiiipunn | `sprint-1-staging` | MERGED `7ea2c84` |

#### Review & Approval Timeline

| Date (UTC) | Actor | Event | Outcome | Evidence |
|:--|:--|:--|:--|:--|
| 2026-11-14 13:42 | DEV4952 | Issue created | OPEN | [#35](https://github.com/gearstack-studio/kitloop/issues/35) |
| 2026-11-14 16:58 | yiiipunn | PR #37 opened, review requested from DEV4952; CI success | Pending | [Run 43618541536](https://github.com/gearstack-studio/kitloop/actions/runs/43618541536) |
| 2026-11-14 17:05 | DEV4952 | Review | `APPROVED` | [Review](https://github.com/gearstack-studio/kitloop/pull/37#pullrequestreview-5905990097) |
| 2026-11-14 17:05 | DEV4952 | PR merged | MERGED | `7ea2c84` |
| 2026-11-15 02:46 | yiiipunn | Issue closed manually | CLOSED | Issue `closed_by` and timeline event |

#### Reviewer Feedback & Developer Response

DEV4952 approved only the audit and preparation scope. The review states that inherited IAM verification, ruleset activation, recovery access and enforcement testing remained open under #35. The issue was closed nine hours later, without those items being recorded as complete.

#### Final Verification

- Direct IAM bindings, the custom role, the absence of keys and the provider trust condition are verified by screenshots. The inherited-access analysis is `PARTIAL`.
- Ruleset 27310627 is active. Its [version history](evidence-gaps.md#staging-ruleset-history) shows the PR review rule removed at 13:26:03Z, restored at 13:57:25Z and removed again at 15:45:00Z on 15 November. It was [restored](evidence/merge-gate/README.md#staging-ruleset-restoration) on 16 November at 06:42:21Z as version 57946025.
- No blocked-merge demonstration is recorded.

#### Evidence

- [IAM screenshots A to H](evidence/iam/README.md)
- **TODO:** screenshot of the ruleset settings page, and of a PR blocked by a failing check or a missing approval.

## Episode 7: Automated deployment

### Issue #38: [Lab 5] Episode 7 Automated Deployment with GitHub Actions

**Issue:** [#38](https://github.com/gearstack-studio/kitloop/issues/38)\
**Episode:** 7\
**Developer:** yiiipunn\
**Reviewer:** DEV4952\
**Status:** CLOSED

#### Scope & Implementation

- Deploy only from protected `main` through GitHub Actions: WIF with a dedicated `kitloop-wif-deploy` identity, the `lab5-production` environment approval, immutable digests, a migration job, candidate health checks before traffic, and automatic traffic rollback on failure.
- Key decisions: a separate deployment identity instead of extending the verifier; a standalone-project Cloud Build identity after an Organization Policy blocker (PR #45); two repository administrators before activation.
- Delivered in PR #39 and released through PR #46 as `be72f87`.

#### Related Pull Requests

| PR | Purpose | Author | Base Branch | Merge Status |
|:--|:--|:--|:--|:--|
| [#39](https://github.com/gearstack-studio/kitloop/pull/39) | Deployment workflow (impl) | yiiipunn | `sprint-1-staging` | MERGED `ca597ff` |
| [#44](https://github.com/gearstack-studio/kitloop/pull/44) | Security evidence and blockers (sec) | yiiipunn | `sprint-1-staging` | MERGED `420a803` |
| [#45](https://github.com/gearstack-studio/kitloop/pull/45) | Standalone Cloud Build IAM (sec) | yiiipunn | `sprint-1-staging` | MERGED `53d2532` |
| [#46](https://github.com/gearstack-studio/kitloop/pull/46) | Release to `main` (rel) | yiiipunn | `main` | MERGED `be72f87` |
| [#47](https://github.com/gearstack-studio/kitloop/pull/47) | Sync `main` into staging (sync) | yiiipunn | `sprint-1-staging` | MERGED `c56d8ce` |
| [#48](https://github.com/gearstack-studio/kitloop/pull/48) | Sync through staging gates (sync) | yiiipunn | `sprint-1-staging` | MERGED `35e8742` |

#### Review & Approval Timeline

| Date (UTC) | Actor | Event | Outcome | Evidence |
|:--|:--|:--|:--|:--|
| 2026-11-14 17:11 | yiiipunn | Issue created | OPEN | [#38](https://github.com/gearstack-studio/kitloop/issues/38) |
| 2026-11-15 02:43 | yiiipunn | PR #39 opened at `0753ec8`, review requested | Pending | [PR #39](https://github.com/gearstack-studio/kitloop/pull/39) |
| 2026-11-15 03:34 | DEV4952 | ID-token change requested (comment) | Changes requested | [Comment](https://github.com/gearstack-studio/kitloop/pull/39#issuecomment-6888617846) |
| 2026-11-15 04:32 | yiiipunn | Fix `680f1da` pushed; CI success | Revised | [Run 43677256826](https://github.com/gearstack-studio/kitloop/actions/runs/43677256826) |
| 2026-11-15 04:50 | DEV4952 | Re-review of `680f1da`, then merge | `APPROVED`, MERGED | [Review](https://github.com/gearstack-studio/kitloop/pull/39#pullrequestreview-5909150954) |
| 2026-11-15 09:34 | DEV4952 | Asked for exact security changes before approval | Request | [Comment](https://github.com/gearstack-studio/kitloop/issues/38#issuecomment-6892407638) |
| 2026-11-15 11:01 | DEV4952 | PR #44 review, then merge | `APPROVED`, MERGED | [Review](https://github.com/gearstack-studio/kitloop/pull/44#pullrequestreview-5910352309) |
| 2026-11-15 11:15 | yiiipunn | Configuration batch stopped by Organization Policy denial | Blocked | [Comment](https://github.com/gearstack-studio/kitloop/issues/38#issuecomment-6893492501) |
| 2026-11-15 12:18 | DEV4952 | PR #45 review with risk acceptance, then merge | `APPROVED`, MERGED | [Review](https://github.com/gearstack-studio/kitloop/pull/45#pullrequestreview-5910653062) |
| 2026-11-15 12:54 | DEV4952 | PR #46 release review | `APPROVED` | [Review](https://github.com/gearstack-studio/kitloop/pull/46#pullrequestreview-5910823181) |
| 2026-11-15 13:05 | yiiipunn | PR #46 merged into `main` | MERGED | `be72f87` |
| 2026-11-15 13:14 | DEV4952 | PR #47 review, merged 13:26 | `APPROVED`, MERGED | [Review](https://github.com/gearstack-studio/kitloop/pull/47#pullrequestreview-5910900309) |
| 2026-11-15 13:30 | DEV4952 | PR #48 review, merged 13:35 | `APPROVED`, MERGED | [Review](https://github.com/gearstack-studio/kitloop/pull/48#pullrequestreview-5910955032) |
| 2026-11-15 14:09 | DEV4952 | Agreed to receive repository Admin access | Consent | [Comment](https://github.com/gearstack-studio/kitloop/issues/38#issuecomment-6895690432) |
| 2026-11-15 14:15 | yiiipunn | Security restoration complete, two administrators | Verified | [Comment](https://github.com/gearstack-studio/kitloop/issues/38#issuecomment-6895828916) |
| 2026-11-15 14:33 | DEV4952 | `lab5-production` deployment approved | Approved | Run approvals record |
| 2026-11-15 14:39 | GitHub Actions | Release job | success | [Run 43717180011 attempt 2](https://github.com/gearstack-studio/kitloop/actions/runs/43717180011/attempts/2) |
| 2026-11-15 14:59 | yiiipunn | Release evidence recorded | Verified | [Comment](https://github.com/gearstack-studio/kitloop/issues/38#issuecomment-6896493578) |
| 2026-11-15 15:11 | yiiipunn | Live rollback deferral proposed | Proposed | [Comment](https://github.com/gearstack-studio/kitloop/issues/38#issuecomment-6896642784) |
| 2026-11-15 15:29 | DEV4952 | Live rollback deferral accepted | `DEFERRED` approved | [Comment](https://github.com/gearstack-studio/kitloop/issues/38#issuecomment-6896877114) |
| 2026-11-15 15:31 | yiiipunn | Issue closed manually | CLOSED | Issue `closed_by` and timeline event |

The 14:33 approval time is the start of the release job; the approval record itself carries no timestamp.

#### Reviewer Feedback & Developer Response

- **ID token (PR #39):** DEV4952 found that `gcloud auth print-identity-token` cannot mint a Cloud Run ID token from WIF external-account credentials. yiiipunn switched to IAM Credentials `generateIdToken`, with the service URL as the audience, and added regression tests for wrong audiences, IAM failures and invalid tokens. DEV4952 approved `680f1da`.
- **Security changes (Issue #38):** DEV4952 required the exact proposed IAM, environment and branch-rule changes before approving them. PR #44 recorded them. When the Organization Policy path failed, PR #45 proposed a standalone-project build identity.
- **Approval marker (PR #45):** the helper required `APPROVE-STANDALONE-BUILD-SECURITY` in the approval. yiiipunn [asked DEV4952 to add it](https://github.com/gearstack-studio/kitloop/pull/45#issuecomment-6894292989) instead of weakening the guard. The current review body contains the marker and an explicit risk acceptance.
- **Synchronization:** PRs #47 and #48 both brought reviewed `main` history back into staging. Both were reviewed, and #48 merged staging into its own branch (`ede37d2`) after #47 landed.

#### Final Verification

| Check | Result |
|:--|:--|
| Release of protected-main `be72f87` | `PASS` |
| Environment approval by DEV4952 | `PASS` |
| Build, digests, migration, revision and health ([details](README.md#production-release-evidence)) | `PASS` |
| Live rollback and roll-forward | `DEFERRED (Reviewer Approved)` |
| Live rejection of an unauthorized deployment | `NOT VERIFIED` |
| C-06 as defined in the handout | `PASS` |

C-06, as the handout defines it, is met: a reviewed change (PR #45) went from staging into main (PR #46), was deployed by the pipeline, and the running revision matches its commit. The release had no application source change, which the PR #46 review states, so execution step 7's "the URL shows the change" is not shown. PRs #45 and #46 carry the `lab5` label, labelled retroactively on 2026-11-16 at 08:08 UTC.

#### Evidence

- [Successful deployment screenshot](https://github.com/gearstack-studio/kitloop/issues/38#issuecomment-6896256486) (issue attachment)
- [Security review](episode-7-security-review.md), [standalone build proposal](episode-7-standalone-build.md), [deployment design](episode-7-deployment.md)
- [Run summary screenshot](evidence/deployment/release-run-43717180011-summary.png) and [release job log excerpt](evidence/deployment/release-run-43717180011-log-excerpt.txt)
- [Environment approval screenshot](evidence/deployment/release-run-43717180011-environment-approval.png): DEV4952 approved `lab5-production` on run 43717180011 attempt 2

## Episode 8: Persistence and rollback

### Issue #40: [Lab 5] Episode 8 Verify Persistence and Rollback

**Issue:** [#40](https://github.com/gearstack-studio/kitloop/issues/40)\
**Episode:** 8\
**Developer:** DEV4952\
**Reviewer:** yiiipunn\
**Status:** CLOSED

#### Scope & Implementation

- Prove that a record created on the public service survives a restart and a reviewed `main` redeploy, and document the rollback outcome.
- DEV4952 built a read-only verifier ([verify.py](../../../infra/gcp/persistence/verify.py)) that fingerprints the selected request and checks the revision, digest and database identity.
- yiiipunn committed the restart evidence (`81e57bd`) and the after-redeploy evidence (`4c71c07`). The restart's operator authorization is not separately linked.

#### Related Pull Requests

| PR | Purpose | Author | Base Branch | Merge Status |
|:--|:--|:--|:--|:--|
| [#41](https://github.com/gearstack-studio/kitloop/pull/41) | Persistence verifier and evidence | DEV4952 | `sprint-1-staging` | MERGED `959f3fa` |

#### Review & Approval Timeline

| Date (UTC) | Actor | Event | Outcome | Evidence |
|:--|:--|:--|:--|:--|
| 2026-11-15 05:05 | DEV4952 | Issue created | OPEN | [#40](https://github.com/gearstack-studio/kitloop/issues/40) |
| 2026-11-15 05:27 | DEV4952 | PR #41 opened as draft at `2d446ba`; CI success | Draft | [Run 43681179618](https://github.com/gearstack-studio/kitloop/actions/runs/43681179618) |
| 2026-11-15 08:28 | DEV4952 | Readiness and baseline UI evidence added | Revised | `28c5978`, `6e72c5e` |
| 2026-11-15 09:00 | yiiipunn | Marked ready for review | Ready | PR timeline |
| 2026-11-15 09:17 | yiiipunn | Restart evidence added | Revised | `81e57bd` |
| 2026-11-15 09:23 | DEV4952 | Asked for redeploy evidence and kept #40 open | Feedback | [Comment](https://github.com/gearstack-studio/kitloop/pull/41#issuecomment-6892281458) |
| 2026-11-15 15:23 | yiiipunn | After-redeploy observation captured | `PASS` | [Issue comment](https://github.com/gearstack-studio/kitloop/issues/40#issuecomment-6896828582) |
| 2026-11-15 15:35 | yiiipunn | Merged staging into the branch, resolving conflicts | Revised | `4c71c07` |
| 2026-11-15 15:35 | GitHub Actions | CI on `4c71c07` | success | [Run 43730756405](https://github.com/gearstack-studio/kitloop/actions/runs/43730756405) |
| 2026-11-15 15:41 | yiiipunn | Review | `APPROVED` | [Review](https://github.com/gearstack-studio/kitloop/pull/41#pullrequestreview-5911534699) |
| 2026-11-15 15:45 | yiiipunn | PR merged | MERGED | `959f3fa` |
| 2026-11-16 04:59 | yiiipunn | Issue closed manually | CLOSED | Issue `closed_by` and timeline event |

#### Reviewer Feedback & Developer Response

- DEV4952 [asked](https://github.com/gearstack-studio/kitloop/pull/41#issuecomment-6892281458) for regression results and redeploy evidence to be attached to PR #41. The after-redeploy evidence arrived in `4c71c07`.
- **Merge conflict resolution:** `4c71c07` merged staging (`35e8742`) into the branch. A `git --remerge-diff` check shows conflicts in `.github/workflows/pull-request-ci.yml` and `episode-7-deployment.md`. The resolution kept both CI steps: persistence guards from this PR and standalone-build safeguards from staging.
- yiiipunn both added evidence commits and approved the PR, so that approval is not fully independent of those commits. DEV4952 authored the verifier and reviewed the baseline and restart evidence in the PR conversation.

#### Final Verification

| Phase | Revision | Result |
|:--|:--|:--|
| Baseline | `kitloop-284f41973f61-20261115080104` | `PASS` |
| After restart | `kitloop-284f41973f61-20261115090539` | `PASS` |
| After redeploy | `kitloop-be72f87e15a6-20261115143840` | `PASS` |
| Rollback and roll-forward | Not executed | `DEFERRED (Reviewer Approved)` |

All phases record request `899544f9-d5a8-4248-829e-db75a44cbbf1`, database `lab-5-cloud-deployment-514310:asia-southeast1:kitloop-pg` and fingerprint `8ed64726bbc9291bc61aca6f41825e7e95cb5261d0ca03f0d1816e61ff9c81ed`. The evidence JSON files are unchanged; their checksums are listed in the [persistence register](evidence/persistence/README.md).

#### Evidence

- [Persistence register](evidence/persistence/README.md), [baseline UI screenshot](evidence/persistence/baseline-ui.png)
- [Runbook](episode-8-persistence.md)
- **TODO:** UI screenshots of the same request after the restart and after the redeploy. Only API observations exist.

## Final documentation

### Issue #49: [Lab 5] Final Documentation, Evidence Audit & Submission Readiness

**Issue:** [#49](https://github.com/gearstack-studio/kitloop/issues/49)\
**Episode:** Step 9, final documentation\
**Developer:** yiiipunn\
**Reviewer:** DEV4952\
**Status:** CLOSED

#### Scope & Implementation

- Consolidate the Lab 5 documentation, map requirements to evidence, index the collaboration history and check for credentials.
- Delivered on branch `docs/lab5-final-audit` and merged through PR #51: the [evidence index](README.md), the [traceability matrix](traceability.md) and this log.

#### Related Pull Requests

| PR | Purpose | Author | Base Branch | Merge Status |
|:--|:--|:--|:--|:--|
| [#50](https://github.com/gearstack-studio/kitloop/pull/50) | Disposable C-02 merge-gate test (intentional failure) | yiiipunn | `sprint-1-staging` | CLOSED, not merged |
| [#51](https://github.com/gearstack-studio/kitloop/pull/51) | Final documentation, evidence audit and collaboration log | yiiipunn | `sprint-1-staging` | MERGED `20f99b2` |

#### Review & Approval Timeline

| Date (UTC) | Actor | Event | Outcome | Evidence |
|:--|:--|:--|:--|:--|
| 2026-11-16 03:59 | yiiipunn | Issue created | OPEN | [#49](https://github.com/gearstack-studio/kitloop/issues/49) |
| 2026-11-16 06:42 | yiiipunn | Staging ruleset restored (authorized) | Version 57946025 | [Evidence](evidence/merge-gate/README.md#staging-ruleset-restoration) |
| 2026-11-16 06:43 | yiiipunn | PR #50 opened as draft with an intentional failing test | Draft | [PR #50](https://github.com/gearstack-studio/kitloop/pull/50) |
| 2026-11-16 06:45 | GitHub Actions | CI on `92c2da9` | **failure** (intentional) | [Run 43818714683](https://github.com/gearstack-studio/kitloop/actions/runs/43818714683) |
| 2026-11-16 06:45 | yiiipunn | PR #50 marked ready for review | Ready | PR timeline |
| 2026-11-16 06:47 | GitHub Actions | CI after ready for review | **failure** (intentional) | [Run 43819010572](https://github.com/gearstack-studio/kitloop/actions/runs/43819010572) |
| 2026-11-16 06:48 | GitHub | Merge state captured | `BLOCKED` | [c02-pr50-merge-state.json](evidence/merge-gate/c02-pr50-merge-state.json) |
| 2026-11-16 06:49 | yiiipunn | PR #50 closed without merging; branch deleted | CLOSED | [PR #50](https://github.com/gearstack-studio/kitloop/pull/50) |
| 2026-11-16 09:05 | yiiipunn | PR #51 opened at head `ce82b66`, labelled `lab5` and `type:docs`, review requested from DEV4952 | Pending | [PR #51](https://github.com/gearstack-studio/kitloop/pull/51) |
| 2026-11-16 09:05 | GitHub Actions | CI on `ce82b66` | success | [Run 43836706049](https://github.com/gearstack-studio/kitloop/actions/runs/43836706049) |
| 2026-11-16 09:30 | DEV4952 | Review | `APPROVED` | [Review](https://github.com/gearstack-studio/kitloop/pull/51#pullrequestreview-5917726785) |
| 2026-11-16 09:31 | DEV4952 | PR merged | MERGED | `20f99b2` |
| 2026-11-16 14:53 | yiiipunn | Issue closed manually | CLOSED | Issue `closed_by` and timeline event |
| 2026-11-16 15:12 | yiiipunn | Lab 5 milestone closed, 20 of 20 items closed | Closed | Milestone record |

#### Final Verification

PR #51 passed the required check and was approved and merged by DEV4952. The approval body is "Over all look good, good work na kub japan"; it states no specific check, so it is counted under R-09 as a non-specific approval. The issue was closed after the merge. Its checklist items were not ticked (see [Issue checklist change log](#issue-checklist-change-log)).

#### Evidence

- [Missing evidence list](README.md#missing-evidence)

## Project board

The team tracked Lab 5 on the public organisation project [KitLoop Development](https://github.com/orgs/gearstack-studio/projects/1) (project 1, created by yiiipunn on 2 November 2026). The board view [Lab 5 - Cloud Deployment & CI/CD](https://github.com/orgs/gearstack-studio/projects/1/views/2), added on 10 November, filters on `label:lab5`.

| Measure | Value |
|:--|:--|
| Status options | Backlog, Todo, In Progress, In Review, Ready for Integration, Testing, Done |
| Other fields | Assignees, Reviewers, Labels, Linked pull requests, Milestone, Repository, Type, Parent issue, Sub-issues progress. No priority, iteration, size or date field exists. |
| Items | 22: all 10 Lab 5 issues and 12 PRs. PRs #41, #44, #45, #46, #50 and #51 were never added. |
| Additions | yiiipunn 13, DEV4952 9 |
| Status changes | 90: project automation 52, yiiipunn 33, DEV4952 5 (issue timeline `project_v2_item_status_changed` events) |
| Milestone | Lab 5: Cloud Deployment & CI/CD held 20 items (8 issues, 12 PRs; #27 and #29 were not added) and was closed on 2026-11-16 at 15:12 UTC with 20 of 20 closed |

The public timeline records that a status changed but not the column, so individual moves through In Review or Testing cannot be reconstructed.

### Status drift and correction

Four closed issues returned to In Progress after a PR was linked to them through the Development panel. In each case the automation changed the status two to four seconds after the link. That the automation reacts to the link is an inference from the timing; the workflow settings are not visible to a signed-out viewer.

| Issue | Closed (UTC) | PR linked, then status reset (UTC) | Corrected to Done by yiiipunn (UTC) |
|:--|:--|:--|:--|
| [#24](https://github.com/gearstack-studio/kitloop/issues/24) | 2026-11-13 13:59 | 2026-11-15 06:45:33, reset 06:45:36 | 2026-11-16 15:55:36 |
| [#34](https://github.com/gearstack-studio/kitloop/issues/34) | 2026-11-14 15:42 | 2026-11-15 02:49:04, reset 02:49:08 | 2026-11-16 15:55:37 |
| [#35](https://github.com/gearstack-studio/kitloop/issues/35) | 2026-11-15 02:46 | 2026-11-15 02:49:22, reset 02:49:25 | 2026-11-16 15:55:40 |
| [#40](https://github.com/gearstack-studio/kitloop/issues/40) | 2026-11-16 04:59 | 2026-11-16 15:12:34, reset 15:12:36 | 2026-11-16 15:55:42 |

After the correction the board shows Done for all 22 items. The link from #24 to PR #43 joins Episode 1 to the checkout fix, which this log does not relate to Episode 1; it is treated as a linking error. The final report shows the board after the correction (Figure 15, captured 16 Nov 16:10 UTC, and Figure 16, captured 17 Nov 05:33 UTC); the earlier state is recorded from the timeline events above.

## Collaboration patterns

- **Alternating ownership.** yiiipunn led Episodes 1, 2, 6B and 7, and DEV4952 led Episodes 3, 4, 6A and 8. Episode 5 was split. Each PR was reviewed by the developer who did not write it.
- **Review cycles that changed the code.** Two reviews changed the implementation before approval. The PR #39 ID-token defect would have failed candidate verification in production. The PR #42 CI failure exposed a real HTTP 500 under concurrent checkout.
- **Scoped approvals.** Several approvals (#33, #36, #37, #39, #45, #47) state which work stays open or is not authorized, such as live IAM changes, deployment or traffic changes. Production actions required separate approval: the environment gate and the rollback deferral.
- **Weaker records.** Five approvals are brief ("Approve", "Ok kub", "LGTM", "Overall look good kub", "Over all look good, good work na kub japan"). They are recorded as `APPROVED` because GitHub records them so, but they provide less review evidence than the substantive reviews.
- **Who closed issues.** yiiipunn closed eight issues, including DEV4952's #27, #29 and #40. DEV4952 closed #24 after verifying the evidence, and #31. No issue was closed automatically by a PR merge.
- **Closure before verification.** Issues #31 and #35 were closed before all of their live or enforcement checks were recorded. Their outstanding items are listed above rather than treated as complete.

## Issue checklist change log

Proposed checklist updates were prepared on 16 November 2026 from the evidence in this log and the [traceability matrix](traceability.md). They have **not been applied** to GitHub. The issue bodies still show their state at closure: nine issues have no ticked items and #31 has 8 of 51 ticked. Completion is evidenced by the merged PRs, CI runs and comments recorded above, not by checkboxes.

| Issue | Items newly checked | Items left unchecked | Main reasons left unchecked |
|:--|:--|:--|:--|
| [#24](https://github.com/gearstack-studio/kitloop/issues/24) | 8 | 0 | None |
| [#25](https://github.com/gearstack-studio/kitloop/issues/25) | 15 | 0 | None |
| [#27](https://github.com/gearstack-studio/kitloop/issues/27) | 10 | 0 | None |
| [#29](https://github.com/gearstack-studio/kitloop/issues/29) | 0 | 0 | No checklist in the issue |
| [#31](https://github.com/gearstack-studio/kitloop/issues/31) | 39 | 4 | Startup logs, catalog capture, console screenshots |
| [#34](https://github.com/gearstack-studio/kitloop/issues/34) | 7 | 3 | Reviewer items not confirmed in a review |
| [#35](https://github.com/gearstack-studio/kitloop/issues/35) | 8 | 4 | Config screenshots, reviewer items; merge blockers not isolated (noted on checked items) |
| [#38](https://github.com/gearstack-studio/kitloop/issues/38) | 23 | 6 | Live rejection test, reviewer items |
| [#40](https://github.com/gearstack-studio/kitloop/issues/40) | 18 | 3 | #35 prerequisite, UI check after restart, live rollback |
| [#49](https://github.com/gearstack-studio/kitloop/issues/49) | 0 | All | Not applied; completion is evidenced by PR #51 |
