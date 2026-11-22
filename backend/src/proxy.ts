import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const DEFAULT_ORIGIN = "http://localhost:3000";

function allowedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const allowed = new Set([DEFAULT_ORIGIN]);
  if (process.env.FRONTEND_ORIGIN) {
    allowed.add(process.env.FRONTEND_ORIGIN);
  }
  if (origin && allowed.has(origin)) return origin;
  return process.env.FRONTEND_ORIGIN || DEFAULT_ORIGIN;
}

function applyCors(response: NextResponse, origin: string) {
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Device-Id",
  );
  response.headers.set("Access-Control-Max-Age", "86400");
  response.headers.set("Vary", "Origin");
  return response;
}

export function proxy(request: NextRequest) {
  const origin = allowedOrigin(request);
  if (request.method === "OPTIONS") {
    return applyCors(new NextResponse(null, { status: 204 }), origin);
  }
  return applyCors(NextResponse.next(), origin);
}

export const config = {
  matcher: "/api/:path*",
};
