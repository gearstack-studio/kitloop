-- A pending request does not reserve an asset: uniqueness is per borrower,
-- not per asset. Existing duplicates must be reviewed before deployment;
-- this migration deliberately does not delete or rewrite request history.
CREATE UNIQUE INDEX "BorrowRequest_one_pending_per_borrower_asset"
ON "BorrowRequest" ("borrowerId", "assetId") WHERE "status" = 'PENDING';
