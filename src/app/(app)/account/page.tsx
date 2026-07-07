import { getSessionUser } from "@/lib/session";
import ChangePasswordForm from "./ChangePasswordForm";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  manager: "Manager · Founder view",
  rep: "Sales · Rep",
};

export default async function AccountPage() {
  const user = await getSessionUser();

  return (
    <section className="view active">
      <div className="eyebrow">Account</div>
      <h1 className="view-title">Your account</h1>
      <p className="view-sub">
        {user?.fullName} · {user?.email} · {ROLE_LABEL[user?.role ?? "rep"]}
      </p>
      <ChangePasswordForm email={user!.email} />
    </section>
  );
}
