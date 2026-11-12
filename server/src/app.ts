import cors from "cors";
import express from "express";
import { apiErrorHandler } from "./api-error.js";
import { authRouter } from "./auth.js";
import { domainRouter } from "./domain.js";
import { prisma } from "./db.js";

const app = express();

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
app.use(apiErrorHandler);

export default app;
