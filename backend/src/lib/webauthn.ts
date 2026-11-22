import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { randomUUID } from "node:crypto";
import { establishSession, getSession, normalizeEmail, requireSession } from "./auth";
import { HttpError } from "./http";
import { query } from "./supabase";

function relyingParty() {
  return {
    rpName: process.env.WEBAUTHN_RP_NAME || "Sign in",
    rpID: process.env.WEBAUTHN_RP_ID || "localhost",
    origin: process.env.WEBAUTHN_ORIGIN || process.env.FRONTEND_ORIGIN || "http://localhost:3000",
  };
}

function asResponse(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "The fingerprint response was incomplete.");
  }
  return value;
}

async function saveChallenge(userId: string, challenge: string, kind: "register" | "authenticate") {
  await query(
    "delete from auth_app.webauthn_challenges where user_id = $1 and kind = $2",
    [userId, kind],
  );
  await query(
    `insert into auth_app.webauthn_challenges (id, user_id, challenge, kind, expires_at)
     values ($1, $2, $3, $4, now() + interval '5 minutes')`,
    [randomUUID(), userId, challenge, kind],
  );
}

async function takeChallenge(userId: string, kind: "register" | "authenticate") {
  const rows = await query<{ id: string; challenge: string }>(
    `select id, challenge
     from auth_app.webauthn_challenges
     where user_id = $1 and kind = $2 and expires_at > now()
     order by created_at desc
     limit 1`,
    [userId, kind],
  );
  const row = rows[0];
  if (!row) {
    throw new HttpError(400, "Fingerprint verification expired. Try again.");
  }
  await query("delete from auth_app.webauthn_challenges where id = $1", [row.id]);
  return row.challenge;
}

type StoredCredential = {
  id: string;
  public_key: Buffer;
  counter: string | number;
  transports: string[] | null;
  kind: string | null;
};

async function credentialsOnDevice(deviceId: string) {
  return query<{ id: string; transports: string[] | null }>(
    `select id, transports from auth_app.webauthn_credentials where device_id = $1`,
    [deviceId],
  );
}

function presentedCredential(response: AuthenticationResponseJSON, credential: StoredCredential, userId: string) {
  if (response.id !== credential.id) {
    throw new HttpError(401, "This fingerprint is saved for a different account.");
  }
  const handle = response.response.userHandle;
  if (!handle) return;
  const decoded = Buffer.from(handle, "base64url").toString("utf8");
  if (decoded !== userId) {
    throw new HttpError(401, "This fingerprint is saved for a different account.");
  }
}

async function verifyAssertion(
  response: unknown,
  credential: StoredCredential,
  challenge: string,
  userId: string,
) {
  const payload = asResponse(response) as AuthenticationResponseJSON;
  presentedCredential(payload, credential, userId);
  const { rpID, origin } = relyingParty();
  try {
    const verified = await verifyAuthenticationResponse({
      response: payload,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: credential.id,
        publicKey: new Uint8Array(credential.public_key),
        counter: Number(credential.counter),
        transports: credential.transports ?? undefined,
      },
    });
    if (!verified.verified || !verified.authenticationInfo.userVerified) {
      throw new HttpError(401, "Fingerprint could not be verified.");
    }
    await query(
      "update auth_app.webauthn_credentials set counter = $1 where id = $2 and user_id = $3",
      [verified.authenticationInfo.newCounter, credential.id, userId],
    );
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error("Fingerprint verification failed", error);
    throw new HttpError(401, "Fingerprint could not be verified.");
  }
}

async function credentialForDevice(userId: string, deviceId: string) {
  const rows = await query<StoredCredential>(
    `select id, public_key, counter, transports, kind
     from auth_app.webauthn_credentials
     where user_id = $1 and device_id = $2
     order by created_at desc
     limit 1`,
    [userId, deviceId],
  );
  return rows[0] ?? null;
}

