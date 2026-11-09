import { getSessionUser } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/access";
import ChangePasswordForm from "./ChangePasswordForm";

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
