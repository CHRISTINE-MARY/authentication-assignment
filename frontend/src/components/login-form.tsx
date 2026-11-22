"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { CodeForm } from "@/components/code-form";
import { LoginChallenge } from "@/components/login-challenge";
import { SetupMethods } from "@/components/setup-methods";
import { SignedIn } from "@/components/signed-in";
import {
  getMe,
  hasMethod,
  startLogin,
  TOKEN_KEY,
  verifyOtp,
  type AuthUser,
  type LockMethods,
  type SessionState,
} from "@/lib/api";
import { ResetPasscode } from "@/components/reset-passcode";

type Step = "email" | "code" | "challenge" | "setup" | "session" | "reset";

export function LoginForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [methods, setMethods] = useState<LockMethods>({
    passcode: false,
    fingerprint: false,
    passkey: false,
  });
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) {
      setChecking(false);
      return;
    }
    getMe(token)
      .then((state) => {
        setUser(state.user);
        setMethods(state.methods);
        setStep(hasMethod(state.methods) ? "session" : "setup");
      })
      .catch(() => sessionStorage.removeItem(TOKEN_KEY))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  function applySession(state: SessionState & { token?: string }) {
    if (state.token) sessionStorage.setItem(TOKEN_KEY, state.token);
    setUser(state.user);
    setMethods(state.methods);
    setStep(hasMethod(state.methods) ? "session" : "setup");
  }

  async function onEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await startLogin(email);
      if (result.next === "challenge") {
        setMethods(result.methods);
        setStep("challenge");
        return;
      }
      setCode("");
      setStep("code");
      setCooldown(60);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not look up that email.");
    } finally {
      setPending(false);
    }
  }

  async function onCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      applySession(await verifyOtp(email, code));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not check that code.");
    } finally {
      setPending(false);
    }
  }

  async function onResend() {
    if (cooldown > 0) return;
    setError(null);
    setPending(true);
    try {
      await startLogin(email);
      setCooldown(60);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not resend the code.");
    } finally {
      setPending(false);
    }
  }

  if (checking) {
    return (
      <section className="w-full max-w-md rounded-3xl border border-line bg-paper px-6 py-8 sm:px-8">
        <p className="text-sm text-muted">Checking this device…</p>
      </section>
    );
  }

  if (step === "session" && user) {
    return (
      <SignedIn
        user={user}
        methods={methods}
        onMethods={setMethods}
        onDone={() => {
          setUser(null);
          setStep("email");
        }}
      />
    );
  }

  if (step === "setup") {
    return (
      <SetupMethods
        onReady={(state) => applySession(state)}
        onLeave={() => {
          setUser(null);
          setStep("email");
        }}
      />
    );
  }

  if (step === "challenge") {
    return (
      <LoginChallenge
        email={email}
        methods={methods}
        onSignedIn={applySession}
        onUseOtherEmail={() => {
          setStep("email");
          setError(null);
        }}
        onResetPasscode={() => {
          setCode("");
          setError(null);
          setStep("reset");
        }}
      />
    );
  }

  if (step === "reset") {
    return (
      <ResetPasscode
        email={email}
        onDone={applySession}
        onBack={() => setStep("challenge")}
      />
    );
  }

  if (step === "code") {
    return (
      <CodeForm
        email={email}
        eyebrow="Finish setup"
        title="Enter the code"
        detail="This account has no fingerprint, passkey, or passcode yet. We emailed a code to"
        code={code}
        error={error}
        pending={pending}
        cooldown={cooldown}
        submitLabel="Continue"
        onCode={setCode}
        onSubmit={onCode}
        onResend={onResend}
        onChangeEmail={() => {
          setStep("email");
          setError(null);
          setCode("");
        }}
      />
    );
  }

  return (
    <section className="step-enter w-full max-w-md rounded-3xl border border-line bg-paper px-6 py-8 shadow-[0_20px_50px_rgba(28,25,21,0.06)] sm:px-8">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">Login</p>
      <h1 className="mt-3 text-[2rem] font-medium leading-tight tracking-tight">Sign in</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        For an account that already exists. If a fingerprint, passkey, or passcode is set, that is the only step.
      </p>
      <form className="mt-8" onSubmit={onEmail} aria-busy={pending}>
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-2 h-12 w-full rounded-2xl border border-line bg-white px-4 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          value={email}
          aria-invalid={error ? true : undefined}
          onChange={(event) => setEmail(event.target.value)}
        />
        {error ? (
          <p className="mt-3 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="pressable pressable-accent mt-6 h-12 w-full rounded-full bg-accent font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending || !email.includes("@")}
        >
          {pending ? "Checking…" : "Continue"}
        </button>
      </form>
      <p className="mt-4 text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="text-ink underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </section>
  );
}
