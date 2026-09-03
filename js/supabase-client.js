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
