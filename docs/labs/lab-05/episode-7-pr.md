# [Lab 5] Automate Cloud Run deployment through GitHub Actions

**Lab 5 issue register:** [E1 #24](https://github.com/gearstack-studio/kitloop/issues/24) · [E2 #25](https://github.com/gearstack-studio/kitloop/issues/25) · [E3 #27](https://github.com/gearstack-studio/kitloop/issues/27) · [E4 #29](https://github.com/gearstack-studio/kitloop/issues/29) · [E5 #31](https://github.com/gearstack-studio/kitloop/issues/31) · [E6 #34](https://github.com/gearstack-studio/kitloop/issues/34), [#35](https://github.com/gearstack-studio/kitloop/issues/35) · [E7 #38](https://github.com/gearstack-studio/kitloop/issues/38) · [E8 pending](episode-8-issue.md) (local draft, no GitHub issue). [Current status](README.md#episode-issue-register).

Part of #38. Base: `sprint-1-staging`; head: `feat/7-automated-deployment`. Reviewer: DEV4952. Label: `lab5`.

## Summary

- Reuse the existing CI as a push gate after a reviewed release PR from staging into main.
- Restrict deployment to a protected main push, explicit repository opt-in, and reviewed `lab5-production` Environment.
- Reuse Episode 5 build, migration, candidate deployment, health verification and rollback. Keep bootstrap and public publish interactive.
- Document a separate, least-privilege WIF deployment identity. No IAM or GCP resource is changed by this PR.

## Verification

Local results: actionlint 1.7.12 passed for both affected workflows; YAML parsing passed; Bash syntax passed for the changed release scripts; 16 offline deployment guard cases and 28 WIF tests passed; `git diff --check` passed. The existing Episode 5 `guards.test.sh` could not run locally because this Windows shell lacks `jq` and the Linux `script` utility. Docker CI regression could not run because the Docker daemon is unavailable. The PR's Linux CI must run both suites. The existing PR check context was confirmed from [PR #37's successful CI job](https://github.com/gearstack-studio/kitloop/actions/runs/43618541536): `Build, test and Docker smoke`. No live deployment or deploy-WIF result is claimed.

## Evidence and limits

See the [Lab 5 evidence index](README.md) and [deployment design](episode-7-deployment.md). The updated Lab 5 handout requires a reviewed change through staging into main, deployment only from main, and a running revision that matches its commit (R-07, R-08, C-06). Read-only GitHub metadata showed both main and staging unprotected on 15 November 2026; this PR proposes code and does not enforce the merge gate. Live evidence for the release PR, environment approval, deploy WIF, Cloud Build, immutable digests, Cloud Run revision, health/readiness and rollback is **MISSING** until an authorized test. The first Episode 5 deployment and bootstrap must already exist. Database migrations are not reversed by traffic rollback.

## Reviewer checklist

- [x] Confirm the updated Lab 5 handout's main-only release path and Issue #38 scope.
- [ ] Confirm main and staging branch rules, two-maintainer recovery and exact PR CI check context.
- [ ] Review Environment protections and keep `LAB5_DEPLOY_ENABLED` off.
- [ ] Review separate WIF provider condition and deploy-account permission contract; do not expand the verifier account.
- [ ] Check migration compatibility, backup freshness and rollback behavior.
- [ ] Review local checks and CI result; request live evidence before activation.
