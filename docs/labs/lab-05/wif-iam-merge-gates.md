# Episode 6 Part B — WIF IAM review and staging merge gates

Issue: [#35](https://github.com/gearstack-studio/kitloop/issues/35). PR A: [#36](https://github.com/gearstack-studio/kitloop/pull/36). Owner: yiiipunn. Reviewer: DEV4952.

## Evidence and current status (2026-11-14)

| Item | Verified observation | Limit |
| --- | --- | --- |
| Source | `feat/6-iam-merge-gate` is based on staging merge `c75cdf1c00634e52070d32b90cc4047076316c04`, which includes PR #36 head `d6dd68a803a70770f4dd11cac935757d4104bb52`. | Part B evidence and documentation changes are local until an authorized push. |
| GitHub identity | Repository ID `1442734708`; owner ID `351405823`, from the repository API. | Current IDs only; transfers require review. |
| PR CI context | `Build, test and Docker smoke`, GitHub Actions app ID `15368`, observed on [PR #36 head](https://github.com/gearstack-studio/kitloop/commit/d6dd68a803a70770f4dd11cac935757d4104bb52/checks). [Current-head CI](https://github.com/gearstack-studio/kitloop/actions/runs/43610143485) passed. | This is the sole proposed required PR check. |
| Existing staging rules | Branch API reports `protected: false`; repository rulesets list is empty. | No review or CI merge gate is applied yet. |
| Trusted WIF run | [Run 43611041165](https://github.com/gearstack-studio/kitloop/actions/runs/43611041165) tested staging SHA `c75cdf1c00634e52070d32b90cc4047076316c04`. Attempts [1](https://github.com/gearstack-studio/kitloop/actions/runs/43611041165/attempts/1) and [2](https://github.com/gearstack-studio/kitloop/actions/runs/43611041165/attempts/2) failed at project lookup. [Attempt 3](https://github.com/gearstack-studio/kitloop/actions/runs/43611041165/attempts/3) passed variable validation, auth, gcloud setup, and the read-only lookup. | The first two attempts hide the raw gcloud diagnostic. Attempt 3 proves the exercised path worked then; it does not identify the earlier error or audit the verifier's other permissions. |
| Negative probes | [Run 43610138984](https://github.com/gearstack-studio/kitloop/actions/runs/43610138984) passed feature-ref, wrong-audience, and missing-OIDC-permission probes at `d6dd68a`. | Denials do not establish positive authentication. |
| Local tests | `python -B -m unittest discover -s infra/gcp/wif -p 'test_*.py' -q`: 28 passed. | Offline mocks and policy model. |
| Live GCP IAM | Authentic Cloud Shell captures show the scoped WIF impersonation binding, verifier project custom-role binding, one-permission role, empty user-managed key listing, and active provider condition. The hosted attempt 3 proves an authenticated project lookup. | Effective inherited access is PARTIAL because Cloud Asset Policy Analyzer warned that its analysis was not fully explored. No full effective-IAM verdict follows from these captures. |

The [evidence inventory](evidence/iam/README.md) records each source and privacy check. Evidence A is an authentic screenshot with only the personal email masked; seven other PNGs are byte-identical to their sources. The table below links the actual files in this worktree.

| Evidence | Screenshot | Verified result | Limit |
| --- | --- | --- | --- |
| A | [WIF impersonation policy](evidence/iam/01-wif-impersonation-policy.png) | VERIFIED: `roles/iam.workloadIdentityUser` is bound to the repository-ID `1442734708` WIF principal set. | Direct service-account policy only; inherited impersonators are not excluded. |
| B | [Project IAM binding](evidence/iam/02-verifier-project-binding.png) | VERIFIED: the verifier has the project-level `kitloopWifProjectLookup` role. | Filtered output does not list all other grants. |
| C | [Custom role definition](evidence/iam/03-custom-role-permissions.png) | VERIFIED: the role includes only `resourcemanager.projects.get`. | Point-in-time role definition. |
| D | [User-managed keys](evidence/iam/04-user-managed-keys.png) | VERIFIED: the exact user-managed key-list command returned `[]`. | None found at inspection time; historical key absence is not proven. |
| E1 | [Project hierarchy](evidence/iam/05-project-hierarchy.png) | VERIFIED: project metadata did not report `parent`. | This does not prove inherited access is absent. |
| E2 | [Incomplete access analysis](evidence/iam/06-inherited-access-incomplete.png) | PARTIAL: Cloud Asset API was enabled and Policy Analyzer said the analysis was `NOT fully explored`. | Its empty result cannot establish no inherited grants. |
| Provider | [Live WIF provider condition](evidence/iam/07-wif-provider-trust-condition.png) | VERIFIED: active provider output shows issuer, repository and owner IDs, staging ref, event, workflow, and mappings. | Pool administration and all effective access remain outside this screenshot. |
| WIF | [Authentication attempt 3](evidence/iam/08-wif-authentication-success.png) | PASSED at `c75cdf1c00634e52070d32b90cc4047076316c04`. Hosted job steps confirm auth and read-only lookup. | Screenshot is a run summary; attempts 1 and 2 failed at lookup with suppressed raw diagnostic. |

## Trust and least-privilege contract

The reviewed code in [`wif.py`](../../../infra/gcp/wif/wif.py) requires GitHub issuer `https://token.actions.githubusercontent.com`, repository ID `1442734708`, owner ID `351405823`, `refs/heads/sprint-1-staging`, event `push` or `workflow_dispatch`, and the exact `wif-auth.yml` workflow ref. Its audience is the full provider resource name. The [live provider capture](evidence/iam/07-wif-provider-trust-condition.png) shows the expected issuer, identity attributes, staging ref, event, workflow restriction, mappings, and ACTIVE state for `projects/610347790049/locations/global/workloadIdentityPools/kitloop-github-verify/providers/github-oidc`. Pool administrator access and whether other providers exist still require separate review.

The verifier is `kitloop-wif-verifier@lab-5-cloud-deployment-514310.iam.gserviceaccount.com`. Its service-account policy should give only `roles/iam.workloadIdentityUser` to `principalSet://iam.googleapis.com/projects/610347790049/locations/global/workloadIdentityPools/kitloop-github-verify/attribute.repository_id/1442734708` for this integration. Other direct or inherited impersonators must be separately justified. The repository attribute alone is safe only while the pool contains this one restricted provider and pool administration is limited to trusted operators.

The verification job calls `gcloud projects describe lab-5-cloud-deployment-514310`. The resource API requires `resourcemanager.projects.get` on that project. [Evidence B](evidence/iam/02-verifier-project-binding.png) shows a project-level `kitloopWifProjectLookup` binding to the verifier; [Evidence C](evidence/iam/03-custom-role-permissions.png) shows that role has only the required permission. [Evidence A](evidence/iam/01-wif-impersonation-policy.png) shows the direct `roles/iam.workloadIdentityUser` binding for repository ID `1442734708`, and [Evidence D](evidence/iam/04-user-managed-keys.png) shows no user-managed keys at inspection time. The successful hosted lookup establishes effective access for that operation. **No further IAM grant is currently justified.** Do not add a duplicate grant or substitute project Viewer, Editor, Owner, deployment, build, Secret Manager, or service-account administration roles. Inspect project, folder, organization, group, and conditional grants before claiming complete effective access. Do not download or print key material or access tokens.

`wif.py verify` checks that the intended impersonation binding exists. It does not prove that broad bindings or inherited grants are absent. It also does not audit project resource roles or keys. Therefore its three `true` fields are a setup check, not a least-privilege verdict.

## Read-only GCP inventory for an authorized operator

Run from a trusted, reviewed environment with an authenticated operator. These commands inspect configuration only. Keep raw policies local because they can contain other principal identities; publish sanitized findings and command status, never tokens or credentials.

```bash
PROJECT=lab-5-cloud-deployment-514310
POOL=kitloop-github-verify
PROVIDER=github-oidc
SA=kitloop-wif-verifier@lab-5-cloud-deployment-514310.iam.gserviceaccount.com

gcloud projects describe "$PROJECT" --project="$PROJECT" --format='json(projectId,projectNumber,lifecycleState)'
gcloud iam workload-identity-pools describe "$POOL" --project="$PROJECT" --location=global --format=json
gcloud iam workload-identity-pools providers list --project="$PROJECT" --location=global --workload-identity-pool="$POOL" --show-deleted --format=json
gcloud iam workload-identity-pools providers describe "$PROVIDER" --project="$PROJECT" --location=global --workload-identity-pool="$POOL" --format=json
gcloud iam service-accounts describe "$SA" --project="$PROJECT" --format='json(email,disabled,uniqueId)'
gcloud iam service-accounts get-iam-policy "$SA" --project="$PROJECT" --format=json
gcloud projects get-iam-policy "$PROJECT" --format=json
gcloud iam roles describe kitloopWifProjectLookup --project="$PROJECT" --format='json(name,includedPermissions,stage)'
gcloud iam service-accounts keys list --iam-account="$SA" --project="$PROJECT" --managed-by=user --format='json(name,disabled,validAfterTime,validBeforeTime)'
```

For each project role granted to the verifier, describe the role to inspect its included permissions. Review effective inherited access in Cloud Console **Service account → Principals with access** or an authorized IAM Policy Analyzer query; a project policy alone cannot rule out parent grants. Separate the verifier's *resource permissions* from principals allowed to *impersonate it*. Record whether the user-managed key list is empty. A failed inventory call is **unknown**, not evidence that a grant or key is absent. Compare the live provider JSON with the code's issuer, audience, mappings, condition, state, and one-provider pool rule. If any setting differs, stop and propose a specific remediation; do not run `wif.py apply` as part of this review.

[Project metadata](evidence/iam/05-project-hierarchy.png) did not report a `parent` field. The [Cloud Asset Policy Analyzer capture](evidence/iam/06-inherited-access-incomplete.png) shows Cloud Asset API enablement and an explicit `NOT fully explored` warning. **Evidence E is PARTIAL:** the absent `parent` field and displayed empty analysis do not establish that parent, group, conditional, or other inherited access is absent. The analyzer’s unexplored scope still requires follow-up before a complete effective-IAM claim.

The first two staging attempts completed the variable, auth-action, and gcloud setup steps but failed at `gcloud projects describe`. The auth action wrote a credentials file; actual token exchange and impersonation may occur later when gcloud uses it. Attempt 3 passed the same lookup at the same SHA after the operator reported adding a project-level custom role containing `resourcemanager.projects.get`. This sequence strongly supports a missing project-read grant as the earlier cause, but the wrapper suppressed the raw gcloud error and no before/after IAM policies were independently inspected. It cannot conclusively exclude a transient or another configuration change. At attempt 3, the successful read proves token exchange, impersonation, project identity, and effective lookup permission worked for that run. No additional IAM change is justified by the current hosted result; first inspect the live role and effective access. Any further IAM fix, API enablement, provider change, or workflow change requires separate approval.

## Proposed GitHub staging ruleset

[`wif-iam-merge-gates-ruleset.json`](wif-iam-merge-gates-ruleset.json) is an **unapplied proposal** for `sprint-1-staging`. It requires a PR, one approving review, approval after the latest push, dismissal of stale approvals, resolved review threads, and the exact `Build, test and Docker smoke` check from GitHub Actions app `15368`. Strict mode requires the PR to be tested against the latest base. Pending, missing, and failing required checks block merge. The rule also blocks force pushes and deletion. It has no standing bypass actors, including for administrators. This prevents a routine bypass of failing CI. It also means a CI outage can block all ordinary merges. Before activation, confirm **two named people** can edit repository rules; record a tested recovery owner and alternate. In an incident, an authorized rules administrator can change the ruleset after a second maintainer reviews the reason, then restore and re-verify it. If two recovery administrators cannot be confirmed, do not activate this payload; propose a narrowly named emergency actor with `pull_request`-only bypass for separate approval. Do not use an `always` or `exempt` bypass. A one-approval gate also relies on the reviewer inspecting proposed changes to the CI workflow itself.

Do **not** require `Verify keyless GCP authentication`: `wif-auth.yml` runs on staging `push` or dispatch, not on PRs. Requiring it for PRs would leave every PR without a satisfiable check. Do not require the feature-branch negative probes either.

After yiiipunn explicitly approves the exact JSON, a repository administrator can create it in **Settings → Rules → Rulesets**, target branch `sprint-1-staging`, and review every field before activation. Alternatively, an authorized operator can submit the JSON to the GitHub repository rulesets API. Do not activate both a branch-protection rule and an equivalent ruleset without checking their combined effect. Capture the returned ruleset ID and active settings. No rule has been created by this PR preparation.

## Verification plan after approval and activation

1. Read back the active ruleset and branch rules for `sprint-1-staging`; confirm target, one review, stale/last-push behavior, exact check context and expected GitHub Actions source, strict mode, and bypass list. Capture a sanitized settings screenshot or API excerpt and URL.
2. On a normal test PR targeting staging, confirm **no approval** blocks merge while CI succeeds. Record the PR and check links. Obtain DEV4952's approval; do not self-approve.
3. Add a new reviewable commit to that PR and confirm the old approval is dismissed or the latest push needs re-approval. Capture the merge-box reason.
4. On a separate disposable test PR or reversible test commit, make `Build, test and Docker smoke` fail. Confirm the required check blocks merge. Restore the test branch, wait for a passing run, and confirm merge eligibility after fresh approval. No test PR or failing commit has been created yet.
5. Confirm direct pushes, force pushes, and branch deletion are blocked for ordinary writers; audit any authorized recovery action. Do not attempt destructive probes on staging itself.
6. Preserve [attempt 3](https://github.com/gearstack-studio/kitloop/actions/runs/43611041165/attempts/3) as the successful trusted run at `c75cdf1c00634e52070d32b90cc4047076316c04`. After any later IAM or provider change, rerun on a trusted staging ref and record the new run URL, `GITHUB_SHA`, auth step, and matching active project lookup. A passing auth action step alone is insufficient.

## Approval and follow-up boundaries

**Requires yiiipunn's explicit approval:** any verifier role or binding change, API/provider/pool change, creation or activation of the GitHub ruleset, and any bypass actor. This document and the JSON only prepare those actions.

**Still open:** complete effective-access analysis for E; pool administration and other-provider review; the precise cause of failed [attempts 1 and 2](https://github.com/gearstack-studio/kitloop/actions/runs/43611041165); recovery-administrator confirmation; ruleset activation and readback; blocked-merge demonstrations. The trusted project lookup passed in attempt 3, but Issue #35 remains incomplete. Issue 7 automatic deployment is outside scope.

## Issue #35 status update to post

The connected GitHub integration returned `403 Resource not accessible by integration` when asked to edit Issue #35, so the issue remains unchanged. An account with issue-write access can post this verified status:

> Part B progress (2026-11-14): I reviewed merged PR #36 and confirmed `Build, test and Docker smoke` is the PR check from GitHub Actions app `15368`. Authentic screenshots now verify the direct WIF impersonation binding, project custom-role grant, one-permission role, empty user-managed key listing at inspection time, and active provider condition. [Attempt 3](https://github.com/gearstack-studio/kitloop/actions/runs/43611041165/attempts/3) passed the authenticated project lookup at `c75cdf1c00634e52070d32b90cc4047076316c04`; attempts 1 and 2 failed at lookup with no raw gcloud diagnostic. Cloud Asset Policy Analyzer warned its analysis was not fully explored, so inherited access remains PARTIAL. The screenshot inventory and unapplied ruleset proposal are local on `feat/6-iam-merge-gate`. No additional IAM grant is justified by the passing lookup. The merge gate is not enforced; recovery access and blocked-merge tests remain pending.

The Issue #35 checklist can now mark the direct IAM role and scope review, WIF impersonation binding, actual CI check name, and sanitized screenshots as reviewable evidence. Leave complete effective-access, live merge-gate configuration, bypass recovery, and blocked-merge demonstrations open. Issue #35 remains open.

## References

- [GitHub ruleset API](https://docs.github.com/en/rest/repos/rules)
- [GitHub available rules and status-check behavior](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
- [Google project get permission](https://docs.cloud.google.com/resource-manager/reference/rest/v3/projects/get)
- [Google service-account effective access](https://docs.cloud.google.com/iam/docs/manage-access-service-accounts)
- [Google user-managed key inventory](https://docs.cloud.google.com/iam/docs/keys-list-get)
