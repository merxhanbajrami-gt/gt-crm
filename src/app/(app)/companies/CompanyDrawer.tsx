"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { gbp } from "@/lib/format";
import LinkedInIcon from "@/components/LinkedInIcon";
import NoteText from "@/components/NoteText";
import type { ActionItem, Company, Contact, Deal, Stage } from "@/lib/types";
import type { CurrentUser } from "../pipeline/DealDrawer";

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// The company record: every deal and contact we have with them in one place,
// plus the running note history (imported from HubSpot and added here).
export default function CompanyDrawer({
  company,
  stages,
  currentUser,
  onClose,
  onChanged,
  onDeleted,
}: {
  company: Company;
  stages: Stage[];
  currentUser: CurrentUser;
  onClose: () => void;
  onChanged: (c: Company) => void;
  onDeleted: (id: string) => void;
}) {
  const supabase = createClient();
  const [c, setC] = useState<Company>(company);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [notes, setNotes] = useState<ActionItem[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // editable fields (data cleanup happens right here)
  const [nameInput, setNameInput] = useState(company.name);
  const [industryInput, setIndustryInput] = useState(company.industry ?? "");
  const [countryInput, setCountryInput] = useState(company.country ?? "");
  const [cityInput, setCityInput] = useState(company.city ?? "");
  const [phoneInput, setPhoneInput] = useState(company.phone ?? "");

  useEffect(() => {
    let active = true;
    supabase
      .from("deals")
      .select("*")
      .eq("company_id", company.id)
      .order("value", { ascending: false })
      .then(({ data }) => {
        if (active) setDeals((data ?? []) as Deal[]);
      });
    supabase
      .from("contacts")
      .select("*")
      .eq("company_id", company.id)
      .order("name")
      .limit(100)
      .then(({ data }) => {
        if (active) setContacts((data ?? []) as Contact[]);
      });
    supabase
      .from("actions")
      .select("*")
      .eq("company_id", company.id)
      .eq("kind", "note")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (active) setNotes((data ?? []) as ActionItem[]);
      });
    return () => {
      active = false;
    };
  }, [supabase, company.id]);

  async function patchCompany(patch: Partial<Company>): Promise<boolean> {
    setBusy(true);
    const prev = c;
    const next = { ...c, ...patch };
    setC(next);
    const { error } = await supabase
      .from("companies")
      .update(patch)
      .eq("id", c.id);
    setBusy(false);
    if (error) {
      setC(prev);
      alert("Could not save: " + error.message);
      return false;
    }
    onChanged(next);
    return true;
  }

  function commitField(
    field: "name" | "industry" | "country" | "city" | "phone",
    v: string,
  ) {
    const val = v.trim();
    if (field === "name" && !val) {
      setNameInput(c.name);
      return;
    }
    if (val !== (c[field] ?? ""))
      patchCompany({ [field]: val || null } as Partial<Company>);
  }

  async function addNote() {
    const text = note.trim();
    if (!text) return;
    setBusy(true);
    const { error } = await supabase.from("actions").insert({
      company_id: c.id,
      kind: "note",
      note: text,
      owner_id: currentUser.id,
      owner_code: currentUser.repCode,
      done: false,
    });
    setBusy(false);
    if (error) {
      alert("Could not save note: " + error.message);
      return;
    }
    setNote("");
    const { data } = await supabase
      .from("actions")
      .select("*")
      .eq("company_id", c.id)
      .eq("kind", "note")
      .order("created_at", { ascending: false })
      .limit(200);
    setNotes((data ?? []) as ActionItem[]);
  }

  async function deleteCompany() {
    if (
      !confirm(
        `Delete "${c.name}"? Its deals, contacts, and notes are kept — they just lose the company link. This can't be undone.`,
      )
    )
      return;
    setBusy(true);
    const { data, error } = await supabase
      .from("companies")
      .delete()
      .eq("id", c.id)
      .select("id");
    setBusy(false);
    if (error) {
      alert("Could not delete: " + error.message);
      return;
    }
    if (!data || data.length === 0) {
      alert("You don't have permission to delete this company.");
      return;
    }
    onDeleted(c.id);
  }

  const stageOf = (id: string) => stages.find((s) => s.id === id);

  return (
    <>
      <div className="scrim open" onClick={onClose} />
      <aside className="drawer open">
        <div className="drawer-inner">
          <button className="drawer-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
          <div className="eyebrow">Company record</div>
          <h2>{c.name}</h2>
          <div className="dsub">
            {[c.industry, c.city, c.country].filter(Boolean).join(" · ") ||
              "No firmographics yet"}
          </div>

          {/* details — editable, so data cleanup can happen in place */}
          <div className="dgrid" style={{ marginTop: 16 }}>
            <div className="dfield">
              <div className="fl">Name</div>
              <input
                className="dedit"
                value={nameInput}
                disabled={busy}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={() => commitField("name", nameInput)}
                onKeyDown={(e) => e.key === "Enter" && commitField("name", nameInput)}
              />
            </div>
            <div className="dfield">
              <div className="fl">Industry</div>
              <input
                className="dedit"
                value={industryInput}
                disabled={busy}
                onChange={(e) => setIndustryInput(e.target.value)}
                onBlur={() => commitField("industry", industryInput)}
                onKeyDown={(e) =>
                  e.key === "Enter" && commitField("industry", industryInput)
                }
                placeholder="—"
              />
            </div>
            <div className="dfield">
              <div className="fl">Country</div>
              <input
                className="dedit"
                value={countryInput}
                disabled={busy}
                onChange={(e) => setCountryInput(e.target.value)}
                onBlur={() => commitField("country", countryInput)}
                onKeyDown={(e) =>
                  e.key === "Enter" && commitField("country", countryInput)
                }
                placeholder="—"
              />
            </div>
            <div className="dfield">
              <div className="fl">City</div>
              <input
                className="dedit"
                value={cityInput}
                disabled={busy}
                onChange={(e) => setCityInput(e.target.value)}
                onBlur={() => commitField("city", cityInput)}
                onKeyDown={(e) => e.key === "Enter" && commitField("city", cityInput)}
                placeholder="—"
              />
            </div>
            <div className="dfield">
              <div className="fl">Phone</div>
              <input
                className="dedit"
                type="tel"
                value={phoneInput}
                disabled={busy}
                onChange={(e) => setPhoneInput(e.target.value)}
                onBlur={() => commitField("phone", phoneInput)}
                onKeyDown={(e) => e.key === "Enter" && commitField("phone", phoneInput)}
                placeholder="—"
              />
            </div>
            <div className="dfield">
              <div className="fl">Owner</div>
              <div className="fv" style={{ fontSize: 12 }}>
                {c.owner_name || c.owner_code || "—"}
              </div>
            </div>
          </div>

          {/* deals — the point of the page: the whole history with this company */}
          <div className="dsection">Deals ({deals.length})</div>
          <div className="timeline" style={{ marginBottom: 12 }}>
            {deals.length === 0 && (
              <div className="cm" style={{ padding: "4px 0 8px" }}>
                No deals linked yet. Link one from the deal drawer, or add a
                deal with this company on the Pipeline tab.
              </div>
            )}
            {deals.map((d) => {
              const s = stageOf(d.stage);
              return (
                <Link
                  key={d.id}
                  href={d.stage === "lost" ? "/lost" : `/pipeline?deal=${d.id}`}
                  className="tl-item"
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div className="tl-body">
                    <div className="tt">
                      {d.dealname || d.company}
                      {d.value > 0 && (
                        <span style={{ color: "var(--text-faint)" }}>
                          {" "}
                          · {gbp(d.value)}
                        </span>
                      )}
                    </div>
                    <div className="tw">
                      <span
                        style={{
                          color: s?.color ?? undefined,
                          fontWeight: 700,
                        }}
                      >
                        {s?.name ?? d.stage}
                      </span>
                      {" · "}
                      {d.owner_name || d.owner_code || "Unowned"}
                      {d.close_date ? ` · closed ${d.close_date}` : ""}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* contacts */}
          <div className="dsection">Contacts ({contacts.length})</div>
          <div className="timeline" style={{ marginBottom: 12 }}>
            {contacts.length === 0 && (
              <div className="cm" style={{ padding: "4px 0 8px" }}>
                No contacts linked to this company yet.
              </div>
            )}
            {contacts.map((p) => (
              <Link
                key={p.id}
                href={`/contacts?contact=${p.id}`}
                className="tl-item"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="tl-body">
                  <div className="tt">
                    {p.name || p.email || "Unnamed contact"}
                    {p.linkedin_url && <LinkedInIcon url={p.linkedin_url} />}
                  </div>
                  <div className="tw">
                    {[p.title, p.email].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* notes — imported HubSpot history + anything added here */}
          <div className="dsection">Notes ({notes.length})</div>
          <textarea
            className="ctx-add"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a company-level note: relationship history, org changes, who knows whom…"
          />
          <div className="note-hint">
            Line breaks are kept · start a line with “- ” for a bullet ·
            **bold**
          </div>
          <button
            className="ctx-addbtn"
            disabled={busy || !note.trim()}
            onClick={addNote}
          >
            Add note
          </button>
          <div className="timeline" style={{ marginTop: 16 }}>
            {notes.length === 0 && (
              <div className="cm" style={{ padding: "8px 0" }}>
                No notes yet.
              </div>
            )}
            {notes.map((a) => (
              <div key={a.id} className="tl-item">
                <div className="tl-dot" />
                <div className="tl-body">
                  <div className="tt">
                    {a.note ? <NoteText text={a.note} /> : null}
                  </div>
                  <div className="tw">
                    {fmtWhen(a.created_at)}
                    {a.owner_code ? ` · ${a.owner_code}` : ""}
                    {a.deal_id ? " · from a deal" : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* danger zone */}
          <div
            style={{
              marginTop: 28,
              paddingTop: 16,
              borderTop: "1px solid var(--border)",
            }}
          >
            <button
              className="deal-delete"
              disabled={busy}
              onClick={deleteCompany}
            >
              Delete company
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
