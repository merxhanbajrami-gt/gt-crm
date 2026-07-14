import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import { getActiveOwners } from "@/lib/owners";
import type { Deal, Stage } from "@/lib/types";
import LostTable from "./LostTable";

export default async function LostPage() {
  const supabase = await createClient();
  const user = await getSessionUser();

  const [{ data }, { data: stageData }, owners] = await Promise.all([
    supabase.from("deals").select("*").eq("stage", "lost").order("company"),
    supabase.from("stages").select("*").order("sort"),
    getActiveOwners(supabase),
  ]);

  return (
    <section className="view active">
      <div className="eyebrow">Closed lost</div>
      <h1 className="view-title">Deals we lost</h1>
      <p className="view-sub">
        {(data ?? []).length} lost deals, kept for analysis. Open any one to
        review its notes and history — or reopen it back into the pipeline.
      </p>
      <LostTable
        deals={(data ?? []) as Deal[]}
        stages={(stageData ?? []) as Stage[]}
        owners={owners}
        currentUser={{
          id: user!.id,
          fullName: user!.fullName,
          repCode: user!.repCode,
        }}
      />
    </section>
  );
}
