export class ConfigurationError extends Error {}

export function databaseUrl(env: NodeJS.ProcessEnv): string {
  try {
    const value = env.DATABASE_URL;
    if (!value) throw new Error();
    const url = new URL(value);
    if (!["postgresql:", "postgres:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2) {
      throw new Error();
    }
    return value;
  } catch {
    throw new ConfigurationError("DATABASE_URL must be a PostgreSQL connection URL with a database name");
  }
}

export function runtimeConfig(env: NodeJS.ProcessEnv) {
  const port = env.PORT ?? "3000";
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new ConfigurationError("PORT must be an integer between 1 and 65535");
  }
  const ttl = Number(env.SESSION_TTL_HOURS ?? "12");
  if (!Number.isFinite(ttl) || ttl <= 0) {
    throw new ConfigurationError("SESSION_TTL_HOURS must be a positive number");
  }
  if (env.NODE_ENV === "production") {
    databaseUrl(env);
    if (!env.SESSION_CSRF_SECRET || env.SESSION_CSRF_SECRET.length < 32) {
      throw new ConfigurationError("SESSION_CSRF_SECRET must contain at least 32 characters");
    }
    try {
      const origin = new URL(env.APP_ORIGIN ?? "");
      if (origin.protocol !== "https:" || origin.origin !== env.APP_ORIGIN) throw new Error();
    } catch {
      throw new ConfigurationError("APP_ORIGIN must be an exact HTTPS origin without a path or credentials");
    }
  }
  return { port: Number(port) };
}
