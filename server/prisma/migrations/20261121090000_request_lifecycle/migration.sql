-- UAT-E01 (#61) request lifecycle. Additive only: no rows are rewritten or deleted, and existing
-- PENDING and CHECKED_OUT requests keep their status with empty closure fields.
-- PostgreSQL 12+ allows ADD VALUE inside a transaction as long as the new labels are not used in the
-- same transaction, so nothing below references DECLINED, CANCELLED or EXPIRED.
ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'DECLINED';
ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

CREATE TYPE "RequestCloseReason" AS ENUM (
  'ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER',
  'CANCELLED_BY_BORROWER',
  'EQUIPMENT_UNAVAILABLE',
  'BORROWER_NOT_ELIGIBLE',
  'DUPLICATE_REQUEST',
  'OTHER'
);

ALTER TABLE "BorrowRequest"
  ADD COLUMN "closedAt" TIMESTAMPTZ(6),
  ADD COLUMN "closeReason" "RequestCloseReason",
  ADD COLUMN "closedById" UUID;

ALTER TABLE "BorrowRequest" ADD CONSTRAINT "BorrowRequest_closedById_fkey"
  FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Open (PENDING) and checked-out requests carry no closure data; every other status must record when
-- and why it closed. closedById may be null for a future system expiry or after an actor is deleted.
ALTER TABLE "BorrowRequest" ADD CONSTRAINT "BorrowRequest_closure_consistent" CHECK (
  ("status" IN ('PENDING', 'CHECKED_OUT') AND "closedAt" IS NULL AND "closeReason" IS NULL AND "closedById" IS NULL)
  OR ("status" NOT IN ('PENDING', 'CHECKED_OUT') AND "closedAt" IS NOT NULL AND "closeReason" IS NOT NULL)
);

-- The partial unique index "BorrowRequest_one_pending_per_borrower_asset" (status = 'PENDING') is unchanged.
