# Episode 8 - Verify Persistence and Rollback (Issue #40)

**Lab 5 issue register:** [E1 #24](https://github.com/gearstack-studio/kitloop/issues/24) · [E2 #25](https://github.com/gearstack-studio/kitloop/issues/25) · [E3 #27](https://github.com/gearstack-studio/kitloop/issues/27) · [E4 #29](https://github.com/gearstack-studio/kitloop/issues/29) · [E5 #31](https://github.com/gearstack-studio/kitloop/issues/31) · [E6 #34](https://github.com/gearstack-studio/kitloop/issues/34), [#35](https://github.com/gearstack-studio/kitloop/issues/35) · [E7 #38](https://github.com/gearstack-studio/kitloop/issues/38) · [E8 #40](https://github.com/gearstack-studio/kitloop/issues/40) ([verification runbook](episode-8-persistence.md)). [Current status](README.md#episode-issue-register).

**GitHub status:** [Issue #40](https://github.com/gearstack-studio/kitloop/issues/40) exists, assigned in its ownership section to DEV4952 with yiiipunn as reviewer. Branch `feat/8-persistence-rollback` prepares [the capture procedure](episode-8-persistence.md). Live verification is blocked until the public service and main deployment pipeline are operational. See [the evidence register](evidence/persistence/README.md).

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

Obtain authorization for each live restart, deployment or traffic change before execution. The capture tool performs read-only inventory and selected-record checks with a temporary login session. Both team members' contributions and actual results must be traceable through issues, PRs, checks and review. Keep #40 open until its live acceptance checks and review are complete.
