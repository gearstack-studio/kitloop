export type Loan = {
  id: string; assetId: string; borrowerId: string; requestId: string; checkoutCustodianId: string
  checkedOutAt: string; dueAt: string; returnedAt: string | null; status: 'ACTIVE' | 'RETURNED'
}

export default function Loans({ loans, custodian }: { loans: Loan[]; custodian: boolean }) {
  return <section className="panel" aria-labelledby="loans-heading">
    <div className="section-heading"><h2 id="loans-heading">{custodian ? 'Active loans' : 'My loans'}</h2><span>{loans.length} records</span></div>
    {loans.length === 0 ? <p className="empty">No loans to show yet.</p> :
      <div className="record-list">{loans.map(loan => <article className="record" key={loan.id}>
        <div><strong>{loan.assetId} · {loan.status}</strong>
          <small>Loan {loan.id}</small><small>Request {loan.requestId}</small>
          <small>Borrower {loan.borrowerId}</small><small>Checked out by {loan.checkoutCustodianId}</small>
          <small>Checked out {new Date(loan.checkedOutAt).toLocaleString()}</small>
          <small>Due {new Date(loan.dueAt).toLocaleString()}</small>
          {loan.returnedAt && <small>Returned {new Date(loan.returnedAt).toLocaleString()}</small>}
        </div>
      </article>)}</div>}
  </section>
}
