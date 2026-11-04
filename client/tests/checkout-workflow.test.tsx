import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'

const asset = { assetId: 'CAM-01', name: 'Camera', category: 'Camera', description: 'Synthetic', available: true }
const pending = { id: 'R1', assetId: asset.assetId, borrowerId: 'B1', status: 'PENDING', submittedAt: '2026-11-03T00:00:00Z',
  asset, borrower: { id: 'B1', username: 'borrower.demo' } }
let mode: 'success' | 'conflict' | 'forbidden' | 'expired' | 'failure' | 'refresh-error' | 'held'
let checkedOut: boolean, unavailable: boolean, posts: number
let loan: object | undefined
let release!: () => void
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-csrf' } })
}
beforeEach(() => {
  window.history.replaceState(null, '', '/dashboard')
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  mode = 'success'; checkedOut = false; unavailable = false; posts = 0; loan = undefined
  vi.stubGlobal('fetch', vi.fn(async (input: string, options?: RequestInit) => {
    const path = new URL(input).pathname
    if (path === '/api/auth/me') return json({ id: 'C1', role: 'CUSTODIAN' })
    if (path === '/api/assets') return json([{ ...asset, available: !checkedOut && !unavailable }])
    if (path === '/api/requests/pending') {
      if (checkedOut && mode === 'refresh-error') return json({ error: { message: 'Read failed' } }, 500)
      return json(checkedOut ? [] : [pending])
    }
    if (path === '/api/loans/active') return json(loan ? [loan] : [])
    if (path === '/api/requests/R1/checkout' && options?.method === 'POST') {
      posts++
      const body = JSON.parse(options.body as string)
      expect(Object.keys(body).sort()).toEqual(['assetId', 'dueAt'])
      expect(body.assetId).toBe('CAM-01')
      expect(body.dueAt).toBe(new Date('2099-01-02T09:30').toISOString())
      expect((options.headers as Record<string, string>)['X-CSRF-Token']).toBe('test-csrf')
      if (mode === 'forbidden') return json({ error: { message: 'Forbidden' } }, 403)
      if (mode === 'expired') return json({ error: { message: 'Authentication required' } }, 401)
      if (mode === 'failure') return json({ error: { message: 'An unexpected error occurred' } }, 500)
      if (mode === 'conflict') { unavailable = true; return json({ error: { message: 'Equipment is unavailable' } }, 409) }
      function complete() {
        checkedOut = true
        loan = { id: 'L1', requestId: 'R1', assetId: 'CAM-01', borrowerId: 'B1', checkoutCustodianId: 'C1',
          checkedOutAt: '2026-11-03T10:00:00Z', dueAt: body.dueAt, returnedAt: null, status: 'ACTIVE' }
        return json(loan, 201)
      }
      if (mode === 'held') return new Promise<Response>(resolve => { release = () => resolve(complete()) })
      return complete()
    }
    throw new Error(`Unexpected API: ${path}`)
  }))
})
async function submit() {
  const due = await screen.findByLabelText('Due date for CAM-01')
  fireEvent.change(due, { target: { value: '2099-01-02T09:30' } })
  await userEvent.click(screen.getByRole('button', { name: 'Check out' }))
}

describe('Custodian checkout app workflow (mocked HTTP)', () => {
  it('submits the selected request and refreshes queue, availability and the ACTIVE loan', async () => {
    render(<App />)
    await submit()
    await screen.findByText('Loan L1')
    expect(screen.getByText('CAM-01 · ACTIVE')).toBeTruthy()
    expect(screen.getByText('Checked out')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Check out' })).toBeNull()
    expect(screen.getByText(/Checkout recorded. Request CHECKED_OUT/)).toBeTruthy()
    expect(posts).toBe(1)
  })
  it('prevents duplicate clicks while a checkout is in flight', async () => {
    mode = 'held'; render(<App />)
    await submit()
    const button = screen.getByRole('button', { name: 'Processing…' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(button)
    expect(posts).toBe(1)
    release()
    await screen.findByText('Loan L1')
  })
  it('refreshes after a 409, disables checkout of the now unavailable item, and shows the conflict', async () => {
    mode = 'conflict'; render(<App />)
    await submit()
    await screen.findByText('Equipment is no longer available for checkout.')
    expect(screen.getByRole('alert').textContent).toContain('Equipment is unavailable')
    expect((screen.getByRole('button', { name: 'Check out' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByText('Loan L1')).toBeNull()
  })
  it('keeps the session after a 403 and reports lack of permission', async () => {
    mode = 'forbidden'; render(<App />)
    await submit()
    await screen.findByText('You do not have permission for this action.')
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
    expect(screen.queryByText('Loan L1')).toBeNull()
  })
  it('clears private custodian state when the session expires', async () => {
    mode = 'expired'; render(<App />)
    await submit()
    await screen.findByRole('button', { name: 'Sign In' })
    expect(window.location.pathname).toBe('/login')
    expect(screen.queryByText(/borrower.demo/)).toBeNull()
  })
  it('shows safe server failures without claiming success', async () => {
    mode = 'failure'; render(<App />)
    await submit()
    await screen.findByText('An unexpected error occurred')
    expect(screen.queryByText(/Checkout recorded/)).toBeNull()
    expect(screen.queryByText('Loan L1')).toBeNull()
  })
  it('distinguishes a committed checkout from a failed refresh and hides repeat checkout controls', async () => {
    mode = 'refresh-error'; render(<App />)
    await submit()
    await screen.findByText(/The action succeeded, but updated records could not be loaded/)
    expect(screen.queryByRole('button', { name: 'Check out' })).toBeNull()
    expect(posts).toBe(1)
  })
})
