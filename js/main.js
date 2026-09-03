(function () {
  "use strict";

  /* ------------------------------------------------------------------
   * Storage
   *
   * Safari private browsing (and some locked-down contexts) can throw
   * on localStorage.setItem even though the API exists, so every real
   * read/write is wrapped and falls back to an in-memory list for the
   * rest of this session rather than crashing the app.
   * ---------------------------------------------------------------- */

  const STORAGE_KEY = "steadyStrong.history.v1";
  let memoryHistory = [];
  let storageAvailable = testStorage();

  function testStorage() {
    try {
      const key = "__steadyStrong_test__";
      window.localStorage.setItem(key, "1");
      window.localStorage.removeItem(key);
      return true;
    } catch (err) {
      return false;
    }
  }

  function loadHistory() {
    if (!storageAvailable) return memoryHistory;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.error("Could not read saved history", err);
      return [];
    }
  }

  function saveHistoryList(list) {
    if (!storageAvailable) {
      memoryHistory = list;
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (err) {
      console.error("Could not save history, continuing in memory only", err);
      storageAvailable = false;
      memoryHistory = list;
    }
  }

  function addHistoryEntry(entry) {
    const list = loadHistory();
    list.unshift(entry);
    saveHistoryList(list);
  }

  function deleteHistoryEntry(id) {
    const list = loadHistory().filter((e) => e.id !== id);
    saveHistoryList(list);
  }

  function generateId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function findWorkout(id) {
    return WORKOUTS.find((w) => w.id === id);
  }

  /* ------------------------------------------------------------------
   * Formatting
   * ---------------------------------------------------------------- */

  function formatClock(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  const dateFormatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  function formatDateTime(iso) {
    return dateFormatter.format(new Date(iso));
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

  const nav = { stack: ["home"] };

  function showScreen(name) {
    document.querySelectorAll(".screen").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.screen === name);
    });
    window.scrollTo(0, 0);
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
      history.pushState({ steadyStrongTrap: true }, "", location.href);
    } catch (err) {
      console.error("Could not arm history trap", err);
    }
  }

  function handleHardwareBack() {
    const current = nav.stack[nav.stack.length - 1];
    if (current === "player" || current === "finish") {
      exitDialog.showModal();
      return;
    }
    goBack();
  }

  /* ------------------------------------------------------------------
   * Home screen
   * ---------------------------------------------------------------- */

  function renderHome() {
    const list = document.getElementById("workoutList");
    list.innerHTML = "";
    WORKOUTS.forEach((workout) => {
      list.appendChild(buildWorkoutTile(workout));
    });
  }

  function buildWorkoutTile(workout) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "workout-tile";

    const img = document.createElement("img");
    img.className = "workout-tile-photo";
    img.src = workout.cover;
    img.alt = "";
    img.loading = "lazy";

    const overlay = document.createElement("div");
    overlay.className = "workout-tile-overlay";

    const title = document.createElement("h2");
    title.className = "workout-tile-title";
    title.textContent = workout.title;

    const meta = document.createElement("div");
    meta.className = "workout-tile-meta";
    const exerciseWord = workout.exercises.length === 1 ? "exercise" : "exercises";
    buildSubtitle(meta, [workout.estimateMinutes + " min", workout.exercises.length + " " + exerciseWord]);

    overlay.append(title, meta);
    btn.append(img, overlay);
    btn.addEventListener("click", () => openDetail(workout.id));
    li.appendChild(btn);
    return li;
  }

  /* ------------------------------------------------------------------
   * Detail screen
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
    document.getElementById("detailTitle").textContent = workout.title;
    document.getElementById("detailSummary").textContent = workout.summary;

    const meta = document.getElementById("detailMeta");
    meta.innerHTML = "";
    const durationTag = document.createElement("span");
    durationTag.className = "detail-meta-item";
    durationTag.textContent = "About " + workout.estimateMinutes + " minutes";
    const exerciseWord = workout.exercises.length === 1 ? "exercise" : "exercises";
    const countTag = document.createElement("span");
    countTag.className = "detail-meta-item";
    countTag.textContent = workout.exercises.length + " " + exerciseWord;
    meta.append(durationTag, countTag);

    const list = document.getElementById("exerciseList");
    list.innerHTML = "";
    workout.exercises.forEach((ex) => {
      list.appendChild(buildExerciseRow(ex));
    });
  }

  function buildExerciseRow(ex) {
    const li = document.createElement("li");
    const row = document.createElement("div");
    row.className = "thumb-row";

    const photo = document.createElement("img");
    photo.className = "thumb-row-photo";
    photo.src = ex.photo;
    photo.alt = "";
    photo.loading = "lazy";

    const text = document.createElement("div");
    text.className = "thumb-row-text";
    const title = document.createElement("span");
    title.className = "thumb-row-title";
    title.textContent = ex.name;
    const subtitle = document.createElement("span");
    subtitle.className = "thumb-row-subtitle";
    buildSubtitle(subtitle, [ex.setsReps]);
    text.append(title, subtitle);

    row.append(photo, text);
    li.appendChild(row);
    return li;
  }

  /* ------------------------------------------------------------------
   * Player screen
   *
   * The timer counts up for the whole session, from Start to Finish.
   * It reads the wall clock (Date.now() minus a fixed start time)
   * rather than counting ticks, so it stays accurate even if the tab
   * is backgrounded and the interval is throttled or paused by the
   * browser.
   * ---------------------------------------------------------------- */

  let session = null;
  let pendingSave = null;
  let timerInterval = null;
  let wakeLockSentinel = null;

  function startSession(workout) {
    session = { workout: workout, startTime: Date.now(), exerciseIndex: 0 };
    renderPlayerExercise();
    goTo("player");
    startTimer();
    requestWakeLock();
  }

  function startTimer() {
    updateTimerDisplay();
    timerInterval = window.setInterval(updateTimerDisplay, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      window.clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function updateTimerDisplay() {
    if (!session) return;
    const elapsed = Math.floor((Date.now() - session.startTime) / 1000);
    document.getElementById("playerTimer").textContent = formatClock(elapsed);
  }

  function renderPlayerExercise() {
    const workout = session.workout;
    const total = workout.exercises.length;
    const ex = workout.exercises[session.exerciseIndex];

    const photo = document.getElementById("playerPhoto");
    photo.src = ex.photo;
    photo.alt = "";

    document.getElementById("playerExerciseName").textContent = ex.name;
    document.getElementById("playerSetsReps").textContent = ex.setsReps;
    document.getElementById("playerDescription").textContent = ex.description;
    const progressionEl = document.getElementById("playerProgression");
    progressionEl.textContent = ex.progressionTip || "";
    progressionEl.hidden = !ex.progressionTip;
    document.getElementById("playerProgressLabel").textContent =
      "Exercise " + (session.exerciseIndex + 1) + " of " + total;

    renderSegments(total, session.exerciseIndex);

    const isFirst = session.exerciseIndex === 0;
    const isLast = session.exerciseIndex === total - 1;
    document.getElementById("playerBackBtn").disabled = isFirst;
    document.getElementById("playerNextBtn").textContent = isLast ? "Finish workout" : "Next exercise";

    window.scrollTo(0, 0);
  }

  function renderSegments(total, currentIndex) {
    const container = document.getElementById("playerSegments");
    container.innerHTML = "";
    container.setAttribute("aria-label", "Exercise " + (currentIndex + 1) + " of " + total);
    for (let i = 0; i < total; i++) {
      const seg = document.createElement("span");
      seg.className = "segment" + (i <= currentIndex ? " is-filled" : "");
      container.appendChild(seg);
    }
  }

  function handlePreviousExercise() {
    if (!session || session.exerciseIndex === 0) return;
    session.exerciseIndex -= 1;
    renderPlayerExercise();
  }

  function handleNextExercise() {
    if (!session) return;
    const isLast = session.exerciseIndex === session.workout.exercises.length - 1;
    if (isLast) {
      finishSession();
    } else {
      session.exerciseIndex += 1;
      renderPlayerExercise();
    }
  }

  function finishSession() {
    const durationSeconds = Math.floor((Date.now() - session.startTime) / 1000);
    stopTimer();
    releaseWakeLock();

    pendingSave = {
      workoutId: session.workout.id,
      workoutTitle: session.workout.title,
      startISO: new Date(session.startTime).toISOString(),
      durationSeconds: durationSeconds,
      exerciseCount: session.workout.exercises.length,
    };

    document.getElementById("finishWorkoutName").textContent = session.workout.title;
    document.getElementById("finishDuration").textContent = formatClock(durationSeconds);
    document.getElementById("finishExerciseCount").textContent = String(session.workout.exercises.length);
    document.getElementById("notesInput").value = "";

    goTo("finish");
  }

  /* Wake Lock keeps the screen on during a session. It is not
     supported everywhere, so every call is feature-detected, and a
     refusal (low battery mode, unsupported browser) simply means the
     screen can dim as normal; the workout itself still works fine. */

  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLockSentinel = await navigator.wakeLock.request("screen");
    } catch (err) {
      console.error("Wake lock request failed", err);
    }
  }

  function releaseWakeLock() {
    if (wakeLockSentinel) {
      wakeLockSentinel.release().catch(() => {});
      wakeLockSentinel = null;
    }
  }

  document.addEventListener("visibilitychange", () => {
    // The OS releases the wake lock whenever the app is backgrounded,
    // so it needs to be re-requested on return if a session is still
    // running.
    if (document.visibilityState === "visible" && session && !wakeLockSentinel) {
      requestWakeLock();
    }
  });

  /* ------------------------------------------------------------------
   * Ending a session early (close button or hardware back)
   * ---------------------------------------------------------------- */

  let exitDialog;

  function requestExit() {
    exitDialog.showModal();
  }

  function confirmExitSession() {
    stopTimer();
    releaseWakeLock();
    session = null;
    pendingSave = null;
    nav.stack = currentWorkout ? ["home", "detail"] : ["home"];
    showScreen(nav.stack[nav.stack.length - 1]);
  }

  /* ------------------------------------------------------------------
   * Saving a finished workout
   * ---------------------------------------------------------------- */

  let lastSavedEntryId = null;
  let saveBannerTimeout = null;

  function handleSaveWorkout() {
    if (!pendingSave) return;
    const entry = {
      id: generateId(),
      workoutId: pendingSave.workoutId,
      workoutTitle: pendingSave.workoutTitle,
      startISO: pendingSave.startISO,
      durationSeconds: pendingSave.durationSeconds,
      exerciseCount: pendingSave.exerciseCount,
      notes: document.getElementById("notesInput").value.trim(),
    };
    addHistoryEntry(entry);
    lastSavedEntryId = entry.id;
    pendingSave = null;
    session = null;

    nav.stack = ["home", "history"];
    renderHistory();
    showScreen("history");
    showSaveBanner();
  }

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

  function renderHistory() {
    const list = loadHistory();
    const listEl = document.getElementById("historyList");
    const emptyEl = document.getElementById("historyEmpty");
    listEl.innerHTML = "";

    if (list.length === 0) {
      emptyEl.hidden = false;
      listEl.hidden = true;
      lastSavedEntryId = null;
      return;
    }

    emptyEl.hidden = true;
    listEl.hidden = false;

    list.forEach((entry) => {
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
    title.textContent = entry.workoutTitle;
    const subtitle = document.createElement("span");
    subtitle.className = "thumb-row-subtitle";
    buildSubtitle(subtitle, [formatDateTime(entry.startISO), formatClock(entry.durationSeconds)]);
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
    const entry = loadHistory().find((e) => e.id === id);
    if (!entry) return;
    historyDetailId = id;
    document.getElementById("historyDetailTitle").textContent = entry.workoutTitle;
    document.getElementById("historyDetailDate").textContent = formatDateTime(entry.startISO);
    document.getElementById("historyDetailDuration").textContent = formatClock(entry.durationSeconds);

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

  function init() {
    exitDialog = document.getElementById("exitDialog");
    const historyDetailDialog = document.getElementById("historyDetailDialog");
    const deleteConfirmDialog = document.getElementById("deleteConfirmDialog");

    renderHome();
    armHistoryTrap();

    window.addEventListener("popstate", () => {
      armHistoryTrap();
      handleHardwareBack();
    });

    document.getElementById("openHistoryBtn").addEventListener("click", () => {
      renderHistory();
      goTo("history");
    });
    document.getElementById("detailBackBtn").addEventListener("click", goBack);
    document.getElementById("historyBackBtn").addEventListener("click", goBack);

    document.getElementById("startWorkoutBtn").addEventListener("click", () => {
      if (currentWorkout) startSession(currentWorkout);
    });

    document.getElementById("playerCloseBtn").addEventListener("click", requestExit);
    document.getElementById("playerBackBtn").addEventListener("click", handlePreviousExercise);
    document.getElementById("playerNextBtn").addEventListener("click", handleNextExercise);
    document.getElementById("saveWorkoutBtn").addEventListener("click", handleSaveWorkout);

    document.getElementById("exitCancelBtn").addEventListener("click", () => exitDialog.close());
    exitDialog.addEventListener("close", () => {
      if (exitDialog.returnValue === "end") {
        confirmExitSession();
      }
      exitDialog.returnValue = "";
    });

    document.getElementById("historyDetailDeleteBtn").addEventListener("click", () => {
      historyDetailDialog.close();
      deleteConfirmDialog.showModal();
    });
    document.getElementById("deleteCancelBtn").addEventListener("click", () => deleteConfirmDialog.close());
    deleteConfirmDialog.addEventListener("close", () => {
      if (deleteConfirmDialog.returnValue === "delete" && historyDetailId) {
        deleteHistoryEntry(historyDetailId);
        renderHistory();
      }
      deleteConfirmDialog.returnValue = "";
      historyDetailId = null;
    });

    registerServiceWorker();
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((err) => {
        console.error("Service worker registration failed", err);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
