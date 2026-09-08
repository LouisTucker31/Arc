-- Switches the Maintenance Swim workouts (Half Marathon Plan) to
-- pool-swim.webp.
update workouts
set cover_url = 'assets/photos/half-marathon/pool-swim.webp'
where title = 'Maintenance Swim';
