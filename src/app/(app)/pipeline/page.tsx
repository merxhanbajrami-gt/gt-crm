import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import { getActiveOwners, getTaskAssignees } from "@/lib/owners";
import { TASK_KIND } from "@/lib/cadence";
import { parseFilters } from "@/lib/dealFilters";
import { canShareDeals } from "@/lib/access";
import type { Deal, Stage } from "@/lib/types";
import PipelineBoard from "./PipelineBoard";

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initialDealId = typeof params.deal === "string" ? params.deal : null;
  const supabase = await createClient();
  const user = await getSessionUser();

  const [
    { data: stages },
    { data: deals },
    { data: openTasks },
    owners,
    assignees,
    { data: shares },
  ] = await Promise.all([
    supabase.from("stages").select("*").order("sort"),
    supabase.from("deals").select("*").order("value", { ascending: false }),
    // open tasks → which deals already have a next action
    supabase
      .from("actions")
      .select("deal_id")
      .eq("kind", TASK_KIND)
      .eq("done", false),
    // owners = curated team list (active); assignees = the task-taking subset
    getActiveOwners(supabase),
    getTaskAssignees(supabase),
    // deals shared with a guest (0020) — only managers mark them
    user && canShareDeals(user.role)
      ? supabase.from("deal_shares").select("deal_id")
      : Promise.resolve({ data: [] as { deal_id: string }[] }),
  ]);

  // Lost sits right of Won, so the whole book reads on one page (Oleksandr,
  // Nov 2026). The Lost tab stays for the table view and lost-reason sorting.
  const boardStages = stages ?? [];
  const boardDeals = deals ?? [];
  const lostCount = boardDeals.filter((d) => d.stage === "lost").length;

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
        {boardDeals.length - lostCount} live cards from the pipeline, plus{" "}
        {lostCount} lost on the right. Each column is a job, not a label. Drag a card to restage it. Amber dot means the deal is
        flagged hot. Columns scroll. Filters stay in the link, so you can share
        a filtered view.
      </p>
      <PipelineBoard
        stages={boardStages as Stage[]}
        deals={boardDeals as Deal[]}
        owners={owners as [string, string][]}
        assignees={assignees as [string, string][]}
        dealsWithTask={dealsWithTask}
        sharedDealIds={Array.from(
          new Set((shares ?? []).map((s) => s.deal_id as string)),
        )}
        initialDealId={initialDealId}
        initialFilters={parseFilters(params)}
        currentUser={{
          id: user!.id,
          fullName: user!.fullName,
          repCode: user!.repCode,
          role: user!.role,
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
