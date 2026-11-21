import { Prisma, type PrismaClient } from "@prisma/client";

// PR #72 review P1. Revisions before the request lifecycle (8b6e5a9 and earlier) run a Prisma client whose
// RequestStatus enum has only PENDING and CHECKED_OUT. Reading any other status there throws, so GET /api/requests/mine
// returns 500 for the affected borrowers. Those revisions are therefore safe traffic rollback targets only while no
// request row carries a lifecycle-only status. This read-only report is the check to run before such a rollback.
export const PRE_LIFECYCLE_STATUSES = ["PENDING", "CHECKED_OUT"] as const;

export type LifecycleRollbackReport = {
  byStatus: Record<string, number>;
  lifecycleOnlyRows: number;
  preLifecycleRevisionsSafe: boolean;
};

export class RollbackCheckRefusal extends Error {}

/**
 * The authoritative pre-lifecycle rollback check (PR #72 re-review P1). Runs in a READ ONLY transaction, so PostgreSQL
 * itself rejects any write, and first establishes which database it is reading: it refuses (throws) unless
 * current_database() equals expectDatabase. release.sh runs this as a Cloud Run job and treats only a successful
 * execution (exit 0, lifecycleOnlyRows === 0) as permission to route traffic to a pre-lifecycle revision.
 */
export async function verifiedRollbackCheck(
  db: PrismaClient, options: { expectDatabase: string; assetIds?: string[] },
): Promise<LifecycleRollbackReport & { database: string }> {
  if (!options.expectDatabase) throw new RollbackCheckRefusal("--expect-database=NAME is required");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const [{ database }] = await tx.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
    if (database !== options.expectDatabase) {
      throw new RollbackCheckRefusal(`Connected to database "${database}", expected "${options.expectDatabase}"; nothing was checked`);
    }
    return { database, ...await lifecycleRollbackReport(tx as unknown as PrismaClient, { assetIds: options.assetIds }) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function lifecycleRollbackReport(
  db: PrismaClient, options: { assetIds?: string[] } = {},
): Promise<LifecycleRollbackReport> {
  // status::text so the report works whatever enum values exist; read-only, no locks beyond a plain snapshot read.
  const scope = options.assetIds ? Prisma.sql`WHERE "assetId" IN (${Prisma.join(options.assetIds)})` : Prisma.empty;
  const rows = await db.$queryRaw<Array<{ status: string; n: number }>>`
    SELECT "status"::text AS status, count(*)::int AS n FROM "BorrowRequest" ${scope} GROUP BY 1 ORDER BY 1`;
  const byStatus = Object.fromEntries(rows.map((row) => [row.status, row.n]));
  const lifecycleOnlyRows = rows
    .filter((row) => !(PRE_LIFECYCLE_STATUSES as readonly string[]).includes(row.status))
    .reduce((sum, row) => sum + row.n, 0);
  return { byStatus, lifecycleOnlyRows, preLifecycleRevisionsSafe: lifecycleOnlyRows === 0 };
}
