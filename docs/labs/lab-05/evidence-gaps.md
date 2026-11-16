# Lab 5 evidence gap matrix

Assessment: 16 November 2026, [Issue #49](https://github.com/gearstack-studio/kitloop/issues/49). Status labels follow the [evidence index](README.md#status-vocabulary). Every action marked **approval required** changes GitHub, GCP or production state and has not been performed.

## Matrix

| Requirement | Expected evidence | Existing evidence | Missing proof | Safe next action | Status |
|:--|:--|:--|:--|:--|:--|
| C-02: failing CI blocks merge | PR page showing merge blocked by a failing required check | Required check on `main` (verified with admin access); required check in staging ruleset; failing [run 43683951193](https://github.com/gearstack-studio/kitloop/actions/runs/43683951193) on PR #42 | A captured `BLOCKED` merge state; `main` protection state during PR #42 is not recorded | [Isolated C-02 test](#c-02-isolated-merge-gate-test), **approval required** | `PARTIAL` |
| C-04: public URL, sign-in, action, rejection | Public sign-in, a valid action and a rejected action | [Baseline UI](evidence/persistence/baseline-ui.png) and authenticated observations; [rejection probes](evidence/public-access/README.md) returned 401 | Live role-based denial (optional) | None required | `PASS` |
| C-06: visible change in a reviewed release | A reviewed `main` release whose UI change is visible on the public URL, on the matching revision | Revision `kitloop-be72f87e15a6-20261115143840` matches `be72f87` ([log excerpt](evidence/deployment/release-run-43717180011-log-excerpt.txt)) | A visible application change; PR #46 states it has none | [Smallest visible release](#c-06-smallest-visible-release), **approval required** | `PARTIAL` |
| Episode 5: GCP Console screenshots | Cloud Run service, Cloud SQL instance and backups, Artifact Registry, Cloud Build history | [Cloud Shell first-release capture](evidence/deployment/first-release-publish-cloud-shell.png), JSON metadata, release log | Console captures | [Capture instructions](#episode-5-console-captures); read-only | `PARTIAL` |
| Episode 7: release summary | Run summary for the production release | [Run summary screenshot](evidence/deployment/release-run-43717180011-summary.png), [job log excerpt](evidence/deployment/release-run-43717180011-log-excerpt.txt) | Environment approval screenshot | Capture the run's approval panel; read-only | `PASS` |
| Episode 8: UI after restart and redeploy | Same request visible in the UI after each operation | API observations PASS for all three phases; baseline UI screenshot only | Historical UI captures after restart and redeploy do not exist | [Episode 8 note](#episode-8-ui-evidence) | `PARTIAL` |
| Staging ruleset: review and last-push approval | Active `pull_request` rule with one approval and last-push approval | [Ruleset history](#staging-ruleset-history): rule present in versions 57862071 and 57871331 | Rule absent from the current version 57878159; strict checks off | Restore version 57871331 settings, **approval required** | `NOT VERIFIED` |

## C-02 isolated merge-gate test

No historical record shows GitHub refusing a merge. PR #42 failed CI, but it was merged only after a passing rerun, and `main` protection at that time is not recorded. Proposed test, which touches no protected branch and no cloud resource:

1. Create branch `test/c02-merge-gate` from `sprint-1-staging` with one deliberately failing unit test.
2. Open a **draft** PR into `sprint-1-staging`, labelled `lab5`, stating that it must not be merged.
3. Wait for `Build, test and Docker smoke` to fail. Capture the PR merge box and `gh pr view --json mergeStateStatus,statusCheckRollup`.
4. Close the PR without merging and delete the branch. Link the captures here.

`deploy.yml` runs only on pushes to `main`, so this test cannot deploy. It uses about 3 CI minutes.

## C-06 smallest visible release

The handout asks for a visible change on the public URL. The smallest useful change is a UI footer showing the deployed short commit SHA, which also makes the revision-to-commit link visible. It follows the normal path:

1. Feature PR into `sprint-1-staging`, reviewed by DEV4952, CI passing.
2. Release PR into `main`, reviewed by DEV4952.
3. Set `LAB5_DEPLOY_ENABLED=true`, obtain DEV4952's `lab5-production` approval, then restore `false`.
4. Capture the public page before and after, the run summary and the serving revision.

Steps 3 and 4 run a production build, migration job and traffic change. They need explicit authorization.

## Episode 5 console captures

No browser session with GCP access is available to this audit, and `gcloud` is not installed locally. An authorized operator can capture these read-only pages in project `lab-5-cloud-deployment-514310`, region `asia-southeast1`:

| Page | Console path | Show |
|:--|:--|:--|
| Cloud Run service | Cloud Run > Services > `kitloop` > Revisions | Serving revision, 100% traffic, image digest |
| Cloud SQL | SQL > `kitloop-pg` > Overview and Backups | PostgreSQL 17, private IP, automated backups |
| Artifact Registry | Artifact Registry > `kitloop` | `kitloop-app` and `kitloop-migration` digests |
| Cloud Build | Cloud Build > History (region `asia-southeast1`) | Build `676619ea-a64f-4e49-89d5-cdb2a884a312`, SUCCESS |
| Migration job | Cloud Run > Jobs > `kitloop-migrate` > Executions | `kitloop-migrate-4d8sw` succeeded |

Crop out account emails and avoid pages that display secret values or connection strings. Record each capture's time; a capture taken now shows the current state, not the first release.

## Episode 8 UI evidence

UI screenshots taken at the restart and redeploy times were not saved, and they cannot be recreated. A screenshot taken today would show the record's current state. It may be added only if it is labelled with its capture date as a current observation, never as after-restart or after-redeploy evidence. The API-level PASS results remain the authoritative persistence evidence.

## Staging ruleset history

Read with repository-admin access on 16 November 2026 from the ruleset history API. All four versions were saved by yiiipunn.

| Version | Saved (UTC) | `pull_request` rule | Strict checks | Merges while active |
|:--|:--|:--|:--|:--|
| 57862071 | 2026-11-15 11:22:58 | 1 approval, last-push approval, stale dismissal, thread resolution | On | [#45](https://github.com/gearstack-studio/kitloop/pull/45) |
| 57869562 | 2026-11-15 13:26:03 | Removed | On | [#47](https://github.com/gearstack-studio/kitloop/pull/47) (13:26:38), [#48](https://github.com/gearstack-studio/kitloop/pull/48) (13:35:04) |
| 57871331 | 2026-11-15 13:57:25 | Restored, same settings | On | None |
| 57878159 | 2026-11-15 15:45:00 | Removed | Off | [#41](https://github.com/gearstack-studio/kitloop/pull/41) (15:45:19) |

Each removal was saved less than a minute before a merge. Every one of those PRs had an `APPROVED` review from the other developer. For PR #41, the approving reviewer (yiiipunn) had also pushed the last commit (`4c71c07`), which a last-push approval rule does not accept from the same person. The ruleset has no bypass actors, and the required check rule stayed active throughout.

`main` classic protection, also read with admin access: strict required `Build, test and Docker smoke`, one approving review, stale-review dismissal, code-owner review, administrators included, and no force pushes or deletions. Last-push approval is not enabled on `main`.

Restoring version 57871331's `pull_request` rule and strict checks is a repository security change and needs explicit authorization.
