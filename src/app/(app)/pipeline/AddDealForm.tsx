"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Deal, Stage } from "@/lib/types";
import type { CurrentUser } from "./DealDrawer";

export default function AddDealForm({
  stages,
  owners,
  currentUser,
  onClose,
  onCreated,
}: {
  stages: Stage[];
  owners: [string, string][];
  currentUser: CurrentUser;
  onClose: () => void;
  onCreated: (d: Deal) => void;
}) {
  const [company, setCompany] = useState("");
  const [dealname, setDealname] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState("connection");
  const [value, setValue] = useState("");
  const [vertical, setVertical] = useState("");
  const [ownerCode, setOwnerCode] = useState(currentUser.repCode ?? "");
  const [hot, setHot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!company.trim()) {
      setError("Company is required.");
      return;
    }
    setBusy(true);
    setError(null);

    const ownerName =
      ownerCode === currentUser.repCode
        ? currentUser.fullName
        : (owners.find(([c]) => c === ownerCode)?.[1] ?? null);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("deals")
      .insert({
        company: company.trim(),
        dealname: dealname.trim() || company.trim(),
        contact_name: contact.trim() || null,
        email: email.trim() || null,
        stage,
        value: Math.max(0, Math.round(Number(value) || 0)),
        vertical: vertical.trim() || null,
        owner_code: ownerCode || null,
        owner_name: ownerName,
        owner_id: ownerCode === currentUser.repCode ? currentUser.id : null,
        hot,
        days_in_stage: 0,
      })
      .select()
      .single();

    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    onCreated(data as Deal);
  }

  const label = { fontSize: 11, fontWeight: 700, color: "var(--text-faint)" } as const;

  return (
    <>
      <div className="scrim open" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Add deal"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 460,
          maxWidth: "94vw",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "#fff",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "0 24px 60px rgba(10,10,40,.18)",
          zIndex: 95,
          padding: 24,
        }}
      >
        <button
          className="drawer-close"
          onClick={onClose}
          aria-label="Close"
          style={{ position: "absolute", top: 16, right: 16 }}
        >
          ✕
        </button>
        <div className="eyebrow">New deal</div>
        <h2 style={{ marginBottom: 16 }}>Add a deal</h2>

        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <div>
            <div style={label}>Company *</div>
            <input
              className="dedit"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Acme Corp"
              autoFocus
            />
          </div>
          <div>
            <div style={label}>Deal name</div>
            <input
              className="dedit"
              value={dealname}
              onChange={(e) => setDealname(e.target.value)}
              placeholder="Defaults to company"
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={label}>Contact</div>
              <input
                className="dedit"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
              />
            </div>
            <div>
              <div style={label}>Email</div>
              <input
                className="dedit"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={label}>Stage</div>
              <select
                className="dedit"
                value={stage}
                onChange={(e) => setStage(e.target.value)}
              >
                {stages
                  .filter((s) => s.id !== "lost")
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <div style={label}>Value (£k)</div>
              <input
                className="dedit"
                type="number"
                min={0}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={label}>Vertical</div>
              <input
                className="dedit"
                value={vertical}
                onChange={(e) => setVertical(e.target.value)}
              />
            </div>
            <div>
              <div style={label}>Owner</div>
              <select
                className="dedit"
                value={ownerCode}
                onChange={(e) => setOwnerCode(e.target.value)}
              >
                {currentUser.repCode && (
                  <option value={currentUser.repCode}>
                    {currentUser.fullName} (you)
                  </option>
                )}
                <option value="">Unassigned</option>
                {owners
                  .filter(([c]) => c !== currentUser.repCode)
                  .map(([c, n]) => (
                    <option key={c} value={c}>
                      {n} ({c})
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={hot}
              onChange={(e) => setHot(e.target.checked)}
            />
            Flag as hot
          </label>

          {error && (
            <div className="lf-err" style={{ display: "block" }}>
              {error}
            </div>
          )}

          <button className="lf-submit" type="submit" disabled={busy}>
            {busy ? "Adding…" : "Add deal"}
          </button>
        </form>
      </div>
    </>
  );
}
