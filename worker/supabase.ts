import { createClient } from "@supabase/supabase-js";
import type { Env } from "./index";
// Only call after the API has verified identity and active tenant membership.
// The user JWT preserves RLS; no elevated key is accepted here.
export function createUserDatabase(env: Env, accessToken: string) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY)
    throw new Error("Database is not configured");
  if (!accessToken.trim()) throw new Error("User access token required");
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
