import { createClient } from "@/lib/supabase/server";
import type { Contact } from "@/lib/types";
import ContactsTable from "./ContactsTable";

export default async function ContactsPage() {
  const supabase = await createClient();
  // pull the visible book (RLS already scopes reps to their own rows)
  const { data } = await supabase
    .from("contacts")
    .select("*")
    .order("name")
    .limit(5000);

  return (
    <section className="view active">
      <div className="eyebrow">Relationship record</div>
      <h1 className="view-title">Contacts</h1>
      <p className="view-sub">
        {(data ?? []).length.toLocaleString()} contacts. Search across name,
        company, and vertical. Sort by any column.
      </p>
      <ContactsTable contacts={(data ?? []) as Contact[]} />
    </section>
  );
}
