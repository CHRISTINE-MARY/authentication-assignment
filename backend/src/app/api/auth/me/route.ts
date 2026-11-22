import { connection } from "next/server";
import { getSession } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { fail, json, readBearer } from "@/lib/http";

export async function GET(request: Request) {
  await connection();
  try {
    await ensureSchema();
    const result = await getSession(readBearer(request));
    return json(request, result);
  } catch (error) {
    return fail(request, error);
  }
}
