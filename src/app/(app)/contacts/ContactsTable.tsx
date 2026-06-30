"use client";

import { useMemo, useState } from "react";
import type { Contact } from "@/lib/types";

type SortKey = "name" | "dealname" | "stage" | "owner_code";
type Filter = "all" | "active" | "won" | "lost";

const FILTERS: { f: Filter; label: string }[] = [
  { f: "all", label: "All" },
  { f: "active", label: "Active" },
  { f: "won", label: "Customers" },
  { f: "lost", label: "Lost" },
];

export default function ContactsTable({ contacts }: { contacts: Contact[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [asc, setAsc] = useState(true);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    let out = contacts.filter((c) => {
      if (filter === "won" && c.stage !== "won") return false;
      if (filter === "lost" && c.stage !== "lost") return false;
      if (
        filter === "active" &&
        !["connection", "pursue", "attack", "close"].includes(c.stage ?? "")
      )
        return false;
      if (!term) return true;
      return [c.name, c.dealname, c.title, c.email, c.owner_code]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
    out = [...out].sort((a, b) => {
      const av = String(a[sortKey] ?? "").toLowerCase();
      const bv = String(b[sortKey] ?? "").toLowerCase();
      return asc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return out;
  }, [contacts, q, filter, sortKey, asc]);

  function sortBy(k: SortKey) {
    if (k === sortKey) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(true);
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
          placeholder="Search contacts, companies, titles, owners"
        />
        {FILTERS.map(({ f, label }) => (
          <button
            key={f}
            className={`filterbtn${filter === f ? " on" : ""}`}
            onClick={() => setFilter(f)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="panel" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th onClick={() => sortBy("name")}>Name{arrow("name")}</th>
              <th onClick={() => sortBy("dealname")}>
                Company / Deal{arrow("dealname")}
              </th>
              <th onClick={() => sortBy("stage")}>Stage{arrow("stage")}</th>
              <th>Email</th>
              <th onClick={() => sortBy("owner_code")}>
                Owner{arrow("owner_code")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 500).map((c) => (
              <tr key={c.id}>
                <td>
                  {c.name}
                  {c.title ? (
                    <span style={{ color: "var(--text-faint)" }}>
                      {" "}
                      · {c.title}
                    </span>
                  ) : null}
                </td>
                <td>{c.dealname || "—"}</td>
                <td>{c.stage || "—"}</td>
                <td>{c.email || "—"}</td>
                <td>{c.owner_code || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 500 && (
          <p className="lf-note" style={{ padding: "10px 4px" }}>
            Showing first 500 of {rows.length.toLocaleString()} matches — refine
            your search.
          </p>
        )}
      </div>
    </>
  );
}
