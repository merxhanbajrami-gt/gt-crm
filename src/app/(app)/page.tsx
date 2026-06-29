import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import { TOUCH_KINDS, touchStatus } from "@/lib/cadence";
import type { Deal, Stage } from "@/lib/types";
import WeekList, { type WeekRow } from "./WeekList";
import AddDealButton from "./AddDealButton";

export default async function MyWeekPage() {
  const supabase = await createClient();
  const user = await getSessionUser();

  // open deals (RLS scopes reps to their own book, managers see all) + every
  // logged touch, so we can work out what's actually due for a touch this week.
  const [{ data: dealData }, { data: touchData }, { data: stageData }, { data: ownerData }] =
    await Promise.all([
      supabase
        .from("deals")
        .select("*")
        .not("stage", "in", "(won,lost)")
        .limit(1000),
      supabase
        .from("actions")
        .select("deal_id, created_at")
        .in("kind", TOUCH_KINDS),
      supabase.from("stages").select("*").order("sort"),
      supabase.from("deals").select("owner_code, owner_name").not("owner_code", "is", null),
    ]);

  const deals = (dealData ?? []) as Deal[];

  // stages + owner options for the Add deal form
  const stages = (stageData ?? []) as Stage[];
  const owners = Array.from(
    new Map(
      (ownerData ?? []).map((d) => [
        d.owner_code as string,
        (d.owner_name as string) || (d.owner_code as string),
      ]),
    ).entries(),
  ).sort((a, b) => String(a[1]).localeCompare(String(b[1]))) as [string, string][];

  // latest touch per deal
  const lastTouch = new Map<string, string>();
  for (const t of touchData ?? []) {
    const prev = lastTouch.get(t.deal_id as string);
    if (!prev || (t.created_at as string) > prev) {
      lastTouch.set(t.deal_id as string, t.created_at as string);
    }
  }

  const rows: WeekRow[] = deals
    .map((d) => {
      const st = touchStatus(d.stage, lastTouch.get(d.id) ?? null, d.days_in_stage);
      return { d, daysOverdue: st.daysOverdue };
    })
    // due within the next 7 days or already overdue
    .filter((x) => x.daysOverdue >= -7)
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .map(({ d, daysOverdue }) => ({
      id: d.id,
      company: d.company,
      dealname: d.dealname,
      vertical: d.vertical,
      value: d.value,
      owner_code: d.owner_code,
      hot: d.hot,
      daysOverdue,
    }));

  const overdueCount = rows.filter((r) => r.daysOverdue > 0).length;
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
              {rows.length} {isManager ? "deals" : "of your deals"} need a touch
              this week
              {overdueCount > 0 ? ` — ${overdueCount} already overdue` : ""}.
              Log a touch to clear each one.
            </>
          ) : (
            <>Nothing is due for a touch this week. Your book is on the clock.</>
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
        title={isManager ? "Team — due for a touch" : "Your touches this week"}
        rows={rows}
        currentUser={{ id: user!.id, repCode: user!.repCode }}
      />
    </section>
  );
}
