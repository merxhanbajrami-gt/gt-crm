"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ageClass, fmtAge, gbp, quietDays } from "@/lib/format";
import {
  ALL,
  NONE,
  NO_FILTERS,
  TOUCH_PRESETS,
  activeFilterCount,
  fieldOptions,
  matchesDeal,
  touchRange,
  writeFilters,
  type DealFilters,
  type FilterOption,
  type TouchPreset,
} from "@/lib/dealFilters";
import { BUSINESS_SEGMENTS, CLIENT_TYPES, LEAD_SOURCES } from "@/lib/sources";
import type { Deal, Stage } from "@/lib/types";
import DealDrawer, { type CurrentUser } from "./DealDrawer";
import AddDealForm from "./AddDealForm";

// label for "this field is blank" in each filter
const BLANK = {
  owner: "No owner",
  source: "No source",
  clientType: "Not set",
  segment: "Not set",
};

export default function PipelineBoard({
  stages,
  deals: initialDeals,
  owners,
  assignees,
  currentUser,
  dealsWithTask = [],
  initialDealId = null,
  initialFilters = NO_FILTERS,
}: {
  stages: Stage[];
  deals: Deal[];
  owners: [string, string][];
  assignees: [string, string][];
  currentUser: CurrentUser;
  dealsWithTask?: string[];
  initialDealId?: string | null;
  initialFilters?: DealFilters;
}) {
  const router = useRouter();
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const withTask = useMemo(() => new Set(dealsWithTask), [dealsWithTask]);
  const [filters, setFilters] = useState<DealFilters>(initialFilters);
  const [dragId, setDragId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialDealId);
  const [adding, setAdding] = useState(false);
  const selectedDeal = deals.find((d) => d.id === selectedId) ?? null;

  const setFilter = (patch: Partial<DealFilters>) =>
    setFilters((f) => ({ ...f, ...patch }));

  // keep the URL in step without a server round trip (Next.js syncs
  // history.replaceState with its router); other params such as ?deal= stay
  useEffect(() => {
    const qs = writeFilters(
      filters,
      new URLSearchParams(window.location.search),
    ).toString();
    window.history.replaceState(
      null,
      "",
      qs ? `?${qs}` : window.location.pathname,
    );
  }, [filters]);

  const filtered = useMemo(() => {
    const f = { ...filters, q: filters.q.trim() };
    const range = touchRange(f);
    return deals.filter((d) =>
      matchesDeal(d, f, d.stage !== "won" && !withTask.has(d.id), range),
    );
  }, [deals, filters, withTask]);
  const narrowed = activeFilterCount(filters) > 0 || !!filters.q.trim();

  // options list the values the board's deals carry, with counts. Owners
  // include people who have left — their deals are still on the board.
  const options = useMemo(() => {
    const names = new Map(owners);
    for (const d of deals)
      if (d.owner_code && !names.has(d.owner_code))
        names.set(d.owner_code, d.owner_name || d.owner_code);
    return {
      owner: fieldOptions(
        deals,
        (d) => d.owner_code,
        owners.map(([code]) => code),
        BLANK.owner,
        (code) => names.get(code) ?? code,
      ),
      source: fieldOptions(deals, (d) => d.source, LEAD_SOURCES, BLANK.source),
      clientType: fieldOptions(
        deals,
        (d) => d.client_type,
        CLIENT_TYPES,
        BLANK.clientType,
      ),
      segment: fieldOptions(
        deals,
        (d) => d.business_segment,
        BUSINESS_SEGMENTS,
        BLANK.segment,
      ),
    };
  }, [deals, owners]);

  async function restage(dealId: string, stage: string) {
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage === stage) return;
    // optimistic; the DB trigger stamps last_touched_at on the stage change
    const touched = new Date().toISOString();
    // winning flips New / Ex-Client → Existing Client (DB trigger, 0017)
    const clientType =
      stage === "won" &&
      (deal.client_type === "New Client" || deal.client_type === "Ex-Client")
        ? "Existing Client"
        : deal.client_type;
    setDeals((ds) =>
      ds.map((d) =>
        d.id === dealId
          ? {
              ...d,
              stage: stage as Deal["stage"],
              last_touched_at: touched,
              client_type: clientType,
            }
          : d,
      ),
    );
    const supabase = createClient();
    const { error } = await supabase
      .from("deals")
      .update({ stage })
      .eq("id", dealId);
    if (error) {
      // revert on failure
      setDeals((ds) =>
        ds.map((d) => (d.id === dealId ? { ...d, stage: deal.stage } : d)),
      );
      alert("Could not move deal: " + error.message);
    } else {
      // record the move in the deal's activity feed (same as the drawer path)
      const from = stages.find((s) => s.id === deal.stage)?.name ?? deal.stage;
      const to = stages.find((s) => s.id === stage)?.name ?? stage;
      await supabase.from("actions").insert({
        deal_id: dealId,
        owner_id: currentUser.id,
        owner_code: currentUser.repCode,
        kind: "stage",
        note: `Moved ${from} → ${to}`,
      });
      router.refresh();
    }
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <button className="addbtn" onClick={() => setAdding(true)}>
          + Add deal
        </button>
        <input
          className="search"
          type="text"
          value={filters.q}
          onChange={(e) => setFilter({ q: e.target.value })}
          placeholder="Search deals, companies, contacts, sources, owners"
          aria-label="Search the pipeline"
        />
      </div>

      <div className="pfilters" role="group" aria-label="Filter the pipeline">
        <FilterSelect
          label="Owner"
          all="All owners"
          value={filters.owner}
          options={options.owner}
          blank={BLANK.owner}
          onChange={(owner) => setFilter({ owner })}
        />
        <FilterSelect
          label="Lead source"
          all="All sources"
          value={filters.source}
          options={options.source}
          blank={BLANK.source}
          onChange={(source) => setFilter({ source })}
        />
        <label className="pf">
          <span className="pf-l">First touch</span>
          <select
            className={`ownerfilter${filters.touch !== "any" ? " set" : ""}`}
            value={filters.touch}
            onChange={(e) =>
              setFilter({ touch: e.target.value as TouchPreset })
            }
            aria-label="First touch"
          >
            {TOUCH_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {filters.touch === "custom" && (
          <span className="pf-range">
            <input
              className="dedit"
              type="date"
              aria-label="First touch from"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => setFilter({ from: e.target.value })}
            />
            <span>to</span>
            <input
              className="dedit"
              type="date"
              aria-label="First touch to"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => setFilter({ to: e.target.value })}
            />
          </span>
        )}
        <FilterSelect
          label="Client type"
          all="All client types"
          value={filters.clientType}
          options={options.clientType}
          blank={BLANK.clientType}
          onChange={(clientType) => setFilter({ clientType })}
        />
        <FilterSelect
          label="Segment"
          all="All segments"
          value={filters.segment}
          options={options.segment}
          blank={BLANK.segment}
          onChange={(segment) => setFilter({ segment })}
        />
        <button
          className={`filterbtn${filters.hot ? " on" : ""}`}
          aria-pressed={filters.hot}
          onClick={() => setFilter({ hot: !filters.hot })}
        >
          Hot
        </button>
        <button
          className={`filterbtn${filters.noTask ? " on" : ""}`}
          aria-pressed={filters.noTask}
          onClick={() => setFilter({ noTask: !filters.noTask })}
        >
          No task
        </button>
        {narrowed && (
          <span className="pf-summary">
            <span className="lf-note" style={{ margin: 0 }}>
              Showing {filtered.length} of {deals.length} deals
            </span>
            <button
              className="filterbtn"
              onClick={() => setFilters(NO_FILTERS)}
            >
              Clear all
            </button>
          </span>
        )}
      </div>

      <div className="kanban">
        {stages.map((s) => {
          const ds = filtered
            .filter((d) => d.stage === s.id)
            .sort((a, b) => b.value - a.value);
          const sum = ds.reduce((a, d) => a + d.value, 0);
          return (
            <div
              key={s.id}
              className="kcol"
              data-stage={s.id}
              style={{ ["--kc" as string]: s.color ?? "#7B7AE6" }}
              onDragOver={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).classList.add("dragover");
              }}
              onDragLeave={(e) =>
                (e.currentTarget as HTMLElement).classList.remove("dragover")
              }
              onDrop={(e) => {
                (e.currentTarget as HTMLElement).classList.remove("dragover");
                if (dragId) restage(dragId, s.id);
                setDragId(null);
              }}
            >
              <div className="kcol-banner">
                <div className="kverb">
                  <span>{s.verb}</span>
                  <span className="ksum">
                    {ds.length} · {gbp(sum)}
                  </span>
                </div>
                <div className="kname">{s.name}</div>
                <div className="kdesc">{s.descr}</div>
              </div>
              <div className="kcards">
                {ds.map((d) => {
                  const ac = ageClass(d);
                  const quiet = quietDays(d.last_touched_at);
                  const noTask = d.stage !== "won" && !withTask.has(d.id);
                  return (
                    <div
                      key={d.id}
                      className={`kcard${ac ? " age-" + ac : ""}${
                        noTask ? " no-task" : ""
                      }`}
                      draggable
                      onDragStart={() => setDragId(d.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => setSelectedId(d.id)}
                      style={{ cursor: "pointer" }}
                    >
                      {/* card title is the deal name (defaults to "Company –
                          Contact"); contact below beats client type for
                          telling deals apart at a glance (Oleksandr, Aug 2026) */}
                      <div className="kco" title={d.dealname ?? d.company ?? ""}>
                        {d.hot && (
                          <span
                            className="actiondot"
                            style={{ background: "var(--amber)" }}
                            title="Hot"
                          />
                        )}
                        {d.dealname || d.company}
                        {noTask && (
                          <span className="notask-chip" title="No active task">
                            no task
                          </span>
                        )}
                      </div>
                      <div className="kval">
                        {d.value > 0 ? gbp(d.value) + " · " : ""}
                        {d.contact_name || "No contact"}
                      </div>
                      <div className="kfoot">
                        <span className={`kage ${ac}`}>
                          {d.stage === "won"
                            ? "won"
                            : quiet >= 1
                              ? fmtAge(quiet) + " quiet"
                              : "active today"}
                        </span>
                        <span
                          className="owner-dot"
                          style={{
                            width: 22,
                            height: 22,
                            fontSize: "8.5px",
                          }}
                        >
                          {d.owner_code}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {adding && (
        <AddDealForm
          stages={stages}
          owners={owners}
          currentUser={currentUser}
          onClose={() => setAdding(false)}
          onCreated={(d) => {
            setDeals((ds) => [d, ...ds]);
            setAdding(false);
            setSelectedId(d.id);
          }}
        />
      )}

      {selectedDeal && (
        <DealDrawer
          key={selectedDeal.id}
          deal={selectedDeal}
          stages={stages}
          owners={owners}
          assignees={assignees}
          currentUser={currentUser}
          onClose={() => setSelectedId(null)}
          onChanged={(updated) =>
            setDeals((ds) =>
              ds.map((x) => (x.id === updated.id ? updated : x)),
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

// One labelled field filter. A value from a shared link that no deal carries
// any more still shows as chosen (with 0), rather than the select silently
// falling back to "All" while the board stays filtered.
function FilterSelect({
  label,
  all,
  blank,
  value,
  options,
  onChange,
}: {
  label: string;
  all: string;
  blank: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  const opts =
    value === ALL || options.some((o) => o.value === value)
      ? options
      : [
          ...options,
          { value, label: value === NONE ? blank : value, count: 0 },
        ];
  return (
    <label className="pf">
      <span className="pf-l">{label}</span>
      <select
        className={`ownerfilter${value !== ALL ? " set" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      >
        <option value={ALL}>{all}</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label} ({o.count})
          </option>
        ))}
      </select>
    </label>
  );
}
