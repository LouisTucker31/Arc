// Fill these in from Project Settings -> API in your Supabase dashboard.
const SUPABASE_URL = "https://vumsggojkacntpzhprqh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1bXNnZ29qa2FjbnRwemhwcnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MTcwMzMsImV4cCI6MjEwMzk5MzAzM30.6GOt0pXy2hi_sQcIMmrCeb_0UF9_tKJQqmvj6iSGWTU";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function getCurrentSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session;
}

async function sendMagicLink(email) {
  const { error } = await supabaseClient.auth.signInWithOtp({
    email: email,
    options: { emailRedirectTo: window.location.href },
  });
  if (error) {
    console.error("Could not send magic link", error);
    throw error;
  }
}

async function signOut() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) console.error("Sign out failed", error);
}
