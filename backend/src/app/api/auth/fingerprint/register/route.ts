import { connection } from "next/server";
import { ensureSchema } from "@/lib/schema";
import { fingerprintRegister } from "@/lib/webauthn";
import { fail, json, readBearer, readJson } from "@/lib/http";

export async function POST(request: Request) {
  await connection();
  try {
    await ensureSchema();
    const body = await readJson(request);
    const result = await fingerprintRegister(readBearer(request), body?.response, body?.kind);
    return json(request, result);
  } catch (error) {
    return fail(request, error);
  }
}
