import { Prisma, RequestStatus, Role } from "@prisma/client";
import { Router } from "express";
import { ApiError } from "./api-error.js";
import { activeLoanWhere, assetState } from "./availability.js";
import { requireAuth, requireCsrf, requireRole } from "./auth.js";
import { prisma } from "./db.js";

export const domainRouter = Router();
domainRouter.use(requireAuth);

function requiredText(value: unknown, field: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new ApiError(400, "VALIDATION_ERROR", `Valid ${field} is required`, { [field]: "Required text is invalid" });
  }
  return value.trim();
}

const notFound = () => new ApiError(404, "NOT_FOUND", "Record not found");
function recordId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw notFound();
  }
  return value;
}

domainRouter.get("/assets", async (_request, response) => {
  const rows = await prisma.asset.findMany({
    where: { retiredAt: null },
    select: {
      assetId: true,
      name: true,
      category: true,
      description: true,
      retiredAt: true,
      _count: { select: { loans: { where: activeLoanWhere } } },
    },
    orderBy: [{ name: "asc" }, { assetId: "asc" }],
  });
  // Public catalog DTO: an explicit allowlist, never the database row (FEAT-02 contract section 5.1).
  const catalog = rows
    .map((row) => ({ row, state: assetState({ retiredAt: row.retiredAt, activeLoanCount: row._count.loans }) }))
    .filter(({ state }) => state !== "RETIRED")
    .map(({ row, state }) => ({
      assetId: row.assetId,
      name: row.name,
      category: row.category,
      description: row.description,
      available: state === "AVAILABLE",
    }));
  response.set("Cache-Control", "no-store");
  response.json(catalog);
});

domainRouter.post("/assets", requireRole(Role.CUSTODIAN), requireCsrf, async (request, response) => {
  const body = request.body;
  const assetId = requiredText(body?.assetId, "assetId", 80);
  const name = requiredText(body?.name, "name");
  const category = requiredText(body?.category, "category", 100);
  const description = requiredText(body?.description, "description", 1000);
  try {
    const asset = await prisma.asset.create({
      data: {
        assetId, name, category, description,
        custodianAssets: { create: { custodianId: request.principal!.id } },
      },
    });
    response.status(201).json(asset);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(409, "CONFLICT", "Asset ID already exists");
    }
    throw error;
  }
});

domainRouter.patch("/assets/:assetId", requireRole(Role.CUSTODIAN), requireCsrf, async (request, response) => {
  const assetId = requiredText(request.params.assetId, "assetId", 80);
  const body = request.body;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
    Object.keys(body).length === 0 ||
    Object.keys(body).some(key => !["name", "category", "description"].includes(key))) {
    throw new ApiError(400, "VALIDATION_ERROR", "Provide editable asset fields only");
  }
  const data = {
    ...(body.name !== undefined ? { name: requiredText(body.name, "name") } : {}),
    ...(body.category !== undefined ? { category: requiredText(body.category, "category", 100) } : {}),
    ...(body.description !== undefined ? { description: requiredText(body.description, "description", 1000) } : {}),
  };
  const allowed = await prisma.asset.findFirst({
    where: { assetId, custodianAssets: { some: { custodianId: request.principal!.id } } },
  });
  if (!allowed) throw notFound();
  response.json(await prisma.asset.update({ where: { assetId }, data }));
});

domainRouter.post("/requests", requireRole(Role.BORROWER), requireCsrf, async (request, response) => {
  const assetId = requiredText(request.body?.assetId, "assetId", 80);
  const asset = await prisma.asset.findUnique({ where: { assetId } });
  if (!asset || asset.retiredAt) throw notFound();
  const borrowRequest = await prisma.borrowRequest.create({
    data: { assetId, borrowerId: request.principal!.id },
  });
  response.status(201).json(borrowRequest);
});

