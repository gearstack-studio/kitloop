import { expect, it } from "vitest";

// Disposable C-02 evidence for Issue #49. This test fails on purpose and must never be merged.
it("fails on purpose to demonstrate the required CI merge gate", () => {
  expect("merge gate").toBe("blocked");
});
