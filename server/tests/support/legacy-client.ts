import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// PR #72 review P1: the Prisma client of the last pre-lifecycle revision (8b6e5a9), generated from a verbatim copy of
// its schema. This is the client a traffic-only rollback would run, so tests can check what it can and cannot read.
// It is generated under node_modules/.cache (so it resolves the installed @prisma/client runtime) and reused while the
// fixture is unchanged.
const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixture = path.join(serverDir, "tests", "fixtures", "schema-8b6e5a9.prisma");
const cacheDir = path.join(serverDir, "node_modules", ".cache", "kitloop-legacy-prisma-8b6e5a9");
const outputDir = path.join(cacheDir, "client");

type LegacyClient = {
  borrowRequest: { findMany(args: object): Promise<Array<{ id: string; status: string }>>; findUnique(args: object): Promise<unknown> };
  $disconnect(): Promise<void>;
};

export function legacyPrismaClient(datasourceUrl: string): LegacyClient {
  const source = readFileSync(fixture, "utf8");
  const hash = createHash("sha256").update(source).digest("hex");
  const marker = path.join(cacheDir, "fixture.sha256");
  if (!existsSync(path.join(outputDir, "index.js")) || !existsSync(marker) || readFileSync(marker, "utf8") !== hash) {
    mkdirSync(cacheDir, { recursive: true });
    const schemaPath = path.join(cacheDir, "schema.prisma");
    const generator = `generator client {\n  provider = "prisma-client-js"\n  output   = "${outputDir.replaceAll("\\", "/")}"\n}`;
    const schema = source.replace(/generator client \{[^}]*\}/, generator);
    if (schema === source) throw new Error("Legacy schema fixture has no generator block");
    writeFileSync(schemaPath, schema);
    const result = spawnSync(process.execPath, [path.join(serverDir, "node_modules", "prisma", "build", "index.js"), "generate",
      `--schema=${schemaPath}`], { cwd: serverDir, encoding: "utf8", env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: "1" } });
    if (result.status !== 0) throw new Error(`Generating the 8b6e5a9 Prisma client failed:\n${result.stdout}\n${result.stderr}`);
    writeFileSync(marker, hash);
  }
  const { PrismaClient } = createRequire(import.meta.url)(outputDir) as { PrismaClient: new (options: object) => LegacyClient };
  return new PrismaClient({ datasourceUrl });
}
