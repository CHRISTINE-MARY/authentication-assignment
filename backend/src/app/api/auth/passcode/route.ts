import { connection } from "next/server";
import { setupPasscode } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { fail, json, readBearer, readJson } from "@/lib/http";

export async function POST(request: Request) {
  await connection();
  try {
    await ensureSchema();
    const body = await readJson(request);
    const result = await setupPasscode(readBearer(request), body?.passcode);
    return json(request, result);
  } catch (error) {
    return fail(request, error);
  }
}
