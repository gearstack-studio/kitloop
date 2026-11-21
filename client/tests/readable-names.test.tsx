import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import Loans, { type Loan } from '../src/components/Loans'
import Requests, { type BorrowRequest } from '../src/components/Requests'

// UAT-E03 (#63): people and equipment are shown by name; UUIDs stay available only as secondary "Record IDs" metadata.
const alice = { id: 'a11ce000-0000-4000-8000-000000000001', username: 'alice.borrower' }
const bob = { id: 'b0b00000-0000-4000-8000-000000000002', username: 'bob.borrower' }
const carol = { id: 'ca401000-0000-4000-8000-000000000003', username: 'carol.custodian' }
const dave = { id: 'da7e0000-0000-4000-8000-000000000004', username: 'dave.custodian' }
const loanFor = (id: string, borrower: typeof alice, custodian: typeof carol, assetId: string, name: string): Loan => ({
  id, requestId: `req-${id}`, assetId, borrowerId: borrower.id, checkoutCustodianId: custodian.id,
  checkedOutAt: '2026-11-03T10:00:00Z', dueAt: '2026-11-05T10:00:00Z', returnedAt: null, status: 'ACTIVE',
  asset: { assetId, name }, borrower, checkoutCustodian: custodian,
})
const cameraLoan = loanFor('L1', alice, carol, 'CAM-01', 'Mirrorless camera')
const tripodLoan = loanFor('L2', bob, dave, 'TRI-01', 'Carbon tripod')
const article = (text: string) => screen.getByText(text).closest('article')!
/** The header identity tag by its accessible text (a visually hidden "Signed in as " prefix plus the visible name). */
const findTag = (text: string) => screen.findByText((_, el) => !!el?.classList.contains('identity-tag') && el.textContent === text)
const visibleText = (element: Element) => {
  const clone = element.cloneNode(true) as Element
  clone.querySelectorAll('details').forEach(node => node.remove())   // collapsed secondary metadata
  return clone.textContent ?? ''
}

describe('UAT-E03 loans show names', () => {
  it('custodian Active loans: equipment, borrower and checkout custodian by name for each record', () => {
    render(<Loans loans={[cameraLoan, tripodLoan]} status="ready" onRetry={vi.fn()} custodian />)
    const camera = article('Mirrorless camera · ACTIVE'), tripod = article('Carbon tripod · ACTIVE')
    expect(within(camera).getByText('Borrower: alice.borrower')).toBeTruthy()
    expect(within(camera).getByText('Checked out by: carol.custodian')).toBeTruthy()
    expect(within(tripod).getByText('Borrower: bob.borrower')).toBeTruthy()
    expect(within(tripod).getByText('Checked out by: dave.custodian')).toBeTruthy()
    for (const [record, loan] of [[camera, cameraLoan], [tripod, tripodLoan]] as const) {
      expect(within(record).getByText(loan.assetId)).toBeTruthy()
      expect(within(record).getByText(/^Checked out (?!by:)/)).toBeTruthy()   // the checkout date line
      expect(within(record).getByText(/^Due /)).toBeTruthy()
      for (const id of [loan.borrowerId, loan.checkoutCustodianId, loan.requestId]) expect(visibleText(record)).not.toContain(id)
    }
  })

  // Final privacy audit: FR-11 covers checkout, due and return information only; the borrower view names no people.
  it('borrower My loans: equipment name and dates, no person names or custodian ID', () => {
    const asSentToBorrower: Loan = { ...cameraLoan, borrower: undefined, checkoutCustodian: undefined }   // as /loans/mine sends it
    render(<Loans loans={[asSentToBorrower]} status="ready" onRetry={vi.fn()} custodian={false} />)
    const camera = article('Mirrorless camera · ACTIVE')
    expect(within(camera).getByText('CAM-01')).toBeTruthy()
    expect(within(camera).getByText(/^Due /)).toBeTruthy()
    expect(within(camera).queryByText(/^Checked out by/)).toBeNull()
    expect(within(camera).queryByText(/^Borrower:/)).toBeNull()
    expect(within(camera).queryByText(/Name unavailable/)).toBeNull()
    expect(camera.textContent).not.toContain(carol.id)
    expect(camera.textContent).not.toContain(alice.id)
    expect(within(camera).getByText('Loan L1')).toBeTruthy()   // own loan and request IDs stay available
  })

  it('keeps loan, request and person IDs as collapsed secondary metadata', () => {
    render(<Loans loans={[cameraLoan]} status="ready" onRetry={vi.fn()} custodian />)
    const ids = within(article('Mirrorless camera · ACTIVE')).getByText('Record IDs').closest('details')!
    expect(ids.open).toBe(false)
    for (const text of ['Loan L1', 'Request req-L1', `Borrower ID ${alice.id}`, `Custodian ID ${carol.id}`]) {
      expect(within(ids).getByText(text)).toBeTruthy()
    }
  })

  it('falls back to the Asset ID and "Name unavailable" without inventing names or showing UUIDs as names', () => {
    const bare: Loan = { ...cameraLoan, asset: undefined, borrower: undefined, checkoutCustodian: undefined }
    render(<Loans loans={[bare]} status="ready" onRetry={vi.fn()} custodian />)
    const record = article('CAM-01 · ACTIVE')
    expect(within(record).getByText('Borrower: Name unavailable')).toBeTruthy()
    expect(within(record).getByText('Checked out by: Name unavailable')).toBeTruthy()
    expect(visibleText(record)).not.toContain(alice.id)
  })
})

