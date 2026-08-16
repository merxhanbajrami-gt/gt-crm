// Aug 2026 HubSpot re-export → idempotent SQL for the live CRM.
// Run: bun run scripts/import-hubspot-aug2026.mjs \
//        <deals.csv> <notes.csv> <companies.csv> <prod-deal-stages.csv>
//   prod-deal-stages.csv = `legacy_id,stage` dump of the live deals table,
//   used to detect stage drift (deals moved in HubSpot since the June import).
//   out: supabase/seed/hubspot-import-aug2026.sql   (apply with psql -f)
//        supabase/seed/hubspot-import-aug2026-report.md
//
// Everything is keyed on legacy_id (the HubSpot Record ID) so the whole file
// can be re-applied safely — including after Oleksandr & Nikita's data-cleanup
// round produces corrected exports.
//
// Mapping decisions:
//   - companies: upsert (the export is authoritative for company fields)
//   - deals: insert-only (the CRM is live; existing rows keep their edits),
//     EXCEPT stage sync for deals that visibly moved in HubSpot since June —
//     guarded on the prod stage at generation time so re-runs never clobber
//     later in-app moves
//   - notes -> actions kind='note', attached to deal AND contact AND company
//     where HubSpot had the association; original author + timestamp kept
//   - deal descriptions -> one synthetic note per deal (legacy_id = -deal id,
//     so re-runs skip them too)
import { readFileSync, writeFileSync } from "node:fs";

const [dealsPath, notesPath, companiesPath, prodStagesPath] = process.argv.slice(2);
if (!prodStagesPath) {
  console.error(
    "usage: bun run scripts/import-hubspot-aug2026.mjs <deals.csv> <notes.csv> <companies.csv> <prod-deal-stages.csv>",
  );
  process.exit(1);
}

// --- RFC4180-ish CSV parser (same as scripts/import-hubspot.mjs) ---
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

const STAGE_MAP = {
  "Closed Lost ❌": "lost",
  "Closed Won 🏆": "won",
  "Opportunity 💡": "attack",
  "MSA/SS ✍️": "close",
  "Proposal Sent 💰": "close",
  "Engagement (RFI/RFP) 💼": "pursue",
};
const mapStage = (s) => STAGE_MAP[s?.trim()] ?? "connection";

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
function cleanOwner(raw) {
  const name = (raw ?? "").replace(/\s*\(Deactivated User\)\s*/i, "").trim();
  if (!name) return { code: null, name: null };
  const code =
    OWNER_CODE[name] ??
    name.split(/\s+/).map((p) => p[0]?.toUpperCase()).slice(0, 2).join("") ??
    null;
  return { code, name };
}

function splitDealName(dealName) {
  const [company, ...rest] = (dealName ?? "").split("|");
  const contact = rest.join("|").replace(/\(.*?\)/g, "").trim();
  return { company: company.trim() || null, contact: contact || null };
}

const num = (v) => {
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
// £ -> £k, ignoring the 1.0 placeholders (see scripts/import-hubspot.mjs)
const dealValue = (amount) => (num(amount) > 1 ? Math.round(num(amount) / 1000) : 0);

const idList = (v) => (v ?? "").split(";").map((x) => x.trim()).filter(Boolean).map(Number);
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

// ---------- load inputs ----------
const deals = parseCsv(readFileSync(dealsPath, "utf8"));
const notes = parseCsv(readFileSync(notesPath, "utf8"));
const companiesRaw = parseCsv(readFileSync(companiesPath, "utf8"));

// prod dump: `legacy_id,stage` per line (psql -t -A -F',')
const prodStage = new Map(
  readFileSync(prodStagesPath, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [id, stage] = l.split(",");
      return [Number(id), stage];
    }),
);

const report = { skipped: {}, lists: {} };

// ---------- companies ----------
const seenCompany = new Set();
const companies = [];
let namelessCompanies = 0;
for (const c of companiesRaw) {
  const lid = num(c["Record ID"]);
  if (!c["Company name"]) { namelessCompanies++; continue; }
  if (seenCompany.has(lid)) continue;
  seenCompany.add(lid);
  companies.push(c);
}
report.skipped["companies without a name"] = namelessCompanies;

