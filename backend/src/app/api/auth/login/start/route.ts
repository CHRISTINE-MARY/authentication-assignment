import { connection } from "next/server";
import { startLogin } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { fail, json, readDeviceId, readJson } from "@/lib/http";

export async function POST(request: Request) {
  await connection();
  try {
    await ensureSchema();
    const body = await readJson(request);
    const result = await startLogin(body?.email, readDeviceId(request));
    return json(request, result);
  } catch (error) {
    return fail(request, error);
  }
}
