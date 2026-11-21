import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
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

  it('shows the maximum message when Check out is clicked with an over-maximum date (validation is not left to the browser)', () => {
    const submit = vi.fn()
    render(<Checkout request={pending} available ready busy={false} maxLoanDays={TEST_MAX_DAYS} onCheckout={submit} />)
    fireEvent.change(dueInput(), { target: { value: '9999-12-31T23:59' } })
    expect(dueInput().validity.rangeOverflow).toBe(true)   // the picker attribute still guides the browser
    fireEvent.click(screen.getByRole('button', { name: 'Check out' }))
    expect(screen.getByRole('alert').textContent).toBe(`Choose a due date within ${TEST_MAX_DAYS} days of checkout.`)
    expect(dueInput().getAttribute('aria-invalid')).toBe('true')
    expect(submit).not.toHaveBeenCalled()
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

// PR #73 review P2: the picker's max attribute is only guidance. If the form stays open while time passes, a date that
// was over the maximum can become valid; clicking Check out must reach the current-time validation instead of being
// blocked by native constraint validation against the stale DOM max. These tests click the real submit button (form
// submission algorithm, including constraint validation) and never focus the date input after the clock moves.
describe('UAT-E02 checkout with a stale picker maximum (PR #73 P2)', () => {
  const T0 = new Date(2026, 10, 20, 15, 24, 30)
  const at = (ms: number) => local(new Date(T0.getTime() + ms))
  const H = 3_600_000, D = 86_400_000
  afterEach(() => vi.useRealTimers())
  const click = () => fireEvent.click(screen.getByRole('button', { name: 'Check out' }))
  function setup(maxLoanDays: number | null = TEST_MAX_DAYS) {
    vi.setSystemTime(T0)
    const onCheckout = vi.fn()
    const view = render(<Checkout request={pending} available ready busy={false} maxLoanDays={maxLoanDays} onCheckout={onCheckout} />)
    return { onCheckout, view }
  }

  it('submits a date that became valid while the form stayed open, exactly once, as UTC ISO', () => {
    const { onCheckout } = setup()
    const value = at(TEST_MAX_DAYS * D + 30 * 60_000)        // 30 minutes beyond the initial maximum
    fireEvent.change(dueInput(), { target: { value } })
    expect(dueInput().validity.rangeOverflow).toBe(true)
    vi.setSystemTime(new Date(T0.getTime() + H))              // an hour passes; no focus, no re-render
    expect(dueInput().validity.rangeOverflow).toBe(true)      // the DOM max is now stale
    click()
    expect(onCheckout).toHaveBeenCalledExactlyOnceWith(pending, new Date(value).toISOString())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('still rejects a date beyond the current maximum after time passes', () => {
    const { onCheckout } = setup()
    fireEvent.change(dueInput(), { target: { value: at(TEST_MAX_DAYS * D + 2 * H) } })
    vi.setSystemTime(new Date(T0.getTime() + H))
    click()
    expect(onCheckout).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(`Choose a due date within ${TEST_MAX_DAYS} days of checkout.`)
    expect(dueInput().getAttribute('aria-invalid')).toBe('true')
    expect(dueInput().getAttribute('aria-describedby')).toBe('checkout-due-R1-help checkout-due-R1-error')
    expect(dueInput().max).toBe(at(TEST_MAX_DAYS * D + H))   // the attempt refreshed the picker bounds to the new time
  })

  it('accepts a valid date and the exact (minute) maximum by click', () => {
    const { onCheckout } = setup()
    fireEvent.change(dueInput(), { target: { value: dueInput().max } })
    click()
    expect(onCheckout).toHaveBeenCalledOnce()
    fireEvent.change(dueInput(), { target: { value: at(2 * D) } })
    click()
    expect(onCheckout).toHaveBeenCalledTimes(2)
  })

  it('rejects past dates by click with the inline message and recovers when corrected', () => {
    const { onCheckout } = setup()
    fireEvent.change(dueInput(), { target: { value: at(-D) } })
    click()
    expect(onCheckout).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('Choose a valid due date later than the checkout time.')
    fireEvent.change(dueInput(), { target: { value: at(D) } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(dueInput().getAttribute('aria-invalid')).toBe('false')
    click()
    expect(onCheckout).toHaveBeenCalledOnce()
  })

  it('rejects an empty or unparseable date even if the form is submitted programmatically', () => {
    const { onCheckout } = setup()
    expect((screen.getByRole('button', { name: 'Check out' }) as HTMLButtonElement).disabled).toBe(true)
    act(() => form().requestSubmit())
    expect(onCheckout).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('Choose a valid due date later than the checkout time.')
  })

  it('follows a configured maximum that changes while the form stays mounted, including back to no maximum', () => {
    const { onCheckout, view } = setup()
    fireEvent.change(dueInput(), { target: { value: at(10 * D) } })
    view.rerender(<Checkout request={pending} available ready busy={false} maxLoanDays={7} onCheckout={onCheckout} />)
    click()
    expect(onCheckout).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('Choose a due date within 7 days of checkout.')
    view.rerender(<Checkout request={pending} available ready busy={false} maxLoanDays={null} onCheckout={onCheckout} />)
    expect(dueInput().max).toBe('')
    click()
    expect(onCheckout).toHaveBeenCalledOnce()
  })

  it('applies no upper limit when no maximum is configured', () => {
    const { onCheckout } = setup(null)
    fireEvent.change(dueInput(), { target: { value: '9999-12-31T23:59' } })
    click()
    expect(onCheckout).toHaveBeenCalledOnce()
  })

  it('does not submit again while the checkout is busy', () => {
    const { onCheckout, view } = setup()
    fireEvent.change(dueInput(), { target: { value: at(D) } })
    click()
    view.rerender(<Checkout request={pending} available ready busy maxLoanDays={TEST_MAX_DAYS} onCheckout={onCheckout} />)
    expect((screen.getByRole('button', { name: 'Processing…' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Processing…' }))
    act(() => form().requestSubmit())
    expect(onCheckout).toHaveBeenCalledOnce()
  })
})
