import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// OAuth / magic-link callback. Exchanges the code for a session cookie, then
// sends the user into the app.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Only allow same-origin relative paths to prevent open-redirect abuse.
  // Rejects absolute URLs, protocol-relative (//evil.com), and backslash tricks.
  const rawNext = searchParams.get("next") ?? "/";
  const next = /^\/(?!\/)[^\\]*$/.test(rawNext) ? rawNext : "/";
  const error = searchParams.get("error_description") ?? searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error)}`,
    );
  }

  if (code) {
    const supabase = await createClient();
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      return NextResponse.redirect(new URL(next, origin));
    }
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(exchangeError.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}/login?error=missing_code`);
}
