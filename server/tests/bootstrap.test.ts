import { Role } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { bootstrap, parseBootstrap, type BootstrapInput } from "../src/bootstrap.js";
import { prisma } from "../src/db.js";
import { verifyPassword } from "../src/password.js";

const suffix = randomUUID();
const password = "synthetic-bootstrap-password";
const input: BootstrapInput = {
  users: [
    { username: `bootstrap-b-${suffix}`, role: Role.BORROWER, password },
    { username: `bootstrap-c-${suffix}`, role: Role.CUSTODIAN, password },
  ],
  assets: [{ assetId: `BOOT-${suffix}`, name: "Test camera", category: "Camera", description: "Bootstrap fixture", custodianUsername: `bootstrap-c-${suffix}` }],
};
const rollbackUsername = `bootstrap-rollback-${suffix}`;
afterAll(async () => {
  await prisma.custodianAsset.deleteMany({ where: { assetId: input.assets[0].assetId } });
  await prisma.asset.deleteMany({ where: { assetId: input.assets[0].assetId } });
  await prisma.user.deleteMany({ where: { username: { in: [...input.users.map(user => user.username), rollbackUsername] } } });
  await prisma.$disconnect();
});

describe("Explicit production bootstrap", () => {
  it("rejects missing/invalid credentials without including raw input", () => {
    for (const value of [undefined, "not-json", JSON.stringify({ users: [], assets: [] }),
      JSON.stringify({ ...input, users: [{ ...input.users[0], password: "LEAK!" }] }),
      JSON.stringify({ ...input, users: [{ ...input.users[0], role: "OWNER" }] })]) {
      expect(() => parseBootstrap(value)).toThrow();
      try { parseBootstrap(value); } catch (error) {
        expect(String(error)).not.toContain("LEAK!");
        expect(String(error)).not.toContain(password);
      }
    }
  });
  it("validates duplicate identifiers and custodian references before writes", () => {
    expect(() => parseBootstrap(JSON.stringify({ ...input, users: [...input.users, input.users[0]] }))).toThrow("duplicate");
    expect(() => parseBootstrap(JSON.stringify({ ...input, assets: [...input.assets, input.assets[0]] }))).toThrow("duplicate");
    expect(() => parseBootstrap(JSON.stringify({ ...input, assets: [{ ...input.assets[0], custodianUsername: input.users[0].username }] }))).toThrow("CUSTODIAN");
  });
  it("provisions hashed accounts, asset and scope, and preserves passwords and IDs on reruns", async () => {
    await bootstrap(prisma, parseBootstrap(JSON.stringify(input)));
    const original = await prisma.user.findUniqueOrThrow({ where: { username: input.users[0].username } });
    expect(original.passwordHash).not.toBe(password);
    expect(await verifyPassword(password, original.passwordHash)).toBe(true);
    const changed = { ...input, users: input.users.map(user => ({ ...user, password: "different-synthetic-password" })) };
    await bootstrap(prisma, parseBootstrap(JSON.stringify(changed)));
    expect(await prisma.user.findUniqueOrThrow({ where: { username: original.username } })).toEqual(original);
    expect(await prisma.asset.count({ where: { assetId: input.assets[0].assetId } })).toBe(1);
    expect(await prisma.custodianAsset.count({ where: { assetId: input.assets[0].assetId } })).toBe(1);
  });
  it("serializes concurrent reruns without duplicates or password changes", async () => {
    await bootstrap(prisma, input);
    const before = await prisma.user.findUniqueOrThrow({ where: { username: input.users[0].username } });
    await Promise.all([bootstrap(prisma, input), bootstrap(prisma, input)]);
    expect(await prisma.user.findUniqueOrThrow({ where: { username: before.username } })).toEqual(before);
    expect(await prisma.asset.count({ where: { assetId: input.assets[0].assetId } })).toBe(1);
  });
  it("rolls back earlier inserts if a later account has a conflicting role", async () => {
    await bootstrap(prisma, input);
    await expect(bootstrap(prisma, {
      users: [{ username: rollbackUsername, role: Role.BORROWER, password }, { ...input.users[1], role: Role.BORROWER }], assets: [],
    })).rejects.toThrow("conflicting role");
    expect(await prisma.user.findUnique({ where: { username: rollbackUsername } })).toBeNull();
  });
  it("preserves existing assets and rolls back on metadata conflicts", async () => {
    await bootstrap(prisma, input);
    const asset = await prisma.asset.findUniqueOrThrow({ where: { assetId: input.assets[0].assetId } });
    await expect(bootstrap(prisma, { ...input, assets: [{ ...input.assets[0], name: "Changed" }] })).rejects.toThrow("conflicts");
    expect(await prisma.asset.findUniqueOrThrow({ where: { assetId: asset.assetId } })).toEqual(asset);
  });
});
