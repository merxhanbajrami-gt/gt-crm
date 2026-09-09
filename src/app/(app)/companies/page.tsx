import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import type { CompanyRow, Stage } from "@/lib/types";
import CompaniesTable, { COMPANIES_PAGE } from "./CompaniesTable";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const { company: initialCompanyId } = await searchParams;
  const supabase = await createClient();
  const user = await getSessionUser();

  const [{ data, count }, { data: stages }] = await Promise.all([
    supabase
      .from("v_companies")
      .select("*", { count: "exact" })
      .order("name")
      .limit(COMPANIES_PAGE),
    supabase.from("stages").select("*").order("sort"),
  ]);

  // deep link (?company=<id>) — the target may not be on page 1
  let initialCompany: CompanyRow | null = null;
  if (initialCompanyId) {
    const { data: c } = await supabase
      .from("v_companies")
      .select("*")
      .eq("id", initialCompanyId)
      .maybeSingle();
    initialCompany = (c as CompanyRow) ?? null;
  }

  const total = count ?? 0;

  return (
    <section className="view active">
      <div className="eyebrow">Account book</div>
      <h1 className="view-title">Companies</h1>
      <p className="view-sub">
        {total.toLocaleString()} companies from HubSpot and the pipeline. Client
        type and &ldquo;client since&rdquo; come from won deals: a company is a
        client from its first won deal&apos;s close date. Open one to see every
        deal and contact tied to it over time. Search and filters query the
        whole book, not just this page.
      </p>
      <CompaniesTable
        initialCompanies={(data ?? []) as CompanyRow[]}
        total={total}
        stages={(stages ?? []) as Stage[]}
        initialCompany={initialCompany}
        currentUser={{
          id: user!.id,
          fullName: user!.fullName,
          repCode: user!.repCode,
        }}
      />
    </section>
  );
}
