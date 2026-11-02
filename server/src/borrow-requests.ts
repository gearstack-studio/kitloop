import { Prisma, RequestStatus } from "@prisma/client";
import { ApiError } from "./api-error.js";
import { activeLoanWhere, isBorrowable } from "./availability.js";
import { prisma } from "./db.js";

export function requestAssetId(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
    Object.keys(body).some(key => key !== "assetId") || !("assetId" in body) ||
    typeof body.assetId !== "string" || !body.assetId.trim() || body.assetId.length > 80) {
    throw new ApiError(400, "VALIDATION_ERROR", "Provide a valid assetId only", {
      assetId: "Select equipment; identity and status are assigned by the server",
    });
  }
  return body.assetId.trim();
}

export async function createBorrowRequest(borrowerId: string, assetId: string) {
  // Retry serialization conflicts: different borrowers may both submit pending
  // requests. A conflict must not accidentally turn a request into a reservation.
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        const asset = await tx.asset.findUnique({
          where: { assetId },
          select: { retiredAt: true, _count: { select: { loans: { where: activeLoanWhere } } } },
        });
        if (!asset) throw new ApiError(404, "NOT_FOUND", "Equipment not found");
        if (!isBorrowable({ retiredAt: asset.retiredAt, activeLoanCount: asset._count.loans })) {
          throw new ApiError(409, "ASSET_UNAVAILABLE", "This equipment is unavailable. Choose another item.");
        }
        const pending = await tx.borrowRequest.findFirst({
          where: { borrowerId, assetId, status: RequestStatus.PENDING }, select: { id: true },
        });
        if (pending) throw new ApiError(409, "DUPLICATE_REQUEST", "You already have a pending request for this equipment.");
        return tx.borrowRequest.create({ data: { borrowerId, assetId, status: RequestStatus.PENDING } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2034" && attempt < 2) continue;
        if (error.code === "P2002") {
          throw new ApiError(409, "DUPLICATE_REQUEST", "You already have a pending request for this equipment.");
        }
        if (error.code === "P2034") {
          throw new ApiError(409, "CONFLICT", "Equipment changed while submitting. Refresh and try again.");
        }
      }
      throw error;
    }
  }
}

export const requestDetails = {
  asset: { select: { assetId: true, name: true, category: true } },
} satisfies Prisma.BorrowRequestInclude;
