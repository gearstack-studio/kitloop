import { borrowEligibility, type QuotaState } from '../borrowEligibility'
import type { BorrowRequest, RequestStatus } from './Requests'

export type Asset = { assetId: string; name: string; category: string; description: string; available: boolean }
export type CatalogStatus = 'loading' | 'ready' | 'error'

type CatalogProps = {
  assets: Asset[]
  status: CatalogStatus
  onRetry: () => void
  /** Borrowers see a request control (behaviour owned by FEAT-03); custodians see none. */
  canRequest: boolean
  requests: BorrowRequest[]
  requestStatus: RequestStatus
  busy: boolean
  onRequest: (assetId: string) => void
  /** CR-01 (#82): the borrower's pending-request quota; 'off' keeps the pre-CR-01 behaviour. */
  quota?: QuotaState
  onRetryQuota?: () => void
}

export default function Catalog({ assets, status, onRetry, canRequest, requests, requestStatus, busy, onRequest, quota = 'off', onRetryQuota }: CatalogProps) {
  const quotaLabel = quota === 'reached' ? 'Limit reached' : quota === 'error' ? 'Borrowing limit unavailable' : 'Checking limit'
  return <section className="panel catalog" aria-labelledby="catalog-heading" aria-busy={status === 'loading'}>
    <div className="section-heading">
      <h2 id="catalog-heading">Equipment catalog</h2>
      {status === 'ready' && <span className="catalog-count">{assets.length} {assets.length === 1 ? 'asset' : 'assets'}</span>}
    </div>
    {status === 'loading' && <p className="empty" role="status">Loading equipment…</p>}
    {status === 'error' && <div className="catalog-error" role="alert">
      <p>Equipment could not be loaded.</p>
      <button type="button" className="catalog-retry" onClick={onRetry}>Retry</button>
    </div>}
    {canRequest && quota === 'error' && <div className="catalog-error" role="alert">
      <p>Borrowing limit could not be loaded.</p>
      <button type="button" className="catalog-retry" onClick={onRetryQuota} disabled={busy}>Retry borrowing limit</button>
    </div>}
    {status === 'ready' && assets.length === 0 && <p className="empty">No equipment is listed yet.</p>}
    {status === 'ready' && assets.length > 0 && <ul className="asset-grid">
      {assets.map(asset => {
        const eligibility = borrowEligibility(asset, requests, quota)
        const pending = requestStatus === 'ready' && eligibility === 'pending'
        const limited = requestStatus === 'ready' && eligibility === 'quota'
        return <li key={asset.assetId}>
            <article className={asset.available ? 'asset-card' : 'asset-card asset-card--unavailable'}>
              <div className="asset-meta">
                <span>{asset.category}</span>
                <span className={asset.available ? 'available' : 'unavailable'}>{asset.available ? 'Available' : 'Checked out'}</span>
              </div>
              <h3>{asset.name}</h3>
              <p>{asset.description}</p>
              <div className="asset-footer">
                <code>{asset.assetId}</code>
                {canRequest && <button
                  type="button"
                  disabled={busy || requestStatus !== 'ready' || eligibility !== 'eligible'}
                  aria-label={pending
                    ? `Request pending: you already have a pending request for ${asset.name}, ${asset.assetId}`
                    : limited
                      ? quota === 'reached'
                        ? `Request limit reached: ${asset.name}, ${asset.assetId} cannot be requested now`
                        : `${quota === 'error' ? 'Borrowing limit unavailable' : 'Checking your borrowing limit'}: ${asset.name}, ${asset.assetId} cannot be requested yet`
                      : asset.available ? `Request to borrow ${asset.name}, ${asset.assetId}` : `${asset.name}, ${asset.assetId} is checked out and cannot be requested`}
                  onClick={() => onRequest(asset.assetId)}
                >{pending ? 'Request pending' : limited ? quotaLabel : 'Request to borrow'}</button>}
              </div>
            </article>
        </li>
      })}
    </ul>}
  </section>
}
