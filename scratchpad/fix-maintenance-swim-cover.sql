-- Swaps the Maintenance Swim workouts (in the Half Marathon Plan) from
-- quality-run.webp to easy-run.webp.
update workouts
set cover_url = 'assets/photos/half-marathon/easy-run.webp'
where title = 'Maintenance Swim'
  and cover_url = 'assets/photos/half-marathon/quality-run.webp';
