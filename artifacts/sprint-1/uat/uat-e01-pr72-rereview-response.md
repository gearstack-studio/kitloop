Thanks. You're right: the `bbf8a36` guard checked the serving revision's flag, not the database. With the new tests, the `bbf8a36` scripts let **phase 2 → phase 1 → pre-lifecycle with lifecycle rows** move traffic. That's the first failure in the suite's RED run, and the confirmation-only `KITLOOP_CONFIRM_PRE_LIFECYCLE_ROLLBACK` bypass made it worse.

### What changed

**Every rollback to a pre-lifecycle revision now requires a verified database check**, whichever phase is serving:

1. **Refused up front** if a serving revision has `REQUEST_LIFECYCLE_WRITES=enabled` (rows could be written after the check; roll back to phase 1 first), if Cloud Run jobs can't be listed, or if the `kitloop-reconcile` job exists (the only other lifecycle writer).
2. After the typed confirmation, `release.sh` runs the Cloud Run job **`kitloop-rollback-check`**:
   - **What it runs:** `node dist/lifecycle-cli.js rollback-check --require-zero --expect-database=kitloop`.
   - **Image:** the image of a serving lifecycle-aware revision. If none is serving, `KITLOOP_ROLLBACK_CHECK_REVISION` names one, but it only selects the image.
   - **Identity and database:** the runtime service account and the service's own `kitloop-database-url:1` secret and Cloud SQL connection.
   - **Limits:** `--max-retries=0`, with task and client timeouts.
3. **The check itself:**
   - runs in a PostgreSQL `READ ONLY` transaction
   - refuses unless `current_database()` is `kitloop`
   - exits **0 only when `lifecycleOnlyRows` is 0** (4 when rows exist, 1 when the database is unreachable or on error)
   - never prints the connection string
4. **Verification:** `release.sh` accepts only a **new** execution that succeeded with exactly that image, command and arguments. A failed, timed-out, malformed or reused execution is refused.
5. **Re-check:** it re-reads the serving set and repeats step 1, and only then calls `update-traffic`. Every refusal says *"Traffic was not changed."*

**Also changed:**
- The confirmation bypass is **removed**. A typed confirmation authorises the action but never replaces the check.
- `release.sh deploy` now also refuses commits known to predate the lifecycle migration, so pre-lifecycle code can't reach traffic through a redeploy that skips the check.

### Regression coverage

`infra/gcp/guards.test.sh` runs offline with a fake gcloud whose check job succeeds only for a zero-row fake database. Every blocked case asserts that no `update-traffic` call happened and the serving revision is unchanged.

| Scenario | Result |
|---|---|
| Phase 2 → phase 1 → pre-lifecycle with lifecycle rows | BLOCKED |
| Phase 2 → pre-lifecycle with rows, and with zero rows | BLOCKED |
| Phase 1 → pre-lifecycle with rows | BLOCKED |
| Phase 1 → pre-lifecycle with a verified zero-row check (check runs before `update-traffic`) | ALLOWED |
| Check unavailable / malformed execution / positive count | BLOCKED |
| Operator confirmation without a passing check | BLOCKED |
| Reconciliation job present / jobs unlistable | BLOCKED |
| `deploy` of `8b6e5a9` | BLOCKED |
| Phase 2 → phase 1 → pre-lifecycle, 0 or more rows, while phase 2 still holds the `candidate` tag | BLOCKED |
| Phase 2 → phase 1 | ALLOWED |

**Found in a final self-audit:** a revision that keeps a tag at 0% traffic is still invokable through its tag URL. After phase 2 → phase 1, the phase-2 revision normally keeps `candidate`, so it could still write lifecycle rows after a zero-row check. The preflight now treats every revision reachable by traffic share **or tag** as a possible writer. It refuses and names the `--remove-tags` command, and the final re-check compares tags too.

`server/tests/lifecycle-rollout.test.ts` adds 4 tests that run the real CLI against an isolated database: 0 = safe, 4 = rows present after phase 2 → phase 1, 2 = wrong or missing database, 1 = unreachable, with no credentials in the output.

**RED on `bbf8a36`:** the guard suite fails first on your sequence, and the 4 gate tests fail. **GREEN:** the guard suites pass, server 110/110, client 42/42, typecheck, lint and builds clean, browser E2E 31/31.

The E2E run needed `NODE_OPTIONS=--dns-result-order=ipv4first`: this machine resets IPv6 `localhost` connections. `bbf8a36` fails the same way without the option, and this change touches no code the app loads.

### Not verified, and what's left

- The check job hasn't run in GCP. Its IAM and Cloud Run's execution JSON were verified only against the fake. A failure there blocks the rollback rather than allowing it.
- The seconds between the final re-check and `update-traffic` aren't locked. Automated releases are serialised; manual releases must not run concurrently.
- Traffic changes made outside `release.sh` (Console, raw gcloud) bypass the gate.
- Once phase 2 has written any row, a pre-lifecycle rollback is intentionally impossible through `release.sh`.

Runbook: `infra/gcp/REQUEST-LIFECYCLE-ROLLOUT.md`, under "Safe rollback targets". Details and evidence: `artifacts/sprint-1/uat/uat-e01-lab6-report.md` §12, `uat-e01-rereview-red.txt`, `uat-e01-rereview-green.txt`.
