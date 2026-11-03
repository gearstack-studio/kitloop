import { describe, expect, it } from "vitest";
import { checkoutInput, loanDto, validateDueDate } from "../src/checkout.js";

describe("Checkout validation and loan projection", () => {
  it("accepts an explicit Asset ID and a timezone-aware due date", () => {
    const input = checkoutInput({ assetId: " CAM-1 ", dueAt: "2030-01-02T09:30:00+07:00" });
    expect(input.assetId).toBe("CAM-1");
    expect(input.dueAt.toISOString()).toBe("2030-01-02T02:30:00.000Z");
  });
  it("rejects invalid bodies and client-assigned loan or identity fields", () => {
    for (const body of [null, [], {}, { assetId: 1 }, { assetId: " " }, { assetId: "a".repeat(81) },
      ...["borrowerId", "status", "requestId", "checkedOutAt", "checkoutCustodianId"].map(key => ({
        assetId: "CAM-1", dueAt: "2030-01-02T00:00:00Z", [key]: "forged",
      }))]) expect(() => checkoutInput(body)).toThrow();
  });
  it("rejects coercible, impossible, malformed, and timezone-free dates", () => {
    for (const dueAt of [null, 0, [], "", "tomorrow", "2030-01-02", "2030-01-02T09:00:00",
      "2030-02-30T09:00:00Z", "2030-01-01T24:00:00Z", "2030-01-01T09:61:00Z", "2030-13-01T00:00:00Z"]) {
      expect(() => checkoutInput({ assetId: "CAM-1", dueAt })).toThrow("Provide a due date");
    }
  });
  it("requires the due date strictly after the actual checkout instant", () => {
    const now = new Date("2030-01-02T00:00:00Z");
    for (const due of [new Date(NaN), new Date(now.getTime() - 1), now]) {
      expect(() => validateDueDate(due, now)).toThrow();
    }
    expect(() => validateDueDate(new Date(now.getTime() + 1), now)).not.toThrow();
  });
  it("derives ACTIVE/RETURNED from persisted custody facts without editable state", () => {
    const loan = { id: "L1", assetId: "A1", borrowerId: "B1", requestId: "R1", checkoutCustodianId: "C1",
      checkedOutAt: new Date(), dueAt: new Date(), returnedAt: null, returnCustodianId: null };
    expect(loanDto(loan).status).toBe("ACTIVE");
    expect(loanDto({ ...loan, returnedAt: new Date(), returnCustodianId: "C1" }).status).toBe("RETURNED");
    expect(loan.returnedAt).toBeNull();
  });
});
