import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { ConfigurationError, databaseUrl } from "./config.js";
import { RollbackCheckRefusal, lifecycleRollbackReport, verifiedRollbackCheck } from "./lifecycle-rollout.js";
import { ReconcileRefusal, reconcileCompetingRequests } from "./reconcile-competing-requests.js";

// Operator commands for the request lifecycle rollout (PR #72 review P1/P2). Output is JSON with no connection details.
//   node dist/lifecycle-cli.js rollback-check
//       Read-only. Reports request counts per status and whether pre-lifecycle revisions (8b6e5a9 and earlier) are still
//       safe traffic rollback targets (only while no DECLINED/CANCELLED/EXPIRED row exists).
//   node dist/lifecycle-cli.js rollback-check --require-zero --expect-database=NAME
//       The gate release.sh runs before any pre-lifecycle rollback. READ ONLY transaction; refuses unless connected to
//       NAME. Exit 0 ONLY when lifecycleOnlyRows is 0; exit 4 when lifecycle rows exist; 2 refused/invalid; 1 error.
//   node dist/lifecycle-cli.js reconcile [--asset=ID ...]
//       Dry run (default). Read-only transaction; lists stale competing PENDING requests and Before counts.
//   node dist/lifecycle-cli.js reconcile --apply --confirm-database=NAME [--asset=ID ...]
//       Closes the stale requests. Requires REQUEST_LIFECYCLE_WRITES=enabled. Idempotent; safe to rerun.
const usage = "Usage: lifecycle-cli.js rollback-check [--require-zero --expect-database=NAME] | " +
  "reconcile [--apply --confirm-database=NAME] [--asset=ID ...]";
export const EXIT_LIFECYCLE_ROWS_PRESENT = 4;

function parse(argv: string[]) {
  const [command, ...rest] = argv;
  const flags = { apply: false, requireZero: false, confirmDatabase: undefined as string | undefined,
    expectDatabase: undefined as string | undefined, assetIds: [] as string[] };
  for (const value of rest) {
    if (value === "--apply") flags.apply = true;
    else if (value === "--dry-run") flags.apply = false;
    else if (value === "--require-zero") flags.requireZero = true;
    else if (value.startsWith("--confirm-database=")) flags.confirmDatabase = value.slice("--confirm-database=".length);
    else if (value.startsWith("--expect-database=") && value.length > "--expect-database=".length) flags.expectDatabase = value.slice("--expect-database=".length);
    else if (value.startsWith("--asset=") && value.length > "--asset=".length) flags.assetIds.push(value.slice("--asset=".length));
    else throw new ConfigurationError(`Unknown argument ${JSON.stringify(value)}. ${usage}`);
  }
  if (command !== "rollback-check" && command !== "reconcile") throw new ConfigurationError(usage);
  if (command === "rollback-check" && (flags.apply || flags.confirmDatabase)) throw new ConfigurationError("rollback-check is read-only");
  if (command === "reconcile" && (flags.requireZero || flags.expectDatabase)) throw new ConfigurationError(usage);
  if (flags.requireZero && !flags.expectDatabase) throw new ConfigurationError("--require-zero needs --expect-database=NAME");
  return { command, ...flags };
}

async function main() {
  const args = parse(process.argv.slice(2));
  databaseUrl(process.env);
  const prisma = new PrismaClient();
  try {
    const assetIds = args.assetIds.length ? args.assetIds : undefined;
    if (args.command === "rollback-check" && args.requireZero) {
      const report = await verifiedRollbackCheck(prisma, { expectDatabase: args.expectDatabase!, assetIds });
      console.log(JSON.stringify({ command: "rollback-check", requireZero: true, ...report, scope: assetIds ?? "all" }, null, 2));
      if (report.lifecycleOnlyRows !== 0) {
        console.error(`UNSAFE: ${report.lifecycleOnlyRows} request row(s) have lifecycle-only statuses; ` +
          "pre-lifecycle revisions cannot read them. Do not route traffic to a pre-lifecycle revision.");
        process.exitCode = EXIT_LIFECYCLE_ROWS_PRESENT;
      } else {
        console.log("SAFE: no lifecycle-only request rows; pre-lifecycle revisions can read every request row.");
      }
      return;
    }
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
  if (error instanceof ConfigurationError || error instanceof ReconcileRefusal || error instanceof RollbackCheckRefusal) {
    console.error(error.message);
    process.exitCode = 2;
  } else {
    console.error("Lifecycle command failed; no partial change was committed for the failing asset");
    process.exitCode = 1;
  }
});
