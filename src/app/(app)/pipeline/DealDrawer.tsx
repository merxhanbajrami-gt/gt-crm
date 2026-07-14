"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtAge } from "@/lib/format";
import { TOUCH_KINDS, TASK_KIND, touchStatus } from "@/lib/cadence";
import { LEAD_SOURCES } from "@/lib/sources";
import PersonSelect from "@/components/PersonSelect";
import LinkedInIcon, { normalizeUrl } from "@/components/LinkedInIcon";
import type { ActionItem, Contact, Deal, Stage } from "@/lib/types";

const DAY = 86400000;
// Cadence / "log a touch" hidden per Jul 2026 feedback (unsure it's needed).
// Everything below stays wired up — flip this to bring the section back.
const SHOW_CADENCE = false;

export interface CurrentUser {
  id: string;
  fullName: string;
  repCode: string | null;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DealDrawer({
  deal,
  stages,
  owners,
  currentUser,
  onClose,
  onChanged,
  onDeleted,
}: {
  deal: Deal;
  stages: Stage[];
  owners: [string, string][];
  currentUser: CurrentUser;
  onClose: () => void;
  onChanged: (d: Deal) => void;
  onDeleted: (id: string) => void;
}) {
  const supabase = createClient();
  const [d, setD] = useState<Deal>(deal);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [valueInput, setValueInput] = useState(String(deal.value || ""));
  const [verticalInput, setVerticalInput] = useState(deal.vertical ?? "");
  // editable contact fields
  const [contactInput, setContactInput] = useState(deal.contact_name ?? "");
  const [titleInput, setTitleInput] = useState(deal.title ?? "");
  const [emailInput, setEmailInput] = useState(deal.email ?? "");
  const [phoneInput, setPhoneInput] = useState(deal.phone ?? "");
  const [linkedinInput, setLinkedinInput] = useState(deal.linkedin_url ?? "");
  // additional contacts (contacts table rows linked via deal_id)
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [cName, setCName] = useState("");
  const [cTitle, setCTitle] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cLinkedin, setCLinkedin] = useState("");
  // task composer
  const [taskNote, setTaskNote] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [taskAssignee, setTaskAssignee] = useState(
    deal.owner_code ?? currentUser.repCode ?? "",
  );
  // inline note editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  // task editing
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [etObjective, setEtObjective] = useState("");
  const [etDue, setEtDue] = useState("");
  const [etAssignee, setEtAssignee] = useState("");

  function commitValue() {
    const n = Math.max(0, Math.round(Number(valueInput) || 0));
    if (n !== d.value) patchDeal({ value: n });
  }
  function commitVertical() {
    const v = verticalInput.trim();
    if (v !== (d.vertical ?? "")) patchDeal({ vertical: v || null });
  }
  function commitSource(v: string) {
    if (v !== (d.source ?? "")) patchDeal({ source: v || null });
  }
  function commitDate(field: "first_touch_date" | "close_date", v: string) {
    const next = v || null;
    if (next !== (d[field] ?? null)) patchDeal({ [field]: next } as Partial<Deal>);
  }
  function commitField(
    field: "contact_name" | "title" | "email" | "phone" | "linkedin_url",
    v: string,
  ) {
    const val = field === "linkedin_url" ? normalizeUrl(v) : v.trim();
    if (val !== (d[field] ?? "")) patchDeal({ [field]: val || null } as Partial<Deal>);
  }
  // resolve an owner/assignee code to a display name (falls back to the code)
  const ownerName = (code: string | null) =>
    code ? (owners.find(([c]) => c === code)?.[1] ?? code) : null;

  const loadActions = useCallback(async () => {
    const { data } = await supabase
      .from("actions")
      .select("*")
      .eq("deal_id", deal.id)
      .order("created_at", { ascending: false });
    setActions((data ?? []) as ActionItem[]);
  }, [supabase, deal.id]);

  const loadContacts = useCallback(async () => {
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .eq("deal_id", deal.id)
      .order("name");
    setContacts((data ?? []) as Contact[]);
  }, [supabase, deal.id]);

