// Small coloured tag for a client status (New / Existing / Ex-Client), shared
// by the Companies list and the company record.
const COLORS: Record<string, string> = {
  "Existing Client": "var(--green)",
  "New Client": "var(--gt-blue)",
  "Ex-Client": "var(--text-faint)",
};

export default function ClientTag({ status }: { status: string | null }) {
  if (!status) return <span style={{ color: "var(--text-faint)" }}>—</span>;
  const color = COLORS[status] ?? "var(--text-sub)";
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9.5,
        letterSpacing: 1,
        textTransform: "uppercase",
        fontWeight: 600,
        color,
        border: `1px solid ${color}`,
        borderRadius: 4,
        padding: "3px 7px",
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}

export function fmtDay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
