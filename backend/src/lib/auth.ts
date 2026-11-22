import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { PoolClient } from "pg";
import { sendOtpEmail } from "./email";
import { HttpError } from "./http";
import { query, withTransaction } from "./supabase";

type UserRow = {
  id: string;
  email: string;
  first_name: string | null;
  surname: string | null;
  date_of_birth: string | null;
  created_at: Date;
  last_login_at: Date | null;
};

export type AuthUser = {
  id: string;
  email: string;
  firstName: string | null;
  surname: string | null;
  dateOfBirth: string | null;
  createdAt: string;
  lastLoginAt: string | null;
};

type SignupProfile = {
  firstName: string;
  surname: string;
  dateOfBirth: string;
};

const USER_FIELDS =
  "id, email, first_name, surname, date_of_birth::text as date_of_birth, created_at, last_login_at";

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

type SessionRecord = {
  sessionId: string;
  deviceId: string;
  user: AuthUser;
  locked: boolean;
  hasPasscode: boolean;
  hasFingerprint: boolean;
  hasPasskey: boolean;
  passcodeHash: string | null;
  passcodeAttempts: number;
};

function pepper() {
  const value = process.env.OTP_PEPPER;
  if (!value || value.length < 16) {
    throw new Error("OTP_PEPPER must be set to a long random string.");
  }
  return value;
}

function hashSecret(kind: "otp" | "session" | "passcode", value: string) {
  return createHash("sha256")
    .update(`${pepper()}:${kind}:${value}`)
    .digest("hex");
}

function hashesMatch(left: string, right: string) {
  const a = Buffer.from(left.trim());
  const b = Buffer.from(right.trim());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function toUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    surname: row.surname,
    dateOfBirth: row.date_of_birth,
    createdAt: new Date(row.created_at).toISOString(),
    lastLoginAt: row.last_login_at
      ? new Date(row.last_login_at).toISOString()
      : null,
  };
}

function normalizeName(value: unknown, label: "first name" | "surname") {
  if (typeof value !== "string") {
    throw new HttpError(400, `Enter your ${label}.`);
  }
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 80 || !/^[\p{L}][\p{L}\s.'’-]*$/u.test(name)) {
    throw new HttpError(400, `Enter your ${label}.`);
  }
  return name;
}

function normalizeDateOfBirth(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, "Enter your date of birth.");
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    year >= 1900 &&
    date.getTime() <= todayUtc;
  if (!valid) {
    throw new HttpError(400, "Enter your date of birth.");
  }
  return value;
}

function normalizeProfile(value: unknown): SignupProfile {
  if (!value || typeof value !== "object") {
    throw new HttpError(400, "Enter your first name, surname, and date of birth.");
  }
  const body = value as Record<string, unknown>;
  return {
    firstName: normalizeName(body.firstName, "first name"),
    surname: normalizeName(body.surname, "surname"),
    dateOfBirth: normalizeDateOfBirth(body.dateOfBirth),
  };
}

export function normalizeEmail(value: unknown) {
  if (typeof value !== "string") {
    throw new HttpError(400, "Enter a valid email address.");
  }
  const email = value.trim().toLowerCase();
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new HttpError(400, "Enter a valid email address.");
  }
  return email;
}

function normalizeDigits(value: unknown, message: string) {
  if (typeof value !== "string") {
    throw new HttpError(400, message);
  }
  const code = value.replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) {
    throw new HttpError(400, message);
  }
  return code;
}

function normalizeCode(value: unknown) {
  return normalizeDigits(value, "Enter the 6-digit code.");
}

function normalizePasscode(value: unknown) {
  return normalizeDigits(value, "Enter a 6-digit passcode.");
}

type SessionRow = {
  session_id: string;
  device_id: string | null;
  unlocked_at: Date | null;
  id: string;
  email: string;
  first_name: string | null;
  surname: string | null;
  date_of_birth: string | null;
  created_at: Date;
  last_login_at: Date | null;
  passcode_hash: string | null;
  passcode_attempts: number;
  has_fingerprint: boolean;
  has_passkey: boolean;
};

function toClientState(session: SessionRecord): SessionState {
  return {
    user: session.user,
    locked: session.locked,
    methods: {
      passcode: session.hasPasscode,
      fingerprint: session.hasFingerprint,
      passkey: session.hasPasskey,
    },
  };
}

