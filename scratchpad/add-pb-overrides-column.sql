-- Adds a pb_overrides column to profiles for manually-set personal bests
-- (e.g. a PB from before this app existed). Stored as a JSON object keyed
-- by PB slot id (the same ids as the pb-item elements: pbSwim400m,
-- pbSwim1500m, pbBike20km, pbBike40km, pbRun5km, pbRun10km, pbHalfMarathon,
-- pbMarathon), each value the manual time in whole seconds, e.g.
--   {"pbRun5km": 1230, "pbMarathon": 14700}
-- A slot is only present here while its manual value is still the best
-- known time for that distance - once a logged workout computes a faster
-- time, the app deletes that key from pb_overrides rather than keeping a
-- now-beaten value around.
-- Run once in the Supabase SQL editor.

alter table profiles add column if not exists pb_overrides jsonb;
