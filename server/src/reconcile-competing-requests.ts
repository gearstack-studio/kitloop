import { Prisma, type PrismaClient } from "@prisma/client";
import { isCheckoutConflict } from "./checkout.js";
import { requestLifecycleWrites } from "./config.js";

// PR #72 review P2. The lifecycle checkout closes competing requests only for checkouts made after lifecycle writes are
// enabled. Requests that competed with an earlier checkout are still PENDING. This module finds and, only when explicitly
// applied, closes them. It is run as a separately reviewed operator step (npm run lifecycle -- reconcile), never by a
// migration.
//
// Business rule (documented in artifacts/sprint-1/uat/uat-e01-lab6-report.md):
//   A PENDING request is STALE when its asset has an ACTIVE loan (Loan.returnedAt IS NULL). While that loan is active the
//   request cannot be checked out (checkout answers 409 ASSET_UNAVAILABLE), which is exactly the state in which the
//   lifecycle checkout transaction would have declined it. A stale request becomes DECLINED with closeReason
//   ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER, closedAt = the reconciliation transaction time, and closedById = NULL
//   (system action; checkout-time declines record the custodian instead).
//   A PENDING request whose asset had a competing loan that has since been RETURNED (and no active loan) is fulfillable
//   again and is KEPT PENDING. Requests already in a terminal status are never touched.
export const RECONCILE_RULE =
  "PENDING request whose asset has an ACTIVE loan (returnedAt IS NULL) -> DECLINED / ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER";

export class ReconcileRefusal extends Error {}

export type StaleRequest = {
  requestId: string; assetId: string; borrowerId: string; submittedAt: Date;
  activeLoanId: string; activeLoanRequestId: string; activeLoanCheckedOutAt: Date;
};
export type KeptRequest = {
  requestId: string; assetId: string; borrowerId: string; submittedAt: Date;
  reason: "COMPETING_LOAN_RETURNED"; lastReturnedAt: Date;
};
export type Counts = { pending: number; staleOnActiveLoan: number; keptLoanReturned: number };
export type ReconcileReport = {
  mode: "dry-run" | "apply"; database: string; rule: string; startedAt: Date; finishedAt: Date;
  before: Counts; stale: StaleRequest[]; kept: KeptRequest[]; closed: string[]; conflicts: string[]; after: Counts;
};
export type ReconcileOptions = {
  mode: "dry-run" | "apply";
  /** Required for apply: must equal current_database() of the connection, so a wrong DATABASE_URL cannot be applied. */
  confirmDatabase?: string;
  /** Optional scope, e.g. to retest one UAT example. Omit for the whole database. */
  assetIds?: string[];
  env?: NodeJS.ProcessEnv;
  maxAttempts?: number;
};

type Db = PrismaClient | Prisma.TransactionClient;
const inScope = (assetIds?: string[]) =>
  assetIds ? Prisma.sql`AND r."assetId" IN (${Prisma.join(assetIds.length ? assetIds : [""])})` : Prisma.empty;

async function classify(db: Db, assetIds?: string[]) {
  const stale = await db.$queryRaw<StaleRequest[]>`
    SELECT r."id" AS "requestId", r."assetId", r."borrowerId", r."submittedAt",
           l."id" AS "activeLoanId", l."requestId" AS "activeLoanRequestId", l."checkedOutAt" AS "activeLoanCheckedOutAt"
    FROM "BorrowRequest" r
    JOIN "Loan" l ON l."assetId" = r."assetId" AND l."returnedAt" IS NULL
    WHERE r."status" = 'PENDING' ${inScope(assetIds)}
    ORDER BY r."assetId", r."submittedAt", r."id"`;
  const kept = await db.$queryRaw<KeptRequest[]>`
    SELECT r."id" AS "requestId", r."assetId", r."borrowerId", r."submittedAt",
           'COMPETING_LOAN_RETURNED' AS "reason", max(l."returnedAt") AS "lastReturnedAt"
    FROM "BorrowRequest" r
    JOIN "Loan" l ON l."assetId" = r."assetId" AND l."returnedAt" IS NOT NULL
    WHERE r."status" = 'PENDING' ${inScope(assetIds)}
      AND NOT EXISTS (SELECT 1 FROM "Loan" a WHERE a."assetId" = r."assetId" AND a."returnedAt" IS NULL)
    GROUP BY r."id", r."assetId", r."borrowerId", r."submittedAt"
    ORDER BY r."assetId", r."submittedAt", r."id"`;
  const [{ pending }] = await db.$queryRaw<Array<{ pending: number }>>`
    SELECT count(*)::int AS pending FROM "BorrowRequest" r WHERE r."status" = 'PENDING' ${inScope(assetIds)}`;
  return { stale, kept, counts: { pending, staleOnActiveLoan: stale.length, keptLoanReturned: kept.length } };
}

