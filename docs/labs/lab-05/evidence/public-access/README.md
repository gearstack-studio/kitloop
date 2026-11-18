# Public access evidence (C-04)

[rejection-probes.json](rejection-probes.json) records unauthenticated HTTPS requests to the public service on 2026-11-16 at 05:05 UTC. SHA-256: `6bd567585592c34e9e4174e2922697d6f9eb8b4698167bec1188855b7d6c134e`.

| Request | Expected | Observed |
|:--|:--|:--|
| `GET /api/health` | 200 | 200 |
| `GET /api/requests/mine` without a session | 401 `UNAUTHENTICATED` | 401 `UNAUTHENTICATED` |
| `GET /api/requests/pending` without a session | 401 `UNAUTHENTICATED` | 401 `UNAUTHENTICATED` |
| `POST /api/requests` without a session | 401 `UNAUTHENTICATED` | 401 `UNAUTHENTICATED` |

## Safety

The requests carried no cookie, CSRF token or credentials. The domain router applies `requireAuth` before every route ([domain.ts](../../../../../server/src/domain.ts)), and `requireAuth` rejects a missing cookie before any database query ([auth.ts](../../../../../server/src/auth.ts)). No data was created, read or changed, and no response set a cookie.

## Limits

- The serving revision is not visible in HTTP responses. The last recorded revision is `kitloop-be72f87e15a6-20261115143840`.
- These probes cover unauthenticated rejection only. A live role-based denial, such as a Borrower calling a Custodian route, needs a synthetic Borrower session and was not run. CI integration tests cover role denial.
- The positive half of C-04 (public sign-in and a valid request) is the [baseline UI screenshot](../persistence/baseline-ui.png) and the authenticated [persistence observations](../persistence/README.md).
