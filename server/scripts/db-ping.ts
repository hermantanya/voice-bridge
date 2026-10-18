/**
 * Verify DATABASE_URL connectivity (never logs the URL or credentials).
 *
 * Usage:
 *   cd server
 *   npm run db:ping
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(scriptDir, "../.env") });

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    console.error("db-ping: DATABASE_URL is not set (add it to server/.env)");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
    const result = await client.query<{ ok: number }>("SELECT 1 AS ok");
    if (result.rows[0]?.ok !== 1) {
      console.error("db-ping: unexpected SELECT 1 result");
      process.exit(1);
    }
    console.log("db-ping: OK (PostgreSQL accepted connection and SELECT 1)");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`db-ping: failed — ${message}`);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
