"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { gbp } from "@/lib/format";

export interface TaskRow {
  id: string;
  objective: string;
  due_date: string | null; // YYYY-MM-DD
  owner_code: string | null;
  dealId: string | null;
  company: string | null;
  dealname: string | null;
  value: number;
  hot: boolean;
}

type View = "week" | "month";
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
  title,
}: {
  rows: TaskRow[];
  title: string;
}) {
  const [rows, setRows] = useState<TaskRow[]>(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [view, setView] = useState<View>("week");

  // Show all overdue + tasks due within the window (7d / 30d) + tasks with no
  // due date. Tasks due beyond the window are hidden until it widens to Month.
  const visible = useMemo(() => {
    const horizon = view === "week" ? 7 : 30;
    return rows
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
  }, [rows, view]);

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

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
            No tasks due {view === "week" ? "this week" : "this month"}. Open a
            deal to add one.
          </div>
        </div>
      ) : (
        <div>
          {visible.map((r) => {
            const { text, cls } = dueLabel(r.due_date);
            return (
              <div className="action-row" key={r.id}>
                <span className="owner-dot" style={{ width: 30, height: 30 }}>
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
                      <Link
                        href={`/pipeline?deal=${r.dealId}`}
                        style={{ color: "inherit" }}
                      >
                        {r.company || r.dealname || "—"}
                      </Link>
                    ) : (
                      r.company || r.dealname || "—"
                    )}
                    {r.value > 0 ? ` · ${gbp(r.value)}` : ""}
                  </div>
                </div>
                <span className={`a-due ${cls}`}>{text}</span>
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
    </div>
  );
}
