import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import { getActiveOwners } from "@/lib/owners";
import { TASK_KIND } from "@/lib/cadence";
import type { Deal, Stage } from "@/lib/types";
import PipelineBoard from "./PipelineBoard";

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ deal?: string }>;
}) {
  const { deal: initialDealId } = await searchParams;
  const supabase = await createClient();
  const user = await getSessionUser();

  const [{ data: stages }, { data: deals }, { data: openTasks }, owners] =
    await Promise.all([
      supabase.from("stages").select("*").order("sort"),
      supabase.from("deals").select("*").order("value", { ascending: false }),
      // open tasks → which deals already have a next action
      supabase
        .from("actions")
        .select("deal_id")
        .eq("kind", TASK_KIND)
        .eq("done", false),
      // assignable people come from the curated team list (active only)
      getActiveOwners(supabase),
    ]);

  // The board is the working pipeline; lost deals live under the dedicated
  // Lost tab, so keep that column off the board (6 columns wrap and break).
  const boardStages = (stages ?? []).filter((s) => s.id !== "lost");
  const boardDeals = (deals ?? []).filter((d) => d.stage !== "lost");

  // deals that already have an active (incomplete) task
  const dealsWithTask = Array.from(
    new Set(
      (openTasks ?? [])
        .map((t) => t.deal_id as string | null)
        .filter((id): id is string => !!id),
    ),
  );

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
        dealsWithTask={dealsWithTask}
        initialDealId={initialDealId ?? null}
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
        <span>
          <i className="lg" style={{ background: "var(--gt-blue)" }} /> no active
          task
        </span>
      </div>
    </section>
  );
}
