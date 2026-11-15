import "dotenv/config";
import { existsSync } from "node:fs";
import { ConfigurationError, runtimeConfig } from "./config.js";

async function main() {
  const { port } = runtimeConfig(process.env);
  if (process.env.NODE_ENV === "production" && !existsSync(new URL("../public/index.html", import.meta.url))) {
    throw new ConfigurationError("Production frontend is missing; build the Docker production target");
  }
  const [{ default: app }, { prisma }] = await Promise.all([import("./app.js"), import("./db.js")]);
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`KitLoop listening on port ${port}`);
  });
  server.on("error", () => {
    console.error("HTTP server failed to start");
    process.exitCode = 1;
    void prisma.$disconnect();
  });

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => {
      console.error("Shutdown deadline exceeded");
      server.closeAllConnections();
      process.exit(1);
    }, 9000);
    deadline.unref();
    server.close(async (error) => {
      try {
        await prisma.$disconnect();
        process.exitCode = error ? 1 : 0;
      } catch {
        console.error("Database disconnect failed during shutdown");
        process.exitCode = 1;
      } finally {
        clearTimeout(deadline);
      }
    });
    server.closeIdleConnections();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

void main().catch((error: unknown) => {
  console.error(error instanceof ConfigurationError ? error.message : "Application startup failed");
  process.exitCode = 1;
});