async function loadSession(token: string) {
  const rows = await query<SessionRow>(
    `select s.id as session_id, s.device_id, s.unlocked_at,
            u.id, u.email, u.first_name, u.surname,
            u.date_of_birth::text as date_of_birth, u.created_at, u.last_login_at,
            u.passcode_hash, u.passcode_attempts,
            ${methodFlags("s.device_id")}
     from auth_app.sessions s
     join auth_app.users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now()`,
    [hashSecret("session", token)],
  );
  const row = rows[0];
  if (!row || !row.device_id) {
    throw new HttpError(
      401,
      "Your session has ended. Only one device can stay signed in.",
    );
  }
  const session: SessionRecord = {
    sessionId: row.session_id,
    deviceId: row.device_id,
    user: toUser(row),
    locked: row.unlocked_at == null,
    hasPasscode: row.passcode_hash != null,
    hasFingerprint: row.has_fingerprint,
    hasPasskey: row.has_passkey,
    passcodeHash: row.passcode_hash,
    passcodeAttempts: row.passcode_attempts,
  };
  return session;
}

export async function requireSession(token: string | null) {
  if (!token) {
    throw new HttpError(401, "Sign in to continue.");
  }
  return loadSession(token);
}

async function accountRecord(email: string, deviceId: string) {
  const rows = await query<{
    id: string;
    has_passcode: boolean;
    has_fingerprint: boolean;
    has_passkey: boolean;
  }>(
    `select u.id,
            ${methodFlags("$2")}
     from auth_app.users u
     where u.email = $1`,
    [email, deviceId],
  );
  return rows[0] ?? null;
}

function methodsFrom(row: {
  has_passcode?: boolean;
  has_fingerprint?: boolean;
  has_passkey?: boolean;
} | undefined): LockMethods {
  return {
    passcode: row?.has_passcode ?? false,
    fingerprint: row?.has_fingerprint ?? false,
    passkey: row?.has_passkey ?? false,
  };
}

function methodFlags(deviceExpr: string) {
  return `(u.passcode_hash is not null) as has_passcode,
            exists (
              select 1 from auth_app.webauthn_credentials c
              where c.user_id = u.id and c.device_id = ${deviceExpr} and c.kind = 'fingerprint'
            ) as has_fingerprint,
            exists (
              select 1 from auth_app.webauthn_credentials c
              where c.user_id = u.id and c.device_id = ${deviceExpr} and c.kind = 'passkey'
            ) as has_passkey`;
}

async function openSession(
  client: PoolClient,
  user: UserRow,
  deviceId: string,
  unlocked = true,
) {
  await client.query("delete from auth_app.sessions where user_id = $1", [user.id]);
  await client.query(
    `delete from auth_app.webauthn_credentials
     where user_id = $1 and device_id <> $2`,
    [user.id, deviceId],
  );
  const token = randomBytes(32).toString("base64url");
  await client.query(
    `insert into auth_app.sessions
       (id, user_id, token_hash, expires_at, device_id, unlocked_at)
     values ($1, $2, $3, now() + interval '7 days', $4, case when $5 then now() else null end)`,
    [randomUUID(), user.id, hashSecret("session", token), deviceId, unlocked],
  );
  const methods = await client.query<{
    has_passcode: boolean;
    has_fingerprint: boolean;
    has_passkey: boolean;
  }>(
    `select ${methodFlags("$2")}
     from auth_app.users u
     where u.id = $1`,
    [user.id, deviceId],
  );
  return {
    token,
    user: toUser(user),
    locked: !unlocked,
    methods: methodsFrom(methods.rows[0]),
  };
}

async function sendEmailCode(email: string, purpose: "confirm" | "reset" = "confirm") {
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const id = randomUUID();

  await withTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`otp:${email}`]);
    const limited = await client.query<{ limited: boolean }>(
      `select exists (
         select 1 from auth_app.otp_codes
         where email = $1 and created_at > now() - interval '60 seconds'
       ) as limited`,
      [email],
    );
    if (limited.rows[0]?.limited) {
      throw new HttpError(
        429,
        "A code was just emailed. Please wait a minute before requesting another.",
      );
    }
    await client.query(
      `update auth_app.otp_codes
       set consumed_at = now()
       where email = $1 and consumed_at is null`,
      [email],
    );
    await client.query(
      `insert into auth_app.otp_codes (id, email, code_hash, expires_at)
       values ($1, $2, $3, now() + interval '10 minutes')`,
      [id, email, hashSecret("otp", code)],
    );
  });

  try {
    await sendOtpEmail(email, code, purpose);
  } catch (error) {
    try {
      await query("delete from auth_app.otp_codes where id = $1", [id]);
    } catch (cleanupError) {
      console.error("Failed to remove an unsent code", cleanupError);
    }
    throw error;
  }
}

