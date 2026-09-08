select title, week, date
from workouts
where plan_id = (select id from plans where title = 'Half Marathon Plan')
order by date
limit 5;
