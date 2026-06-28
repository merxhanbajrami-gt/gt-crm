"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SessionUser } from "@/lib/types";

const TABS = [
  { href: "/", label: "My Week" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/lost", label: "Lost" },
  { href: "/contacts", label: "Contacts" },
  { href: "/scorecard", label: "Scorecard" },
];

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  manager: "Manager · Founder view",
  rep: "Sales · Rep",
};

export default function TopBar({ user }: { user: SessionUser }) {
  const pathname = usePathname();

  return (
    <header className="topbar">
      <div className="wordmark">
        <span className="gt-logo" role="img" aria-label="GT" />
        <span className="os">/ OS · PIPELINE</span>
      </div>
      <nav className="tabs" role="tablist">
        {TABS.map((t) => {
          const active =
            t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`tab${active ? " active" : ""}`}
              role="tab"
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <div className="topbar-right">
        <div className="userchip">
          <div className="utext" style={{ textAlign: "right" }}>
            <div className="uname">{user.fullName}</div>
            <div className="urole">{ROLE_LABEL[user.role] ?? user.role}</div>
          </div>
          <div className="avatar">{user.initials}</div>
        </div>
        <form action="/auth/signout" method="post">
          <button className="signout" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
