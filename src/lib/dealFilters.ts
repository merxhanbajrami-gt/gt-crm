// Pipeline filters (Oleksandr, Oct 2026): narrow the board by lead source,
// first touch and the other fields a deal carries, to find leads and read the
// pipeline by criterion. The board already holds every live deal, so this is
// pure client-side matching; the choice lives in the URL so a filtered view
// survives a refresh and can be sent as a link.

import { presetRange, type RangePreset } from "@/lib/dateRange";
import type { Deal } from "@/lib/types";

export const ALL = "all";
// matches deals where the field is blank — most legacy deals have no source,
// and finding them is how they get filled in
export const NONE = "none";

export type TouchPreset = "any" | RangePreset;

export const TOUCH_PRESETS: { id: TouchPreset; label: string }[] = [
  { id: "any", label: "Any time" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "quarter", label: "This quarter" },
  { id: "year", label: "This year" },
  { id: "custom", label: "Custom range" },
];

export interface DealFilters {
  q: string;
  owner: string; // ALL | NONE | owner code
  source: string; // ALL | NONE | lead source
  clientType: string; // ALL | NONE | client type
  segment: string; // ALL | business segment
  touch: TouchPreset; // first touch date
  from: string; // custom range, YYYY-MM-DD or "" (open-ended)
  to: string;
  hot: boolean;
  noTask: boolean;
}

export const NO_FILTERS: DealFilters = {
  q: "",
  owner: ALL,
  source: ALL,
  clientType: ALL,
  segment: ALL,
  touch: "any",
  from: "",
  to: "",
  hot: false,
  noTask: false,
};

// filter → URL param. Short keys keep shared links readable.
const PARAMS = {
  q: "q",
  owner: "owner",
  source: "source",
  clientType: "type",
  segment: "segment",
  touch: "touch",
  from: "from",
  to: "to",
  hot: "hot",
  noTask: "notask",
} as const satisfies Record<keyof DealFilters, string>;

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

type Params = Record<string, string | string[] | undefined>;

export function parseFilters(params: Params): DealFilters {
  const get = (k: keyof DealFilters) => {
    const v = params[PARAMS[k]];
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  };
  const touch =
    TOUCH_PRESETS.find((p) => p.id === get("touch"))?.id ?? NO_FILTERS.touch;
  const from = get("from");
  const to = get("to");
  return {
    q: get("q"),
    owner: get("owner") || ALL,
    source: get("source") || ALL,
    clientType: get("clientType") || ALL,
    segment: get("segment") || ALL,
    touch,
    from: touch === "custom" && isDay(from) ? from : "",
    to: touch === "custom" && isDay(to) ? to : "",
    hot: get("hot") === "1",
    noTask: get("noTask") === "1",
  };
}

// Writes the filters into `base` (other params, e.g. ?deal=, are kept). Only
// non-default values are written, so an unfiltered board has a clean URL.
export function writeFilters(
  f: DealFilters,
  base: URLSearchParams,
): URLSearchParams {
  const out = new URLSearchParams(base);
  for (const k of Object.keys(PARAMS) as (keyof DealFilters)[]) {
    const v = f[k];
    const s = typeof v === "boolean" ? (v ? "1" : "") : v;
    if (s && s !== NO_FILTERS[k]) out.set(PARAMS[k], s);
    else out.delete(PARAMS[k]);
  }
  return out;
}

// First-touch window as inclusive YYYY-MM-DD bounds; "" = open on that side.
// null = no first-touch filter.
export function touchRange(
  f: DealFilters,
  now: Date = new Date(),
): { from: string; to: string } | null {
  if (f.touch === "any") return null;
  if (f.touch !== "custom") return presetRange(f.touch, now);
  if (!f.from && !f.to) return null;
  // a reversed custom range means the same window, not an empty one
  return f.from && f.to && f.from > f.to
    ? { from: f.to, to: f.from }
    : { from: f.from, to: f.to };
}

// How many filters narrow the board (search not counted — it has its own box).
export function activeFilterCount(f: DealFilters): number {
  return [
    f.owner !== ALL,
    f.source !== ALL,
    f.clientType !== ALL,
    f.segment !== ALL,
    touchRange(f) !== null,
    f.hot,
    f.noTask,
  ].filter(Boolean).length;
}

const fieldIs = (value: string | null, want: string) =>
  want === ALL || (want === NONE ? !value : value === want);

// `noTask`: the deal is open and has no active task — the board's "no task"
// chip, so the filter and the chip always agree.
export function matchesDeal(
  d: Deal,
  f: DealFilters,
  noTask: boolean,
  range: { from: string; to: string } | null = touchRange(f),
): boolean {
  if (!fieldIs(d.owner_code, f.owner)) return false;
  if (!fieldIs(d.source, f.source)) return false;
  if (!fieldIs(d.client_type, f.clientType)) return false;
  if (!fieldIs(d.business_segment, f.segment)) return false;
  if (range) {
    const day = d.first_touch_date?.slice(0, 10) ?? "";
    if (!day) return false;
    if (range.from && day < range.from) return false;
    if (range.to && day > range.to) return false;
  }
  if (f.hot && !d.hot) return false;
  if (f.noTask && !noTask) return false;
  const q = f.q.toLowerCase();
  if (!q) return true;
  return [
    d.company,
    d.dealname,
    d.contact_name,
    d.title,
    d.email,
    d.client_type,
    d.source,
    d.owner_code,
    d.owner_name,
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

// Options for one field: the values the board's deals actually carry, in the
// closed list's order (then any legacy values A–Z), each with its deal count,
// and a "blank" option when some deals have none. Values no deal uses are left
// out — a source list of 18 with 11 at zero is noise.
export function fieldOptions(
  deals: Deal[],
  pick: (d: Deal) => string | null,
  known: readonly string[],
  blankLabel: string,
  labelOf: (value: string) => string = (v) => v,
): FilterOption[] {
  const counts = new Map<string, number>();
  let blank = 0;
  for (const d of deals) {
    const v = pick(d);
    if (!v) blank++;
    else counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const extras = [...counts.keys()]
    .filter((v) => !known.includes(v))
    .sort((a, b) => labelOf(a).localeCompare(labelOf(b)));
  const opts = [...known.filter((v) => counts.has(v)), ...extras].map(
    (v) => ({ value: v, label: labelOf(v), count: counts.get(v)! }),
  );
  if (blank) opts.push({ value: NONE, label: blankLabel, count: blank });
  return opts;
}
