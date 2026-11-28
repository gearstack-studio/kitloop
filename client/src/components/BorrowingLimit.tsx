import type { BorrowingQuota, QuotaStatus } from '../borrowingQuota'

/**
 * Accessible wording recorded in #82 before RED. The pending count is shown exactly as stored (never clamped, so
 * historical over-limit usage reads "3 of 2"); only the decorative meter is capped at 100%. Active loans are not usage.
 */
export default function BorrowingLimit({ status, quota, busy, onRetry, onRefresh }: {
  status: QuotaStatus; quota: BorrowingQuota | null; busy: boolean; onRetry: () => void; onRefresh: () => void
}) {
  const ready = status === 'ready' && quota !== null
  const full = ready && !quota.canSubmitRequest
  const percent = ready && quota.maxPendingRequests > 0
    ? Math.min(100, Math.round((quota.pendingRequests / quota.maxPendingRequests) * 100)) : 0
  return <section className={`panel quota-panel${full ? ' quota-panel--full' : ''}`} aria-labelledby="quota-heading" aria-busy={status === 'loading'}>
    <div className="section-heading">
      <h2 id="quota-heading">Borrowing limit</h2>
      {ready && <button type="button" className="catalog-retry" onClick={onRefresh} disabled={busy}>Refresh borrowing limit</button>}
    </div>
    {status === 'loading' && <p className="empty" role="status">Loading borrowing limit…</p>}
    {status === 'error' && <div className="catalog-error" role="alert">
      <p>Borrowing limit could not be loaded.</p>
      <button type="button" className="catalog-retry" onClick={onRetry} disabled={busy}>Retry borrowing limit</button>
    </div>}
    {ready && <>
      <p className="quota-usage">{quota.pendingRequests} of {quota.maxPendingRequests} pending requests</p>
      <div className="quota-meter" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
      {full
        ? <p className="quota-limit"><strong>Limit reached.</strong> A checkout, cancellation or custodian decline frees a request slot.</p>
        : <p className="quota-capacity">You can submit {quota.remainingRequestCapacity} more {quota.remainingRequestCapacity === 1 ? 'request' : 'requests'}.</p>}
    </>}
  </section>
}
