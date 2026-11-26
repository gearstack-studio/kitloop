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

/**
 * PR #72 review P1, two-phase lifecycle rollout. With REQUEST_LIFECYCLE_WRITES unset or "disabled" (phase 1, the
 * compatibility release) the server reads every request status but writes only PENDING and CHECKED_OUT, like the
 * pre-lifecycle revision 8b6e5a9, so that revision stays a safe traffic rollback target. "enabled" (phase 2) turns on
 * checkout auto-decline, borrower cancel and custodian decline. Any other value is a startup configuration error.
 */
export function requestLifecycleWrites(env: NodeJS.ProcessEnv): boolean {
  const value = env.REQUEST_LIFECYCLE_WRITES;
  if (value === undefined || value === "disabled") return false;
  if (value === "enabled") return true;
  throw new ConfigurationError("REQUEST_LIFECYCLE_WRITES must be 'enabled' or 'disabled'");
}

/**
 * UAT-E02 (#62), BR-11. The maximum loan duration in whole days: a due date may be at most LOAN_MAX_DAYS x 24 hours
 * after the actual checkout instant (inclusive). The department has not chosen the value yet (SRS OQ-01, owner:
 * department owner / instructor), so it is a deployment setting with no default: unset or empty means no maximum,
 * which is the behaviour before this change. 1-3650 is only a sanity range for the setting, not a policy. Any other
 * value is a startup configuration error, so a typo never silently disables the limit.
 */
export function loanMaxDays(env: NodeJS.ProcessEnv): number | null {
  const value = env.LOAN_MAX_DAYS;
  if (value === undefined || value === "") return null;
  if (!/^[1-9]\d{0,3}$/.test(value) || Number(value) > 3650) {
    throw new ConfigurationError("LOAN_MAX_DAYS must be a whole number of days from 1 to 3650, or unset for no maximum");
  }
  return Number(value);
}

export function borrowingQuota(env: NodeJS.ProcessEnv): boolean {
  const value = env.BORROWING_QUOTA;
  if (value === undefined || value === "disabled") return false;
  if (value !== "enabled") {
    throw new ConfigurationError("BORROWING_QUOTA must be 'enabled' or 'disabled'");
  }
  if (!requestLifecycleWrites(env)) {
    throw new ConfigurationError("BORROWING_QUOTA requires REQUEST_LIFECYCLE_WRITES=enabled");
  }
  return true;
}

export function runtimeConfig(env: NodeJS.ProcessEnv) {
  requestLifecycleWrites(env);
  borrowingQuota(env);
  loanMaxDays(env);
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
