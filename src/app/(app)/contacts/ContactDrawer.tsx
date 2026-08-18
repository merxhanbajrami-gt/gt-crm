"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { gbp } from "@/lib/format";
import LinkedInIcon, { normalizeUrl } from "@/components/LinkedInIcon";
import NoteText from "@/components/NoteText";
import CompanySelect from "@/components/CompanySelect";
import type { ActionItem, Contact, Deal } from "@/lib/types";
import type { CurrentUser } from "../pipeline/DealDrawer";

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// The contact record: who they are, where they work, the deal they're on,
// and the running note history. Fields are editable in place — the contact
// book is mid-cleanup and this is where the team fixes records.
export default function ContactDrawer({
  contact,
  currentUser,
  onClose,
  onChanged,
  onDeleted,
}: {
  contact: Contact;
  currentUser: CurrentUser;
  onClose: () => void;
  onChanged: (c: Contact) => void;
  onDeleted: (id: string) => void;
}) {
  const supabase = createClient();
  const [c, setC] = useState<Contact>(contact);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [notes, setNotes] = useState<ActionItem[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // editable fields
  const [nameInput, setNameInput] = useState(contact.name ?? "");
  const [titleInput, setTitleInput] = useState(contact.title ?? "");
  const [emailInput, setEmailInput] = useState(contact.email ?? "");
  const [linkedinInput, setLinkedinInput] = useState(
    contact.linkedin_url ?? "",
  );

  useEffect(() => {
    let active = true;
    if (contact.deal_id) {
      supabase
        .from("deals")
        .select("*")
        .eq("id", contact.deal_id)
        .maybeSingle()
        .then(({ data }) => {
          if (active) setDeal((data as Deal) ?? null);
        });
    }
    if (contact.company_id) {
      supabase
        .from("companies")
        .select("name")
        .eq("id", contact.company_id)
        .maybeSingle()
        .then(({ data }) => {
          if (active) setCompanyName(data?.name ?? "");
        });
    }
    supabase
      .from("actions")
      .select("*")
      .eq("contact_id", contact.id)
      .eq("kind", "note")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (active) setNotes((data ?? []) as ActionItem[]);
      });
    return () => {
      active = false;
    };
  }, [supabase, contact.id, contact.deal_id, contact.company_id]);

  async function patchContact(patch: Partial<Contact>): Promise<boolean> {
    setBusy(true);
    const prev = c;
    const next = { ...c, ...patch };
    setC(next);
    const { error } = await supabase
      .from("contacts")
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
    field: "name" | "title" | "email" | "linkedin_url",
    v: string,
  ) {
    const val = field === "linkedin_url" ? normalizeUrl(v) : v.trim();
    if (val !== (c[field] ?? ""))
      patchContact({ [field]: val || null } as Partial<Contact>);
  }

  // link to a company from the book, creating the record if needed
  async function createAndLinkCompany(name: string) {
    setBusy(true);
    const { data, error } = await supabase
      .from("companies")
      .insert({ name })
      .select("id, name")
      .single();
    setBusy(false);
    if (error) {
      alert("Could not create company: " + error.message);
      setCompanyName("");
      return;
    }
    setCompanyName(data.name);
    patchContact({ company_id: data.id });
  }

  async function addNote() {
    const text = note.trim();
    if (!text) return;
    setBusy(true);
    const { error } = await supabase.from("actions").insert({
      contact_id: c.id,
      company_id: c.company_id,
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
      .eq("contact_id", c.id)
      .eq("kind", "note")
      .order("created_at", { ascending: false })
      .limit(200);
    setNotes((data ?? []) as ActionItem[]);
  }

  async function deleteContact() {
    if (
      !confirm(
        `Delete "${c.name || c.email || "this contact"}"? Their notes are kept — they just lose the contact link. This can't be undone.`,
      )
    )
      return;
    setBusy(true);
    const { data, error } = await supabase
      .from("contacts")
      .delete()
      .eq("id", c.id)
      .select("id");
    setBusy(false);
    if (error) {
      alert("Could not delete: " + error.message);
      return;
    }
    if (!data || data.length === 0) {
      alert("You don't have permission to delete this contact.");
      return;
    }
    onDeleted(c.id);
  }

  return (
    <>
      <div className="scrim open" onClick={onClose} />
      <aside className="drawer open">
        <div className="drawer-inner">
          <button className="drawer-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
          <div className="eyebrow">Contact record</div>
          <h2>{c.name || c.email || "Unnamed contact"}</h2>
          <div className="dsub">
            {[c.title, companyName].filter(Boolean).join(" · ") || "—"}
            {c.linkedin_url && <LinkedInIcon url={c.linkedin_url} />}
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
                onKeyDown={(e) =>
                  e.key === "Enter" && commitField("name", nameInput)
                }
                placeholder="—"
              />
            </div>
            <div className="dfield">
              <div className="fl">Title</div>
              <input
                className="dedit"
                value={titleInput}
                disabled={busy}
                onChange={(e) => setTitleInput(e.target.value)}
                onBlur={() => commitField("title", titleInput)}
                onKeyDown={(e) =>
                  e.key === "Enter" && commitField("title", titleInput)
                }
                placeholder="—"
              />
            </div>
            <div className="dfield">
              <div className="fl">Email</div>
              <input
                className="dedit"
                type="email"
                value={emailInput}
                disabled={busy}
                onChange={(e) => setEmailInput(e.target.value)}
                onBlur={() => commitField("email", emailInput)}
                onKeyDown={(e) =>
                  e.key === "Enter" && commitField("email", emailInput)
                }
                placeholder="—"
              />
            </div>
            <div className="dfield">
              <div className="fl">LinkedIn</div>
              <input
                className="dedit"
                value={linkedinInput}
                disabled={busy}
                onChange={(e) => setLinkedinInput(e.target.value)}
                onBlur={() => commitField("linkedin_url", linkedinInput)}
                onKeyDown={(e) =>
                  e.key === "Enter" && commitField("linkedin_url", linkedinInput)
                }
                placeholder="linkedin.com/in/…"
              />
            </div>
            <div className="dfield">
              <div className="fl">
                Company
                {c.company_id && (
                  <Link
                    href={`/companies?company=${c.company_id}`}
                    style={{
                      marginLeft: 6,
                      fontSize: 10,
                      color: "var(--gt-blue)",
                      textDecoration: "none",
                      fontWeight: 700,
                    }}
                    title="Open the company record"
                  >
                    open ↗
                  </Link>
                )}
              </div>
              <CompanySelect
                name={companyName}
                onChange={(name, id) => {
                  setCompanyName(name);
                  if (id) patchContact({ company_id: id });
                }}
                onCreatePick={createAndLinkCompany}
                onDismiss={() => setCompanyName(companyName)}
                placeholder="Link a company…"
              />
            </div>
            <div className="dfield">
              <div className="fl">Owner</div>
              <div className="fv" style={{ fontSize: 12 }}>
                {c.owner_code || "—"}
              </div>
            </div>
          </div>

          {/* the deal they're on, if any */}
          <div className="dsection">Deal</div>
          <div className="timeline" style={{ marginBottom: 12 }}>
            {!deal && (
              <div className="cm" style={{ padding: "4px 0 8px" }}>
                Not linked to a deal. Contacts join deals from the deal drawer.
              </div>
            )}
            {deal && (
              <Link
                href={deal.stage === "lost" ? "/lost" : `/pipeline?deal=${deal.id}`}
                className="tl-item"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="tl-body">
                  <div className="tt">
                    {deal.dealname || deal.company}
                    {deal.value > 0 && (
                      <span style={{ color: "var(--text-faint)" }}>
                        {" "}
                        · {gbp(deal.value)}
                      </span>
                    )}
                  </div>
                  <div className="tw">
                    {deal.stage}
                    {" · "}
                    {deal.owner_name || deal.owner_code || "Unowned"}
                  </div>
                </div>
              </Link>
            )}
          </div>

          {/* notes */}
          <div className="dsection">Notes ({notes.length})</div>
          <textarea
            className="ctx-add"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note about this person: context, history, preferences…"
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
              onClick={deleteContact}
            >
              Delete contact
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