domainRouter.get("/requests/mine", requireRole(Role.BORROWER), async (request, response) => {
  response.json(await prisma.borrowRequest.findMany({
    where: { borrowerId: request.principal!.id },
    orderBy: { submittedAt: "desc" },
  }));
});

domainRouter.get("/requests/pending", requireRole(Role.CUSTODIAN), async (request, response) => {
  response.json(await prisma.borrowRequest.findMany({
    where: {
      status: RequestStatus.PENDING,
      asset: { custodianAssets: { some: { custodianId: request.principal!.id } } },
    },
    orderBy: { submittedAt: "asc" },
  }));
});

domainRouter.get("/requests/:id", async (request, response) => {
  const principal = request.principal!;
  const record = await prisma.borrowRequest.findFirst({
    where: {
      id: recordId(request.params.id),
      ...(principal.role === Role.BORROWER
        ? { borrowerId: principal.id }
        : { asset: { custodianAssets: { some: { custodianId: principal.id } } } }),
    },
  });
  if (!record) throw notFound();
  response.json(record);
});

domainRouter.post("/requests/:id/checkout", requireRole(Role.CUSTODIAN), requireCsrf, async (request, response) => {
  const assetId = requiredText(request.body?.assetId, "assetId", 80);
  const dueAt = new Date(request.body?.dueAt);
  if (!Number.isFinite(dueAt.getTime()) || dueAt <= new Date()) {
    throw new ApiError(400, "VALIDATION_ERROR", "Future dueAt is required", { dueAt: "Must be a future date" });
  }
  const principal = request.principal!;
  const id = recordId(request.params.id);
  try {
    const loan = await prisma.$transaction(async (transaction) => {
      const borrowRequest = await transaction.borrowRequest.findFirst({
        where: {
          id,
          assetId,
          asset: { custodianAssets: { some: { custodianId: principal.id } } },
        },
        include: { asset: true },
      });
      if (!borrowRequest) throw notFound();
      if (borrowRequest.status !== RequestStatus.PENDING || borrowRequest.asset.retiredAt) {
        throw new ApiError(409, "CONFLICT", "Request cannot be checked out");
      }
      const active = await transaction.loan.findFirst({ where: { assetId, returnedAt: null } });
      if (active) throw new ApiError(409, "CONFLICT", "Asset is unavailable");
      const updated = await transaction.borrowRequest.updateMany({
        where: { id: borrowRequest.id, status: RequestStatus.PENDING },
        data: { status: RequestStatus.FULFILLED },
      });
      if (updated.count !== 1) throw new ApiError(409, "CONFLICT", "Request cannot be checked out");
      return transaction.loan.create({
        data: {
          requestId: borrowRequest.id,
          assetId,
          borrowerId: borrowRequest.borrowerId,
          checkoutCustodianId: principal.id,
          dueAt,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    response.status(201).json(loan);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2034"].includes(error.code)) {
      throw new ApiError(409, "CONFLICT", "Asset is unavailable");
    }
    throw error;
  }
});

domainRouter.get("/loans/mine", requireRole(Role.BORROWER), async (request, response) => {
  response.json(await prisma.loan.findMany({
    where: { borrowerId: request.principal!.id },
    orderBy: { checkedOutAt: "desc" },
  }));
});

domainRouter.get("/loans/active", requireRole(Role.CUSTODIAN), async (request, response) => {
  response.json(await prisma.loan.findMany({
    where: {
      returnedAt: null,
      asset: { custodianAssets: { some: { custodianId: request.principal!.id } } },
    },
    orderBy: { checkedOutAt: "desc" },
  }));
});

domainRouter.get("/loans/:id", async (request, response) => {
  const principal = request.principal!;
  const record = await prisma.loan.findFirst({
    where: {
      id: recordId(request.params.id),
      ...(principal.role === Role.BORROWER
        ? { borrowerId: principal.id }
        : { asset: { custodianAssets: { some: { custodianId: principal.id } } } }),
    },
  });
  if (!record) throw notFound();
  response.json(record);
});
