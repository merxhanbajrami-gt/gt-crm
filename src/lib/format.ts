import type { Deal } from "@/lib/types";

export const gbp = (v: number) => "£" + v + "k";

export function fmtAge(days: number): string {
  if (days >= 365) return Math.floor(days / 365) + "y";
  if (days >= 30) return Math.floor(days / 30) + "mo";
  if (days >= 7) return Math.floor(days / 7) + "w";
  return days + "d";
}

// whole days since the deal was last touched (stage move or logged activity —
// DB triggers keep deals.last_touched_at fresh, see migration 0014)
export function quietDays(lastTouchedAt: string | null): number {
  if (!lastTouchedAt) return 0;
  const ms = Date.now() - new Date(lastTouchedAt).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

// quiet-time severity, mirrors the prototype: 90+ days = stuck, 30+ = warn
export function ageClass(d: Pick<Deal, "stage" | "last_touched_at">): string {
  if (d.stage === "won") return "";
  const q = quietDays(d.last_touched_at);
  if (q >= 90) return "stuck";
  if (q >= 30) return "warn";
  return "";
}
