// Fix the deal↔contact mapping the June import got wrong (feedback from
// Oleksandr, Aug 2026): deals' "contact" was parsed out of the HubSpot deal
// NAME ("Company | Contact | note"), not from the real contact associations,
// and contacts' LinkedIn URLs were never imported at all.
//
// Run: bun run scripts/fix-contacts-aug2026.mjs <deals-aug.csv> <contacts-june.csv>
//   deals-aug.csv    = hubspot-crm-exports-all-deals-2026-08-11.csv
//   contacts-june.csv= all-contacts.csv (from the 2026-06-08 export zip)
//   out: supabase/seed/hubspot-contact-fix-aug2026.sql   (apply with psql -f)
//        supabase/seed/hubspot-contact-fix-aug2026-report.md
//
// Everything is keyed on legacy_id (HubSpot Record ID) and fill-only where a
// user could have entered data since, so the file is safe to re-apply.
//
// What the generated SQL does, in order:
//   A) insert contacts referenced by deals but absent from the June export
//      (created in HubSpot after June 8) — name/email parsed from the deals
//      export's "Associated Contact" column
//   B) backfill contacts.linkedin_url from the June export (fill-only)
//   C) link contacts to their deals via "Associated Contact IDs" (fill-only;
//      a contact on several deals keeps the first deal, primary-position first)
//   D) set each deal's primary-contact fields (name/title/email/linkedin) from
//      its first associated contact — this replaces the deal-name fragments
//   E) rename deals whose dealname is just the company to "Company – Contact"
//   F) refresh deals.n_contacts and fill contacts.company_id from their deal
import { readFileSync, writeFileSync } from "node:fs";

const [dealsPath, contactsPath] = process.argv.slice(2);
if (!contactsPath) {
  console.error("usage: bun run scripts/fix-contacts-aug2026.mjs <deals-aug.csv> <contacts-june.csv>");
  process.exit(1);
}

// --- RFC4180-ish CSV parser (same as scripts/import-hubspot-aug2026.mjs) ---
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ",") { row.push(field); field = ""; i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += ch; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows
    .filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""))
    .map((r) => Object.fromEntries(header.map((h, j) => [h.trim(), (r[j] ?? "").trim()])));
}

const sq = (v) =>
  v === null || v === undefined || v === ""
    ? "null"
    : `'${String(v).replace(/'/g, "''")}'`;

const OWNER_CODE = {
  "Andy Baynes": "AB",
  "Anastasiia Romasiuk": "AR",
  "Daria Konoval": "DK",
  "Ilya Ponomarenko": "IP",
  "John Harris": "JH",
  "Jordan Orloff": "JO",
  "Mariana Kurylo": "MK",
  "Mariia Atrasevych": "MA",
  "Michael Bayler": "MB",
  "Nataliia Eksarova": "NE",
  "Nikita Gorskykh": "NG",
  "Oleksandr Kicha": "OK",
  "Victoria Shvets": "VS",
  "Vlad Solovei": "VO",
};
function ownerCode(raw) {
  const name = (raw ?? "").replace(/\s*\(Deactivated User\)\s*/i, "").trim();
  if (!name) return null;
  return (
    OWNER_CODE[name] ??
    name.split(/\s+/).map((p) => p[0]?.toUpperCase()).slice(0, 2).join("")
  );
}

const STAGE_MAP = {
  "Closed Lost ❌": "lost",
  "Closed Won 🏆": "won",
  "Opportunity 💡": "attack",
  "MSA/SS ✍️": "close",
  "Proposal Sent 💰": "close",
  "Engagement (RFI/RFP) 💼": "pursue",
};
const mapStage = (s) => STAGE_MAP[s?.trim()] ?? "connection";

const semiList = (v) => (v ?? "").split(";").map((x) => x.trim()).filter(Boolean);

// "Jane Doe (jane@acme.com)" | "jane@acme.com" | "Jane Doe" -> { name, email }
function parseAssoc(entry) {
  const m = entry.match(/^(.*?)\s*\(([^()]+)\)$/);
  if (m) {
    const name = m[1].trim() || null;
    const inner = m[2].trim();
    return inner.includes("@")
      ? { name, email: inner }
      : { name: entry.trim(), email: null }; // "(...)" was part of the name
  }
  if (entry.includes("@") && !entry.includes(" ")) return { name: null, email: entry.trim() };
  return { name: entry.trim() || null, email: null };
}

