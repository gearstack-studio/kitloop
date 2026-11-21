import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import Checkout from '../src/components/Checkout'
import type { BorrowRequest } from '../src/components/Requests'

// UAT-E02 (#62), BR-11, SRS OQ-01. TEST_MAX_DAYS is a test configuration only, not an approved loan period: the server
// sends its LOAN_MAX_DAYS setting as features.loanMaxDays, and null means no maximum is configured (OQ-01 open).
const TEST_MAX_DAYS = 21
const pending: BorrowRequest = { id: 'R1', assetId: 'CAM-1', status: 'PENDING', submittedAt: '2026-11-03T00:00:00Z' }
const local = (date: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`
}
const form = () => screen.getByRole('form', { name: 'Checkout request R1' })
const dueInput = () => screen.getByLabelText<HTMLInputElement>('Due date for CAM-1')

describe('UAT-E02 checkout due-date maximum (component)', () => {
  afterEach(() => vi.useRealTimers())

  it('sets the picker maximum to the latest browser-local minute within the period and states the period', () => {
    vi.setSystemTime(new Date(2026, 10, 20, 15, 24, 30))
    render(<Checkout request={pending} available ready busy={false} maxLoanDays={TEST_MAX_DAYS} onCheckout={vi.fn()} />)
    expect(dueInput().min).toBe('2026-11-20T15:25')
    expect(dueInput().max).toBe(local(new Date(2026, 10, 20 + TEST_MAX_DAYS, 15, 24)))
    const help = document.getElementById(`checkout-due-R1-help`)
    expect(help?.textContent).toContain(`Maximum loan period: ${TEST_MAX_DAYS} days`)
    expect(help?.textContent).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })

  it('refreshes the maximum with the minimum as time passes', () => {
    vi.setSystemTime(new Date(2026, 10, 20, 15, 24, 30))
    render(<Checkout request={pending} available ready busy={false} maxLoanDays={TEST_MAX_DAYS} onCheckout={vi.fn()} />)
    vi.setSystemTime(new Date(2026, 10, 20, 16, 0, 0))
    fireEvent.focus(dueInput())
    expect(dueInput().min).toBe('2026-11-20T16:01')
    expect(dueInput().max).toBe(local(new Date(2026, 10, 20 + TEST_MAX_DAYS, 16, 0)))
  })

  it('accepts a due date at the maximum and submits it as a UTC ISO timestamp', async () => {
    const submit = vi.fn()
    render(<Checkout request={pending} available ready busy={false} maxLoanDays={TEST_MAX_DAYS} onCheckout={submit} />)
    const value = dueInput().max
    fireEvent.change(dueInput(), { target: { value } })
    await userEvent.click(screen.getByRole('button', { name: 'Check out' }))
    expect(submit).toHaveBeenCalledExactlyOnceWith(pending, new Date(value).toISOString())
  })

  it('rejects a due date beyond the maximum, and year 9999, even when native validation is bypassed', () => {
    const submit = vi.fn()
    render(<Checkout request={pending} available ready busy={false} maxLoanDays={TEST_MAX_DAYS} onCheckout={submit} />)
    for (const value of [local(new Date(Date.now() + (TEST_MAX_DAYS + 1) * 86_400_000)), '9999-12-31T23:59']) {
      fireEvent.change(dueInput(), { target: { value } })
      fireEvent.submit(form())
      expect(screen.getByRole('alert').textContent).toBe(`Choose a due date within ${TEST_MAX_DAYS} days of checkout.`)
      expect(dueInput().getAttribute('aria-invalid')).toBe('true')
    }
    expect(submit).not.toHaveBeenCalled()
  })

  it('reports native range overflow with the same message', () => {
    render(<Checkout request={pending} available ready busy={false} maxLoanDays={TEST_MAX_DAYS} onCheckout={vi.fn()} />)
    fireEvent.change(dueInput(), { target: { value: '9999-12-31T23:59' } })
    expect(dueInput().validity.rangeOverflow).toBe(true)
    fireEvent.invalid(dueInput())
    expect(screen.getByRole('alert').textContent).toBe(`Choose a due date within ${TEST_MAX_DAYS} days of checkout.`)
  })

  it('applies no maximum when none is configured (OQ-01 unresolved)', async () => {
    const submit = vi.fn()
    render(<Checkout request={pending} available ready busy={false} maxLoanDays={null} onCheckout={submit} />)
    expect(dueInput().max).toBe('')
    expect(document.getElementById('checkout-due-R1-help')?.textContent).not.toContain('Maximum loan period')
    fireEvent.change(dueInput(), { target: { value: '2099-01-02T09:30' } })
    await userEvent.click(screen.getByRole('button', { name: 'Check out' }))
    expect(submit).toHaveBeenCalledOnce()
  })
})

describe('UAT-E02 checkout due-date maximum (app, mocked HTTP)', () => {
  const asset = { assetId: 'CAM-1', name: 'Camera', category: 'Camera', description: 'Synthetic', available: true }
  let posts: number
  beforeEach(() => {
    window.history.replaceState(null, '', '/dashboard')
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    posts = 0
    vi.stubGlobal('fetch', vi.fn(async (input: string, options?: RequestInit) => {
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body),
        { status, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-csrf' } })
      const path = new URL(input).pathname
      if (path === '/api/auth/me') return json({ id: 'C1', role: 'CUSTODIAN', features: { requestLifecycleActions: true, loanMaxDays: TEST_MAX_DAYS } })
      if (path === '/api/assets') return json([asset])
      if (path === '/api/requests/pending') return json([{ ...pending, borrowerId: 'B1', asset, borrower: { id: 'B1', username: 'borrower.demo' } }])
      if (path === '/api/loans/active') return json([])
      if (path === '/api/requests/R1/checkout' && options?.method === 'POST') {
        posts++
        // The server is the source of truth: it can still refuse a date the browser allowed (e.g. clock skew).
        return json({ error: { code: 'VALIDATION_ERROR', message: `Choose a due date within ${TEST_MAX_DAYS} days of checkout`,
          fields: { dueAt: `The due date must be no later than ${TEST_MAX_DAYS} days after checkout` } } }, 400)
      }
      throw new Error(`Unexpected API: ${path}`)
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('passes the server maximum to the picker and shows a server-side rejection without claiming success', async () => {
    render(<App />)
    const due = await screen.findByLabelText<HTMLInputElement>('Due date for CAM-1')
    expect(due.max).not.toBe('')
    fireEvent.change(due, { target: { value: local(new Date(Date.now() + 7 * 86_400_000)) } })
    await userEvent.click(screen.getByRole('button', { name: 'Check out' }))
    expect(await screen.findByText(`Choose a due date within ${TEST_MAX_DAYS} days of checkout`)).toBeTruthy()
    expect(posts).toBe(1)
    expect(screen.queryByText(/Checkout recorded/)).toBeNull()
  })
})
