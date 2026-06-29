import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publicOrigin } from "@/lib/url";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Use the proxy-aware public origin, not request.url (internal localhost:10000).
  return NextResponse.redirect(new URL("/login", publicOrigin(request)), {
    status: 303,
  });
}
