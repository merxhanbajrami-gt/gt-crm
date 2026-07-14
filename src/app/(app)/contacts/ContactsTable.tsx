"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import LinkedInIcon from "@/components/LinkedInIcon";
import type { Contact } from "@/lib/types";

export const CONTACTS_PAGE = 200;

type SortKey = "name" | "dealname" | "stage" | "owner_code";
type Filter = "all" | "active" | "won" | "lost";

const FILTERS: { f: Filter; label: string }[] = [
  { f: "all", label: "All" },
  { f: "active", label: "Active" },
  { f: "won", label: "Customers" },
  { f: "lost", label: "Lost" },
];

const ACTIVE_STAGES = ["connection", "pursue", "attack", "close"];
const SEARCH_COLS = ["name", "dealname", "title", "email", "owner_code"];

export default function ContactsTable({
  initialContacts,
  total,
}: {
  initialContacts: Contact[];
  total: number;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [asc, setAsc] = useState(true);

  const [rows, setRows] = useState<Contact[]>(initialContacts);
  const [matches, setMatches] = useState(total);
  const [loading, setLoading] = useState(false);
  const didMount = useRef(false);

  // Query the whole table server-side whenever the search/filter/sort changes.
  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    // skip the first run — the server already gave us page 1 + the total
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      const supabase = createClient();
      let query = supabase
        .from("contacts")
        .select("*", { count: "exact" })
        .order(sortKey, { ascending: asc })
        .limit(CONTACTS_PAGE);

      if (filter === "won") query = query.eq("stage", "won");
      else if (filter === "lost") query = query.eq("stage", "lost");
      else if (filter === "active") query = query.in("stage", ACTIVE_STAGES);

      const term = q.trim().replace(/[,()]/g, " ").trim();
      if (term) {
        query = query.or(
          SEARCH_COLS.map((c) => `${c}.ilike.%${term}%`).join(","),
        );
      }

      const { data, count } = await query;
      setRows((data ?? []) as Contact[]);
      setMatches(count ?? 0);
      setLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [q, filter, sortKey, asc]);

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
            {rows.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.name}
                  {c.linkedin_url && <LinkedInIcon url={c.linkedin_url} />}
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
        <p className="lf-note" style={{ padding: "10px 4px" }}>
          {loading
            ? "Searching…"
            : matches > rows.length
              ? `Showing first ${rows.length.toLocaleString()} of ${matches.toLocaleString()} matches — refine your search.`
              : `${matches.toLocaleString()} ${matches === 1 ? "match" : "matches"}.`}
        </p>
      </div>
    </>
  );
}
