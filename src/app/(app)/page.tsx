import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import { getActiveOwners } from "@/lib/owners";
import { TASK_KIND } from "@/lib/cadence";
import type { Stage } from "@/lib/types";
import WeekList, { type TaskRow } from "./WeekList";
import AddDealButton from "./AddDealButton";

// A task joined to its deal, as returned by the embedded select below.
interface TaskQueryRow {
  id: string;
  note: string | null;
  due_date: string | null;
  owner_code: string | null;
  deal: {
    id: string;
    company: string | null;
    dealname: string | null;
    value: number;
    hot: boolean;
  } | null;
}

export default async function MyWeekPage() {
  const supabase = await createClient();
  const user = await getSessionUser();

  // Open tasks assigned to the current user (RLS scopes reps to their own,
  // managers see the whole team). Each task carries its deal for context.
  const [{ data: taskData }, { data: stageData }, owners] = await Promise.all([
    supabase
      .from("actions")
      .select(
        "id, note, due_date, owner_code, deal:deals(id, company, dealname, value, hot)",
      )
      .eq("kind", TASK_KIND)
      .eq("done", false)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(1000),
    supabase.from("stages").select("*").order("sort"),
    getActiveOwners(supabase),
  ]);

  const stages = (stageData ?? []) as Stage[];

  const rows: TaskRow[] = ((taskData ?? []) as unknown as TaskQueryRow[]).map(
    (t) => ({
      id: t.id,
      objective: t.note ?? "",
      due_date: t.due_date,
      owner_code: t.owner_code,
      dealId: t.deal?.id ?? null,
      company: t.deal?.company ?? null,
      dealname: t.deal?.dealname ?? null,
      value: t.deal?.value ?? 0,
      hot: t.deal?.hot ?? false,
    }),
  );

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

      <WeekList title={isManager ? "Team tasks" : "Your tasks"} rows={rows} />
    </section>
  );
}
