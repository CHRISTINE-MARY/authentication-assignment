import { readFile } from "node:fs/promises";
import path from "node:path";
import { query } from "./supabase";

let ready: Promise<void> | null = null;

async function applySchema() {
  const sqlPath = path.join(process.cwd(), "sql", "001_auth.sql");
  const sql = await readFile(sqlPath, "utf8");
  await query(sql);
}

export function ensureSchema() {
  if (!ready) {
    ready = applySchema().catch((error: unknown) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}
