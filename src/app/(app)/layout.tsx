import { redirect } from "next/navigation";
import TopBar from "@/components/TopBar";
import { getSessionUser } from "@/lib/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <>
      <TopBar user={user} />
      <main className="shell">{children}</main>
    </>
  );
}
