# Episode 7: proposed main release deployment

**Lab 5 issue register:** [E1 #24](https://github.com/gearstack-studio/kitloop/issues/24) · [E2 #25](https://github.com/gearstack-studio/kitloop/issues/25) · [E3 #27](https://github.com/gearstack-studio/kitloop/issues/27) · [E4 #29](https://github.com/gearstack-studio/kitloop/issues/29) · [E5 #31](https://github.com/gearstack-studio/kitloop/issues/31) · [E6 #34](https://github.com/gearstack-studio/kitloop/issues/34), [#35](https://github.com/gearstack-studio/kitloop/issues/35) · [E7 #38](https://github.com/gearstack-studio/kitloop/issues/38) · [E8 pending](episode-8-issue.md) (local draft, no GitHub issue). [Current status](README.md#episode-issue-register).

Issue [#38](https://github.com/gearstack-studio/kitloop/issues/38) tracks this work. This is repository preparation only. The workflow is **not activated or verified against GCP**. The CPE 334 Lab 5 updated handout requires a reviewed change through staging, a release pull request from staging into main, and deployment **only from main** (R-07 to R-10, Sections 7 and 9). Its separate Student Guide V1.1 is not available locally. A read-only GitHub branch query on 15 November 2026 showed both `main` and `sprint-1-staging` as unprotected; the required merge gate is not enforced.

The [Lab 5 evidence index](README.md) tracks checks C-01 through C-06 and separates verified runs from missing live release evidence.

## Release path

`.github/workflows/deploy.yml` runs only on a push to `main`, after a reviewed feature PR into staging and a reviewed release PR from staging into main. It calls the existing `pull-request-ci.yml` build and test job again on the merged main commit. The deployment job additionally requires `github.ref_protected == true`, repository variable `LAB5_DEPLOY_ENABLED=true`, and approval through the `lab5-production` GitHub Environment. The variable must remain absent or false until the environment, branch rules, GCP identity and live prerequisites have been reviewed. Fork pull requests and staging pushes cannot invoke this deployment job. The required PR check context is `Build, test and Docker smoke`; do not require this push-only deployment workflow as a PR check.

The trusted-job guard checks the numeric GitHub repository and owner IDs, push event, exact main ref and workflow ref, protected-ref signal, source SHA, clean checkout, and current remote branch. The existing `release.sh` is reused for build, migration, deploy and rollback. Its bootstrap and public publish actions stay interactive. A read-only preflight requires the existing Episode 5 registry, source bucket, migration job, Cloud SQL instance with backups and bootstrap label, a successful backup, and one safe serving Cloud Run revision. This means the first release and bootstrap remain manual.

The release builds both images from the pushed SHA, resolves immutable digests, runs the migration job with zero retries, deploys a candidate with no traffic, checks its health and readiness, then routes traffic. A failed deployment or final verification invokes the existing rollback command for the previously serving revision. The run summary records the SHA, digests when available, serving revision and step outcomes. Rollback changes traffic; it does **not** undo a migration. Review migration backward compatibility and backup freshness at approval time. A post-migration failure may need database repair by an operator.

## Required setup before enabling

1. Follow the updated Lab 5 handout: reviewed feature PR into staging, reviewed release PR into main, required passing CI on main, and C-06 evidence linking the running revision to the main commit. Confirm any additional Student Guide details before activation.
2. Establish and verify main rules: PR required, at least one fresh approving review, `Build, test and Docker smoke` required and passing, bypass limited to an emergency recovery path. The proposed staging ruleset from Issue #35 also needs separate approval so feature changes cannot bypass review. Confirm **two authorized maintainers can edit repository rules** before activation.
3. Configure `lab5-production` with required reviewer DEV4952, prevent self-review, and allow only `main`. Confirm the environment cannot be bypassed by the workflow actor. A missing environment may be created without protection by GitHub; inspect it before setting the enable variable.
4. Provision a **separate** `kitloop-wif-deploy@lab-5-cloud-deployment-514310.iam.gserviceaccount.com` identity and a dedicated `kitloop-github-deploy` WIF pool/provider, after explicit approval and read-only IAM inventory. Never grant deployment roles to the Episode 6 verifier service account. Set `LAB5_DEPLOY_WIF_PROVIDER` to its full provider resource name and `LAB5_DEPLOY_SERVICE_ACCOUNT` to that exact account. Map `google.subject=assertion.sub` and `attribute.repository_id=assertion.repository_id`. The provider condition below must be reviewed against the actual GitHub OIDC token claims and then applied exactly. Restrict its audience to its own provider resource name. Bind `roles/iam.workloadIdentityUser` only to `principalSet://iam.googleapis.com/projects/610347790049/locations/global/workloadIdentityPools/kitloop-github-deploy/attribute.repository_id/1442734708` on the deployment account. Audit the entire pool for other providers and bindings.

   ```text
   assertion.repository_id == '1442734708' &&
   assertion.repository_owner_id == '351405823' &&
   assertion.ref == 'refs/heads/main' &&
   assertion.event_name == 'push' &&
   assertion.workflow_ref == 'gearstack-studio/kitloop/.github/workflows/deploy.yml@refs/heads/main' &&
   assertion.environment == 'lab5-production'
   ```
5. Scope GCP grants to the named resources. The deploy account needs project lookup, Cloud Build submission/read, upload to the dedicated build-source bucket, Artifact Registry image lookup, Cloud SQL instance/backup read for preflight, Cloud Run service/revision read and update, migration job deploy/execute/read, and service-account actAs on the dedicated build, runtime and migration accounts. It also needs Cloud Run Invoker on the service for authenticated candidate/private checks and ID-token minting through WIF impersonation. Define a custom role for project-scoped API methods where resource IAM is unavailable; use resource-level roles on the repository, bucket, service, job and service accounts where supported. Check actual permissions and inherited grants before applying. `cloudbuild.builds.create` can permit execution as a privileged legacy build identity; audit or disable that path before granting it. Do not give the deploy account Owner, Editor, Secret Accessor, bootstrap identity access, broad service account token creation, or key material. The build identity keeps repository write and logging permissions; runtime/migration identities keep their existing narrow Cloud SQL and secret access. Cloud Build and Cloud Run API permission details require a live preflight and a reviewed grant proposal; this document is a permission contract, not evidence of applied grants.
6. Confirm the Episode 5 first release, bootstrap record, Cloud SQL backup, service, source bucket and registry exist. Review costs and quotas. Only after these checks and explicit approval, set `LAB5_DEPLOY_ENABLED=true`. Keep it false for this PR.

| Component | Proposed minimum for the deployment identity | Scope and check |
| --- | --- | --- |
| Cloud Build | `cloudbuild.builds.create`, `cloudbuild.builds.get`, `iam.serviceAccounts.actAs` on `kitloop-build` | Project build API, named build account; audit the legacy build identity before granting. |
| Source bucket | `storage.buckets.get`, `storage.objects.create` for submitted source | Dedicated `lab-5-cloud-deployment-514310-kitloop-build-source` bucket only. |
| Artifact Registry | `roles/artifactregistry.reader` | `kitloop` repository only; the build account keeps Writer. |
| Cloud Run | `roles/run.developer` on the existing service and migration job, `roles/run.invoker` on the service, `iam.serviceAccounts.actAs` on `kitloop-run` and `kitloop-migrate` | Review exact service/job IAM support and required `run.services.getIamPolicy`, revisions and operations access in a live dry run. |
| Cloud SQL | `cloudsql.instances.get`, `cloudsql.backupRuns.list` | Read only; use a narrow custom project role if resource IAM cannot express the scope. |
| Secret Manager | No secret payload access for the deploy identity | Only runtime and migration accounts may access their named versions. Verify Cloud Run revision secret references without printing values. |
| Project lookup | `resourcemanager.projects.get` | Lab project only; needed for canonical Cloud Run URL. |

## Validation and evidence

Offline checks: `bash -n` for new and existing shell scripts, `bash infra/gcp/deploy/guard.test.sh`, `bash infra/gcp/guards.test.sh`, WIF unit tests, actionlint, YAML parse, and `git diff --check`. CI on the PR must pass before merge. No local test proves live WIF, IAM, environment approval, Cloud Build, migration, Cloud Run health, or rollback.

Collect actual redacted run links or screenshots for the feature PR into staging, release PR into main, required CI result on main, environment approval, WIF authentication, Cloud Build ID/status, both image digests, migration execution, Cloud Run candidate/serving revision, HTTP readiness, and rollback exercise. Record the exact main source SHA and show that the serving revision matches it (C-06). Never commit tokens, external-account credential files, database URLs, secret values, or job descriptions containing secret references. Mark absent live evidence **MISSING**, not passed.

To stop deployments, unset or set `LAB5_DEPLOY_ENABLED=false`; then inspect any running release before changing traffic. A failed or stale workflow is not a substitute for the existing manual rollback runbook in [Episode 5](../../../infra/gcp/README.md).
