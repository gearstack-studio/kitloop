import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import Requests, { type BorrowRequest } from '../src/components/Requests'
import { borrowEligibility } from '../src/borrowEligibility'

// UAT-E01 (#61): lifecycle statuses, closure reasons, borrower Cancel and custodian Decline.
const asset = { assetId: 'CAM-01', name: 'Camera', category: 'Camera', description: 'Synthetic', available: true }
const base = { assetId: 'CAM-01', borrowerId: 'B1', submittedAt: '2026-11-03T00:00:00Z', asset, closedAt: null, closeReason: null }
const pending = { ...base, id: 'R1', status: 'PENDING' }
const autoDeclined = { ...base, id: 'R2', status: 'DECLINED', closedAt: '2026-11-04T00:00:00Z', closeReason: 'ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER' }
const cancelled = { ...base, id: 'R3', status: 'CANCELLED', closedAt: '2026-11-04T00:00:00Z', closeReason: 'CANCELLED_BY_BORROWER' }
let role: 'BORROWER' | 'CUSTODIAN'
let lifecycleActions: boolean
let records: object[]
let posts: Array<{ path: string; body: unknown; csrf: string | undefined }>
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-csrf' } })
}
beforeEach(() => {
  window.history.replaceState(null, '', '/dashboard')
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  posts = []
  lifecycleActions = true
  vi.stubGlobal('fetch', vi.fn(async (input: string, options?: RequestInit) => {
    const path = new URL(input).pathname
    if (path === '/api/auth/me') return json({ id: role === 'BORROWER' ? 'B1' : 'C1', role, features: { requestLifecycleActions: lifecycleActions } })
    if (path === '/api/assets') return json([asset])
    if (path === '/api/requests/mine' || path === '/api/requests/pending') return json(records)
    if (path === '/api/loans/mine' || path === '/api/loans/active') return json([])
    if (options?.method === 'POST' && /^\/api\/requests\/R1\/(cancel|decline)$/.test(path)) {
      const body = JSON.parse(options.body as string)
      posts.push({ path, body, csrf: (options.headers as Record<string, string>)['X-CSRF-Token'] })
      const closed = path.endsWith('/cancel')
        ? { ...pending, status: 'CANCELLED', closedAt: '2026-11-05T00:00:00Z', closeReason: 'CANCELLED_BY_BORROWER' }
        : { ...pending, status: 'DECLINED', closedAt: '2026-11-05T00:00:00Z', closeReason: body.reason }
      records = role === 'BORROWER' ? records.map(item => (item as { id: string }).id === 'R1' ? closed : item) : []
      return json(closed)
    }
    throw new Error(`Unexpected API: ${options?.method ?? 'GET'} ${path}`)
  }))
})

describe('Request lifecycle display', () => {
  it('shows terminal statuses with their closure reason and time', () => {
    render(<Requests status="ready" onRetry={vi.fn()} requests={[pending, autoDeclined, cancelled] as BorrowRequest[]} />)
    const declinedRecord = screen.getByText('Request R2').closest('article')!
    expect(within(declinedRecord).getByText('CAM-01 · DECLINED')).toBeTruthy()
    expect(within(declinedRecord).getByText(/Reason: Equipment was checked out to another borrower/)).toBeTruthy()
    expect(within(declinedRecord).getByText(/^Closed /)).toBeTruthy()
    const cancelledRecord = screen.getByText('Request R3').closest('article')!
    expect(within(cancelledRecord).getByText(/Reason: Cancelled by the borrower/)).toBeTruthy()
    const pendingRecord = screen.getByText('Request R1').closest('article')!
    expect(within(pendingRecord).queryByText(/Reason:/)).toBeNull()
  })

  it('does not let a terminal request block a new request for available equipment', () => {
    for (const request of [autoDeclined, cancelled, { ...base, id: 'R4', status: 'EXPIRED', closedAt: '2026-11-04T00:00:00Z', closeReason: 'OTHER' }]) {
      expect(borrowEligibility(asset, [request] as BorrowRequest[])).toBe('eligible')
    }
    expect(borrowEligibility(asset, [pending] as BorrowRequest[])).toBe('pending')
  })
})

