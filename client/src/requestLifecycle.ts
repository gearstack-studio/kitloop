// UAT-E01 (#61): request lifecycle labels shared by borrower history and the custodian queue.
export type RequestLifecycleStatus = 'PENDING' | 'CHECKED_OUT' | 'DECLINED' | 'CANCELLED' | 'EXPIRED'
export type RequestCloseReason = 'ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER' | 'CANCELLED_BY_BORROWER'
  | 'EQUIPMENT_UNAVAILABLE' | 'BORROWER_NOT_ELIGIBLE' | 'DUPLICATE_REQUEST' | 'OTHER'

export const closeReasonLabels: Record<RequestCloseReason, string> = {
  ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER: 'Equipment was checked out to another borrower',
  CANCELLED_BY_BORROWER: 'Cancelled by the borrower',
  EQUIPMENT_UNAVAILABLE: 'Equipment unavailable',
  BORROWER_NOT_ELIGIBLE: 'Borrower not eligible',
  DUPLICATE_REQUEST: 'Duplicate request',
  OTHER: 'Other reason',
}

// The only reasons a custodian may choose; the server rejects any other value.
export const declineReasons = ['EQUIPMENT_UNAVAILABLE', 'BORROWER_NOT_ELIGIBLE', 'DUPLICATE_REQUEST', 'OTHER'] as const
export type DeclineReason = typeof declineReasons[number]
