# PR A — GitHub OIDC and WIF

Title: `[Lab 5] Configure GitHub OIDC and Workload Identity Federation`

Base: `sprint-1-staging` · Head: `feat/6-wif-integration` · Author: `DEV4952` · Reviewer: `yiiipunn` · Label: `lab5`

## Summary

Prepare keyless authentication from the trusted KitLoop GitHub Actions workflow to Google Cloud. The verifier uses a dedicated service account and checks read-only project access. Trust conditions restrict repository and owner IDs, branch, event and workflow path.

Part of #34. IAM permission review and merge gates are tracked separately in #35.

## Changes

- `infra/gcp/wif/wif.py` provides an offline plan, read-only preflight/verification, and confirmed creation of a dedicated pool/provider and scoped impersonation binding. Existing drift fails closed.
- `.github/workflows/wif-auth.yml` pins official actions to commit SHAs, accepts staging push/manual events, and validates repository variables before OIDC authentication.
- The existing PR CI runs offline policy and provisioning regression tests without cloud permissions.
- Git, Docker and gcloud upload ignore files exclude generated auth credentials.
- `infra/gcp/wif/README.md` documents the full trust model, setup, IAM handoff, tests, evidence and revocation.

## IAM and setup requirements

The operator must obtain cloud authorization before applying configuration. yiiipunn must review the dedicated `kitloop-wif-*` service account and its project role containing `resourcemanager.projects.get`. The provider and impersonation binding are restricted to the reviewed repository. The verifier must have no deployment, build, secret or IAM administration privileges.

Record the actual project number, provider resource and account after setup, then configure `WIF_PROVIDER` and `WIF_SERVICE_ACCOUNT` repository variables. Provider and account existence have not been verified from this workstation because gcloud is unavailable.

## Validation

- [x] Offline WIF tests pass locally, including negative claim scenarios and mocked setup guards.
- [x] All 21 tests pass, including service-account error diagnostics and execution of the workflow's project-lookup script against mocked success/failure responses.
- [x] Actionlint 1.7.12 validates both workflows. Optional ShellCheck and Pyflakes integrations were disabled for this Windows run.
- [x] Bash syntax, `git diff --check`, credential-file ignore checks and a credential-pattern scan of all 10 changed files pass.
- [ ] Hosted PR CI passes on the pushed head.
- [ ] Authorized GitHub-to-GCP authentication succeeds.
- [ ] Optional live negative probes produce expected denials.
- [ ] Provider/binding inventory and workflow run evidence are attached.

See the runbook for verification commands. Offline tests model the condition and provisioning behavior. Cloud token exchange and IAM authorization require actual hosted verification after approved setup. Attach the tested commit SHA and run links before claiming those results.

## Reviewer checklist

- [ ] Recheck repository ID `1442734708` and owner ID `351405823`.
- [ ] Review issuer, audience, attribute mappings and every condition clause.
- [ ] Confirm the pool is dedicated and impersonation is scoped to the verifier.
- [ ] Review the IAM contract and branch protections with #35.
- [ ] Confirm workflow triggers, permissions, pinned actions and credential cleanup.
- [ ] Verify evidence accurately distinguishes local tests and real authentication.

## Local handoff record

Local checks ran on 2026-11-14 against the uncommitted PR A working tree based on `ed80306cbf95e18614d6f97e0bd5a67e6de03642`. That base SHA identifies staging, not the completed WIF change. Record the new commit SHA and hosted CI run after committing. GCP inventory, actual authentication and hosted negative probes are **NOT RUN**. The workstation has no gcloud executable. Docker daemon was unavailable, so the full existing Docker/application CI suite was **NOT RUN** locally. The application runtime was not modified.

Repository code is ready for review. End-to-end WIF acceptance remains pending approved cloud setup, the #35 IAM review, repository variables and hosted evidence.

After reviewing the diff, the manual handoff commands are:

```bash
git diff --check
python3 -B -m unittest discover -s infra/gcp/wif -p 'test_*.py' -v
git add .dockerignore .gcloudignore .gitignore \
  .github/workflows/pull-request-ci.yml .github/workflows/wif-auth.yml \
  infra/gcp/wif docs/labs/lab-05/deployment.md docs/labs/lab-05/wif-pr-a.md
git diff --cached --stat
git commit -m "feat: prepare GitHub OIDC and WIF authentication"
git rev-parse HEAD
git push -u origin feat/6-wif-integration
```

Open the PR into `sprint-1-staging`, add `lab5`, select the existing Lab 5 milestone and request review from `yiiipunn`. Use the summary, changes, IAM requirements, validation and reviewer checklist above for the PR body.
