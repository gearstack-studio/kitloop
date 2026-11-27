import type { Asset } from './components/Catalog'
import type { BorrowRequest } from './components/Requests'

/**
 * CR-01 (BR-14 r4): the borrower's pending-request quota as the client knows it.
 * 'off' = quota not active (feature flag false or absent): pre-CR-01 behaviour.
 * 'unknown' = quota active and loading. 'error' = quota read failed.
 */
export type QuotaState = 'off' | 'available' | 'reached' | 'unknown' | 'error'
export type Eligibility = 'unavailable' | 'pending' | 'quota' | 'eligible'

/** Precedence: unavailable equipment → already pending → quota reached or unknown → eligible. */
export function borrowEligibility(asset: Asset, ownRequests: BorrowRequest[], quota: QuotaState = 'off'): Eligibility {
  if (!asset.available) return 'unavailable'
  if (ownRequests.some(request => request.assetId === asset.assetId && request.status === 'PENDING')) return 'pending'
  if (quota === 'reached' || quota === 'unknown' || quota === 'error') return 'quota'
  return 'eligible'
}
