# Merge-gate evidence (C-02 and staging ruleset)

Captured on 16 November 2026 for [Issue #49](https://github.com/gearstack-studio/kitloop/issues/49), after explicit authorization of both operations. All files are unmodified API responses or extracts from them.

## Staging ruleset restoration

Ruleset 27310627 (`sprint-1-staging`) was restored to the approved version 57871331 settings with `gh api --method PUT` and [staging-ruleset-restore.json](../../staging-ruleset-restore.json).

| File | Content |
|:--|:--|
| [ruleset-27310627-before-restore.json](ruleset-27310627-before-restore.json) | Snapshot before the change: version 57878159, no `pull_request` rule, strict checks off |
| [ruleset-27310627-after-restore.json](ruleset-27310627-after-restore.json) | Read-back after the change |
| [ruleset-27310627-history.json](ruleset-27310627-history.json) | Version history, including the new version 57946025 |

Verified read-back, compared by rule type with version 57871331:

| Check | Result |
|:--|:--|
| New version | 57946025, saved 2026-11-16 06:42:21 UTC by yiiipunn |
| Effective branch rules | `deletion`, `non_fast_forward`, `pull_request`, `required_status_checks` |
| Review rule | 1 approval, approval after the last push, stale approvals dismissed, threads resolved |
| Required check | `Build, test and Docker smoke` (app 15368), strict |
| Enforcement and bypass | Active, no bypass actors |
| Match with approved version 57871331 | Identical by rule type |

## C-02 disposable failing-CI test

| Item | Value |
|:--|:--|
| PR | [#50](https://github.com/gearstack-studio/kitloop/pull/50) `[DO NOT MERGE] C-02 merge-gate evidence`, draft, then ready for review |
| Branch and commit | `test/c02-merge-gate` from `sprint-1-staging` `959f3fa`; head `92c2da9` added only `server/tests/zz-c02-merge-gate.test.ts` |
| CI while draft | [Run 43818714683](https://github.com/gearstack-studio/kitloop/actions/runs/43818714683): `FAILURE` at "Backend integration tests and live readiness" |
| CI after ready for review | [Run 43819010572](https://github.com/gearstack-studio/kitloop/actions/runs/43819010572): `FAILURE` |
| Failure cause | Only the intentional test: 1 test file failed, 11 passed, `expected 'merge gate' to be 'blocked'` |
| Merge state | `BLOCKED` with `mergeable: MERGEABLE` (no conflicts), [c02-pr50-merge-state.json](c02-pr50-merge-state.json), captured 06:48:51 UTC |
| Cleanup | Closed without merging at 06:49:22 UTC; branch deleted; `sprint-1-staging` still at `959f3fa` |

No merge was attempted.

### Limits

- `BLOCKED` had two causes at capture time: the failing required check and the missing approval required by the restored review rule (`reviewDecision: REVIEW_REQUIRED`). GitHub's API does not report the causes separately. Isolating the CI cause would have needed an approval from DEV4952 on the disposable PR, which was not requested.
- No screenshot of the merge box was taken, because no browser session was available. The closed PR and both failed runs remain viewable on GitHub.
- The test was intentional. It is not a product defect, and the branch never reached `sprint-1-staging`.
