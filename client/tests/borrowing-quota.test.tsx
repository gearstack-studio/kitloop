// CR-01 r4 (K2a) frontend RED suite — pending-request quota UI (#80, #82).
// Contract: AC10, AC11, AC12, AC18, AC19 (docs/labs/lab-07/CR-01-acceptance-criteria.md); STS TC10, TC11, TC12, TC18,
// TC19 (client parts). Accessible wording recorded before RED in #82 (issuecomment-7195791047).
// Drives the real App through mocked HTTP only; imports nothing that does not exist before implementation.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'

type Quota = { pendingRequests: number; maxPendingRequests: number; remainingRequestCapacity: number; canSubmitRequest: boolean }
type Call = { method: string; path: string; search: string; credentials?: RequestCredentials; body?: BodyInit | null }
type QuotaReply = Quota | { status: number; body: unknown } | Promise<Response>
type User = { id: string; role: 'BORROWER' | 'CUSTODIAN'; username: string }

const quota = (pendingRequests: number): Quota => ({
  pendingRequests, maxPendingRequests: 2,
  remainingRequestCapacity: Math.max(0, 2 - pendingRequests), canSubmitRequest: pendingRequests < 2,
})
const camera = { assetId: 'CAM-01', name: 'Camera', category: 'Camera', description: 'Synthetic camera', available: true }
const laptop = { assetId: 'LAP-01', name: 'Laptop', category: 'Computer', description: 'Synthetic laptop', available: true }
const tripod = { assetId: 'TRI-01', name: 'Tripod', category: 'Camera', description: 'Synthetic tripod', available: true }
const microphone = { assetId: 'MIC-01', name: 'Microphone', category: 'Audio', description: 'Synthetic microphone', available: false }
const assets = [camera, laptop, microphone, tripod]
const pendingOn = (id: string, asset: typeof camera, borrowerId = 'B1') =>
  ({ id, assetId: asset.assetId, borrowerId, status: 'PENDING', submittedAt: '2026-11-26T00:00:00Z', closedAt: null, closeReason: null, asset })
const activeLoan = { id: 'L1', requestId: 'R9', assetId: 'TRI-01', borrowerId: 'B1', checkoutCustodianId: 'C1',
  checkedOutAt: '2026-11-25T00:00:00Z', dueAt: '2026-12-25T00:00:00Z', returnedAt: null, returnCustodianId: null,
  status: 'ACTIVE', asset: { assetId: 'TRI-01', name: 'Tripod' } }

const B1: User = { id: 'B1', role: 'BORROWER', username: 'borrower.one' }
const B2: User = { id: 'B2', role: 'BORROWER', username: 'borrower.two' }
const C1: User = { id: 'C1', role: 'CUSTODIAN', username: 'custodian.one' }

let calls: Call[]
let me: User | null
let features: Record<string, unknown> | undefined
let history: Record<string, object[]>
let loans: Record<string, object[]>
let quotaReplies: Record<string, QuotaReply[]>
let submitReply: { status: number; body: unknown } | null
let cancelReply: { status: number; body: unknown } | null

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-csrf' } })
}
const deferred = () => {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>(done => { resolve = done })
  return { promise, resolve }
}
const quotaCalls = () => calls.filter(call => call.path === '/api/borrowing-quota')
const indexOf = (method: string, path: string) => calls.findIndex(call => call.method === method && call.path === path)

function nextQuota(userId: string): Response | Promise<Response> {
  const queue = quotaReplies[userId] ?? []
  const reply = queue.length > 1 ? queue.shift()! : queue[0]
  if (reply === undefined) throw new Error(`No quota reply configured for ${userId}`)
  if (reply instanceof Promise) return reply
  if ('status' in reply) return json(reply.body, reply.status)
  return json(reply)
}

