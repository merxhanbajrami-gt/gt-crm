import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import type { Deal, Stage } from "@/lib/types";
import PipelineBoard from "./PipelineBoard";

export default async function PipelinePage() {
  const supabase = await createClient();
  const user = await getSessionUser();

  const [{ data: stages }, { data: deals }] = await Promise.all([
    supabase.from("stages").select("*").order("sort"),
    supabase.from("deals").select("*").order("value", { ascending: false }),
  ]);

  // The board is the working pipeline; lost deals live under the dedicated
  // Lost tab, so keep that column off the board (6 columns wrap and break).
  const boardStages = (stages ?? []).filter((s) => s.id !== "lost");
  const boardDeals = (deals ?? []).filter((d) => d.stage !== "lost");

  // owner filter options (rep codes present in the visible book)
  const owners = Array.from(
    new Map(
      boardDeals
        .filter((d) => d.owner_code)
        .map((d) => [d.owner_code, d.owner_name || d.owner_code]),
    ).entries(),
  ).sort((a, b) => String(a[1]).localeCompare(String(b[1])));

  return (
    <section className="view active">
      <div className="eyebrow">Deal flow</div>
      <h1 className="view-title">Where every lead stands</h1>
      <p className="view-sub">
        {boardDeals.length} live cards from the pipeline. Each column is a
        job, not a label. Drag a card to restage it. Amber dot means the deal is
        flagged hot. Columns scroll.
      </p>
      <PipelineBoard
        stages={boardStages as Stage[]}
        deals={boardDeals as Deal[]}
        owners={owners as [string, string][]}
        currentUser={{
          id: user!.id,
          fullName: user!.fullName,
          repCode: user!.repCode,
        }}
      />
      <div className="legend">
        <span>
          <i className="lg" style={{ background: "var(--green)" }} /> healthy
        </span>
        <span>
          <i className="lg" style={{ background: "var(--amber)" }} /> quiet 30+
          days
        </span>
        <span>
          <i className="lg" style={{ background: "var(--red)" }} /> quiet 90+ days
        </span>
      </div>
    </section>
  );
}
