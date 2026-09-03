const logEl = document.getElementById("log");
function log(line) {
  logEl.textContent += line + "\n";
}

document.getElementById("runBtn").addEventListener("click", async () => {
  document.getElementById("runBtn").disabled = true;
  try {
    const session = await getCurrentSession();
    if (!session) {
      log("Not signed in. Open index.html in this same browser, sign in with your magic link, then come back here.");
      return;
    }
    log("Signed in as " + session.user.email);

    const plan = PLANS[0];

    const { data: existing, error: existingError } = await supabaseClient
      .from("plans")
      .select("id")
      .eq("title", plan.title)
      .limit(1);
    if (existingError) throw existingError;
    if (existing.length > 0) {
      log("A plan titled '" + plan.title + "' already exists (id " + existing[0].id + "). Skipping to avoid duplicates.");
      return;
    }

    log("Inserting plan: " + plan.title);
    const { data: planRow, error: planError } = await supabaseClient
      .from("plans")
      .insert({
        title: plan.title,
        cover_url: plan.cover,
        estimate_weeks: plan.estimateWeeks,
      })
      .select()
      .single();
    if (planError) throw planError;
    log("Plan inserted with id " + planRow.id);

    const workoutRows = WORKOUTS.map((w) => ({
      plan_id: planRow.id,
      title: w.title,
      week: w.week,
      date: w.date,
      phase: w.phase,
      summary: w.summary,
      session: w.session || null,
      cover_url: w.cover,
      estimate_minutes: w.estimateMinutes,
      discipline: w.discipline || null,
    }));

    log("Inserting " + workoutRows.length + " workouts...");
    const { error: workoutsError } = await supabaseClient.from("workouts").insert(workoutRows);
    if (workoutsError) throw workoutsError;

    log("Done. Plan and " + workoutRows.length + " workouts are in Supabase.");
  } catch (err) {
    log("Failed: " + (err.message || err));
    console.error(err);
  }
});
