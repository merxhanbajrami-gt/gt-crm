// Fixed lead-source vocabulary. Kept as a closed list so "leads by source"
// counts stay clean (no free-text variants/typos). Add new sources here.
// Mix of sourcing people and channels, per the team's list.
export const LEAD_SOURCES = [
  "Nikita",
  "John",
  "Andy",
  "Kate",
  "Nick Eaves",
  "Chriss Tuff",
  "Andrew Muzzelle",
  "Jordan",
  "Nikolai LeadGen",
  "Oleksandr K",
  "Internal Referral",
  "External Referral",
  "Event",
  "Partner",
  "Existing Client",
  "Ex-client",
  "Other",
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];
