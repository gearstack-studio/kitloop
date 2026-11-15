import { describe, expect, it } from "vitest";
import { assertDemoSeedAllowed } from "../prisma/seed-policy.js";

describe("demo seed policy", () => {
  it("refuses to create demo users in production", () => {
    expect(() => assertDemoSeedAllowed("production")).toThrow("Demo seed is disabled in production");
    expect(() => assertDemoSeedAllowed("development")).not.toThrow();
  });
});
