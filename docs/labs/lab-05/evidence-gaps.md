# Lab 5 evidence gap matrix

Assessment: 16 November 2026, [Issue #49](https://github.com/gearstack-studio/kitloop/issues/49). Status labels follow the [evidence index](README.md#status-vocabulary). Every action marked **approval required** changes GitHub, GCP or production state and has not been performed.

## Matrix

| Requirement | Expected evidence | Existing evidence | Missing proof | Safe next action | Status |
|:--|:--|:--|:--|:--|:--|
| C-02: failing CI blocks merge | PR page showing merge blocked by a failing required check | [PR #50](evidence/merge-gate/README.md#c-02-disposable-failing-ci-test): required check failed twice, merge state `BLOCKED` | Merge-box screenshot; isolation from the missing-approval blocker | None required | `PASS` |
| C-04: public URL, sign-in, action, rejection | Public sign-in, a valid action and a rejected action | [Baseline UI](evidence/persistence/baseline-ui.png) and authenticated observations; [rejection probes](evidence/public-access/README.md) returned 401 | Live role-based denial (optional) | None required | `PASS` |
| C-06: reviewed release and matching revision | Reviewed `main` release; serving revision tied to its commit; visible change if the handout requires it | Revision `kitloop-be72f87e15a6-20261115143840` matches `be72f87` ([log excerpt](evidence/deployment/release-run-43717180011-log-excerpt.txt)) | A visible application change, **if required** | [Confirm the handout wording](#c-06-requirement-confirmation) first | `PARTIAL`, requires confirmation |
| Episode 5: GCP Console screenshots | Cloud Run, Cloud SQL, backups, Artifact Registry, Cloud Build, migration job | [Cloud Shell first-release capture](evidence/deployment/first-release-publish-cloud-shell.png), JSON metadata, release log | Console captures | [Capture list](#episode-5-console-captures); read-only | `PARTIAL` |
| Episode 7: release summary | Run summary for the production release | [Run summary screenshot](evidence/deployment/release-run-43717180011-summary.png), [job log excerpt](evidence/deployment/release-run-43717180011-log-excerpt.txt) | Environment approval panel screenshot | Capture the run's approval panel; read-only | `PASS` |
| Episode 8: UI after restart and redeploy | Same request visible in the UI after each operation | API observations PASS for all three phases; baseline UI screenshot only | Historical UI captures after restart and redeploy do not exist | [Episode 8 note](#episode-8-ui-evidence) | `PARTIAL` |
| Staging ruleset: review and last-push approval | Active `pull_request` rule with one approval and last-push approval; strict checks | [Restored as version 57946025](evidence/merge-gate/README.md#staging-ruleset-restoration), read back and matched to 57871331 | None | None required | `PASS` |

## Staging ruleset restoration

**Applied on 16 November 2026 at 06:42:21 UTC** after explicit authorization. The read-back matches version 57871331 by rule type; see the [merge-gate evidence](evidence/merge-gate/README.md#staging-ruleset-restoration). The plan below is kept as the reviewed record.

### Current state, rechecked 16 November 2026

The current ruleset (version 57878159, saved 2026-11-15 15:45:00 UTC) differs from the last restored version (57871331) in exactly two settings. Name, target, enforcement, branch condition, bypass actors (none), deletion, non-fast-forward and the required check are identical.

| Setting | Current (57878159) | Restored (57871331) | Reviewed proposal |
|:--|:--|:--|:--|
| `pull_request` rule | Absent | Present | Present |
| Required approvals | None | 1 | 1 |
| Approval after the last push | No | Yes | Yes |
| Dismiss stale approvals on push | No | Yes | Yes |
| Resolve review threads | No | Yes | Yes |
| Strict status checks (branch up to date) | Off | On | On |

### What restoration changes

[staging-ruleset-restore.json](staging-ruleset-restore.json) is version 57871331's state, written as an update payload. Compared with the current ruleset, it adds the `pull_request` rule and turns strict checks on. It removes no rule, adds no bypass actor and changes no other setting, so no existing protection is weakened.

Workflow effects to expect after restoration:
- A PR into `sprint-1-staging` needs one approval from someone other than the last pusher. On PR #41, for example, the reviewer's own merge commit would have required a fresh approval from the other developer.
- A PR branch must be up to date with `sprint-1-staging` before merging.
- The upcoming Issue #49 documentation PR will need DEV4952's approval after its final push.

### Commands, after approval

```bash
R=repos/gearstack-studio/kitloop
# 1. Snapshot the current version for the record.
gh api $R/rulesets/27310627 > ruleset-before.json
# 2. Apply the reviewed payload.
gh api --method PUT $R/rulesets/27310627 --input docs/labs/lab-05/staging-ruleset-restore.json
# 3. Verify the effective branch rules and the new history entry.
gh api $R/rules/branches/sprint-1-staging --jq '[.[].type] | sort'
gh api $R/rulesets/27310627 --jq '.rules[] | select(.type=="pull_request" or .type=="required_status_checks") | .parameters'
gh api $R/rulesets/27310627/history --jq '.[0]'
```

Expected after step 3: rule types `deletion`, `non_fast_forward`, `pull_request` and `required_status_checks`; one required approval; last-push approval on; strict checks on. Rules are compared by type, because GitHub may return them in a different order.

If GitHub rejects a parameter copied from the stored state (`dismissal_restriction`, `required_reviewers` or `require_extra_approval_for_unattributed_changes`), the request fails without changing anything. Then apply the reviewed proposal [wif-iam-merge-gates-ruleset.json](wif-iam-merge-gates-ruleset.json), which produced this state when it was first applied, and repeat step 3.

## C-02 disposable failing-CI test

**Run on 16 November 2026** after explicit authorization, as [PR #50](https://github.com/gearstack-studio/kitloop/pull/50). Both CI runs failed on the intentional test, GitHub reported `BLOCKED`, and the PR was closed without merging. Results and limits are in the [merge-gate evidence](evidence/merge-gate/README.md#c-02-disposable-failing-ci-test). The plan below is kept as the reviewed record.

No historical record shows GitHub refusing a merge. PR #42 failed CI, but it was merged only after a passing rerun, and `main` protection at that time is not recorded. The test below touches no protected branch and no cloud resource; `deploy.yml` runs only on pushes to `main`. Run it **after** the ruleset restoration, so that the evidence reflects the final configuration.

### Steps, after approval

1. Create the disposable branch and a test that always fails. It needs no database.

   ```bash
   git switch -c test/c02-merge-gate origin/sprint-1-staging
   cat > server/tests/zz-c02-merge-gate.test.ts <<'TS'
   import { expect, it } from "vitest";
   // Disposable C-02 evidence (Issue #49). Must never be merged.
   it("fails on purpose to demonstrate the required CI merge gate", () => {
     expect("merge gate").toBe("blocked");
   });
   TS
   git add server/tests/zz-c02-merge-gate.test.ts
   git commit -m "test(c02): deliberately failing check for merge-gate evidence (DO NOT MERGE)"
   git push -u origin test/c02-merge-gate
   ```
2. Open it as a **draft** PR into `sprint-1-staging`, titled `[DO NOT MERGE] C-02 merge-gate evidence`, labelled `lab5`, referencing #49. A draft cannot be merged by accident.
3. Wait for `Build, test and Docker smoke` to fail (about 3 minutes).
4. Mark the PR ready for review with `gh pr ready`. This reruns CI, which fails again; a draft reports `DRAFT` rather than `BLOCKED`.
5. Optional, for a clean isolation: DEV4952 approves with the comment "Approval for the C-02 gate test only. Do not merge." The failing check is then the only blocker.
6. Capture the evidence:
   - Screenshot of the PR merge box showing the failing required check and the disabled merge button.
   - Screenshot of the Checks tab with the failed step.
   - `gh pr view <n> --json mergeStateStatus,reviewDecision,statusCheckRollup > c02-merge-state.json`. Expected: `mergeStateStatus` is `BLOCKED` and the required check concluded `FAILURE`.
7. Clean up: `gh pr close <n> --delete-branch --comment "C-02 evidence captured; closed without merging."`. Then confirm that `sprint-1-staging` did not move.
8. Store the screenshots and JSON under `evidence/merge-gate/` with capture times, and link them here and in the traceability matrix.

Do not attempt to merge the PR, not even to show the refusal. If a protection were misconfigured, a merge attempt would put a failing test on staging.

## C-06 requirement confirmation

The official handout is not in this repository, so the wording of C-06 cannot be checked here.

- The visible-change criterion first appears in our own paraphrase of the handout, added to [deployment.md](deployment.md#episode-7-release-path-issue-38) in commit `0753ec8` (PR #39).
- The [Episode 8 draft](episode-8-issue.md) describes C-06 without it: reviewed feature and release PRs, required CI, the deployment run, and a serving revision tied to the main commit.

**Requires confirmation against the handout or rubric:**

| If C-06 requires | Then |
|:--|:--|
| Reviewed release and matching revision only | Mark C-06 `PASS` from existing evidence. No release is needed. |
| A visible change shown on the public URL | A new reviewed release is needed. Release `be72f87` changed no application code. |

If a release is needed, the smallest suitable change is a UI footer showing the deployed short commit SHA. It is visible, and it makes the revision-to-commit link visible too. It would go through a feature PR, a release PR into `main` and an approved `lab5-production` deployment. That deployment runs Cloud Build, the migration job and a traffic change, so it needs explicit authorization.

## Episode 5 console captures

No browser session with GCP access is available to this audit, and `gcloud` is not installed locally. An authorized operator can capture these read-only pages. All are in project `lab-5-cloud-deployment-514310`, region `asia-southeast1`.

| File to save | Console page | Must show |
|:--|:--|:--|
| `e5-01-cloud-run-revisions.png` | [Cloud Run service revisions](https://console.cloud.google.com/run/detail/asia-southeast1/kitloop/revisions?project=lab-5-cloud-deployment-514310) | Revision `kitloop-be72f87e15a6-20261115143840` at 100%, earlier revisions, image digest |
| `e5-02-cloud-run-networking.png` | Same service, **Networking** tab | Ingress setting and VPC egress |
| `e5-03-cloud-sql-overview.png` | [Cloud SQL `kitloop-pg` overview](https://console.cloud.google.com/sql/instances/kitloop-pg/overview?project=lab-5-cloud-deployment-514310) | PostgreSQL 17, tier, region, private IP only |
| `e5-04-cloud-sql-backups.png` | [Cloud SQL backups](https://console.cloud.google.com/sql/instances/kitloop-pg/backups?project=lab-5-cloud-deployment-514310) | Automated backups enabled, backup `1794732111059` |
| `e5-05-artifact-registry.png` | [Artifact Registry `kitloop`](https://console.cloud.google.com/artifacts/docker/lab-5-cloud-deployment-514310/asia-southeast1/kitloop?project=lab-5-cloud-deployment-514310) | `kitloop-app` and `kitloop-migration` with digests `f149e6db...` and `e35d9834...` |
| `e5-06-cloud-build.png` | [Cloud Build history](https://console.cloud.google.com/cloud-build/builds;region=asia-southeast1?project=lab-5-cloud-deployment-514310) | Build `676619ea-a64f-4e49-89d5-cdb2a884a312`, SUCCESS |
| `e5-07-migration-job.png` | [Cloud Run job `kitloop-migrate` executions](https://console.cloud.google.com/run/jobs/details/asia-southeast1/kitloop-migrate/executions?project=lab-5-cloud-deployment-514310) | Execution `kitloop-migrate-4d8sw` succeeded |
| `e5-08-secret-manager.png` | [Secret Manager list](https://console.cloud.google.com/security/secret-manager?project=lab-5-cloud-deployment-514310) | Secret **names** only |

Capture rules:
- Crop out account emails and avatars.
- Never open a secret version's value, the Cloud SQL users page or a connection string.
- Name each file as above and record its capture time in `evidence/console/README.md`.
- These captures show the state at capture time. Label them as current state, not as first-release evidence.

## Episode 8 UI evidence

UI screenshots taken at the restart and redeploy times were not saved, and they cannot be recreated. A screenshot taken today would show the record's current state. It may be added only if it is labelled with its capture date as a current observation, never as after-restart or after-redeploy evidence. The API-level PASS results remain the authoritative persistence evidence.

## Staging ruleset history

Read with repository-admin access on 16 November 2026 from the ruleset history API. All five versions were saved by yiiipunn; the fifth is the authorized restoration.

| Version | Saved (UTC) | `pull_request` rule | Strict checks | Merges while active |
|:--|:--|:--|:--|:--|
| 57862071 | 2026-11-15 11:22:58 | 1 approval, last-push approval, stale dismissal, thread resolution | On | [#45](https://github.com/gearstack-studio/kitloop/pull/45) |
| 57869562 | 2026-11-15 13:26:03 | Removed | On | [#47](https://github.com/gearstack-studio/kitloop/pull/47) (13:26:38), [#48](https://github.com/gearstack-studio/kitloop/pull/48) (13:35:04) |
| 57871331 | 2026-11-15 13:57:25 | Restored, same settings | On | None |
| 57878159 | 2026-11-15 15:45:00 | Removed | Off | [#41](https://github.com/gearstack-studio/kitloop/pull/41) (15:45:19) |
| 57946025 | 2026-11-16 06:42:21 | Restored to version 57871331 settings | On | None at capture time |

Each removal was saved less than a minute before a merge. Every one of those PRs had an `APPROVED` review from the other developer. For PR #41, the approving reviewer (yiiipunn) had also pushed the last commit (`4c71c07`), which a last-push approval rule does not accept from the same person. The ruleset has no bypass actors, and the required check rule stayed active throughout.

`main` classic protection, also read with admin access: strict required `Build, test and Docker smoke`, one approving review, stale-review dismissal, code-owner review, administrators included, and no force pushes or deletions. Last-push approval is not enabled on `main`. The repository has no `CODEOWNERS` file, so the code-owner requirement currently has no effect.