export async function fingerprintRegisterOptions(
  token: string | null,
  kindInput: unknown,
) {
  const session = await requireSession(token);
  const kind = kindInput === "passkey" ? "passkey" : "fingerprint";
  const { rpID, rpName } = relyingParty();
  const existing = await credentialsOnDevice(session.deviceId);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: session.user.email,
    userID: new TextEncoder().encode(session.user.id),
    userDisplayName:
      [session.user.firstName, session.user.surname].filter(Boolean).join(" ") ||
      session.user.email,
    attestationType: "none",
    ...(kind === "fingerprint" ? { preferredAuthenticatorType: "localDevice" as const } : {}),
    authenticatorSelection: {
      ...(kind === "fingerprint" ? { authenticatorAttachment: "platform" as const } : {}),
      userVerification: "required",
      residentKey: "required",
    },
    excludeCredentials: existing.map((credential) => ({
      id: credential.id,
      transports: credential.transports ?? undefined,
    })),
  });
  await saveChallenge(session.user.id, options.challenge, "register");
  return options;
}

export async function fingerprintRegister(
  token: string | null,
  response: unknown,
  kindInput: unknown,
) {
  const session = await requireSession(token);
  const challenge = await takeChallenge(session.user.id, "register");
  const { rpID, origin } = relyingParty();
  let verified;
  try {
    verified = await verifyRegistrationResponse({
      response: asResponse(response) as RegistrationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch (error) {
    console.error("Fingerprint registration failed", error);
    throw new HttpError(401, "Fingerprint could not be verified.");
  }
  if (!verified.verified || !verified.registrationInfo.userVerified) {
    throw new HttpError(401, "Fingerprint could not be verified.");
  }
  const kind = kindInput === "passkey" ? "passkey" : "fingerprint";
  const credential = verified.registrationInfo.credential;
  const owner = await query<{ user_id: string }>(
    "select user_id from auth_app.webauthn_credentials where id = $1",
    [credential.id],
  );
  if (owner[0] && owner[0].user_id !== session.user.id) {
    throw new HttpError(401, "This fingerprint is already saved for a different account.");
  }
  await query("delete from auth_app.webauthn_credentials where user_id = $1", [
    session.user.id,
  ]);
  await query(
    `insert into auth_app.webauthn_credentials
       (id, user_id, device_id, public_key, counter, transports, kind)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      credential.id,
      session.user.id,
      session.deviceId,
      Buffer.from(credential.publicKey),
      credential.counter,
      credential.transports ?? [],
      kind,
    ],
  );
  await query(
    "update auth_app.sessions set unlocked_at = now() where id = $1",
    [session.sessionId],
  );
  return getSession(token);
}

async function authenticationOptions(userId: string, credential: StoredCredential) {
  const { rpID } = relyingParty();
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: [
      { id: credential.id, transports: credential.transports ?? undefined },
    ],
  });
  await saveChallenge(userId, options.challenge, "authenticate");
  return options;
}

async function userForFingerprint(emailInput: unknown, deviceId: string) {
  const email = normalizeEmail(emailInput);
  const rows = await query<{ id: string }>(
    "select id from auth_app.users where email = $1",
    [email],
  );
  const user = rows[0];
  if (!user) {
    throw new HttpError(404, "No account for that email yet.");
  }
  const credential = await credentialForDevice(user.id, deviceId);
  if (!credential) {
    throw new HttpError(400, "Fingerprint is not saved for this account.");
  }
  return { userId: user.id, credential };
}

export async function signInFingerprintOptions(emailInput: unknown, deviceId: string) {
  const { userId, credential } = await userForFingerprint(emailInput, deviceId);
  return authenticationOptions(userId, credential);
}

export async function signInFingerprintVerify(
  emailInput: unknown,
  deviceId: string,
  response: unknown,
) {
  const { userId, credential } = await userForFingerprint(emailInput, deviceId);
  const challenge = await takeChallenge(userId, "authenticate");
  await verifyAssertion(response, credential, challenge, userId);
  return establishSession(userId, deviceId);
}
