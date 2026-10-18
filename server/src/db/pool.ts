import pg from "pg";

let pool: pg.Pool | null = null;

export function getDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL?.trim();
  return url || null;
}

export function getPgPool(): pg.Pool {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  if (!pool) {
    pool = new pg.Pool({ connectionString });
  }
  return pool;
}

/** Test helper — close pool between tests */
export async function closePgPoolForTests(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
