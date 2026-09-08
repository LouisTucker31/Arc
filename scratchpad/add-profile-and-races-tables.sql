-- Adds the Profile page's two tables: profiles (one row per user, personal
-- details) and races (many rows per user, past results and future goals).
-- Both are private per user, following the same pattern as workout_logs.
-- Run once in the Supabase SQL editor.

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text,
  date_of_birth date,
  height_cm numeric,
  weight_kg numeric,
  gender text,
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "own profile" on profiles
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists races (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  date date not null,
  discipline text,
  goal text,
  notes text,
  created_at timestamptz not null default now()
);

alter table races enable row level security;

create policy "own races" on races
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists races_user_id_date_idx on races (user_id, date);
