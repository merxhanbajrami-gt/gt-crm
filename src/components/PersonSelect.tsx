"use client";

import { useEffect, useRef, useState } from "react";

// A small searchable picker: type a name to filter, click to pick. Used where a
// plain <select> is awkward — e.g. assigning a task to a teammate.
export default function PersonSelect({
  owners,
  value,
  onChange,
  placeholder = "Type a name…",
  allowUnassigned = true,
}: {
  owners: [string, string][]; // [code, name]
  value: string; // selected code ("" = unassigned)
  onChange: (code: string) => void;
  placeholder?: string;
  allowUnassigned?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  const selectedName = owners.find(([c]) => c === value)?.[1] ?? "";

  // close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const term = query.trim().toLowerCase();
  const matches = owners.filter(
    ([c, n]) =>
      !term ||
      n.toLowerCase().includes(term) ||
      c.toLowerCase().includes(term),
  );

  function pick(code: string) {
    onChange(code);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        className="dedit"
        value={open ? query : selectedName}
        placeholder={selectedName ? selectedName : placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
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
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          {allowUnassigned && (
            <button type="button" className="ps-opt" onClick={() => pick("")}>
              Unassigned
            </button>
          )}
          {matches.length === 0 && (
            <div className="cm" style={{ padding: "8px 10px" }}>
              No matches.
            </div>
          )}
          {matches.map(([c, n]) => (
            <button
              type="button"
              key={c}
              className={`ps-opt${c === value ? " on" : ""}`}
              onClick={() => pick(c)}
            >
              {n} <span style={{ color: "var(--text-faint)" }}>({c})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
