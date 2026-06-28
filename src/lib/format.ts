import type { Deal } from "@/lib/types";

export const gbp = (v: number) => "£" + v + "k";

export function fmtAge(days: number): string {
  if (days >= 365) return Math.floor(days / 365) + "y";
  if (days >= 30) return Math.floor(days / 30) + "mo";
  if (days >= 7) return Math.floor(days / 7) + "w";
  return days + "d";
}

// quiet-time severity, mirrors the prototype: 90+ days = stuck, 30+ = warn
export function ageClass(d: Pick<Deal, "stage" | "days_in_stage">): string {
  if (d.stage === "won") return "";
  if (d.days_in_stage >= 90) return "stuck";
  if (d.days_in_stage >= 30) return "warn";
  return "";
}
