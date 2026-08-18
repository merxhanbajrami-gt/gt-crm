// Shared between the server page and the client table. Lives outside the
// "use client" module on purpose: a server component importing values from a
// client module gets client-reference proxies, not the values.
import type { Contact } from "@/lib/types";

export const CONTACTS_PAGE = 200;

// list rows carry the linked company's name (PostgREST embed on company_id)
export type ContactRow = Contact & { companies: { name: string } | null };

export const CONTACT_COLS = "*, companies(name)";
