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
