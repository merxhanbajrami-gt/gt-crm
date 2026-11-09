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

// won or lost: the deal is over, so quiet time and "no task" don't apply
export function isClosed(stage: string): boolean {
  return stage === "won" || stage === "lost";
}

// quiet-time severity, mirrors the prototype: 90+ days = stuck, 30+ = warn
export function ageClass(d: Pick<Deal, "stage" | "last_touched_at">): string {
  if (isClosed(d.stage)) return "";
  const q = quietDays(d.last_touched_at);
  if (q >= 90) return "stuck";
  if (q >= 30) return "warn";
  return "";
}
