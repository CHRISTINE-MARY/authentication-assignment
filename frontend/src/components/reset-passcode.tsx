"use client";

import { useEffect, useState, type FormEvent } from "react";
import { resetPasscode, startPasscodeReset, type SessionState } from "@/lib/api";

export function ResetPasscode({
  email,
  onDone,
  onBack,
}: {
  email: string;
  onDone: (state: SessionState & { token: string }) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [passcode, setPasscode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  async function sendCode() {
    setError(null);
    setPending(true);
    try {
      await startPasscodeReset(email);
      setCooldown(60);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not email a reset code.");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    const key = `auth.reset.${email}`;
    if (sessionStorage.getItem(key) === "1") return;
    sessionStorage.setItem(key, "1");
    void sendCode();
    return () => {
      window.setTimeout(() => sessionStorage.removeItem(key), 1200);
    };
  }, [email]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passcode !== confirm) {
      setError("Those passcodes do not match.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      onDone(await resetPasscode(email, code, passcode));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reset the passcode.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="step-enter w-full max-w-md rounded-3xl border border-line bg-paper px-6 py-8 shadow-[0_20px_50px_rgba(28,25,21,0.06)] sm:px-8">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">Reset passcode</p>
      <h1 className="mt-3 text-[2rem] font-medium leading-tight tracking-tight">Choose a new passcode</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        We emailed a code to <span className="break-all text-ink">{email}</span>. Enter it, then choose the passcode you will use next time.
      </p>
      <form className="mt-8" onSubmit={onSubmit} aria-busy={pending}>
        <label htmlFor="reset-code" className="text-sm font-medium">
          Email code
        </label>
        <input
          id="reset-code"
          className="mt-2 h-12 w-full rounded-2xl border border-line bg-white px-4 text-center font-mono text-xl tracking-[0.35em] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        <label htmlFor="reset-passcode" className="mt-4 block text-sm font-medium">
          New passcode
        </label>
        <input
          id="reset-passcode"
          className="mt-2 h-12 w-full rounded-2xl border border-line bg-white px-4 text-center font-mono text-xl tracking-[0.35em] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          value={passcode}
          onChange={(event) => setPasscode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        <label htmlFor="reset-confirm" className="mt-4 block text-sm font-medium">
          Confirm passcode
        </label>
        <input
          id="reset-confirm"
          className="mt-2 h-12 w-full rounded-2xl border border-line bg-white px-4 text-center font-mono text-xl tracking-[0.35em] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        {error ? (
          <p className="mt-3 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="pressable pressable-accent mt-6 h-12 w-full rounded-full bg-accent font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending || code.length !== 6 || passcode.length !== 6 || confirm.length !== 6}
        >
          {pending ? "Saving…" : "Save passcode"}
        </button>
      </form>
      <div className="mt-4 flex items-center justify-between text-sm">
        <button
          type="button"
          className="text-muted underline-offset-4 hover:underline disabled:opacity-50"
          onClick={sendCode}
          disabled={pending || cooldown > 0}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
        <button type="button" className="text-muted underline-offset-4 hover:underline" onClick={onBack}>
          Back
        </button>
      </div>
    </section>
  );
}
