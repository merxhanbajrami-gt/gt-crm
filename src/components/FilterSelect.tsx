"use client";

import { ALL, NONE, type FilterOption } from "@/lib/dealFilters";

// One labelled field filter. A value from a shared link that no deal carries
// any more still shows as chosen (with 0), rather than the select silently
// falling back to "All" while the list stays filtered.
export default function FilterSelect({
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