let out = `-- AUTO-GENERATED by scripts/import-hubspot-aug2026.mjs from the
-- 2026-08-11/12 HubSpot exports. Idempotent: keyed on legacy_id throughout.
-- Apply AFTER migration 0013 (companies + actions links).
begin;

-- ---------- companies (upsert: export is authoritative) ----------
`;
for (const batch of chunk(companies, 500)) {
  out += `insert into public.companies
  (legacy_id, name, owner_code, owner_name, phone, city, country, industry, last_activity, created_at)
values\n`;
  out += batch
    .map((c) => {
      const { code, name } = cleanOwner(c["Company owner"]);
      const created = c["Create Date"] ? sq(c["Create Date"]) : "now()";
      return `  (${num(c["Record ID"])}, ${sq(c["Company name"])}, ${sq(code)}, ${sq(name)}, ${sq(
        c["Phone Number"] || null,
      )}, ${sq(c["City"] || null)}, ${sq(c["Country/Region"] || null)}, ${sq(
        c["Industry"] || null,
      )}, ${sq(c["Last Activity Date"] || null)}, ${created})`;
    })
    .join(",\n");
  out += `\non conflict (legacy_id) do update set
  name = excluded.name,
  owner_code = excluded.owner_code,
  owner_name = excluded.owner_name,
  phone = excluded.phone,
  city = excluded.city,
  country = excluded.country,
  industry = excluded.industry,
  last_activity = excluded.last_activity;\n\n`;
}

// ---------- deals (insert-only; existing rows keep their in-app edits) ----------
const newDeals = deals.filter((d) => !prodStage.has(num(d["Record ID"])));
report.lists["new deals"] = newDeals.map(
  (d) => `${d["Record ID"]} — ${d["Deal Name"]} (${mapStage(d["Deal Stage"])}, ${cleanOwner(d["Deal owner"]).name ?? "unowned"})`,
);
out += `-- ---------- deals: insert (${newDeals.length} new at generation time) ----------\n`;
for (const batch of chunk(deals, 250)) {
  out += `insert into public.deals
  (legacy_id, company, dealname, contact_name, stage, value, owner_code, owner_name, client_type, source, hot, last_activity, close_date, created_at)
values\n`;
  out += batch
    .map((d) => {
      const { company, contact } = splitDealName(d["Deal Name"]);
      const { code, name } = cleanOwner(d["Deal owner"]);
      const stage = mapStage(d["Deal Stage"]);
      const closed = stage === "won" || stage === "lost";
      const closeDate = closed && d["Close Date"] ? sq(d["Close Date"].slice(0, 10)) : "null";
      const created = d["Create Date"] ? sq(d["Create Date"]) : "now()";
      // HubSpot "Deal Type" -> client_type (renamed from vertical in 0014)
      const clientType =
        { "New Business": "New Client", "Existing Business": "Existing Client" }[
          d["Deal Type"]
        ] ?? (d["Deal Type"] || null);
      return `  (${num(d["Record ID"])}, ${sq(company)}, ${sq(d["Deal Name"])}, ${sq(contact)}, ${sq(
        stage,
      )}, ${dealValue(d["Amount"])}, ${sq(code)}, ${sq(name)}, ${sq(
        clientType,
      )}, null, false, ${sq(d["Last Activity Date"] || null)}, ${closeDate}, ${created})`;
    })
    .join(",\n");
  out += `\non conflict (legacy_id) do nothing;\n\n`;
}

// ---------- deal -> primary company links ----------
const dealCompany = deals
  .map((d) => [num(d["Record ID"]), num(d["Associated Company IDs (Primary)"])])
  .filter(([, co]) => co > 0);
out += `-- ---------- deal -> primary company (${dealCompany.length} links; keeps manual relinks) ----------\n`;
for (const batch of chunk(dealCompany, 500)) {
  out += `update public.deals d
set company_id = c.id
from (values\n`;
  out += batch.map(([dl, cl]) => `  (${dl}::bigint, ${cl}::bigint)`).join(",\n");
  out += `\n) as m(deal_legacy, company_legacy)
join public.companies c on c.legacy_id = m.company_legacy
where d.legacy_id = m.deal_legacy
  and d.company_id is null;\n\n`;
}

