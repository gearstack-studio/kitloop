import type { Asset } from './components/Catalog'
import type { BorrowRequest } from './components/Requests'

export function borrowEligibility(asset: Asset, ownRequests: BorrowRequest[]) {
  if (!asset.available) return 'unavailable'
  if (ownRequests.some(request => request.assetId === asset.assetId && request.status === 'PENDING')) return 'pending'
  return 'eligible'
}
