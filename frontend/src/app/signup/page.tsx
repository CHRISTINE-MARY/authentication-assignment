import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { SignupForm } from "@/components/signup-form";

export const metadata: Metadata = {
  title: "Create account",
  description: "Confirm your email, then set a fingerprint, passkey, or passcode.",
};

export default function SignupPage() {
  return (
    <AuthShell>
      <SignupForm />
    </AuthShell>
  );
}
