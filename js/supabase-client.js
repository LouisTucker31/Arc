// Fill these in from Project Settings -> API in your Supabase dashboard.
const SUPABASE_URL = "https://vumsggojkacntpzhprqh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1bXNnZ29qa2FjbnRwemhwcnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MTcwMzMsImV4cCI6MjEwMzk5MzAzM30.6GOt0pXy2hi_sQcIMmrCeb_0UF9_tKJQqmvj6iSGWTU";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function ensureSignedIn() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) return session;
  const { data, error } = await supabaseClient.auth.signInAnonymously();
  if (error) {
    console.error("Anonymous sign-in failed", error);
    throw error;
  }
  return data.session;
}
