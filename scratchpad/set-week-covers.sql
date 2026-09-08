-- Sets week_cover_url on the first workout (by date) of each week,
-- for every plan currently in the table, using the existing
-- olympic-week-N.webp banner photos. Safe to re-run.
update workouts w
set week_cover_url = 'assets/photos/olympic-triathlon/olympic-week-' || w.week || '.webp'
from (
  select distinct on (plan_id, week) id
  from workouts
  order by plan_id, week, date asc
) first_of_week
where w.id = first_of_week.id;
