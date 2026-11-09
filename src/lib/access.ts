import type { AppRole } from "@/lib/types";

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  manager: "Manager · Founder view",
  rep: "Sales · Rep",
  guest: "Guest · Shared deals",
};

// A guest (0020) sees only the deals an admin or manager shared with it, plus
// those deals' linked contacts and companies. RLS enforces this; the UI only
// hides what a guest can't use.
export function isGuest(role: AppRole): boolean {
  return role === "guest";
}

// admins and managers see every deal, and decide what each guest sees
export function canShareDeals(role: AppRole): boolean {
  return role === "admin" || role === "manager";
}

// Scorecard and Ideas are team views; a guest keeps the views that list its
// shared records. My Week shows a guest the tasks on its shared deals
// (Oleksandr, Nov 2026).
const GUEST_TABS = new Set(["/", "/pipeline", "/lost", "/contacts", "/companies"]);

export function tabAllowed(role: AppRole, href: string): boolean {
  return !isGuest(role) || GUEST_TABS.has(href);
}

// where a guest lands when it opens a team view
export const GUEST_HOME = "/pipeline";
