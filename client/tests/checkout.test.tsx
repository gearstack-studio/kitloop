import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Checkout from '../src/components/Checkout'
import Loans from '../src/components/Loans'
import type { BorrowRequest } from '../src/components/Requests'

const pending: BorrowRequest = { id: 'R1', assetId: 'CAM-1', status: 'PENDING', submittedAt: '2026-11-03T00:00:00Z' }

describe('Custodian checkout form', () => {
  it('requires a due date and submits only the selected request with its local date converted to UTC', async () => {
    const submit = vi.fn()
    render(<Checkout request={pending} available ready busy={false} onCheckout={submit} />)
    expect((screen.getByRole('button', { name: 'Check out' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Due date for CAM-1'), { target: { value: '2099-01-02T09:30' } })
    await userEvent.click(screen.getByRole('button', { name: 'Check out' }))
    expect(submit).toHaveBeenCalledExactlyOnceWith(pending, new Date('2099-01-02T09:30').toISOString())
  })
  it('rejects past due dates locally without invoking checkout', async () => {
    const submit = vi.fn()
    render(<Checkout request={pending} available ready busy={false} onCheckout={submit} />)
    fireEvent.change(screen.getByLabelText('Due date for CAM-1'), { target: { value: '2000-01-01T00:00' } })
    await userEvent.click(screen.getByRole('button', { name: 'Check out' }))
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
    render(<Loans custodian loans={[{ id: 'L1', requestId: 'R1', assetId: 'CAM-1', borrowerId: 'B1', checkoutCustodianId: 'C1',
      checkedOutAt: '2026-11-03T10:00:00Z', dueAt: '2026-11-04T10:00:00Z', returnedAt: null, status: 'ACTIVE' }]} />)
    for (const text of ['Loan L1', 'Request R1', 'Borrower B1', 'Checked out by C1', 'CAM-1 · ACTIVE']) {
      expect(screen.getByText(text)).toBeTruthy()
    }
    expect(screen.getByText(/^Due /).textContent).not.toContain('Invalid Date')
  })
})
