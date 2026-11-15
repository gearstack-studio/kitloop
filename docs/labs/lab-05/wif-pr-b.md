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

- Reviewed merged PR #36 and the [live WIF provider capture](evidence/iam/07-wif-provider-trust-condition.png): repository/owner IDs, staging ref, event and workflow restrictions, issuer, active state, and attribute mappings match the documented trust condition. Pool administration and other-provider inventory remain follow-up items.
- [Evidence A](evidence/iam/01-wif-impersonation-policy.png) verifies the scoped `roles/iam.workloadIdentityUser` binding. [Evidence B](evidence/iam/02-verifier-project-binding.png) verifies the project-level `kitloopWifProjectLookup` grant to the verifier. [Evidence C](evidence/iam/03-custom-role-permissions.png) shows only `resourcemanager.projects.get` in that role. [Evidence D](evidence/iam/04-user-managed-keys.png) shows `[]` for user-managed keys at inspection time.
- [Project metadata](evidence/iam/05-project-hierarchy.png) did not report `parent`. [Policy Analyzer evidence](evidence/iam/06-inherited-access-incomplete.png) shows Cloud Asset API enablement and the `NOT fully explored` warning. Inherited IAM access is **PARTIAL**, not exhaustively verified. The absence of `parent` and an empty incomplete result do not establish that inherited grants are absent. No further IAM grant is justified by the successful project lookup.
- Staging WIF attempts [1 and 2](https://github.com/gearstack-studio/kitloop/actions/runs/43611041165) failed at project lookup; their raw gcloud error was suppressed. [Attempt 3](https://github.com/gearstack-studio/kitloop/actions/runs/43611041165/attempts/3) and its [screenshot](evidence/iam/08-wif-authentication-success.png) show success at `c75cdf1c00634e52070d32b90cc4047076316c04`. Hosted job steps confirm both OIDC authentication and read-only lookup passed. The earlier exact failure cause is not proven.

## Proposed merge gate

- Target only `refs/heads/sprint-1-staging`.
- Require a PR, one approving review, a fresh approval after new pushes, resolved threads, and the passing `Build, test and Docker smoke` status check from GitHub Actions app `15368`.
- Require the PR to be up to date with staging; block force pushes and branch deletion; configure no standing bypass actors. Before activation, confirm two named people can edit repository rules for emergency recovery. Do not activate if that access is unavailable.
- Do not require the WIF push authentication workflow, which does not run on PRs.
- The JSON in `docs/labs/lab-05/wif-iam-merge-gates-ruleset.json` awaits yiiipunn's approval and administrator activation. Enforcement tests therefore remain pending.

## Verification and evidence

- Local WIF offline suite: 28 tests passed. Ruleset JSON, documentation links, screenshot integrity, redaction pixel bounds, and whitespace are checked before the local evidence commit. This PR has no Part B CI result until an authorized push.
- Verified existing PR CI context and app from [PR #36 head checks](https://github.com/gearstack-studio/kitloop/commit/d6dd68a803a70770f4dd11cac935757d4104bb52/checks); [run 43610143485](https://github.com/gearstack-studio/kitloop/actions/runs/43610143485) passed on PR A. This is not a Part B CI result.
- Current staging branch API reports no protection and no repository rulesets. No missing-approval, failing-check, or passing-eligibility demonstration has occurred after rule activation.
- The [eight-image IAM evidence inventory](evidence/iam/README.md) records source, verification status, and limitations. Evidence A contains a deterministic mask over only the personal email; seven other screenshots are byte-identical to their sources. No raw project policy JSON or credential material is included.
- See [IAM and merge-gate runbook](wif-iam-merge-gates.md) for the command list, evidence requirements, and follow-up actions. Record this PR's final head SHA and CI link after an authorized push.

## Remaining risks and reviewer checklist

- [x] Review authentic screenshots of the direct policy, project binding, one-permission role, key list, provider condition, and successful WIF run.
- [ ] Complete effective inherited-access analysis separately; approve any IAM remediation separately.
- [ ] Review the proposed ruleset target, check name and GitHub Actions source, strict mode, review behavior, and two-person emergency recovery plan.
- [ ] Obtain yiiipunn's explicit approval before any IAM or ruleset change; read back the applied settings afterward.
- [ ] Prove missing approval and failing CI block merge, then prove eligibility after a passing check and fresh approval.
- [x] Verify successful trusted WIF project lookup at staging SHA `c75cdf1c00634e52070d32b90cc4047076316c04` in attempt 3.
- [x] Audit the displayed live role and direct grants.
- [ ] Confirm the precise cause of attempts 1 and 2 if raw diagnostics become available; the sequence supports a missing read grant but does not prove it.
- [ ] Confirm this PR changes only Episode 6 Part B documentation and the unapplied ruleset proposal. Issue 7 deployment remains out of scope.
