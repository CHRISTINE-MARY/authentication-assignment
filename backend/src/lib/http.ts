const DEFAULT_ORIGIN = "http://localhost:3000";

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function allowedOrigins() {
  const origins = new Set([DEFAULT_ORIGIN]);
  if (process.env.FRONTEND_ORIGIN) {
    origins.add(process.env.FRONTEND_ORIGIN);
  }
  return origins;
}

export function resolveOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && allowedOrigins().has(origin)) {
    return origin;
  }
  return process.env.FRONTEND_ORIGIN || DEFAULT_ORIGIN;
}

export function json(request: Request, body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": resolveOrigin(request),
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Device-Id",
      Vary: "Origin",
    },
  });
}

export function fail(request: Request, error: unknown) {
  if (error instanceof HttpError) {
    return json(request, { error: error.message }, error.status);
  }
  console.error(error);
  return json(
    request,
    { error: "Something went wrong. Please try again." },
    500,
  );
}

export async function readJson(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return null;
    }
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function readBearer(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
}

export function readDeviceId(request: Request) {
  const value = request.headers.get("x-device-id") ?? "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new HttpError(400, "This browser could not be identified.");
  }
  return value.toLowerCase();
}
