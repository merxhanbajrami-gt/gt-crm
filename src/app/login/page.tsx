"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginInner() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error"));

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true,
      },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
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

          {sent ? (
            <>
              <p className="lf-sub">
                Check your inbox — we sent a sign-in link to{" "}
                <strong>{email}</strong>. Open it on this device to continue.
              </p>
              <button
                className="lf-alt"
                onClick={() => {
                  setSent(false);
                  setEmail("");
                }}
                style={{ marginTop: 8 }}
              >
                Use a different email
              </button>
            </>
          ) : (
            <>
              <p className="lf-sub">
                Enter your GT-HQ work email and we&apos;ll send you a one-time
                sign-in link. No password needed.
              </p>
              <form onSubmit={sendMagicLink}>
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
                {error && (
                  <div className="lf-err" style={{ display: "block" }}>
                    {error}
                  </div>
                )}
                <button
                  className="lf-submit"
                  type="submit"
                  disabled={loading}
                  style={{ marginTop: 14 }}
                >
                  {loading ? "Sending…" : "Email me a sign-in link"}
                </button>
              </form>
            </>
          )}
          <p className="lf-note">
            Internal only · restricted to gt-hq.com accounts
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
