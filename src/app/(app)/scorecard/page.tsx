import { createClient } from "@/lib/supabase/server";
import { gbp } from "@/lib/format";
import { resolveRange } from "@/lib/dateRange";
import RangePicker from "./RangePicker";

interface StageRow {
  stage: string;
  name: string;
  color: string | null;
  count: number;
  value: number;
}
interface Bucket {
  label: string;
  count: number;
}
// scorecard_range(from, to) — see migration 0017
interface RangeStats {
  leads: number;
  leads_open: number;
  leads_won: number;
  leads_lost: number;
  reached_pursue: number;
  reached_attack: number;
  reached_close: number;
  reached_won: number;
  won_in_range: number;
  won_value_in_range: number;
  lost_in_range: number;
  new_clients: number;
  by_source: Bucket[];
  by_client_type: Bucket[];
  lost_by_reason: Bucket[];
}

const pct = (n: number, of: number) =>
  of > 0 ? `${Math.round((n / of) * 100)}%` : "—";

function Bar({
  label,
  value,
  max,
  color,
  sub,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  sub?: string;
}) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12.5,
          marginBottom: 4,
          gap: 8,
        }}
      >
        <span>{label}</span>
        <span style={{ fontFamily: "var(--mono, monospace)", fontWeight: 600 }}>
          {value.toLocaleString()}
          {sub ? (
            <span style={{ color: "var(--text-faint)", fontWeight: 500 }}>
              {" "}
              · {sub}
            </span>
          ) : null}
        </span>
      </div>
      <div
        style={{
          height: 8,
          background: "var(--surface-3)",
          borderRadius: 99,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${width}%`,
            height: "100%",
            background: color,
            borderRadius: 99,
          }}
        />
      </div>
    </div>
  );
}

function Buckets({
  rows,
  color,
  empty,
}: {
  rows: Bucket[];
  color: string;
  empty: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0)
    return <div className="cm" style={{ padding: "4px 0" }}>{empty}</div>;
  return (
    <>
      {rows.slice(0, 8).map((r) => (
        <Bar key={r.label} label={r.label} value={r.count} max={max} color={color} />
      ))}
    </>
  );
}

export default async function ScorecardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const range = resolveRange(await searchParams);
  const supabase = await createClient();
  const [{ data: ranged }, { data: summary }, { data: byStage }] =
    await Promise.all([
      supabase.rpc("scorecard_range", { p_from: range.from, p_to: range.to }),
      supabase.rpc("scorecard_summary"),
      supabase.from("v_pipeline_by_stage").select("*"),
    ]);

  const r = (ranged ?? {}) as Partial<RangeStats>;
  const n = (k: keyof RangeStats) => Number(r[k] ?? 0);
  const s = (summary ?? {}) as Record<string, number>;
  const stages = (byStage ?? []) as StageRow[];
  const maxStage = Math.max(1, ...stages.map((x) => x.count));

  const leads = n("leads");
  // Leads added in the range → how far they got. Each step also shows the
  // conversion from the previous one.
  const funnel = [
    { label: "Leads added", v: leads, color: "#7B7AE6" },
    { label: "Reached Pursue", v: n("reached_pursue"), color: "#2F4BF5" },
    { label: "Reached Attack", v: n("reached_attack"), color: "#B45309" },
    { label: "Reached Close", v: n("reached_close"), color: "#0A0A0A" },
    { label: "Won", v: n("reached_won"), color: "#16A34A" },
  ];

  const dated = [
    { k: "Leads added", v: leads, sub: "first touch in range" },
    {
      k: "Won",
      v: n("won_in_range"),
      sub:
        n("won_value_in_range") > 0
          ? `closed in range · ${gbp(n("won_value_in_range"))}`
          : "closed in range",
    },
    { k: "Lost", v: n("lost_in_range"), sub: "closed in range" },
    { k: "New clients", v: n("new_clients"), sub: "first won deal in range" },
    { k: "Reached Attack", v: n("reached_attack"), sub: "of the leads added" },
    { k: "Reached Close", v: n("reached_close"), sub: "of the leads added" },
  ];

  const snapshot = [
    { k: "Open pipeline cards", v: s.open_cards ?? 0, sub: "won and lost excluded" },
    { k: "Hot leads open", v: s.hot ?? 0, sub: "flagged hot" },
    { k: "In Attack", v: s.in_attack ?? 0, sub: "live, push now" },
    { k: "In Close", v: s.in_close ?? 0, sub: "proposal out" },
    { k: "Won, all time", v: s.won ?? 0, sub: "signed" },
    { k: "Contacts on record", v: s.total_contacts ?? 0, sub: "unique people in the book" },
  ];

  return (
    <section className="view active">
      <div className="eyebrow">Founder view</div>
      <h1 className="view-title">Scorecard</h1>
      <p className="view-sub">
        The weekly read. Pick a period: leads are counted by their first-touch
        date, wins and losses by their close date.
      </p>

      <RangePicker range={range} />

      <div className="bignums">
        {dated.map((b) => (
          <div className="stat" key={b.k}>
            <div className="label">{b.k}</div>
            <div className="num">{b.v.toLocaleString()}</div>
            <div className="statsub">{b.sub}</div>
          </div>
        ))}
      </div>

      <div className="charts">
        <div className="chartcard">
          <h3>Funnel for leads added in this period</h3>
          <div className="chsub">
            How far these leads got · % of leads added · % from the previous
            step
          </div>
          <div style={{ marginTop: 14 }}>
            {funnel.map((f, i) => (
              <Bar
                key={f.label}
                label={f.label}
                value={f.v}
                max={Math.max(1, leads)}
                color={f.color}
                sub={
                  i === 0
                    ? undefined
                    : `${pct(f.v, leads)} · ${pct(f.v, funnel[i - 1].v)} step`
                }
              />
            ))}
          </div>
          <div className="statsub" style={{ marginTop: 12 }}>
            Of these {leads.toLocaleString()} leads: {n("leads_won")} won ·{" "}
            {n("leads_lost")} lost · {n("leads_open")} still open. Stage history
            is recorded from Aug 2026 — for older HubSpot-era deals that were
            lost, the stages they passed through are unknown, so &ldquo;reached&rdquo;
            counts can be low for earlier periods.
          </div>
        </div>

        <div className="chartcard">
          <h3>Leads by source</h3>
          <div className="chsub">Leads added in this period, by lead source</div>
          <div style={{ marginTop: 14 }}>
            <Buckets
              rows={r.by_source ?? []}
              color="#7B7AE6"
              empty="No leads added in this period."
            />
          </div>
        </div>

        <div className="chartcard">
          <h3>Leads by client type</h3>
          <div className="chsub">Leads added in this period · new vs existing</div>
          <div style={{ marginTop: 14 }}>
            <Buckets
              rows={r.by_client_type ?? []}
              color="var(--gt-blue)"
              empty="No leads added in this period."
            />
          </div>
        </div>

        <div className="chartcard">
          <h3>Lost deals by reason</h3>
          <div className="chsub">Deals lost in this period · captured at mark-lost</div>
          <div style={{ marginTop: 14 }}>
            <Buckets
              rows={r.lost_by_reason ?? []}
              color="var(--red, #DC2626)"
              empty="Nothing lost in this period."
            />
          </div>
        </div>
      </div>

      <div className="eyebrow" style={{ marginTop: 8 }}>
        Right now · not date-filtered
      </div>
      <div className="bignums">
        {snapshot.map((b) => (
          <div className="stat" key={b.k}>
            <div className="label">{b.k}</div>
            <div className="num">{b.v.toLocaleString()}</div>
            <div className="statsub">{b.sub}</div>
          </div>
        ))}
      </div>

      <div className="charts">
        <div className="chartcard">
          <h3>Cards by stage</h3>
          <div className="chsub">Every deal on record, by its current stage</div>
          <div style={{ marginTop: 14 }}>
            {stages.map((x) => (
              <Bar
                key={x.stage}
                label={x.name}
                value={x.count}
                max={maxStage}
                color={x.color ?? "var(--gt-blue)"}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
