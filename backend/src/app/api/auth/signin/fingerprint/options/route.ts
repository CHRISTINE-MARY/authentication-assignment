import { connection } from "next/server";
import { ensureSchema } from "@/lib/schema";
import { signInFingerprintOptions } from "@/lib/webauthn";
import { fail, json, readDeviceId, readJson } from "@/lib/http";

export async function POST(request: Request) {
  await connection();
  try {
    await ensureSchema();
    const body = await readJson(request);
    const result = await signInFingerprintOptions(body?.email, readDeviceId(request));
    return json(request, result);
  } catch (error) {
    return fail(request, error);
  }
}
