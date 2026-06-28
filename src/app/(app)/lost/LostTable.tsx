"use client";

import { useMemo, useState } from "react";
import type { Deal } from "@/lib/types";

export default function LostTable({ deals }: { deals: Deal[] }) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return deals;
    return deals.filter((d) =>
      [d.company, d.dealname, d.owner_code, d.owner_name, d.vertical]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [deals, q]);

  return (
    <>
      <div className="toolbar">
        <input
          className="search"
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search lost deals, companies, owners, verticals"
        />
      </div>
      <div className="panel" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Deal</th>
              <th>Owner</th>
              <th>Vertical</th>
              <th>Contacts</th>
              <th>Last activity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td>{d.dealname || d.company}</td>
                <td>{d.owner_name || d.owner_code || "—"}</td>
                <td>{d.vertical || "Unassigned"}</td>
                <td>{d.n_contacts}</td>
                <td>{d.last_activity || "No recent activity logged"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
