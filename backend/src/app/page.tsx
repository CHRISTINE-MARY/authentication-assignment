export default function Home() {
  return (
    <main className="page">
      <p className="eyebrow">Auth API</p>
      <h1>Authentication service</h1>
      <p>
        This server emails a one-time sign-in code and stores users, codes,
        and sessions in Supabase.
      </p>
      <ul>
        <li>POST /api/auth/request-otp</li>
        <li>POST /api/auth/verify-otp</li>
        <li>GET /api/auth/me</li>
        <li>POST /api/auth/logout</li>
      </ul>
    </main>
  );
}
