import type { SupabaseClient } from "@supabase/supabase-js";

// The canonical list of assignable people (active team members), as
// [code, name] pairs for the owner / assignee dropdowns. Replaces the old
// "distinct deals.owner_code" derivation, which included people who had left.
export async function getActiveOwners(
  supabase: SupabaseClient,
): Promise<[string, string][]> {
  const { data } = await supabase
    .from("team_members")
    .select("code, name")
    .eq("active", true)
    .not("code", "is", null)
    .order("name");
  return ((data ?? []) as { code: string; name: string }[]).map((m) => [
    m.code,
    m.name,
  ]);
}

// Subset of the active team that tasks can be assigned to — the owner list
// also carries sourcing partners who own deals but don't work tasks.
export async function getTaskAssignees(
  supabase: SupabaseClient,
): Promise<[string, string][]> {
  const { data } = await supabase
    .from("team_members")
    .select("code, name")
    .eq("active", true)
    .eq("task_assignee", true)
    .not("code", "is", null)
    .order("name");
  return ((data ?? []) as { code: string; name: string }[]).map((m) => [
    m.code,
    m.name,
  ]);
}
