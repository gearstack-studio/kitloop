import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Requests, { BorrowRequestForm, type BorrowRequest } from '../src/components/Requests'
import type { Asset } from '../src/components/Catalog'

const assets: Asset[] = [
  { assetId: 'A', name: 'Camera', category: 'Camera', description: 'Demo', available: true },
  { assetId: 'B', name: 'Laptop', category: 'Computer', description: 'Demo', available: false },
  { assetId: 'C', name: 'Microphone', category: 'Audio', description: 'Demo', available: true },
]
const pending: BorrowRequest = { id: 'R1', assetId: 'C', status: 'PENDING', submittedAt: '2026-11-03T00:00:00Z' }

describe('Borrow Request UI', () => {
  it('offers only available equipment without an existing pending request', async () => {
    const onSelect = vi.fn()
    const onSubmit = vi.fn(event => event.preventDefault())
    render(<BorrowRequestForm assets={assets} requests={[pending]} selected="A" onSelect={onSelect} onSubmit={onSubmit} busy={false} ready />)
    expect(screen.queryByRole('option', { name: /Laptop/ })).toBeNull()
    expect(screen.queryByRole('option', { name: /Microphone/ })).toBeNull()
    await userEvent.selectOptions(screen.getByLabelText('Available equipment'), 'A')
    expect(onSelect).toHaveBeenCalledWith('A')
    await userEvent.click(screen.getByRole('button', { name: 'Submit request' }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })
  it('disables submission while loading, busy, or selection becomes unavailable', () => {
    const props = { assets, requests: [], selected: 'A', onSelect: vi.fn(), onSubmit: vi.fn(), busy: false, ready: false }
    const view = render(<BorrowRequestForm {...props} />)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
    view.rerender(<BorrowRequestForm {...props} ready busy />)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
    view.rerender(<BorrowRequestForm {...props} ready selected="B" />)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
  })
  it('renders history with equipment name and status without checkout controls', () => {
    render(<Requests requests={[{ ...pending, asset: { assetId: 'C', name: 'Microphone', category: 'Audio' } },
      { ...pending, id: 'R2', assetId: 'A', status: 'CHECKED_OUT' }]} status="ready" onRetry={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'My requests' })).toBeTruthy()
    expect(screen.getByText('Microphone')).toBeTruthy()
    expect(screen.getByText(/C · PENDING/)).toBeTruthy()
    expect(screen.getByText(/A · CHECKED_OUT/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Check out/ })).toBeNull()
  })
  it('distinguishes loading, error/retry and empty history', async () => {
    const retry = vi.fn()
    const view = render(<Requests requests={[]} status="loading" onRetry={retry} />)
    expect(screen.getByRole('status').textContent).toContain('Loading requests')
    expect(screen.queryByText('No requests to show yet.')).toBeNull()
    view.rerender(<Requests requests={[]} status="error" onRetry={retry} />)
    await userEvent.click(screen.getByRole('button', { name: 'Retry requests' }))
    expect(retry).toHaveBeenCalledOnce()
    view.rerender(<Requests requests={[]} status="ready" onRetry={retry} />)
    expect(screen.getByText('No requests to show yet.')).toBeTruthy()
  })
})
