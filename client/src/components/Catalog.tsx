export type Asset = { assetId: string; name: string; category: string; description: string; available: boolean }
export type CatalogStatus = 'loading' | 'ready' | 'error'

type CatalogProps = {
  assets: Asset[]
  status: CatalogStatus
  onRetry: () => void
  /** Borrowers see a request control (behaviour owned by FEAT-03); custodians see none. */
  canRequest: boolean
  busy: boolean
  onRequest: (assetId: string) => void
}

export default function Catalog({ assets, status, onRetry, canRequest, busy, onRequest }: CatalogProps) {
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
    {status === 'ready' && assets.length === 0 && <p className="empty">No equipment is listed yet.</p>}
    {status === 'ready' && assets.length > 0 && <ul className="asset-grid">
      {assets.map(asset => <li key={asset.assetId}>
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
              disabled={busy || !asset.available}
              aria-label={asset.available ? `Request to borrow ${asset.name}, ${asset.assetId}` : `${asset.name}, ${asset.assetId} is checked out and cannot be requested`}
              onClick={() => onRequest(asset.assetId)}
            >Request to borrow</button>}
          </div>
        </article>
      </li>)}
    </ul>}
  </section>
}