export async function startSignup(emailInput: unknown, profileInput: unknown) {
  const email = normalizeEmail(emailInput);
  normalizeProfile(profileInput);
  const existing = await query<{ id: string }>(
    "select id from auth_app.users where email = $1",
    [email],
  );
  if (existing[0]) {
    throw new HttpError(409, "This email is already registered. Sign in instead.");
  }
  await sendEmailCode(email);
  return { ok: true as const };
}

export async function startLogin(emailInput: unknown, deviceId: string) {
  const email = normalizeEmail(emailInput);
  const account = await accountRecord(email, deviceId);
  if (!account) {
    throw new HttpError(404, "No account for that email yet. Create one first.");
  }
  const methods = methodsFrom(account);
  if (methods.passcode || methods.fingerprint || methods.passkey) {
    return { next: "challenge" as const, methods };
  }
  await sendEmailCode(email);
  return { next: "confirm" as const };
}

export async function startPasscodeReset(emailInput: unknown) {
  const email = normalizeEmail(emailInput);
  const existing = await query<{ id: string }>(
    "select id from auth_app.users where email = $1",
    [email],
  );
  if (!existing[0]) {
    throw new HttpError(404, "No account for that email yet.");
  }
  await sendEmailCode(email, "reset");
  return { ok: true as const };
}

export async function signInWithPasscode(
  emailInput: unknown,
  passcodeInput: unknown,
  deviceId: string,
) {
  const email = normalizeEmail(emailInput);
  const passcode = normalizePasscode(passcodeInput);

  const result = await withTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`signin:${email}`]);
    const found = await client.query<
      UserRow & { passcode_hash: string | null; passcode_attempts: number }
    >(
      `select ${USER_FIELDS}, passcode_hash, passcode_attempts
       from auth_app.users
       where email = $1
       for update`,
      [email],
    );
    const user = found.rows[0];
    if (!user?.passcode_hash) {
      return { ok: false as const, reason: "missing" as const };
    }
    if (user.passcode_attempts >= 5) {
      return { ok: false as const, reason: "locked" as const };
    }
    if (!hashesMatch(user.passcode_hash, hashSecret("passcode", passcode))) {
      const attempts = user.passcode_attempts + 1;
      await client.query(
        "update auth_app.users set passcode_attempts = $1 where id = $2",
        [attempts, user.id],
      );
      return {
        ok: false as const,
        reason: attempts >= 5 ? ("locked" as const) : ("wrong" as const),
      };
    }
    await client.query(
      `update auth_app.users
       set passcode_attempts = 0, last_login_at = now(), updated_at = now()
       where id = $1`,
      [user.id],
    );
    const session = await openSession(client, user, deviceId);
    return { ok: true as const, ...session };
  });

  if (!result.ok) {
    if (result.reason === "missing") {
      throw new HttpError(404, "No account for that email yet.");
    }
    if (result.reason === "locked") {
      throw new HttpError(401, "Too many attempts. Try again later.");
    }
    throw new HttpError(401, "That passcode is incorrect.");
  }
  return {
    token: result.token,
    user: result.user,
    locked: result.locked,
    methods: result.methods,
  };
}

export async function establishSession(userId: string, deviceId: string) {
  return withTransaction(async (client) => {
    const found = await client.query<UserRow>(
      `update auth_app.users
       set last_login_at = now(), updated_at = now(), passcode_attempts = 0
       where id = $1
       returning ${USER_FIELDS}`,
      [userId],
    );
    const user = found.rows[0];
    if (!user) {
      throw new HttpError(401, "Sign in to continue.");
    }
    return openSession(client, user, deviceId);
  });
}

async function consumeEmailCode(client: PoolClient, email: string, code: string) {
  const found = await client.query<{
    id: string;
    code_hash: string;
    active: boolean;
    attempt_count: number;
  }>(
    `select id, code_hash, (expires_at > now()) as active, attempt_count
     from auth_app.otp_codes
     where email = $1 and consumed_at is null
     order by created_at desc
     limit 1
     for update`,
    [email],
  );
  const row = found.rows[0];
  if (!row || !row.active || row.attempt_count >= 5) {
    if (row && !row.active) {
      await client.query("update auth_app.otp_codes set consumed_at = now() where id = $1", [
        row.id,
      ]);
    }
    return false;
  }
  if (!hashesMatch(row.code_hash, hashSecret("otp", code))) {
    await client.query(
      `update auth_app.otp_codes
       set attempt_count = attempt_count + 1,
           consumed_at = case when attempt_count + 1 >= 5 then now() else consumed_at end
       where id = $1`,
      [row.id],
    );
    return false;
  }
  await client.query("update auth_app.otp_codes set consumed_at = now() where id = $1", [row.id]);
  return true;
}