/** Dry run: one consistent snapshot inside a READ ONLY transaction, so it cannot modify anything. */
function readOnlySnapshot(db: PrismaClient, assetIds?: string[]) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    return classify(tx, assetIds);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

/** Closes the stale requests of one asset under the same lock order as checkout (Asset row first). */
async function closeStaleForAsset(db: PrismaClient, assetId: string): Promise<string[]> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "assetId" FROM "Asset" WHERE "assetId" = ${assetId} FOR UPDATE`;
    // Re-check the rule under the lock: a loan returned or a request closed since the snapshot is not touched.
    const closed = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE "BorrowRequest" r
      SET "status" = 'DECLINED'::"RequestStatus",
          "closeReason" = 'ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER'::"RequestCloseReason",
          "closedAt" = now(), "closedById" = NULL
      WHERE r."assetId" = ${assetId} AND r."status" = 'PENDING'
        AND EXISTS (SELECT 1 FROM "Loan" l WHERE l."assetId" = r."assetId" AND l."returnedAt" IS NULL)
      RETURNING r."id"`;
    return closed.map((row) => row.id);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function reconcileCompetingRequests(db: PrismaClient, options: ReconcileOptions): Promise<ReconcileReport> {
  const startedAt = new Date();
  const [{ database }] = await db.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  if (options.mode === "apply") {
    if (!options.confirmDatabase || options.confirmDatabase !== database) {
      throw new ReconcileRefusal(`Refusing to apply: pass --confirm-database=${database} to confirm the target database`);
    }
    if (!requestLifecycleWrites(options.env ?? process.env)) {
      throw new ReconcileRefusal("Refusing to apply: REQUEST_LIFECYCLE_WRITES=enabled is required. Reconciliation writes " +
        "DECLINED, which pre-lifecycle revisions cannot read; run it only after lifecycle writes are enabled (phase 2).");
    }
  } else if (options.mode !== "dry-run") {
    throw new ReconcileRefusal("mode must be 'dry-run' or 'apply'");
  }

  const before = await readOnlySnapshot(db, options.assetIds);
  const closed: string[] = [];
  const conflicts: string[] = [];
  if (options.mode === "apply") {
    const maxAttempts = options.maxAttempts ?? 5;
    for (const assetId of [...new Set(before.stale.map((item) => item.assetId))]) {
      for (let attempt = 1; ; attempt++) {
        try {
          closed.push(...await closeStaleForAsset(db, assetId));
          break;
        } catch (error) {
          // A concurrent checkout, cancel or decline won; the aborted transaction changed nothing. Retry on a fresh snapshot.
          if (!isCheckoutConflict(error)) throw error;
          if (attempt >= maxAttempts) { conflicts.push(assetId); break; }
        }
      }
    }
  }
  const after = options.mode === "apply" ? await readOnlySnapshot(db, options.assetIds) : before;
  return {
    mode: options.mode, database, rule: RECONCILE_RULE, startedAt, finishedAt: new Date(),
    before: before.counts, stale: before.stale, kept: before.kept, closed, conflicts, after: after.counts,
  };
}
