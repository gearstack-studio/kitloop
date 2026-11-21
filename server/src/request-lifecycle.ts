import { Prisma, RequestCloseReason, RequestStatus } from "@prisma/client";
import { ApiError } from "./api-error.js";
import { isCheckoutConflict } from "./checkout.js";
import { prisma } from "./db.js";
import { requestDetails } from "./borrow-requests.js";

// UAT-E01 (#61). Only PENDING requests can close. Clients never choose a status: each action maps to exactly
// one terminal status, and the reason is either fixed (cancel) or chosen from a custodian allowlist (decline).
// No expiry runs: EXPIRED is reserved until a documented, configurable expiry policy is approved.

export const CUSTODIAN_DECLINE_REASONS = [
  RequestCloseReason.EQUIPMENT_UNAVAILABLE,
  RequestCloseReason.BORROWER_NOT_ELIGIBLE,
  RequestCloseReason.DUPLICATE_REQUEST,
  RequestCloseReason.OTHER,
] as const;

export function cancelInput(body: unknown): void {
  if (body === undefined) return;
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length > 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "Cancel takes no fields; status and reason are assigned by the server");
  }
}

export function declineInput(body: unknown): RequestCloseReason {
  const reason = body && typeof body === "object" && !Array.isArray(body) && Object.keys(body).every(key => key === "reason")
    ? (body as { reason?: unknown }).reason : undefined;
  if (typeof reason !== "string" || !(CUSTODIAN_DECLINE_REASONS as readonly string[]).includes(reason)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Provide a valid decline reason only", {
      reason: `Choose one of ${CUSTODIAN_DECLINE_REASONS.join(", ")}`,
    });
  }
  return reason as RequestCloseReason;
}

type Close =
  | { kind: "cancel"; actorId: string }
  | { kind: "decline"; actorId: string; reason: RequestCloseReason };

async function closeRequest(requestId: string, close: Close, now = () => new Date()) {
  // Borrowers see only their own requests; custodians only requests for equipment assigned to them.
  // Anything outside that scope is reported as 404, like checkout.
  const scope: Prisma.BorrowRequestWhereInput = close.kind === "cancel"
    ? { id: requestId, borrowerId: close.actorId }
    : { id: requestId, asset: { custodianAssets: { some: { custodianId: close.actorId } } } };
  try {
    return await prisma.$transaction(async tx => {
      const candidate = await tx.borrowRequest.findFirst({ where: scope, select: { id: true } });
      if (!candidate) throw new ApiError(404, "NOT_FOUND", "Record not found");
      await tx.$queryRaw`SELECT "id" FROM "BorrowRequest" WHERE "id" = ${requestId}::uuid FOR UPDATE`;
      const record = await tx.borrowRequest.findFirst({ where: scope, select: { status: true } });
      if (!record) throw new ApiError(404, "NOT_FOUND", "Record not found");
      if (record.status !== RequestStatus.PENDING) {
        throw new ApiError(409, "REQUEST_NOT_PENDING", "This request is no longer pending. Refresh to see its status.");
      }
      const updated = await tx.borrowRequest.updateMany({
        where: { id: requestId, status: RequestStatus.PENDING },
        data: close.kind === "cancel"
          ? { status: RequestStatus.CANCELLED, closeReason: RequestCloseReason.CANCELLED_BY_BORROWER, closedAt: now(), closedById: close.actorId }
          : { status: RequestStatus.DECLINED, closeReason: close.reason, closedAt: now(), closedById: close.actorId },
      });
      if (updated.count !== 1) throw new ApiError(409, "REQUEST_NOT_PENDING", "This request is no longer pending. Refresh to see its status.");
      return tx.borrowRequest.findUniqueOrThrow({
        where: { id: requestId },
        include: close.kind === "decline" ? { ...requestDetails, borrower: { select: { id: true, username: true } } } : requestDetails,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    // A concurrent checkout, cancel or decline won: the aborted transaction changed nothing.
    if (isCheckoutConflict(error)) {
      throw new ApiError(409, "REQUEST_CONFLICT", "This request changed at the same time. Refresh before trying again.");
    }
    throw error;
  }
}

export const cancelRequest = (borrowerId: string, requestId: string) =>
  closeRequest(requestId, { kind: "cancel", actorId: borrowerId });

export const declineRequest = (custodianId: string, requestId: string, reason: RequestCloseReason) =>
  closeRequest(requestId, { kind: "decline", actorId: custodianId, reason });
