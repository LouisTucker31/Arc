-- Migration: make plans/workouts a shared, global library instead of
-- per-user owned data. workout_logs stays private per user (unchanged).
--
-- Run this once in the Supabase SQL editor (Project -> SQL Editor).

-- 1. Drop the old per-user policies on plans and workouts.
drop policy if exists "own plans" on plans;
drop policy if exists "own workouts" on workouts;

-- 2. Remove the ownership columns and their defaults. Any signed-in
--    user can now read every row; nobody can insert/update/delete
--    through the anon-key client (do that via the Supabase dashboard,
--    the SQL editor, or a future admin-only tool instead).
alter table plans drop column if exists user_id;
alter table workouts drop column if exists user_id;

-- 3. New policies: any authenticated user can read; nobody can write
--    through the client (the "with check (false)" clauses block all
--    inserts/updates from the app itself).
create policy "anyone signed in can read plans" on plans
  for select to authenticated using (true);
create policy "anyone signed in can read workouts" on workouts
  for select to authenticated using (true);

-- workout_logs is untouched: still owned per user, still fully
-- private via the existing "own logs" policy.