describe('UAT-E03 requests show names', () => {
  const pending: BorrowRequest[] = [
    { id: 'R1', assetId: 'CAM-01', borrowerId: alice.id, status: 'PENDING', submittedAt: '2026-11-03T00:00:00Z',
      asset: { assetId: 'CAM-01', name: 'Mirrorless camera', category: 'Camera' }, borrower: alice },
    { id: 'R2', assetId: 'TRI-01', borrowerId: bob.id, status: 'PENDING', submittedAt: '2026-11-03T01:00:00Z',
      asset: { assetId: 'TRI-01', name: 'Carbon tripod', category: 'Support' }, borrower: bob },
  ]
  it('custodian Pending requests: equipment and borrower by name; UUIDs only in Record IDs', () => {
    render(<Requests requests={pending} status="ready" onRetry={vi.fn()} custodian />)
    expect(within(article('Mirrorless camera')).getByText('Borrower: alice.borrower')).toBeTruthy()
    expect(within(article('Carbon tripod')).getByText('Borrower: bob.borrower')).toBeTruthy()
    expect(visibleText(article('Mirrorless camera'))).not.toContain(alice.id)
    expect(visibleText(article('Mirrorless camera'))).not.toMatch(/Request R1/)
    expect(within(article('Mirrorless camera')).getByText('Request R1').closest('details')).not.toBeNull()
  })
  it('borrower My requests: equipment name first, status kept, request ID secondary', () => {
    render(<Requests requests={[{ ...pending[0], borrower: undefined }]} status="ready" onRetry={vi.fn()} />)
    const record = article('Mirrorless camera')
    expect(within(record).getByText('CAM-01 · PENDING')).toBeTruthy()
    expect(within(record).getByText('Request R1').closest('details')).not.toBeNull()
    expect(within(record).queryByText(/^Borrower:/)).toBeNull()
  })
})

describe('UAT-E03 header shows the signed-in username', () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body),
    { status, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-csrf' } })
  beforeEach(() => {
    window.history.replaceState(null, '', '/dashboard')
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    { who: alice, role: 'BORROWER', loans: 'mine' },
    { who: carol, role: 'CUSTODIAN', loans: 'active' },
  ])('$role: shows the username once, never an account UUID prefix', async ({ who, role, loans }) => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const path = new URL(input).pathname
      if (path === '/api/auth/me') return json({ id: who.id, role, username: who.username })
      if (path === '/api/assets' || path.startsWith('/api/requests/')) return json([])
      if (path === `/api/loans/${loans}`) return json([])
      throw new Error(`Unexpected API call: ${path}`)
    }))
    render(<App />)
    const tag = await findTag(`Signed in as ${who.username}`)
    expect(tag.querySelector('.visually-hidden')?.textContent).toBe('Signed in as ')
    expect(document.body.textContent!.split(who.username).length - 1).toBe(1)   // shown once
    expect(document.body.textContent).not.toContain(who.id.slice(0, 8))
    expect(document.body.textContent).not.toMatch(/Account [0-9a-f]{8}/)
  })

  it('uses the username from the login response', async () => {
    window.history.replaceState(null, '', '/login')
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const path = new URL(input).pathname
      if (path === '/api/auth/me') return json({ error: { message: 'Authentication required' } }, 401)
      if (path === '/api/auth/login') return json({ user: { id: bob.id, role: 'BORROWER', username: bob.username } })
      if (path === '/api/assets' || path.startsWith('/api/requests/') || path.startsWith('/api/loans/')) return json([])
      throw new Error(`Unexpected API call: ${path}`)
    }))
    render(<App />)
    await userEvent.type(await screen.findByLabelText('Username'), bob.username)
    await userEvent.type(screen.getByLabelText('Password'), 'synthetic-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }))
    expect(await findTag(`Signed in as ${bob.username}`)).toBeTruthy()
  })

  it('falls back to the role, not a UUID, if the server sends no username', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const path = new URL(input).pathname
      if (path === '/api/auth/me') return json({ id: alice.id, role: 'BORROWER' })
      if (path === '/api/assets' || path.startsWith('/api/requests/') || path.startsWith('/api/loans/')) return json([])
      throw new Error(`Unexpected API call: ${path}`)
    }))
    render(<App />)
    expect(await findTag('Signed in as Borrower account')).toBeTruthy()
    expect(document.body.textContent).not.toContain(alice.id.slice(0, 8))
  })
})
