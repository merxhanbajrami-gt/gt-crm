import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 proxy (formerly middleware): refreshes the Supabase session and
// gates unauthenticated requests.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // run on everything except static assets
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
