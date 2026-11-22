# Authentication app

Two Next.js apps. `frontend` is the site, styled with Tailwind. `backend` is the API. Accounts are stored in Supabase Postgres, in the `auth_app` schema.

Signup saves the name, date of birth, and email, then emails a code. After the code is confirmed, the API stores a fingerprint, passkey, or passcode. Sign-in asks only for what was stored. A new sign-in closes the previous device.

```bash
cd frontend
npm run dev
```

Site: http://localhost:3000

```bash
cd backend
npm run dev
```

API: http://localhost:3001

Copy `.env.example` to `.env` in `backend`, and to `.env.local` in `frontend`, before starting.
