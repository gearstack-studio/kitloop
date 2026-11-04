# FEAT-02 manual integration test: catalog refresh after request and checkout

Status: **NOT EXECUTED.** This is a procedure for a person to run. No result in this file has been observed. The mocked-API browser checks in `logs/final-ui-browser-checks.log` exercise the client refetch logic only; they are not a substitute for this procedure.

## Why this needs a person
Checkout is permanent in the current code (there is no return endpoint until Sprint 2), and it changes the shared development database. QA did not run it, did not reseed, and did not touch the demo accounts.

## Preconditions
- PostgreSQL running; API on `http://localhost:3000` (`npm run dev` in `server`); client on `http://localhost:5173` (`npm run dev` in `client`). Use exactly that client address.
- Preferably a **throwaway database** (a copy migrated and seeded for this test), because the steps leave a loan behind. Seeding applies only to that throwaway database; never to a shared one without approval.
- Demo passwords are in the ignored `server/.env` (`DEMO_BORROWER_PASSWORD`, `DEMO_CUSTODIAN_PASSWORD`); copy the value without quote marks.
- Scope in the original seed: `custodian.demo` manages `KL-CAM-001`; `custodian.other` manages `KL-LAP-001`. Use `KL-CAM-001` below.
- Two browser windows (or one normal and one private window) so both roles can stay signed in.

## Procedure

| # | Actor | Step | Expected result | Result (fill in) |
| --- | --- | --- | --- | --- |
| 1 | Window A: `borrower.demo` | Sign in and open the dashboard. Note the `KL-CAM-001` card. | Equipment catalog heading and count are shown; `KL-CAM-001` badge reads "Available"; its Request to borrow button is enabled. | |
| 2 | Window B: `custodian.demo` | Sign in. Note the `KL-CAM-001` card. | Same card, "Available", and no request button. | |
| 3 | Window A | Click Request to borrow on `KL-CAM-001`. | Notice "Borrow request submitted."; the catalog refetches; **`KL-CAM-001` is still "Available"** (a request does not reserve; BR-10); "My requests" lists one pending request. | |
| 4 | Window B | Reload. Under Pending requests find the request for `KL-CAM-001`, choose a future due date, click Check out. | Notice "Checkout recorded. Active loan created."; the catalog refetches and **`KL-CAM-001` now reads "Checked out"** in this window without a manual reload. | |
| 5 | Window A | Without acting, look at the catalog. | Still "Available". The client does not poll, so another user's change appears only after a reload or an action. Record this as expected current behaviour. | |
| 6 | Window A | Reload the page. | `KL-CAM-001` reads "Checked out" and its request button is disabled with the accessible name ending "is checked out and cannot be requested". | |
| 7 | Window A | Check that the catalog shows no due date, borrower or custodian information on the card. | Only name, category, description, Asset ID and badge. | |
| 8 | Window A | **Risk I1 observation.** With `KL-CAM-001` checked out, try to submit another request for it through the API (for example from the browser console or a REST client with the session cookie and CSRF header). | **Current behaviour:** the API accepts the request (201) because `POST /requests` does not check availability. This is the recorded FEAT-03 risk, not a FEAT-02 failure. A passing FEAT-03 implementation should return 409. Record what you see. | |
| 9 | Window B | Create a second pending request first (from another borrower session, for example `borrower.other`, on `KL-CAM-001`), then attempt checkout of it while the first loan is active. | The API returns 409 "Asset is unavailable"; Window B shows the message and the catalog stays/becomes "Checked out" (the client refetches after a 409). | |
| 10 | Either | Stop the API briefly and reload. | The catalog panel shows "Equipment could not be loaded." with Retry; restarting the API and pressing Retry loads the catalog. | |

## Cleanup (run by the tester, on the throwaway database only)
Checkout cannot be undone in the application until FEAT-04 adds return. To restore a throwaway database, delete the loan and the test requests for `KL-CAM-001` or recreate the database. QA did not run any cleanup.

## Recording
Save screenshots in `artifacts/sprint-1/equipment-catalog/screenshots/` with the step number in the name, note the date and commit, and mark each row PASS, FAIL or BLOCKED. Do not mark a row PASS unless it was observed.
