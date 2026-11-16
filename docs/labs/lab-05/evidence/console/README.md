# GCP Console capture checklist (Episode 5)

Status: **PENDING**. No captures exist yet. This checklist is for an operator signed in to project `lab-5-cloud-deployment-514310`. Every page is read-only; do not click Edit, Deploy, Delete, Restore or any other action.

The handout (Section 12) asks for screenshots only where a link cannot show the fact, such as a GCP Console setting. Each capture needs a numbered caption naming what it shows, the check or requirement it proves, and the revision, build or URL it comes from.

## Captures

| # | File name | Direct URL | Must show | Proves |
|:--|:--|:--|:--|:--|
| 1 | `e5-01-cloud-run-revisions.png` | [Cloud Run revisions](https://console.cloud.google.com/run/detail/asia-southeast1/kitloop/revisions?project=lab-5-cloud-deployment-514310) | `kitloop-be72f87e15a6-20261115143840` at 100% traffic; earlier revisions; image digest `f149e6db...` in the revision panel | R-03, R-08, C-06 |
| 2 | `e5-02-cloud-run-networking.png` | Same service, **Networking** tab | Ingress setting; VPC egress to the private network | R-03 |
| 3 | `e5-03-cloud-sql-overview.png` | [Cloud SQL overview](https://console.cloud.google.com/sql/instances/kitloop-pg/overview?project=lab-5-cloud-deployment-514310) | Instance `kitloop-pg`, PostgreSQL version, tier, region `asia-southeast1`, private IP and no public IP | R-04 |
| 4 | `e5-04-cloud-sql-backups.png` | [Cloud SQL backups](https://console.cloud.google.com/sql/instances/kitloop-pg/backups?project=lab-5-cloud-deployment-514310) | Automated backups enabled; backup `1794732111059` completed 2026-11-15 08:43 UTC | R-04 |
| 5 | `e5-05-artifact-registry.png` | [Artifact Registry `kitloop`](https://console.cloud.google.com/artifacts/docker/lab-5-cloud-deployment-514310/asia-southeast1/kitloop?project=lab-5-cloud-deployment-514310) | Images `kitloop-app` and `kitloop-migration`, with tag `be72f87e15a6` and digests `f149e6db...` and `e35d9834...` | R-08 |
| 6 | `e5-06-cloud-build.png` | [Cloud Build history](https://console.cloud.google.com/cloud-build/builds;region=asia-southeast1?project=lab-5-cloud-deployment-514310) | Build `676619ea-a64f-4e49-89d5-cdb2a884a312`, status SUCCESS, 2026-11-15 14:33 UTC | R-07 |
| 7 | `e5-07-migration-job.png` | [Migration job executions](https://console.cloud.google.com/run/jobs/details/asia-southeast1/kitloop-migrate/executions?project=lab-5-cloud-deployment-514310) | Execution `kitloop-migrate-4d8sw` succeeded | R-04, R-07 |
| 8 | `e5-08-secret-manager.png` | [Secret Manager](https://console.cloud.google.com/security/secret-manager?project=lab-5-cloud-deployment-514310) | Secret **names** only: `kitloop-database-url`, `kitloop-csrf`, `kitloop-bootstrap-input` | R-02 |

## Redaction rules

The repository is public, and the handout forbids screenshots that show secrets.

- Do not open a secret version, the **Actions > View secret value** dialog, the Cloud SQL **Users** page or any connection-string field.
- Crop out the account avatar and email in the top bar. Project ID and number may stay visible; they already appear in public evidence.
- Do not capture the Cloud Run **Variables & Secrets** tab with values expanded.
- Crop to the relevant panel, and keep text readable at 100% zoom. Do not shrink a full-screen capture.
- Before committing, inspect every image at full size for emails, tokens, passwords and connection strings.

## Recording

1. Save the files in this folder with the names above. Do not edit them beyond cropping.
2. Add a row per file to the table below: capture time (UTC), operator login, SHA-256 checksum and caption.
3. Label the captures as the **state at capture time**. They are not first-release evidence; the [Cloud Shell first-release capture](../deployment/first-release-publish-cloud-shell.png) covers the first release.

| File | Captured (UTC) | Operator | SHA-256 | Caption |
|:--|:--|:--|:--|:--|
| None yet | | | | |
