# [Lab 5] Prepare GCP infrastructure and first deployment

**Base:** `sprint-1-staging`

**Head:** `feat/5-first-gcp-deployment`

**Author:** `yiiipunn`

**Reviewer:** `DEV4952`

**Label:** `lab5`

## Summary

Add Cloud Shell runbooks and guarded scripts for the first KitLoop deployment to a single Cloud Run service with private Cloud SQL PostgreSQL, Secret Manager, Artifact Registry, and a separate migration job. The scripts perform no action automatically and require typed confirmation before changing cloud resources. Existing Docker Compose and CI behavior is untouched.

## Implementation

- `infra/gcp/preflight.sh` inventories the fixed project, region, APIs, repository, database, services, and VPC without changing resources.
- `infra/gcp/prepare.sh` stages API, repository, network, database, secret, service account, and scoped IAM actions behind separate confirmations.
- `infra/gcp/cloudbuild.yaml` builds and publishes the planned app and migration image targets.
- `infra/gcp/release.sh` builds by source SHA, records immutable digests, runs migrations, deploys privately, publishes only after checks, and supports traffic rollback.
- `infra/gcp/verify.sh` checks revision and HTTP health/readiness without printing credentials.
- `.gcloudignore` keeps local environments, credentials, generated files, and evidence outside the Cloud Build source upload.
- `docs/labs/lab-05/deployment.md` and `infra/gcp/README.md` document the architecture, costs, order, integration contract, verification, and remaining work.

## Verification

- [x] Git Bash `bash -n` passed for all six new Bash files.
- [x] Mock guard test passed: noninteractive and wrong-project mutation attempts stopped before a cloud call.
- [x] Cloud Build YAML parsed and declared two image targets.
- [x] `docker compose config --quiet` exited 0 (Docker warned that its local client config was inaccessible; no Compose interpolation error).
- [x] Backend: 8 test files, 58 tests passed; `npm run typecheck` and `npm run build` exited 0.
- [x] Frontend: 4 test files, 21 tests passed; `npm run lint` and `npm run build` exited 0.
- [x] `git diff --check` exited 0; proposed paths were checked for high-confidence credential patterns without printing values. Local `.env` files remain ignored.
- [ ] ShellCheck was unavailable in the local environment.
- [ ] Production image, migration command, and local runtime tests: **DEV4952 integration pending**.
- [ ] Cloud Build, migration job, Cloud Run, database, and browser verification: **not run; approval and integration pending**.

## Provisioning prerequisites

Billing and budget alerts, remaining credits, regional quota, cost estimate, network CIDRs, operator IAM, DEV4952 image/bootstrap contract, and explicit approval must be checked before cloud resources are created. Cloud SQL and build/image storage may incur charges. The Cloud SQL trial eligibility of this project is unverified and its trial instance is not the proposed durable database.

## Deployment and evidence

Follow `infra/gcp/README.md` in order. Record the reviewed source SHA, Cloud Build ID/result, immutable image digests, private Cloud SQL state, migration execution, Cloud Run revision/URL, health/readiness, browser workflow, and persistence. Do not attach secrets, tokens, cookies, database URLs, or unredacted logs. **No deployment is claimed by this PR.**

## Remaining integration dependencies

- DEV4952: `cloud` and `migrator` Docker targets, same-origin routing, production `db:bootstrap` command using the documented environment contract, and production runtime tests.
- GCP owner approval: billable resources, service accounts/IAM, secrets, Cloud SQL, build, deployment, and public invocation.
- Bootstrap job execution remains blocked until DEV4952's command interface is implemented and reviewed.

## Reviewer checklist

- [ ] Confirm all scripts point to the intended project and `asia-southeast1` and stop on wrong active project.
- [ ] Confirm private-only Cloud SQL, Direct VPC egress, exact origin, and secret-scoped IAM.
- [ ] Confirm no default/demo credentials or production seed bypass.
- [ ] Confirm source SHA, image digest, migration and rollback contracts match DEV4952's image.
- [ ] Confirm evidence claims are backed by actual execution and unrelated Sprint 1 files are excluded.

## Draft Episode 5 issue update

Repository-side GCP tooling and the deployment runbook are prepared on `feat/5-first-gcp-deployment`. The plan uses one same-origin Cloud Run service, private-IP Cloud SQL, Secret Manager, Artifact Registry, and a separate migration job. Local script guards, syntax, Compose configuration, and existing backend/frontend tests and builds passed. No GCP resource has been created. Cost/budget approval and DEV4952's production image, migration, bootstrap, and runtime evidence are still required before deployment. Post this only after an Episode 5 issue is opened; no matching issue was present during preparation.
