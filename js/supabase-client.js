// Fill these in from Project Settings -> API in your Supabase dashboard.
const SUPABASE_URL = "https://vumsggojkacntpzhprqh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1bXNnZ29qa2FjbnRwemhwcnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MTcwMzMsImV4cCI6MjEwMzk5MzAzM30.6GOt0pXy2hi_sQcIMmrCeb_0UF9_tKJQqmvj6iSGWTU";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function getCurrentSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session;
}

async function signInWithPassword(email, password) {
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    console.error("Sign in failed", error);
    throw error;
  }
}

async function signUpWithPassword(email, password) {
  const { error } = await supabaseClient.auth.signUp({ email, password });
  if (error) {
    console.error("Sign up failed", error);
    throw error;
  }
}

async function sendPasswordReset(email) {
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.href,
  });
  if (error) {
    console.error("Could not send password reset email", error);
    throw error;
  }
}

async function updateHistoryEntry(id, fields) {
  const { error } = await supabaseClient
    .from("workout_logs")
    .update({
      logged_at: fields.loggedISO,
      pace: fields.pace,
      duration: fields.duration,
      distance: fields.distance,
      effort: fields.effort,
      duration_seconds: fields.durationSeconds ?? null,
      distance_value: fields.distanceValue ?? null,
      distance_unit: fields.distanceUnit ?? null,
      pace_seconds: fields.paceSeconds ?? null,
      speed_kmh: fields.speedKmh ?? null,
      notes: fields.notes,
      legs: fields.legs || null,
    })
    .eq("id", id);
  if (error) {
    console.error("Could not update workout log", error);
    throw error;
  }
}

async function setPassword(password) {
  const { error } = await supabaseClient.auth.updateUser({ password });
  if (error) {
    console.error("Could not set password", error);
    throw error;
  }
}

async function signOut() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) console.error("Sign out failed", error);
}

async function loadProfile(userId) {
  const { data, error } = await supabaseClient.from("profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) {
    console.error("Could not load profile", error);
    return null;
  }
  return data;
}

async function saveProfile(userId, fields) {
  const { error } = await supabaseClient.from("profiles").upsert({
    user_id: userId,
    name: fields.name,
    date_of_birth: fields.dateOfBirth,
    height_cm: fields.heightCm,
    weight_kg: fields.weightKg,
    gender: fields.gender,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("Could not save profile", error);
    throw error;
  }
}

async function loadRaces(userId) {
  const { data, error } = await supabaseClient
    .from("races")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: true });
  if (error) {
    console.error("Could not load races", error);
    return [];
  }
  return data;
}

async function addRace(userId, fields) {
  const { data, error } = await supabaseClient
    .from("races")
    .insert({
      user_id: userId,
      name: fields.name,
      date: fields.date,
      discipline: fields.discipline,
      goal: fields.goal,
      notes: fields.notes,
    })
    .select()
    .single();
  if (error) {
    console.error("Could not add race", error);
    throw error;
  }
  return data;
}

async function updateRace(id, fields) {
  const { error } = await supabaseClient
    .from("races")
    .update({
      name: fields.name,
      date: fields.date,
      discipline: fields.discipline,
      goal: fields.goal,
      notes: fields.notes,
    })
    .eq("id", id);
  if (error) {
    console.error("Could not update race", error);
    throw error;
  }
}

async function deleteRace(id) {
  const { error } = await supabaseClient.from("races").delete().eq("id", id);
  if (error) {
    console.error("Could not delete race", error);
    throw error;
  }
}
