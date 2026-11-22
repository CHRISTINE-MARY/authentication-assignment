"use client";

import type { FormEvent } from "react";

export function CodeForm({
  email,
  eyebrow,
  title,
  detail,
  code,
  error,
  pending,
  cooldown,
  submitLabel,
  onCode,
  onSubmit,
  onResend,
  onChangeEmail,
}: {
  email: string;
  eyebrow: string;
  title: string;
  detail: string;
  code: string;
  error: string | null;
  pending: boolean;
  cooldown: number;
  submitLabel: string;
  onCode: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onResend: () => void;
  onChangeEmail: () => void;
}) {
  return (
    <section className="step-enter w-full max-w-md rounded-3xl border border-line bg-paper px-6 py-8 shadow-[0_20px_50px_rgba(28,25,21,0.06)] sm:px-8">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{eyebrow}</p>
      <h1 className="mt-3 text-[2rem] font-medium leading-tight tracking-tight">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        {detail} <span className="break-all text-ink">{email}</span>
      </p>
      <form className="mt-8" onSubmit={onSubmit} aria-busy={pending}>
        <label htmlFor="code" className="text-sm font-medium">
          Confirmation code
        </label>
        <input
          id="code"
          name="code"
          className="mt-2 h-14 w-full rounded-2xl border border-line bg-white px-4 text-center font-mono text-2xl tracking-[0.4em] text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          inputMode="numeric"
          autoComplete="one-time-code"
          spellCheck={false}
          maxLength={6}
          value={code}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        {error ? (
          <p className="mt-3 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="pressable pressable-accent mt-6 h-12 w-full rounded-full bg-accent font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending || code.length !== 6}
        >
          {pending ? "Checking…" : submitLabel}
        </button>
      </form>
      <div className="mt-4 flex items-center justify-between text-sm">
        <button
          type="button"
          className="text-muted underline-offset-4 hover:underline disabled:opacity-50"
          onClick={onResend}
          disabled={pending || cooldown > 0}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
        <button
          type="button"
          className="text-muted underline-offset-4 hover:underline"
          onClick={onChangeEmail}
        >
          Use a different email
        </button>
      </div>
    </section>
  );
}
