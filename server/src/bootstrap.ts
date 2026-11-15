import { Prisma, type PrismaClient, Role } from "@prisma/client";
import { ConfigurationError } from "./config.js";
import { hashPassword } from "./password.js";

type BootstrapUser = { username: string; password: string; role: Role };
type BootstrapAsset = { assetId: string; name: string; category: string; description: string; custodianUsername: string };
export type BootstrapInput = { users: BootstrapUser[]; assets: BootstrapAsset[] };

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConfigurationError("Bootstrap entries must be objects");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new ConfigurationError(`Bootstrap ${field} must be nonempty text of at most ${max} characters`);
  }
  return value.trim();
}

function unique(values: string[], field: string): void {
  if (new Set(values).size !== values.length) throw new ConfigurationError(`Bootstrap contains duplicate ${field}`);
}

export function parseBootstrap(value: string | undefined): BootstrapInput {
  let input: Record<string, unknown>;
  try {
    input = record(JSON.parse(value ?? ""));
  } catch {
    throw new ConfigurationError("BOOTSTRAP_INPUT must contain a JSON object with users and assets");
  }
  if (!Array.isArray(input.users) || input.users.length === 0 || !Array.isArray(input.assets)) {
    throw new ConfigurationError("Bootstrap requires a nonempty users array and an assets array");
  }
  const users = input.users.map((entry: unknown): BootstrapUser => {
    const user = record(entry);
    const username = text(user.username, "username", 200);
    if (typeof user.password !== "string" || !user.password.trim() || user.password.length < 12 || user.password.length > 1024) {
      throw new ConfigurationError("Bootstrap passwords must contain 12 to 1024 characters");
    }
    if (user.role !== Role.BORROWER && user.role !== Role.CUSTODIAN) {
      throw new ConfigurationError("Bootstrap role must be BORROWER or CUSTODIAN");
    }
    return { username, password: user.password, role: user.role };
  });
  unique(users.map(user => user.username), "usernames");
  const assets = input.assets.map((entry: unknown): BootstrapAsset => {
    const asset = record(entry);
    const custodianUsername = text(asset.custodianUsername, "custodianUsername", 200);
    if (!users.some(user => user.username === custodianUsername && user.role === Role.CUSTODIAN)) {
      throw new ConfigurationError("Every asset must reference a CUSTODIAN in the users array");
    }
    return {
      assetId: text(asset.assetId, "assetId", 80),
      name: text(asset.name, "name", 200),
      category: text(asset.category, "category", 100),
      description: text(asset.description, "description", 1000),
      custodianUsername,
    };
  });
  unique(assets.map(asset => asset.assetId), "asset IDs");
  return { users, assets };
}

export async function bootstrap(prisma: PrismaClient, input: BootstrapInput): Promise<void> {
  const users = await Promise.all(input.users.map(async user => ({
    ...user, passwordHash: await hashPassword(user.password),
  })));
  await prisma.$transaction(async transaction => {
    // Serialize bootstrap jobs so retries/concurrent invocations cannot change passwords or scope mid-run.
    await transaction.$queryRaw`SELECT pg_advisory_xact_lock(15453, 5)::text`;
    const ids = new Map<string, string>();
    for (const user of users) {
      const existing = await transaction.user.findUnique({ where: { username: user.username } });
      if (existing && existing.role !== user.role) {
        throw new ConfigurationError("An existing account has a conflicting role; no changes applied");
      }
      const saved = await transaction.user.upsert({
        where: { username: user.username }, update: {},
        create: { username: user.username, role: user.role, passwordHash: user.passwordHash },
      });
      ids.set(user.username, saved.id);
    }
    for (const { custodianUsername, ...asset } of input.assets) {
      const existing = await transaction.asset.findUnique({ where: { assetId: asset.assetId } });
      if (existing && (existing.retiredAt !== null || existing.name !== asset.name ||
          existing.category !== asset.category || existing.description !== asset.description)) {
        throw new ConfigurationError("An existing asset conflicts with the manifest; no changes applied");
      }
      await transaction.asset.upsert({ where: { assetId: asset.assetId }, update: {}, create: asset });
      const custodianId = ids.get(custodianUsername)!;
      await transaction.custodianAsset.upsert({
        where: { custodianId_assetId: { custodianId, assetId: asset.assetId } }, update: {},
        create: { custodianId, assetId: asset.assetId },
      });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30000 });
}
