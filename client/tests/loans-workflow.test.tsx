import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'

const loan = {
  id: 'L1', assetId: 'CAM-01', borrowerId: 'B1', requestId: 'R1', checkoutCustodianId: 'C1',
  checkedOutAt: '2026-11-03T10:00:00Z', dueAt: '2026-11-04T10:00:00Z', returnedAt: null, status: 'ACTIVE',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe.each([
  { role: 'BORROWER', heading: 'My loans', endpoint: 'mine' },
  { role: 'CUSTODIAN', heading: 'Active loans', endpoint: 'active' },
])('$heading panel', ({ role, heading, endpoint }) => {
  function mockDashboard(readLoans: () => Promise<Response>) {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const path = new URL(input).pathname
      if (path === '/api/auth/me') return json({ id: 'user-1', role })
      if (path === '/api/assets' || path.startsWith('/api/requests/')) return json([])
      if (path === `/api/loans/${endpoint}`) return readLoans()
      throw new Error(`Unexpected API call: ${path}`)
    }))
  }

  beforeEach(() => window.history.replaceState(null, '', '/dashboard'))

  it('shows loading before displaying a successful empty list', async () => {
    const { promise, resolve } = Promise.withResolvers<Response>()
    mockDashboard(() => promise)
    render(<App />)

    const panel = within(await screen.findByRole('region', { name: heading }))
    expect(panel.getByRole('status').textContent).toBe('Loading loans…')
    expect(panel.queryByText('No loans to show yet.')).toBeNull()
    expect(panel.queryByText('0 records')).toBeNull()

    resolve(json([]))
    await panel.findByText('No loans to show yet.')
    expect(panel.getByText('0 records')).toBeTruthy()
  })

  it('shows an in-panel error and retries the loans endpoint', async () => {
    const retry = Promise.withResolvers<Response>()
    const readLoans = vi.fn<() => Promise<Response>>()
      .mockResolvedValueOnce(json({ error: { message: 'Failed read' } }, 500))
      .mockReturnValueOnce(retry.promise)
    mockDashboard(readLoans)
    render(<App />)

    const panel = within(await screen.findByRole('region', { name: heading }))
    expect((await panel.findByRole('alert')).textContent).toContain('Loans could not be loaded.')
    expect(panel.queryByText('No loans to show yet.')).toBeNull()
    expect(panel.queryByText('0 records')).toBeNull()

    await userEvent.click(panel.getByRole('button', { name: 'Retry loans' }))
    expect(panel.getByRole('status').textContent).toBe('Loading loans…')
    retry.resolve(json([loan]))
    await panel.findByText('Loan L1')
    expect(panel.getByText('1 records')).toBeTruthy()
    expect(panel.queryByRole('alert')).toBeNull()
    expect(readLoans).toHaveBeenCalledTimes(2)
  })
})
