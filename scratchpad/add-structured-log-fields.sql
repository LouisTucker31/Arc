-- Adds structured, computable numeric columns to workout_logs alongside the
-- existing free-text pace/duration/distance columns. New logs and edits use
-- these from now on; existing history entries keep their original free-text
-- values untouched (they're too inconsistently formatted to safely
-- auto-convert), so PB/pace calculations that read these later should treat
-- rows with null duration_seconds etc. as "not computable".
-- Run once in the Supabase SQL editor.

alter table workout_logs add column if not exists duration_seconds integer;
alter table workout_logs add column if not exists distance_value numeric;
alter table workout_logs add column if not exists distance_unit text;
alter table workout_logs add column if not exists pace_seconds integer;
alter table workout_logs add column if not exists speed_kmh numeric;

-- The legs jsonb array (added earlier for brick logs) keeps its existing
-- shape but each leg object now also carries the same structured fields
-- (durationSeconds, distanceValue, distanceUnit, paceSeconds or speedKmh)
-- alongside the free-text pace/speed/duration/distance it already had.
-- No column change needed for that - it's just new keys within the JSON.
