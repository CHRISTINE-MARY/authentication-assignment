"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  fingerprintAvailable,
  logout,
  registerFingerprint,
  setupPasscode,
  TOKEN_KEY,
  type SessionState,
} from "@/lib/api";

import { sensorError } from "@/lib/errors";

export function SetupMethods({
  onReady,
  onLeave,
}: {
  onReady: (state: SessionState) => void;
  onLeave: () => void;
}) {
  const [sensor, setSensor] = useState<boolean | null>(null);
  const [passcode, setPasscode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saved, setSaved] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"sensor" | "passcode" | "leave" | null>(null);

  useEffect(() => {
    fingerprintAvailable().then(setSensor);
  }, []);

  const methods = saved?.methods ?? { passcode: false, fingerprint: false, passkey: false };

  async function onDevice(kind: "fingerprint" | "passkey") {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) return;
    setError(null);
    setBusy("sensor");
    try {
      const next = await registerFingerprint(token, kind);
      setSaved(next);
    } catch (caught) {
      setError(sensorError(caught, "This device could not save the sign-in method."));
    } finally {
      setBusy(null);
    }
  }

  async function onPasscode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) return;
    if (passcode !== confirm) {
      setError("Those passcodes do not match.");
      return;
    }
    setError(null);
    setBusy("passcode");
    try {
      const next = await setupPasscode(token, passcode);
      setSaved(next);
      setPasscode("");
      setConfirm("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the passcode.");
    } finally {
      setBusy(null);
    }
  }

  async function onLeaveClick() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    setBusy("leave");
    try {
      if (token) await logout(token);
    } catch {
      // Local sign-out still returns to login.
    } finally {
      sessionStorage.removeItem(TOKEN_KEY);
      onLeave();
    }
  }

  return (
    <section className="step-enter w-full max-w-md rounded-3xl border border-line bg-paper px-6 py-8 shadow-[0_20px_50px_rgba(28,25,21,0.06)] sm:px-8">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">This device</p>
      <h1 className="mt-3 text-[2rem] font-medium leading-tight tracking-tight">
        {sensor === false ? "Set up this device" : "Set up fingerprint"}
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        {sensor === false
          ? "Use the fingerprint reader if this laptop has one. Otherwise save a passkey, or choose a passcode."
          : "A fingerprint reader is available. Windows Hello opens next. If a PIN box appears, choose the fingerprint icon."}
      </p>
      {methods.fingerprint ? (
        <p className="mt-3 text-sm text-ink">Fingerprint saved on this device.</p>
      ) : null}
      {methods.passkey ? <p className="mt-3 text-sm text-ink">Passkey saved on this device.</p> : null}
      {methods.passcode ? <p className="mt-3 text-sm text-ink">Passcode saved.</p> : null}
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="pressable pressable-accent mt-8 h-12 w-full rounded-full bg-accent font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => onDevice("fingerprint")}
        disabled={busy !== null || sensor === null || methods.fingerprint || methods.passkey}
      >
        {sensor === null
          ? "Checking this device…"
          : busy === "sensor"
            ? "Waiting for this device…"
            : "Use fingerprint"}
      </button>
      {sensor === false ? (
        <button
          type="button"
          className="pressable mt-3 h-12 w-full rounded-full border border-line bg-white font-medium disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => onDevice("passkey")}
          disabled={busy !== null || methods.fingerprint || methods.passkey}
        >
          Set up passkey
        </button>
      ) : null}
      {methods.passcode ? null : (
        <form className="mt-6" onSubmit={onPasscode}>
          <p className="text-sm font-medium">Or set a 6-digit passcode</p>
          <label htmlFor="new-passcode" className="mt-3 block text-sm text-muted">
            Passcode
          </label>
          <input
            id="new-passcode"
            className="mt-2 h-12 w-full rounded-2xl border border-line bg-white px-4 text-center font-mono text-xl tracking-[0.35em] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={6}
            value={passcode}
            onChange={(event) => setPasscode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          <label htmlFor="confirm-passcode" className="mt-3 block text-sm text-muted">
            Confirm passcode
          </label>
          <input
            id="confirm-passcode"
            className="mt-2 h-12 w-full rounded-2xl border border-line bg-white px-4 text-center font-mono text-xl tracking-[0.35em] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={6}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          <button
            type="submit"
            className="pressable mt-4 h-12 w-full rounded-full border border-line bg-white font-medium disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy !== null || passcode.length !== 6 || confirm.length !== 6}
          >
            {busy === "passcode" ? "Saving…" : "Save passcode"}
          </button>
        </form>
      )}
      {saved ? (
        <button
          type="button"
          className="pressable pressable-accent mt-4 h-12 w-full rounded-full bg-accent font-medium text-white"
          onClick={() => onReady(saved)}
        >
          Continue
        </button>
      ) : null}
      <button
        type="button"
        className="mt-4 text-sm text-muted underline-offset-4 hover:underline disabled:opacity-50"
        onClick={onLeaveClick}
        disabled={busy !== null}
      >
        Not now
      </button>
    </section>
  );
}
