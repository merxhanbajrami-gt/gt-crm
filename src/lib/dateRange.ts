// Date-range presets for the dated scorecard (Oleksandr, Sep 2026): This week /
// month / quarter / year / custom. Ranges are inclusive YYYY-MM-DD pairs and
// are computed in UTC, like the rest of the app's "today" logic.

export type RangePreset = "week" | "month" | "quarter" | "year" | "custom";

export const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "quarter", label: "This quarter" },
  { id: "year", label: "This year" },
  { id: "custom", label: "Custom" },
];

export interface DateRange {
  preset: RangePreset;
  from: string; // YYYY-MM-DD, inclusive
  to: string; // YYYY-MM-DD, inclusive
}

const DAY = 86400000;
const isoUTC = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function presetRange(
  preset: Exclude<RangePreset, "custom">,
  now: Date = new Date(),
): { from: string; to: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  switch (preset) {
    case "week": {
      const monday = Date.UTC(y, m, d - ((now.getUTCDay() + 6) % 7));
      return { from: isoUTC(monday), to: isoUTC(monday + 6 * DAY) };
    }
    case "month":
      return { from: isoUTC(Date.UTC(y, m, 1)), to: isoUTC(Date.UTC(y, m + 1, 0)) };
    case "quarter": {
      const q0 = Math.floor(m / 3) * 3;
      return { from: isoUTC(Date.UTC(y, q0, 1)), to: isoUTC(Date.UTC(y, q0 + 3, 0)) };
    }
    case "year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
}

const isDay = (s: string | undefined): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

// URL search params → a concrete range. Falls back to "this year" (the
// question the team asks most: "which clients did we win this year?").
export function resolveRange(params: {
  range?: string;
  from?: string;
  to?: string;
}): DateRange {
  if (params.range === "custom" && isDay(params.from) && isDay(params.to)) {
    const [from, to] =
      params.from <= params.to
        ? [params.from, params.to]
        : [params.to, params.from];
    return { preset: "custom", from, to };
  }
  const preset =
    (["week", "month", "quarter", "year"] as const).find(
      (p) => p === params.range,
    ) ?? "year";
  return { preset, ...presetRange(preset) };
}

const fmtDay = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

// "1 Jan – 31 Dec 2026"
export function fmtRange(r: { from: string; to: string }): string {
  return `${fmtDay(r.from)} – ${fmtDay(r.to)}`;
}
