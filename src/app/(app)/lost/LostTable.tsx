"use client";

import { useMemo, useState } from "react";
import type { Deal, Stage } from "@/lib/types";
import { fmtDay } from "@/components/ClientTag";
import DealDrawer, { type CurrentUser } from "../pipeline/DealDrawer";

type SortKey = "dealname" | "owner" | "client_type" | "lost_reason" | "close_date";

// the sortable text/date behind each column (nulls sort last either way)
function sortValue(d: Deal, k: SortKey): string | null {
  switch (k) {
    case "dealname":
      return (d.dealname || d.company || "").toLowerCase();
    case "owner":
      return (d.owner_name || d.owner_code || "").toLowerCase() || null;
    case "client_type":
      return d.client_type?.toLowerCase() ?? null;
    case "lost_reason":
      return d.lost_reason?.toLowerCase() ?? null;
    case "close_date":
      return d.close_date;
  }
}

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
  // most recently closed first — the question is usually "what did we just lose?"
  const [sortKey, setSortKey] = useState<SortKey>("close_date");
  const [asc, setAsc] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = deals.find((d) => d.id === selectedId) ?? null;

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtered = term
      ? deals.filter((d) =>
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
        )
      : deals;
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (va === vb) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      const cmp = va < vb ? -1 : 1;
      return asc ? cmp : -cmp;
    });
  }, [deals, q, sortKey, asc]);

  function sortBy(k: SortKey) {
    if (k === sortKey) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(k !== "close_date"); // dates read best newest-first
    }
  }

  const arrow = (k: SortKey) =>
    sortKey === k ? <span className="arrow">{asc ? "▲" : "▼"}</span> : null;

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
              <th onClick={() => sortBy("dealname")}>Deal{arrow("dealname")}</th>
              <th onClick={() => sortBy("owner")}>Owner{arrow("owner")}</th>
              <th onClick={() => sortBy("client_type")}>
                Client type{arrow("client_type")}
              </th>
              <th onClick={() => sortBy("lost_reason")}>
                Why lost{arrow("lost_reason")}
              </th>
              <th onClick={() => sortBy("close_date")}>
                Closed{arrow("close_date")}
              </th>
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
                <td title={d.close_date ?? undefined}>{fmtDay(d.close_date)}</td>
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
