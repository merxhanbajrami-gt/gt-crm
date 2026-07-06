import { createClient } from "@/lib/supabase/server";
import type { Contact } from "@/lib/types";
import ContactsTable, { CONTACTS_PAGE } from "./ContactsTable";

export default async function ContactsPage() {
  const supabase = await createClient();
  // First page + the true total. count:'exact' returns the full row count even
  // though PostgREST caps the payload — this is why the page used to show 1000.
  const { data, count } = await supabase
    .from("contacts")
    .select("*", { count: "exact" })
    .order("name")
    .limit(CONTACTS_PAGE);

  const total = count ?? 0;

  return (
    <section className="view active">
      <div className="eyebrow">Relationship record</div>
      <h1 className="view-title">Contacts</h1>
      <p className="view-sub">
        {total.toLocaleString()} contacts. Search across name, company, title,
        email, and owner — it queries the whole book, not just this page.
      </p>
      <ContactsTable
        initialContacts={(data ?? []) as Contact[]}
        total={total}
      />
    </section>
  );
}
