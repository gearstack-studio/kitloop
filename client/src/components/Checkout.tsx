import { useState, type FormEvent } from 'react'
import type { BorrowRequest } from './Requests'
import { browserTimeZone, latestDueInstant, latestLocalMinute, nextLocalMinute } from '../localDateTime'

const invalidDueDate = 'Choose a valid due date later than the checkout time.'
const beyondMaximum = (days: number) => `Choose a due date within ${days} days of checkout.`

// UAT-E02 (#62): maxLoanDays is the server's LOAN_MAX_DAYS setting (null = no maximum configured; SRS OQ-01 open).
// The picker's min/max attributes are guidance only. The form is noValidate (PR #73 review P2): native constraint
// validation would run against whatever min/max the DOM last rendered, so a form left open while time passes could
// refuse a date that has since become valid before this handler ever runs. All required checks are made here, against
// one instant captured per attempt; the server re-checks both bounds against the actual checkout time.
export default function Checkout({ request, available, ready, busy, maxLoanDays = null, onCheckout }: {
  request: BorrowRequest; available: boolean; ready: boolean; busy: boolean; maxLoanDays?: number | null
  onCheckout: (request: BorrowRequest, dueAt: string) => void
}) {
  const [dueDate, setDueDate] = useState('')
  const [minimumDueDate, setMinimumDueDate] = useState(nextLocalMinute)
  const [error, setError] = useState('')
  // Both bounds move with the clock. The minimum is refreshed on every interaction; that re-render also recomputes the
  // maximum below, which always reflects the current maxLoanDays even if the server setting arrives after mount.
  function refreshBounds() {
    setMinimumDueDate(nextLocalMinute())
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !ready || !available || request.status !== 'PENDING') return
    const now = Date.now()   // one instant for every comparison in this attempt
    refreshBounds()          // the attempt also brings the displayed picker bounds up to date
    const dueAt = dueDate ? new Date(dueDate) : new Date(NaN)
    if (!Number.isFinite(dueAt.getTime()) || dueAt.getTime() <= now) {
      setError(invalidDueDate)
      return
    }
    if (maxLoanDays !== null && dueAt.getTime() > latestDueInstant(maxLoanDays, now)) {
      setError(beyondMaximum(maxLoanDays))
      return
    }
    setError('')
    onCheckout(request, dueAt.toISOString())
  }
  const dueId = `checkout-due-${request.id}`
  const max = maxLoanDays === null ? undefined : latestLocalMinute(maxLoanDays)
  return <form className="checkout-form" onSubmit={submit} noValidate aria-label={`Checkout request ${request.id}`}>
    <label htmlFor={dueId}>Due date for {request.assetId}</label>
    <input id={dueId} type="datetime-local" value={dueDate} min={minimumDueDate} max={max} required aria-required="true"
      disabled={busy || !ready || !available}
      aria-invalid={!!error} aria-describedby={error ? `${dueId}-help ${dueId}-error` : `${dueId}-help`}
      onFocus={refreshBounds}
      onChange={event => { setDueDate(event.target.value); refreshBounds(); setError('') }} />
    <p id={`${dueId}-help`} className="checkout-help">
      Confirm the physical handoff before recording checkout. The due date uses your browser timezone ({browserTimeZone()}).
      {maxLoanDays !== null && <> Maximum loan period: {maxLoanDays} days from checkout.</>}
    </p>
    {!ready && <p role="status">Checking equipment availability…</p>}
    {ready && !available && <p role="status">Equipment is no longer available for checkout.</p>}
    {error && <p id={`${dueId}-error`} role="alert">{error}</p>}
    <button type="submit" disabled={busy || !ready || !available || !dueDate || request.status !== 'PENDING'}>
      {busy ? 'Processing…' : 'Check out'}
    </button>
  </form>
}