beforeEach(() => {
  window.history.replaceState(null, '', '/requests')
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  calls = []; me = B1; features = { borrowingQuota: true, requestLifecycleActions: true }
  history = { B1: [], B2: [], C1: [] }; loans = { B1: [], B2: [], C1: [] }
  quotaReplies = { B1: [quota(0)], B2: [quota(0)] }; submitReply = null; cancelReply = null
  vi.stubGlobal('fetch', vi.fn(async (input: string, options: RequestInit = {}) => {
    const url = new URL(input)
    const method = options.method ?? 'GET'
    calls.push({ method, path: url.pathname, search: url.search, credentials: options.credentials, body: options.body })
    const path = url.pathname
    if (path === '/api/auth/me') return me ? json({ ...me, features }) : json({ error: { message: 'Authentication required' } }, 401)
    if (path === '/api/auth/login' && method === 'POST') {
      const { username } = JSON.parse(options.body as string)
      me = [B1, B2, C1].find(user => user.username === username) ?? null
      return me ? json({ user: me, features }) : json({ error: { message: 'Invalid credentials' } }, 401)
    }
    if (path === '/api/auth/logout' && method === 'POST') { me = null; return new Response(null, { status: 204 }) }
    if (!me) return json({ error: { message: 'Authentication required' } }, 401)
    if (path === '/api/assets') return json(assets)
    if (path === '/api/requests/mine' || path === '/api/requests/pending') return json(history[me.id] ?? [])
    if (path === '/api/loans/mine' || path === '/api/loans/active') return json(loans[me.id] ?? [])
    if (path === '/api/borrowing-quota' && method === 'GET') return nextQuota(me.id)
    if (path === '/api/requests' && method === 'POST') {
      const reply = submitReply ?? { status: 201, body: pendingOn('R-NEW', camera, me.id) }
      if (reply.status === 201) history[me.id] = [reply.body as object, ...(history[me.id] ?? [])]
      return json(reply.body, reply.status)
    }
    const cancel = /^\/api\/requests\/([^/]+)\/cancel$/.exec(path)
    if (cancel && method === 'POST') {
      const reply = cancelReply ?? { status: 200, body: {} }
      if (reply.status === 200) {
        history[me.id] = (history[me.id] ?? []).map(item => (item as { id: string }).id === cancel[1]
          ? { ...item, status: 'CANCELLED', closedAt: '2026-11-27T00:00:00Z', closeReason: 'CANCELLED_BY_BORROWER' } : item)
      }
      return json(reply.status === 200 ? history[me.id].find(item => (item as { id: string }).id === cancel[1]) : reply.body, reply.status)
    }
    throw new Error(`Unexpected API call: ${method} ${path}`)
  }))
})

const region = () => screen.findByRole('region', { name: 'Borrowing limit' })
const submitButton = () => screen.getByRole('button', { name: 'Submit request' }) as HTMLButtonElement
const selector = () => screen.getByLabelText('Available equipment') as HTMLSelectElement
async function historyLoaded() {
  await screen.findByRole('heading', { name: 'My requests' })
  await waitFor(() => expect(screen.queryByText('Loading requests…')).toBeNull())
}
async function chooseCamera() {
  await screen.findByRole('option', { name: /Camera · CAM-01/ })
  await waitFor(() => expect(selector().disabled).toBe(false))
  await userEvent.selectOptions(selector(), 'CAM-01')
}
async function submitCamera() {
  await chooseCamera()
  await waitFor(() => expect(submitButton().disabled).toBe(false))
  await userEvent.click(submitButton())
}

