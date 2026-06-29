import { createClient } from "@supabase/supabase-js";

// Service-role admin client for test setup/teardown (bypasses RLS). The key is
// loaded from .env.local by playwright.config.ts — these tests only run where
// that file is present (local dev), not in public CI.
export const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? "e2e@gt-hq.com";
export const TEST_DEAL_PREFIX = "E2E AUTOTEST";

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Authenticated tests need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from .env.local).",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
