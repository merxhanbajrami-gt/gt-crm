"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { gbp } from "@/lib/format";
import type { Deal, Stage } from "@/lib/types";
import DealDrawer, { type CurrentUser } from "./pipeline/DealDrawer";

export interface TaskRow {
  id: string;
  objective: string;
  due_date: string | null; // YYYY-MM-DD
  owner_code: string | null;
  assignee: string | null; // resolved display name
  dealId: string | null;
  company: string | null;
  dealname: string | null;
  value: number;
  hot: boolean;
}

type View = "week" | "month";
// whose tasks: mine / one teammate's / everyone's (Oleksandr, Sep 2026)
type Who = "mine" | "teammate" | "all";
const DAY = 86400000;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// days from today (negative = overdue); null due dates sort last
function daysUntil(due: string | null): number | null {
  if (!due) return null;
  const t = new Date(todayStr()).getTime();
  return Math.round((new Date(due).getTime() - t) / DAY);
}

function dueLabel(due: string | null): { text: string; cls: string } {
  const d = daysUntil(due);
  if (d === null) return { text: "No due date", cls: "ok" };
  if (d < 0) return { text: `${-d}d overdue`, cls: "over" };
  if (d === 0) return { text: "due today", cls: "due" };
  return { text: `due in ${d}d`, cls: "ok" };
}

