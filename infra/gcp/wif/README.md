# Episode 6 — GitHub OIDC and Workload Identity Federation

PR A belongs to [issue #34](https://github.com/gearstack-studio/kitloop/issues/34), owned by DEV4952 and reviewed by yiiipunn. [Issue #35](https://github.com/gearstack-studio/kitloop/issues/35) owns the final IAM permission review and merge gates. Episode 5 tooling is available through staging merge `ed80306`.

## Identity and trust contract

GitHub's OIDC issuer signs a job token. Google Security Token Service validates it against the dedicated WIF provider. IAM permits the accepted repository identity to impersonate a dedicated verification service account. The workflow then reads the lab project's identity with `gcloud projects describe`. Credentials are short-lived and the official auth action removes its temporary credential file during post-job cleanup.

| Boundary | Reviewed value |
| --- | --- |
| GCP project | `lab-5-cloud-deployment-514310` |
| Resource location | WIF pools/providers are `global`; Episode 5 runtime remains `asia-southeast1` |
| Issuer | `https://token.actions.githubusercontent.com` |
| Repository ID | `1442734708` |
| Repository owner ID | `351405823` |
| Trusted ref | `refs/heads/sprint-1-staging` |
| Trusted events | `push`, `workflow_dispatch` |
| Workflow claim | `gearstack-studio/kitloop/.github/workflows/wif-auth.yml@refs/heads/sprint-1-staging` |
| OIDC audience | Exact full provider resource name, including numeric project number |
| Impersonation role | `roles/iam.workloadIdentityUser` on the verification service account only |
| Resource permission needed by verifier | `resourcemanager.projects.get` on the lab project |

Numeric GitHub IDs were read from `GET https://api.github.com/repos/gearstack-studio/kitloop` on 2026-11-14. Recheck them during setup. A repository rename/transfer requires deliberate review of the IDs and workflow claim.

The generated attribute mappings are:

```text
google.subject=assertion.sub
attribute.repository_id=assertion.repository_id
attribute.repository_owner_id=assertion.repository_owner_id
attribute.ref=assertion.ref
attribute.event_name=assertion.event_name
attribute.workflow_ref=assertion.workflow_ref
```

The provider applies this CEL condition, independent of a job-level GitHub `if`:

```text
assertion.repository_id == '1442734708' &&
assertion.repository_owner_id == '351405823' &&
assertion.ref == 'refs/heads/sprint-1-staging' &&
assertion.event_name in ['push', 'workflow_dispatch'] &&
assertion.workflow_ref == 'gearstack-studio/kitloop/.github/workflows/wif-auth.yml@refs/heads/sprint-1-staging'
```

The service account binding uses `principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/attribute.repository_id/1442734708`. Use a dedicated pool containing only this provider. Another provider in the same pool could map the repository attribute to an accepted value. Preflight rejects additional providers, including deleted resources requiring operator inspection. Limit pool administration to trusted operators.

The subject is mapped without assuming its default format. Explicit repository, branch, event and workflow claims enforce the boundary even if a GitHub environment changes the subject. Current workflow execution uses no GitHub environment. A change to reusable workflows or environment protection requires a new claim review.

## Setup after explicit cloud authorization

Requirements are Python 3.10+, current gcloud, an authenticated operator, and the checked-out reviewed code. `plan` is offline. `preflight` and `verify` make read-only GCP calls. Only `apply` mutates the pool, provider and service account impersonation policy, after a typed interactive confirmation. The scripts contain no project-role grant or automatic deployment.

1. Have yiiipunn review the service account and operator permissions in #35. Choose a **new dedicated** service account with an ID starting `kitloop-wif-`. A proposed ID is `kitloop-wif-verifier`; its existence has not been verified. The operator creates it after authorization. Give it a project custom role containing only `resourcemanager.projects.get`. Inspect direct, inherited, group and conditional grants. Avoid reusing the Episode 5 run, build, migrate or bootstrap accounts.
2. The setup operator needs WIF pool/provider list, create and get permissions (typically `roles/iam.workloadIdentityPoolAdmin`), project/service inventory read access, service account get/getIamPolicy/setIamPolicy on the dedicated account, and authenticated access to the project. API activation needs `serviceusage.services.enable`. Creating the verifier/custom role/project binding is a separate IAM operation reviewed in #35. Retain setup permissions only as required for administration.
3. After approval, enable `iam.googleapis.com`, `iamcredentials.googleapis.com`, `sts.googleapis.com`, and `cloudresourcemanager.googleapis.com`. Record the API status. Creating roles, enabling APIs, creating identities and applying WIF all require cloud authorization.
4. In Cloud Shell, select the project and obtain its actual project number. Choose dedicated pool/provider IDs, then substitute the reviewed values below. The example pool/provider IDs are proposed names, not discovered resources.

```bash
gcloud config set project lab-5-cloud-deployment-514310
PROJECT_NUMBER="$(gcloud projects describe lab-5-cloud-deployment-514310 \
  --project=lab-5-cloud-deployment-514310 --format='value(projectNumber)')"
POOL_ID=kitloop-github-verify
PROVIDER_ID=github-oidc
VERIFIER_SA=kitloop-wif-verifier@lab-5-cloud-deployment-514310.iam.gserviceaccount.com

python3 -B infra/gcp/wif/wif.py plan --project-number "$PROJECT_NUMBER" \
  --pool "$POOL_ID" --provider "$PROVIDER_ID" --service-account "$VERIFIER_SA"
python3 -B infra/gcp/wif/wif.py preflight --project-number "$PROJECT_NUMBER" \
  --pool "$POOL_ID" --provider "$PROVIDER_ID" --service-account "$VERIFIER_SA"

# Run only after authorization and review of the printed plan.
python3 -B infra/gcp/wif/wif.py apply --project-number "$PROJECT_NUMBER" \
  --pool "$POOL_ID" --provider "$PROVIDER_ID" --service-account "$VERIFIER_SA"

python3 -B infra/gcp/wif/wif.py verify --project-number "$PROJECT_NUMBER" \
  --pool "$POOL_ID" --provider "$PROVIDER_ID" --service-account "$VERIFIER_SA"
```

`apply` reuses matching resources and adds only missing configuration. Disabled/deleted resources, changed trust configuration, wrong projects, other providers and API/IAM errors fail closed. It never overwrites an existing provider. A partial failure retains completed changes. Inspect inventory, allow IAM propagation (Google documents up to five minutes), and rerun preflight before retrying. Use one provisioning operator at a time. A fully configured repeated apply performs no mutation.

5. Set these repository **Actions variables** using the values printed by successful verification:

| Variable | Purpose | Secret? | Value source |
| --- | --- | --- | --- |
| `WIF_PROVIDER` | Select the provider and exact OIDC audience | No | Verified `projects/NUMBER/locations/global/workloadIdentityPools/POOL/providers/PROVIDER` |
| `WIF_SERVICE_ACCOUNT` | Select the dedicated read-only impersonated account | No | Existing service account approved in #35 |

There is no JSON key or GitHub credential secret to upload. The auth action creates the temporary ADC environment (`GOOGLE_APPLICATION_CREDENTIALS` and Cloud SDK equivalents). Never print or upload its file, OIDC JWT, STS token, or access token. `gha-creds-*.json` is excluded from Git, Docker and gcloud source uploads.

6. Merge the reviewed workflow into `sprint-1-staging` when ready for its first hosted check. A staging push runs authentication verification. Manual dispatch also accepts only staging. GitHub requires a workflow on the repository's default branch to expose manual dispatch, so the staging push trigger is the first verification route if the default branch is `main`. Feature branches and ordinary PR jobs run offline checks. Missing repository variables cause a clear failure before authentication.

## Verification and evidence

Run offline checks from the repository root:

```bash
python3 -B -m unittest discover -s infra/gcp/wif -p 'test_*.py' -v
git diff --check
```

The suite models the restricted CEL expression's equality, membership and conjunction operators. It exercises positive events, fork/different repository/owner, unauthorized ref, PR and PR-target events, wrong workflow, wrong issuer/audience, missing claims, credentials and OIDC permission scenarios, scoped bindings, drift, shared-pool rejection and confirmation. Provisioning tests mock gcloud. These checks do not execute Google's CEL engine, JWT signature verification, STS, IAM authorization or hosted GitHub OIDC.

The real authenticated workflow must produce a successful project lookup for the expected project ID and provider's project number. Its summary records commit, event and ref. Keep the workflow run URL and summary alongside sanitized provider configuration, service account binding and the IAM review. Record `git rev-parse HEAD` for local results and the actual `GITHUB_SHA` for hosted results.

| Verification | Expected proof |
| --- | --- |
| Trusted staging push | Successful auth step and matching read-only project lookup |
| Fork/different repo/owner or feature branch | Offline policy rejection; real denied exchange only in a separately reviewed read-only test harness |
| PR / PR-target event | Offline condition rejection and PR CI without `id-token: write` |
| Wrong audience | Offline rejection; optional authorized read-only hosted probe must fail token exchange |
| Missing OIDC permission | Workflow inspection plus optional probe with permission removed must fail before exchange |
| Wrong binding / missing credentials | Offline denial model; optional isolated probe must fail impersonation/API lookup |

Do not weaken the production provider to run negative tests. A live negative probe requires a separately reviewed workflow on a rejected ref/context or a dedicated non-production test identity. Record expected failure, actual failure stage and run URL. Never dump the raw credential to diagnose a denial. Offline denial results must remain identified as offline.

## Integration and rollback

Episode 5's Artifact Registry, Cloud Build, Cloud Run, Secret Manager, migration and bootstrap scripts continue to use their existing operator/runtime identities. The verifier has only project lookup permission. A future release pipeline needs its own reviewed trust and IAM design for build submission, source upload, actAs and deployment. That belongs to a later episode.

To revoke this integration after authorization, first disable the provider:

```bash
gcloud iam workload-identity-pools providers update-oidc "$PROVIDER_ID" \
  --project=lab-5-cloud-deployment-514310 --location=global \
  --workload-identity-pool="$POOL_ID" --disabled
```

Then remove the exact `roles/iam.workloadIdentityUser` binding from the verifier using the recorded principalSet member and `--condition=None`. Remove repository variables and have the IAM owner review custom role/account cleanup. Already issued credentials can remain valid until expiry. Inspect dependencies before deleting a provider or pool; soft-deleted IDs cannot simply be reused. Retain sanitized configuration and audit evidence.

## References

- [Google WIF deployment pipeline configuration](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)
- [GitHub OIDC claims and event context](https://docs.github.com/en/actions/reference/security/oidc)
- [Official Google auth action and audience contract](https://github.com/google-github-actions/auth)
- [WIF authentication troubleshooting](https://docs.cloud.google.com/iam/docs/troubleshooting-workload-identity-federation)
