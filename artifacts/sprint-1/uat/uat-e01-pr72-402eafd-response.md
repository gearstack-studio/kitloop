Thanks. Confirmed: at `402eafd`, a full SHA that isn't in the checkout skipped the `deploy` guard. With the new regression against the `402eafd` scripts, that commit's registry image was deployed, passed the candidate `/api/version` check (the image reports its own commit) and received 100% of traffic. The cause was a single combined condition, *resolves locally **and** lacks the migration*, whose first clause was false.

### Fix

`release.sh` has a new `verified_release_commit`. It's now the **first statement** of `deploy`, `migrate` and `bootstrap`, before any registry lookup or Cloud Run call. It runs separate fail-closed steps, each with its own refusal ending *"Nothing was changed."*:

1. The input is 12–40 lowercase hex characters. Git is available, and `release.sh` is inside a Git checkout.
2. `git rev-parse --verify "$input^{object}"` succeeds **in the checkout containing `release.sh`**. Unknown SHAs and ambiguous abbreviations are refused. Before, abbreviated SHAs were resolved in the current directory.
3. The resolved ID starts with the input, so a ref name that only looks like a SHA is refused.
4. The object type is `commit`. Blobs, trees and annotated tag objects are refused.
5. `server/prisma/migrations/20261121090000_request_lifecycle/migration.sql` is a file in that commit.

The canonical 40-character SHA then drives the image tags and the `/api/version` check. A registry image or an operator confirmation never substitutes for these checks. Rollback guards are unchanged.

### Regression

`infra/gcp/guards.test.sh` now runs a copy of `infra/gcp` inside a disposable Git repository of **real** commits (before, the release SHAs were made-up strings). Each refused case asserts:
- a nonzero exit and a specific message;
- **no** `gcloud artifacts docker`, `run jobs`, `run deploy`, `run services`, `run revisions`, `update-traffic`, `sql instances` or `builds` call;
- unchanged traffic.

| Scenario | Result |
|---|---|
| Unknown full SHA whose registry images and completed migration job exist (your path) | REFUSED |
| Unknown abbreviated SHA | REFUSED |
| Known pre-lifecycle SHA, full and abbreviated | REFUSED |
| Commit with the lifecycle migration removed | REFUSED |
| Blob, tree, annotated tag object | REFUSED |
| Tag name, `HEAD`, SHA-like branch name, malformed SHAs | REFUSED |
| `migrate` / `bootstrap` of an unknown or pre-lifecycle SHA | REFUSED |
| Lifecycle-aware commit (abbreviated input, canonicalised) | ALLOWED |

**RED on `402eafd`:** `FAIL: deploy of an unknown full SHA with registry images and a migration execution (unexpected success)`.

**GREEN:**
- release guard suite and the 16 deployment guard cases pass
- `bash -n` and `shellcheck -S warning` are clean
- server 110/110, client 42/42
- typecheck, lint and builds clean
- browser E2E 31/31 (with `NODE_OPTIONS=--dns-result-order=ipv4first`; this machine resets IPv6 `localhost` connections)

### Remaining limitations

- **Image provenance.** This proves the *commit*. The image is still found by the mutable tag `<sha[0:12]>` and tied to the commit only by its self-reported `BUILD_COMMIT_SHA`, checked before traffic moves. There's no signature or attestation. `prepare.sh` grants repository write only to the Cloud Build service account, but project owners and editors can also push. The first deployment of a new service skips the candidate check.
- **Not run in GCP.** As before, everything is verified offline only.

Runbook: `infra/gcp/REQUEST-LIFECYCLE-ROLLOUT.md` ("Release source verification"). Details: `artifacts/sprint-1/uat/uat-e01-lab6-report.md` §14, `uat-e01-402eafd-red.txt`, `uat-e01-402eafd-green.txt`.
