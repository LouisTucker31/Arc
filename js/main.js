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

  /* ------------------------------------------------------------------
   * Offline support
   *
   * Plans/workouts/history are mirrored into localStorage every time
   * they load successfully, so the app still has something to show
   * with no network. Logged workouts written while offline go into an
   * outbox queue instead of failing, get merged into the rendered
   * history immediately (optimistic), and are flushed to Supabase the
   * next time the app detects a connection.
   * ---------------------------------------------------------------- */

  const CACHE_KEY_PLANS = "arc_cache_plans_v1";
  const CACHE_KEY_WORKOUTS = "arc_cache_workouts_v1";
  const CACHE_KEY_HISTORY = "arc_cache_history_v1";
  const OUTBOX_KEY = "arc_outbox_v1";

  function readCache(key) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function writeCache(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      // Storage full or unavailable (private browsing, etc) - offline
      // caching is a nicety, so just skip it rather than throwing.
    }
  }

  function readOutbox() {
    return readCache(OUTBOX_KEY) || [];
  }

  function writeOutbox(entries) {
    writeCache(OUTBOX_KEY, entries);
  }

  function queueOutboxEntry(entry) {
    const queued = {
      localId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      workoutId: entry.workoutId,
      pace: entry.pace,
      duration: entry.duration,
      distance: entry.distance,
      effort: entry.effort,
      durationSeconds: entry.durationSeconds ?? null,
      distanceValue: entry.distanceValue ?? null,
      distanceUnit: entry.distanceUnit ?? null,
      paceSeconds: entry.paceSeconds ?? null,
      speedKmh: entry.speedKmh ?? null,
      notes: entry.notes,
      legs: entry.legs || null,
      loggedISO: entry.loggedISO || new Date().toISOString(),
    };
    const outbox = readOutbox();
    outbox.push(queued);
    writeOutbox(outbox);
    return queued;
  }

  /* Tries to send every queued entry to Supabase, in order, stopping
     at the first failure so a still-offline device doesn't churn
     through retries; whatever succeeded is removed from the outbox. */
  async function flushOutbox() {
    const outbox = readOutbox();
    if (outbox.length === 0) return;

    const remaining = outbox.slice();
    while (remaining.length > 0) {
      const entry = remaining[0];
      const savedId = await addHistoryEntry(entry);
      if (!savedId) break;
      remaining.shift();
    }
    writeOutbox(remaining);
    if (remaining.length < outbox.length) {
      await refreshHistoryData();
    }
  }

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
      disciplineType: row.discipline_type,
    };
  }

  async function loadPlansAndWorkouts() {
    const { data, error } = await supabaseClient
      .from("plans")
      .select("*, workouts(*)")
      .order("date", { foreignTable: "workouts", ascending: true });
    if (error) {
      console.error("Could not load plans, falling back to cache", error);
      PLANS = readCache(CACHE_KEY_PLANS) || [];
      WORKOUTS = readCache(CACHE_KEY_WORKOUTS) || [];
      return;
    }
    PLANS = data.map(mapPlanRow);
    WORKOUTS = data.flatMap((row) => (row.workouts || []).map(mapWorkoutRow));
    writeCache(CACHE_KEY_PLANS, PLANS);
    writeCache(CACHE_KEY_WORKOUTS, WORKOUTS);
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
      durationSeconds: row.duration_seconds,
      distanceValue: row.distance_value,
      distanceUnit: row.distance_unit,
      paceSeconds: row.pace_seconds,
      speedKmh: row.speed_kmh,
      notes: row.notes,
      legs: row.legs || null,
    };
  }

  /* Returns the queued outbox entries in the same shape loadHistory's
     rows are mapped to, so they can be merged straight into the
     rendered list while they wait to sync. */
  function pendingHistoryEntries() {
    return readOutbox().map((entry) => ({
      id: entry.localId,
      workoutId: entry.workoutId,
      loggedISO: entry.loggedISO,
      pace: entry.pace,
      duration: entry.duration,
      distance: entry.distance,
      effort: entry.effort,
      durationSeconds: entry.durationSeconds ?? null,
      distanceValue: entry.distanceValue ?? null,
      distanceUnit: entry.distanceUnit ?? null,
      paceSeconds: entry.paceSeconds ?? null,
      speedKmh: entry.speedKmh ?? null,
      notes: entry.notes,
      legs: entry.legs || null,
      pendingSync: true,
    }));
  }

  async function loadHistory() {
    const { data, error } = await supabaseClient
      .from("workout_logs")
      .select("*")
      .order("logged_at", { ascending: false });
    if (error) {
      console.error("Could not load history, falling back to cache", error);
      const cached = readCache(CACHE_KEY_HISTORY) || [];
      return pendingHistoryEntries().concat(cached);
    }
    const synced = data.map(mapLogRow);
    writeCache(CACHE_KEY_HISTORY, synced);
    return pendingHistoryEntries().concat(synced);
  }

  async function addHistoryEntry(entry) {
    const { data, error } = await supabaseClient
      .from("workout_logs")
      .insert({
        workout_id: entry.workoutId,
        logged_at: entry.loggedISO,
        pace: entry.pace,
        duration: entry.duration,
        distance: entry.distance,
        effort: entry.effort,
        duration_seconds: entry.durationSeconds ?? null,
        distance_value: entry.distanceValue ?? null,
        distance_unit: entry.distanceUnit ?? null,
        pace_seconds: entry.paceSeconds ?? null,
        speed_kmh: entry.speedKmh ?? null,
        notes: entry.notes,
        legs: entry.legs || null,
      })
      .select()
      .single();
    if (error) {
      if (!navigator.onLine) return null;
      console.error("Could not save workout log", error);
      return null;
    }
    return data.id;
  }

  function isPendingEntryId(id) {
    return typeof id === "string" && id.startsWith("local-");
  }

  function removeOutboxEntry(localId) {
    writeOutbox(readOutbox().filter((entry) => entry.localId !== localId));
  }

  async function deleteHistoryEntry(id) {
    if (isPendingEntryId(id)) {
      removeOutboxEntry(id);
      return;
    }
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
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "1.4");
    icon.setAttribute("stroke-linecap", "round");
    icon.setAttribute("stroke-linejoin", "round");
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "10");
    const hands = document.createElementNS("http://www.w3.org/2000/svg", "path");
    hands.setAttribute("d", "M12 6v6l4 2");
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

  /* True once a workout's own scheduled date is after today - only
     future workouts get their plan target swapped for a computed pace
     range, so logged history for a workout that already happened
     never has its displayed target rewritten after the fact. */
  function isFutureWorkout(workout) {
    return Boolean(workout && workout.date && workout.date > todayIso());
  }

  /* For a future single-discipline workout, swaps the plan's static
     target value for the computed pace range from its matching zone
     (by workout title) when one exists - past workouts, and any
     workout whose title isn't a recognised zone, keep the plan's own
     target value unchanged. */
  function targetValueForWorkout(workout, sport, planValue) {
    if (!isFutureWorkout(workout)) return planValue;
    const zone = findZoneForTitle(sport, workout.title);
    if (!zone) return planValue;
    return formatPaceZoneRange(zone, flattenLoggableItems()) || planValue;
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
    const legs = BRICK_LEG_ORDER.filter((leg) => workout.discipline[leg]);
    const sport = legs.length > 0 ? legs[0] : workout.disciplineType;
    value.textContent = targetValueForWorkout(workout, sport, target.value);
    container.append(label, value);
  }

  /* Builds one discipline's Warm-up / Main Set / Cool-down blocks
     (each optional) into the given container, under an optional
     heading. Used directly for run/swim/bike, and once per leg for a
     brick session (e.g. Bike then Run, or Swim then Bike). When legSport
     and workout are both given (the brick case) and the workout is a
     future one whose title matches a recognised pace zone for that
     leg's sport, a computed target range is shown under the heading -
     mirroring the single-discipline Target box, but per leg, since a
     brick's two legs can be in different zones (e.g. an easy bike into
     a quality run). */
  function appendDisciplineStructure(container, discipline, headingText, legSport, workout) {
    const hasStructure = discipline.warmup || discipline.mainSet || discipline.cooldown;
    if (!hasStructure) return;

    if (headingText) {
      const heading = document.createElement("h2");
      heading.className = "section-heading";
      heading.textContent = headingText;
      container.appendChild(heading);
    }

    if (legSport && workout && isFutureWorkout(workout)) {
      const zone = findZoneForTitle(legSport, workout.title);
      const range = zone ? formatPaceZoneRange(zone, flattenLoggableItems()) : null;
      if (range) {
        const targetLabel = discipline.target ? discipline.target.label : legSport === "bike" ? "Target speed" : "Target pace";
        const targetBlock = document.createElement("div");
        targetBlock.className = "detail-leg-target";
        const label = document.createElement("p");
        label.className = "field-label";
        label.textContent = targetLabel;
        const value = document.createElement("p");
        value.className = "detail-target-value";
        value.textContent = range;
        targetBlock.append(label, value);
        container.appendChild(targetBlock);
      }
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
        appendDisciplineStructure(container, workout.discipline[leg], legLabels[leg], leg, workout);
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
     logging a fresh workout from its Detail screen. logFormWorkout
     tracks whichever workout the form is currently laid out for (the
     scheduled workout for a fresh log, or the edited entry's own
     workout) so handleSaveWorkout knows its discipline_type without
     relying on currentWorkout, which may point elsewhere while editing. */
  let editingEntryId = null;
  let logFormWorkout = null;

  /* Splits an ISO timestamp into the local date/time strings the two
     native inputs expect ("YYYY-MM-DD" / "HH:MM"), using local time
     (not UTC) so the fields show what the picker's clock actually
     read at that moment. */
  function setLoggedDateTimeInputs(iso) {
    const date = iso ? new Date(iso) : new Date();
    const pad = (n) => String(n).padStart(2, "0");
    document.getElementById("loggedDateInput").value =
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    document.getElementById("loggedTimeInput").value = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  /* Prefills the Date/Time fields for a fresh log (not editing an
     existing entry) from the workout's own scheduled date rather than
     always today - logging a workout late (or ahead of time) should
     default to the day it was actually scheduled for. When that date
     is today, the time defaults to right now as before; otherwise
     there's no meaningful "current time" for that day, so it defaults
     to noon instead. */
  function setLoggedDateTimeInputsForWorkout(workout) {
    if (!workout || !workout.date) {
      setLoggedDateTimeInputs(null);
      return;
    }
    const now = new Date();
    const isToday = workout.date === localDateIso(now);
    const pad = (n) => String(n).padStart(2, "0");
    document.getElementById("loggedDateInput").value = workout.date;
    document.getElementById("loggedTimeInput").value = isToday ? `${pad(now.getHours())}:${pad(now.getMinutes())}` : "12:00";
  }

  /* Combines the two inputs back into an ISO timestamp. Falls back to
     the current moment if either field is left empty. */
  function readLoggedDateTimeInputs() {
    const dateValue = document.getElementById("loggedDateInput").value;
    const timeValue = document.getElementById("loggedTimeInput").value || "00:00";
    if (!dateValue) return new Date().toISOString();
    const local = new Date(`${dateValue}T${timeValue}:00`);
    return Number.isNaN(local.getTime()) ? new Date().toISOString() : local.toISOString();
  }

  /* Which sport each discipline_type shows on the Log form, and (for
     bricks) which two sports and in what order. Kept as one lookup so
     the sport-specific labels/units live in a single place instead of
     being duplicated across openLog/openEditLog. */
  const SPORT_LABEL = { run: "Run", bike: "Bike", swim: "Swim" };
  const SPORT_DISTANCE_UNIT = { run: "km", bike: "km", swim: "m" };
  const SPORT_USES_SPEED = { bike: true };
  const BRICK_LEGS = {
    brick_bike_run: ["bike", "run"],
    brick_swim_bike: ["swim", "bike"],
  };

  function legsForDisciplineType(disciplineType) {
    return BRICK_LEGS[disciplineType] || null;
  }

  /* ------------------------------------------------------------------
   * Structured duration/pace/speed/distance inputs
   *
   * Duration and pace are entered as segmented digit boxes (h:mm:ss for
   * duration, m:ss "per unit" for pace) rather than free text, and are
   * stored as plain integer seconds - durationSeconds is the whole
   * segment's total, paceSeconds is seconds per km (run) or per 100m
   * (swim). Speed (bike) and distance are plain decimal numbers, kept
   * as numbers rather than formatted strings for the same reason: all
   * four need to support real averages/ranges once PBs and paces read
   * back through logged history, which free text like "5:30/km" or
   * "35 min" never could without re-parsing.
   * ---------------------------------------------------------------- */

  /* Builds `segmentCount` digit boxes (2 for pace, 3 for duration) into
     container, each capped at 2 digits and auto-advancing focus to the
     next box once filled - backspace on an empty box steps back to the
     previous one, matching how a native multi-field time entry feels. */
  function buildTimeInputGroup(container, segmentCount) {
    container.innerHTML = "";
    for (let i = 0; i < segmentCount; i++) {
      if (i > 0) {
        const sep = document.createElement("span");
        sep.className = "time-input-sep";
        sep.textContent = ":";
        sep.setAttribute("aria-hidden", "true");
        container.appendChild(sep);
      }
      const input = document.createElement("input");
      input.type = "tel";
      input.inputMode = "numeric";
      input.maxLength = 2;
      input.className = "time-input-segment";
      input.placeholder = "00";
      input.addEventListener("input", () => {
        input.value = input.value.replace(/[^0-9]/g, "").slice(0, 2);
        if (input.value.length === 2) {
          const next = input.nextElementSibling && input.nextElementSibling.nextElementSibling;
          if (next && next.classList.contains("time-input-segment")) next.focus();
        }
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Backspace" && !input.value) {
          const prevSep = input.previousElementSibling;
          const prev = prevSep && prevSep.previousElementSibling;
          if (prev && prev.classList.contains("time-input-segment")) prev.focus();
        }
      });
      container.appendChild(input);
    }
  }

  function timeGroupSegments(groupId) {
    return Array.from(document.querySelectorAll(`#${groupId} .time-input-segment`));
  }

  /* Reads a time group back as total seconds - h:mm:ss for a 3-segment
     duration group, m:ss for a 2-segment pace group. Returns null when
     every segment is empty (nothing entered) rather than 0, so a blank
     duration/pace isn't indistinguishable from a real zero. */
  function readTimeGroupSeconds(groupId) {
    const segments = timeGroupSegments(groupId);
    if (segments.every((s) => s.value === "")) return null;
    const values = segments.map((s) => Number(s.value) || 0);
    if (values.length === 3) return values[0] * 3600 + values[1] * 60 + values[2];
    return values[0] * 60 + values[1];
  }

  /* Writes total seconds back into a time group's segments. Clears all
     segments (rather than writing "0") when seconds is null/undefined
     so an entry with no recorded duration/pace shows a blank group. */
  function writeTimeGroupSeconds(groupId, totalSeconds) {
    const segments = timeGroupSegments(groupId);
    if (totalSeconds === null || totalSeconds === undefined) {
      segments.forEach((s) => (s.value = ""));
      return;
    }
    let remaining = Math.max(0, Math.round(totalSeconds));
    const parts = [];
    if (segments.length === 3) {
      parts.push(Math.floor(remaining / 3600));
      remaining %= 3600;
    }
    parts.push(Math.floor(remaining / 60));
    parts.push(remaining % 60);
    segments.forEach((s, i) => (s.value = String(parts[i])));
  }

  function readNumberField(id) {
    const raw = document.getElementById(id).value;
    return raw === "" ? null : Number(raw);
  }

  function writeNumberField(id, value) {
    document.getElementById(id).value = value === null || value === undefined ? "" : value;
  }

  /* Shows the single-discipline fields (with the pace/speed field and
     distance unit matched to the sport) or the two-leg brick fields,
     based on the workout's discipline_type. Falls back to the plain
     single-discipline pace form for anything without a recognised
     type, e.g. legacy rows or Race Day. */
  function applyLogFormForWorkout(workout) {
    const disciplineType = workout ? workout.disciplineType : null;
    const legs = legsForDisciplineType(disciplineType);
    const singleFields = document.getElementById("logSingleFields");
    const brickFields = document.getElementById("logBrickFields");
    const sharedNotes = document.getElementById("logSharedNotes");

    if (legs) {
      singleFields.hidden = true;
      brickFields.hidden = false;
      sharedNotes.hidden = true;
      const [legOneSport, legTwoSport] = legs;
      document.getElementById("logLegOneHeading").textContent = SPORT_LABEL[legOneSport];
      applyMetricFieldForSport("legOnePaceWrap", "legOneSpeedWrap", "legOnePaceGroup", legOneSport);
      document.getElementById("legOneDistanceUnit").textContent = SPORT_DISTANCE_UNIT[legOneSport];
      document.getElementById("logLegTwoHeading").textContent = SPORT_LABEL[legTwoSport];
      applyMetricFieldForSport("legTwoPaceWrap", "legTwoSpeedWrap", "legTwoPaceGroup", legTwoSport);
      document.getElementById("legTwoDistanceUnit").textContent = SPORT_DISTANCE_UNIT[legTwoSport];
      return { legs };
    }

    singleFields.hidden = false;
    brickFields.hidden = true;
    sharedNotes.hidden = false;
    const sport = SPORT_LABEL[disciplineType] ? disciplineType : "run";
    applyMetricFieldForSport("paceInputWrap", "speedInputWrap", "paceInputGroup", sport);
    document.getElementById("distanceInputUnit").textContent = SPORT_DISTANCE_UNIT[sport];
    return { legs: null };
  }

  /* Shows the pace group or the speed number field for one metric slot
     (a single-discipline log, or one brick leg), and (re)builds the
     pace group's digit boxes if it isn't built yet. */
  function applyMetricFieldForSport(paceWrapId, speedWrapId, paceGroupId, sport) {
    const paceWrap = document.getElementById(paceWrapId);
    const speedWrap = document.getElementById(speedWrapId);
    const paceGroup = document.getElementById(paceGroupId);
    if (!paceGroup.childElementCount) buildTimeInputGroup(paceGroup, 2);
    const usesSpeed = Boolean(SPORT_USES_SPEED[sport]);
    paceWrap.hidden = usesSpeed;
    speedWrap.hidden = !usesSpeed;
    const label = paceWrap.querySelector(".field-label");
    if (label) label.textContent = sport === "swim" ? "Pace (per 100m)" : "Pace (per km)";
  }

  function openLog() {
    if (!currentWorkout) return;
    editingEntryId = null;
    logFormWorkout = currentWorkout;
    document.getElementById("logTitle").textContent = "Log workout";
    document.getElementById("logWorkoutName").textContent = currentWorkout.title;
    setLoggedDateTimeInputsForWorkout(currentWorkout);
    const { legs } = applyLogFormForWorkout(currentWorkout);
    writeTimeGroupSeconds("paceInputGroup", null);
    writeTimeGroupSeconds("durationInputGroup", null);
    writeNumberField("speedInput", null);
    writeNumberField("distanceInput", null);
    document.getElementById("notesInput").value = "";
    renderEffortGroup("effortGroup", null);
    if (legs) {
      clearBrickFields();
      renderEffortGroup("legOneEffortGroup", null);
      renderEffortGroup("legTwoEffortGroup", null);
    }
    goTo("log");
  }

  function clearBrickFields() {
    writeTimeGroupSeconds("legOnePaceGroup", null);
    writeTimeGroupSeconds("legOneDurationGroup", null);
    writeNumberField("legOneSpeedInput", null);
    writeNumberField("legOneDistanceInput", null);
    document.getElementById("legOneNotesInput").value = "";
    writeTimeGroupSeconds("legTwoPaceGroup", null);
    writeTimeGroupSeconds("legTwoDurationGroup", null);
    writeNumberField("legTwoSpeedInput", null);
    writeNumberField("legTwoDistanceInput", null);
    document.getElementById("legTwoNotesInput").value = "";
  }

  /* Opens the Log screen pre-filled with an existing entry's values,
     so saving updates that entry instead of creating a new one. The
     entry's own workout (not necessarily currentWorkout, which may be
     unset or pointing at something else entirely) supplies the title
     and discipline type shown/used on the form. */
  function openEditLog(entry) {
    const workout = findWorkout(entry.workoutId);
    editingEntryId = entry.id;
    logFormWorkout = workout;
    document.getElementById("logTitle").textContent = "Edit workout";
    document.getElementById("logWorkoutName").textContent = workout ? workout.title : "Workout";
    setLoggedDateTimeInputs(entry.loggedISO);
    const { legs } = applyLogFormForWorkout(workout);
    writeTimeGroupSeconds("paceInputGroup", entry.paceSeconds);
    writeTimeGroupSeconds("durationInputGroup", entry.durationSeconds);
    writeNumberField("speedInput", entry.speedKmh);
    writeNumberField("distanceInput", entry.distanceValue);
    document.getElementById("notesInput").value = entry.notes || "";
    renderEffortGroup("effortGroup", entry.effort);
    if (legs) {
      const [legOne, legTwo] = entry.legs || [];
      writeTimeGroupSeconds("legOnePaceGroup", legOne ? legOne.paceSeconds : null);
      writeTimeGroupSeconds("legOneDurationGroup", legOne ? legOne.durationSeconds : null);
      writeNumberField("legOneSpeedInput", legOne ? legOne.speedKmh : null);
      writeNumberField("legOneDistanceInput", legOne ? legOne.distanceValue : null);
      document.getElementById("legOneNotesInput").value = (legOne && legOne.notes) || "";
      renderEffortGroup("legOneEffortGroup", legOne ? legOne.effort : null);
      writeTimeGroupSeconds("legTwoPaceGroup", legTwo ? legTwo.paceSeconds : null);
      writeTimeGroupSeconds("legTwoDurationGroup", legTwo ? legTwo.durationSeconds : null);
      writeNumberField("legTwoSpeedInput", legTwo ? legTwo.speedKmh : null);
      writeNumberField("legTwoDistanceInput", legTwo ? legTwo.distanceValue : null);
      document.getElementById("legTwoNotesInput").value = (legTwo && legTwo.notes) || "";
      renderEffortGroup("legTwoEffortGroup", legTwo ? legTwo.effort : null);
    }
    goTo("log");
  }

  /* Native radio inputs (visually hidden, each wrapped in a styled
     label) rather than a hand-rolled role="radio" widget, so arrow
     keys, Home/End and single-tab-stop grouping all come from the
     browser for free instead of needing custom keyboard handling.
     selected pre-checks a value when editing an existing entry. groupId
     is the container id - effortGroup for a single-discipline log, or
     legOneEffortGroup/legTwoEffortGroup for a brick's two legs - and
     also becomes the radio group's name so the three groups (when a
     brick's fields are all on screen at once) don't interfere. */
  function renderEffortGroup(groupId, selected) {
    const group = document.getElementById(groupId);
    group.innerHTML = "";
    for (let i = 1; i <= 10; i++) {
      const label = document.createElement("label");
      label.className = "effort-btn";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = groupId;
      input.value = String(i);
      input.className = "effort-btn-input";
      if (selected === i) input.checked = true;

      const text = document.createElement("span");
      text.textContent = String(i);

      label.append(input, text);
      group.appendChild(label);
    }
  }

  function selectedEffort(groupId) {
    const checked = document.querySelector(`#${groupId} input[name="${groupId}"]:checked`);
    return checked ? Number(checked.value) : null;
  }

  /* Reads one brick leg's fields back from its inputs (prefix is
     "legOne" or "legTwo") into the structured shape stored in the
     legs jsonb array. */
  function buildLegFields(sport, prefix) {
    const usesSpeed = Boolean(SPORT_USES_SPEED[sport]);
    return {
      sport,
      durationSeconds: readTimeGroupSeconds(prefix + "DurationGroup"),
      distanceValue: readNumberField(prefix + "DistanceInput"),
      distanceUnit: document.getElementById(prefix + "DistanceUnit").textContent,
      paceSeconds: usesSpeed ? null : readTimeGroupSeconds(prefix + "PaceGroup"),
      speedKmh: usesSpeed ? readNumberField(prefix + "SpeedInput") : null,
      effort: selectedEffort(prefix + "EffortGroup"),
      notes: document.getElementById(prefix + "NotesInput").value.trim(),
    };
  }

  async function handleSaveWorkout() {
    if (!editingEntryId && !currentWorkout) return;
    const legs = legsForDisciplineType(logFormWorkout ? logFormWorkout.disciplineType : null);

    const fields = legs
      ? {
          loggedISO: readLoggedDateTimeInputs(),
          pace: "",
          duration: "",
          distance: "",
          effort: null,
          durationSeconds: null,
          distanceValue: null,
          distanceUnit: null,
          paceSeconds: null,
          speedKmh: null,
          notes: "",
          legs: [
            buildLegFields(legs[0], "legOne"),
            buildLegFields(legs[1], "legTwo"),
          ],
        }
      : {
          loggedISO: readLoggedDateTimeInputs(),
          pace: "",
          duration: "",
          distance: "",
          effort: selectedEffort("effortGroup"),
          durationSeconds: readTimeGroupSeconds("durationInputGroup"),
          distanceValue: readNumberField("distanceInput"),
          distanceUnit: document.getElementById("distanceInputUnit").textContent,
          paceSeconds: SPORT_USES_SPEED[logFormWorkout ? logFormWorkout.disciplineType : null]
            ? null
            : readTimeGroupSeconds("paceInputGroup"),
          speedKmh: SPORT_USES_SPEED[logFormWorkout ? logFormWorkout.disciplineType : null]
            ? readNumberField("speedInput")
            : null,
          notes: document.getElementById("notesInput").value.trim(),
          legs: null,
        };

    const wasEditing = Boolean(editingEntryId);
    let queuedOffline = false;
    if (editingEntryId && isPendingEntryId(editingEntryId)) {
      const outbox = readOutbox();
      const queued = outbox.find((entry) => entry.localId === editingEntryId);
      if (queued) Object.assign(queued, fields);
      writeOutbox(outbox);
      lastSavedEntryId = editingEntryId;
    } else if (editingEntryId) {
      await updateHistoryEntry(editingEntryId, fields);
      lastSavedEntryId = editingEntryId;
    } else {
      const newEntry = Object.assign({ workoutId: currentWorkout.id }, fields);
      const savedId = await addHistoryEntry(newEntry);
      if (savedId) {
        lastSavedEntryId = savedId;
      } else if (!navigator.onLine) {
        lastSavedEntryId = queueOutboxEntry(newEntry).localId;
        queuedOffline = true;
      }
    }
    editingEntryId = null;
    logFormWorkout = null;

    selectedCalendarDate = localDateIso(new Date(fields.loggedISO));
    calendarMonthCursor = { year: new Date(fields.loggedISO).getFullYear(), month: new Date(fields.loggedISO).getMonth() };
    nav.stack = ["plans", "calendar"];
    await renderCalendar();
    showScreen("calendar");
    showSaveBanner(queuedOffline ? "Saved offline - will sync later" : wasEditing ? "Changes saved" : "Workout saved");
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
   * Calendar screen
   *
   * A month grid is the only way to browse past/logged workouts now
   * (there is no separate flat History list any more). Each day cell
   * carries two independent markers - a "scheduled" dot sourced from
   * WORKOUTS, and a "logged" dot sourced from historyEntries - since a
   * day can have either, both or neither and that distinction is the
   * whole point of the view. Selecting a day filters the list below
   * the grid to that day's scheduled workout (if any) and logged
   * entries (if any).
   * ---------------------------------------------------------------- */

  let lastSavedEntryId = null;
  let historyEntries = [];
  let loggedWorkoutIds = new Set();
  let calendarMonthCursor = null; // { year, month } (month is 0-indexed)
  let selectedCalendarDate = null; // "YYYY-MM-DD"

  /* Refreshes both the Calendar screen's own data and the set of
     logged workout ids that the Week/Library screens use to show a
     workout as done, so the two never drift out of sync. */
  async function refreshHistoryData() {
    historyEntries = await loadHistory();
    loggedWorkoutIds = new Set(historyEntries.map((entry) => entry.workoutId));
  }

  /* Same local-time convention as todayIso(): the calendar groups a
     logged entry onto the day its device clock actually read, not its
     UTC date, so a late-evening log doesn't jump to the next day. */
  function localDateIso(date) {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return date.getFullYear() + "-" + month + "-" + day;
  }

  function historyEntriesForDate(iso) {
    return historyEntries.filter((entry) => localDateIso(new Date(entry.loggedISO)) === iso);
  }

  const MONTH_FORMATTER = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

  async function renderCalendar() {
    await refreshHistoryData();
    if (!calendarMonthCursor) {
      const today = new Date();
      calendarMonthCursor = { year: today.getFullYear(), month: today.getMonth() };
    }
    if (!selectedCalendarDate) selectedCalendarDate = todayIso();
    renderCalendarGrid();
    renderCalendarDayList();
  }

  function renderCalendarGrid() {
    const { year, month } = calendarMonthCursor;
    document.getElementById("calendarMonthTitle").textContent = MONTH_FORMATTER.format(new Date(year, month, 1));

    const gridEl = document.getElementById("calendarGrid");
    gridEl.innerHTML = "";

    const firstOfMonth = new Date(year, month, 1);
    const leadingBlanks = (firstOfMonth.getDay() + 6) % 7; // Monday-first grid
    const gridStart = new Date(year, month, 1 - leadingBlanks);

    for (let i = 0; i < 42; i++) {
      const cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      const cellIso = localDateIso(cellDate);
      gridEl.appendChild(buildCalendarDayCell(cellDate, cellIso, cellDate.getMonth() === month));
    }
  }

  function buildCalendarDayCell(cellDate, cellIso, inCurrentMonth) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "calendar-day";
    if (!inCurrentMonth) btn.classList.add("is-outside-month");
    if (cellIso === todayIso()) btn.classList.add("is-today");
    if (cellIso === selectedCalendarDate) btn.classList.add("is-selected");

    const label = document.createElement("span");
    label.className = "calendar-day-number";
    label.textContent = String(cellDate.getDate());
    btn.appendChild(label);

    const dots = document.createElement("span");
    dots.className = "calendar-day-dots";
    if (workoutForDate(cellIso)) {
      const dot = document.createElement("span");
      dot.className = "calendar-dot calendar-dot--scheduled";
      dots.appendChild(dot);
    }
    if (historyEntriesForDate(cellIso).length > 0) {
      const dot = document.createElement("span");
      dot.className = "calendar-dot calendar-dot--logged";
      dots.appendChild(dot);
    }
    btn.appendChild(dots);

    btn.addEventListener("click", () => {
      selectedCalendarDate = cellIso;
      if (cellDate.getMonth() !== calendarMonthCursor.month || cellDate.getFullYear() !== calendarMonthCursor.year) {
        calendarMonthCursor = { year: cellDate.getFullYear(), month: cellDate.getMonth() };
      }
      renderCalendarGrid();
      renderCalendarDayList();
    });

    return btn;
  }

  function changeCalendarMonth(delta) {
    const { year, month } = calendarMonthCursor;
    const next = new Date(year, month + delta, 1);
    calendarMonthCursor = { year: next.getFullYear(), month: next.getMonth() };
    renderCalendarGrid();
  }

  function renderCalendarDayList() {
    const titleEl = document.getElementById("calendarDayTitle");
    const listEl = document.getElementById("calendarDayList");
    const emptyEl = document.getElementById("calendarDayEmpty");
    titleEl.textContent = formatDate(selectedCalendarDate);
    listEl.innerHTML = "";

    const scheduled = workoutForDate(selectedCalendarDate);
    const logged = historyEntriesForDate(selectedCalendarDate);

    if (!scheduled && logged.length === 0) {
      emptyEl.hidden = false;
      listEl.hidden = true;
      return;
    }
    emptyEl.hidden = true;
    listEl.hidden = false;

    if (scheduled) {
      listEl.appendChild(buildDayListSubheading("Scheduled", "scheduled"));
      listEl.appendChild(buildScheduledDayRow(scheduled));
    }
    if (logged.length > 0) {
      listEl.appendChild(buildDayListSubheading("Logged", "logged"));
      logged.forEach((entry) => listEl.appendChild(buildHistoryRow(entry)));
    }
  }

  function buildDayListSubheading(label, kind) {
    const li = document.createElement("li");
    li.className = "thumb-list-subheading";
    const dot = document.createElement("span");
    dot.className = "calendar-dot calendar-dot--" + kind;
    const text = document.createElement("span");
    text.textContent = label;
    li.append(dot, text);
    return li;
  }

  /* A scheduled-but-not-yet-logged workout is still worth surfacing on
     its day (it's the "what was I supposed to do" half of the view),
     so it gets its own row that opens the normal Detail/Log flow
     rather than only ever showing entries that already exist. */
  function buildScheduledDayRow(workout) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "thumb-row";

    const photo = document.createElement("img");
    photo.className = "thumb-row-photo";
    photo.src = workout.cover;
    photo.alt = "";
    photo.loading = "lazy";

    const text = document.createElement("div");
    text.className = "thumb-row-text";
    const title = document.createElement("span");
    title.className = "thumb-row-title";
    title.textContent = workout.title;
    const subtitle = document.createElement("span");
    subtitle.className = "thumb-row-subtitle";
    buildSubtitle(subtitle, [
      "Week " + workout.week,
      loggedWorkoutIds.has(workout.id) ? "Scheduled - logged" : "Scheduled - not logged",
    ]);
    text.append(title, subtitle);

    const chevron = buildChevron();
    btn.append(photo, text, chevron);
    btn.addEventListener("click", () => openDetail(workout.id));
    li.appendChild(btn);
    return li;
  }

  function buildChevron(className = "thumb-row-chevron") {
    const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    chevron.setAttribute("class", className);
    chevron.setAttribute("viewBox", "0 0 24 24");
    chevron.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "m9 18 6-6-6-6");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    chevron.appendChild(path);
    return chevron;
  }

  /* Formats a duration in seconds as h:mm:ss (always all three
     segments, matching how it's entered). Returns "" for null/0 so
     callers can just skip it when building a summary line. */
  function formatDurationSeconds(totalSeconds) {
    if (totalSeconds === null || totalSeconds === undefined) return "";
    const s = Math.max(0, Math.round(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  /* Formats a pace in seconds-per-unit as m:ss, with the "/km" or
     "/100m" suffix a reader needs to make sense of the number. */
  function formatPaceSeconds(totalSeconds, sport) {
    if (totalSeconds === null || totalSeconds === undefined) return "";
    const s = Math.max(0, Math.round(totalSeconds));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    const unit = sport === "swim" ? "/100m" : "/km";
    return `${m}:${String(sec).padStart(2, "0")}${unit}`;
  }

  function formatDistance(value, unit) {
    if (value === null || value === undefined) return "";
    return `${value} ${unit || ""}`.trim();
  }

  /* One leg's or a single-discipline entry's headline metric (pace or
     speed, whichever the sport uses) formatted for display - prefers
     the structured numeric fields, falling back to the old free-text
     pace/speed strings for entries logged before this existed. */
  function formatEntryMetric(entry, sport) {
    if (SPORT_USES_SPEED[sport]) {
      if (entry.speedKmh !== null && entry.speedKmh !== undefined) return entry.speedKmh + " km/h";
      return entry.speed || "";
    }
    if (entry.paceSeconds !== null && entry.paceSeconds !== undefined) return formatPaceSeconds(entry.paceSeconds, sport);
    return entry.pace || "";
  }

  function formatEntryDuration(entry) {
    if (entry.durationSeconds !== null && entry.durationSeconds !== undefined) return formatDurationSeconds(entry.durationSeconds);
    return entry.duration || "";
  }

  function formatEntryDistance(entry) {
    if (entry.distanceValue !== null && entry.distanceValue !== undefined) return formatDistance(entry.distanceValue, entry.distanceUnit);
    return entry.distance || "";
  }

  /* One leg's headline stat for row subtitles/summaries, e.g.
     "Bike 20 km @ 28 km/h" or "Run 3 km @ 4:30/km". Falls back to just
     the duration when neither distance nor a pace/speed value was
     logged for that leg. */
  function summarizeLeg(leg) {
    if (!leg) return "";
    const label = SPORT_LABEL[leg.sport] || leg.sport;
    const metric = formatEntryMetric(leg, leg.sport);
    const distance = formatEntryDistance(leg);
    const duration = formatEntryDuration(leg);
    const parts = [label];
    if (distance) parts.push(distance);
    if (metric) parts.push("@ " + metric);
    if (!distance && !metric && duration) parts.push(duration);
    return parts.join(" ");
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
    if (entry.legs && entry.legs.length > 0) {
      entry.legs.forEach((leg) => {
        const summary = summarizeLeg(leg);
        if (summary) subtitleParts.push(summary);
      });
    } else if (entry.effort) {
      subtitleParts.push("Effort " + entry.effort + "/10");
    }
    if (entry.pendingSync) subtitleParts.push("Pending sync");
    buildSubtitle(subtitle, subtitleParts);
    text.append(title, subtitle);
    if (entry.notes) {
      const notes = document.createElement("span");
      notes.className = "thumb-row-notes";
      notes.textContent = entry.notes;
      text.appendChild(notes);
    }

    const chevron = buildChevron();
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

    const singleStats = document.getElementById("historyDetailSingleStats");
    const legsContainer = document.getElementById("historyDetailLegs");
    if (entry.legs && entry.legs.length > 0) {
      singleStats.hidden = true;
      legsContainer.hidden = false;
      legsContainer.innerHTML = "";
      entry.legs.forEach((leg) => {
        const heading = document.createElement("h3");
        heading.className = "section-heading";
        heading.textContent = SPORT_LABEL[leg.sport] || leg.sport;
        const list = document.createElement("dl");
        list.className = "dialog-detail-list";
        const rows = [
          ["Duration", formatEntryDuration(leg) || "-"],
          ["Distance", formatEntryDistance(leg) || "-"],
          [leg.sport === "bike" ? "Speed" : "Pace", formatEntryMetric(leg, leg.sport) || "-"],
          ["Effort", leg.effort ? leg.effort + "/10" : "-"],
        ];
        rows.forEach(([label, value]) => {
          const row = document.createElement("div");
          const dt = document.createElement("dt");
          dt.textContent = label;
          const dd = document.createElement("dd");
          dd.textContent = value;
          row.append(dt, dd);
          list.appendChild(row);
        });
        legsContainer.append(heading, list);
        if (leg.notes) {
          const notesLabel = document.createElement("p");
          notesLabel.className = "field-label";
          notesLabel.textContent = "Notes";
          const notesText = document.createElement("p");
          notesText.className = "dialog-notes-text";
          notesText.textContent = leg.notes;
          legsContainer.append(notesLabel, notesText);
        }
      });
    } else {
      singleStats.hidden = false;
      legsContainer.hidden = true;
      legsContainer.innerHTML = "";
      const sport = workout && workout.disciplineType && SPORT_LABEL[workout.disciplineType] ? workout.disciplineType : "run";
      document.getElementById("historyDetailDuration").textContent = formatEntryDuration(entry) || "-";
      document.getElementById("historyDetailDistance").textContent = formatEntryDistance(entry) || "-";
      document.getElementById("historyDetailPaceLabel").textContent = SPORT_USES_SPEED[sport] ? "Speed" : "Pace";
      document.getElementById("historyDetailPace").textContent = formatEntryMetric(entry, sport) || "-";
      document.getElementById("historyDetailEffort").textContent = entry.effort ? entry.effort + "/10" : "-";
    }

    const notesWrap = document.getElementById("historyDetailNotesWrap");
    const notesText = document.getElementById("historyDetailNotes");
    const hasLegs = entry.legs && entry.legs.length > 0;
    if (!hasLegs && entry.notes) {
      notesWrap.hidden = false;
      notesText.textContent = entry.notes;
    } else {
      notesWrap.hidden = true;
    }
    document.getElementById("historyDetailDialog").showModal();
  }

  /* ------------------------------------------------------------------
   * Profile screen
   *
   * Personal details (profiles table, one row per user) and races
   * (races table, many rows per user) both load fresh every time the
   * screen opens - there's no cross-screen cache for either the way
   * WORKOUTS/historyEntries have. Personal bests are computed from
   * historyEntries, which is already refreshed after every save, edit
   * and delete (via renderCalendar -> refreshHistoryData on each of
   * those flows) regardless of which screen triggered it - so simply
   * recomputing PBs from the current historyEntries every time the
   * Profile screen opens is enough to keep them in sync, with no extra
   * event wiring needed. Paces are still static placeholder markup.
   * ---------------------------------------------------------------- */

  let races = [];
  let editingRaceId = null;

  async function openProfile() {
    document.getElementById("profileEmail").textContent = currentSession ? currentSession.user.email : "";
    closeAllProfileSections();
    await Promise.all([loadProfileIntoForm(), loadAndRenderRaces()]);
    await refreshHistoryData();
    await renderPersonalBests();
    renderPaces();
    goTo("profile");
  }

  /* All four sections start collapsed every time the Profile screen is
     opened, rather than remembering what was expanded last time. */
  function closeAllProfileSections() {
    document.querySelectorAll(".profile-section").forEach((section) => {
      section.classList.remove("is-open");
      section.querySelector(".profile-section-body").hidden = true;
    });
  }

  /* ------------------------------------------------------------------
   * Personal bests
   *
   * Each of the 8 fixed PB slots (elementId, sport, target distance in
   * that sport's own unit) is filled with the fastest time implied by
   * any logged entry - or brick leg - that actually covers at least
   * that distance (a 10km run's pace can produce a 5km PB estimate,
   * but a 3km run never counts toward 5km, and nothing ever counts
   * toward Half/Full Marathon until a run that long has been logged).
   * A slot with no qualifying entry yet shows "-" rather than a
   * fabricated number. This still isn't a real "best 5km split within
   * a longer run" - it's the whole logged run's average pace, applied
   * to the slot's distance - but it never invents distances you
   * haven't actually covered.
   * ---------------------------------------------------------------- */

  const PB_SLOTS = [
    { id: "pbSwim750m", sport: "swim", distance: 750 },
    { id: "pbSwim1500m", sport: "swim", distance: 1500 },
    { id: "pbSwim1900m", sport: "swim", distance: 1900 },
    { id: "pbSwim3800m", sport: "swim", distance: 3800 },
    { id: "pbBike20km", sport: "bike", distance: 20 },
    { id: "pbBike40km", sport: "bike", distance: 40 },
    { id: "pbBike90km", sport: "bike", distance: 90 },
    { id: "pbBike180km", sport: "bike", distance: 180 },
    { id: "pbRun5km", sport: "run", distance: 5 },
    { id: "pbRun10km", sport: "run", distance: 10 },
    { id: "pbRun21_1km", sport: "run", distance: 21.1 },
    { id: "pbRun42_2km", sport: "run", distance: 42.2 },
  ];

  /* One entry (a plain logged entry, or one brick leg) reduced to just
     what PB matching needs: which sport it was, the distance actually
     covered (normalised to km for run/bike, m for swim, so it can be
     compared against a slot's own distance), and the pace (seconds per
     the sport's own unit - km for run/bike, 100m for swim) it implies.
     This is always derived from the entry's own measured distance +
     duration (or speed, for bike) rather than its separately-typed
     pace field, since duration/distance is the actual recorded effort
     and pace is just a convenience the two of them already determine.
     Entries missing either (legacy free-text-only entries included)
     return null distance/pace and are filtered out by the caller. */
  function paceSecondsPerUnitForEntry(item) {
    if (SPORT_USES_SPEED[item.sport]) {
      if (!item.speedKmh || !item.distanceValue) return { distanceInSportUnit: null, paceSeconds: null };
      const distanceInKm = item.distanceUnit === "m" ? item.distanceValue / 1000 : item.distanceValue;
      return { distanceInSportUnit: distanceInKm, paceSeconds: 3600 / item.speedKmh };
    }
    if (!item.distanceValue || !item.durationSeconds) return { distanceInSportUnit: null, paceSeconds: null };
    if (item.sport === "swim") {
      const distanceInM = item.distanceUnit === "km" ? item.distanceValue * 1000 : item.distanceValue;
      const distanceIn100m = distanceInM / 100;
      if (distanceIn100m <= 0) return { distanceInSportUnit: null, paceSeconds: null };
      return { distanceInSportUnit: distanceInM, paceSeconds: item.durationSeconds / distanceIn100m };
    }
    const distanceInKm = item.distanceUnit === "m" ? item.distanceValue / 1000 : item.distanceValue;
    if (distanceInKm <= 0) return { distanceInSportUnit: null, paceSeconds: null };
    return { distanceInSportUnit: distanceInKm, paceSeconds: item.durationSeconds / distanceInKm };
  }

  /* Flattens historyEntries into one list of {sport, distanceValue,
     distanceUnit, durationSeconds, speedKmh, paceSeconds} items -
     single-discipline entries as themselves (sport read from their
     workout's discipline_type), brick entries as their two legs
     (sport already on each leg). Entries with no recognisable sport,
     or whose workout can't be found, are skipped. */
  function flattenLoggableItems() {
    const items = [];
    historyEntries.forEach((entry) => {
      const workout = findWorkout(entry.workoutId);
      if (entry.legs && entry.legs.length > 0) {
        entry.legs.forEach((leg) => items.push(Object.assign({ title: workout ? workout.title : null }, leg)));
        return;
      }
      const sport = workout && SPORT_LABEL[workout.disciplineType] ? workout.disciplineType : null;
      if (!sport) return;
      items.push(Object.assign({ sport, title: workout.title }, entry));
    });
    return items;
  }

  /* Computed-from-logs time for one slot, in seconds, or null if no
     logged entry actually covers that distance yet. Only entries whose
     own logged distance is at least the slot's distance count - a
     5km PB is only ever estimated from a run of 5km or more, never
     extrapolated up from a shorter session, so a fast 1km interval
     can't produce a fake 5km (or half/full marathon) time. */
  function computedPbSeconds(slot, items) {
    const paces = items
      .filter((item) => item.sport === slot.sport)
      .map((item) => paceSecondsPerUnitForEntry(item))
      .filter((result) => result.paceSeconds !== null && result.distanceInSportUnit >= slot.distance)
      .map((result) => result.paceSeconds);
    if (paces.length === 0) return null;
    const bestPace = Math.min(...paces);
    const targetInSportUnit = slot.sport === "swim" ? slot.distance / 100 : slot.distance;
    return bestPace * targetInSportUnit;
  }

  /* Each tile shows whichever is faster: a manually-set override (from
     before this app existed) or the time the logged history computes.
     If the computed time is now faster than a stored override, that
     override has been beaten - it's dropped from pbOverrides and
     persisted as cleared, so a once-manual PB doesn't linger after a
     real logged workout has genuinely surpassed it. */
  async function renderPersonalBests() {
    const items = flattenLoggableItems();
    let overridesChanged = false;
    PB_SLOTS.forEach((slot) => {
      const el = document.getElementById(slot.id);
      const computed = computedPbSeconds(slot, items);
      const override = pbOverrides[slot.id];
      let best = null;
      if (override !== undefined && override !== null) {
        if (computed !== null && computed < override) {
          delete pbOverrides[slot.id];
          overridesChanged = true;
          best = computed;
        } else {
          best = override;
        }
      } else {
        best = computed;
      }
      el.textContent = best === null ? "-" : formatDurationSeconds(best);
    });
    if (overridesChanged && currentSession) {
      await savePbOverrides(currentSession.user.id, pbOverrides);
    }
  }

  /* ------------------------------------------------------------------
   * Paces
   *
   * Each of the 9 rows (Easy/Threshold-or-Tempo/Race pace x Run/Bike/
   * Swim) gets its own anchor pace: the fastest pace among whichever
   * workout titles represent that zone's effort in this training plan
   * (an "Easy Run" is an easy-effort session by design, a "Quality
   * Run"/"Interval Run" is a threshold-effort session, and so on), then
   * shown as a range around that anchor. There's no dedicated CSS test
   * (400m then 200m time trial) logged, so swim CSS uses the same
   * "fastest pace from threshold-effort-titled swims" anchor as
   * everything else here, which is a well-established practical
   * substitute. A row with no matching titled session logged yet shows
   * "-" rather than inventing a number - consistent with how PBs work. */
  const PACE_ZONES = [
    {
      id: "paceRunEasy",
      sport: "run",
      titles: ["Easy Run"],
      band: (seconds) => [seconds - 3, seconds + 5],
    },
    {
      id: "paceRunThreshold",
      sport: "run",
      titles: ["Quality Run", "Interval Run", "Strides Run"],
      band: (seconds) => [seconds - 3, seconds + 5],
    },
    {
      id: "paceRunRace",
      sport: "run",
      titles: ["Race-Pace Run"],
      band: (seconds) => [seconds - 3, seconds + 5],
    },
    {
      id: "paceBikeEasy",
      sport: "bike",
      titles: ["Endurance Bike"],
      band: (seconds) => [seconds - 3, seconds + 5],
    },
    {
      id: "paceBikeTempo",
      sport: "bike",
      titles: ["Quality Bike", "Tempo Bike"],
      band: (seconds) => [seconds - 3, seconds + 5],
    },
    {
      id: "paceBikeRace",
      sport: "bike",
      titles: ["Race-Pace Bike"],
      band: (seconds) => [seconds - 3, seconds + 5],
    },
    {
      id: "paceSwimEasy",
      sport: "swim",
      titles: ["Pool Swim", "Easy Swim", "Open Water Swim"],
      band: (seconds) => [seconds - 2, seconds + 4],
    },
    {
      id: "paceSwimCss",
      sport: "swim",
      titles: ["Interval Swim", "Endurance Swim"],
      band: (seconds) => [seconds - 2, seconds + 4],
    },
    {
      id: "paceSwimRace",
      sport: "swim",
      titles: ["Race-Pace Swim"],
      band: (seconds) => [seconds - 2, seconds + 4],
    },
  ];

  /* Bike's anchor/band is in speed (km/h), where faster means a
     bigger number - the band is applied around the anchor the same
     way, but formatted and read the opposite direction from a pace. */
  function formatPaceZoneValue(sport, seconds) {
    if (sport === "bike") {
      const kmh = 3600 / seconds;
      return kmh.toFixed(1) + " km/h";
    }
    return formatPaceSeconds(seconds, sport);
  }

  /* The formatted range string for one zone, given the flattened
     logged items - shared by the Paces card and the per-workout
     target range on the Detail screen. Returns null when nothing
     logged yet matches that zone. Run/swim (a smaller pace-seconds
     number is faster) print fastest end first; bike (shown as km/h,
     where a bigger number is faster) prints slowest end first - i.e.
     both read "the end nearer your best effort first". */
  function formatPaceZoneRange(zone, items) {
    const paces = items
      .filter((item) => item.sport === zone.sport && item.title && zone.titles.includes(item.title))
      .map((item) => paceSecondsPerUnitForEntry(item).paceSeconds)
      .filter((pace) => pace !== null && pace > 0);
    if (paces.length === 0) return null;
    const anchor = Math.min(...paces);
    const [fasterSeconds, slowerSeconds] = zone.band(anchor);
    const orderedSeconds = zone.sport === "bike" ? [slowerSeconds, fasterSeconds] : [fasterSeconds, slowerSeconds];
    const first = formatPaceZoneValue(zone.sport, orderedSeconds[0]);
    const second = formatPaceZoneValue(zone.sport, orderedSeconds[1]);
    return `${first}–${second}`;
  }

  /* Matches a workout's own title (or one brick leg's sport, matched
     against its parent workout's title - a "Bike-to-Run Brick" is the
     title both legs share) to the zone whose titles list contains it.
     Falls back to null when the title isn't one of the recognised
     easy/threshold/race-pace session names for that sport - e.g.
     Race Day, or a title not yet added to PACE_ZONES. */
  function findZoneForTitle(sport, title) {
    return PACE_ZONES.find((zone) => zone.sport === sport && zone.titles.includes(title)) || null;
  }

  /* The Paces card shows a range across two lines, broken right after
     the dash (e.g. "5:52/km-" then "6:00/km"), rather than as one long
     line - the tiles are narrow, and this reads more like a range card
     than a run-on string. Only this card does the two-line split; the
     workout target boxes keep the single-line form from
     formatPaceZoneRange. */
  function renderPaceRangeInto(el, rangeString) {
    el.innerHTML = "";
    if (!rangeString) {
      el.textContent = "-";
      return;
    }
    const dashIndex = rangeString.indexOf("–");
    if (dashIndex === -1) {
      el.textContent = rangeString;
      return;
    }
    el.append(
      document.createTextNode(rangeString.slice(0, dashIndex + 1)),
      document.createElement("br"),
      document.createTextNode(rangeString.slice(dashIndex + 1))
    );
  }

  function renderPaces() {
    const items = flattenLoggableItems();
    PACE_ZONES.forEach((zone) => {
      renderPaceRangeInto(document.getElementById(zone.id), formatPaceZoneRange(zone, items));
    });
  }

  function toggleProfileSection(section) {
    const isOpen = section.classList.toggle("is-open");
    section.querySelector(".profile-section-body").hidden = !isOpen;
  }

  let pbOverrides = {};

  async function loadProfileIntoForm() {
    if (!currentSession) return;
    const profile = await loadProfile(currentSession.user.id);
    pbOverrides = (profile && profile.pb_overrides) || {};
    const name = profile ? profile.name : "";
    document.getElementById("profileName").textContent = name || "Your name";
    document.getElementById("profileNameInput").value = name || "";
    document.getElementById("profileDobInput").value = (profile && profile.date_of_birth) || "";
    document.getElementById("profileHeightInput").value = (profile && profile.height_cm) || "";
    document.getElementById("profileWeightInput").value = (profile && profile.weight_kg) || "";
    document.getElementById("profileGenderInput").value = (profile && profile.gender) || "";
  }

  async function handleSaveProfileDetails() {
    if (!currentSession) return;
    const fields = {
      name: document.getElementById("profileNameInput").value.trim(),
      dateOfBirth: document.getElementById("profileDobInput").value || null,
      heightCm: document.getElementById("profileHeightInput").value || null,
      weightKg: document.getElementById("profileWeightInput").value || null,
      gender: document.getElementById("profileGenderInput").value || null,
    };
    await saveProfile(currentSession.user.id, fields);
    document.getElementById("profileName").textContent = fields.name || "Your name";
    const banner = document.getElementById("profileDetailsSaveBanner");
    banner.textContent = "Details saved";
    banner.hidden = false;
    window.setTimeout(() => {
      banner.hidden = true;
    }, 3000);
  }

  async function loadAndRenderRaces() {
    if (!currentSession) return;
    races = await loadRaces(currentSession.user.id);
    renderRaceLists();
  }

  function renderRaceLists() {
    const todayIso = localDateIso(new Date());
    const upcoming = races.filter((r) => r.date >= todayIso);
    const past = races.filter((r) => r.date < todayIso).sort((a, b) => (a.date < b.date ? 1 : -1));

    const upcomingList = document.getElementById("upcomingRaceList");
    const upcomingEmpty = document.getElementById("upcomingRacesEmpty");
    upcomingList.innerHTML = "";
    upcomingEmpty.hidden = upcoming.length > 0;
    upcoming.forEach((race) => upcomingList.appendChild(buildRaceRow(race, true)));

    const pastList = document.getElementById("pastRaceList");
    const pastEmpty = document.getElementById("pastRacesEmpty");
    pastList.innerHTML = "";
    pastEmpty.hidden = past.length > 0;
    past.forEach((race) => pastList.appendChild(buildRaceRow(race, false)));
  }

  function buildRaceRow(race, isUpcoming) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "race-row";

    const text = document.createElement("div");
    text.className = "race-row-text";
    const title = document.createElement("span");
    title.className = "race-row-title";
    title.textContent = race.name;
    const subtitle = document.createElement("span");
    subtitle.className = "race-row-subtitle";
    const subtitleParts = [formatDate(race.date)];
    if (race.discipline) subtitleParts.push(race.discipline);
    if (isUpcoming && race.goal) subtitleParts.push("Goal: " + race.goal);
    subtitle.textContent = subtitleParts.join(" · ");
    text.append(title, subtitle);

    const chevron = buildChevron("race-row-chevron");
    btn.append(text, chevron);
    btn.addEventListener("click", () => openRaceDialog(race));
    li.appendChild(btn);
    return li;
  }

  function openRaceDialog(race) {
    editingRaceId = race ? race.id : null;
    document.getElementById("raceDialogTitle").textContent = race ? "Edit race" : "Add race";
    document.getElementById("raceNameInput").value = race ? race.name : "";
    document.getElementById("raceDateInput").value = race ? race.date : "";
    document.getElementById("raceDisciplineInput").value = (race && race.discipline) || "";
    document.getElementById("raceGoalInput").value = (race && race.goal) || "";
    document.getElementById("raceNotesInput").value = (race && race.notes) || "";
    document.getElementById("raceDialogDeleteRow").hidden = !race;
    document.getElementById("raceDialog").showModal();
  }

  async function handleSaveRace() {
    if (!currentSession) return;
    const name = document.getElementById("raceNameInput").value.trim();
    const date = document.getElementById("raceDateInput").value;
    if (!name || !date) return;
    const fields = {
      name,
      date,
      discipline: document.getElementById("raceDisciplineInput").value.trim() || null,
      goal: document.getElementById("raceGoalInput").value.trim() || null,
      notes: document.getElementById("raceNotesInput").value.trim() || null,
    };
    if (editingRaceId) {
      await updateRace(editingRaceId, fields);
    } else {
      await addRace(currentSession.user.id, fields);
    }
    document.getElementById("raceDialog").close();
    await loadAndRenderRaces();
  }

  async function handleDeleteRace() {
    if (!editingRaceId) return;
    await deleteRace(editingRaceId);
    document.getElementById("raceDialog").close();
    await loadAndRenderRaces();
  }

  /* Which PB slot the override dialog is currently editing - set by
     openPbOverrideDialog, read by handleSavePbOverride/
     handleClearPbOverride. */
  let editingPbSlotId = null;

  function openPbOverrideDialog(slotId, label) {
    editingPbSlotId = slotId;
    document.getElementById("pbOverrideDialogTitle").textContent = "Set PB - " + label;
    const existingSeconds = pbOverrides[slotId];
    writeTimeGroupSeconds("pbOverrideTimeGroup", existingSeconds === undefined ? null : existingSeconds);
    document.getElementById("pbOverrideDeleteRow").hidden = existingSeconds === undefined || existingSeconds === null;
    document.getElementById("pbOverrideDialog").showModal();
  }

  async function handleSavePbOverride() {
    if (!editingPbSlotId || !currentSession) return;
    const seconds = readTimeGroupSeconds("pbOverrideTimeGroup");
    if (seconds === null || seconds <= 0) return;
    pbOverrides[editingPbSlotId] = seconds;
    await savePbOverrides(currentSession.user.id, pbOverrides);
    document.getElementById("pbOverrideDialog").close();
    await renderPersonalBests();
  }

  async function handleClearPbOverride() {
    if (!editingPbSlotId || !currentSession) return;
    delete pbOverrides[editingPbSlotId];
    await savePbOverrides(currentSession.user.id, pbOverrides);
    document.getElementById("pbOverrideDialog").close();
    await renderPersonalBests();
  }

  /* ------------------------------------------------------------------
   * Wiring
   * ---------------------------------------------------------------- */

  /* Reload persistence only covers what can be cheaply and correctly
     rebuilt from a bare screen name: Plans (the default) and Calendar
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

    if (lastScreen === "calendar") {
      await renderCalendar();
      goTo("calendar");
      return;
    }
    if (lastScreen === "profile") {
      await openProfile();
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
    document.getElementById("signinPasswordInput").autocomplete = isSignUp ? "new-password" : "current-password";
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
     over to Plans as the new root screen. currentSession is kept
     around (id/email only ever come from it) so the Profile screen
     doesn't need to re-fetch the session just to know who's signed in. */
  let currentSession = null;

  async function enterApp() {
    currentSession = await getCurrentSession();
    await loadPlansAndWorkouts();
    if (navigator.onLine) await flushOutbox();
    await refreshHistoryData();
    nav.stack = ["plans"];
    renderPlans();
    showScreen("plans");
    await restoreLastScreen();
  }

  async function init() {
    const historyDetailDialog = document.getElementById("historyDetailDialog");
    const deleteConfirmDialog = document.getElementById("deleteConfirmDialog");

    buildTimeInputGroup(document.getElementById("durationInputGroup"), 3);
    buildTimeInputGroup(document.getElementById("legOneDurationGroup"), 3);
    buildTimeInputGroup(document.getElementById("legTwoDurationGroup"), 3);
    buildTimeInputGroup(document.getElementById("pbOverrideTimeGroup"), 3);

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
      currentSession = null;
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

    window.addEventListener("online", async () => {
      await flushOutbox();
      if (nav.stack[nav.stack.length - 1] === "calendar") await renderCalendar();
    });

    document.getElementById("openTodayBtn").addEventListener("click", openToday);
    document.getElementById("openCalendarBtn").addEventListener("click", async () => {
      await renderCalendar();
      goTo("calendar");
    });
    document.getElementById("calendarPrevMonthBtn").addEventListener("click", () => changeCalendarMonth(-1));
    document.getElementById("calendarNextMonthBtn").addEventListener("click", () => changeCalendarMonth(1));
    document.getElementById("libraryBackBtn").addEventListener("click", goBack);
    document.getElementById("weekBackBtn").addEventListener("click", goBack);
    document.getElementById("detailBackBtn").addEventListener("click", goBack);
    document.getElementById("logBackBtn").addEventListener("click", goBack);
    document.getElementById("restBackBtn").addEventListener("click", goBack);
    document.getElementById("calendarBackBtn").addEventListener("click", goBack);
    document.getElementById("profileBackBtn").addEventListener("click", goBack);

    document.getElementById("openProfileBtn").addEventListener("click", openProfile);
    document.getElementById("profileSaveDetailsBtn").addEventListener("click", handleSaveProfileDetails);
    document.getElementById("addRaceBtn").addEventListener("click", () => openRaceDialog(null));
    document.getElementById("raceSaveBtn").addEventListener("click", handleSaveRace);
    document.getElementById("raceDeleteBtn").addEventListener("click", handleDeleteRace);
    document.querySelectorAll(".profile-section-toggle, .profile-section-chevron-btn").forEach((toggle) => {
      toggle.addEventListener("click", () => toggleProfileSection(toggle.closest(".profile-section")));
    });
    document.querySelectorAll(".pb-item").forEach((item) => {
      item.addEventListener("click", () => openPbOverrideDialog(item.dataset.pbSlot, item.dataset.pbLabel));
    });
    document.getElementById("pbOverrideSaveBtn").addEventListener("click", handleSavePbOverride);
    document.getElementById("pbOverrideClearBtn").addEventListener("click", handleClearPbOverride);

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
        await renderCalendar();
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
