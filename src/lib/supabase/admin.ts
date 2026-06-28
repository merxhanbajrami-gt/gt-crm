import { createClient } from "@supabase/supabase-js";

// Service-role client. BYPASSES Row Level Security — server-only, never import
// from a client component. Use sparingly for trusted admin jobs (role
// management, bulk reassignment, seeding).
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
