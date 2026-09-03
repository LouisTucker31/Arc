(function () {
  "use strict";

  /* ------------------------------------------------------------------
   * Data loading
   *
   * Plans, workouts and logged history all live in Supabase now,
   * scoped per user by Row Level Security. PLANS/WORKOUTS are still
   * kept as in-memory arrays (mirroring the old workouts.js globals)
   * so every render function below can stay synchronous; they are
   * just populated by loadPlansAndWorkouts() during init() instead of
   * being hard-coded.
   * ---------------------------------------------------------------- */

  let PLANS = [];
  let WORKOUTS = [];

  function mapPlanRow(row) {
    return {
      id: row.id,
      title: row.title,
      cover: row.cover_url,
      estimateWeeks: row.estimate_weeks,
    };
  }

  function mapWorkoutRow(row) {
    return {
      id: row.id,
      planId: row.plan_id,
      title: row.title,
      week: row.week,
      date: row.date,
      phase: row.phase,
      summary: row.summary,
      session: row.session,
      cover: row.cover_url,
      weekCover: row.week_cover_url,
      estimateMinutes: row.estimate_minutes,
      discipline: row.discipline,
    };
  }

  async function loadPlansAndWorkouts() {
    const { data, error } = await supabaseClient
      .from("plans")
      .select("*, workouts(*)")
      .order("date", { foreignTable: "workouts", ascending: true });
    if (error) {
      console.error("Could not load plans", error);
      PLANS = [];
      WORKOUTS = [];
      return;
    }
    PLANS = data.map(mapPlanRow);
    WORKOUTS = data.flatMap((row) => (row.workouts || []).map(mapWorkoutRow));
  }

  function mapLogRow(row) {
    return {
      id: row.id,
      workoutId: row.workout_id,
      loggedISO: row.logged_at,
      pace: row.pace,
      duration: row.duration,
      distance: row.distance,
      effort: row.effort,
      notes: row.notes,
    };
  }

  async function loadHistory() {
    const { data, error } = await supabaseClient
      .from("workout_logs")
      .select("*")
      .order("logged_at", { ascending: false });
    if (error) {
      console.error("Could not load history", error);
      return [];
    }
    return data.map(mapLogRow);
  }

  async function addHistoryEntry(entry) {
    const { data, error } = await supabaseClient
      .from("workout_logs")
      .insert({
        workout_id: entry.workoutId,
        pace: entry.pace,
        duration: entry.duration,
        distance: entry.distance,
        effort: entry.effort,
        notes: entry.notes,
      })
      .select()
      .single();
    if (error) {
      console.error("Could not save workout log", error);
      return null;
    }
    return data.id;
  }

  async function deleteHistoryEntry(id) {
    const { error } = await supabaseClient.from("workout_logs").delete().eq("id", id);
    if (error) console.error("Could not delete workout log", error);
  }

  function findPlan(id) {
    return PLANS.find((p) => p.id === id);
  }

  function findWorkout(id) {
    return WORKOUTS.find((w) => w.id === id);
  }

  function workoutsForPlan(planId) {
    return WORKOUTS.filter((w) => w.planId === planId).sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0
    );
  }

  /* A plan's date range is derived from its own workouts (first/last
     scheduled date) rather than stored explicitly, so it always stays
     in sync with whatever WORKOUTS actually contains. Returns null for
     a plan with no workouts yet. */
  function planDateRange(planId) {
    const workouts = workoutsForPlan(planId);
    if (workouts.length === 0) return null;
    return { start: workouts[0].date, end: workouts[workouts.length - 1].date };
  }

  /* The plan "currently in place" for a given date: whichever plan's
     own workouts bracket that date, so a Rest Day page shows the
     right plan's cover even once more than one plan exists. If no
     plan's date range actually contains the date (e.g. today, before
     this plan starts), falls back to whichever plan starts soonest
     after it, then whichever plan is most recently finished. */
  function planForDate(iso) {
    let bestPlan = null;
    let bestDistance = Infinity;

    PLANS.forEach((plan) => {
      const range = planDateRange(plan.id);
      if (!range) return;

      if (iso >= range.start && iso <= range.end) {
        bestPlan = plan;
        bestDistance = 0;
        return;
      }
      const distance = iso < range.start
        ? new Date(range.start) - new Date(iso)
        : new Date(iso) - new Date(range.end);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPlan = plan;
      }
    });

    return bestPlan;
  }

  /* "active" (today falls within the plan's own date range), "upcoming"
     (today is before it starts), "finished" (today is after it ends),
     or null for a plan with no workouts yet (unranked). */
  function planStatus(plan, iso) {
    const range = planDateRange(plan.id);
    if (!range) return null;
    if (iso < range.start) return "upcoming";
    if (iso > range.end) return "finished";
    return "active";
  }

  /* Picks the one plan to show large at the top of the Plans screen:
     an active plan beats an upcoming one; ties broken by whichever
     ends (if active) or starts (if upcoming) soonest. Returns null
     when nothing is active or upcoming, so the caller shows an empty
     state instead. */
  function pickCurrentPlan(plans, iso) {
    let best = null;

    plans.forEach((plan) => {
      const status = planStatus(plan, iso);
      if (status !== "active" && status !== "upcoming") return;
      const range = planDateRange(plan.id);

      if (!best) {
        best = { plan, status, range };
        return;
      }
      if (status === "active" && best.status !== "active") {
        best = { plan, status, range };
        return;
      }
      if (status !== best.status) return;
      const tiebreakDate = status === "active" ? range.end : range.start;
      const bestTiebreakDate = status === "active" ? best.range.end : best.range.start;
      if (tiebreakDate < bestTiebreakDate) {
        best = { plan, status, range };
      }
    });

    return best;
  }

  /* ------------------------------------------------------------------
   * Formatting
   * ---------------------------------------------------------------- */

  const dateFormatter = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  });

  const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  function formatDate(iso) {
    return dateFormatter.format(new Date(iso + "T00:00:00Z"));
  }

  function formatDateRange(startIso, endIso) {
    return formatDate(startIso) + " - " + formatDate(endIso);
  }

  /* The Monday-to-Sunday calendar week containing the given ISO date,
     as [mondayIso, sundayIso]. A week tile always shows this full
     range rather than just the span between its first and last
     scheduled workout, since a Tue/Thu/Sat-only week would otherwise
     read like it starts and ends mid-week. */
  function calendarWeekRange(iso) {
    const date = new Date(iso + "T00:00:00Z");
    const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
    const daysSinceMonday = (dayOfWeek + 6) % 7;
    const monday = new Date(date.getTime());
    monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);
    const sunday = new Date(monday.getTime());
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    return [monday.toISOString().slice(0, 10), sunday.toISOString().slice(0, 10)];
  }

  function formatDateTime(iso) {
    return dateTimeFormatter.format(new Date(iso));
  }

  /* Workout durations are sourced from real training plans and don't
     always land on a clean number, so the duration tag shown on a
     tile always rounds to the nearest 5 minutes for a tidier display,
     without needing the underlying data itself to be pre-rounded. */
  function formatEstimateMinutes(minutes) {
    return Math.round(minutes / 5) * 5 + " min";
  }

  /* A small helper for the "part • part • part" subtitle lines used in
     list rows. Dots are real elements, not punctuation characters, so
     they always line up and read cleanly with a screen reader. */
  function buildSubtitle(container, parts) {
    parts.forEach((text, i) => {
      if (i > 0) {
        const dot = document.createElement("span");
        dot.className = "dot";
        dot.setAttribute("aria-hidden", "true");
        container.appendChild(dot);
      }
      const span = document.createElement("span");
      span.textContent = text;
      container.appendChild(span);
    });
  }

  /* ------------------------------------------------------------------
   * Navigation
   *
   * A simple in-app stack drives which screen is visible. The app's
   * own back buttons call goBack() directly; there is no attempt to
   * hook into the browser's own history/back gesture (an earlier
   * version tried that and caused real freezes and white-screens on
   * iOS Safari's edge-swipe, which is worse than just leaving that
   * gesture alone).
   * ---------------------------------------------------------------- */

  const nav = { stack: ["signin"] };
  const LAST_SCREEN_KEY = "trainingArc.lastScreen.v1";

  function showScreen(name) {
    document.querySelectorAll(".screen").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.screen === name);
    });
    window.scrollTo(0, 0);
    try {
      window.sessionStorage.setItem(LAST_SCREEN_KEY, name);
    } catch (err) {
      // sessionStorage can be unavailable (private browsing, locked-down
      // contexts). Reload-persistence is a nicety, never worth crashing
      // navigation over.
    }
  }

  function goTo(name) {
    nav.stack.push(name);
    showScreen(name);
  }

  function goBack() {
    if (nav.stack.length > 1) {
      nav.stack.pop();
      showScreen(nav.stack[nav.stack.length - 1]);
    }
  }

  /* ------------------------------------------------------------------
   * Plans screen
   * ---------------------------------------------------------------- */

  function renderPlans() {
    const today = todayIso();
    const current = pickCurrentPlan(PLANS, today);

    const slot = document.getElementById("currentPlanSlot");
    slot.innerHTML = "";
    slot.appendChild(current ? buildCurrentPlanTile(current) : buildEmptyPlanState());

    const otherList = document.getElementById("otherPlanList");
    otherList.innerHTML = "";
    otherPlans(PLANS, current, today).forEach((plan) => {
      otherList.appendChild(buildOtherPlanRow(plan));
    });
  }

  /* Every plan except whichever one is showing large at the top,
     ordered so an upcoming plan (soonest-starting first) comes before
     a finished one (most-recently-finished first); unranked plans
     with no workouts yet sort last. */
  function otherPlans(plans, current, today) {
    const currentId = current ? current.plan.id : null;
    const rank = { upcoming: 0, finished: 1 };

    return plans
      .filter((plan) => plan.id !== currentId)
      .map((plan) => ({ plan, status: planStatus(plan, today), range: planDateRange(plan.id) }))
      .sort((a, b) => {
        const rankA = a.status === null ? 2 : rank[a.status];
        const rankB = b.status === null ? 2 : rank[b.status];
        if (rankA !== rankB) return rankA - rankB;
        if (rankA === 2) return 0;
        const dateA = a.status === "upcoming" ? a.range.start : a.range.end;
        const dateB = b.status === "upcoming" ? b.range.start : b.range.end;
        if (a.status === "upcoming") return dateA < dateB ? -1 : dateA > dateB ? 1 : 0;
        return dateA > dateB ? -1 : dateA < dateB ? 1 : 0;
      })
      .map((entry) => entry.plan);
  }

  function planMetaParts(plan) {
    const range = planDateRange(plan.id);
    const parts = [];
    if (range) parts.push(formatDateRange(range.start, range.end));
    parts.push(plan.estimateWeeks + " weeks", workoutsForPlan(plan.id).length + " workouts");
    return parts;
  }

  function buildCurrentPlanTile(current) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "workout-tile";

    const img = document.createElement("img");
    img.className = "workout-tile-photo";
    img.src = current.plan.cover;
    img.alt = "";
    img.loading = "lazy";
    applyFocalY(img, SESSION_COVER_FOCAL_Y[current.plan.cover]);

    const overlay = document.createElement("div");
    overlay.className = "workout-tile-overlay";

    const title = document.createElement("h2");
    title.className = "workout-tile-title";
    title.textContent = current.plan.title;

    const meta = document.createElement("div");
    meta.className = "workout-tile-meta";
    buildSubtitle(meta, planMetaParts(current.plan));

    overlay.append(title, meta);
    btn.append(img, overlay);

    if (current.status === "upcoming") {
      const soonTag = document.createElement("span");
      soonTag.className = "workout-row-phase";
      soonTag.textContent = "Soon";
      btn.appendChild(soonTag);
    }

    btn.addEventListener("click", () => openPlan(current.plan.id));
    return btn;
  }

  function buildEmptyPlanState() {
    const wrap = document.createElement("div");
    wrap.className = "empty-state";

    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("class", "empty-icon");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "path");
    circle.setAttribute("d", "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z");
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke", "currentColor");
    circle.setAttribute("stroke-width", "1.4");
    const hands = document.createElementNS("http://www.w3.org/2000/svg", "path");
    hands.setAttribute("d", "M12 7v5l3.5 2");
    hands.setAttribute("fill", "none");
    hands.setAttribute("stroke", "currentColor");
    hands.setAttribute("stroke-width", "1.4");
    hands.setAttribute("stroke-linecap", "round");
    icon.append(circle, hands);

    const title = document.createElement("p");
    title.className = "empty-title";
    title.textContent = "No plan currently active";

    const text = document.createElement("p");
    text.className = "empty-text";
    text.textContent = "A new training plan will appear here once one is scheduled.";

    wrap.append(icon, title, text);
    return wrap;
  }

  function buildOtherPlanRow(plan) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "workout-row workout-row--thin";

    const img = document.createElement("img");
    img.className = "workout-row-photo";
    img.src = plan.cover;
    img.alt = "";
    img.loading = "lazy";
    applyFocalY(img, SESSION_COVER_FOCAL_Y[plan.cover]);

    const overlay = document.createElement("div");
    overlay.className = "workout-row-overlay";

    const title = document.createElement("h2");
    title.className = "workout-row-title";
    title.textContent = plan.title;

    const meta = document.createElement("div");
    meta.className = "workout-row-meta";
    buildSubtitle(meta, planMetaParts(plan));

    overlay.append(title, meta);
    btn.append(img, overlay);
    btn.addEventListener("click", () => openPlan(plan.id));
    li.appendChild(btn);
    return li;
  }

  let currentPlan = null;
  const LAST_PLAN_KEY = "trainingArc.lastPlan.v1";

  function openPlan(id) {
    const plan = findPlan(id);
    if (!plan) return;
    currentPlan = plan;
    try {
      window.sessionStorage.setItem(LAST_PLAN_KEY, id);
    } catch (err) {
      // Same nicety-only caveat as LAST_SCREEN_KEY: never worth
      // crashing navigation over.
    }
    renderLibrary(plan);
    goTo("library");
  }

  /* ------------------------------------------------------------------
   * Library screen: one row per week in the plan
   * ---------------------------------------------------------------- */

  function weeksForPlan(planId) {
    const workouts = workoutsForPlan(planId);
    const byWeek = new Map();
    workouts.forEach((workout) => {
      if (!byWeek.has(workout.week)) byWeek.set(workout.week, []);
      byWeek.get(workout.week).push(workout);
    });
    return Array.from(byWeek.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([week, weekWorkouts]) => ({ week, workouts: weekWorkouts }));
  }

  function renderLibrary(plan) {
    document.getElementById("libraryPlanTitle").textContent = plan.title;
    const list = document.getElementById("weekList");
    list.innerHTML = "";
    weeksForPlan(plan.id).forEach((weekGroup) => {
      list.appendChild(buildWeekRow(weekGroup));
    });
  }

  /* The first workout of the week carries the dedicated week-banner
     photo (weekCover), set once per week rather than per workout.
     Falls back to that workout's own cover if a week has none set. */
  function weekCover(weekGroup) {
    const first = weekGroup.workouts[0];
    return first.weekCover || first.cover;
  }

  /* Source photos frame their subject at different heights, so a
     single centered crop clips the swimmer/runner/cyclist out of some
     tiles. These are hand-picked vertical focal points (per cent from
     the top), keyed by cover photo path; falls back to a centered
     crop for a photo with no entry. */
  const SESSION_COVER_FOCAL_Y = {
    "assets/photos/olympic-triathlon/olympic-triathlon-plan.webp": 40,
    "assets/photos/half-marathon/half-marathon-plan.webp": 30,
    "assets/photos/olympic-triathlon/easy-run.webp": 20,
    "assets/photos/olympic-triathlon/pool-swim.webp": 50,
    "assets/photos/olympic-triathlon/quality-run.webp": 15,
    "assets/photos/olympic-triathlon/open-water-swim.webp": 50,
    "assets/photos/olympic-triathlon/quality-bike.webp": 20,
    "assets/photos/olympic-triathlon/brick-session.webp": 30,
    "assets/photos/olympic-triathlon/race-day.webp": 35,
    "assets/photos/olympic-triathlon/olympic-week-1.webp": 30,
    "assets/photos/olympic-triathlon/olympic-week-2.webp": 45,
    "assets/photos/olympic-triathlon/olympic-week-3.webp": 35,
    "assets/photos/olympic-triathlon/olympic-week-4.webp": 50,
    "assets/photos/olympic-triathlon/olympic-week-5.webp": 50,
    "assets/photos/olympic-triathlon/olympic-week-6.webp": 30,
    "assets/photos/olympic-triathlon/olympic-week-7.webp": 45,
    "assets/photos/olympic-triathlon/olympic-week-8.webp": 40,
    "assets/photos/olympic-triathlon/olympic-week-9.webp": 25,
    "assets/photos/olympic-triathlon/olympic-week-10.webp": 40,
    "assets/photos/olympic-triathlon/olympic-week-11.webp": 25,
    "assets/photos/olympic-triathlon/olympic-week-12.webp": 30,
    "assets/photos/half-marathon/half-marathon-week-1.webp": 20,
    "assets/photos/half-marathon/half-marathon-week-2.webp": 10,
    "assets/photos/half-marathon/half-marathon-week-3.webp": 50,
    "assets/photos/half-marathon/half-marathon-week-4.webp": 15,
    "assets/photos/half-marathon/half-marathon-week-5.webp": 50,
    "assets/photos/half-marathon/half-marathon-week-6.webp": 10,
    "assets/photos/half-marathon/half-marathon-week-7.webp": 30,
    "assets/photos/half-marathon/half-marathon-week-8.webp": 50,
    "assets/photos/half-marathon/easy-run.webp": 30,
    "assets/photos/half-marathon/quality-run.webp": 15,
    "assets/photos/half-marathon/long-run.webp": 45,
    "assets/photos/half-marathon/pool-swim.webp": 50,
  };

  function applyFocalY(img, focalY) {
    if (focalY !== undefined) img.style.setProperty("--photo-position", "center " + focalY + "%");
  }

  function buildWeekRow(weekGroup) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "workout-row";

    const cover = weekCover(weekGroup);
    const img = document.createElement("img");
    img.className = "workout-row-photo";
    img.src = cover;
    img.alt = "";
    img.loading = "lazy";
    applyFocalY(img, SESSION_COVER_FOCAL_Y[cover]);

    const overlay = document.createElement("div");
    overlay.className = "workout-row-overlay";

    const week = document.createElement("span");
    week.className = "workout-row-week";
    week.textContent = "Week " + weekGroup.week;

    const [weekStart, weekEnd] = calendarWeekRange(weekGroup.workouts[0].date);
    const title = document.createElement("h2");
    title.className = "workout-row-title";
    title.textContent = formatDateRange(weekStart, weekEnd);

    const meta = document.createElement("div");
    meta.className = "workout-row-meta";
    const workoutWord = weekGroup.workouts.length === 1 ? "workout" : "workouts";
    buildSubtitle(meta, [weekGroup.workouts.length + " " + workoutWord]);

    const lastWorkoutDate = weekGroup.workouts[weekGroup.workouts.length - 1].date;
    const isWeekDone = todayIso() > lastWorkoutDate;

    const phase = document.createElement("span");
    phase.className = "workout-row-phase";
    phase.textContent = isWeekDone ? "Done" : weekGroup.workouts[0].phase;

    overlay.append(week, title, meta);
    btn.append(img, overlay, phase);
    btn.addEventListener("click", () => openWeek(weekGroup));
    li.appendChild(btn);
    return li;
  }

  /* ------------------------------------------------------------------
   * Week screen: every workout scheduled that week
   * ---------------------------------------------------------------- */

  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function dayOfWeekLabel(iso) {
    return DAY_NAMES[new Date(iso + "T00:00:00Z").getUTCDay()];
  }

  function openWeek(weekGroup) {
    document.getElementById("weekTitle").textContent = "Week " + weekGroup.week;
    const list = document.getElementById("weekWorkoutList");
    list.innerHTML = "";
    weekGroup.workouts.forEach((workout) => {
      list.appendChild(buildWeekWorkoutRow(workout));
    });
    goTo("week");
  }

  function buildWeekWorkoutRow(workout) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "workout-row workout-row--thin";

    const img = document.createElement("img");
    img.className = "workout-row-photo";
    img.src = workout.cover;
    img.alt = "";
    img.loading = "lazy";
    applyFocalY(img, SESSION_COVER_FOCAL_Y[workout.cover]);

    const overlay = document.createElement("div");
    overlay.className = "workout-row-overlay";

    const day = document.createElement("span");
    day.className = "workout-row-week";
    day.textContent = dayOfWeekLabel(workout.date);

    const title = document.createElement("h2");
    title.className = "workout-row-title";
    title.textContent = workout.title;

    const meta = document.createElement("div");
    meta.className = "workout-row-meta";
    buildSubtitle(meta, [formatEstimateMinutes(workout.estimateMinutes)]);

    overlay.append(day, title, meta);
    btn.append(img, overlay);

    if (loggedWorkoutIds.has(workout.id)) {
      const badge = document.createElement("span");
      badge.className = "workout-row-phase";
      badge.textContent = "Logged";
      btn.appendChild(badge);
    }

    btn.addEventListener("click", () => openDetail(workout.id));
    li.appendChild(btn);
    return li;
  }

  /* ------------------------------------------------------------------
   * Detail (workout summary) screen
   * ---------------------------------------------------------------- */

  let currentWorkout = null;

  function openDetail(id) {
    const workout = findWorkout(id);
    if (!workout) return;
    currentWorkout = workout;
    renderDetail(workout);
    goTo("detail");
  }

  function renderDetail(workout) {
    const cover = document.getElementById("detailCover");
    cover.src = workout.cover;
    cover.alt = "";
    cover.style.removeProperty("--photo-position");
    applyFocalY(cover, SESSION_COVER_FOCAL_Y[workout.cover]);
    document.getElementById("detailTitle").textContent = workout.title;
    document.getElementById("detailSummary").textContent = workout.summary;

    const meta = document.getElementById("detailMeta");
    meta.innerHTML = "";
    const weekTag = document.createElement("span");
    weekTag.className = "detail-meta-item";
    weekTag.textContent = "Week " + workout.week;
    meta.appendChild(weekTag);

    const metricTag = document.createElement("span");
    metricTag.className = "detail-meta-item";
    metricTag.textContent = workout.discipline
      ? formatMetricPill(primaryMetricFor(workout.discipline))
      : formatEstimateMinutes(workout.estimateMinutes);
    meta.appendChild(metricTag);

    renderDetailTarget(workout);
    renderDetailBody(workout);
  }

  /* A multi-leg workout (a two-leg brick, or Race Day's full
     swim/bike/run) carries named legs instead of one flat discipline
     object, so the pill row and target field read off whichever leg
     happens first in the session. */
  const BRICK_LEG_ORDER = ["swim", "bike", "run"];

  function firstBrickLeg(discipline) {
    const legKey = BRICK_LEG_ORDER.find((leg) => discipline[leg]);
    return legKey ? discipline[legKey] : null;
  }

  function primaryMetricFor(discipline) {
    const firstLeg = firstBrickLeg(discipline);
    if (firstLeg) return firstLeg.metric;
    return discipline.metric;
  }

  function primaryTargetFor(discipline) {
    const firstLeg = firstBrickLeg(discipline);
    if (firstLeg) return firstLeg.target;
    return discipline.target;
  }

  function formatMetricPill(metric) {
    if (!metric) return "";
    return metric.value;
  }

  function renderDetailTarget(workout) {
    const container = document.getElementById("detailTarget");
    const target = workout.discipline ? primaryTargetFor(workout.discipline) : null;
    if (!target) {
      container.hidden = true;
      container.innerHTML = "";
      return;
    }
    container.hidden = false;
    container.innerHTML = "";
    const label = document.createElement("p");
    label.className = "field-label";
    label.textContent = target.label;
    const value = document.createElement("p");
    value.className = "detail-target-value";
    value.textContent = target.value;
    container.append(label, value);
  }

  /* Builds one discipline's Warm-up / Main Set / Cool-down blocks
     (each optional) into the given container, under an optional
     heading. Used directly for run/swim/bike, and once per leg for a
     brick session (e.g. Bike then Run, or Swim then Bike). */
  function appendDisciplineStructure(container, discipline, headingText) {
    const hasStructure = discipline.warmup || discipline.mainSet || discipline.cooldown;
    if (!hasStructure) return;

    if (headingText) {
      const heading = document.createElement("h2");
      heading.className = "section-heading";
      heading.textContent = headingText;
      container.appendChild(heading);
    }

    [
      ["Warm-up", discipline.warmup],
      ["Main Set", discipline.mainSet],
      ["Cool-down", discipline.cooldown],
    ].forEach(([label, text]) => {
      if (!text) return;
      const block = document.createElement("div");
      block.className = "detail-structure-block";
      const subheading = document.createElement("h3");
      subheading.className = "detail-subheading";
      subheading.textContent = label;
      const body = document.createElement("p");
      body.className = "detail-session";
      body.textContent = text;
      block.append(subheading, body);
      container.appendChild(block);
    });
  }

  function renderDetailBody(workout) {
    const container = document.getElementById("detailBody");
    container.innerHTML = "";

    if (!workout.discipline) {
      // Race Day (and any other type-less workout) keeps the original
      // flat Session heading + paragraph.
      const heading = document.createElement("h2");
      heading.className = "section-heading";
      heading.textContent = "Session";
      const body = document.createElement("p");
      body.className = "detail-session";
      body.textContent = workout.session;
      container.append(heading, body);
      return;
    }

    const legLabels = { swim: "Swim", bike: "Bike", run: "Run" };
    const legs = BRICK_LEG_ORDER.filter((leg) => workout.discipline[leg]);
    if (legs.length > 0) {
      // Multi-leg workouts (a two-leg brick, or Race Day's full
      // swim/bike/run) render one structure block per leg, in order,
      // rather than the single flat discipline used by a plain
      // run/swim/bike session.
      legs.forEach((leg) => {
        appendDisciplineStructure(container, workout.discipline[leg], legLabels[leg]);
      });
      return;
    }

    appendDisciplineStructure(container, workout.discipline, null);
  }

  /* ------------------------------------------------------------------
   * Log screen
   * ---------------------------------------------------------------- */

  /* When editing an existing history entry (opened from the History
     detail dialog) this holds that entry's id, and handleSaveWorkout
     updates it in place instead of inserting a new one. Null when
     logging a fresh workout from its Detail screen. */
  let editingEntryId = null;

  function openLog() {
    if (!currentWorkout) return;
    editingEntryId = null;
    document.getElementById("logTitle").textContent = "Log workout";
    document.getElementById("logWorkoutName").textContent = currentWorkout.title;
    document.getElementById("paceInput").value = "";
    document.getElementById("durationInput").value = "";
    document.getElementById("distanceInput").value = "";
    document.getElementById("notesInput").value = "";
    renderEffortGroup(null);
    goTo("log");
  }

  /* Opens the Log screen pre-filled with an existing entry's values,
     so saving updates that entry instead of creating a new one. The
     entry's own workout (not necessarily currentWorkout, which may be
     unset or pointing at something else entirely) supplies the title
     shown at the top of the form. */
  function openEditLog(entry) {
    const workout = findWorkout(entry.workoutId);
    editingEntryId = entry.id;
    document.getElementById("logTitle").textContent = "Edit workout";
    document.getElementById("logWorkoutName").textContent = workout ? workout.title : "Workout";
    document.getElementById("paceInput").value = entry.pace || "";
    document.getElementById("durationInput").value = entry.duration || "";
    document.getElementById("distanceInput").value = entry.distance || "";
    document.getElementById("notesInput").value = entry.notes || "";
    renderEffortGroup(entry.effort);
    goTo("log");
  }

  /* Native radio inputs (visually hidden, each wrapped in a styled
     label) rather than a hand-rolled role="radio" widget, so arrow
     keys, Home/End and single-tab-stop grouping all come from the
     browser for free instead of needing custom keyboard handling.
     selected pre-checks a value when editing an existing entry. */
  function renderEffortGroup(selected) {
    const group = document.getElementById("effortGroup");
    group.innerHTML = "";
    for (let i = 1; i <= 10; i++) {
      const label = document.createElement("label");
      label.className = "effort-btn";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "effort";
      input.value = String(i);
      input.className = "effort-btn-input";
      if (selected === i) input.checked = true;

      const text = document.createElement("span");
      text.textContent = String(i);

      label.append(input, text);
      group.appendChild(label);
    }
  }

  function selectedEffort() {
    const checked = document.querySelector('#effortGroup input[name="effort"]:checked');
    return checked ? Number(checked.value) : null;
  }

  async function handleSaveWorkout() {
    if (!editingEntryId && !currentWorkout) return;
    const fields = {
      pace: document.getElementById("paceInput").value.trim(),
      duration: document.getElementById("durationInput").value.trim(),
      distance: document.getElementById("distanceInput").value.trim(),
      effort: selectedEffort(),
      notes: document.getElementById("notesInput").value.trim(),
    };

    const wasEditing = Boolean(editingEntryId);
    if (editingEntryId) {
      await updateHistoryEntry(editingEntryId, fields);
      lastSavedEntryId = editingEntryId;
    } else {
      lastSavedEntryId = await addHistoryEntry(Object.assign({ workoutId: currentWorkout.id }, fields));
    }
    editingEntryId = null;

    nav.stack = ["plans", "history"];
    await renderHistory();
    showScreen("history");
    showSaveBanner(wasEditing ? "Changes saved" : "Workout saved");
  }

  let saveBannerTimeout = null;

  function showSaveBanner(message) {
    const banner = document.getElementById("saveBanner");
    banner.textContent = message;
    banner.hidden = false;
    window.clearTimeout(saveBannerTimeout);
    saveBannerTimeout = window.setTimeout(() => {
      banner.hidden = true;
    }, 4000);
  }

  /* ------------------------------------------------------------------
   * History screen
   * ---------------------------------------------------------------- */

  let lastSavedEntryId = null;
  let historyEntries = [];
  let loggedWorkoutIds = new Set();

  /* Refreshes both the History screen's own list and the set of
     logged workout ids that the Week/Library screens use to show a
     workout as done, so the two never drift out of sync. */
  async function refreshHistoryData() {
    historyEntries = await loadHistory();
    loggedWorkoutIds = new Set(historyEntries.map((entry) => entry.workoutId));
  }

  async function renderHistory() {
    await refreshHistoryData();
    const listEl = document.getElementById("historyList");
    const emptyEl = document.getElementById("historyEmpty");
    listEl.innerHTML = "";

    if (historyEntries.length === 0) {
      emptyEl.hidden = false;
      listEl.hidden = true;
      lastSavedEntryId = null;
      return;
    }

    emptyEl.hidden = true;
    listEl.hidden = false;

    historyEntries.forEach((entry) => {
      listEl.appendChild(buildHistoryRow(entry));
    });
    lastSavedEntryId = null;
  }

  function buildHistoryRow(entry) {
    const workout = findWorkout(entry.workoutId);
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "thumb-row";
    if (entry.id === lastSavedEntryId) btn.classList.add("is-new");

    const photo = document.createElement("img");
    photo.className = "thumb-row-photo";
    photo.src = workout ? workout.cover : "";
    photo.alt = "";
    photo.loading = "lazy";

    const text = document.createElement("div");
    text.className = "thumb-row-text";
    const title = document.createElement("span");
    title.className = "thumb-row-title";
    title.textContent = workout ? workout.title : "Workout";
    const subtitle = document.createElement("span");
    subtitle.className = "thumb-row-subtitle";
    const subtitleParts = [];
    if (workout) subtitleParts.push("Week " + workout.week);
    subtitleParts.push(formatDateTime(entry.loggedISO));
    if (entry.effort) subtitleParts.push("Effort " + entry.effort + "/10");
    buildSubtitle(subtitle, subtitleParts);
    text.append(title, subtitle);
    if (entry.notes) {
      const notes = document.createElement("span");
      notes.className = "thumb-row-notes";
      notes.textContent = entry.notes;
      text.appendChild(notes);
    }

    const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    chevron.setAttribute("class", "thumb-row-chevron");
    chevron.setAttribute("viewBox", "0 0 24 24");
    chevron.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M9 5l7 7-7 7");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    chevron.appendChild(path);

    btn.append(photo, text, chevron);
    btn.addEventListener("click", () => openHistoryDetail(entry.id));
    li.appendChild(btn);
    return li;
  }

  let historyDetailId = null;

  function openHistoryDetail(id) {
    const entry = historyEntries.find((e) => e.id === id);
    if (!entry) return;
    const workout = findWorkout(entry.workoutId);
    historyDetailId = id;
    document.getElementById("historyDetailTitle").textContent = workout ? workout.title : "Workout";
    document.getElementById("historyDetailWeek").textContent = workout ? "Week " + workout.week : "-";
    document.getElementById("historyDetailDate").textContent = formatDateTime(entry.loggedISO);
    document.getElementById("historyDetailDuration").textContent = entry.duration || "-";
    document.getElementById("historyDetailDistance").textContent = entry.distance || "-";
    document.getElementById("historyDetailPace").textContent = entry.pace || "-";
    document.getElementById("historyDetailEffort").textContent = entry.effort ? entry.effort + "/10" : "-";

    const notesWrap = document.getElementById("historyDetailNotesWrap");
    const notesText = document.getElementById("historyDetailNotes");
    if (entry.notes) {
      notesWrap.hidden = false;
      notesText.textContent = entry.notes;
    } else {
      notesWrap.hidden = true;
    }
    document.getElementById("historyDetailDialog").showModal();
  }

  /* ------------------------------------------------------------------
   * Wiring
   * ---------------------------------------------------------------- */

  /* Reload persistence only covers what can be cheaply and correctly
     rebuilt from a bare screen name: Plans (the default) and History
     (no selection state needed). Detail/Log/Week all depend on
     in-memory selection (currentWorkout/a weekGroup) that a reload
     discards, so those fall back to Library (one level in from Plans)
     rather than either guessing which workout was open or silently
     dropping the user all the way back to Plans. Library itself is
     restored to the actual plan that was open (via LAST_PLAN_KEY),
     not just an arbitrary first plan, now that more than one exists. */
  async function restoreLastScreen() {
    let lastScreen;
    try {
      lastScreen = window.sessionStorage.getItem(LAST_SCREEN_KEY);
    } catch (err) {
      return;
    }
    if (!lastScreen || lastScreen === "plans") return;

    if (lastScreen === "history") {
      await renderHistory();
      goTo("history");
      return;
    }
    if (lastScreen === "library" || lastScreen === "week" || lastScreen === "detail" || lastScreen === "log") {
      let lastPlanId;
      try {
        lastPlanId = window.sessionStorage.getItem(LAST_PLAN_KEY);
      } catch (err) {
        // fall through to the PLANS[0] fallback below
      }
      const plan = (lastPlanId && findPlan(lastPlanId)) || PLANS[0];
      if (plan) openPlan(plan.id);
    }
  }

  function todayIso() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return now.getFullYear() + "-" + month + "-" + day;
  }

  function workoutForDate(iso) {
    return WORKOUTS.find((w) => w.date === iso);
  }

  const REST_DAY_TIPS = [
    { title: "Sleep", text: "Aim for 7-9 hours. This is when most of the adaptation from training actually happens." },
    { title: "Nutrition", text: "Eat enough to recover: protein to repair muscle, carbs to refill glycogen." },
    { title: "Hydration", text: "Keep drinking water through the day, especially after a heavy training week." },
    { title: "Mobility", text: "A short stretch or foam rolling session keeps things loose for the next session." },
  ];

  function renderRestDay() {
    const plan = planForDate(todayIso());
    const cover = document.getElementById("restCover");
    cover.src = plan ? plan.cover : "";
    cover.alt = "";
    cover.style.removeProperty("--photo-position");

    const summary = document.getElementById("restSummary");
    summary.textContent = plan
      ? "Nothing scheduled today in your " + plan.title + ". Recovery is part of the training, here's what to focus on instead."
      : "Nothing scheduled today. Recovery is part of the training, here's what to focus on instead.";

    const list = document.getElementById("restTipList");
    list.innerHTML = "";
    REST_DAY_TIPS.forEach((tip) => {
      const li = document.createElement("li");
      const row = document.createElement("div");
      row.className = "thumb-row";
      const text = document.createElement("div");
      text.className = "thumb-row-text";
      const title = document.createElement("span");
      title.className = "thumb-row-title";
      title.textContent = tip.title;
      const subtitle = document.createElement("span");
      subtitle.className = "thumb-row-subtitle";
      subtitle.textContent = tip.text;
      text.append(title, subtitle);
      row.appendChild(text);
      li.appendChild(row);
      list.appendChild(li);
    });
  }

  function openRestDay() {
    renderRestDay();
    goTo("rest");
  }

  function openToday() {
    const workout = workoutForDate(todayIso());
    if (workout) {
      openDetail(workout.id);
    } else {
      openRestDay();
    }
  }

  /* ------------------------------------------------------------------
   * Sign in
   *
   * Email + password is the only sign-in method, with sign in/sign up
   * toggled by the same form (signinMode tracks which). Forgot
   * Password sends a reset email; clicking that link brings the user
   * back with a PASSWORD_RECOVERY auth event, which pops open the
   * same Set Password dialog used to confirm the new one.
   * ---------------------------------------------------------------- */

  let signinMode = "signin";

  function setSigninStatus(message, isError) {
    const status = document.getElementById("signinStatus");
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle("is-error", Boolean(isError));
  }

  function updateSigninModeUI() {
    const isSignUp = signinMode === "signup";
    document.getElementById("signinSubmitBtn").textContent = isSignUp ? "Create account" : "Sign in";
    document.getElementById("signinToggleBtn").textContent = isSignUp
      ? "Sign in to an existing account instead"
      : "Create an account instead";
  }

  async function handleSigninSubmit() {
    const email = document.getElementById("signinEmailInput").value.trim();
    const password = document.getElementById("signinPasswordInput").value;
    if (!email || !password) {
      setSigninStatus("Enter your email and password.", true);
      return;
    }
    const submitBtn = document.getElementById("signinSubmitBtn");
    submitBtn.disabled = true;
    setSigninStatus(signinMode === "signup" ? "Creating account..." : "Signing in...", false);
    try {
      if (signinMode === "signup") {
        await signUpWithPassword(email, password);
        setSigninStatus("Account created. Check your email to confirm, then sign in.", false);
      } else {
        await signInWithPassword(email, password);
        setSigninStatus("", false);
      }
    } catch (err) {
      setSigninStatus("Could not sign in. Check your email and password.", true);
    } finally {
      submitBtn.disabled = false;
    }
  }

  async function handleForgotPassword() {
    const email = document.getElementById("signinEmailInput").value.trim();
    if (!email) {
      setSigninStatus("Enter your email first.", true);
      return;
    }
    setSigninStatus("Sending reset email...", false);
    try {
      await sendPasswordReset(email);
      setSigninStatus("Check your email for a password reset link.", false);
    } catch (err) {
      setSigninStatus("Could not send the reset email. Please try again.", true);
    }
  }

  function setPasswordDialogStatus(message, isError) {
    const status = document.getElementById("setPasswordStatus");
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle("is-error", Boolean(isError));
  }

  async function handleSetPasswordConfirm() {
    const input = document.getElementById("setPasswordInput");
    const password = input.value;
    if (!password) {
      setPasswordDialogStatus("Enter a password first.", true);
      return;
    }
    const confirmBtn = document.getElementById("setPasswordConfirmBtn");
    confirmBtn.disabled = true;
    setPasswordDialogStatus("Saving...", false);
    try {
      await setPassword(password);
      input.value = "";
      setPasswordDialogStatus("", false);
      document.getElementById("setPasswordDialog").close();
    } catch (err) {
      setPasswordDialogStatus("Could not set password. Please try again.", true);
    } finally {
      confirmBtn.disabled = false;
    }
  }

  /* Runs once there is a real session (either found on load, or just
     signed in): loads this user's plans and switches the nav stack
     over to Plans as the new root screen. */
  async function enterApp() {
    await loadPlansAndWorkouts();
    await refreshHistoryData();
    nav.stack = ["plans"];
    renderPlans();
    showScreen("plans");
    await restoreLastScreen();
  }

  async function init() {
    const historyDetailDialog = document.getElementById("historyDetailDialog");
    const deleteConfirmDialog = document.getElementById("deleteConfirmDialog");

    updateSigninModeUI();
    document.getElementById("signinSubmitBtn").addEventListener("click", handleSigninSubmit);
    document.getElementById("signinToggleBtn").addEventListener("click", () => {
      signinMode = signinMode === "signup" ? "signin" : "signup";
      updateSigninModeUI();
      setSigninStatus("", false);
    });
    document.getElementById("signinForgotBtn").addEventListener("click", handleForgotPassword);

    document.getElementById("signOutBtn").addEventListener("click", async () => {
      await signOut();
      PLANS = [];
      WORKOUTS = [];
      document.getElementById("signinEmailInput").value = "";
      document.getElementById("signinPasswordInput").value = "";
      setSigninStatus("", false);
      nav.stack = ["signin"];
      showScreen("signin");
    });
    const setPasswordDialog = document.getElementById("setPasswordDialog");
    document.getElementById("setPasswordCancelBtn").addEventListener("click", () => setPasswordDialog.close());
    document.getElementById("setPasswordConfirmBtn").addEventListener("click", handleSetPasswordConfirm);

    document.getElementById("openTodayBtn").addEventListener("click", openToday);
    document.getElementById("openHistoryBtn").addEventListener("click", async () => {
      await renderHistory();
      goTo("history");
    });
    document.getElementById("libraryBackBtn").addEventListener("click", goBack);
    document.getElementById("weekBackBtn").addEventListener("click", goBack);
    document.getElementById("detailBackBtn").addEventListener("click", goBack);
    document.getElementById("logBackBtn").addEventListener("click", goBack);
    document.getElementById("restBackBtn").addEventListener("click", goBack);
    document.getElementById("historyBackBtn").addEventListener("click", goBack);

    document.getElementById("completeWorkoutBtn").addEventListener("click", openLog);
    document.getElementById("saveWorkoutBtn").addEventListener("click", handleSaveWorkout);

    document.getElementById("historyDetailDeleteBtn").addEventListener("click", () => {
      historyDetailDialog.close();
      deleteConfirmDialog.showModal();
    });
    document.getElementById("historyDetailEditBtn").addEventListener("click", () => {
      const entry = historyEntries.find((e) => e.id === historyDetailId);
      if (!entry) return;
      historyDetailDialog.close();
      openEditLog(entry);
    });
    document.getElementById("deleteCancelBtn").addEventListener("click", () => deleteConfirmDialog.close());
    deleteConfirmDialog.addEventListener("close", async () => {
      if (deleteConfirmDialog.returnValue === "delete" && historyDetailId) {
        await deleteHistoryEntry(historyDetailId);
        await renderHistory();
      }
      deleteConfirmDialog.returnValue = "";
      historyDetailId = null;
    });

    const session = await getCurrentSession();
    if (session) {
      await enterApp();
    } else {
      showScreen("signin");
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        document.getElementById("setPasswordInput").value = "";
        setPasswordDialogStatus("", false);
        setPasswordDialog.showModal();
        return;
      }
      if (event === "SIGNED_IN" && nav.stack[0] !== "plans") {
        enterApp();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
