import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getDatabaseUrl, getPgPool } from "./pool.js";

const schemaPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "schema.sql",
);

export async function runMigrations(): Promise<void> {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    return;
  }

  const sql = await readFile(schemaPath, "utf8");
  const pool = getPgPool();
  await pool.query(sql);
}
