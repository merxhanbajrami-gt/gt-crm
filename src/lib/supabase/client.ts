"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Uses the anon key — every request carries the
// signed-in user's JWT and is gated by Row Level Security. Safe to ship.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
