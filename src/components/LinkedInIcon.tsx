// Stored values can reach the DB without passing normalizeUrl (direct API
// writes), so never render a non-http(s) scheme as a clickable link.
function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

// Small LinkedIn mark that opens the profile in a new tab. Rendered next to a
// contact's name wherever one is shown (deal record, contacts table).
export default function LinkedInIcon({ url }: { url: string }) {
  const href = safeHref(url);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Open LinkedIn profile"
      onClick={(e) => e.stopPropagation()}
      style={{
        display: "inline-flex",
        verticalAlign: "-2px",
        marginLeft: 6,
        lineHeight: 0,
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="#0A66C2" aria-label="LinkedIn">
        <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.72C24 .77 23.2 0 22.22 0z" />
      </svg>
    </a>
  );
}

// "linkedin.com/in/jane" → "https://linkedin.com/in/jane"; empty stays empty.
// Anything that doesn't parse as an http(s) URL is dropped rather than stored.
export function normalizeUrl(v: string): string {
  const s = v.trim();
  if (!s) return "";
  const candidate = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  return safeHref(candidate) ?? "";
}
