import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Router, type RequestHandler } from "express";
import { Role } from "@prisma/client";
import { ApiError } from "./api-error.js";
import { prisma } from "./db.js";
import { verifyPassword } from "./password.js";

export const COOKIE_NAME = "kitloop_session";
const SESSION_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 12);
const ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:5173";

export interface Principal {
  id: string;
  role: Role;
  tokenHash: string;
}

declare global {
  namespace Express {
    interface Request {
      principal?: Principal;
    }
  }
}

function sessionSecret(): string {
  const secret = process.env.SESSION_CSRF_SECRET;
  if (!secret || secret.length < 32) {
    throw new ApiError(500, "INTERNAL_ERROR", "An unexpected error occurred");
  }
  return secret;
}

function tokenFromCookie(header: string | undefined): string | null {
  if (!header) return null;
  const matches = header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(COOKIE_NAME.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function csrfFor(tokenHash: string): string {
  return createHmac("sha256", sessionSecret()).update(tokenHash).digest("base64url");
}

function cookieOptions() {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api",
  };
}

function requireTrustedOrigin(origin: string | undefined): void {
  if (origin !== ORIGIN) {
    throw new ApiError(403, "FORBIDDEN_ORIGIN", "Request origin is not allowed");
  }
}

export const requireAuth: RequestHandler = async (request, _response, next) => {
  try {
    const token = tokenFromCookie(request.headers.cookie);
    if (!token) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");

    const tokenHash = hashToken(token);
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!session || session.expiresAt <= new Date()) {
      if (session) await prisma.session.deleteMany({ where: { tokenHash } });
      throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    }
    request.principal = { id: session.user.id, role: session.user.role, tokenHash };
    next();
  } catch (error) {
    next(error);
  }
};

export function requireRole(role: Role): RequestHandler {
  return (request, _response, next) => {
    if (request.principal?.role !== role) {
      next(new ApiError(403, "FORBIDDEN", "Operation is not permitted"));
      return;
    }
    next();
  };
}

export const requireCsrf: RequestHandler = (request, _response, next) => {
  try {
    requireTrustedOrigin(request.get("Origin"));
    const principal = request.principal;
    if (!principal) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    const supplied = request.get("X-CSRF-Token") ?? "";
    const expected = csrfFor(principal.tokenHash);
    const suppliedBytes = Buffer.from(supplied);
    const expectedBytes = Buffer.from(expected);
    if (
      suppliedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(suppliedBytes, expectedBytes)
    ) {
      throw new ApiError(403, "INVALID_CSRF", "Request verification failed");
    }
    next();
  } catch (error) {
    next(error);
  }
};

export const authRouter = Router();

authRouter.post("/login", async (request, response) => {
  requireTrustedOrigin(request.get("Origin"));
  const body = request.body;
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    typeof body.username !== "string" ||
    typeof body.password !== "string" ||
    body.username.length === 0 ||
    body.password.length === 0 ||
    Object.keys(body).some((key) => !["username", "password"].includes(key))
  ) {
    throw new ApiError(400, "VALIDATION_ERROR", "Valid username and password are required", {
      credentials: "Provide a username and password only",
    });
  }

  const user = await prisma.user.findUnique({ where: { username: body.username } });
  const valid = await verifyPassword(body.password, user?.passwordHash);
  if (!user || !valid) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid username or password");
  }
  if (!Number.isFinite(SESSION_HOURS) || SESSION_HOURS <= 0) {
    throw new ApiError(500, "INTERNAL_ERROR", "An unexpected error occurred");
  }
  sessionSecret();

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const previousToken = tokenFromCookie(request.headers.cookie);
  await prisma.$transaction(async (transaction) => {
    if (previousToken) {
      await transaction.session.deleteMany({ where: { tokenHash: hashToken(previousToken) } });
    }
    await transaction.session.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000),
      },
    });
  });

  response.cookie(COOKIE_NAME, token, {
    ...cookieOptions(),
    maxAge: SESSION_HOURS * 60 * 60 * 1000,
  });
  response.set("X-CSRF-Token", csrfFor(tokenHash));
  response.json({ user: { id: user.id, role: user.role } });
});

authRouter.get("/me", requireAuth, (request, response) => {
  const principal = request.principal!;
  response.set("X-CSRF-Token", csrfFor(principal.tokenHash));
  response.json({ id: principal.id, role: principal.role });
});

authRouter.post("/logout", requireAuth, requireCsrf, async (request, response) => {
  await prisma.session.delete({ where: { tokenHash: request.principal!.tokenHash } });
  response.clearCookie(COOKIE_NAME, cookieOptions());
  response.status(204).send();
});
