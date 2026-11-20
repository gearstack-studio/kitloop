import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'

const asset = { assetId: 'CAM-01', name: 'Camera', category: 'Camera', description: 'Synthetic camera', available: true }
const pending = { id: 'R1', assetId: asset.assetId, status: 'PENDING', submittedAt: '2026-11-03T00:00:00Z', asset }
let history: object[]
let mode: 'success' | 'conflict' | 'expired' | 'refresh-error'
let committed: boolean
let posts: number
let borrowerId: string

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-csrf' } })
}
beforeEach(() => {
  window.history.replaceState(null, '', '/requests')
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  history = []; mode = 'success'; committed = false; posts = 0; borrowerId = 'borrower-1'
  vi.stubGlobal('fetch', vi.fn(async (input: string, options?: RequestInit) => {
    const path = new URL(input).pathname
    if (path === '/api/auth/me') return json({ id: borrowerId, role: 'BORROWER' })
    if (path === '/api/assets') return json([asset])
    if (path === '/api/loans/mine') return json([])
    if (path === '/api/requests/mine') {
      if (committed && mode === 'refresh-error') return json({ error: { message: 'Failed read' } }, 500)
      return json(history)
    }
    if (path === '/api/requests' && options?.method === 'POST') {
      posts++
      expect(JSON.parse(options.body as string)).toEqual({ assetId: 'CAM-01' })
      expect(options.credentials).toBe('include')
      expect((options.headers as Record<string, string>)['X-CSRF-Token']).toBe('test-csrf')
      if (mode === 'expired') return json({ error: { message: 'Authentication required' } }, 401)
      if (mode === 'conflict') {
        history = [pending]
        return json({ error: { message: 'You already have a pending request for this equipment.' } }, 409)
      }
      committed = true; history = [pending]
      return json(pending, 201)
    }
    throw new Error(`Unexpected API call: ${path}`)
  }))
})

async function submitForm() {
  await screen.findByRole('option', { name: /Camera · CAM-01/ })
  await waitFor(() => expect((screen.getByLabelText('Available equipment') as HTMLSelectElement).disabled).toBe(false))
  await userEvent.selectOptions(screen.getByLabelText('Available equipment'), 'CAM-01')
  await userEvent.click(screen.getByRole('button', { name: 'Submit request' }))
}

