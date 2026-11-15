# [Lab 5] Prepare GCP infrastructure and first deployment

**Base:** `sprint-1-staging`

**Head:** `feat/5-first-gcp-deployment`

**Author:** `yiiipunn`

**Reviewer:** `DEV4952`

**Label:** `lab5`

Part of #31

## Summary

Add guarded Cloud Shell tooling for a single same-origin Cloud Run service with private Cloud SQL PostgreSQL, Secret Manager, Artifact Registry, and separate migration and bootstrap jobs. This branch merges `sprint-1-staging` (including PR #32's merge commit `978dec8`), so this PR's diff contains only PR B's GCP tooling, CI check and documentation. All commands are manual and require typed confirmation before changing cloud resources. **No GCP resource has been created and no deployment is claimed.**

## Implementation

- `infra/gcp/preflight.sh` inventories the fixed project, region, APIs, repository, database, services and VPC without changing resources.
- `infra/gcp/prepare.sh` stages APIs, a private source bucket, Artifact Registry, network, database, secrets, four service accounts and scoped IAM grants behind separate confirmations.
- `infra/gcp/cloudbuild.yaml` builds PR A's `production` and `migration` targets with a 30-minute timeout and publishes both images.
- `infra/gcp/release.sh`:
  - `build` accepts only a clean, pushed commit on `feat/5-first-gcp-deployment` or `sprint-1-staging`, and prints both immutable digests.
  - `migrate` runs the migration image's default entrypoint. Bootstrap and deploy require its latest execution to have completed successfully with the commit's exact migration digest.
  - `bootstrap` runs `node dist/bootstrap-cli.js` in the production image with the reviewed `BOOTSTRAP_INPUT` secret. Only after verifying the execution does it record the execution name as the Cloud SQL label `kitloop_bootstrap`.
  - `deploy` requires that label rather than the one-time job, so the job may be deleted and its access revoked. Later releases never repeat bootstrap. `APP_ORIGIN` is always the canonical deterministic URL `https://kitloop-PROJECT_NUMBER.asia-southeast1.run.app`; no placeholder origin exists.
    - First deployment: a private service (`--no-allow-unauthenticated`).
    - Later releases: a `--no-traffic` revision tagged `candidate`. Traffic moves only after `/`, `/api/health` and `/api/ready` pass on the candidate. Invoker IAM is never changed, so public access is preserved.
  - `rollback` accepts only a ready revision with a registry digest and canonical `APP_ORIGIN`, then confirms 100% routing. A later deploy moves traffic away from a rollback pin.
- `infra/gcp/verify.sh` reports and validates the revisions actually receiving traffic, then checks the canonical URL without printing tokens. Identity tokens are passed to curl on stdin.
- `infra/gcp/guards.test.sh` is an offline regression suite. It uses a file-backed fake `gcloud`/`curl`, real `jq` on Cloud Run v1-shaped JSON, and a pseudo-terminal for typed confirmations. `.github/workflows/pull-request-ci.yml` runs `bash -n` on the release scripts and the suite.
- `.gcloudignore` keeps local environments, credentials, generated files and evidence out of the Cloud Build upload.
- `docs/labs/lab-05/deployment.md` and `infra/gcp/README.md` document the architecture, costs, ordered first and later releases, the canonical URL, zero-downtime limits, rollback and evidence.

## Verification

- [x] `bash -n` passed for all six `infra/gcp` scripts.
- [x] ShellCheck 0.10.0 (`koalaman/shellcheck` image) reported no findings at any severity for the six scripts. Two intentional patterns carry documented directives.
- [x] `guards.test.sh` passed on Debian bookworm (jq 1.6, util-linux 2.38.1): 14 scenario groups plus the final pass line.
  - Noninteractive, wrong-project and mistyped-confirmation guards.
  - Migration and bootstrap gates.
  - The documented first release, including bootstrap revocation and job deletion.
  - Private verify, then publish.
  - A later release without bootstrap that preserves public access.
  - A failed candidate that receives no traffic.
  - Failed, mismatched and incomplete migrations.
  - Rollback safety, then redeploy off a rollback pin.
  - Build branch and pushed-commit checks.
- [x] Mutation check: the suite failed for 14 of 15 deliberately reintroduced defects, including each original audit defect. The survivor removed the redundant `completionTime` clause; the `succeededCount` clause still rejects a running execution.
- [x] Cloud Build YAML parsed. `production` and `migration` Docker targets were built from a `.gcloudignore`-filtered copy of the merged tree. App, bootstrap and migration entrypoints behaved as specified without a database. Runtime code is unchanged from PR #32, whose hosted CI passed on `fd0c95b`.
- [x] `git diff --check` and a secret-pattern scan of this PR's diff found nothing.
- [ ] PR B hosted CI on the pushed head: pending.
- [ ] Cloud Build, Cloud SQL, Cloud Run jobs/service, canonical URL reporting, real HTTPS browser checks and persistence across revisions: **not executed**.

## Provisioning prerequisites

Billing and budget alerts, remaining credits, regional quota, cost estimate, network CIDRs, operator IAM (including Cloud SQL label updates) and explicit approval must be checked before cloud resources are created. Cloud SQL, build source storage and image storage may incur charges. The Cloud SQL trial eligibility of this project is unverified, and its trial instance is not the proposed durable database.

## Remaining cloud-dependent risks

- Cloud Run's built-in Cloud SQL socket attachment with a **private-IP-only** instance and Direct VPC egress must be confirmed by the first `migrate` execution.
- These must be confirmed in Cloud Shell:
  - The deterministic URL appears in the service's `run.googleapis.com/urls` annotation or `status.url`.
  - Real `gcloud ... --format=json` output matches the v1 field paths the jq gates read.
  - The installed `gcloud` accepts every flag.
  - Org policy allows `allUsers` invoker access.
- The candidate checks do not exercise login or writes. Migrations must stay backward compatible because they run while the previous revision serves.

## Reviewer checklist

- [ ] Confirm all scripts target `lab-5-cloud-deployment-514310` in `asia-southeast1` and stop on a wrong active project.
- [ ] Confirm private-only Cloud SQL, Direct VPC egress, canonical `APP_ORIGIN` and secret-scoped IAM.
- [ ] Confirm the bootstrap label lifecycle, the first-versus-later deploy paths, and that redeploys never touch invoker IAM.
- [ ] Confirm rollback rejects unsafe revisions and the next deploy moves traffic off a rollback pin.
- [ ] Confirm no default or demo credentials and no production seed bypass.
- [ ] Confirm evidence claims are backed by actual execution and the diff contains no PR A or unrelated Sprint 1 files.
