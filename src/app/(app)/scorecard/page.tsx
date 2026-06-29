import { createClient } from "@/lib/supabase/server";

interface StageRow {
  stage: string;
  name: string;
  color: string | null;
  count: number;
  value: number;
}
interface VerticalRow {
  vertical: string;
  count: number;
}

function Bar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12.5,
          marginBottom: 4,
        }}
      >
        <span>{label}</span>
        <span style={{ fontFamily: "var(--mono, monospace)", fontWeight: 600 }}>
          {value.toLocaleString()}
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
            width: `${pct}%`,
            height: "100%",
            background: color,
            borderRadius: 99,
          }}
        />
      </div>
    </div>
  );
}

export default async function ScorecardPage() {
  const supabase = await createClient();
  const [{ data: summary }, { data: byStage }, { data: byVertical }] =
    await Promise.all([
      supabase.rpc("scorecard_summary"),
      supabase.from("v_pipeline_by_stage").select("*"),
      supabase.from("v_pipeline_by_vertical").select("*").limit(8),
    ]);

  const s = (summary ?? {}) as Record<string, number>;
  const stages = (byStage ?? []) as StageRow[];
  const verticals = (byVertical ?? []) as VerticalRow[];
  const maxStage = Math.max(1, ...stages.map((r) => r.count));
  const maxVert = Math.max(1, ...verticals.map((r) => r.count));

  const bignums = [
    { k: "Contacts on record", v: s.total_contacts ?? 0, sub: "unique people in the book" },
    { k: "Open pipeline cards", v: s.open_cards ?? 0, sub: "won and lost excluded" },
    { k: "Hot leads open", v: s.hot ?? 0, sub: "flagged hot" },
    { k: "In Attack", v: s.in_attack ?? 0, sub: "live, push now" },
    { k: "In Close", v: s.in_close ?? 0, sub: "proposal out" },
    { k: "Won", v: s.won ?? 0, sub: "signed" },
  ];

  return (
    <section className="view active">
      <div className="eyebrow">Founder view</div>
      <h1 className="view-title">Scorecard</h1>
      <p className="view-sub">
        The weekly read. Numbers first, then the interpretation.
      </p>

      <div className="bignums">
        {bignums.map((b) => (
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
          <div className="chsub">All deals across the pipeline, count</div>
          <div style={{ marginTop: 14 }}>
            {stages.map((r) => (
              <Bar
                key={r.stage}
                label={r.name}
                value={r.count}
                max={maxStage}
                color={r.color ?? "var(--gt-blue)"}
              />
            ))}
          </div>
        </div>

        <div className="chartcard">
          <h3>Open cards by vertical</h3>
          <div className="chsub">Where the pipeline concentrates</div>
          <div style={{ marginTop: 14 }}>
            {verticals.map((r) => (
              <Bar
                key={r.vertical}
                label={r.vertical}
                value={r.count}
                max={maxVert}
                color="var(--gt-blue)"
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
