# Deployment evidence

Provenance for the deployment evidence files. All files are unmodified copies of authentic records unless a row states otherwise. Checksums are SHA-256.

| File | What it shows | Source | Checksum |
|:--|:--|:--|:--|
| [first-release-publish-cloud-shell.png](first-release-publish-cloud-shell.png) | Episode 5 first release: `release.sh publish` and `verify.sh public` in Cloud Shell, revision `kitloop-284f41973f61-20261115080104` at 100%, HTTP 200 for `/`, `/api/health`, `/api/ready` | Attachment in [PR #41 comment](https://github.com/gearstack-studio/kitloop/pull/41#issuecomment-6891599464), 2026-11-15 08:19 UTC, byte-identical copy | `6fdd39b4...d658a` |
| [release-run-43717180011-summary.png](release-run-43717180011-summary.png) | Episode 7 run summary: both jobs succeeded on `be72f87`; build, migration, deployment and verification succeeded; rollback skipped; app digest | Attachment in [Issue #38 comment](https://github.com/gearstack-studio/kitloop/issues/38#issuecomment-6896256486), 2026-11-15 14:41 UTC, byte-identical copy | `103330af...518cc` |
| [release-run-43717180011-log-excerpt.txt](release-run-43717180011-log-excerpt.txt) | Release job log lines for Cloud Build `676619ea-a64f-4e49-89d5-cdb2a884a312` (SUCCESS), both image digests, migration execution `kitloop-migrate-4d8sw`, candidate checks at 0% traffic, promotion to 100% and final HTTP checks | [Job 132843368366](https://github.com/gearstack-studio/kitloop/actions/runs/43717180011/job/132843368366), read with `gh run view --log` on 2026-11-16 | `4f19f40d...0b92e` |
| [release-run-43717180011-environment-approval.png](release-run-43717180011-environment-approval.png) | Episode 7 environment approval: the run's "Deployment protection rules" panel shows DEV4952 approved `lab5-production`; run on `be72f87`, status Success | [Run 43717180011 attempt 2](https://github.com/gearstack-studio/kitloop/actions/runs/43717180011/attempts/2), public page loaded signed out by a read-only headless Playwright script on 2026-11-16 08:40:51 UTC; page screenshot, so no browser address bar | `21dcda1dd864c7c5e6a1b935d02aaad010a8f01a93dbac951730a4bb1b3d6c2f` |
| [standalone-build-inventory.json](standalone-build-inventory.json) | Read-only Cloud Build identity inventory for PR #45 | [Standalone build proposal](../../episode-7-standalone-build.md) | Unchanged |

The log excerpt removes only ANSI colour codes and per-line timestamps. Its header lists the source line ranges. A credential-pattern scan of the full job log found no matches. The screenshots show GitHub logins, the project ID and number, and public URLs, but no credentials, tokens or email addresses.

The first-release screenshot is a Cloud Shell capture, not a GCP Console page. Current-state Console captures of the Cloud Run revisions, backups, registry, build history, migration job and secret names are in [evidence/console](../console/README.md); the networking and Cloud SQL overview captures are still needed.
