"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Option {
  id: string;
  name: string;
  industry: string | null;
  business_segment: string | null;
}

// Searchable company picker backed by the companies table. Typing reports the
// raw text via onChange(text, null); picking a match reports (name, id). When
// onCreatePick is set, unmatched text gets a "+ Create" option (the parent
// does the insert) and closing the dropdown fires onDismiss so the parent can
// revert a half-typed value.
export default function CompanySelect({
  name,
  onChange,
  onCreatePick,
  onDismiss,
  placeholder = "Type a company…",
}: {
  name: string;
  onChange: (
    name: string,
    id: string | null,
    segment?: string | null,
  ) => void;
  onCreatePick?: (name: string) => void;
  onDismiss?: () => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Option[]>([]);
  const [searching, setSearching] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // close on outside click (listener only lives while the dropdown is open)
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        onDismiss?.();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onDismiss]);

  // debounced server-side search over the whole company book
  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(async () => {
      setSearching(true);
      const supabase = createClient();
      let query = supabase
        .from("companies")
        .select("id, name, industry, business_segment")
        .order("name")
        .limit(8);
      const term = name.trim().replace(/[,()]/g, " ").trim();
      if (term) query = query.ilike("name", `%${term}%`);
      const { data } = await query;
      setOptions((data ?? []) as Option[]);
      setSearching(false);
    }, 200);
    return () => clearTimeout(handle);
  }, [open, name]);

  const term = name.trim();
  const exactMatch = options.some(
    (o) => o.name.trim().toLowerCase() === term.toLowerCase(),
  );

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        className="dedit"
        value={name}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value, null);
          setOpen(true);
        }}
      />
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 2px)",
            left: 0,
            right: 0,
            zIndex: 30,
            background: "#fff",
            border: "1px solid var(--border)",
            borderRadius: 6,
            boxShadow: "0 8px 24px rgba(10,10,40,.12)",
            maxHeight: 240,
            overflowY: "auto",
          }}
        >
          {options.map((o) => (
            <button
              type="button"
              key={o.id}
              className="ps-opt"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(o.name, o.id, o.business_segment);
                setOpen(false);
              }}
            >
              {o.name}
              {o.industry && (
                <span style={{ color: "var(--text-faint)" }}> · {o.industry}</span>
              )}
            </button>
          ))}
          {options.length === 0 && !searching && (
            <div className="cm" style={{ padding: "8px 10px" }}>
              No matching companies.
            </div>
          )}
          {onCreatePick && term && !exactMatch && !searching && (
            <button
              type="button"
              className="ps-opt"
              style={{ fontWeight: 700 }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onCreatePick(term);
                setOpen(false);
              }}
            >
              + Create “{term}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
