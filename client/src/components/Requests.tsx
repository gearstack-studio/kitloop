import type { FormEvent, ReactNode } from 'react'
import type { Asset } from './Catalog'

export type BorrowRequest = {
  id: string; assetId: string; borrowerId?: string; status: 'PENDING' | 'CHECKED_OUT'; submittedAt: string
  asset?: { assetId: string; name: string; category: string }
  borrower?: { id: string; username: string }
}
export type RequestStatus = 'loading' | 'ready' | 'error'

export function BorrowRequestForm({ assets, requests, selected, onSelect, onSubmit, busy, ready }: {
  assets: Asset[]; requests: BorrowRequest[]; selected: string; onSelect: (id: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void; busy: boolean; ready: boolean
}) {
  const eligible = assets.filter(asset => asset.available &&
    !requests.some(request => request.assetId === asset.assetId && request.status === 'PENDING'))
  const valid = eligible.some(asset => asset.assetId === selected)
  return <section className="panel" aria-labelledby="borrow-heading">
    <h2 id="borrow-heading">Request equipment</h2>
    <p>A request does not reserve equipment. A custodian confirms the physical checkout.</p>
    <form onSubmit={onSubmit} className="request-form">
      <label htmlFor="request-asset">Available equipment</label>
      <select id="request-asset" value={valid ? selected : ''} onChange={event => onSelect(event.target.value)} disabled={busy || !ready} required>
        <option value="">Select equipment</option>
        {eligible.map(asset => <option key={asset.assetId} value={asset.assetId}>{asset.name} · {asset.assetId}</option>)}
      </select>
      <button type="submit" disabled={busy || !ready || !valid}>{busy ? 'Submitting…' : 'Submit request'}</button>
    </form>
    {ready && eligible.length === 0 && <p role="status">No equipment is available for a new request. Check your pending requests below.</p>}
  </section>
}

export default function Requests({ requests, status, onRetry, custodian = false, children }: {
  requests: BorrowRequest[]; status: RequestStatus; onRetry: () => void; custodian?: boolean
  children?: (request: BorrowRequest) => ReactNode
}) {
  return <section className="panel" aria-labelledby="requests-heading" aria-busy={status === 'loading'}>
    <div className="section-heading"><h2 id="requests-heading">{custodian ? 'Pending requests' : 'My requests'}</h2>
      {status === 'ready' && <span>{requests.length} records</span>}</div>
    {status === 'loading' && <p role="status">Loading requests…</p>}
    {status === 'error' && <div role="alert"><p>Requests could not be loaded.</p><button onClick={onRetry}>Retry requests</button></div>}
    {status === 'ready' && (requests.length === 0 ? <p className="empty">{custodian
        ? 'No pending requests for the equipment assigned to you. Requests for equipment assigned to another custodian are not shown.'
        : 'No requests to show yet.'}</p> :
      <div className="record-list">{requests.map(item => <article className="record" key={item.id}>
        <div><strong>{item.asset?.name ?? item.assetId}</strong><small>{item.assetId} · {item.status}</small>
          <small>Request {item.id}</small>
          <small>Submitted {new Date(item.submittedAt).toLocaleString()}</small>
          {custodian && <small>Borrower: {item.borrower?.username ?? 'Unknown'} · {item.borrower?.id ?? item.borrowerId}</small>}
        </div>{children?.(item)}
      </article>)}</div>)}
  </section>
}
