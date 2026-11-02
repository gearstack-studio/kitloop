import { describe, expect, it } from "vitest";

// TEST-FEAT-02-04: the shared availability definition (SDS section 4, contract section 7).
describe("FEAT-02 availability definition", () => {
  it("TEST-FEAT-02-04 maps retirement and active loans to one canonical state", async () => {
    const { assetState, isBorrowable } = await import("../src/availability.js");
    expect(assetState({ retiredAt: null, activeLoanCount: 0 })).toBe("AVAILABLE");
    expect(assetState({ retiredAt: null, activeLoanCount: 1 })).toBe("CHECKED_OUT");
    expect(assetState({ retiredAt: new Date(), activeLoanCount: 0 })).toBe("RETIRED");
    // A retired asset with a loan is invalid data; it is treated as retired (contract rule R4).
    expect(assetState({ retiredAt: new Date(), activeLoanCount: 1 })).toBe("RETIRED");
    expect(isBorrowable({ retiredAt: null, activeLoanCount: 0 })).toBe(true);
    expect(isBorrowable({ retiredAt: null, activeLoanCount: 1 })).toBe(false);
    expect(isBorrowable({ retiredAt: new Date(), activeLoanCount: 0 })).toBe(false);
  });
});
