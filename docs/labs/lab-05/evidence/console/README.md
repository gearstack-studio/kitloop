# GCP Console captures (Episode 5)

Status: **PARTIAL**. Six of eight captures are verified and committed. Captures 2 and 3 are still needed. All pages are read-only; do not click Edit, Deploy, Delete, Restore or any other action.

The handout (Section 12) asks for screenshots only where a link cannot show the fact, such as a GCP Console setting. Each capture needs a numbered caption naming what it shows, the check or requirement it proves, and the revision, build or URL it comes from.

## Checklist

| # | File name | Direct URL | Must show | Proves |
|:--|:--|:--|:--|:--|
| 1 | `e5-01-cloud-run-revisions.png` | [Cloud Run revisions](https://console.cloud.google.com/run/detail/asia-southeast1/kitloop/revisions?project=lab-5-cloud-deployment-514310) | `kitloop-be72f87e15a6-20261115143840` at 100% traffic; earlier revisions | R-03, R-08, C-06 |
| 2 | `e5-02-cloud-run-networking.png` | Same service, **Networking** tab | Ingress setting; VPC egress to the private network | R-03 |
| 3 | `e5-03-cloud-sql-overview.png` | [Cloud SQL overview](https://console.cloud.google.com/sql/instances/kitloop-pg/overview?project=lab-5-cloud-deployment-514310) | Instance `kitloop-pg`, PostgreSQL version, tier, region, private IP and no public IP | R-04 |
| 4 | `e5-04-cloud-sql-backups.png` | [Cloud SQL backups](https://console.cloud.google.com/sql/instances/kitloop-pg/backups?project=lab-5-cloud-deployment-514310) | Automated backups enabled; the Episode 8 baseline backup | R-04 |
| 5 | `e5-05-artifact-registry.png` | [Artifact Registry `kitloop`](https://console.cloud.google.com/artifacts/docker/lab-5-cloud-deployment-514310/asia-southeast1/kitloop?project=lab-5-cloud-deployment-514310) | Images `kitloop-app` and `kitloop-migration` | R-08 |
| 6 | `e5-06-cloud-build.png` | [Cloud Build history](https://console.cloud.google.com/cloud-build/builds;region=asia-southeast1?project=lab-5-cloud-deployment-514310) | Build `676619ea-a64f-4e49-89d5-cdb2a884a312`, success | R-07 |
| 7 | `e5-07-migration-job.png` | [Migration job executions](https://console.cloud.google.com/run/jobs/details/asia-southeast1/kitloop-migrate/executions?project=lab-5-cloud-deployment-514310) | Execution `kitloop-migrate-4d8sw` succeeded | R-04, R-07 |
| 8 | `e5-08-secret-manager.png` | [Secret Manager](https://console.cloud.google.com/security/secret-manager?project=lab-5-cloud-deployment-514310) | Secret **names** only | R-02 |

## Verified captures

Captured by yiiipunn in the GCP Console on 16 November 2026 and saved between 08:21 and 08:36 UTC (file times). Each was inspected before commit. The only change was cropping 70 px from the right edge to remove the account avatar; the originals are kept outside the repository. Console times are shown in GMT+7.

| Figure | File | What it shows | SHA-256 |
|:--|:--|:--|:--|
| E5-1 | [e5-01-cloud-run-revisions.png](e5-01-cloud-run-revisions.png) | Service `kitloop`: revision `kitloop-be72f87e15a6-20261115143840` at 100%, deployed by `kitloop-wif-deploy`; earlier revisions `kitloop-284f41973f61-20261115090539` and `-20261115080104` at 0%. Secret variables appear as references (`kitloop-database-url:1`, `kitloop-csrf:1`), not values. The image digest is truncated. | `0d47a54efd764f46fcec7fe619ed1bc25fbbb76b408b1f80d209f73d714929b0` |
| E5-4 | [e5-04-cloud-sql-backups.png](e5-04-cloud-sql-backups.png) | `kitloop-pg`, PostgreSQL 17: automated backups enabled, 7 retained, window 1:00 to 5:00 GMT+7; on-demand "Lab 5 Episode 8 baseline" backup created 15 Nov 3:41:51 PM GMT+7 (08:41:51 UTC) | `690a5845f8d384470e1030ea7bf1e3734df3da6e589a21c190a0bf5860d31031` |
| E5-5 | [e5-05-artifact-registry.png](e5-05-artifact-registry.png) | Repository `kitloop` in `asia-southeast1` with images `kitloop-app` and `kitloop-migration`. Tags and digests are not shown. | `7d713a606b4bef193a1a9869029ee9a4be94c4895c26cb044b47e8c9aa7e88ba` |
| E5-6 | [e5-06-cloud-build.png](e5-06-cloud-build.png) | Build `676619ea` succeeded on 15 Nov 9:33 PM GMT+7 (14:33 UTC) in 3 min 37 s, matching the [release log](../deployment/release-run-43717180011-log-excerpt.txt); two earlier successful builds | `d5ef6ab3d8074105aee66f9ec0ddc8871741e2a72dcf41f1f546d1ae509e727c` |
| E5-7 | [e5-07-migration-job.png](e5-07-migration-job.png) | Job `kitloop-migrate`: execution `kitloop-migrate-4d8sw`, 1 succeeded and 0 failed, ended 15 Nov 9:38:18 PM GMT+7 (14:38:18 UTC), executed by `kitloop-wif-deploy` | `4ce106d5a4648242af4cdb188c7500049807cea5069b91e871790930e9e80fa1` |
| E5-8 | [e5-08-secret-manager.png](e5-08-secret-manager.png) | Secrets `kitloop-bootstrap-input`, `kitloop-csrf`, `kitloop-database-url` in `asia-southeast1`; names only, no secret selected | `adfa7e1ba018ae0cb9733d08be9d780551cad239c87df8fcdbd09a0900d4e4bb` |

These captures show the state on 16 November. They confirm the release resources recorded on 15 November, but they are not first-release captures.

## Still needed

| # | File | Reason |
|:--|:--|:--|
| 2 | `e5-02-cloud-run-networking.png` | Not captured |
| 3 | `e5-03-cloud-sql-overview.png` | The capture showed "You need additional access" (`cloudsql.instances.get` missing) with no project selected, so it was not used. Retry with project `lab-5-cloud-deployment-514310` selected, using an account that can view the instance. |

## Redaction rules

The repository is public, and the handout forbids screenshots that show secrets.

- Do not open a secret version, the **View secret value** dialog, the Cloud SQL **Users** page or any connection-string field.
- Crop out the account avatar and email in the top bar. Project ID and number may stay visible; they already appear in public evidence.
- Do not expand secret values on the Cloud Run **Variables & Secrets** view; secret references are acceptable.
- Crop to the relevant panel, and keep text readable at 100% zoom.
- Inspect every image at full size for emails, tokens, passwords and connection strings before committing.
