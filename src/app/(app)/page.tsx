import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import { getActiveOwners, getTaskAssignees } from "@/lib/owners";
import { TASK_KIND } from "@/lib/cadence";
import type { Deal, Stage } from "@/lib/types";
import WeekList, { type TaskRow } from "./WeekList";
import AddDealButton from "./AddDealButton";

// A task joined to its deal, as returned by the embedded select below.
// The full deal row comes along so the drawer can open in place.
interface TaskQueryRow {
  id: string;
  note: string | null;
  due_date: string | null;
  owner_code: string | null;
  deal: Deal | null;
}

export default async function MyWeekPage() {
  const supabase = await createClient();
  const user = await getSessionUser();

  // Open tasks assigned to the current user (RLS scopes reps to their own,
  // managers see the whole team). Each task carries its deal for context.
  const [{ data: taskData }, { data: stageData }, owners, assignees] =
    await Promise.all([
      supabase
        .from("actions")
        .select("id, note, due_date, owner_code, deal:deals(*)")
        .eq("kind", TASK_KIND)
        .eq("done", false)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(1000),
      supabase.from("stages").select("*").order("sort"),
      getActiveOwners(supabase),
      getTaskAssignees(supabase),
    ]);

  const stages = (stageData ?? []) as Stage[];
  const ownerMap = new Map(owners); // code → display name

  const tasks = (taskData ?? []) as unknown as TaskQueryRow[];
  const rows: TaskRow[] = tasks.map((t) => ({
    id: t.id,
    objective: t.note ?? "",
    due_date: t.due_date,
    owner_code: t.owner_code,
    assignee: t.owner_code
      ? (ownerMap.get(t.owner_code) ?? t.owner_code)
      : null,
    dealId: t.deal?.id ?? null,
    company: t.deal?.company ?? null,
    dealname: t.deal?.dealname ?? null,
    value: t.deal?.value ?? 0,
    hot: t.deal?.hot ?? false,
  }));

  // one deal row per task-linked deal, for the in-place drawer
  const dealMap = new Map<string, Deal>();
  for (const t of tasks) if (t.deal) dealMap.set(t.deal.id, t.deal);
  const deals = Array.from(dealMap.values());

  const todayStr = new Date().toISOString().slice(0, 10);
  const overdueCount = rows.filter(
    (r) => r.due_date != null && r.due_date < todayStr,
  ).length;
  const first = user?.fullName.split(" ")[0] ?? "there";
  const isManager = user?.role !== "rep";

  return (
    <section className="view active">
      <div className="brief-hero">
        <div className="brief-date">
          {new Date().toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </div>
        <div className="brief-hello">
          Good morning, <em>{first}</em>.
        </div>
        <p className="brief-line">
          {rows.length > 0 ? (
            <>
              {rows.length} open {isManager ? "team " : ""}
              {rows.length === 1 ? "task" : "tasks"}
              {overdueCount > 0 ? ` — ${overdueCount} overdue` : ""}. Tick each
              one off as you go.
            </>
          ) : (
            <>No open tasks. Add tasks from any deal to plan your week.</>
          )}
        </p>
        <div style={{ marginTop: 18 }}>
          <AddDealButton
            stages={stages}
            owners={owners}
            currentUser={{
              id: user!.id,
              fullName: user!.fullName,
              repCode: user!.repCode,
            }}
          />
        </div>
      </div>

      <WeekList
        rows={rows}
        deals={deals}
        stages={stages}
        owners={owners}
        assignees={assignees}
        currentUser={{
          id: user!.id,
          fullName: user!.fullName,
          repCode: user!.repCode,
        }}
        canFilterPeople={isManager}
      />
    </section>
  );
}
