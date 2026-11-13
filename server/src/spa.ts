import express, { type Express } from "express";
import path from "node:path";

export function serveSpa(app: Express, directory: string): void {
  app.use(express.static(directory, { index: false }));
  app.get("/{*path}", (request, response, next) => {
    if (request.path === "/api" || request.path.startsWith("/api/") ||
        path.extname(request.path) || !request.accepts("html")) {
      next();
      return;
    }
    response.set("Cache-Control", "no-cache");
    response.sendFile("index.html", { root: directory });
  });
}
