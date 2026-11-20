import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'

describe('Signed-out navigation', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })))
  })

  it.each(['/unknown', '/dashboard/extra', '/signup'])('renders a not-found view at %s', async path => {
    window.history.replaceState(null, '', path)
    render(<App />)

    await screen.findByRole('heading', { name: 'Page not found' })
    expect(window.location.pathname).toBe(path)
    await userEvent.click(screen.getByRole('link', { name: 'Back to home' }))
    expect(window.location.pathname).toBe('/')
  })

  it.each(['/dashboard', '/requests'])('redirects %s to sign in without offering registration', async path => {
    window.history.replaceState(null, '', path)
    render(<App />)

    await screen.findByRole('button', { name: 'Sign In' })
    expect(window.location.pathname).toBe('/login')
    expect(screen.queryByRole('link', { name: 'Sign up' })).toBeNull()
  })
})