async function userByEmail(client: PoolClient, email: string, profile: SignupProfile | null) {
  const found = await client.query<UserRow>(
    `insert into auth_app.users (id, email, first_name, surname, date_of_birth, last_login_at)
     values ($1, $2, $3, $4, $5::date, now())
     on conflict (email)
     do update set
       last_login_at = now(),
       updated_at = now(),
       first_name = coalesce(users.first_name, excluded.first_name),
       surname = coalesce(users.surname, excluded.surname),
       date_of_birth = coalesce(users.date_of_birth, excluded.date_of_birth)
     returning ${USER_FIELDS}`,
    [
      randomUUID(),
      email,
      profile?.firstName ?? null,
      profile?.surname ?? null,
      profile?.dateOfBirth ?? null,
    ],
  );
  const user = found.rows[0];
  if (!user) throw new Error("User row was not returned.");
  return user;
}

export async function verifyOtp(
  emailInput: unknown,
  codeInput: unknown,
  deviceId: string,
  profileInput: unknown,
) {
  const email = normalizeEmail(emailInput);
  const code = normalizeCode(codeInput);
  const result = await withTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`verify:${email}`]);
    const existing = await client.query<{ id: string }>(
      "select id from auth_app.users where email = $1",
      [email],
    );
    const profile = existing.rows[0] ? null : normalizeProfile(profileInput);
    if (!(await consumeEmailCode(client, email, code))) return { ok: false as const };
    const user = await userByEmail(client, email, profile);
    const session = await openSession(client, user, deviceId, false);
    return { ok: true as const, ...session };
  });
  if (!result.ok) {
    throw new HttpError(401, "That code is incorrect or has expired.");
  }
  return {
    token: result.token,
    user: result.user,
    locked: result.locked,
    methods: result.methods,
  };
}

export async function getSession(token: string | null) {
  return toClientState(await requireSession(token));
}

async function savePasscode(client: PoolClient, userId: string, passcode: string) {
  await client.query(
    `update auth_app.users
     set passcode_hash = $1, passcode_attempts = 0, updated_at = now()
     where id = $2`,
    [hashSecret("passcode", passcode), userId],
  );
}

export async function setupPasscode(token: string | null, passcodeInput: unknown) {
  const session = await requireSession(token);
  if (session.hasPasscode) {
    throw new HttpError(400, "A passcode is already set. Reset it from the sign-in page.");
  }
  const passcode = normalizePasscode(passcodeInput);
  await withTransaction(async (client) => {
    await savePasscode(client, session.user.id, passcode);
    await client.query("update auth_app.sessions set unlocked_at = now() where id = $1", [
      session.sessionId,
    ]);
  });
  return getSession(token);
}

export async function resetPasscode(
  emailInput: unknown,
  codeInput: unknown,
  passcodeInput: unknown,
  deviceId: string,
) {
  const email = normalizeEmail(emailInput);
  const code = normalizeCode(codeInput);
  const passcode = normalizePasscode(passcodeInput);
  const result = await withTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`verify:${email}`]);
    const found = await client.query<UserRow>(
      `select ${USER_FIELDS}
       from auth_app.users
       where email = $1
       for update`,
      [email],
    );
    const user = found.rows[0];
    if (!user) return { ok: false as const, reason: "missing" as const };
    if (!(await consumeEmailCode(client, email, code))) {
      return { ok: false as const, reason: "code" as const };
    }
    await savePasscode(client, user.id, passcode);
    const session = await openSession(client, user, deviceId);
    return { ok: true as const, ...session };
  });
  if (!result.ok) {
    if (result.reason === "missing") {
      throw new HttpError(404, "No account for that email yet.");
    }
    throw new HttpError(401, "That code is incorrect or has expired.");
  }
  return {
    token: result.token,
    user: result.user,
    locked: result.locked,
    methods: result.methods,
  };
}

export async function logout(token: string | null) {
  if (token) {
    await query("delete from auth_app.sessions where token_hash = $1", [
      hashSecret("session", token),
    ]);
  }
  return { ok: true as const };
}
