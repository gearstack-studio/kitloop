# KitLoop Lab 5 evidence index

Current assessment: 15 November 2026 (Asia/Bangkok). The updated CPE 334 Lab 5 handout is the requirement source. Its Episode 7 path is a reviewed feature PR into staging, a reviewed release PR from staging into main, then deployment **only from main**. The running Cloud Run revision must identify that main commit (R-07, R-08, C-06). A separate cloud staging environment is optional.

This index distinguishes proposed repository work from live results. Earlier episode documents preserve the checks and limitations recorded at their tested commits.

## Episode issue register

The handout calls for a GitHub Issue for each guide step **1–8**. Issue existence records the work; it does not prove an episode's acceptance checks passed. Step 9 is the final documentation and PDF submission, not a separate Episode 9 issue in this register.

| Episode | Repository record | Tracking status |
| --- | --- | --- |
| 1. GCP account and cost control | [#24](https://github.com/gearstack-studio/kitloop/issues/24) | Issue exists. |
| 2. Cloud readiness | [#25](https://github.com/gearstack-studio/kitloop/issues/25) | Issue exists. |
| 3. Docker containerization | [#27](https://github.com/gearstack-studio/kitloop/issues/27) | Issue exists. |
| 4. CI on pull requests | [#29](https://github.com/gearstack-studio/kitloop/issues/29) | Issue exists. |
| 5. First GCP deployment | [#31](https://github.com/gearstack-studio/kitloop/issues/31) | Issue exists; live evidence is still assessed below. |
| 6. WIF and merge gate | [#34](https://github.com/gearstack-studio/kitloop/issues/34), [#35](https://github.com/gearstack-studio/kitloop/issues/35) | Part A and Part B issues exist; merge-gate verification remains open. |
| 7. Automated main release | [#38](https://github.com/gearstack-studio/kitloop/issues/38) | Release code is merged into main through #42. The first main run passed CI with deployment skipped; live pipeline proof remains pending. |
| 8. Persistence check | [#40](https://github.com/gearstack-studio/kitloop/issues/40), [runbook](episode-8-persistence.md) | Baseline, controlled restart and main redeploy persistence PASS; rollback deferral acceptance and independent evidence review remain pending. |

## Required check status

| Handout check | Evidence available now | Status and remaining proof |
| --- | --- | --- |
| C-01: normal PR build and tests | [PR #37's successful CI run](https://github.com/gearstack-studio/kitloop/actions/runs/43618541536) confirms the job context `Build, test and Docker smoke`. | Past CI run verified; Episode 7 PR run pending. |
| C-02: failing required CI blocks merge | [Episode 6 staging ruleset proposal](wif-iam-merge-gates.md). Read-only branch metadata showed both main and staging unprotected on 15 November. | **MISSING:** active main required check, temporary failing PR, and blocked merge evidence. Staging protection also awaits approval. |
| C-03: fresh clone, Docker and configuration | [Clean-clone execution record](c-03-evidence.md) and [PR A hosted CI](evidence/README.md). | **PARTIAL:** clean-clone checks passed at recorded commits; the C-03 record retains reviewer and browser limits. |
| C-04: public URL, sign-in, domain action and rejection | [Deployment runbook](deployment.md) describes the intended checks. | **MISSING:** actual public URL and browser evidence. |
| C-05: record survives restart and redeploy | [Local container persistence checks](evidence/README.md) cover a restart with synthetic data; [Episode 8 runbook](episode-8-persistence.md) and [evidence register](evidence/persistence/README.md) define the live check. | **PASS:** the same selected record/database/fingerprint match across baseline, controlled restart and successful main redeployment; see the linked evidence register. Independent review remains pending. |
| C-06: reviewed main release and matching revision | [Episode 7 workflow proposal](episode-7-deployment.md) and [PR draft](episode-7-pr.md). | **MISSING:** labelled feature PR, reviewed release PR into main, authorized pipeline run, and serving revision tied to its main SHA. |

The required [deployment.md](deployment.md) contains the stack, environment settings, manual first-release commands, and the proposed Episode 7 release procedure. The [WIF IAM review](wif-iam-merge-gates.md) and [eight-image IAM inventory](evidence/iam/README.md) cover Episode 6; inherited IAM analysis remains partial and its staging ruleset is not active. The Episode 7 workflow uses a **separate** proposed deployment identity and does not grant deployment access to the verifier.

Before reporting Lab 5 complete, confirm both teammates' Issue, PR, review, test and deployment contributions (R-09 to R-11), the public repository (R-12), required CI enforcement on main, and every missing live check above. Link the exact run and commit for each result. Do not treat an offline test, a proposed ruleset, or a screenshot of a different commit as live deployment proof.
