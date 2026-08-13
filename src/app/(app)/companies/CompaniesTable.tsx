"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CompanyRow, Stage } from "@/lib/types";
import CompanyDrawer from "./CompanyDrawer";
import type { CurrentUser } from "../pipeline/DealDrawer";

export const COMPANIES_PAGE = 200;

type SortKey = "name" | "industry" | "country" | "deal_count";

const SEARCH_COLS = ["name", "industry", "country", "city", "owner_code"];

export default function CompaniesTable({
  initialCompanies,
  total,
  stages,
  initialCompany,
  currentUser,
}: {
  initialCompanies: CompanyRow[];
  total: number;
  stages: Stage[];
  initialCompany: CompanyRow | null;
  currentUser: CurrentUser;
}) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [asc, setAsc] = useState(true);

  const [rows, setRows] = useState<CompanyRow[]>(initialCompanies);
  const [matches, setMatches] = useState(total);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<CompanyRow | null>(initialCompany);
  const didMount = useRef(false);

  // server-side search/sort over the whole book (same pattern as Contacts)
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      const supabase = createClient();
      let query = supabase
        .from("v_companies")
        .select("*", { count: "exact" })
        .order(sortKey, { ascending: asc })
        .limit(COMPANIES_PAGE);

      const term = q.trim().replace(/[,()]/g, " ").trim();
      if (term) {
        query = query.or(
          SEARCH_COLS.map((c) => `${c}.ilike.%${term}%`).join(","),
        );
      }

      const { data, count } = await query;
      setRows((data ?? []) as CompanyRow[]);
      setMatches(count ?? 0);
      setLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [q, sortKey, asc]);

  function sortBy(k: SortKey) {
    if (k === sortKey) setAsc((v) => !v);
    else {
      setSortKey(k);
      // counts read best highest-first
      setAsc(k !== "deal_count");
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
          placeholder="Search companies, industries, countries, owners"
        />
      </div>
      <div className="panel" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th onClick={() => sortBy("name")}>Company{arrow("name")}</th>
              <th onClick={() => sortBy("industry")}>
                Industry{arrow("industry")}
              </th>
              <th onClick={() => sortBy("country")}>
                Country{arrow("country")}
              </th>
              <th>Owner</th>
              <th onClick={() => sortBy("deal_count")}>
                Deals{arrow("deal_count")}
              </th>
              <th>Contacts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.id}
                onClick={() => setSelected(c)}
                style={{ cursor: "pointer" }}
              >
                <td>
                  {c.name}
                  {c.city ? (
                    <span style={{ color: "var(--text-faint)" }}> · {c.city}</span>
                  ) : null}
                </td>
                <td>{c.industry || "—"}</td>
                <td>{c.country || "—"}</td>
                <td>{c.owner_name || c.owner_code || "—"}</td>
                <td>{c.deal_count}</td>
                <td>{c.contact_count}</td>
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

      {selected && (
        <CompanyDrawer
          company={selected}
          stages={stages}
          currentUser={currentUser}
          onClose={() => setSelected(null)}
          onChanged={(c) =>
            setRows((rs) => rs.map((r) => (r.id === c.id ? { ...r, ...c } : r)))
          }
          onDeleted={(id) => {
            setRows((rs) => rs.filter((r) => r.id !== id));
            setSelected(null);
          }}
        />
      )}
    </>
  );
}
