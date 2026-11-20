import { useState, type FormEvent } from 'react'
import type { BorrowRequest } from './Requests'
import { browserTimeZone, nextLocalMinute } from '../localDateTime'

const invalidDueDate = 'Choose a valid due date later than the checkout time.'

export default function Checkout({ request, available, ready, busy, onCheckout }: {
  request: BorrowRequest; available: boolean; ready: boolean; busy: boolean
  onCheckout: (request: BorrowRequest, dueAt: string) => void
}) {
  const [dueDate, setDueDate] = useState('')
  const [minimumDueDate, setMinimumDueDate] = useState(nextLocalMinute)
  const [error, setError] = useState('')
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !ready || !available || request.status !== 'PENDING') return
    const dueAt = new Date(dueDate)
    if (!Number.isFinite(dueAt.getTime()) || dueAt <= new Date()) {
      setMinimumDueDate(nextLocalMinute())
      setError(invalidDueDate)
      return
    }
    setError('')
    onCheckout(request, dueAt.toISOString())
  }
  const dueId = `checkout-due-${request.id}`
  return <form className="checkout-form" onSubmit={submit} aria-label={`Checkout request ${request.id}`}>
    <label htmlFor={dueId}>Due date for {request.assetId}</label>
    <input id={dueId} type="datetime-local" value={dueDate} min={minimumDueDate} required disabled={busy || !ready || !available}
      aria-invalid={!!error} aria-describedby={error ? `${dueId}-help ${dueId}-error` : `${dueId}-help`}
      onFocus={() => setMinimumDueDate(nextLocalMinute())}
      onChange={event => { setDueDate(event.target.value); setMinimumDueDate(nextLocalMinute()); setError('') }}
      onInvalid={event => { if (event.currentTarget.validity.rangeUnderflow) setError(invalidDueDate) }} />
    <p id={`${dueId}-help`} className="checkout-help">Confirm the physical handoff before recording checkout. The due date uses your browser timezone ({browserTimeZone()}).</p>
    {!ready && <p role="status">Checking equipment availability…</p>}
    {ready && !available && <p role="status">Equipment is no longer available for checkout.</p>}
    {error && <p id={`${dueId}-error`} role="alert">{error}</p>}
    <button type="submit" disabled={busy || !ready || !available || !dueDate || request.status !== 'PENDING'}>
      {busy ? 'Processing…' : 'Check out'}
    </button>
  </form>
}
