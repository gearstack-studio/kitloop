# Episode 7 security review evidence

> **Status note (16 November 2026):** This is the 15 November inspection. Later records supersede several rows: the [security restoration](https://github.com/gearstack-studio/kitloop/issues/38#issuecomment-6895828916) set the environment to main-only with admin bypass disabled, and the [release record](https://github.com/gearstack-studio/kitloop/issues/38#issuecomment-6896493578) completes the deployment, digest and revision items in the checklist below. The staging ruleset now enforces its review rule again, [restored on 16 November](evidence/merge-gate/README.md#staging-ruleset-restoration); see the [Lab 5 evidence index](README.md).

The Organization Policy prerequisite below is historical. The standalone-project investigation proposes a [revised Cloud Build IAM approach](episode-7-standalone-build.md), requiring new explicit DEV4952 security review and separate execution authorization. It has not been approved or applied.

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

## Initial cloud inspection blocker (resolved)

The terminal has the correct project configured but `gcloud auth list --filter=status:ACTIVE --format='value(account)'` returns no account. A provider describe fails with `You do not currently have an active account selected`, including outside the restricted sandbox. No cloud mutation was attempted.

The operator subsequently completed browserless login as `yiiipunn@gmail.com`. The follow-up inventory below supersedes the initial authentication blocker. Operator reads do not prove the deployment identity's effective access or a GitHub OIDC exchange.

The permission contract and exact proposed WIF condition remain in [the deployment document](episode-7-deployment.md#required-setup-before-enabling). No cloud policies or IAM grants were changed during inspection.

## Authenticated cloud inventory

- WIF pool has one active provider, `github-oidc`. Its mapping and all six condition clauses match the deployment document. `oidc.allowedAudiences` is absent; configure the workflow's exact provider audience explicitly before activation. The observed condition does not test protected-ref state; the GitHub guard and branch protection provide that check.
- Deployment account IAM has exactly the repository-ID principal-set `roles/iam.workloadIdentityUser` binding and a self-only `roles/iam.serviceAccountOpenIdTokenCreator` binding.
- Project-level deployment binding is only `kitloopDeployPreflight`, containing `cloudsql.instances.get`, `cloudsql.backupRuns.list`, `resourcemanager.projects.get`, and `serviceusage.services.use`. Cloud Build create/get are missing.
- Deployment account has `roles/iam.serviceAccountUser` on each of `kitloop-build`, `kitloop-run`, and `kitloop-migrate`; source bucket `roles/storage.objectCreator` and `roles/storage.bucketViewer`; registry `roles/artifactregistry.reader`; service `roles/run.developer` and `roles/run.invoker`; migration job `roles/run.developer`.
- Build identity has registry Writer, source bucket Object Viewer, and project Log Writer. Runtime and migration accounts have Cloud SQL Client. No deployment Secret Accessor, Owner, Editor or broad Token Creator project binding was observed.
- Both effective `cloudbuild.useBuildServiceAccount` and `cloudbuild.useComputeServiceAccount` report `enforce: true`. `cloudbuild.disableCreateDefaultServiceAccount` also reports `enforce: true`. The default-build-account lookup returns `610347790049-compute@developer.gserviceaccount.com`.
- Legacy build account retains project Builder; Compute default account retains project Editor and has no resource-level IAM bindings. Do not remove these grants. The regional build-trigger list is empty; no organization/folder ancestors were returned by `projects get-ancestors`.
- Cloud SQL `kitloop-pg` is RUNNABLE, backups enabled, bootstrap label `kitloop-bootstrap-b8j7r`. Successful on-demand backup `1794732111059` completed at `2026-11-15T08:43:12.278Z`. Recheck freshness at actual migration approval.
- Existing successful build `a0a924d6-e851-42d8-91da-bb65f4d22506` used the dedicated build account. App digest: `sha256:132e2d25ebab34c3270ea45b7cc42a4fc5c836261d50a3e015980dc74b97c304`; migration digest: `sha256:b7263293837d4d91574587f3fc9bbf9655f778987d788bd2084aff5c4d97d241`.
- Existing migration execution `kitloop-migrate-bdb9v` has one success and completion time `2026-11-15T07:51:05.917888Z`, using that migration digest.
- Existing serving revision `kitloop-284f41973f61-20261115090539` is Ready, receives 100%, uses `kitloop-run` and matches the original app digest. Source association is based on the revision name, tag and existing build evidence; no new automated source-provenance claim is made.
- `bash infra/gcp/verify.sh public` and `private` both passed `/`, `/api/health`, and `/api/ready` with HTTP 200 at `https://kitloop-610347790049.asia-southeast1.run.app`. Private mode sent an operator ID token to the already-public service; this does not prove deployment-SA authorization or rejection of unauthenticated traffic.

Policy Troubleshooter could not evaluate effective deployment access because its API is disabled. It was not enabled. Bucket upload/source staging, deployment-SA permission checks, live WIF exchange, Run operations access, and new production execution remain pending.

## Exact proposed security changes (not applied)

1. Set project policies `cloudbuild.useBuildServiceAccount` and `cloudbuild.useComputeServiceAccount` to `spec.rules: [{enforce: false}]`; preserve `disableCreateDefaultServiceAccount=true`. Google documents this pair as the user-specified-account-only configuration. This restricts default build execution, rather than removing Compute permissions. Review any non-regional or external callers before applying. [Cloud Build policy documentation](https://docs.cloud.google.com/build/docs/cloud-build-service-account-updates).
2. Add only `cloudbuild.builds.create`, `cloudbuild.builds.get`, `run.services.list`, and `run.operations.get` to the existing project custom role, preserving its four permissions. Build create/get submit and poll the dedicated-account build. The existing `service_exists` helper lists services at project scope; Run operation polling needs project-level operation reads. Preserve existing resource-scoped service/revision/job/execution grants. Do not add build update/list, log viewer, storage admin, or service-account token creation. Apply the build grant only after verifying the default-identity restriction and named-account actAs boundary. [Cloud Build permission warning](https://docs.cloud.google.com/build/docs/iam-roles-permissions).
3. Set WIF provider `oidc.allowedAudiences` to the single string `projects/610347790049/locations/global/workloadIdentityPools/kitloop-github-deploy/providers/github-oidc`; preserve the exact current issuer, mappings and condition.
4. Apply the existing [staging ruleset proposal](wif-iam-merge-gates-ruleset.json), with zero bypass actors, one fresh approving review, last-push approval, conversation resolution, strict required CI, no deletion and no force push. Keep main protection unchanged. Confirm two authorized maintainers can manage repository rules.
5. Update `lab5-production` preserving reviewer ID `119601503` (DEV4952) and `prevent_self_review=true`; set `can_admins_bypass=false`, `deployment_branch_policy={protected_branches:false,custom_branch_policies:true}`, and add only branch policy `{name:"main",type:"branch"}`.
6. After the verified security setup and non-destructive checks, set the provider/account repository variables above and explicitly set `LAB5_DEPLOY_ENABLED=false`. Enabling `true` is a separate production approval decision.

The stable `gcloud builds submit` path with `CLOUD_LOGGING_ONLY` polls builds without streaming Cloud Logging. Local SDK inspection (`submit_util.Build` and `logs.CloudBuildClient.Stream`) supports create/get without granting log read access or operation reads for Cloud Build. Its existing explicit `--service-account` must stay in place. No test build was submitted to prove those permissions. Cloud Run operation/revision permissions must still be verified as the deployment identity before activation.

## Local verification

Observed on the checked-out main source before this documentation change:

- Shell syntax checks passed for `infra/gcp/*.sh`, `infra/gcp/deploy/*.sh`, and `.github/scripts/*.sh`.
- `bash infra/gcp/deploy/guard.test.sh`: passed 16 offline deployment guard cases.
- `bash infra/gcp/guards.test.sh`: passed all release guards, including failed migration/candidate rejection, ID-token handling, unchanged traffic on candidate failure, and simulated rollback.
- `python3 -B -m unittest discover -s infra/gcp/wif -p 'test_*.py' -v`: 28 tests passed.
- `actionlint` is unavailable locally; no local actionlint pass is claimed.

These mocked checks do not establish live WIF rejection, a successful production migration, or a live rollback exercise.

[PR #44 CI run 43705450671](https://github.com/gearstack-studio/kitloop/actions/runs/43705450671) passed the full `Build, test and Docker smoke` check on the initial evidence commit `1c569fe`. Follow-up documentation commits require their own current-head CI result.

## Approval and completion checklist

- [x] Restore authenticated GCP access in the execution terminal; collect sanitized live configuration.
- [x] Attach exact current/proposed resource-scoped IAM deltas and effective Organization Policies for review.
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
