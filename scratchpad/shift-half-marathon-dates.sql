-- Shifts every Half Marathon Plan workout date forward by 266 days
-- (a multiple of 7, so Tue/Thu/Sat weekly pattern is preserved),
-- moving the plan from Jan/Feb 2026 to 29 Sep - 21 Nov 2026, with
-- week 1 starting Monday 28 Sep 2026.
update workouts
set date = date + interval '266 days'
where plan_id = (select id from plans where title = 'Half Marathon Plan');
