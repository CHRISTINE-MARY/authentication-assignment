import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

export type AuthUser = {
  id: string;
  email: string;
  createdAt: string;
  lastLoginAt: string | null;
};

export type LockMethods = {
  passcode: boolean;
  fingerprint: boolean;
  passkey: boolean;
};

export type SessionState = {
  user: AuthUser;
  locked: boolean;
  methods: LockMethods;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
export const TOKEN_KEY = "auth.token";
const DEVICE_KEY = "auth.device";

type ErrorBody = { error?: string };

export function getDeviceId() {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(DEVICE_KEY, created);
  return created;
}

async function request<T>(
  path: string,
  options: { method: "GET" | "POST"; token?: string; body?: unknown } = {
    method: "GET",
  },
) {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method,
      headers: {
        "Content-Type": "application/json",
        "X-Device-Id": getDeviceId(),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error("The request timed out. Try again.");
    }
    throw new Error("Could not reach the server.");
  }

  const data = (await response.json().catch(() => null)) as (T & ErrorBody) | null;
  if (!response.ok) {
    throw new Error(data?.error || "Request failed.");
  }
  return data as T;
}

export function startSignup(email: string) {
  return request<{ ok: true }>("/api/auth/signup/start", {
    method: "POST",
    body: { email },
  });
}

export function startLogin(email: string) {
  return request<{ next: "challenge"; methods: LockMethods } | { next: "confirm" }>(
    "/api/auth/login/start",
    { method: "POST", body: { email } },
  );
}

export function signInWithPasscode(email: string, passcode: string) {
  return request<{ token: string } & SessionState>("/api/auth/signin/passcode", {
    method: "POST",
    body: { email, passcode },
  });
}

export async function signInWithFingerprint(email: string) {
  const optionsJSON = await request<Parameters<typeof startAuthentication>[0]["optionsJSON"]>(
    "/api/auth/signin/fingerprint/options",
    { method: "POST", body: { email } },
  );
  const response = await startAuthentication({ optionsJSON });
  return request<{ token: string } & SessionState>("/api/auth/signin/fingerprint/verify", {
    method: "POST",
    body: { email, response },
  });
}

export function hasMethod(methods: LockMethods) {
  return methods.passcode || methods.fingerprint || methods.passkey;
}

export function startPasscodeReset(email: string) {
  return request<{ ok: true }>("/api/auth/passcode/reset/start", {
    method: "POST",
    body: { email },
  });
}

export function resetPasscode(email: string, code: string, passcode: string) {
  return request<{ token: string } & SessionState>("/api/auth/passcode/reset", {
    method: "POST",
    body: { email, code, passcode },
  });
}

export function verifyOtp(email: string, code: string) {
  return request<{ token: string } & SessionState>("/api/auth/verify-otp", {
    method: "POST",
    body: { email, code },
  });
}

export function getMe(token: string) {
  return request<SessionState>("/api/auth/me", { method: "GET", token });
}

export function logout(token: string) {
  return request<{ ok: true }>("/api/auth/logout", { method: "POST", token });
}

export function setupPasscode(token: string, passcode: string) {
  return request<SessionState>("/api/auth/passcode", {
    method: "POST",
    token,
    body: { passcode },
  });
}

export async function registerFingerprint(
  token: string,
  kind: "fingerprint" | "passkey",
) {
  const optionsJSON = await request<Parameters<typeof startRegistration>[0]["optionsJSON"]>(
    "/api/auth/fingerprint/register-options",
    { method: "POST", token, body: { kind } },
  );
  const response = await startRegistration({ optionsJSON });
  return request<SessionState>("/api/auth/fingerprint/register", {
    method: "POST",
    token,
    body: { response, kind },
  });
}

export async function fingerprintAvailable() {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}
