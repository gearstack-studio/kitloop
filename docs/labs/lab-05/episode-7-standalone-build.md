# Episode 7: standalone-project build security proposal

Status: **proposed, not approved or applied**. This revises only the Cloud Build prerequisite in [PR #44](https://github.com/gearstack-studio/kitloop/pull/44) for [Issue #38](https://github.com/gearstack-studio/kitloop/issues/38). Its Organization Policy route is not the execution path for this standalone project. PR approval of the earlier proposal does not approve these revised IAM changes or accept their residual risk.

## Supported path and current evidence

Google explicitly supports user-specified build accounts in projects without an Organization. For newer standalone projects, the default is Compute and the legacy account is unavailable; older standalone projects can retain the legacy path. This project's default lookup alone cannot establish legacy unavailability. [Default-account changes](https://docs.cloud.google.com/build/docs/cloud-build-service-account-updates).

The existing same-project setup is supported: `release.sh build` passes `--service-account="projects/$PROJECT/serviceAccounts/$BUILD_SA"`, where `BUILD_SA=kitloop-build@lab-5-cloud-deployment-514310.iam.gserviceaccount.com`. `cloudbuild.yaml` stores logs in Cloud Logging, and the build account already has scoped source-reader, registry-writer and Log Writer access. Cross-project service-account setup and Organization Policy changes are unnecessary for that path. [User-managed build accounts](https://docs.cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts).

Read-only findings on 2026-11-15:

| Check | Observed result |
| --- | --- |
| Resource hierarchy | Only project `lab-5-cloud-deployment-514310`, no folder/Organization parent |
| Default build identity | `610347790049-compute@developer.gserviceaccount.com` |
| Compute identity | Project Editor; account IAM has no bindings; deployment has no observed actAs or token-creation grant on it |
| Legacy identity | Project `roles/cloudbuild.builds.builder`; no other matching grant in project-scoped Cloud Asset search or enumerated resource IAM |
| Legacy identity describe | Denied on the Google-owned account; this is not proof it is absent or disabled |
| Build history | Two builds in `asia-southeast1`, both successful as `kitloop-build`; no global builds in queried history |
| Consumers | No Compute VMs; no global or `asia-southeast1` triggers; regional Run service/jobs use named runtime, migration and bootstrap accounts |
| Default-account activity | No entries returned by retained 30-day principal audit query; missing/unlogged activity remains possible |
| Detailed IAM inventory | One bucket, one repository, three secret IAM policies (no payload reads), seven user-managed accounts, one service and two jobs |
| Deployment custom role | Seven permissions; `cloudbuild.builds.create` still absent |
| Production gate | `LAB5_DEPLOY_ENABLED=false` |

Cloud Asset is already enabled; no API or infrastructure was created. Its inventory can lag, and project-scoped results do not enumerate external projects or group membership. Existing audit evidence supports a narrow removal proposal, not a global guarantee of non-use. See [sanitized inventory](evidence/deployment/standalone-build-inventory.json).

## Why the explicit flag is insufficient as an IAM boundary

Google warns that `cloudbuild.builds.create` can allow builds as the legacy build account. The checked-in flag selects the intended account for this workflow; it does not constrain another API request by a compromised authorized caller. The legacy Builder role includes storage and registry capabilities and must not remain an unaudited escalation path. [Cloud Build permissions](https://docs.cloud.google.com/build/docs/iam-roles-permissions), [legacy-account privileges](https://docs.cloud.google.com/build/docs/cloud-build-service-account).

The user-managed/Compute account path requires account `actAs` authority. Keep deployment's existing named-account bindings and do not grant actAs on Compute or project-wide actAs. Compute's Editor role does not itself grant the deployment caller permission to impersonate Compute. This proposal relies on that account boundary, subject to explicit review and later authorized live verification. It does not claim a live denial has been observed. [Account selection and caller permissions](https://docs.cloud.google.com/build/docs/cloud-build-service-account-updates), [trigger identity authorization](https://docs.cloud.google.com/build/docs/cloud-build-service-account#user_access_to_triggers).

## Exact revised IAM changes, after approval and separate authorization

Only these two mutations are proposed:

```bash
gcloud projects remove-iam-policy-binding lab-5-cloud-deployment-514310 \
  --member=serviceAccount:610347790049@cloudbuild.gserviceaccount.com \
  --role=roles/cloudbuild.builds.builder --condition=None

# Only AFTER authoritative IAM and refreshed Cloud Asset inventory show no legacy grants:
gcloud iam roles update kitloopDeployPreflight \
  --project=lab-5-cloud-deployment-514310 \
  --add-permissions=cloudbuild.builds.create
```

Do not execute this block directly as a single unchecked batch. The guarded helper below checks state between mutations. The existing custom-role binding remains on the deployment account only, and its seven current permissions are preserved. Nothing changes the default Compute account's Editor role, either account's existence, the Cloud Build service agent (`service-610347790049@gcp-sa-cloudbuild.iam.gserviceaccount.com`), runtime/migration identities, secrets, production traffic or database.

The legacy removal is justified by its privileged execution exception and the observed lack of consumers. It is technically feasible through project IAM, without Organization Policy administration. It may break an undiscovered legacy consumer; inventory scope, logging gaps and owner confirmation must be considered before authorization. Removing Compute Editor is **not necessary for this proposal** and has an unknown wider blast radius. Any later Compute privilege reduction needs its own dependency audit, replacement-role design and authorization. Do not delete or disable either account.

If the removal fails or other legacy grants appear, stop before granting build-create. If the role grant fails after removal, leave build-create absent and report partial completion. Do not automatically restore Builder; restoration is another separately authorized security change. The narrow inverse, if approved, is to remove build-create before restoring the exact original legacy project grant. This is an IAM recovery procedure, not Cloud Run traffic rollback.

## Executable helper and approval boundaries

Default mode reads configuration and prints a plan; it performs no mutations:

```bash
python3 -B infra/gcp/deploy/standalone_build.py
python3 -B -m unittest discover -s infra/gcp/deploy -p 'test_*.py' -v
```

Before any apply, DEV4952 must submit an **APPROVED review on the exact current proposal head**, explicitly accepting the changes and risks below. Include `APPROVE-STANDALONE-BUILD-SECURITY` in that review. Ordinary approval or PR #44's approval cannot satisfy this helper.

After that review and a **separate explicit IAM execution authorization** from the operator, use a clean checkout of that exact reviewed head:

```bash
# Replace REVIEW_PR_NUMBER with the reviewed proposal PR number.
python3 -B infra/gcp/deploy/standalone_build.py --apply \
  --review-pr REVIEW_PR_NUMBER --authorization apply-reviewed-standalone-iam
```

The flag records the operator's separately obtained authorization; possession of the flag is not authorization. The helper verifies live gate=false, standalone hierarchy, default account, role/binding scope, named actAs inventory, explicit build flag, review author/body/head and clean source before mutation. It removes only legacy project Builder, rereads authoritative IAM and Cloud Asset, and grants build-create only if no legacy grants remain visible. Inventory lag causes a stop; recheck later rather than bypassing it. Every cloud target is fixed to this lab. Apply mode has **not** been run.

## Residual risk requiring DEV4952's explicit acceptance

- Build-create permits arbitrary submitted build steps and also authorizes trigger operations. It is project API authority, not a restriction to this repository, config file or one image. The WIF trust, protected main, CI and non-bypassable environment review constrain issuance of the deployment credentials; they do not constrain every API request after credential compromise.
- Deployment already has actAs on `kitloop-build`, `kitloop-run` and `kitloop-migrate`. Build-create could select **any of those three**; the flag is not exclusive enforcement of `kitloop-build`. Runtime/migration secret authority is already reachable through the existing deploy/job-update capabilities. Reviewers must accept that combined deployment trust boundary; do not describe deployment as unable to exercise runtime authority indirectly.
- Compute remains privileged. The proposal does not grant deployment actAs on it, but an administrator could later add such a grant or restore legacy Builder. Recheck IAM before each approved production release and record the audit. No project-wide token creation or default-account access is proposed.
- Project inventory and retained audit logs cannot prove absence of all consumers or external grants. Live default-account rejection is untested. Cloud Build has no claimed no-cost dry-run here; any negative submission test might start a build if assumptions are wrong and requires explicit billable-operation authorization first.
- Even a legacy identity with no observed resource grants could consume build quota or reach public resources if executable. Removing its known grant limits privileges; it is not an Organization Policy prohibition on selecting that identity.

If those risks are unacceptable, keep build-create absent. A broker or separate build project offers another trust boundary but requires new infrastructure and its own design/authorization. Building only in GitHub would avoid this permission but change Issue #38's Cloud Build requirement. A build trigger alone does not remove the documented build-create authority. None of these alternatives was provisioned.

After security review and authorized IAM changes, run non-destructive verification again, then obtain separate approval for gate activation and all production operations. DEV4952's actual GitHub Environment approval is still required. Issue #38 stays open until a real main deployment and acceptance evidence pass; Issue #40's original record must remain unchanged.