describe('CR-01 pending-request quota UI (AC11 / TC11)', () => {
  it('Q01 AC11-S1: shows available pending capacity (active loans not counted) and allows submission', async () => {
    history.B1 = [pendingOn('R1', laptop)]; loans.B1 = [activeLoan]; quotaReplies.B1 = [quota(1)]
    render(<App />)
    const panel = await region()
    expect(within(panel).getByText(/1 of 2 pending requests/)).toBeTruthy()
    expect(within(panel).getByText(/You can submit 1 more request\b/)).toBeTruthy()
    expect(within(panel).queryByText(/loan/i)).toBeNull()
    await chooseCamera()
    expect(submitButton().disabled).toBe(false)
  })

  it('Q02a AC11-S2: at the limit the panel says so and the request form is disabled', async () => {
    history.B1 = [pendingOn('R1', laptop), pendingOn('R2', tripod)]; quotaReplies.B1 = [quota(2)]
    render(<App />)
    const panel = await region()
    expect(within(panel).getByText(/2 of 2 pending requests/)).toBeTruthy()
    expect(within(panel).getByText(/Limit reached/i)).toBeTruthy()
    await historyLoaded()
    expect(selector().disabled).toBe(true)
    expect(submitButton().disabled).toBe(true)
  })

  it('Q02b AC11-S2: catalog eligibility precedence is unavailable → already pending → quota reached → eligible', async () => {
    window.history.replaceState(null, '', '/dashboard')
    history.B1 = [pendingOn('R1', laptop), pendingOn('R2', tripod)]; quotaReplies.B1 = [quota(2)]
    render(<App />)
    const limited = await screen.findByRole('button', { name: /Request limit reached: Camera, CAM-01/ })
    expect((limited as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: /Request pending: you already have a pending request for Laptop, LAP-01/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Microphone, MIC-01 is checked out and cannot be requested' })).toBeTruthy()
  })

  it('Q03 AC11-S3: historical over-limit usage is shown unclamped and blocks submission', async () => {
    const old = { ...camera, assetId: 'OLD-01', name: 'Old projector' }
    history.B1 = [pendingOn('R1', laptop), pendingOn('R2', tripod), pendingOn('R3', old)]; quotaReplies.B1 = [quota(3)]
    render(<App />)
    const panel = await region()
    expect(within(panel).getByText(/3 of 2 pending requests/)).toBeTruthy()
    expect(within(panel).getByText(/Limit reached/i)).toBeTruthy()
    await historyLoaded()
    expect(submitButton().disabled).toBe(true)
  })

  it('Q04a AC11-S4: while the quota is loading, a loading status is shown and submission is disabled', async () => {
    quotaReplies.B1 = [deferred().promise]
    render(<App />)
    await historyLoaded()
    const loading = await screen.findByText('Loading borrowing limit…')
    expect(loading.closest('[role="status"]')).toBeTruthy()
    // Whether or not the selector is usable while loading, a selection must not make submission possible.
    await screen.findByRole('option', { name: /Camera · CAM-01/ })
    if (!selector().disabled) await userEvent.selectOptions(selector(), 'CAM-01')
    expect(submitButton().disabled).toBe(true)
  })

  it('Q04b AC11-S4 (preserved): an unknown quota does not disable cancelling an existing pending request', async () => {
    history.B1 = [pendingOn('R1', laptop)]; quotaReplies.B1 = [deferred().promise]
    render(<App />)
    const cancel = await screen.findByRole('button', { name: 'Cancel request for Laptop' })
    expect((cancel as HTMLButtonElement).disabled).toBe(false)
  })

  it('Q05 AC11-S5: a failed quota read shows an alert with Retry; Retry recovers the panel', async () => {
    quotaReplies.B1 = [{ status: 500, body: { error: { message: 'Failed' } } }, quota(0)]
    render(<App />)
    const alert = await screen.findByText('Borrowing limit could not be loaded.')
    expect(alert.closest('[role="alert"]')).toBeTruthy()
    await historyLoaded()
    expect(submitButton().disabled).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Retry borrowing limit' }))
    const panel = await region()
    expect(await within(panel).findByText(/0 of 2 pending requests/)).toBeTruthy()
    await chooseCamera()
    expect(submitButton().disabled).toBe(false)
  })

  it('Q06 AC11-S6: a stale-state 409 BORROWING_QUOTA_EXCEEDED shows the server message and re-reads quota, catalog, requests and loans', async () => {
    history.B1 = [pendingOn('R1', laptop)]; quotaReplies.B1 = [quota(1), quota(2)]
    submitReply = { status: 409, body: { error: { code: 'BORROWING_QUOTA_EXCEEDED', message: 'You already have two pending requests.' } } }
    render(<App />)
    await historyLoaded()
    await submitCamera()
    expect(await screen.findByText('You already have two pending requests.')).toBeTruthy()
    expect(screen.queryByText('Borrow request submitted with PENDING status.')).toBeNull()
    const post = indexOf('POST', '/api/requests')
    await waitFor(() => {
      // Catalog, requests and loans refresh already happens today (preserved); the quota re-read is the new behavior.
      for (const path of ['/api/assets', '/api/requests/mine', '/api/loans/mine', '/api/borrowing-quota']) {
        expect(calls.slice(post + 1).some(call => call.method === 'GET' && call.path === path), `GET ${path} after the 409`).toBe(true)
      }
    })
    const panel = await region()
    expect(await within(panel).findByText(/2 of 2 pending requests/)).toBeTruthy()
    expect(within(panel).getByText(/Limit reached/i)).toBeTruthy()
  })

  it('Q07a AC11-S7: a successful submission shows the notice and re-reads the quota', async () => {
    quotaReplies.B1 = [quota(1), quota(2)]
    history.B1 = [pendingOn('R1', laptop)]
    render(<App />)
    await historyLoaded()
    await submitCamera()
    expect(await screen.findByText('Borrow request submitted with PENDING status.')).toBeTruthy()
    const post = indexOf('POST', '/api/requests')
    await waitFor(() => expect(calls.slice(post + 1).some(call => call.path === '/api/borrowing-quota')).toBe(true))
    expect(await within(await region()).findByText(/2 of 2 pending requests/)).toBeTruthy()
  })

  it('Q07b AC11-S7: if the quota re-read fails after success, the UI says so and keeps submission disabled', async () => {
    quotaReplies.B1 = [quota(0), { status: 500, body: { error: { message: 'Failed' } } }]
    render(<App />)
    await historyLoaded()
    await submitCamera()
    expect(await screen.findByText(/succeeded, but your borrowing limit could not be refreshed/i)).toBeTruthy()
    expect(submitButton().disabled).toBe(true)
  })

  it('Q08 AC11-S8: a 401 from the quota read ends the session and removes quota state', async () => {
    quotaReplies.B1 = [{ status: 401, body: { error: { message: 'Authentication required' } } }]
    render(<App />)
    expect(await screen.findByText('Your session has ended. Please sign in again.')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Borrowing limit' })).toBeNull()
    expect(quotaCalls()).toHaveLength(1)
  })

  it('Q09 AC11-S9: a late quota response from a previous session is ignored after another borrower signs in', async () => {
    const late = deferred()
    quotaReplies.B1 = [late.promise]; quotaReplies.B2 = [quota(0)]
    history.B2 = []
    render(<App />)
    await waitFor(() => expect(quotaCalls()).toHaveLength(1))
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    await userEvent.type(await screen.findByLabelText('Username'), 'borrower.two')
    await userEvent.type(screen.getByLabelText('Password'), 'synthetic-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }))
    await userEvent.click(await screen.findByRole('link', { name: 'My requests' }))
    const panel = await region()
    expect(await within(panel).findByText(/0 of 2 pending requests/)).toBeTruthy()
    late.resolve(json(quota(2)))
    await new Promise(done => setTimeout(done, 50))
    expect(within(await region()).getByText(/0 of 2 pending requests/)).toBeTruthy()
    expect(screen.queryByText(/2 of 2 pending requests/)).toBeNull()
  })

  it('Q10 AC11-S10 (preserved): a custodian never reads a quota and sees no quota panel', async () => {
    me = C1
    window.history.replaceState(null, '', '/dashboard')
    render(<App />)
    await screen.findByRole('heading', { name: 'Pending requests' })
    await new Promise(done => setTimeout(done, 50))
    expect(quotaCalls()).toHaveLength(0)
    expect(screen.queryByRole('region', { name: 'Borrowing limit' })).toBeNull()
  })
})

describe('CR-01 quota after recovery (AC18 / TC18)', () => {
  it('Q11 AC18-S1: cancelling a pending request re-reads the quota and re-enables submission', async () => {
    history.B1 = [pendingOn('R1', laptop), pendingOn('R2', tripod)]; quotaReplies.B1 = [quota(2), quota(1)]
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel request for Laptop' }))
    expect(await screen.findByText('Request cancelled.')).toBeTruthy()
    const cancelled = indexOf('POST', '/api/requests/R1/cancel')
    await waitFor(() => expect(calls.slice(cancelled + 1).some(call => call.path === '/api/borrowing-quota')).toBe(true))
    const panel = await region()
    expect(await within(panel).findByText(/1 of 2 pending requests/)).toBeTruthy()
    expect(within(panel).getByText(/You can submit 1 more request\b/)).toBeTruthy()
    await chooseCamera()
    expect(submitButton().disabled).toBe(false)
  })

  it('Q12a AC18-S2: entering My requests re-reads the quota (recovery made by another user)', async () => {
    window.history.replaceState(null, '', '/dashboard')
    quotaReplies.B1 = [quota(2), quota(1)]
    render(<App />)
    await waitFor(() => expect(quotaCalls()).toHaveLength(1))
    await userEvent.click(await screen.findByRole('link', { name: 'My requests' }))
    const panel = await region()
    expect(await within(panel).findByText(/1 of 2 pending requests/)).toBeTruthy()
    expect(quotaCalls().length).toBeGreaterThanOrEqual(2)
  })

  it('Q12b AC18-S2: the Refresh borrowing limit button re-reads the quota', async () => {
    quotaReplies.B1 = [quota(2), quota(1)]
    render(<App />)
    const panel = await region()
    expect(await within(panel).findByText(/2 of 2 pending requests/)).toBeTruthy()
    const before = quotaCalls().length
    await userEvent.click(within(panel).getByRole('button', { name: 'Refresh borrowing limit' }))
    expect(await within(await region()).findByText(/1 of 2 pending requests/)).toBeTruthy()
    expect(quotaCalls().length).toBe(before + 1)
  })

  it('Q13 AC18-S3: recovery succeeded but the quota re-read failed — message shown, submission disabled until Retry', async () => {
    history.B1 = [pendingOn('R1', laptop), pendingOn('R2', tripod)]
    quotaReplies.B1 = [quota(2), { status: 500, body: { error: { message: 'Failed' } } }, quota(1)]
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel request for Laptop' }))
    expect(await screen.findByText(/succeeded, but your borrowing limit could not be refreshed/i)).toBeTruthy()
    expect(submitButton().disabled).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Retry borrowing limit' }))
    expect(await within(await region()).findByText(/1 of 2 pending requests/)).toBeTruthy()
    await chooseCamera()
    expect(submitButton().disabled).toBe(false)
  })
})

describe('CR-01 persistence, feature flag and API contract (AC12, AC19, AC10 / TC12, TC19, TC10)', () => {
  it('Q14 AC12: a reload reads the quota from the server again; nothing is cached on the client', async () => {
    quotaReplies.B1 = [quota(1), quota(2)]
    const first = render(<App />)
    expect(await within(await region()).findByText(/1 of 2 pending requests/)).toBeTruthy()
    first.unmount()
    render(<App />)
    expect(await within(await region()).findByText(/2 of 2 pending requests/)).toBeTruthy()
    expect(quotaCalls()).toHaveLength(2)
    const stored = [...Object.keys(localStorage), ...Object.keys(sessionStorage)]
    expect(stored.filter(key => /quota|borrow/i.test(key))).toEqual([])
  })

  it.each([
    ['false', { borrowingQuota: false, requestLifecycleActions: true }],
    ['absent', { requestLifecycleActions: true }],
  ])('Q15 AC19-S3 (preserved): with features.borrowingQuota %s there is no quota call or panel and submission is unchanged', async (_label, flags) => {
    features = flags
    history.B1 = [pendingOn('R1', laptop), pendingOn('R2', tripod)]
    render(<App />)
    await chooseCamera()
    await userEvent.click(submitButton())
    expect(await screen.findByText('Borrow request submitted with PENDING status.')).toBeTruthy()
    expect(quotaCalls()).toHaveLength(0)
    expect(screen.queryByRole('region', { name: 'Borrowing limit' })).toBeNull()
  })

  it('Q16 AC10 / TC10 (client): the quota read is a credentialed GET with no query string, body or borrower identifier', async () => {
    quotaReplies.B1 = [quota(0)]
    render(<App />)
    await historyLoaded()
    await waitFor(() => expect(quotaCalls().length).toBeGreaterThanOrEqual(1))
    for (const call of quotaCalls()) {
      expect(call.method).toBe('GET')
      expect(call.search).toBe('')
      expect(call.credentials).toBe('include')
      expect(call.body ?? null).toBeNull()
      expect(call.path).not.toMatch(/B1|borrower/i)
    }
  })
})