export default function WeekList({
  rows: initialRows,
  deals: initialDeals,
  stages,
  owners,
  assignees,
  currentUser,
  canFilterPeople,
}: {
  rows: TaskRow[];
  deals: Deal[];
  stages: Stage[];
  owners: [string, string][];
  assignees: [string, string][];
  currentUser: CurrentUser;
  // managers see the whole team's tasks, so they get the person filter;
  // reps only ever see their own (RLS), so it would be noise for them
  canFilterPeople: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<TaskRow[]>(initialRows);
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [view, setView] = useState<View>("week");
  const teammates = assignees.filter(([code]) => code !== currentUser.repCode);
  const [who, setWho] = useState<Who>(
    canFilterPeople && currentUser.repCode ? "mine" : "all",
  );
  const [teammate, setTeammate] = useState<string>(teammates[0]?.[0] ?? "");
  const teammateName =
    teammates.find(([code]) => code === teammate)?.[1] ?? teammate;
  const title =
    !canFilterPeople || who === "mine"
      ? "Your tasks"
      : who === "teammate"
        ? `${teammateName}'s tasks`
        : "Team tasks";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedDeal = deals.find((d) => d.id === selectedId) ?? null;

  // pick up fresh server data after router.refresh() (drawer close):
  // reset local state when the server hands down new props
  const [prevInitialRows, setPrevInitialRows] = useState(initialRows);
  if (prevInitialRows !== initialRows) {
    setPrevInitialRows(initialRows);
    setRows(initialRows);
    setDeals(initialDeals);
  }

  // Show all overdue + tasks due within the window (7d / 30d) + tasks with no
  // due date. Tasks due beyond the window are hidden until it widens to Month.
  const visible = useMemo(() => {
    const horizon = view === "week" ? 7 : 30;
    const byPerson = (r: TaskRow) =>
      !canFilterPeople || who === "all"
        ? true
        : who === "mine"
          ? r.owner_code === currentUser.repCode
          : r.owner_code === teammate;
    return rows
      .filter(byPerson)
      .filter((r) => {
        const d = daysUntil(r.due_date);
        return d === null || d <= horizon;
      })
      .sort((a, b) => {
        const da = daysUntil(a.due_date);
        const db = daysUntil(b.due_date);
        if (da === null) return db === null ? 0 : 1; // no-date last
        if (db === null) return -1;
        return da - db; // most overdue first
      });
  }, [rows, view, who, teammate, canFilterPeople, currentUser.repCode]);

  const overdue = visible.filter((r) => {
    const d = daysUntil(r.due_date);
    return d !== null && d < 0;
  }).length;

  async function complete(row: TaskRow) {
    setBusyId(row.id);
    const supabase = createClient();
    const { error } = await supabase
      .from("actions")
      .update({ done: true })
      .eq("id", row.id);
    setBusyId(null);
    if (error) {
      alert("Could not complete task: " + error.message);
      return;
    }
    setRows((rs) => rs.filter((r) => r.id !== row.id));
  }

  // reschedule a task's due date without opening the deal
  async function reschedule(row: TaskRow, date: string) {
    const next = date || null;
    setRows((rs) =>
      rs.map((r) => (r.id === row.id ? { ...r, due_date: next } : r)),
    );
    const supabase = createClient();
    const { error } = await supabase
      .from("actions")
      .update({ due_date: next })
      .eq("id", row.id);
    if (error) alert("Could not reschedule: " + error.message);
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <div
          style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
        >
          {canFilterPeople && (
            <div className="toolbar" style={{ margin: 0 }} aria-label="Whose tasks">
              <button
                className={`filterbtn${who === "mine" ? " on" : ""}`}
                onClick={() => setWho("mine")}
              >
                My tasks
              </button>
              <button
                className={`filterbtn${who === "teammate" ? " on" : ""}`}
                onClick={() => setWho("teammate")}
              >
                Teammate&apos;s tasks
              </button>
              {who === "teammate" && (
                <select
                  className="dedit"
                  aria-label="Teammate"
                  value={teammate}
                  onChange={(e) => setTeammate(e.target.value)}
                  style={{ padding: "8px 10px", fontSize: 12.5 }}
                >
                  {teammates.map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              )}
              <button
                className={`filterbtn${who === "all" ? " on" : ""}`}
                onClick={() => setWho("all")}
              >
                All tasks
              </button>
            </div>
          )}
          <div className="toolbar" style={{ margin: 0 }}>
            <button
              className={`filterbtn${view === "week" ? " on" : ""}`}
              onClick={() => setView("week")}
            >
              This week
            </button>
            <button
              className={`filterbtn${view === "month" ? " on" : ""}`}
              onClick={() => setView("month")}
            >
              This month
            </button>
          </div>
          <span className="count">{visible.length}</span>
        </div>
      </div>

      {overdue > 0 && (
        <p className="view-sub" style={{ margin: "0 0 10px" }}>
          {overdue} overdue.
        </p>
      )}

      {visible.length === 0 ? (
        <div className="dayclear" style={{ display: "block" }}>
          <div className="ring">✓</div>
          <div className="big">All clear.</div>
          <div className="sub">
            No tasks due {view === "week" ? "this week" : "this month"}
            {canFilterPeople && who === "mine"
              ? " assigned to you"
              : canFilterPeople && who === "teammate"
                ? ` assigned to ${teammateName}`
                : ""}
            . Open a deal to add one.
          </div>
        </div>
      ) : (
        <div>
          {visible.map((r) => {
            const { text, cls } = dueLabel(r.due_date);
            return (
              <div className="action-row" key={r.id}>
                <span
                  className="owner-dot"
                  style={{ width: 30, height: 30 }}
                  title={r.assignee ?? "Unassigned"}
                >
                  {r.owner_code}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>
                    {r.objective}
                    {r.hot && (
                      <span
                        className="actiondot"
                        style={{ background: "var(--amber)", marginLeft: 8 }}
                        title="Hot deal"
                      />
                    )}
                  </div>
                  <div className="statsub">
                    {r.dealId ? (
                      // plain click opens the deal drawer here; cmd/ctrl-click
                      // still lands on the pipeline via the real href
                      <a
                        href={`/pipeline?deal=${r.dealId}`}
                        style={{ color: "inherit" }}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                          e.preventDefault();
                          setSelectedId(r.dealId);
                        }}
                      >
                        {r.company || r.dealname || "—"}
                      </a>
                    ) : (
                      r.company || r.dealname || "—"
                    )}
                    {r.value > 0 ? ` · ${gbp(r.value)}` : ""}
                    {" · "}
                    {r.assignee ?? "Unassigned"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    className="dedit"
                    type="date"
                    value={r.due_date ?? ""}
                    onChange={(e) => reschedule(r, e.target.value)}
                    title="Reschedule due date"
                    style={{ padding: "5px 8px", fontSize: 12, width: 140 }}
                  />
                  <span className={`a-due ${cls}`}>{text}</span>
                </div>
                <button
                  className="cad-btn"
                  style={{ padding: "6px 12px", fontSize: 12 }}
                  disabled={busyId === r.id}
                  onClick={() => complete(r)}
                >
                  {busyId === r.id ? "…" : "Done"}
                </button>
              </div>
            );
          })}
          <div style={{ marginTop: 14 }}>
            <Link href="/pipeline" className="addbtn">
              Open the pipeline →
            </Link>
          </div>
        </div>
      )}

      {selectedDeal && (
        <DealDrawer
          key={selectedDeal.id}
          deal={selectedDeal}
          stages={stages}
          owners={owners}
          assignees={assignees}
          currentUser={currentUser}
          onClose={() => {
            setSelectedId(null);
            // tasks may have changed inside the drawer — refetch the list
            router.refresh();
          }}
          onChanged={(updated) => {
            setDeals((ds) =>
              ds.map((x) => (x.id === updated.id ? updated : x)),
            );
            // keep the task rows' deal context in step
            setRows((rs) =>
              rs.map((r) =>
                r.dealId === updated.id
                  ? {
                      ...r,
                      company: updated.company,
                      dealname: updated.dealname,
                      value: updated.value,
                      hot: updated.hot,
                    }
                  : r,
              ),
            );
          }}
          onDeleted={(id) => {
            setSelectedId(null);
            setDeals((ds) => ds.filter((x) => x.id !== id));
            setRows((rs) => rs.filter((r) => r.dealId !== id));
          }}
        />
      )}
    </div>
  );
}
