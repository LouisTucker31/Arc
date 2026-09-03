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

  function formatDateTime(iso) {
    return dateTimeFormatter.format(new Date(iso));
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
   * A simple in-app stack drives which screen is visible. The browser
   * history API is used only as a trap: every screen change pushes one
   * state so that Chrome's Android back gesture produces a popstate we
   * can react to, rather than closing the installed app outright.
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

  function armHistoryTrap() {
    // Some embedding contexts (and the file:// origin used by local
    // testing tools) refuse history.pushState outright. That should
    // never take down the rest of the app, since the trap is only a
    // nicety for the Android back gesture.
    try {
      history.pushState({ trainingArcTrap: true }, "", location.href);
    } catch (err) {
      console.error("Could not arm history trap", err);
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

  function openPlan(id) {
    const plan = findPlan(id);
    if (!plan) return;
    currentPlan = plan;
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

  /* There is no dedicated week-banner photo in the data model, so a
     week row reuses the cover of whichever workout is first that
     week (already ordered by date via workoutsForPlan). */
  function weekCover(weekGroup) {
    return weekGroup.workouts[0].cover;
  }

  /* Source photos frame their subject at different heights, so a
     single centered crop clips the swimmer/runner/cyclist out of some
     tiles. These are hand-picked vertical focal points (per cent from
     the top), keyed by cover photo path; falls back to a centered
     crop for a photo with no entry. */
  const SESSION_COVER_FOCAL_Y = {
    "assets/photos/olympic-triathlon/easy-run.webp": 20,
    "assets/photos/olympic-triathlon/pool-swim.webp": 50,
    "assets/photos/olympic-triathlon/quality-run.webp": 15,
    "assets/photos/olympic-triathlon/open-water-swim.webp": 50,
    "assets/photos/olympic-triathlon/quality-bike.webp": 20,
    "assets/photos/olympic-triathlon/brick-session.webp": 30,
    "assets/photos/olympic-triathlon/race-day.webp": 35,
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

    const title = document.createElement("h2");
    title.className = "workout-row-title";
    title.textContent = formatDateRange(weekGroup.workouts[0].date, weekGroup.workouts[weekGroup.workouts.length - 1].date);

    const meta = document.createElement("div");
    meta.className = "workout-row-meta";
    const workoutWord = weekGroup.workouts.length === 1 ? "workout" : "workouts";
    buildSubtitle(meta, [weekGroup.workouts.length + " " + workoutWord]);

    const phase = document.createElement("span");
    phase.className = "workout-row-phase";
    phase.textContent = weekGroup.workouts[0].phase;

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
    buildSubtitle(meta, [workout.estimateMinutes + " min"]);

    overlay.append(day, title, meta);
    btn.append(img, overlay);
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
      : workout.estimateMinutes + " min";
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

  function openLog() {
    if (!currentWorkout) return;
    document.getElementById("logWorkoutName").textContent = currentWorkout.title;
    document.getElementById("paceInput").value = "";
    document.getElementById("durationInput").value = "";
    document.getElementById("distanceInput").value = "";
    document.getElementById("notesInput").value = "";
    renderEffortGroup();
    goTo("log");
  }

  /* Native radio inputs (visually hidden, each wrapped in a styled
     label) rather than a hand-rolled role="radio" widget, so arrow
     keys, Home/End and single-tab-stop grouping all come from the
     browser for free instead of needing custom keyboard handling. */
  function renderEffortGroup() {
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
    if (!currentWorkout) return;
    const entry = {
      workoutId: currentWorkout.id,
      pace: document.getElementById("paceInput").value.trim(),
      duration: document.getElementById("durationInput").value.trim(),
      distance: document.getElementById("distanceInput").value.trim(),
      effort: selectedEffort(),
      notes: document.getElementById("notesInput").value.trim(),
    };
    lastSavedEntryId = await addHistoryEntry(entry);

    nav.stack = ["plans", "history"];
    await renderHistory();
    showScreen("history");
    showSaveBanner();
  }

  let saveBannerTimeout = null;

  function showSaveBanner() {
    const banner = document.getElementById("saveBanner");
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

  async function renderHistory() {
    historyEntries = await loadHistory();
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
     in-memory selection (currentWorkout/currentPlan/a weekGroup) that
     a reload discards, so those fall back to Library (one level in
     from Plans) rather than either guessing which workout was open
     or silently dropping the user all the way back to Plans. */
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
      const plan = PLANS[0];
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
    document.getElementById("deleteCancelBtn").addEventListener("click", () => deleteConfirmDialog.close());
    deleteConfirmDialog.addEventListener("close", async () => {
      if (deleteConfirmDialog.returnValue === "delete" && historyDetailId) {
        await deleteHistoryEntry(historyDetailId);
        await renderHistory();
      }
      deleteConfirmDialog.returnValue = "";
      historyDetailId = null;
    });

    window.addEventListener("popstate", () => {
      armHistoryTrap();
      goBack();
    });

    armHistoryTrap();

    const session = await getCurrentSession();
    if (session) {
      await enterApp();
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
