import { createClient } from "@/lib/supabase/server";
import type { AppRole, SessionUser } from "@/lib/types";

function initialsOf(name: string, email: string): string {
  const base = name?.trim() || email.split("@")[0].replace(/[._-]/g, " ");
  const parts = base.split(/\s+/).filter(Boolean);
  const ini = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return (ini || email[0] || "?").toUpperCase();
}

function decodeRole(accessToken: string | undefined): AppRole {
  if (!accessToken) return "rep";
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1], "base64").toString(),
    );
    const r = payload.user_role;
    return r === "admin" || r === "manager" ? r : "rep";
  } catch {
    return "rep";
  }
}

// Resolves the current signed-in user with role (from the JWT claim) and
// rep_code (from their profile). Returns null when not authenticated.
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: sessionData }, { data: profile }, { data: roleRow }] =
    await Promise.all([
      supabase.auth.getSession(),
      supabase
        .from("profiles")
        .select("full_name, rep_code")
        .eq("id", user.id)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
    ]);

  // The user_roles table is the source of truth (matches RLS). Fall back to the
  // JWT claim, then 'rep'.
  const role: AppRole =
    (roleRow?.role as AppRole) ??
    decodeRole(sessionData.session?.access_token);

  const fullName =
    profile?.full_name ||
    (user.user_metadata?.full_name as string) ||
    (user.user_metadata?.name as string) ||
    user.email!.split("@")[0];

  return {
    id: user.id,
    email: user.email!,
    fullName,
    initials: initialsOf(fullName, user.email!),
    role,
    repCode: profile?.rep_code ?? null,
  };
}
