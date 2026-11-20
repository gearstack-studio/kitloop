import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Checkout from '../src/components/Checkout'
import Loans from '../src/components/Loans'
import type { BorrowRequest } from '../src/components/Requests'

const pending: BorrowRequest = { id: 'R1', assetId: 'CAM-1', status: 'PENDING', submittedAt: '2026-11-03T00:00:00Z' }

describe('Custodian checkout form', () => {
  afterEach(() => vi.useRealTimers())

  it('sets the minimum to the next browser-local minute and labels the timezone', () => {
    vi.setSystemTime(new Date(2026, 10, 20, 15, 24, 30))
    render(<Checkout request={pending} available ready busy={false} onCheckout={vi.fn()} />)

    const input = screen.getByLabelText<HTMLInputElement>('Due date for CAM-1')
    expect(input.min).toBe('2026-11-20T15:25')
    const help = document.getElementById(input.getAttribute('aria-describedby') ?? '')
    expect(help?.textContent).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone)
    vi.setSystemTime(new Date(2026, 10, 20, 15, 26, 0))
    fireEvent.focus(input)
    expect(input.min).toBe('2026-11-20T15:27')
    fireEvent.change(input, { target: { value: '2026-11-20T15:25' } })
    expect(input.validity.rangeUnderflow).toBe(true)
  })

  it('requires a due date and submits only the selected request with its local date converted to UTC', async () => {
    const submit = vi.fn()
    render(<Checkout request={pending} available ready busy={false} onCheckout={submit} />)
    expect((screen.getByRole('button', { name: 'Check out' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Due date for CAM-1'), { target: { value: '2099-01-02T09:30' } })
    await userEvent.click(screen.getByRole('button', { name: 'Check out' }))
    const offsetInMinutes = new Date(2099, 0, 2, 9, 30).getTimezoneOffset()
    const expected = new Date(Date.UTC(2099, 0, 2, 9, 30 + offsetInMinutes)).toISOString()
    expect(submit).toHaveBeenCalledExactlyOnceWith(pending, expected)
  })
  it('rejects past due dates even when native validation is bypassed', () => {
    const submit = vi.fn()
    render(<Checkout request={pending} available ready busy={false} onCheckout={submit} />)
    fireEvent.change(screen.getByLabelText('Due date for CAM-1'), { target: { value: '2000-01-01T00:00' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Checkout request R1' }))
    expect(screen.getByRole('alert').textContent).toContain('later than the checkout time')
    expect(submit).not.toHaveBeenCalled()
  })
  it('blocks unavailable, still-loading, busy and non-pending requests', () => {
    const props = { request: pending, available: true, ready: true, busy: false, onCheckout: vi.fn() }
    const view = render(<Checkout {...props} />)
    fireEvent.change(screen.getByLabelText('Due date for CAM-1'), { target: { value: '2099-01-02T09:30' } })
    for (const overrides of [{ available: false }, { ready: false }, { busy: true }, { request: { ...pending, status: 'CHECKED_OUT' as const } }]) {
      view.rerender(<Checkout {...props} {...overrides} />)
      expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
    }
  })
  it('shows persisted loan identifiers, checkout and due timestamps, and status', () => {
    render(<Loans custodian status="ready" onRetry={vi.fn()} loans={[{ id: 'L1', requestId: 'R1', assetId: 'CAM-1', borrowerId: 'B1', checkoutCustodianId: 'C1',
      checkedOutAt: '2026-11-03T10:00:00Z', dueAt: '2026-11-04T10:00:00Z', returnedAt: '2026-11-04T09:00:00Z', status: 'RETURNED' }]} />)
    for (const text of ['Loan L1', 'Request R1', 'Borrower B1', 'Checked out by C1', 'CAM-1 · RETURNED']) {
      expect(screen.getByText(text)).toBeTruthy()
    }
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    for (const label of [/^Checked out \d/, /^Due /, /^Returned /]) {
      expect(screen.getByText(label).textContent).toContain(timezone)
    }
  })
})
