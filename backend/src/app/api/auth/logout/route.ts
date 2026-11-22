import { connection } from "next/server";
import { logout } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { fail, json, readBearer } from "@/lib/http";

export async function POST(request: Request) {
  await connection();
  try {
    await ensureSchema();
    const result = await logout(readBearer(request));
    return json(request, result);
  } catch (error) {
    return fail(request, error);
  }
}
