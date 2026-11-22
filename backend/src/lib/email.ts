import nodemailer from "nodemailer";
import { HttpError } from "./http";

function messageFor(code: string, purpose: "confirm" | "reset") {
  if (purpose === "reset") {
    const text = `Your passcode reset code is ${code}. It expires in 10 minutes. After you enter it, choose a new passcode.`;
    const html = `<p>Your passcode reset code is</p><p style="font-size:28px;letter-spacing:0.35em;font-family:ui-monospace,monospace;"><strong>${code}</strong></p><p>It expires in 10 minutes. After you enter it, choose a new passcode.</p>`;
    return { subject: "Reset your passcode", text, html };
  }
  const text = `Your confirmation code is ${code}. It expires in 10 minutes. After you enter it, set a fingerprint, passkey, or passcode for later sign-in.`;
  const html = `<p>Your confirmation code is</p><p style="font-size:28px;letter-spacing:0.35em;font-family:ui-monospace,monospace;"><strong>${code}</strong></p><p>It expires in 10 minutes. After you enter it, set a fingerprint, passkey, or passcode for later sign-in.</p>`;
  return { subject: "Confirm your email", text, html };
}

function usingResend() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

function usingSmtp() {
  return Boolean(process.env.SMTP_HOST && process.env.EMAIL_FROM);
}

async function sendViaResend(to: string, code: string, purpose: "confirm" | "reset") {
  const message = messageFor(code, purpose);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("Resend rejected the sign-in email", response.status, detail);
    throw new HttpError(
      503,
      "We couldn't send the email. Try again in a moment.",
    );
  }
}

async function sendViaSmtp(to: string, code: string, purpose: "confirm" | "reset") {
  const message = messageFor(code, purpose);
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD?.replace(/\s/g, ""),
        }
      : undefined,
  });

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } catch (error) {
    console.error("SMTP failed to send the sign-in email", error);
    throw new HttpError(
      503,
      "We couldn't send the email. Try again in a moment.",
    );
  }
}

export async function sendOtpEmail(
  to: string,
  code: string,
  purpose: "confirm" | "reset" = "confirm",
) {
  if (usingResend()) {
    await sendViaResend(to, code, purpose);
    return;
  }
  if (usingSmtp()) {
    await sendViaSmtp(to, code, purpose);
    return;
  }
  throw new HttpError(
    503,
    "Email delivery is not configured yet. Add Resend or SMTP settings in the backend environment.",
  );
}
