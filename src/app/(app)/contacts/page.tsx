import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import ContactsTable from "./ContactsTable";
import { CONTACTS_PAGE, CONTACT_COLS, type ContactRow } from "./shared";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ contact?: string }>;
}) {
  const { contact: initialContactId } = await searchParams;
  const supabase = await createClient();
  const user = await getSessionUser();
  // First page + the true total. count:'exact' returns the full row count even
  // though PostgREST caps the payload — this is why the page used to show 1000.
  const { data, count } = await supabase
    .from("contacts")
    .select(CONTACT_COLS, { count: "exact" })
    .order("name")
    .limit(CONTACTS_PAGE);

  const total = count ?? 0;

  // deep link (?contact=<id>) — the target may not be on page 1
  let initialContact: ContactRow | null = null;
  if (initialContactId) {
    const { data: hit } = await supabase
      .from("contacts")
      .select(CONTACT_COLS)
      .eq("id", initialContactId)
      .maybeSingle();
    initialContact = (hit as unknown as ContactRow) ?? null;
  }

  return (
    <section className="view active">
      <div className="eyebrow">Relationship record</div>
      <h1 className="view-title">Contacts</h1>
      <p className="view-sub">
        {total.toLocaleString()} contacts. Search across name, company, title,
        email, and owner — it queries the whole book, not just this page. Click
        a row to open and edit the record.
      </p>
      <ContactsTable
        initialContacts={(data ?? []) as unknown as ContactRow[]}
        total={total}
        initialContact={initialContact}
        currentUser={{
          id: user!.id,
          fullName: user!.fullName,
          repCode: user!.repCode,
        }}
      />
    </section>
  );
}
