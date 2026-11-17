# Lab 5 evidence gap matrix

Assessment: 16 November 2026, [Issue #49](https://github.com/gearstack-studio/kitloop/issues/49). Status labels follow the [evidence index](README.md#status-vocabulary). Expected evidence follows the handout, Sections 8 and 12. Every action marked **approval required** changes GitHub, GCP or production state and has not been performed.

## Matrix

| Requirement | Expected evidence (handout) | Existing evidence | Missing proof | Safe next action | Status |
|:--|:--|:--|:--|:--|:--|
| C-02 (R-06): failing PR cannot be merged | PR link; failed check and blocked merge; screenshot of the blocked merge button | [PR #50](evidence/merge-gate/README.md#c-02-disposable-failing-ci-test): required check failed twice, merge state `BLOCKED` | Merge-button screenshot; CI cause not isolated from `REVIEW_REQUIRED` | A new disposable PR with a teammate approval, **approval required** | Behavior `PASS`; evidence `PARTIAL` |
| C-04 (R-03): sign-in, main action, rejection on the public URL | Screenshots with the URL visible | [Baseline UI](evidence/persistence/baseline-ui.png) (URL cropped out), [rejection probes](evidence/public-access/README.md) (JSON) | Screenshots of sign-in, a request and a rejection with the URL visible | Capture in a browser with a synthetic account; read-only except one test request | Behavior `PASS`; evidence `PARTIAL` |
| C-05 (R-04): record survives restart and redeploy | Before and after screenshots | Baseline screenshot; API records for all three phases; [current observation](evidence/persistence/after-redeploy-ui-20261117.png) on the public URL, 17 Nov 2026 | After-phase screenshots | None possible; see [Episode 8 note](#episode-8-ui-evidence) | Behavior `PASS`; evidence `PARTIAL` |
| C-06 (R-07 to R-10): reviewed change deployed; revision matches commit | PR links, pipeline run, GCP revision | PR #45, release PR #46, [run 43717180011 attempt 2](https://github.com/gearstack-studio/kitloop/actions/runs/43717180011/attempts/2), [job log excerpt](evidence/deployment/release-run-43717180011-log-excerpt.txt) | None for C-06 | None required | `PASS` |
| Execution step 7: "the URL shows the change" | Visible change on the public URL | None; release `be72f87` changed no application code | A visible change | [Smallest visible release](#c-06-handout-finding), **approval required** | `NOT VERIFIED` |
| R-09: specific teammate reviews | Every review states a specific check, question, finding or reason | Most approvals are specific | Five approvals are not (#26, first #33, #43, #44, #51) | Cannot be changed retroactively; disclose | `PARTIAL` |
| R-10: `lab5` labels on Lab 5 issues and PRs | Labels on every Lab 5 issue and PR | All 10 issues and all 18 PRs (including #50 and #51); #26, #44, #45 and #46 labelled retroactively on 2026-11-16 at 08:08 UTC | None | None required | `PASS` |
| Episode 5: GCP Console screenshots | Console settings a link cannot show | [Six verified captures](evidence/console/README.md#verified-captures): revisions, backups, registry, build, migration job, secret names | Cloud Run networking; Cloud SQL overview (first attempt showed an access error) | [Recapture](evidence/console/README.md#still-needed); read-only | `PARTIAL` |
| Episode 7: environment approval panel | Screenshot of the `lab5-production` approval | [Approval screenshot](evidence/deployment/release-run-43717180011-environment-approval.png) from the public run page; run approvals API | None | None required | `PASS` |
| Staging ruleset: review and last-push approval | Active review rule; strict checks | [Restored as version 57946025](evidence/merge-gate/README.md#staging-ruleset-restoration) | None | None required | `PASS` |

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
- The Issue #49 documentation PR needed DEV4952's approval after its final push; PR #51 received it and was merged on 2026-11-16 at 09:31 UTC.

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

## C-06 handout finding

The handout (`01_SE_Lab_5_updated.pdf`) was located on 16 November 2026. Its wording settles the earlier question:

| Source | Wording | Effect |
|:--|:--|:--|
| Section 8, C-06 | "A reviewed change goes from staging into main and is deployed, and the running revision matches its commit." Evidence: PR links, pipeline run, GCP revision. | Met by PR #45, release PR #46, run 43717180011 attempt 2 and revision `kitloop-be72f87e15a6-20261115143840`. |
| Section 12, Part 4 (15 points) | One labelled change from Issue to PR into staging with a specific teammate review, release PR into main, CI and deployment; pipeline run and running revision showing the release commit. | Met. PRs #45 and #46 carry `lab5`, labelled retroactively on 2026-11-16 at 08:08 UTC. |
| Section 7, step 7 "Done when" | "The URL shows the change and you can show which commit is running." | Not met: release `be72f87` changed no application code. |

C-06 is therefore `PASS`. The visible change belongs to execution step 7, not to the graded check, and remains `NOT VERIFIED`.

If the team wants step 7 fully shown, the smallest suitable change is a UI footer with the deployed short commit SHA. It would go through a labelled feature PR, a release PR into `main` and an approved `lab5-production` deployment. That deployment runs Cloud Build, the migration job and a traffic change, so it needs explicit authorization.

## Episode 5 console captures

The capture list, direct URLs, file names, expected content and redaction rules are in the [GCP Console capture checklist](evidence/console/README.md). No browser session with GCP access is available to this audit, and `gcloud` is not installed locally.

## Episode 8 UI evidence

UI screenshots taken at the restart and redeploy times were not saved, and they cannot be recreated. A screenshot taken today would show the record's current state. It may be added only if it is labelled with its capture date as a current observation, never as after-restart or after-redeploy evidence. One such observation was added on 17 November 2026: [after-redeploy-ui-20261117.png](evidence/persistence/after-redeploy-ui-20261117.png), the Custodian view on the public URL with the address bar visible, showing the request still `PENDING`. C-05 evidence stays `PARTIAL`. The API-level PASS results remain the authoritative persistence evidence.

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
