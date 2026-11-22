create schema if not exists auth_app;

create table if not exists auth_app.users (
  id uuid primary key,
  email text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists auth_app.otp_codes (
  id uuid primary key,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists otp_codes_email_created_idx
  on auth_app.otp_codes (email, created_at desc);

create table if not exists auth_app.sessions (
  id uuid primary key,
  user_id uuid not null references auth_app.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table auth_app.users enable row level security;
alter table auth_app.otp_codes enable row level security;
alter table auth_app.sessions enable row level security;

alter table auth_app.users add column if not exists passcode_hash text;
alter table auth_app.users add column if not exists passcode_attempts integer not null default 0;

alter table auth_app.sessions add column if not exists device_id text;
alter table auth_app.sessions add column if not exists unlocked_at timestamptz;

create table if not exists auth_app.webauthn_credentials (
  id text primary key,
  user_id uuid not null references auth_app.users (id) on delete cascade,
  device_id text not null,
  public_key bytea not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  kind text not null default 'fingerprint',
  created_at timestamptz not null default now()
);

alter table auth_app.webauthn_credentials
  add column if not exists kind text not null default 'fingerprint';

create index if not exists webauthn_credentials_user_device_idx
  on auth_app.webauthn_credentials (user_id, device_id);

create table if not exists auth_app.webauthn_challenges (
  id uuid primary key,
  user_id uuid not null references auth_app.users (id) on delete cascade,
  challenge text not null,
  kind text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table auth_app.webauthn_credentials enable row level security;
alter table auth_app.webauthn_challenges enable row level security;

revoke all on schema auth_app from public, anon, authenticated;
revoke all on all tables in schema auth_app from public, anon, authenticated;