describe('Borrower workflow integration in the React app (mocked HTTP)', () => {
  it('explains why an available asset with the current borrower’s pending request cannot be requested', async () => {
    window.history.replaceState(null, '', '/dashboard')
    history = [{ ...pending, borrowerId }]
    render(<App />)

    await screen.findByText('CAM-01 · PENDING')
    const catalog = within(screen.getByRole('region', { name: 'Equipment catalog' }))
    expect(catalog.getByText('Available')).toBeTruthy()
    const button = catalog.getByRole<HTMLButtonElement>('button', { name: /you already have a pending request/i })
    expect(button.disabled).toBe(true)
    await userEvent.click(button)
    expect(window.location.pathname).toBe('/dashboard')
    expect(posts).toBe(0)
  })

  it('lets a different borrower select the same available asset when their own history has no pending request', async () => {
    window.history.replaceState(null, '', '/dashboard')
    borrowerId = 'borrower-2'
    history = [{ ...pending, status: 'CHECKED_OUT', borrowerId }]
    render(<App />)

    await screen.findByText('CAM-01 · CHECKED_OUT')
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Request to borrow Camera, CAM-01' })
    expect(button.disabled).toBe(false)
    await userEvent.click(button)
    expect(window.location.pathname).toBe('/requests')
    expect((screen.getByLabelText('Available equipment') as HTMLSelectElement).value).toBe('CAM-01')
  })

  it('keeps the newest request history when overlapping retries resolve out of order', async () => {
    window.history.replaceState(null, '', '/dashboard')
    const originalFetch = globalThis.fetch
    const older = Promise.withResolvers<Response>()
    const newer = Promise.withResolvers<Response>()
    const readHistory = vi.fn<() => Promise<Response>>()
      .mockResolvedValueOnce(json({ error: { message: 'Read failed' } }, 500))
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise)
    vi.stubGlobal('fetch', vi.fn((input: string, options?: RequestInit) => {
      if (new URL(input).pathname === '/api/requests/mine') return readHistory()
      return originalFetch(input, options)
    }))
    render(<App />)

    const retry = await screen.findByRole('button', { name: 'Retry requests' })
    act(() => {
      fireEvent.click(retry)
      fireEvent.click(retry)
    })
    expect(readHistory).toHaveBeenCalledTimes(3)
    await act(async () => { newer.resolve(json([pending])) })
    await screen.findByText('CAM-01 · PENDING')

    await act(async () => { older.resolve(json([])) })
    expect(screen.getByText('CAM-01 · PENDING')).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /you already have a pending request/i }).disabled).toBe(true)
  })

  it('submits from My Requests, refreshes persisted history, and prevents a second selection', async () => {
    render(<App />)
    await submitForm()
    await screen.findByText('CAM-01 · PENDING')
    expect(screen.getByText('Borrow request submitted with PENDING status.').getAttribute('role')).toBe('status')
    expect(screen.queryByRole('option', { name: /Camera · CAM-01/ })).toBeNull()
    expect(posts).toBe(1)
    expect(screen.queryByRole('button', { name: 'Check out' })).toBeNull()
  })
  it('refreshes stale history after a 409 without displaying success', async () => {
    mode = 'conflict'
    render(<App />)
    await submitForm()
    await screen.findByText('CAM-01 · PENDING')
    expect(screen.getByRole('alert').textContent).toContain('already have a pending request')
    expect(screen.queryByText(/Borrow request submitted/)).toBeNull()
    expect(posts).toBe(1)
  })
  it('ends an expired session and removes private history', async () => {
    mode = 'expired'
    render(<App />)
    await submitForm()
    await screen.findByRole('button', { name: 'Sign In' })
    expect(window.location.pathname).toBe('/login')
    expect(screen.queryByRole('heading', { name: 'My requests' })).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('session has ended')
  })
  it('distinguishes successful creation from a failed history refresh and blocks resubmission', async () => {
    mode = 'refresh-error'
    render(<App />)
    await submitForm()
    await screen.findByText(/The action succeeded, but updated records could not be loaded/)
    expect((screen.getByRole('button', { name: 'Submit request' }) as HTMLButtonElement).disabled).toBe(true)
    expect(posts).toBe(1)
  })
  it('loads request history on a fresh visit to the page', async () => {
    history = [{ ...pending, status: 'CHECKED_OUT' }]
    render(<App />)
    await screen.findByText('CAM-01 · CHECKED_OUT')
    expect(screen.getByText('Camera')).toBeTruthy()
  })
  it('ignores a delayed history retry after logout and a different borrower signs in', async () => {
    const originalFetch = globalThis.fetch
    let resolveOld!: (response: Response) => void
    let reads = 0
    vi.stubGlobal('fetch', vi.fn(async (input: string, options?: RequestInit) => {
      const path = new URL(input).pathname
      if (path === '/api/requests/mine') {
        reads++
        if (reads === 1) return json({ error: { message: 'Read failed' } }, 500)
        if (reads === 2) return new Promise<Response>(resolve => { resolveOld = resolve })
        // Hold the new account's read so it cannot hide a stale-state leak.
        return new Promise<Response>(() => {})
      }
      if (path === '/api/auth/logout') return new Response(null, { status: 204 })
      if (path === '/api/auth/login') return json({ user: { id: 'borrower-2', role: 'BORROWER' } })
      return originalFetch(input, options)
    }))
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Retry requests' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByRole('button', { name: 'Sign In' })
    resolveOld(json([pending]))
    await userEvent.type(screen.getByLabelText('Username'), 'another-borrower')
    await userEvent.type(screen.getByLabelText('Password'), 'synthetic')
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }))
    await screen.findByText('Loading requests…')
    expect(screen.queryByText('CAM-01 · PENDING')).toBeNull()
  })
})
