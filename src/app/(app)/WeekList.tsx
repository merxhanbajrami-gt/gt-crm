"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { gbp } from "@/lib/format";

export interface WeekRow {
  id: string;
  company: string | null;
  dealname: string | null;
  vertical: string | null;
  value: number;
  owner_code: string | null;
  hot: boolean;
  daysOverdue: number;
}

export default function WeekList({
  rows: initialRows,
  currentUser,
  title,
}: {
  rows: WeekRow[];
  currentUser: { id: string; repCode: string | null };
  title: string;
}) {
  const [rows, setRows] = useState<WeekRow[]>(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function logTouch(row: WeekRow) {
    setBusyId(row.id);
    const supabase = createClient();
    const { error } = await supabase.from("actions").insert({
      deal_id: row.id,
      owner_id: currentUser.id,
      owner_code: currentUser.repCode,
      kind: "touch",
      done: true,
    });
    setBusyId(null);
    if (error) {
      alert("Could not log touch: " + error.message);
      return;
    }
    // touched → next touch is now in the future, so it leaves this week's list
    setRows((rs) => rs.filter((r) => r.id !== row.id));
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <span className="count">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="dayclear" style={{ display: "block" }}>
          <div className="ring">✓</div>
          <div className="big">Week clear.</div>
          <div className="sub">
            Every open lead is on the clock. Nothing is overdue for a touch.
          </div>
        </div>
      ) : (
        <div>
      {rows.map((r) => {
        const overdue = r.daysOverdue > 0;
        const label =
          r.daysOverdue > 0
            ? `${r.daysOverdue}d overdue`
            : r.daysOverdue === 0
              ? "due today"
              : `due in ${-r.daysOverdue}d`;
        return (
          <div className="action-row" key={r.id}>
            <span className="owner-dot" style={{ width: 30, height: 30 }}>
              {r.owner_code}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>
                {r.company}
                {r.hot && (
                  <span
                    className="actiondot"
                    style={{ background: "var(--amber)", marginLeft: 8 }}
                    title="Hot"
                  />
                )}
              </div>
              <div className="statsub">
                {r.dealname || r.vertical || "—"}
                {r.value > 0 ? ` · ${gbp(r.value)}` : ""}
              </div>
            </div>
            <span
              className={`a-due ${
                overdue ? "over" : r.daysOverdue === 0 ? "due" : "ok"
              }`}
            >
              {label}
            </span>
            <button
              className="cad-btn"
              style={{ padding: "6px 12px", fontSize: 12 }}
              disabled={busyId === r.id}
              onClick={() => logTouch(r)}
            >
              {busyId === r.id ? "…" : "Log touch"}
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
