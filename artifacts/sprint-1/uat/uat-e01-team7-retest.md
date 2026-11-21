# UAT-E01 retest instructions for Team 7 (issue #61)

These steps retest UAT-E01, *"competing borrow requests stay PENDING after the asset is checked out to someone else"*, once PR #72 is deployed.

## Before you start: is the fix switched on?

The fix ships in two phases (see [the rollout runbook](../../../infra/gcp/REQUEST-LIFECYCLE-ROLLOUT.md)). Retest only once the team confirms that **phase 2 is live and the reconciliation step has been applied** on the environment you're testing. You can check yourself:

- Signed in as a borrower with a PENDING request, a **Cancel request** button appears on that request in *My requests*. If it doesn't, the deployment is still in phase 1, and the old behaviour (competing requests stay PENDING) is expected.
- Or open `https://<environment>/api/auth/me` while signed in and look for `"features":{"requestLifecycleActions":true}`.

## Retest 1: your original UAT-E01 example

1. Sign in as the borrower whose request was left PENDING in the original report.
2. Open **My requests**.
3. **Expected:**
   - If the competing loan is still active, the request shows `DECLINED`, with *Reason: Equipment was checked out to another borrower* and a *Closed …* time. That time is when the reconciliation ran, not when the original checkout happened.
   - If the other borrower's loan has already been **returned**, the request correctly stays `PENDING`, because the equipment can be checked out again. Report this case, but it isn't a failure.
4. Sign in as the assigned custodian and open **Pending requests**. **Expected:** the declined request is no longer listed.

If the request is still `PENDING` while the competing loan is active, ask the operator whether the reconciliation was applied, and attach the request ID and asset ID to your report.

## Retest 2: a fresh competing-request scenario

1. Borrower A and Borrower B each request the **same available** asset. **Expected:** both are `PENDING`.
2. The custodian checks out Borrower A's request. **Expected:** the notice says other pending requests for the equipment were declined.
3. Borrower A, **My requests**: `CHECKED_OUT`.
4. Borrower B, **My requests**: `DECLINED`, with *Reason: Equipment was checked out to another borrower*, a *Closed* time, and no Cancel button.
5. Custodian, **Pending requests** (refresh the page): Borrower B's request is gone.

## Retest 3: other lifecycle actions (optional)

- **Cancel:** a borrower cancels their own PENDING request. It becomes `CANCELLED` (*Reason: Cancelled by the borrower*), and they can request the same available equipment again.
- **Decline:** the custodian picks a reason and declines a PENDING request. The Decline button stays disabled until a reason is chosen. The borrower sees `DECLINED` with that reason.

## What not to expect: no automatic expiry

`EXPIRED` exists in the system but is **not used yet**. There's no timeout policy, so **requests don't expire on their own**. A request that nobody acts on stays `PENDING` until it's:

- checked out (it becomes `CHECKED_OUT`)
- declined because someone else's request was checked out
- cancelled by the borrower
- declined by the custodian with a reason

Automatic expiry needs an approved timeout policy and will be delivered as a separate change.

## Reporting

For each retest step, record pass or fail, the environment URL, the date and time with time zone, the request ID and asset ID, and a screenshot of *My requests* or *Pending requests*. Post the results on issue #61.
