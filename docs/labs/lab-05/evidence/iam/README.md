# Issue #35 IAM and WIF screenshot evidence

These eight PNGs are authentic captures from the earlier Cloud Shell and GitHub Actions inspection. They were copied into this Issue #35 worktree from the separate repository checkout and the user's OneDrive screenshot export. Evidence A is the original Cloud Shell image with only the personal email address masked; the unredacted source remains outside this directory. The other seven files are byte-identical to their sources.

| Evidence | Screenshot | What it verifies | Status and limit |
| --- | --- | --- | --- |
| A | [01-wif-impersonation-policy.png](01-wif-impersonation-policy.png) | Service-account policy includes `roles/iam.workloadIdentityUser` for the WIF `principalSet` with repository ID `1442734708`. | VERIFIED direct binding. Does not assess inherited impersonators. Personal email redacted. |
| B | [02-verifier-project-binding.png](02-verifier-project-binding.png) | Project IAM query returns the verifier member bound to `projects/lab-5-cloud-deployment-514310/roles/kitloopWifProjectLookup`. | VERIFIED project-level binding. The filtered output does not list all project members or inherited roles. |
| C | [03-custom-role-permissions.png](03-custom-role-permissions.png) | Live custom role definition lists only `resourcemanager.projects.get`. | VERIFIED displayed role definition at inspection time. |
| D | [04-user-managed-keys.png](04-user-managed-keys.png) | `gcloud iam service-accounts keys list` with `--managed-by=user --format=json` returns `[]`. | VERIFIED no user-managed keys found at inspection time; does not prove keys never existed. |
| E1 | [05-project-hierarchy.png](05-project-hierarchy.png) | Project metadata includes project ID, number, and ACTIVE state; `parent` is not reported by this query. | VERIFIED displayed metadata; absence of `parent` does not rule out inherited access. |
| E2 | [06-inherited-access-incomplete.png](06-inherited-access-incomplete.png) | Cloud Asset Policy Analyzer command shows Cloud Asset API enablement and warns the analysis was `NOT fully explored`. | PARTIAL effective-access analysis. The displayed `[]` and “No matching ACL” cannot establish absence of inherited grants. |
| Provider | [07-wif-provider-trust-condition.png](07-wif-provider-trust-condition.png) | Live provider output shows ACTIVE state, GitHub OIDC issuer, repository and owner IDs, staging ref, event and workflow restrictions, and attribute mappings. | VERIFIED displayed provider configuration; does not assess pool administration or every effective IAM permission. |
| WIF | [08-wif-authentication-success.png](08-wif-authentication-success.png) | [GitHub Actions attempt 3](https://github.com/gearstack-studio/kitloop/actions/runs/43611041165/attempts/3) shows success for the staging push at commit `c75cdf1c00634e52070d32b90cc4047076316c04`. | PASSED. The screenshot shows the run summary; the hosted job steps separately confirm successful OIDC authentication and read-only project lookup. Attempts 1 and 2 failed at lookup; their raw diagnostic was suppressed. |

## Source and handling

A–E1 and the provider image came from `D:\SWE_Project\kitloop\docs\labs\lab-05\evidence\iam\`. E2 came from the user's OneDrive Screenshots export, `Screenshot 2026-11-14 231448.png`. The WIF image came from the separate repository checkout, where it was misnamed `07-wif-provider-trust-condition.png.png`. The provider image there was misnamed `06-inherited-access-incomplete.png`. Their filenames were corrected only in this worktree; source images were not changed.

Evidence A was masked at image coordinates x=70–205 and y=76–89 (inclusive) to remove only the visible personal email. A decoded-pixel comparison found **zero changes outside that rectangle**. The generated image-edit attempt was discarded because it altered other terminal text; it is not part of this evidence set. The seven other PNGs match their sources byte for byte. Visual inspection found no access tokens, credentials, private keys, or key material. Project and service-account identifiers required to understand the IAM findings remain visible.

These captures support Issue #35's IAM review and authenticated WIF lookup. They do not complete the effective inherited-access audit or demonstrate active GitHub merge gates. The ruleset remains a proposal, and Issue #35 stays open.
