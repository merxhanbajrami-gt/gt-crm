"use client";

import { useMemo, useState } from "react";
import type { Deal, Stage } from "@/lib/types";
import DealDrawer, { type CurrentUser } from "../pipeline/DealDrawer";

export default function LostTable({
  deals: initial,
  stages,
  owners,
  assignees,
  currentUser,
}: {
  deals: Deal[];
  stages: Stage[];
  owners: [string, string][];
  assignees: [string, string][];
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
      [
        d.company,
        d.dealname,
        d.owner_code,
        d.owner_name,
        d.client_type,
        d.lost_reason,
      ]
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
          placeholder="Search lost deals, companies, owners, client types"
        />
      </div>
      <div className="panel" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Deal</th>
              <th>Owner</th>
              <th>Client type</th>
              <th>Why lost</th>
              <th>Closed</th>
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
                <td>{d.client_type || "Unassigned"}</td>
                <td>{d.lost_reason || "—"}</td>
                <td>{d.close_date || "—"}</td>
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
          assignees={assignees}
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
