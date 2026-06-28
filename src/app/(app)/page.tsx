import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import { fmtAge, gbp } from "@/lib/format";
import type { Deal } from "@/lib/types";

export default async function MyWeekPage() {
  const supabase = await createClient();
  const user = await getSessionUser();

  // Deals going quiet are this week's work. RLS scopes reps to their own book;
  // managers see the whole team.
  const { data } = await supabase
    .from("deals")
    .select("*")
    .not("stage", "in", "(won,lost)")
    .order("days_in_stage", { ascending: false })
    .limit(400);

  const deals = (data ?? []) as Deal[];
  const quiet = deals.filter((d) => d.days_in_stage >= 30);
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
          {quiet.length > 0 ? (
            <>
              {quiet.length} {isManager ? "deals across the team" : "of your deals"}{" "}
              have gone quiet for 30+ days. Clear the list so nothing slips.
            </>
          ) : (
            <>Nothing is overdue for a touch. Your book is on the clock.</>
          )}
        </p>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>{isManager ? "Team watchlist" : "Your actions this week"}</h2>
          <span className="count">{quiet.length}</span>
        </div>

        {quiet.length === 0 ? (
          <div className="dayclear" style={{ display: "block" }}>
            <div className="ring">✓</div>
            <div className="big">Week clear.</div>
            <div className="sub">
              Every open lead got its touch. Nothing is slipping.
            </div>
          </div>
        ) : (
          <div>
            {quiet.slice(0, 40).map((d) => {
              const sev = d.days_in_stage >= 90 ? "stuck" : "warn";
              return (
                <div className="action-row" key={d.id}>
                  <span
                    className="owner-dot"
                    style={{ width: 30, height: 30 }}
                  >
                    {d.owner_code}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>
                      {d.company}
                      {d.hot && (
                        <span
                          className="actiondot"
                          style={{ background: "var(--amber)", marginLeft: 8 }}
                          title="Hot"
                        />
                      )}
                    </div>
                    <div className="statsub">
                      {d.dealname || d.vertical || "—"}
                      {d.value > 0 ? ` · ${gbp(d.value)}` : ""}
                    </div>
                  </div>
                  <span className={`kage ${sev}`}>
                    {fmtAge(d.days_in_stage)} quiet
                  </span>
                </div>
              );
            })}
            <div style={{ marginTop: 14 }}>
              <Link href="/pipeline" className="addbtn">
                Open the pipeline →
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
