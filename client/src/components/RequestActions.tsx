import { useState } from 'react'
import type { BorrowRequest } from './Requests'
import { closeReasonLabels, declineReasons, type DeclineReason } from '../requestLifecycle'

/** Borrower action: only a PENDING request can be cancelled; terminal requests show no control. */
export function CancelRequest({ request, busy, onCancel }: {
  request: BorrowRequest; busy: boolean; onCancel: (request: BorrowRequest) => void
}) {
  if (request.status !== 'PENDING') return null
  return <button type="button" disabled={busy} aria-label={`Cancel request for ${request.asset?.name ?? request.assetId}`}
    onClick={() => { if (!busy) onCancel(request) }}>
    Cancel request
  </button>
}

/** Custodian action: a reason must be chosen before a PENDING request can be declined. */
export function DeclineRequest({ request, busy, onDecline }: {
  request: BorrowRequest; busy: boolean; onDecline: (request: BorrowRequest, reason: DeclineReason) => void
}) {
  const [reason, setReason] = useState<DeclineReason | ''>('')
  if (request.status !== 'PENDING') return null
  const reasonId = `decline-reason-${request.id}`
  return <form className="checkout-form" aria-label={`Decline request ${request.id}`} onSubmit={event => {
    event.preventDefault()
    if (busy || !reason) return
    onDecline(request, reason)
  }}>
    <label htmlFor={reasonId}>Decline reason for {request.assetId}</label>
    <select id={reasonId} value={reason} required disabled={busy}
      onChange={event => setReason(event.target.value as DeclineReason | '')}>
      <option value="">Choose a reason</option>
      {declineReasons.map(value => <option key={value} value={value}>{closeReasonLabels[value]}</option>)}
    </select>
    {/* busy is shared by every action, so the label stays fixed; only the clicked action reports progress. */}
    <button type="submit" disabled={busy || !reason}>Decline</button>
  </form>
}