describe('Borrower cancel (mocked HTTP)', () => {
  it('offers Cancel only for PENDING requests, posts with CSRF, and refreshes history', async () => {
    role = 'BORROWER'; records = [pending, autoDeclined, cancelled]
    render(<App />)
    await screen.findByText('Request R1')
    const buttons = screen.getAllByRole('button', { name: /Cancel request/ })
    expect(buttons).toHaveLength(1)
    expect(within(screen.getByText('Request R1').closest('article')!).getByRole('button', { name: /Cancel request/ })).toBe(buttons[0])
    await userEvent.click(buttons[0])
    expect(posts).toEqual([{ path: '/api/requests/R1/cancel', body: {}, csrf: 'test-csrf' }])
    await screen.findByText('Request cancelled.')
    const record = screen.getByText('Request R1').closest('article')!
    expect(within(record).getByText('CAM-01 · CANCELLED')).toBeTruthy()
    expect(within(record).getByText(/Reason: Cancelled by the borrower/)).toBeTruthy()
    expect(screen.queryAllByRole('button', { name: /Cancel request/ })).toHaveLength(0)
  })

  it('shows lifecycle statuses but no Cancel action in the compatibility release (lifecycle actions off)', async () => {
    // PR #72 P1: phase 1 reads every status but the server refuses lifecycle writes, so the UI must not offer them.
    role = 'BORROWER'; lifecycleActions = false; records = [pending, autoDeclined, cancelled]
    render(<App />)
    const declined = (await screen.findByText('Request R2')).closest('article')!
    expect(within(declined).getByText(/Reason: Equipment was checked out to another borrower/)).toBeTruthy()
    expect(within(screen.getByText('Request R1').closest('article')!).getByText('CAM-01 · PENDING')).toBeTruthy()
    expect(screen.queryAllByRole('button', { name: /Cancel request/ })).toHaveLength(0)
  })
})

describe('Custodian decline (mocked HTTP)', () => {
  it('requires a reason, posts it with CSRF, and removes the request from the refreshed queue', async () => {
    role = 'CUSTODIAN'; records = [{ ...pending, borrower: { id: 'B1', username: 'borrower.demo' } }]
    render(<App />)
    const reason = await screen.findByLabelText('Decline reason for CAM-01')
    const button = screen.getByRole('button', { name: 'Decline' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    await userEvent.selectOptions(reason, 'EQUIPMENT_UNAVAILABLE')
    expect(button.disabled).toBe(false)
    await userEvent.click(button)
    expect(posts).toEqual([{ path: '/api/requests/R1/decline', body: { reason: 'EQUIPMENT_UNAVAILABLE' }, csrf: 'test-csrf' }])
    await screen.findByText('Request declined.')
    expect(screen.queryByText('Request R1')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull()
  })

  it('hides Decline but keeps checkout in the compatibility release (lifecycle actions off)', async () => {
    role = 'CUSTODIAN'; lifecycleActions = false; records = [{ ...pending, borrower: { id: 'B1', username: 'borrower.demo' } }]
    render(<App />)
    await screen.findByLabelText('Due date for CAM-01')
    expect(screen.queryByLabelText('Decline reason for CAM-01')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull()
  })

  it('offers only custodian-selectable reasons', async () => {
    role = 'CUSTODIAN'; records = [{ ...pending, borrower: { id: 'B1', username: 'borrower.demo' } }]
    render(<App />)
    const reason = await screen.findByLabelText<HTMLSelectElement>('Decline reason for CAM-01')
    const values = [...reason.options].map(option => option.value)
    expect(values).toEqual(['', 'EQUIPMENT_UNAVAILABLE', 'BORROWER_NOT_ELIGIBLE', 'DUPLICATE_REQUEST', 'OTHER'])
  })
})
