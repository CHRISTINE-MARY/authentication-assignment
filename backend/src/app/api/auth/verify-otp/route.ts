import { connection } from "next/server";
import { verifyOtp } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { fail, json, readDeviceId, readJson } from "@/lib/http";

export async function POST(request: Request) {
  await connection();
  try {
    await ensureSchema();
    const body = await readJson(request);
    const result = await verifyOtp(body?.email, body?.code, readDeviceId(request), body);
    return json(request, result);
  } catch (error) {
    return fail(request, error);
  }
}