// ---------- contacts -> company by unambiguous name match ----------
// contacts.dealname holds the HubSpot "Company Name" from the June import.
out += `-- ---------- contacts -> company (unambiguous name match only) ----------
update public.contacts t
set company_id = co.id
from public.companies co
where t.company_id is null
  and t.dealname is not null
  and lower(btrim(t.dealname)) = lower(btrim(co.name))
  and not exists (
    select 1 from public.companies co2
    where lower(btrim(co2.name)) = lower(btrim(co.name)) and co2.id <> co.id
  );

`;

// ---------- notes -> actions ----------
const noteRows = [];
let noAssoc = 0, emptyBody = 0, multiDeal = 0;
for (const n of notes) {
  const lid = num(n["Record ID"]);
  const dealIds = idList(n["Associated Deal IDs"]);
  const contactIds = idList(n["Associated Contact IDs"]);
  const companyIds = idList(n["Associated Company IDs"]);
  if (!dealIds.length && !contactIds.length && !companyIds.length) { noAssoc++; continue; }
  const body = (n["Note body"] || n["Body preview"] || "").trim();
  if (!body) { emptyBody++; continue; }
  if (dealIds.length > 1) multiDeal++;
  const { code } = cleanOwner(n["Activity assigned to"]);
  noteRows.push({
    lid,
    deal: dealIds[0] ?? null,
    contact: contactIds[0] ?? null,
    company: companyIds[0] ?? null,
    body,
    code,
    at: n["Activity date"] || n["Create date"] || null,
  });
}
report.skipped["notes with no deal/contact/company association"] = noAssoc;
report.skipped["notes with an empty body"] = emptyBody;
report.lists["notes attached to >1 deal (first kept)"] = [`${multiDeal} note(s)`];

out += `-- ---------- notes -> actions (${noteRows.length} notes) ----------\n`;
for (const batch of chunk(noteRows, 200)) {
  out += `insert into public.actions
  (legacy_id, deal_id, contact_id, company_id, kind, note, owner_code, created_at, done)
select v.lid, d.id, c.id, co.id, 'note', v.body, v.ocode, v.at::timestamptz, false
from (values\n`;
  out += batch
    .map(
      (r) =>
        `  (${r.lid}::bigint, ${r.deal ?? "null"}::bigint, ${r.contact ?? "null"}::bigint, ${
          r.company ?? "null"
        }::bigint, ${sq(r.body)}, ${sq(r.code)}, ${sq(r.at)})`,
    )
    .join(",\n");
  out += `\n) as v(lid, dlid, clid, colid, body, ocode, at)
left join public.deals d on d.legacy_id = v.dlid
left join public.contacts c on c.legacy_id = v.clid
left join public.companies co on co.legacy_id = v.colid
where (d.id is not null or c.id is not null or co.id is not null)
on conflict (legacy_id) do nothing;\n\n`;
}

// ---------- deal descriptions -> one synthetic note each ----------
// legacy_id = -deal legacy id keeps these idempotent without colliding with
// real HubSpot note ids (always positive).
const descRows = deals
  .filter((d) => (d["Deal Description"] || "").trim())
  .map((d) => ({
    lid: -num(d["Record ID"]),
    deal: num(d["Record ID"]),
    body: d["Deal Description"].trim(),
    code: cleanOwner(d["Deal owner"]).code,
    at: d["Create Date"] || null,
  }));
out += `-- ---------- deal descriptions (${descRows.length}) ----------\n`;
for (const batch of chunk(descRows, 200)) {
  out += `insert into public.actions
  (legacy_id, deal_id, kind, note, owner_code, created_at, done)
select v.lid, d.id, 'note', v.body, v.ocode, v.at::timestamptz, false
from (values\n`;
  out += batch
    .map((r) => `  (${r.lid}::bigint, ${r.deal}::bigint, ${sq(r.body)}, ${sq(r.code)}, ${sq(r.at)})`)
    .join(",\n");
  out += `\n) as v(lid, dlid, body, ocode, at)
join public.deals d on d.legacy_id = v.dlid
on conflict (legacy_id) do nothing;\n\n`;
}

