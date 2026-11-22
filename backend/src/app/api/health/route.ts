import { connection } from "next/server";
import { ensureSchema } from "@/lib/schema";
import { json } from "@/lib/http";
import { query } from "@/lib/supabase";

export async function GET(request: Request) {
  await connection();
  try {
    await ensureSchema();
    await query("select 1 as ok");
    return json(request, { ok: true, database: "connected" });
  } catch (error) {
    console.error(error);
    return json(request, { ok: false, database: "unavailable" }, 503);
  }
}
