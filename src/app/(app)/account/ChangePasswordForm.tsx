"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MIN_LEN = 8;

export default function ChangePasswordForm({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next.length < MIN_LEN) {
      setMsg({ type: "err", text: `Use at least ${MIN_LEN} characters.` });
      return;
    }
    if (next !== confirm) {
      setMsg({ type: "err", text: "The new passwords don't match." });
      return;
    }
    setBusy(true);
    const supabase = createClient();
    // re-verify the current password before changing it
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    });
    if (authErr) {
      setBusy(false);
      setMsg({ type: "err", text: "Your current password is incorrect." });
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (error) {
      setMsg({ type: "err", text: error.message });
      return;
    }
    setMsg({
      type: "ok",
      text: "Password updated. Use it the next time you sign in.",
    });
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  const label = {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text-faint)",
    marginBottom: 4,
  } as const;

  return (
    <form
      onSubmit={submit}
      className="panel"
      style={{ padding: 20, display: "grid", gap: 14, maxWidth: 420 }}
    >
      <div>
        <div style={label}>Current password</div>
        <input
          className="dedit"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <div>
        <div style={label}>New password</div>
        <input
          className="dedit"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          placeholder={`At least ${MIN_LEN} characters`}
          required
        />
      </div>
      <div>
        <div style={label}>Confirm new password</div>
        <input
          className="dedit"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>

      {msg && (
        <div
          className={msg.type === "err" ? "lf-err" : undefined}
          style={{
            display: "block",
            fontSize: 13,
            color: msg.type === "ok" ? "var(--green)" : undefined,
            fontWeight: 600,
          }}
        >
          {msg.text}
        </div>
      )}

      <button className="lf-submit" type="submit" disabled={busy}>
        {busy ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
