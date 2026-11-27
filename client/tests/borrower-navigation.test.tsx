import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'

// UAT-E04 (#64): borrowers get two persistent navigation links (not one toggle whose label flips to the other page).
// The current page is marked with aria-current="page" so it is identified visually and programmatically.
const borrower = { id: 'a11ce000-0000-4000-8000-000000000001', role: 'BORROWER', username: 'alice.borrower' }
const custodian = { id: 'ca401000-0000-4000-8000-000000000003', role: 'CUSTODIAN', username: 'carol.custodian' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-csrf' } })

function signedInAs(who: typeof borrower | typeof custodian) {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const path = new URL(input).pathname
    if (path === '/api/auth/me') return json(who)
    if (path === '/api/assets' || path.startsWith('/api/requests/') || path.startsWith('/api/loans/')) return json([])
    throw new Error(`Unexpected API call: ${path}`)
  }))
}
const nav = () => screen.findByRole('navigation', { name: 'Borrower pages' })
const link = (name: string) => within(screen.getByRole('navigation', { name: 'Borrower pages' })).getByRole('link', { name })
const dashboardLink = () => link('Equipment dashboard')
const requestsLink = () => link('My requests')

/** Both links present with real hrefs; exactly the expected one is the current page. */
function expectCurrent(current: 'dashboard' | 'requests') {
  const links = within(screen.getByRole('navigation', { name: 'Borrower pages' })).getAllByRole('link')
  expect(links.map(item => item.textContent)).toEqual(['Equipment dashboard', 'My requests'])
  expect(dashboardLink().getAttribute('href')).toBe('/dashboard')
  expect(requestsLink().getAttribute('href')).toBe('/requests')
  expect(dashboardLink().getAttribute('aria-current')).toBe(current === 'dashboard' ? 'page' : null)
  expect(requestsLink().getAttribute('aria-current')).toBe(current === 'requests' ? 'page' : null)
  expect(links.filter(item => item.getAttribute('aria-current') === 'page')).toHaveLength(1)
}

describe('UAT-E04 persistent borrower navigation', () => {
  beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) })

  it.each([
    ['/dashboard', 'dashboard'],
    ['/requests', 'requests'],
  ] as const)('%s shows both links and marks only its own page as current', async (path, current) => {
    window.history.replaceState(null, '', path)
    signedInAs(borrower)
    render(<App />)
    await nav()
    expectCurrent(current)
    expect(screen.queryByRole('link', { name: 'My Requests page' })).toBeNull()   // the old flipping toggle label
  })

  it('treats a trailing slash as the same page', async () => {
    window.history.replaceState(null, '', '/requests/')
    signedInAs(borrower)
    render(<App />)
    await nav()
    expectCurrent('requests')
  })

  it('clicking each link navigates to its route and moves the current marker; both stay visible', async () => {
    window.history.replaceState(null, '', '/dashboard')
    signedInAs(borrower)
    render(<App />)
    await nav()
    await userEvent.click(requestsLink())
    expect(window.location.pathname).toBe('/requests')
    expect(await screen.findByRole('heading', { name: 'Request equipment' })).toBeTruthy()
    expectCurrent('requests')
    await userEvent.click(dashboardLink())
    expect(window.location.pathname).toBe('/dashboard')
    expect(await screen.findByRole('heading', { name: 'Equipment catalog' })).toBeTruthy()
    expectCurrent('dashboard')
  })

  it('clicking the current page link does not add a history entry', async () => {
    window.history.replaceState(null, '', '/dashboard')
    signedInAs(borrower)
    render(<App />)
    await nav()
    const before = window.history.length
    await userEvent.click(dashboardLink())
    expect(window.location.pathname).toBe('/dashboard')
    expect(window.history.length).toBe(before)
    expectCurrent('dashboard')
  })

  it('is keyboard operable: both links are in the tab order in reading order and Enter navigates', async () => {
    window.history.replaceState(null, '', '/dashboard')
    signedInAs(borrower)
    render(<App />)
    await nav()
    screen.getByRole('button', { name: 'Sign out' }).focus()
    await userEvent.tab()
    expect(document.activeElement).toBe(dashboardLink())   // the current page link stays focusable
    await userEvent.tab()
    expect(document.activeElement).toBe(requestsLink())
    await userEvent.keyboard('{Enter}')
    expect(window.location.pathname).toBe('/requests')
    expectCurrent('requests')
  })

  it('browser Back and Forward restore the route and its current marker', async () => {
    window.history.replaceState(null, '', '/dashboard')
    signedInAs(borrower)
    render(<App />)
    await nav()
    await userEvent.click(requestsLink())
    expectCurrent('requests')
    window.history.back()
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'))
    await waitFor(() => expectCurrent('dashboard'))
    window.history.forward()
    await waitFor(() => expect(window.location.pathname).toBe('/requests'))
    await waitFor(() => expectCurrent('requests'))
  })

  it('is not shown to custodians, who keep their single dashboard', async () => {
    window.history.replaceState(null, '', '/dashboard')
    signedInAs(custodian)
    render(<App />)
    await screen.findByText('CUSTODIAN WORKSPACE')
    expect(screen.queryByRole('navigation', { name: 'Borrower pages' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Equipment dashboard' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'My requests' })).toBeNull()
  })

  it.each(['/dashboard', '/requests'])('signed out at %s: redirected to sign in with no borrower navigation', async path => {
    window.history.replaceState(null, '', path)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })))
    render(<App />)
    await screen.findByRole('button', { name: 'Sign In' })
    await waitFor(() => expect(window.location.pathname).toBe('/login'))
    expect(screen.queryByRole('navigation', { name: 'Borrower pages' })).toBeNull()
  })
})
