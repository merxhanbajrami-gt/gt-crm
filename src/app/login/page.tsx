"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginInner() {
  const params = useSearchParams();
  const urlError = params.get("error");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(urlError);

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { hd: "gt-hq.com", prompt: "select_account" },
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
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
          <p className="lf-sub">
            GT / OS reads the pipeline every week, scores every open card, and
            hands you a snapshot of who to touch. Sign in with your GT-HQ account
            to see who is overdue, who is due, and what is on track.
          </p>
          {error && (
            <div className="lf-err" style={{ display: "block" }}>
              {error}
            </div>
          )}
          <button
            className="lf-submit"
            onClick={signInWithGoogle}
            disabled={loading}
            style={{ marginTop: 8 }}
          >
            {loading ? "Redirecting…" : "Continue with Google Workspace"}
          </button>
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
