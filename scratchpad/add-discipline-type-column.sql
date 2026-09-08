-- Adds a discipline_type column to workouts so the app can tell run/bike/swim/brick
-- sessions apart without guessing from the title, then backfills the existing rows.
-- Also adds a legs column to workout_logs to hold per-leg brick data (speed/pace,
-- duration, distance, effort for each leg) alongside the existing flat columns used
-- by single-discipline logs. Run once in the Supabase SQL editor.

alter table workouts add column if not exists discipline_type text;
alter table workout_logs add column if not exists legs jsonb;

-- Half Marathon Plan: run + swim only, no bike or brick sessions yet.
update workouts set discipline_type = 'run' where title in ('Easy Run', 'Quality Run', 'Long Run', 'Shakeout Run', 'Race Day');
update workouts set discipline_type = 'swim' where title = 'Maintenance Swim';

-- Going forward, new workouts should set discipline_type to one of:
--   'run', 'bike', 'swim', 'brick_bike_run', 'brick_swim_bike'
--
-- Log rows for a brick workout leave pace/duration/distance/effort null and
-- instead store legs as a JSON array of two objects, in the same order as the
-- workout's discipline_type suggests, e.g. for brick_bike_run:
--   [
--     {"sport": "bike", "speed": "28 km/h", "duration": "40 min", "distance": "20 km", "effort": 6},
--     {"sport": "run", "pace": "4:30 /km", "duration": "15 min", "distance": "3 km", "effort": 7}
--   ]
