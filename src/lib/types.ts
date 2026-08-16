export type AppRole = "admin" | "manager" | "rep";

export type StageId =
  | "connection"
  | "pursue"
  | "attack"
  | "close"
  | "won"
  | "lost";

export interface Stage {
  id: StageId;
  name: string;
  verb: string | null;
  descr: string | null;
  color: string | null;
  sort: number;
}

export interface Deal {
  id: string;
  legacy_id: number | null;
  company: string | null;
  dealname: string | null;
  contact_name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  stage: StageId;
  value: number;
  last_touched_at: string;
  owner_code: string | null;
  owner_name: string | null;
  owner_id: string | null;
  client_type: string | null;
  source: string | null;
  company_id: string | null;
  first_touch_date: string | null;
  close_date: string | null;
  hot: boolean;
  last_activity: string | null;
  n_contacts: number;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  legacy_id: number | null;
  name: string | null;
  title: string | null;
  email: string | null;
  stage: string | null;
  owner_code: string | null;
  dealname: string | null;
  hot: boolean;
  vertical: string | null;
  deal_id: string | null;
  company_id: string | null;
  linkedin_url: string | null;
}

export interface Company {
  id: string;
  legacy_id: number | null;
  name: string;
  owner_code: string | null;
  owner_name: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  industry: string | null;
  last_activity: string | null;
  created_at: string;
  updated_at: string;
}

// a v_companies row: company + its deal/contact counts
export interface CompanyRow extends Company {
  deal_count: number;
  contact_count: number;
}

export interface ActionItem {
  id: string;
  deal_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  legacy_id: number | null;
  owner_id: string | null;
  owner_code: string | null;
  created_by: string | null;
  kind: string;
  note: string | null;
  due_date: string | null;
  done: boolean;
  created_at: string;
}

export type IdeaPriority = "high" | "medium" | "low";

export interface Idea {
  id: string;
  title: string;
  detail: string | null;
  priority: IdeaPriority;
  sort: number;
  suggested_by: string | null;
  author_id: string | null;
  author_name: string | null;
  status: "active" | "trashed";
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  name: string;
  code: string | null;
  email: string | null;
  active: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  rep_code: string | null;
}

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  initials: string;
  role: AppRole;
  repCode: string | null;
}
