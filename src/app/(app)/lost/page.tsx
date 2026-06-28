import { createClient } from "@/lib/supabase/server";
import type { Deal } from "@/lib/types";
import LostTable from "./LostTable";

export default async function LostPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("deals")
    .select("*")
    .eq("stage", "lost")
    .order("company");

  return (
    <section className="view active">
      <div className="eyebrow">Closed lost</div>
      <h1 className="view-title">Deals we lost</h1>
      <p className="view-sub">
        {(data ?? []).length} lost deals, kept for analysis. Most losses simply
        went quiet — worth understanding whether that is qualification, pricing,
        or follow-up.
      </p>
      <LostTable deals={(data ?? []) as Deal[]} />
    </section>
  );
}
