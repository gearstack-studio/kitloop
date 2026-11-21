import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { ConfigurationError, databaseUrl } from "./config.js";
import { lifecycleRollbackReport } from "./lifecycle-rollout.js";
import { ReconcileRefusal, reconcileCompetingRequests } from "./reconcile-competing-requests.js";

// Operator commands for the request lifecycle rollout (PR #72 review P1/P2). Output is JSON with no connection details.
//   node dist/lifecycle-cli.js rollback-check
//       Read-only. Reports request counts per status and whether pre-lifecycle revisions (8b6e5a9 and earlier) are still
//       safe traffic rollback targets (only while no DECLINED/CANCELLED/EXPIRED row exists).
//   node dist/lifecycle-cli.js reconcile [--asset=ID ...]
//       Dry run (default). Read-only transaction; lists stale competing PENDING requests and Before counts.
//   node dist/lifecycle-cli.js reconcile --apply --confirm-database=NAME [--asset=ID ...]
//       Closes the stale requests. Requires REQUEST_LIFECYCLE_WRITES=enabled. Idempotent; safe to rerun.
const usage = "Usage: lifecycle-cli.js rollback-check | reconcile [--apply --confirm-database=NAME] [--asset=ID ...]";

function parse(argv: string[]) {
  const [command, ...rest] = argv;
  const flags = { apply: false, confirmDatabase: undefined as string | undefined, assetIds: [] as string[] };
  for (const value of rest) {
    if (value === "--apply") flags.apply = true;
    else if (value === "--dry-run") flags.apply = false;
    else if (value.startsWith("--confirm-database=")) flags.confirmDatabase = value.slice("--confirm-database=".length);
    else if (value.startsWith("--asset=") && value.length > "--asset=".length) flags.assetIds.push(value.slice("--asset=".length));
    else throw new ConfigurationError(`Unknown argument ${JSON.stringify(value)}. ${usage}`);
  }
  if (command !== "rollback-check" && command !== "reconcile") throw new ConfigurationError(usage);
  if (command === "rollback-check" && (flags.apply || flags.confirmDatabase)) throw new ConfigurationError("rollback-check is read-only");
  return { command, ...flags };
}

async function main() {
  const args = parse(process.argv.slice(2));
  databaseUrl(process.env);
  const prisma = new PrismaClient();
  try {
    const assetIds = args.assetIds.length ? args.assetIds : undefined;
    if (args.command === "rollback-check") {
      const report = await lifecycleRollbackReport(prisma, { assetIds });
      console.log(JSON.stringify({ command: "rollback-check", ...report, scope: assetIds ?? "all" }, null, 2));
      return;
    }
    const report = await reconcileCompetingRequests(prisma, {
      mode: args.apply ? "apply" : "dry-run", confirmDatabase: args.confirmDatabase, assetIds,
    });
    console.log(JSON.stringify({ command: "reconcile", scope: assetIds ?? "all", ...report }, null, 2));
    if (report.conflicts.length) process.exitCode = 3;
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  if (error instanceof ConfigurationError || error instanceof ReconcileRefusal) {
    console.error(error.message);
    process.exitCode = 2;
  } else {
    console.error("Lifecycle command failed; no partial change was committed for the failing asset");
    process.exitCode = 1;
  }
});
