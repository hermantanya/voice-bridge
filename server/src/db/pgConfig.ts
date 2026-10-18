import type pg from "pg";

function parsePostgresHost(connectionString: string): string | null {
  try {
    const normalized = connectionString.replace(
      /^postgres:\/\//i,
      "postgresql://",
    );
    return new URL(normalized).hostname;
  } catch {
    return null;
  }
}

/** Cloud Postgres (e.g. Supabase) requires TLS; local dev usually does not. */
export function createPgPoolConfig(connectionString: string): pg.PoolConfig {
  const config: pg.PoolConfig = { connectionString };
  const host = parsePostgresHost(connectionString);
  const sslRequested =
    /sslmode=(require|verify-full|prefer)/i.test(connectionString) ||
    /supabase\.co/i.test(connectionString);

  if (sslRequested || (host && !isLocalPostgresHost(host))) {
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
}

function isLocalPostgresHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local")
  );
}
