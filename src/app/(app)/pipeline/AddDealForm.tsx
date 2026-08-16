"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CLIENT_TYPES, LEAD_SOURCES } from "@/lib/sources";
import { normalizeUrl } from "@/components/LinkedInIcon";
import PersonSelect from "@/components/PersonSelect";
import CompanySelect from "@/components/CompanySelect";
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
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [dealname, setDealname] = useState("");
  const [contact, setContact] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [stage, setStage] = useState("connection");
  const [value, setValue] = useState("");
  const [clientType, setClientType] = useState("");
  const [source, setSource] = useState("");
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

    // resolve the company link: picked from the book, matched by name, or
    // created fresh. Non-fatal — the deal is created either way.
    let cid = companyId;
    if (!cid) {
      const { data: existing } = await supabase
        .from("companies")
        .select("id")
        .ilike("name", company.trim())
        .limit(1)
        .maybeSingle();
      cid = existing?.id ?? null;
    }
    if (!cid) {
      const { data: created } = await supabase
        .from("companies")
        .insert({ name: company.trim() })
        .select("id")
        .single();
      cid = created?.id ?? null;
    }

    const { data, error } = await supabase
      .from("deals")
      .insert({
        company: company.trim(),
        company_id: cid,
        // "Boots – John Smith" by default, so deals with several contacts at
        // the same company stay tellable apart (Oleksandr, Aug 2026)
        dealname:
          dealname.trim() ||
          (contact.trim()
            ? `${company.trim()} – ${contact.trim()}`
            : company.trim()),
        contact_name: contact.trim() || null,
        title: title.trim() || null,
        email: email.trim() || null,
        linkedin_url: normalizeUrl(linkedin) || null,
        stage,
        value: Math.max(0, Math.round(Number(value) || 0)),
        client_type: clientType || null,
        source: source || null,
        owner_code: ownerCode || null,
        owner_name: ownerName,
        owner_id: ownerCode === currentUser.repCode ? currentUser.id : null,
        hot,
      })
      .select()
      .single();

    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    const deal = data as Deal;

    // mirror the contact into the Contacts module, linked to the deal, so it's
    // searchable there right away. Non-fatal: the deal exists either way.
    if (contact.trim() || email.trim()) {
      await supabase.from("contacts").insert({
        deal_id: deal.id,
        name: contact.trim() || null,
        title: title.trim() || null,
        email: email.trim() || null,
        linkedin_url: normalizeUrl(linkedin) || null,
        dealname: deal.dealname,
        stage: deal.stage,
        owner_code: deal.owner_code,
        owner_id: deal.owner_id,
        hot: deal.hot,
      });
    }
    onCreated(deal);
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
            <CompanySelect
              name={company}
              onChange={(name, id) => {
                setCompany(name);
                setCompanyId(id);
              }}
              placeholder="Acme Corp"
            />
            {company.trim() && !companyId && (
              <div
                style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}
              >
                Not in the company book yet — it&apos;ll be added.
              </div>
            )}
          </div>
          <div>
            <div style={label}>Deal name</div>
            <input
              className="dedit"
              value={dealname}
              onChange={(e) => setDealname(e.target.value)}
              placeholder="Defaults to Company – Contact"
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
              <div style={label}>Title</div>
              <input
                className="dedit"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. VP Revenue"
              />
            </div>
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
          <div>
            <div style={label}>LinkedIn</div>
            <input
              className="dedit"
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
              placeholder="linkedin.com/in/…"
            />
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
              <div style={label}>Client type</div>
              <select
                className="dedit"
                value={clientType}
                onChange={(e) => setClientType(e.target.value)}
              >
                <option value="">Unassigned</option>
                {CLIENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div style={label}>Lead source</div>
              <select
                className="dedit"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="">Unknown</option>
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={label}>Owner</div>
              <PersonSelect
                owners={owners}
                value={ownerCode}
                onChange={setOwnerCode}
                placeholder="Type a name…"
              />
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
