import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Server-side Supabase client (Server Components, Route Handlers, Server Actions).
// Still the anon key + user JWT, so RLS applies. For trusted admin jobs that must
// bypass RLS, use createAdminClient() below instead.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // called from a Server Component — middleware refreshes the session
          }
        },
      },
    },
  );
}
