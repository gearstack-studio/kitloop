# Episode 7 security review evidence

Read-only inspection on 2026-11-15 for [Issue #38](https://github.com/gearstack-studio/kitloop/issues/38). This report records observed settings, not approval to activate production automation.

## Verified GitHub state

| Control | Observed state | Remaining work |
| --- | --- | --- |
| Main protection | Strict `Build, test and Docker smoke` check; one approving review; stale reviews dismissed; code-owner review; administrators subject to protection; force pushes and deletions disabled | Preserve |
| Staging protection | Branch protection API returns `Branch not protected`; repository rulesets API returns `[]` | Review and apply staging merge gates |
| Production reviewer | `DEV4952`, self-review prevented | Preserve |
| Environment bypass | `can_admins_bypass=true` | Review disabling administrator bypass |
| Deployment branches | All protected branches allowed; custom branch policies disabled | Review explicit main-only policy |
| Deployment variables | All three `LAB5_DEPLOY_*` repository variables absent | Verify cloud configuration before setting provider/account; keep gate disabled |

The existing verifier variables refer to the separate `kitloop-github-verify` provider and `kitloop-wif-verifier` account. They must not be repurposed for deployment.

Proposed deployment values, **not configured or cloud-verified in this inspection**:

```text
LAB5_DEPLOY_WIF_PROVIDER=projects/610347790049/locations/global/workloadIdentityPools/kitloop-github-deploy/providers/github-oidc
LAB5_DEPLOY_SERVICE_ACCOUNT=kitloop-wif-deploy@lab-5-cloud-deployment-514310.iam.gserviceaccount.com
LAB5_DEPLOY_ENABLED=false
```

[PR #39](https://github.com/gearstack-studio/kitloop/pull/39) was approved by DEV4952 and merged into staging. [PR #42](https://github.com/gearstack-studio/kitloop/pull/42) was approved by DEV4952 and merged into main. Their reviews explicitly leave live cloud verification outstanding.

[Main run 43687921737](https://github.com/gearstack-studio/kitloop/actions/runs/43687921737), source `284f41973f61a02e82d38bc9f425712ecd4e4afc`, passed the reusable CI job, including integration tests, frontend tests, Docker checks and isolated production runtime/restart checks. **The production release job was skipped. This is not deployment or production persistence evidence.**

## Cloud inspection blocked

The terminal has the correct project configured but `gcloud auth list --filter=status:ACTIVE --format='value(account)'` returns no account. A provider describe fails with `You do not currently have an active account selected`, including outside the restricted sandbox. No cloud mutation was attempted.

Consequently, current WIF trust/audience/pool bindings, IAM roles, effective Organization Policies, build identity privileges, source bucket access, database backups/readiness, registry access, and Run service/job/revision permissions remain **UNVERIFIED**. Previously reported cloud setup is not substituted for live evidence.

The permission contract and exact proposed WIF condition remain in [the deployment document](episode-7-deployment.md#required-setup-before-enabling). Before proposing a Cloud Build grant, inspect both effective default-identity policies and the legacy/default identities' effective permissions. Do not change policies or remove the Compute account's Editor grant based on this report. No exact IAM delta can be approved safely until the current role definitions and bindings are available.

## Local verification

Observed on the checked-out main source before this documentation change:

- Shell syntax checks passed for `infra/gcp/*.sh`, `infra/gcp/deploy/*.sh`, and `.github/scripts/*.sh`.
- `bash infra/gcp/deploy/guard.test.sh`: passed 16 offline deployment guard cases.
- `bash infra/gcp/guards.test.sh`: passed all release guards, including failed migration/candidate rejection, ID-token handling, unchanged traffic on candidate failure, and simulated rollback.
- `python3 -B -m unittest discover -s infra/gcp/wif -p 'test_*.py' -v`: 28 tests passed.
- `actionlint` is unavailable locally; no local actionlint pass is claimed.

These mocked checks do not establish live WIF rejection, a successful production migration, or a live rollback exercise.

## Approval and completion checklist

- [ ] Restore authenticated GCP access in the execution terminal; collect sanitized live configuration.
- [ ] Attach exact current/proposed resource-scoped IAM deltas and effective Organization Policies for review.
- [ ] Obtain approval for security configuration changes; preserve all existing production data and runtime secrets.
- [ ] Enforce staging gates and main-only, non-bypassable production review protection.
- [ ] Pass non-destructive deployment-identity preflight and review migration compatibility/backup freshness.
- [ ] Obtain explicit approval for production build, migration, deployment/traffic promotion and any rollback operation, then enable the gate.
- [ ] Run an authorized main-push deployment with actual DEV4952 environment approval.
- [ ] Record build ID/status, both immutable digests, migration execution, serving revision/source SHA, and public/private health results.
- [ ] Run Issue #40's existing after-redeploy verifier against its original fingerprint and database identity.

Issue #38 remains open. No production build, migration, deployment, traffic change, rollback, or synthetic-record modification occurred during this inspection. Issue #40 and draft PR #41 remain untouched; after-redeploy persistence is pending.

## Reproduce the GitHub inspection

```bash
gh api repos/gearstack-studio/kitloop/branches/main/protection
gh api repos/gearstack-studio/kitloop/branches/sprint-1-staging/protection
gh api repos/gearstack-studio/kitloop/rulesets
gh api repos/gearstack-studio/kitloop/environments/lab5-production
gh variable list --repo gearstack-studio/kitloop
gh run view 43687921737 --repo gearstack-studio/kitloop --json url,headSha,jobs
gh pr view 39 --repo gearstack-studio/kitloop --json url,baseRefName,mergedAt,reviews
gh pr view 42 --repo gearstack-studio/kitloop --json url,baseRefName,mergedAt,reviews
```
