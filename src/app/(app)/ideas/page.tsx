import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import type { Idea } from "@/lib/types";
import IdeaBoard from "./IdeaBoard";

export default async function IdeasPage() {
  const supabase = await createClient();
  const user = await getSessionUser();

  const { data } = await supabase
    .from("ideas")
    .select("*")
    .order("sort", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(1000);

  return (
    <section className="view active">
      <div className="eyebrow">Sales ideation</div>
      <h1 className="view-title">Ideas board</h1>
      <p className="view-sub">
        A home for sales ideas worth coming back to. Drag a card between columns
        to prioritise it, and send anything you&apos;re parking to the trash.
      </p>
      <IdeaBoard
        ideas={(data ?? []) as Idea[]}
        currentUser={{ id: user!.id, fullName: user!.fullName }}
      />
    </section>
  );
}
