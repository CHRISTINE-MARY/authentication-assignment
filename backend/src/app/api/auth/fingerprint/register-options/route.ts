import { connection } from "next/server";
import { ensureSchema } from "@/lib/schema";
import { fingerprintRegisterOptions } from "@/lib/webauthn";
import { fail, json, readBearer, readJson } from "@/lib/http";

export async function POST(request: Request) {
  await connection();
  try {
    await ensureSchema();
    const body = await readJson(request);
    const result = await fingerprintRegisterOptions(readBearer(request), body?.kind);
    return json(request, result);
  } catch (error) {
    return fail(request, error);
  }
}