// ---------- stage sync: deals that moved in HubSpot since the June import ----------
const drift = [];
for (const d of deals) {
  const lid = num(d["Record ID"]);
  const prev = prodStage.get(lid);
  const next = mapStage(d["Deal Stage"]);
  if (prev && prev !== next) drift.push({ lid, name: d["Deal Name"], prev, next, close: d["Close Date"] });
}
report.lists["stage drift (HubSpot wins, guarded on the prod stage)"] = drift.map(
  (x) => `${x.lid} — ${x.name}: ${x.prev} → ${x.next}`,
);
out += `-- ---------- stage sync (${drift.length} drifted; no-ops if the app moved them since) ----------\n`;
for (const x of drift) {
  const closed = x.next === "won" || x.next === "lost";
  const closeSet =
    closed && x.close ? `, close_date = coalesce(close_date, ${sq(x.close.slice(0, 10))})` : "";
  out += `update public.deals set stage = ${sq(x.next)}${closeSet}
  where legacy_id = ${x.lid} and stage = ${sq(x.prev)};\n`;
}

// ---------- close-date backfill for already-closed deals ----------
const closeBackfill = deals
  .map((d) => ({ lid: num(d["Record ID"]), stage: mapStage(d["Deal Stage"]), cd: d["Close Date"] }))
  .filter((x) => (x.stage === "won" || x.stage === "lost") && x.cd);
out += `\n-- ---------- close_date backfill (${closeBackfill.length} closed deals; only fills blanks) ----------\n`;
for (const batch of chunk(closeBackfill, 500)) {
  out += `update public.deals d
set close_date = v.cd::date
from (values\n`;
  out += batch.map((x) => `  (${x.lid}::bigint, ${sq(x.cd.slice(0, 10))})`).join(",\n");
  out += `\n) as v(lid, cd)
where d.legacy_id = v.lid and d.close_date is null;\n\n`;
}

// ---------- last_activity refresh (shown on the Lost tab; HubSpot is fresher) ----------
const lastAct = deals
  .map((d) => ({ lid: num(d["Record ID"]), la: d["Last Activity Date"] }))
  .filter((x) => x.la);
out += `-- ---------- last_activity refresh (${lastAct.length} deals) ----------\n`;
for (const batch of chunk(lastAct, 500)) {
  out += `update public.deals d
set last_activity = v.la
from (values\n`;
  out += batch.map((x) => `  (${x.lid}::bigint, ${sq(x.la)})`).join(",\n");
  out += `\n) as v(lid, la)
where d.legacy_id = v.lid and coalesce(d.last_activity, '') <> v.la;\n\n`;
}

out += `commit;\n`;

writeFileSync(new URL("../supabase/seed/hubspot-import-aug2026.sql", import.meta.url), out);

// ---------- report ----------
let md = `# HubSpot re-import — 2026-08 exports\n\nGenerated by \`scripts/import-hubspot-aug2026.mjs\`.\n\n`;
md += `| what | count |\n|---|---|\n`;
md += `| companies upserted | ${companies.length} |\n`;
md += `| deals in export | ${deals.length} |\n`;
md += `| new deals inserted | ${newDeals.length} |\n`;
md += `| deal → company links | ${dealCompany.length} |\n`;
md += `| notes imported | ${noteRows.length} |\n`;
md += `| deal descriptions imported as notes | ${descRows.length} |\n`;
md += `| stage syncs (HubSpot wins) | ${drift.length} |\n`;
md += `| close-date backfills | ${closeBackfill.length} |\n`;
for (const [k, v] of Object.entries(report.skipped)) md += `| SKIPPED: ${k} | ${v} |\n`;
for (const [title, lines] of Object.entries(report.lists)) {
  md += `\n## ${title} (${lines.length})\n\n`;
  md += lines.map((l) => `- ${l}`).join("\n") + "\n";
}
writeFileSync(new URL("../supabase/seed/hubspot-import-aug2026-report.md", import.meta.url), md);

console.log("Wrote supabase/seed/hubspot-import-aug2026.sql");
console.log("Wrote supabase/seed/hubspot-import-aug2026-report.md");
console.log(`  companies: ${companies.length} (skipped ${namelessCompanies} nameless)`);
console.log(`  deals: ${deals.length} in export, ${newDeals.length} new`);
console.log(`  deal→company links: ${dealCompany.length}`);
console.log(`  notes: ${noteRows.length} (skipped ${noAssoc} unassociated, ${emptyBody} empty)`);
console.log(`  descriptions→notes: ${descRows.length}`);
console.log(`  stage drift: ${drift.length}`);
