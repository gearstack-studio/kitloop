// CR-01 STS TC01, U level (docs/labs/lab-07/CR-01-STS.md §1 and TC01): the capacity grid remaining(P) and canSubmit(P)
// for P = 0…5. The pending count is stubbed, so the function's own arithmetic is tested and no database row is involved.
import { afterEach, describe, expect, it, vi } from "vitest";
import { readBorrowingQuota } from "../src/borrow-requests.js";
import { prisma } from "../src/db.js";

const borrowerId = "synthetic-borrower-id";

// P -> expected DTO. P >= 2 has no capacity; above 2 (historical over-limit records) capacity is clamped at 0, never negative.
const grid = [
  [0, { pendingRequests: 0, maxPendingRequests: 2, remainingRequestCapacity: 2, canSubmitRequest: true }],
  [1, { pendingRequests: 1, maxPendingRequests: 2, remainingRequestCapacity: 1, canSubmitRequest: true }],
  [2, { pendingRequests: 2, maxPendingRequests: 2, remainingRequestCapacity: 0, canSubmitRequest: false }],
  [3, { pendingRequests: 3, maxPendingRequests: 2, remainingRequestCapacity: 0, canSubmitRequest: false }],
  [4, { pendingRequests: 4, maxPendingRequests: 2, remainingRequestCapacity: 0, canSubmitRequest: false }],
  [5, { pendingRequests: 5, maxPendingRequests: 2, remainingRequestCapacity: 0, canSubmitRequest: false }],
] as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CR01-TC01 (U): borrowing quota capacity grid", () => {
  it.each(grid)("P = %i gives the exact four-field DTO", async (pending, expected) => {
    const count = vi.spyOn(prisma.borrowRequest, "count").mockResolvedValueOnce(pending);

    const quota = await readBorrowingQuota(borrowerId);

    expect(quota).toStrictEqual(expected);
    expect(Object.keys(quota).sort()).toEqual(["canSubmitRequest", "maxPendingRequests", "pendingRequests", "remainingRequestCapacity"]);
    expect(quota.remainingRequestCapacity).toBe(Math.max(0, 2 - pending));
    expect(quota.remainingRequestCapacity).toBeGreaterThanOrEqual(0);
    expect(quota.canSubmitRequest).toBe(pending < 2);
    // The count is scoped to this borrower's PENDING requests only, and read once.
    expect(count).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith({ where: { borrowerId, status: "PENDING" } });
  });
});
