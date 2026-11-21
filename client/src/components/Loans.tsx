import { formatLocalTimestamp } from '../localDateTime'
import RecordIds from './RecordIds'
import { personName, type PersonName } from '../personName'

export type Loan = {
  id: string; assetId: string; borrowerId: string; requestId: string; checkoutCustodianId: string
  checkedOutAt: string; dueAt: string; returnedAt: string | null; status: 'ACTIVE' | 'RETURNED'
  // UAT-E03 (#63): readable names from the loan views; borrower and checkoutCustodian are sent to custodians only.
  // Optional so an older API or a checkout response still renders.
  asset?: { assetId: string; name: string }
  borrower?: PersonName
  checkoutCustodian?: PersonName
}

export type LoanStatus = 'loading' | 'ready' | 'error'

export default function Loans({ loans, status, onRetry, custodian }: {
  loans: Loan[]; status: LoanStatus; onRetry: () => void; custodian: boolean
}) {
  return <section className="panel" aria-labelledby="loans-heading" aria-busy={status === 'loading'}>
    <div className="section-heading"><h2 id="loans-heading">{custodian ? 'Active loans' : 'My loans'}</h2>
      {status === 'ready' && <span>{loans.length} records</span>}</div>
    {status === 'loading' && <p role="status">Loading loans…</p>}
    {status === 'error' && <div role="alert"><p>Loans could not be loaded.</p><button type="button" onClick={onRetry}>Retry loans</button></div>}
    {status === 'ready' && (loans.length === 0 ? <p className="empty">No loans to show yet.</p> :
      <div className="record-list">{loans.map(loan => <article className="record" key={loan.id}>
        <div><strong>{loan.asset?.name ?? loan.assetId} · {loan.status}</strong>
          {loan.asset?.name && <small>{loan.assetId}</small>}
          {/* Person names are custodian-only (FR-08/FR-12, BR-05). Borrowers get their own loan's equipment and times (FR-11). */}
          {custodian && <small>Borrower: {personName(loan.borrower)}</small>}
          {custodian && <small>Checked out by: {personName(loan.checkoutCustodian)}</small>}
          <small>Checked out {formatLocalTimestamp(loan.checkedOutAt)}</small>
          <small>Due {formatLocalTimestamp(loan.dueAt)}</small>
          {loan.returnedAt && <small>Returned {formatLocalTimestamp(loan.returnedAt)}</small>}
          <RecordIds>
            <small>Loan {loan.id}</small><small>Request {loan.requestId}</small>
            {custodian && <small>Borrower ID {loan.borrowerId}</small>}
            {custodian && <small>Custodian ID {loan.checkoutCustodianId}</small>}
          </RecordIds>
        </div>
      </article>)}</div>)}
  </section>
}