// HubSpot carries LinkedIn in several fields depending on which tool wrote it;
// native field first, then the enrichment tools
const LINKEDIN_COLS = ["LinkedIn profile URL", "LinkedIn URL", "LinkedIn Page", "LinkedIn (LinkedHub)"];
function linkedinOf(row) {
  for (const col of LINKEDIN_COLS) {
    let v = (row[col] ?? "").trim();
    if (!v) continue;
    if (!/^https?:\/\//i.test(v)) v = "https://" + v.replace(/^\/+/, "");
    if (!/linkedin\./i.test(v)) continue; // junk in the column, skip
    return v;
  }
  return null;
}

// ---------- load ----------
const deals = parseCsv(readFileSync(dealsPath, "utf8"));
const contacts = parseCsv(readFileSync(contactsPath, "utf8"));
const knownContact = new Map(contacts.map((c) => [c["Record ID"], c]));

// ---------- derive the work lists ----------
// contact -> deal (fill-only later; first deal wins, primary position first)
const contactToDeal = new Map(); // contactLid -> dealLid
const dealCountOf = new Map(); // contactLid -> how many deals reference it
// deal -> primary contact + parsed name/email per associated contact
const primaryOf = []; // { dealLid, contactLid }
const missingContacts = new Map(); // contactLid -> { name, email, ownerCode, stage }
let dealsWithoutContacts = 0;

for (const d of deals) {
  const dealLid = d["Record ID"];
  const ids = semiList(d["Associated Contact IDs"]);
  const names = semiList(d["Associated Contact"]);
  if (ids.length === 0) { dealsWithoutContacts++; continue; }
  primaryOf.push({ dealLid, contactLid: ids[0] });
  ids.forEach((cid, i) => {
    dealCountOf.set(cid, (dealCountOf.get(cid) ?? 0) + 1);
    if (!contactToDeal.has(cid)) contactToDeal.set(cid, dealLid);
    if (!knownContact.has(cid) && !missingContacts.has(cid)) {
      const { name, email } = names[i] ? parseAssoc(names[i]) : { name: null, email: null };
      missingContacts.set(cid, {
        name,
        email,
        ownerCode: ownerCode(d["Deal owner"]),
        stage: mapStage(d["Deal Stage"]),
      });
    }
  });
}

// LinkedIn backfill list from the June export
const linkedinRows = [];
for (const c of contacts) {
  const url = linkedinOf(c);
  if (url) linkedinRows.push({ lid: c["Record ID"], url });
}
// missing contacts aren't in the June export, so no LinkedIn for them

const multiDeal = [...dealCountOf.values()].filter((n) => n > 1).length;

// ---------- build SQL ----------
let out = `-- AUTO-GENERATED by scripts/fix-contacts-aug2026.mjs — see that file for
-- the mapping decisions. Keyed on legacy_id and fill-only where users could
-- have edited since, so safe to re-apply.
begin;

`;

// A) contacts created in HubSpot after the June export
if (missingContacts.size) {
  out += `-- A) contacts referenced by deals but absent from the June export\n`;
  out += `insert into public.contacts (legacy_id, name, email, stage, owner_code)\nvalues\n`;
  out += [...missingContacts.entries()]
    .map(([lid, c]) => `  (${lid}, ${sq(c.name)}, ${sq(c.email)}, ${sq(c.stage)}, ${sq(c.ownerCode)})`)
    .join(",\n");
  out += `\non conflict (legacy_id) do nothing;\n\n`;
}

// B) LinkedIn backfill (fill-only: manual edits in the app win)
out += `-- B) LinkedIn URLs from the June export\nupdate public.contacts c\nset linkedin_url = v.url\nfrom (values\n`;
out += linkedinRows
  .map((r, i) => `  (${r.lid}${i === 0 ? "::bigint" : ""}, ${sq(r.url)})`)
  .join(",\n");
out += `\n) as v(legacy_id, url)\nwhere c.legacy_id = v.legacy_id\n  and (c.linkedin_url is null or c.linkedin_url = '');\n\n`;

// C) contact -> deal links (fill-only; app-made links and later edits win)
out += `-- C) attach contacts to their HubSpot-associated deal\nupdate public.contacts c\nset deal_id = d.id,\n    stage = d.stage\nfrom (values\n`;
out += [...contactToDeal.entries()]
  .map(([cid, did], i) => `  (${cid}${i === 0 ? "::bigint" : ""}, ${did}${i === 0 ? "::bigint" : ""})`)
  .join(",\n");
out += `\n) as v(contact_lid, deal_lid), public.deals d\nwhere d.legacy_id = v.deal_lid\n  and c.legacy_id = v.contact_lid\n  and c.deal_id is null;\n\n`;

// D) the deal's primary-contact fields come from its first associated contact.
// contact_name is overwritten on purpose — the old value was a deal-name
// fragment; title/email/linkedin only fill where HubSpot has a value.
out += `-- D) primary contact onto the deal record\nupdate public.deals d\nset contact_name = coalesce(nullif(c.name, ''), d.contact_name),\n    title        = coalesce(nullif(c.title, ''), d.title),\n    email        = coalesce(nullif(c.email, ''), d.email),\n    linkedin_url = coalesce(nullif(d.linkedin_url, ''), c.linkedin_url)\nfrom (values\n`;
out += primaryOf
  .map((r, i) => `  (${r.dealLid}${i === 0 ? "::bigint" : ""}, ${r.contactLid}${i === 0 ? "::bigint" : ""})`)
  .join(",\n");
out += `\n) as v(deal_lid, contact_lid), public.contacts c\nwhere d.legacy_id = v.deal_lid\n  and c.legacy_id = v.contact_lid;\n\n`;

// E + F are pure prod-side statements
out += `-- E) "Boots" -> "Boots – John Smith" where the dealname was just the company
update public.deals
set dealname = company || ' – ' || contact_name
where legacy_id is not null
  and company is not null
  and contact_name is not null
  and lower(btrim(dealname)) = lower(btrim(company));

-- F) counts + company links follow from the new deal links
update public.deals d
set n_contacts = sub.cnt
from (
  select deal_id, count(*) as cnt
  from public.contacts
  where deal_id is not null
  group by deal_id
) sub
where sub.deal_id = d.id
  and d.n_contacts is distinct from sub.cnt;

update public.contacts c
set company_id = d.company_id
from public.deals d
where c.deal_id = d.id
  and c.company_id is null
  and d.company_id is not null;

commit;
`;

writeFileSync(new URL("../supabase/seed/hubspot-contact-fix-aug2026.sql", import.meta.url), out);

// ---------- report ----------
const report = `# HubSpot contact-mapping fix — Aug 2026

Generated by \`scripts/fix-contacts-aug2026.mjs\` from the 2026-08-11 deals
export and the 2026-06-08 contacts export.

## What was wrong

- Deals' "contact" was parsed from the HubSpot deal *name* ("Company | Contact
  | note"), so many deals showed a deal-name fragment — or nothing — instead of
  the real contact.
- Contacts' LinkedIn URLs were never imported.
- Only a handful of contacts were linked to their deals.

## What this applies

- **${missingContacts.size} contacts inserted** that were created in HubSpot after the
  June contacts export (name/email recovered from the deals export).
- **${linkedinRows.length} contacts** get their LinkedIn URL from the June export
  (fill-only — URLs entered in the app are kept).
- **${contactToDeal.size} contact→deal links** from HubSpot's real associations
  (fill-only). ${multiDeal} contacts are associated with more than one deal in
  HubSpot; the CRM links each to one deal (their primary association).
- **${primaryOf.length} deals** get their primary contact (name, title, email,
  LinkedIn) set from the first associated contact.
- Deals named just after the company are renamed to "Company – Contact".
- \`n_contacts\` refreshed; linked contacts inherit the deal's company.

## Not covered

- **${dealsWithoutContacts} deals have no associated contact in HubSpot** — their
  contact field stays as-is (usually empty or the old name fragment).
- Contacts created in HubSpot after 2026-06-08 that are attached to a deal get
  name/email only (no title/LinkedIn — they're not in the June contacts export).
`;
writeFileSync(new URL("../supabase/seed/hubspot-contact-fix-aug2026-report.md", import.meta.url), report);

console.log("Wrote supabase/seed/hubspot-contact-fix-aug2026.sql");
console.log(`  missing contacts inserted: ${missingContacts.size}`);
console.log(`  linkedin backfill rows:    ${linkedinRows.length}`);
console.log(`  contact→deal links:        ${contactToDeal.size} (${multiDeal} multi-deal contacts)`);
console.log(`  deals w/ primary contact:  ${primaryOf.length}`);
console.log(`  deals w/o any contact:     ${dealsWithoutContacts}`);
