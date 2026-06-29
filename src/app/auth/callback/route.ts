import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Public hosts we're willing to redirect back to. Behind Render's proxy
// `request.url` is the internal http://localhost:10000, so we must read the
// real host from x-forwarded-host — but an attacker can forge that header on a
// direct request, so we only honour it when it's one we recognise (otherwise
// it's an open redirect, since the callback hands back auth state). Add the
// prod host once via NEXT_PUBLIC_SITE_URL; localhost covers dev.
const SITE_HOST = (() => {
  try {
    return process.env.NEXT_PUBLIC_SITE_URL
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL).host
      : null;
  } catch {
    return null;
  }
})();
const ALLOWED_HOSTS = new Set(
  [SITE_HOST, "localhost:3000", "127.0.0.1:3000"].filter(
    (h): h is string => !!h,
  ),
);

// Auth callback for magic links (and OAuth, if enabled later).
// Handles both delivery shapes: a PKCE `code`, or an OTP `token_hash` + `type`.
export async function GET(request: Request) {
  const { searchParams, origin: rawOrigin } = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.toLowerCase();
  // Only trust the forwarded host if it's allow-listed; force https in prod.
  const origin =
    forwardedHost && ALLOWED_HOSTS.has(forwardedHost)
      ? `${process.env.NODE_ENV === "production" ? "https" : "http"}://${forwardedHost}`
      : rawOrigin;
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
    return e ? fail(e.message) : NextResponse.redirect(new URL(next, origin));
  }

  if (tokenHash && type) {
    const { error: e } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    return e ? fail(e.message) : NextResponse.redirect(new URL(next, origin));
  }

  return fail("missing_auth_params");
}
