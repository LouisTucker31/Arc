-- Adds a nullable week_cover_url column to workouts, used by the
-- Library screen's week-row banner photo. Only needs to be set on
-- the first workout of each week (the app reads it off whichever
-- workout is first in the week group); every other row can stay
-- null since it's never read for those rows.
alter table workouts add column if not exists week_cover_url text;
