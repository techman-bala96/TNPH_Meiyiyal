import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const URL = import.meta.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321";
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "mock-anon-key";

export const supabase = createClient<Database>(URL, KEY, {
  auth: { storage: localStorage, persistSession: true, autoRefreshToken: true },
});
