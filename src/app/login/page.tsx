"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Turn raw GoTrue errors (codes, empty bodies, "{}") into something a
// signed-out teammate can actually act on — never render a bare object.
function humanizeAuthError(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || s === "{}" || s === "[object Object]")
    return "We couldn't sign you in. Please check your details and try again.";
  const low = s.toLowerCase();
  if (low.includes("invalid login") || low.includes("invalid_credentials"))
    return "Wrong email or password. Check them and try again.";
  if (low.includes("rate limit"))
    return "Too many attempts just now — please wait a minute and try again.";
  return s;
}

function LoginInner() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    humanizeAuthError(params.get("error")),
  );

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setLoading(false);
      setError(
        humanizeAuthError((error as { code?: string }).code ?? error.message),
      );
      return;
    }
    // full navigation so the server picks up the freshly-set session cookie
    window.location.href = "/";
  }

  return (
    <div className="login" style={{ display: "flex" }}>
      <div className="login-form">
        <div className="lf-inner">
          <div className="wordmark" style={{ marginBottom: 26 }}>
            <span className="gt-logo" role="img" aria-label="GT" />
            <span className="os">/ OS · PIPELINE</span>
          </div>
          <div className="lf-eyebrow">Employee access</div>
          <div className="lf-title">Your week, in one view.</div>
          <p className="lf-sub">Sign in with your GT-HQ email and password.</p>

          {error && (
            <div
              className="lf-err"
              style={{ display: "block", marginBottom: 14 }}
            >
              {error}
            </div>
          )}

          <form onSubmit={signIn}>
            <div className="lf-label">Work email</div>
            <input
              className="lf-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@gt-hq.com"
              autoComplete="email"
              required
            />
            <div className="lf-label" style={{ marginTop: 14 }}>
              Password
            </div>
            <input
              className="lf-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              className="lf-submit"
              type="submit"
              disabled={loading}
              style={{ marginTop: 18 }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="lf-note">
            Internal only · restricted to GT-HQ accounts
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
