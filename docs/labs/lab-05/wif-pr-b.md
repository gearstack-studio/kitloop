# Proposed PR — Episode 6 Part B

**Title:** `[Lab 5] Review WIF IAM and prepare staging merge gates`

**Base:** `sprint-1-staging`

**Head:** `feat/6-iam-merge-gate`

**Reviewer:** `DEV4952`

**Label:** `lab5`

**Issue:** Part of #35

## Summary

Document the independent WIF verifier IAM review and prepare an exact GitHub ruleset for the staging branch. The ruleset payload is a proposal and has not been applied. No IAM, WIF provider, repository setting, or deployment resource was changed.

## IAM review

- Reviewed the merged PR #36 trust condition and its numeric repository/owner IDs, staging ref, event and workflow restrictions, audience, dedicated pool design, and scoped impersonation member.
- Defined the verifier's minimum resource permission as project `resourcemanager.projects.get`. The operator reports a matching custom role and project grant; its definition and effective policy are not independently inspected.
- Direct and inherited GCP roles, user-managed keys, and the provider's actual JSON remain unverified because this environment has no `gcloud` or accessible Cloud Console session. The read-only inventory is in the runbook. No additional IAM grant is proposed until that audit.
- Staging WIF [attempts 1 and 2](https://github.com/gearstack-studio/kitloop/actions/runs/43611041165) failed at project lookup. [Attempt 3](https://github.com/gearstack-studio/kitloop/actions/runs/43611041165/attempts/3) passed the authenticated lookup at the same SHA after the operator-reported grant. The earlier gcloud error was suppressed, so the exact failure cause is not proven.

## Proposed merge gate

- Target only `refs/heads/sprint-1-staging`.
- Require a PR, one approving review, a fresh approval after new pushes, resolved threads, and the passing `Build, test and Docker smoke` status check from GitHub Actions app `15368`.
- Require the PR to be up to date with staging; block force pushes and branch deletion; configure no standing bypass actors. Before activation, confirm two named people can edit repository rules for emergency recovery. Do not activate if that access is unavailable.
- Do not require the WIF push authentication workflow, which does not run on PRs.
- The JSON in `docs/labs/lab-05/wif-iam-merge-gates-ruleset.json` awaits yiiipunn's approval and administrator activation. Enforcement tests therefore remain pending.

## Verification and evidence

- Local WIF offline suite: 28 tests passed on staging base `c75cdf1c00634e52070d32b90cc4047076316c04`. The ruleset JSON, required fields, document links, and whitespace were checked after these documentation changes. No tracked file changed.
- Verified existing PR CI context and app from [PR #36 head checks](https://github.com/gearstack-studio/kitloop/commit/d6dd68a803a70770f4dd11cac935757d4104bb52/checks); [run 43610143485](https://github.com/gearstack-studio/kitloop/actions/runs/43610143485) passed on PR A. This is not a Part B CI result.
- Current staging branch API reports no protection and no repository rulesets. No missing-approval, failing-check, or passing-eligibility demonstration has occurred after rule activation.
- See [IAM and merge-gate runbook](wif-iam-merge-gates.md) for the command list, evidence requirements, and follow-up actions. Record this PR's final head SHA and CI link after an authorized push.

## Remaining risks and reviewer checklist

- [ ] Inspect live provider, service-account policy, effective roles, and user-managed keys; approve any IAM remediation separately.
- [ ] Review the proposed ruleset target, check name and GitHub Actions source, strict mode, review behavior, and two-person emergency recovery plan.
- [ ] Obtain yiiipunn's explicit approval before any IAM or ruleset change; read back the applied settings afterward.
- [ ] Prove missing approval and failing CI block merge, then prove eligibility after a passing check and fresh approval.
- [x] Verify successful trusted WIF project lookup at staging SHA `c75cdf1c00634e52070d32b90cc4047076316c04` in attempt 3.
- [ ] Audit the live role and grants, and confirm whether the missing project permission caused attempts 1 and 2; their raw error was not captured.
- [ ] Confirm this PR changes only Episode 6 Part B documentation and the unapplied ruleset proposal. Issue 7 deployment remains out of scope.
