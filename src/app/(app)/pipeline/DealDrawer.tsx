"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtAge } from "@/lib/format";
import { TOUCH_KINDS, TASK_KIND, touchStatus } from "@/lib/cadence";
import { LEAD_SOURCES } from "@/lib/sources";
import type { ActionItem, Deal, Stage } from "@/lib/types";

const DAY = 86400000;

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
}: {
  deal: Deal;
  stages: Stage[];
  owners: [string, string][];
  currentUser: CurrentUser;
  onClose: () => void;
  onChanged: (d: Deal) => void;
}) {
  const supabase = createClient();
  const [d, setD] = useState<Deal>(deal);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [valueInput, setValueInput] = useState(String(deal.value || ""));
  const [verticalInput, setVerticalInput] = useState(deal.vertical ?? "");
  // task composer
  const [taskNote, setTaskNote] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [taskAssignee, setTaskAssignee] = useState(
    deal.owner_code ?? currentUser.repCode ?? "",
  );
  // inline note editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

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

  const loadActions = useCallback(async () => {
    const { data } = await supabase
      .from("actions")
      .select("*")
      .eq("deal_id", deal.id)
      .order("created_at", { ascending: false });
    setActions((data ?? []) as ActionItem[]);
  }, [supabase, deal.id]);

  // fetch this deal's activity on open (async — not a synchronous setState)
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
    return () => {
      active = false;
    };
  }, [supabase, deal.id]);

  // ---- deal mutations ----
  async function patchDeal(patch: Partial<Deal>) {
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
    } else {
      onChanged(next);
    }
  }

  function moveStage(stage: string) {
    if (stage === d.stage) return;
    patchDeal({ stage: stage as Deal["stage"], days_in_stage: 0 });
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
  async function addTask() {
    const objective = taskNote.trim();
    if (!objective) return;
    setBusy(true);
    // assign to self → also set owner_id so it surfaces via either RLS path;
    // assigning to another rep relies on the owner_code policy.
    const ownerId =
      taskAssignee === currentUser.repCode ? currentUser.id : null;
    const { error } = await supabase.from("actions").insert({
      deal_id: d.id,
      kind: TASK_KIND,
      note: objective,
      due_date: taskDue || null,
      owner_code: taskAssignee || null,
      owner_id: ownerId,
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
  const sIdx = stages.findIndex((x) => x.id === d.stage);
  const s = stages.find((x) => x.id === d.stage);

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
          </div>

          {/* stage path */}
          <div className="stagepath">
            {stages
              .filter((x) => x.id !== "lost")
              .map((x, i) => (
                <div
                  key={x.id}
                  className={`sp-step ${i < sIdx ? "done" : ""} ${
                    x.id === d.stage ? "here" : ""
                  }`}
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

          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <button
              className={`sm-pill ${d.hot ? "active" : ""}`}
              style={{ ["--smc" as string]: "var(--amber)" }}
              disabled={busy}
              onClick={() => patchDeal({ hot: !d.hot })}
            >
              {d.hot ? "🔥 Hot" : "Mark hot"}
            </button>
          </div>

          {/* move stage */}
          <div className="dsection">Move stage</div>
          <div className="stagemove">
            {stages.map((x) => (
              <button
                key={x.id}
                className={`sm-pill ${x.id === d.stage ? "active" : ""}`}
                style={{ ["--smc" as string]: x.color ?? "#7B7AE6" }}
                disabled={busy}
                onClick={() => moveStage(x.id)}
              >
                {x.name}
              </button>
            ))}
          </div>

          {/* details */}
          <div className="dgrid">
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
              <div className="fv" style={{ fontSize: 12 }}>
                {d.email ? (
                  <a
                    href={`mailto:${d.email}`}
                    style={{ color: "#2F4BF5", textDecoration: "none" }}
                  >
                    {d.email}
                  </a>
                ) : (
                  "—"
                )}
              </div>
            </div>
            <div className="dfield">
              <div className="fl">Phone</div>
              <div className="fv" style={{ fontSize: 12 }}>
                {d.phone ? (
                  <a
                    href={`tel:${d.phone.replace(/ /g, "")}`}
                    style={{ color: "#2F4BF5", textDecoration: "none" }}
                  >
                    {d.phone}
                  </a>
                ) : (
                  "—"
                )}
              </div>
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

          {/* cadence */}
          {liveStage && (
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
            <select
              className="assign-select"
              value={d.owner_code ?? ""}
              disabled={busy}
              onChange={(e) => reassign(e.target.value)}
            >
              {!d.owner_code && <option value="">Unassigned</option>}
              {owners.map(([c, n]) => (
                <option key={c} value={c}>
                  {n} ({c})
                </option>
              ))}
            </select>
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
              <select
                className="dedit"
                value={taskAssignee}
                onChange={(e) => setTaskAssignee(e.target.value)}
                title="Assignee"
              >
                <option value="">Unassigned</option>
                {owners.map(([c, n]) => (
                  <option key={c} value={c}>
                    {n} ({c})
                  </option>
                ))}
              </select>
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
              return (
                <div key={t.id} className="tl-item">
                  <button
                    className="ctx-del"
                    onClick={() => toggleDone(t)}
                    title="Toggle done"
                    style={{ minWidth: 0 }}
                  >
                    {t.done ? "☑" : "☐"}
                  </button>
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
                      {t.owner_code ? ` · ${t.owner_code}` : ""}
                    </div>
                  </div>
                  <button
                    className="ctx-del"
                    onClick={() => deleteAction(t)}
                    title="Delete task"
                  >
                    delete
                  </button>
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
                          {isNote ? a.note : `Logged ${a.kind}`}
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
        </div>
      </aside>
    </>
  );
}
