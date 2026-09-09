"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  RANGE_PRESETS,
  fmtRange,
  type DateRange,
  type RangePreset,
} from "@/lib/dateRange";

// This week / month / quarter / year / custom. The choice lives in the URL
// (?range=…&from=…&to=…) so the server page re-aggregates and the view is
// shareable — "look at Q3" is a link.
export default function RangePicker({ range }: { range: DateRange }) {
  const router = useRouter();
  const pathname = usePathname();
  const [custom, setCustom] = useState(range.preset === "custom");
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);

  function pick(p: RangePreset) {
    if (p === "custom") {
      setCustom(true);
      return;
    }
    setCustom(false);
    router.push(`${pathname}?range=${p}`);
  }

  function apply() {
    if (!from || !to) return;
    router.push(`${pathname}?range=custom&from=${from}&to=${to}`);
  }

  return (
    <div className="toolbar" style={{ alignItems: "center" }} aria-label="Date range">
      {RANGE_PRESETS.map((p) => (
        <button
          key={p.id}
          className={`filterbtn${
            (p.id === "custom" ? custom : !custom && range.preset === p.id)
              ? " on"
              : ""
          }`}
          onClick={() => pick(p.id)}
        >
          {p.label}
        </button>
      ))}
      {custom && (
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            className="dedit"
            type="date"
            aria-label="From"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            style={{ width: 150 }}
          />
          <span style={{ color: "var(--text-faint)", fontSize: 12 }}>to</span>
          <input
            className="dedit"
            type="date"
            aria-label="To"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            style={{ width: 150 }}
          />
          <button className="addbtn" onClick={apply} disabled={!from || !to}>
            Apply
          </button>
        </span>
      )}
      <span
        className="lf-note"
        style={{ margin: 0, marginLeft: "auto", textAlign: "right" }}
      >
        {fmtRange(range)}
      </span>
    </div>
  );
}
