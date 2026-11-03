import { Prisma, RequestStatus, type Loan } from "@prisma/client";
import { ApiError } from "./api-error.js";
import { activeLoanWhere, isBorrowable } from "./availability.js";
import { prisma } from "./db.js";

const invalidDueDate = () => new ApiError(400, "VALIDATION_ERROR", "Provide a due date later than checkout time", {
  dueAt: "A valid future timestamp with timezone is required",
});

export function validateDueDate(dueAt: Date, checkedOutAt: Date) {
  if (!Number.isFinite(dueAt.getTime()) || dueAt <= checkedOutAt) throw invalidDueDate();
}

export function checkoutInput(body: unknown): { assetId: string; dueAt: Date } {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
    Object.keys(body).some(key => !["assetId", "dueAt"].includes(key)) ||
    !("assetId" in body) || typeof body.assetId !== "string" || !body.assetId.trim() || body.assetId.length > 80) {
    throw new ApiError(400, "VALIDATION_ERROR", "Provide assetId and dueAt only", { assetId: "Select the request's equipment" });
  }
  if (!("dueAt" in body) || typeof body.dueAt !== "string") throw invalidDueDate();
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(body.dueAt);
  const dueAt = new Date(body.dueAt);
  if (!match || !Number.isFinite(dueAt.getTime())) throw invalidDueDate();
  const [, year, month, day, hour, minute, second] = match;
  const calendarDay = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (calendarDay.toISOString().slice(0, 10) !== `${year}-${month}-${day}` ||
    Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) throw invalidDueDate();
  return { assetId: body.assetId.trim(), dueAt };
}

export function loanDto(loan: Loan) {
  return { ...loan, status: loan.returnedAt === null ? "ACTIVE" as const : "RETURNED" as const };
}

export async function checkoutRequest(custodianId: string, requestId: string, input: { assetId: string; dueAt: Date }, now = () => new Date()) {
  try {
    const loan = await prisma.$transaction(async tx => {
      const scope = { id: requestId, asset: { custodianAssets: { some: { custodianId } } } };
      // Resolve only authorized requests before locking. Never trust the supplied
      // Asset ID to choose a lock, borrower, or request to fulfill.
      const candidate = await tx.borrowRequest.findFirst({ where: scope, select: { assetId: true } });
      if (!candidate) throw new ApiError(404, "NOT_FOUND", "Record not found");
      await tx.$queryRaw`SELECT "assetId" FROM "Asset" WHERE "assetId" = ${candidate.assetId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "BorrowRequest" WHERE "id" = ${requestId}::uuid FOR UPDATE`;
      const record = await tx.borrowRequest.findFirst({ where: scope, include: { asset: true } });
      if (!record) throw new ApiError(404, "NOT_FOUND", "Record not found");
      if (record.assetId !== input.assetId) {
        throw new ApiError(409, "REQUEST_MISMATCH", "Selected equipment does not match this request");
      }
      if (record.status !== RequestStatus.PENDING) {
        throw new ApiError(409, "REQUEST_NOT_PENDING", "This request has already been checked out");
      }
      const activeLoanCount = await tx.loan.count({ where: { assetId: record.assetId, ...activeLoanWhere } });
      if (!isBorrowable({ retiredAt: record.asset.retiredAt, activeLoanCount })) {
        throw new ApiError(409, "ASSET_UNAVAILABLE", "Equipment is unavailable. Refresh the pending requests.");
      }
      const checkedOutAt = now();
      validateDueDate(input.dueAt, checkedOutAt);
      const updated = await tx.borrowRequest.updateMany({
        where: { id: requestId, status: RequestStatus.PENDING }, data: { status: RequestStatus.CHECKED_OUT },
      });
      if (updated.count !== 1) throw new ApiError(409, "REQUEST_NOT_PENDING", "Request is no longer pending");
      return tx.loan.create({ data: {
        requestId, assetId: record.assetId, borrowerId: record.borrowerId,
        checkoutCustodianId: custodianId, checkedOutAt, dueAt: input.dueAt,
      } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return loanDto(loan);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
      throw new ApiError(409, "CHECKOUT_CONFLICT", "Another checkout changed this equipment. Refresh before trying again.");
    }
    throw error;
  }
}