  // fetch this deal's activity + linked contacts on open
  useEffect(() => {
    let active = true;
    supabase
      .from("actions")
      .select("*")
      .eq("deal_id", deal.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (active) setActions((data ?? []) as ActionItem[]);
      });
    supabase
      .from("contacts")
      .select("*")
      .eq("deal_id", deal.id)
      .order("name")
      .then(({ data }) => {
        if (active) setContacts((data ?? []) as Contact[]);
      });
    return () => {
      active = false;
    };
  }, [supabase, deal.id]);

  // ---- linked contacts ----
  async function addContact() {
    if (!cName.trim() && !cEmail.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("contacts").insert({
      deal_id: d.id,
      name: cName.trim() || null,
      title: cTitle.trim() || null,
      email: cEmail.trim() || null,
      linkedin_url: normalizeUrl(cLinkedin) || null,
      dealname: d.dealname ?? d.company,
      stage: d.stage,
      owner_code: d.owner_code,
      owner_id: d.owner_id,
      vertical: d.vertical,
      hot: d.hot,
    });
    setBusy(false);
    if (error) {
      alert("Could not add contact: " + error.message);
      return;
    }
    setCName("");
    setCTitle("");
    setCEmail("");
    setCLinkedin("");
    await loadContacts();
  }

  async function deleteContact(c: Contact) {
    const { error } = await supabase.from("contacts").delete().eq("id", c.id);
    if (error) {
      alert("Could not delete contact: " + error.message);
      return;
    }
    loadContacts();
  }

  // ---- deal mutations ----
  async function patchDeal(patch: Partial<Deal>): Promise<boolean> {
    setBusy(true);
    const prev = d;
    const next = { ...d, ...patch };
    setD(next);
    const { error } = await supabase
      .from("deals")
      .update(patch)
      .eq("id", d.id);
    setBusy(false);
    if (error) {
      setD(prev);
      alert("Could not save: " + error.message);
      return false;
    }
    onChanged(next);
    return true;
  }

  async function moveStage(stage: string) {
    if (stage === d.stage) return;
    const from = stages.find((x) => x.id === d.stage)?.name ?? d.stage;
    const to = stages.find((x) => x.id === stage)?.name ?? stage;
    const ok = await patchDeal({ stage: stage as Deal["stage"], days_in_stage: 0 });
    if (!ok) return;
    // keep linked contacts' stage in step (the Contacts page filters on it)
    await supabase.from("contacts").update({ stage }).eq("deal_id", d.id);
    // record the move in the activity feed (who + what)
    await supabase.from("actions").insert({
      deal_id: d.id,
      owner_id: currentUser.id,
      owner_code: currentUser.repCode,
      kind: "stage",
      note: `Moved ${from} → ${to}`,
    });
    loadActions();
  }

  async function deleteDeal() {
    if (
      !confirm(
        `Delete "${d.company}" permanently? This removes the deal and its tasks & notes, and can't be undone.`,
      )
    )
      return;
    setBusy(true);
    // .select() so we can tell an RLS-blocked no-op from a real delete
    const { data, error } = await supabase
      .from("deals")
      .delete()
      .eq("id", d.id)
      .select("id");
    setBusy(false);
    if (error) {
      alert("Could not delete: " + error.message);
      return;
    }
    if (!data || data.length === 0) {
      alert("You don't have permission to delete this deal.");
      return;
    }
    onDeleted(d.id);
  }

  function reassign(code: string) {
    const name = owners.find(([c]) => c === code)?.[1] ?? code;
    patchDeal({ owner_code: code, owner_name: name });
  }

  function assignToMe() {
    if (!currentUser.repCode) {
      alert("Set your rep code first (your initials) to own deals.");
      return;
    }
    patchDeal({
      owner_code: currentUser.repCode,
      owner_name: currentUser.fullName,
      owner_id: currentUser.id,
    });
  }

  // ---- activity (actions table) ----
  async function addAction(kind: string, text: string | null) {
    setBusy(true);
    const { error } = await supabase.from("actions").insert({
      deal_id: d.id,
      owner_id: currentUser.id,
      owner_code: currentUser.repCode,
      kind,
      note: text,
      done: TOUCH_KINDS.includes(kind), // a logged touch is a completed event
    });
    setBusy(false);
    if (error) {
      alert("Could not save: " + error.message);
      return;
    }
    await loadActions();
  }

  async function toggleDone(a: ActionItem) {
    await supabase.from("actions").update({ done: !a.done }).eq("id", a.id);
    loadActions();
  }

  // ---- tasks (kind='task') ----
  // assigning to self also sets owner_id so it surfaces via either RLS path;
  // assigning to another rep relies on the owner_code policy.
  const ownerIdFor = (code: string) =>
    code && code === currentUser.repCode ? currentUser.id : null;

  async function addTask() {
    const objective = taskNote.trim();
    if (!objective) return;
    setBusy(true);
    const { error } = await supabase.from("actions").insert({
      deal_id: d.id,
      kind: TASK_KIND,
      note: objective,
      due_date: taskDue || null,
      owner_code: taskAssignee || null,
      owner_id: ownerIdFor(taskAssignee),
      created_by: currentUser.id,
      done: false,
    });
    setBusy(false);
    if (error) {
      alert("Could not add task: " + error.message);
      return;
    }
    setTaskNote("");
    setTaskDue("");
    await loadActions();
  }

  function startEditTask(t: ActionItem) {
    setEditingTaskId(t.id);
    setEtObjective(t.note ?? "");
    setEtDue(t.due_date ?? "");
    setEtAssignee(t.owner_code ?? "");
  }

  async function saveTaskEdit(t: ActionItem) {
    const objective = etObjective.trim();
    if (!objective) return;
    setBusy(true);
    const { error } = await supabase
      .from("actions")
      .update({
        note: objective,
        due_date: etDue || null,
        owner_code: etAssignee || null,
        owner_id: ownerIdFor(etAssignee),
      })
      .eq("id", t.id);
    setBusy(false);
    setEditingTaskId(null);
    if (error) {
      alert("Could not save task: " + error.message);
      return;
    }
    await loadActions();
  }

  // ---- inline note editing ----
  async function saveNoteEdit(a: ActionItem) {
    const text = editingText.trim();
    setEditingId(null);
    if (!text || text === (a.note ?? "")) return;
    const { error } = await supabase
      .from("actions")
      .update({ note: text })
      .eq("id", a.id);
    if (error) {
      alert("Could not save note: " + error.message);
      return;
    }
    loadActions();
  }

  async function deleteAction(a: ActionItem) {
    await supabase.from("actions").delete().eq("id", a.id);
    loadActions();
  }

  // tasks live in their own section; the timeline shows touches + notes only
  const tasks = actions.filter((a) => a.kind === TASK_KIND);
  const timeline = actions.filter((a) => a.kind !== TASK_KIND);

  // ---- cadence (shared logic with My Week) ----
  const touches = timeline.filter((a) => TOUCH_KINDS.includes(a.kind));
  const { cadence, lastTouch, nextTouch, daysOverdue } = touchStatus(
    d.stage,
    touches[0]?.created_at ?? null,
    d.days_in_stage,
  );
  const today = new Date();
  const overdue = daysOverdue > 0;
  const liveStage = d.stage !== "won" && d.stage !== "lost";
  const flow = stages.filter((x) => x.id !== "lost"); // connection → won
  const curIdx = flow.findIndex((x) => x.id === d.stage);
  const s = stages.find((x) => x.id === d.stage);

  // keep the current owner visible in the reassign list even if they've since
  // been removed from the active team (so their deals can still be reassigned)
  const reassignOwners: [string, string][] =
    d.owner_code && !owners.some(([c]) => c === d.owner_code)
      ? [...owners, [d.owner_code, d.owner_name ?? d.owner_code]]
      : owners;

  return (
    <>
      <div className="scrim open" onClick={onClose} />
      <aside className="drawer open">
        <div className="drawer-inner">
          <button className="drawer-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
          <div className="eyebrow">Deal record</div>
          <h2>{d.company}</h2>
          <div className="dsub">
            {d.contact_name}
            {d.title ? ` · ${d.title}` : ""}
            {d.linkedin_url && <LinkedInIcon url={d.linkedin_url} />}
          </div>

          {/* stage path — click a step to move the deal there */}
          <div className="stagepath">
            {flow.map((x, i) => (
              <div
                key={x.id}
                className={`sp-step ${curIdx >= 0 && i < curIdx ? "done" : ""} ${
                  x.id === d.stage ? "here" : ""
                }`}
                onClick={() => !busy && moveStage(x.id)}
                title={`Move to ${x.name}`}
                style={{ cursor: busy ? "default" : "pointer" }}
              >
                <div className="sp-dot">
                  <div className="sp-in" />
                </div>
                <div className="sp-name">{x.name}</div>
              </div>
            ))}
          </div>
          {s?.verb && (
            <p
              style={{
                fontSize: 12,
                color: s.color ?? "var(--gt-blue)",
                fontWeight: 700,
                textAlign: "center",
                margin: "2px 0 16px",
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: 1.5,
                textTransform: "uppercase",
              }}
            >
              {s.verb}
            </p>
          )}

          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "center",
              flexWrap: "wrap",
              marginBottom: 16,
            }}
          >
            <button
              className={`sm-pill ${d.hot ? "active" : ""}`}
              style={{ ["--smc" as string]: "var(--amber)" }}
              disabled={busy}
              onClick={() => patchDeal({ hot: !d.hot })}
            >
              {d.hot ? "🔥 Hot" : "Mark hot"}
            </button>
            {d.stage === "lost" ? (
              <button
                className="sm-pill"
                style={{ ["--smc" as string]: "var(--gt-blue)" }}
                disabled={busy}
                onClick={() => moveStage("connection")}
              >
                ↩ Reopen
              </button>
            ) : (
              <button
                className="sm-pill"
                style={{ ["--smc" as string]: "var(--red)" }}
                disabled={busy}
                onClick={() => moveStage("lost")}
              >
                Mark lost
              </button>
            )}
          </div>

          {/* details */}
          <div className="dgrid">
            <div className="dfield">
              <div className="fl">Contact name</div>
              <input
                className="dedit"
                type="text"
                value={contactInput}
                disabled={busy}
                onChange={(e) => setContactInput(e.target.value)}
                onBlur={() => commitField("contact_name", contactInput)}
                onKeyDown={(e) =>
                  e.key === "Enter" && commitField("contact_name", contactInput)
                }
                placeholder="—"
              />
            </div>
            <div className="dfield">
              <div className="fl">Title</div>
              <input
                className="dedit"
                type="text"
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
              <div className="fl">Value (£k)</div>
              <input
                className="dedit"
                type="number"
                min={0}
                value={valueInput}
                disabled={busy}
                onChange={(e) => setValueInput(e.target.value)}
                onBlur={commitValue}
                onKeyDown={(e) => e.key === "Enter" && commitValue()}
                placeholder="0"
              />
            </div>
            <div className="dfield">
              <div className="fl">Owner</div>
              <div className="fv" style={{ fontSize: 12 }}>
                {d.owner_name || d.owner_code || "—"}
              </div>
            </div>
            <div className="dfield">
              <div className="fl">Quiet for</div>
              <div className="fv">
                {d.stage === "won"
                  ? "Won"
                  : d.days_in_stage
                    ? fmtAge(d.days_in_stage)
                    : "No date"}
              </div>
            </div>
            <div className="dfield">
              <div className="fl">Vertical</div>
              <input
                className="dedit"
                type="text"
                value={verticalInput}
                disabled={busy}
                onChange={(e) => setVerticalInput(e.target.value)}
                onBlur={commitVertical}
                onKeyDown={(e) => e.key === "Enter" && commitVertical()}
                placeholder="Unassigned"
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
              <div className="fl">Phone</div>
              <input
                className="dedit"
                type="tel"
                value={phoneInput}
                disabled={busy}
                onChange={(e) => setPhoneInput(e.target.value)}
                onBlur={() => commitField("phone", phoneInput)}
                onKeyDown={(e) =>
                  e.key === "Enter" && commitField("phone", phoneInput)
                }
                placeholder="—"
              />
            </div>
            <div className="dfield">
              <div className="fl">LinkedIn</div>
              <input
                className="dedit"
                type="text"
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
              <div className="fl">Lead source</div>
              <select
                className="dedit"
                value={d.source ?? ""}
                disabled={busy}
                onChange={(e) => commitSource(e.target.value)}
              >
                <option value="">Unknown</option>
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="dfield">
              <div className="fl">First touch</div>
              <input
                className="dedit"
                type="date"
                value={d.first_touch_date ?? ""}
                disabled={busy}
                onChange={(e) => commitDate("first_touch_date", e.target.value)}
              />
            </div>
            <div className="dfield">
              <div className="fl">Close date</div>
              <input
                className="dedit"
                type="date"
                value={d.close_date ?? ""}
                disabled={busy}
                onChange={(e) => commitDate("close_date", e.target.value)}
              />
            </div>
          </div>

          {/* linked contacts — a deal can have more than just its primary contact */}
          <div className="dsection">Contacts</div>
          <div className="timeline" style={{ marginBottom: 12 }}>
            {contacts.length === 0 && (
              <div className="cm" style={{ padding: "4px 0 8px" }}>
                No linked contacts yet — add colleagues, champions, or other
                stakeholders below.
              </div>
            )}
            {contacts.map((c) => (
              <div key={c.id} className="tl-item">
                <div className="tl-body">
                  <div className="tt">
                    {c.name || c.email || "Unnamed contact"}
                    {c.linkedin_url && <LinkedInIcon url={c.linkedin_url} />}
                  </div>
                  <div className="tw">
                    {[c.title, c.email].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <button
                  className="ctx-del"
                  style={{ marginLeft: "auto" }}
                  onClick={() => deleteContact(c)}
                  title="Remove contact"
                >
                  delete
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input
                className="dedit"
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                placeholder="Name"
              />
              <input
                className="dedit"
                value={cTitle}
                onChange={(e) => setCTitle(e.target.value)}
                placeholder="Title"
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input
                className="dedit"
                type="email"
                value={cEmail}
                onChange={(e) => setCEmail(e.target.value)}
                placeholder="Email"
              />
              <input
                className="dedit"
                value={cLinkedin}
                onChange={(e) => setCLinkedin(e.target.value)}
                placeholder="linkedin.com/in/…"
              />
            </div>
            <button
              className="ctx-addbtn"
              disabled={busy || (!cName.trim() && !cEmail.trim())}
              onClick={addContact}
            >
              Add contact
            </button>
          </div>

          {/* cadence */}
          {SHOW_CADENCE && liveStage && (
            <>
              <div className="dsection">Cadence</div>
              <div className="cadence">
                <div className="cad-row">
                  <div className="cad-cell">
                    <div className="cl">Last touch</div>
                    <div className="cv">
                      {lastTouch ? fmtDate(lastTouch.toISOString()) : "None"}
                    </div>
                    <div className="cm">
                      {lastTouch
                        ? fmtAge(
                            Math.round(
                              (today.getTime() - lastTouch.getTime()) / DAY,
                            ),
                          ) + " ago"
                        : "no activity logged"}
                    </div>
                  </div>
                  <div className="cad-cell next">
                    <div className="cl">Next touch</div>
                    <div className="cv">{fmtDate(nextTouch.toISOString())}</div>
                    <div className="cm">
                      target every {cadence}d in {s?.name}
                    </div>
                  </div>
                </div>
                <span className={`cad-status ${overdue ? "overdue" : "ontrack"}`}>
                  {overdue ? "Overdue for a touch" : "On track"}
                </span>
                <div className="cad-actions">
                  <button
                    className="cad-btn"
                    disabled={busy}
                    onClick={() => addAction("touch", null)}
                  >
                    Log a touch today
                  </button>
                </div>
              </div>
            </>
          )}

          {/* assignee */}
          <div className="dsection">Assignee</div>
          <div className="assign-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <PersonSelect
                owners={reassignOwners}
                value={d.owner_code ?? ""}
                onChange={(code) => code && reassign(code)}
                placeholder="Type a name…"
                allowUnassigned={false}
              />
            </div>
            <button
              className={`assign-me ${
                d.owner_code === currentUser.repCode ? "mine" : ""
              }`}
              disabled={busy}
              onClick={assignToMe}
            >
              {d.owner_code === currentUser.repCode ? "✓ Yours" : "Assign to me"}
            </button>
          </div>

          {/* tasks */}
          <div className="dsection">Tasks</div>
          <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            <input
              className="dedit"
              value={taskNote}
              onChange={(e) => setTaskNote(e.target.value)}
              placeholder="Task objective — e.g. send the proposal, book the call…"
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input
                className="dedit"
                type="date"
                value={taskDue}
                onChange={(e) => setTaskDue(e.target.value)}
                title="Due date"
              />
              <PersonSelect
                owners={owners}
                value={taskAssignee}
                onChange={setTaskAssignee}
                placeholder="Assign to…"
              />
            </div>
            <button
              className="ctx-addbtn"
              disabled={busy || !taskNote.trim()}
              onClick={addTask}
            >
              Add task
            </button>
          </div>
          <div className="timeline">
            {tasks.length === 0 && (
              <div className="cm" style={{ padding: "4px 0 8px" }}>
                No tasks yet.
              </div>
            )}
            {tasks.map((t) => {
              const overdue =
                !t.done &&
                t.due_date != null &&
                t.due_date < today.toISOString().slice(0, 10);
              const editing = editingTaskId === t.id;
              if (editing) {
                return (
                  <div key={t.id} className="tl-item">
                    <div className="tl-body" style={{ display: "grid", gap: 8 }}>
                      <input
                        className="dedit"
                        value={etObjective}
                        onChange={(e) => setEtObjective(e.target.value)}
                        placeholder="Task objective"
                        autoFocus
                      />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <input
                          className="dedit"
                          type="date"
                          value={etDue}
                          onChange={(e) => setEtDue(e.target.value)}
                          title="Due date"
                        />
                        <PersonSelect
                          owners={owners}
                          value={etAssignee}
                          onChange={setEtAssignee}
                          placeholder="Assign to…"
                        />
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          className="ctx-addbtn"
                          style={{ padding: "4px 12px", fontSize: 12 }}
                          disabled={busy || !etObjective.trim()}
                          onClick={() => saveTaskEdit(t)}
                        >
                          Save
                        </button>
                        <button
                          className="ctx-del"
                          onClick={() => setEditingTaskId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div key={t.id} className="tl-item">
                  <div
                    className="tl-box"
                    onClick={() => toggleDone(t)}
                    title={t.done ? "Reopen" : "Mark done"}
                    style={{ cursor: "pointer" }}
                  >
                    {t.done ? "✓" : ""}
                  </div>
                  <div className="tl-body">
                    <div
                      className="tt"
                      style={{
                        textDecoration: t.done ? "line-through" : "none",
                        color: t.done ? "var(--text-faint)" : undefined,
                      }}
                    >
                      {t.note}
                    </div>
                    <div className="tw">
                      {t.due_date ? (
                        <span style={{ color: overdue ? "var(--red, #DC2626)" : undefined }}>
                          {overdue ? "Overdue · " : "Due "}
                          {fmtDate(t.due_date)}
                        </span>
                      ) : (
                        "No due date"
                      )}
                      {" · "}
                      {ownerName(t.owner_code) ?? "Unassigned"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                    <button
                      className="ctx-del"
                      onClick={() => toggleDone(t)}
                      title={t.done ? "Reopen task" : "Mark done"}
                    >
                      {t.done ? "reopen" : "done"}
                    </button>
                    <button
                      className="ctx-del"
                      onClick={() => startEditTask(t)}
                      title="Edit task"
                    >
                      edit
                    </button>
                    <button
                      className="ctx-del"
                      onClick={() => deleteAction(t)}
                      title="Delete task"
                    >
                      delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* activity / notes */}
          <div className="dsection">Notes &amp; activity</div>
          <textarea
            className="ctx-add"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add context: a call summary, a blocker, a next step, who introduced you…"
          />
          <button
            className="ctx-addbtn"
            disabled={busy || !note.trim()}
            onClick={async () => {
              await addAction("note", note.trim());
              setNote("");
            }}
          >
            Add note
          </button>

          <div className="timeline" style={{ marginTop: 16 }}>
            {timeline.length === 0 && (
              <div className="cm" style={{ padding: "8px 0" }}>
                No activity logged yet. Log a touch or add a note above.
              </div>
            )}
            {timeline.map((a) => {
              const isNote = a.kind === "note";
              const editing = editingId === a.id;
              return (
                <div
                  key={a.id}
                  className={`tl-item ${TOUCH_KINDS.includes(a.kind) ? "hot" : ""}`}
                >
                  <div className="tl-dot" />
                  <div className="tl-body">
                    {editing ? (
                      <>
                        <textarea
                          className="ctx-add"
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          autoFocus
                        />
                        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                          <button
                            className="ctx-addbtn"
                            style={{ padding: "4px 12px", fontSize: 12 }}
                            onClick={() => saveNoteEdit(a)}
                          >
                            Save
                          </button>
                          <button
                            className="ctx-del"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="tt">
                          {a.note ? a.note : `Logged ${a.kind}`}
                        </div>
                        <div className="tw">{fmtWhen(a.created_at)}</div>
                      </>
                    )}
                  </div>
                  {isNote && !editing && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className="ctx-del"
                        onClick={() => {
                          setEditingId(a.id);
                          setEditingText(a.note ?? "");
                        }}
                        title="Edit note"
                      >
                        edit
                      </button>
                      <button
                        className="ctx-del"
                        onClick={() => deleteAction(a)}
                        title="Delete note"
                      >
                        delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
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
              onClick={deleteDeal}
            >
              Delete deal
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
