/** CR-01 r4 (BR-14): the borrower's own pending-request quota, as reported by GET /api/borrowing-quota. */
export type BorrowingQuota = {
  pendingRequests: number
  maxPendingRequests: number
  remainingRequestCapacity: number
  canSubmitRequest: boolean
}
export type QuotaStatus = 'loading' | 'ready' | 'error'

/** Accepts only the agreed four-field shape, so a malformed body is treated as a failed read rather than trusted. */
export function isBorrowingQuota(value: unknown): value is BorrowingQuota {
  if (!value || typeof value !== 'object') return false
  const quota = value as Record<string, unknown>
  return [quota.pendingRequests, quota.maxPendingRequests, quota.remainingRequestCapacity]
    .every(field => Number.isInteger(field) && (field as number) >= 0) && typeof quota.canSubmitRequest === 'boolean'
}
