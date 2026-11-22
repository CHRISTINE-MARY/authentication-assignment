import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";

export default function Home() {
  return (
    <AuthShell>
      <LoginForm />
    </AuthShell>
  );
}
