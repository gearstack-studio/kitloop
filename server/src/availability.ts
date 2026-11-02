// Canonical asset availability (SDS section 4, FEAT-02 contract section 7).
// State is derived from stored facts and never stored: RETIRED if retiredAt is set,
// otherwise CHECKED_OUT if an active loan exists, otherwise AVAILABLE.
export type AssetState = "AVAILABLE" | "CHECKED_OUT" | "RETIRED";

export interface AssetFacts {
  retiredAt: Date | null;
  activeLoanCount: number;
}

/** Prisma `where` for an active loan (not yet returned). */
export const activeLoanWhere = { returnedAt: null } as const;

export function assetState({ retiredAt, activeLoanCount }: AssetFacts): AssetState {
  if (retiredAt) return "RETIRED";
  return activeLoanCount > 0 ? "CHECKED_OUT" : "AVAILABLE";
}

export function isBorrowable(facts: AssetFacts): boolean {
  return assetState(facts) === "AVAILABLE";
}
