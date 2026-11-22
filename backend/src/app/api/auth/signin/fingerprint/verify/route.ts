import { connection } from "next/server";
import { ensureSchema } from "@/lib/schema";
import { signInFingerprintVerify } from "@/lib/webauthn";
import { fail, json, readDeviceId, readJson } from "@/lib/http";

export async function POST(request: Request) {
  await connection();
  try {
    await ensureSchema();
    const body = await readJson(request);
    const result = await signInFingerprintVerify(
      body?.email,
      readDeviceId(request),
      body?.response,
    );
    return json(request, result);
  } catch (error) {
    return fail(request, error);
  }
}