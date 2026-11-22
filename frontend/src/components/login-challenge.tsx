"use client";

import { useState, type FormEvent } from "react";
import {
  signInWithFingerprint,
  signInWithPasscode,
  type LockMethods,
  type SessionState,
} from "@/lib/api";

import { sensorError } from "@/lib/errors";

export function LoginChallenge({
  email,
  methods,
  onSignedIn,
  onUseOtherEmail,
  onResetPasscode,
}: {
  email: string;
  methods: LockMethods;
  onSignedIn: (state: SessionState & { token: string }) => void;
  onUseOtherEmail: () => void;
  onResetPasscode: () => void;
}) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"sensor" | "passcode" | null>(null);

  async function onSensor() {
    setError(null);
    setBusy("sensor");
    try {
      onSignedIn(await signInWithFingerprint(email));
    } catch (caught) {
      setError(sensorError(caught, "The device check could not be completed."));
    } finally {
      setBusy(null);
    }
  }

  async function onPasscode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy("passcode");
    try {
      onSignedIn(await signInWithPasscode(email, passcode));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not check the passcode.");
    } finally {
      setBusy(null);
    }
  }

  const sensorLabel = methods.fingerprint ? "Use fingerprint" : "Use passkey";

  return (
    <section className="step-enter w-full max-w-md rounded-3xl border border-line bg-paper px-6 py-8 shadow-[0_20px_50px_rgba(28,25,21,0.06)] sm:px-8">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">Login</p>
      <h1 className="mt-3 text-[2rem] font-medium leading-tight tracking-tight">Sign in</h1>
      <p className="mt-3 break-all text-sm leading-6 text-ink">{email}</p>
      <p className="mt-2 text-sm leading-6 text-muted">
        Only a fingerprint or passkey saved for this account can be used. The laptop finger by itself does not sign in another account.
      </p>
      {methods.fingerprint || methods.passkey ? (
        <button
          type="button"
          className="pressable pressable-accent mt-8 h-12 w-full rounded-full bg-accent font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onSensor}
          disabled={busy !== null}
        >
          {busy === "sensor" ? "Waiting for this device…" : sensorLabel}
        </button>
      ) : null}
      {methods.passcode ? (
        <form className="mt-6" onSubmit={onPasscode} aria-busy={busy === "passcode"}>
          <label htmlFor="passcode" className="text-sm font-medium">
            Passcode
          </label>
          <input
            id="passcode"
            name="passcode"
            className="mt-2 h-14 w-full rounded-2xl border border-line bg-white px-4 text-center font-mono text-2xl tracking-[0.4em] text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            maxLength={6}
            value={passcode}
            aria-invalid={error ? true : undefined}
            onChange={(event) => setPasscode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          <button
            type="submit"
            className="pressable mt-6 h-12 w-full rounded-full border border-line bg-white font-medium disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy !== null || passcode.length !== 6}
          >
            {busy === "passcode" ? "Checking…" : "Sign in with passcode"}
          </button>
        </form>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex items-center justify-between text-sm">
        <button
          type="button"
          className="text-muted underline-offset-4 hover:underline"
          onClick={onResetPasscode}
        >
          Reset passcode
        </button>
        <button
          type="button"
          className="text-muted underline-offset-4 hover:underline"
          onClick={onUseOtherEmail}
        >
          Use a different email
        </button>
      </div>
    </section>
  );
}
