"use client";

import { useMemo, useState } from "react";
import type { Deal, Stage } from "@/lib/types";
import DealDrawer, { type CurrentUser } from "../pipeline/DealDrawer";

export default function LostTable({
  deals: initial,
  stages,
  owners,
  currentUser,
}: {
  deals: Deal[];
  stages: Stage[];
  owners: [string, string][];
  currentUser: CurrentUser;
}) {
  const [deals, setDeals] = useState<Deal[]>(initial);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = deals.find((d) => d.id === selectedId) ?? null;

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
              <tr
                key={d.id}
                onClick={() => setSelectedId(d.id)}
                style={{ cursor: "pointer" }}
              >
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

      {selected && (
        <DealDrawer
          key={selected.id}
          deal={selected}
          stages={stages}
          owners={owners}
          currentUser={currentUser}
          onClose={() => setSelectedId(null)}
          onChanged={(u) =>
            setDeals((ds) =>
              u.stage !== "lost"
                ? ds.filter((x) => x.id !== u.id) // reopened → leaves the Lost list
                : ds.map((x) => (x.id === u.id ? u : x)),
            )
          }
          onDeleted={(id) => {
            setDeals((ds) => ds.filter((x) => x.id !== id));
            setSelectedId(null);
          }}
        />
      )}
    </>
  );
}
