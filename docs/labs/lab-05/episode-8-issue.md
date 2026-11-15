# Proposed issue: [Lab 5] Episode 8 Verify Persistence and Rollback

**Lab 5 issue register:** [E1 #24](https://github.com/gearstack-studio/kitloop/issues/24) · [E2 #25](https://github.com/gearstack-studio/kitloop/issues/25) · [E3 #27](https://github.com/gearstack-studio/kitloop/issues/27) · [E4 #29](https://github.com/gearstack-studio/kitloop/issues/29) · [E5 #31](https://github.com/gearstack-studio/kitloop/issues/31) · [E6 #34](https://github.com/gearstack-studio/kitloop/issues/34), [#35](https://github.com/gearstack-studio/kitloop/issues/35) · [E7 #38](https://github.com/gearstack-studio/kitloop/issues/38) · [E8 pending](episode-8-issue.md) (local draft, no GitHub issue). [Current status](README.md#episode-issue-register).

**GitHub status:** No dedicated Episode 8 issue was found among the repository's Issues on 15 November 2026. The GitHub integration rejected issue creation with `403 Resource not accessible by integration`. This file records the proposed issue text; it is **not** a GitHub issue or proof of completed work. Confirm the developer and reviewer with the team before opening it. Apply the `lab5` label.

## Objective

Verify that a KitLoop record created on the public GCP service survives an application restart and a later main-branch redeploy (Lab 5 R-04, check C-05). If safe and separately approved, exercise rollback and roll-forward as the updated handout recommends.

## Dependencies

- [Episode 5 first public deployment, #31](https://github.com/gearstack-studio/kitloop/issues/31).
- [Episode 6 merge gate, #35](https://github.com/gearstack-studio/kitloop/issues/35).
- [Episode 7 reviewed main release pipeline, #38](https://github.com/gearstack-studio/kitloop/issues/38).
- An identified main release commit, public URL, persistent database, and current backup state.

## Checklist

- [ ] Read-only: record the public service URL, database identity, current serving revision, image digest, main source commit, and backup state.
- [ ] Create one non-sensitive test record through the normal UI; capture its visible identifier and time.
- [ ] Restart the application service without resetting the database; verify the same record through the UI and API.
- [ ] Redeploy a reviewed main release through the pipeline; verify the same record again.
- [ ] If separately approved, route traffic to a previously verified compatible revision, check the record, then roll forward to the reviewed main revision and check again.
- [ ] Record exact commands, CI and deployment run links, commits, revisions, URL, outcomes, and failures in [deployment.md](deployment.md) and the [Lab 5 evidence index](README.md).

## Acceptance and evidence

- **C-05 / R-04:** authentic before-and-after screenshots show the same record before restart, after restart, and after redeploy. Include the public URL and a sanitized identifier; exclude personal data.
- **C-06 / R-07 / R-08:** link the feature PR into staging, release PR into main, required CI, deployment run, and serving revision tied to the main commit.
- Mark the rollback/roll-forward exercise as recommended and report its actual result. Routing traffic back does **not** undo a database migration.
- Record a failure and its diagnosis rather than claiming a pass. Local container persistence tests do not establish live C-05.
- Remove passwords, tokens, cookies, connection strings, keys, and unnecessary personal details from evidence.

## Safety and ownership

This tracking draft does not authorize a GCP restart, deployment, rollback, IAM change, billable resource, or branch-rule change. Obtain the required approvals before live operations. Assign a developer and reviewer before work begins; both team members' contributions should be traceable through issues, PRs, checks, and review.
