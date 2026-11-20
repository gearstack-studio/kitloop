import cors from "cors";
import express from "express";
import { apiErrorHandler } from "./api-error.js";
import { authRouter } from "./auth.js";
import { domainRouter } from "./domain.js";
import { prisma } from "./db.js";
import { fileURLToPath } from "node:url";
import { serveSpa } from "./spa.js";

const app = express();

app.disable("x-powered-by");
app.use((_request, response, next) => {
  response.set({
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self'",
      // React uses inline styles for visual effects and CSS custom properties.
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join("; "),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Strict-Transport-Security": "max-age=31536000",
    "Referrer-Policy": "no-referrer",
  });
  next();
});

app.use(cors({
  origin: process.env.APP_ORIGIN ?? "http://localhost:5173",
  credentials: true,
  exposedHeaders: ["X-CSRF-Token"],
}));
app.use(express.json({ limit: "16kb" }));

app.get("/api/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "KitLoop API",
  });
});

app.get("/api/version", (_request, response) => {
  const commit = process.env.BUILD_COMMIT_SHA ?? "";
  response.set("Cache-Control", "no-store").json({
    commit: /^[a-f0-9]{40}$/.test(commit) ? commit : null,
  });
});

app.get("/api/ready", async (_request, response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    response.status(200).json({ status: "ready" });
  } catch {
    response.status(503).json({ status: "unavailable" });
  }
});

app.use("/api/auth", authRouter);
app.use("/api", domainRouter);
app.use("/api", (_request, response) => {
  response.status(404).json({ error: { code: "NOT_FOUND", message: "API route not found" } });
});
if (process.env.NODE_ENV === "production") {
  serveSpa(app, fileURLToPath(new URL("../public/", import.meta.url)));
}
app.use(apiErrorHandler);

export default app;
