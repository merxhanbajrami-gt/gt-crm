import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { publicOrigin } from "@/lib/url";

// Auth callback for magic links (and OAuth, if enabled later).
// Handles both delivery shapes: a PKCE `code`, or an OTP `token_hash` + `type`.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // Proxy-aware, allow-listed public origin (not request.url's internal host).
  const origin = publicOrigin(request);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const error =
    searchParams.get("error_description") ?? searchParams.get("error");

  // Only allow same-origin relative redirects (prevents open-redirect abuse).
  const rawNext = searchParams.get("next") ?? "/";
  const next = /^\/(?!\/)[^\\]*$/.test(rawNext) ? rawNext : "/";

  const fail = (msg: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`);

  if (error) return fail(error);

  const supabase = await createClient();

  if (code) {
    const { error: e } = await supabase.auth.exchangeCodeForSession(code);
    return e
      ? fail(e.code ?? e.message)
      : NextResponse.redirect(new URL(next, origin));
  }

  if (tokenHash && type) {
    const { error: e } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    return e
      ? fail(e.code ?? e.message)
      : NextResponse.redirect(new URL(next, origin));
  }

  return fail("missing_auth_params");
}
