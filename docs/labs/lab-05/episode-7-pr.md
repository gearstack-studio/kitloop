# [Lab 5] Automate Cloud Run deployment through GitHub Actions

> **Status note (16 November 2026):** This is the PR #39 description as reviewed. PR #39 merged into staging as `ca597ff`. The live release later succeeded in [run 43717180011 attempt 2](https://github.com/gearstack-studio/kitloop/actions/runs/43717180011/attempts/2). Issue #40 exists for Episode 8, so the "E8 pending" link below is historical. Current status: [Lab 5 evidence index](README.md).

**Lab 5 issue register:** [E1 #24](https://github.com/gearstack-studio/kitloop/issues/24) · [E2 #25](https://github.com/gearstack-studio/kitloop/issues/25) · [E3 #27](https://github.com/gearstack-studio/kitloop/issues/27) · [E4 #29](https://github.com/gearstack-studio/kitloop/issues/29) · [E5 #31](https://github.com/gearstack-studio/kitloop/issues/31) · [E6 #34](https://github.com/gearstack-studio/kitloop/issues/34), [#35](https://github.com/gearstack-studio/kitloop/issues/35) · [E7 #38](https://github.com/gearstack-studio/kitloop/issues/38) · [E8 pending](episode-8-issue.md) (local draft, no GitHub issue). [Current status](README.md#episode-issue-register).

Part of #38. Base: `sprint-1-staging`; head: `feat/7-automated-deployment`. Reviewer: DEV4952. Label: `lab5`.

## Summary

- Reuse the existing CI as a push gate after a reviewed release PR from staging into main.
- Restrict deployment to a protected main push, explicit repository opt-in, and reviewed `lab5-production` Environment.
- Reuse Episode 5 build, migration, candidate deployment, health verification and rollback. Keep bootstrap and public publish interactive.
- Document a separate, least-privilege WIF deployment identity. No IAM or GCP resource is changed by this PR.
- Mint the Cloud Run ID token for automated candidate/private checks through IAM Credentials `generateIdToken`. It uses the canonical service URL as audience, also for candidate-tag requests (review fix; see [Cloud Run ID token](episode-7-deployment.md#cloud-run-id-token-for-candidate-and-private-checks)).

## Verification

Local results: actionlint 1.7.12 passed for both affected workflows; YAML parsing passed; Bash syntax passed for the changed release scripts; 16 offline deployment guard cases and 28 WIF tests passed; `git diff --check` passed. Docker CI regression could not run because the Docker daemon is unavailable. The PR's Linux CI must run both suites. The existing PR check context was confirmed from [PR #37's successful CI job](https://github.com/gearstack-studio/kitloop/actions/runs/43618541536): `Build, test and Docker smoke`. No live deployment or deploy-WIF result is claimed.

Review fix (DEV4952, ID-token handling), local results on 15 November 2026: Bash syntax passed for all GCP scripts and the embedded test fakes. The 16 deployment guard cases and 28 WIF tests passed, as did YAML parsing and `git diff --check`. **Full GCP release regression suite: 33/33 PASS in WSL. ShellCheck: no warnings or errors. Live deployment verification remains pending.** actionlint was not rerun because no workflow file changed. The required `roles/iam.serviceAccountOpenIdTokenCreator` self-binding on `kitloop-wif-deploy` is proposed, not applied.

## Evidence and limits

See the [Lab 5 evidence index](README.md) and [deployment design](episode-7-deployment.md). The updated Lab 5 handout requires a reviewed change through staging into main, deployment only from main, and a running revision that matches its commit (R-07, R-08, C-06). Read-only GitHub metadata showed both main and staging unprotected on 15 November 2026; this PR proposes code and does not enforce the merge gate. Live evidence for the release PR, environment approval, deploy WIF, Cloud Build, immutable digests, Cloud Run revision, health/readiness and rollback is **MISSING** until an authorized test. The first Episode 5 deployment and bootstrap must already exist. Database migrations are not reversed by traffic rollback.

## Reviewer checklist

- [x] Confirm the updated Lab 5 handout's main-only release path and Issue #38 scope.
- [ ] Confirm main and staging branch rules, two-maintainer recovery and exact PR CI check context.
- [ ] Review Environment protections and keep `LAB5_DEPLOY_ENABLED` off.
- [ ] Review separate WIF provider condition and deploy-account permission contract; do not expand the verifier account.
- [ ] Review the `generateIdToken` flow and the proposed `roles/iam.serviceAccountOpenIdTokenCreator` self-binding on `kitloop-wif-deploy`.
- [ ] Check migration compatibility, backup freshness and rollback behavior.
- [ ] Review local checks and CI result; request live evidence before activation.
