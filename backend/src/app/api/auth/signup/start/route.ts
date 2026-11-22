import { connection } from "next/server";
import { startSignup } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { fail, json, readJson } from "@/lib/http";

export async function POST(request: Request) {
  await connection();
  try {
    await ensureSchema();
    const body = await readJson(request);
    const result = await startSignup(body?.email);
    return json(request, result);
  } catch (error) {
    return fail(request, error);
  }
}
