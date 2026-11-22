"use client";

import { useEffect, useState } from "react";
import {
  fingerprintAvailable,
  logout,
  registerFingerprint,
  TOKEN_KEY,
  type AuthUser,
  type LockMethods,
} from "@/lib/api";
import { sensorError } from "@/lib/errors";

function formatWhen(value: string | null) {
  if (!value) return "Just now";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SignedIn({
  user,
  methods,
  onDone,
  onMethods,
}: {
  user: AuthUser;
  methods: LockMethods;
  onDone: () => void;
  onMethods: (methods: LockMethods) => void;
}) {
  const [current, setCurrent] = useState(methods);
  const [sensor, setSensor] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrent(methods);
  }, [methods]);

  useEffect(() => {
    fingerprintAvailable().then(setSensor);
  }, []);

  const needsFingerprint = !current.fingerprint && !current.passkey;

  async function onAddFingerprint(kind: "fingerprint" | "passkey") {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) return;
    setError(null);
    setSaving(true);
    try {
      const next = await registerFingerprint(token, kind);
      setCurrent(next.methods);
      onMethods(next.methods);
    } catch (caught) {
      setError(sensorError(caught, "This device could not save the fingerprint."));
    } finally {
      setSaving(false);
    }
  }

  async function onLogout() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    setPending(true);
    try {
      if (token) await logout(token);
    } catch {
      // The local session is cleared either way.
    } finally {
      sessionStorage.removeItem(TOKEN_KEY);
      onDone();
      setPending(false);
    }
  }

  return (
    <section className="step-enter w-full max-w-md rounded-3xl border border-line bg-paper px-6 py-8 shadow-[0_20px_50px_rgba(28,25,21,0.06)] sm:px-8">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">Signed in</p>
      <h1 className="mt-3 text-[2rem] font-medium leading-tight tracking-tight">Welcome back</h1>
      {user.firstName || user.surname ? (
        <p className="mt-3 text-base text-ink">
          {[user.firstName, user.surname].filter(Boolean).join(" ")}
        </p>
      ) : null}
      {user.dateOfBirth ? (
        <p className="mt-1 text-sm text-muted">
          Born {user.dateOfBirth.split("-").reverse().join("/")}
        </p>
      ) : null}
      <p className="mt-3 break-all text-base text-ink">{user.email}</p>
      <p className="mt-2 text-sm text-muted">Last sign-in {formatWhen(user.lastLoginAt)}</p>
      <p className="mt-2 text-sm text-muted">
        Only this device stays signed in. Opening the account somewhere else signs this one out.
      </p>
      {current.fingerprint ? (
        <p className="mt-4 text-sm text-ink">Fingerprint is saved for this account on this device.</p>
      ) : null}
      {current.passkey ? (
        <p className="mt-4 text-sm text-ink">A passkey is saved for this account on this device.</p>
      ) : null}
      {needsFingerprint ? (
        <div className="mt-6">
          <p className="text-sm leading-6 text-muted">
            This account only has a passcode. You can add a fingerprint for this device now.
          </p>
          {error ? (
            <p className="mt-3 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            className="pressable mt-4 h-12 w-full rounded-full border border-line bg-white font-medium disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => onAddFingerprint("fingerprint")}
            disabled={pending || saving || sensor === null}
          >
            {saving ? "Waiting for this device…" : "Add fingerprint"}
          </button>
          {sensor === false ? (
            <button
              type="button"
              className="pressable mt-3 h-12 w-full rounded-full border border-line bg-white font-medium disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => onAddFingerprint("passkey")}
              disabled={pending || saving}
            >
              Set up passkey
            </button>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        className="pressable pressable-accent mt-8 h-12 w-full rounded-full bg-accent font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onLogout}
        disabled={pending || saving}
      >
        {pending ? "Logging out…" : "Log out"}
      </button>
    </section>
  );
}
