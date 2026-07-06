// Fixed lead-source vocabulary. Kept as a closed list so "leads by source"
// counts stay clean (no free-text variants/typos). Add new sources here.
export const LEAD_SOURCES = [
  "Referral",
  "Outbound",
  "Inbound",
  "Event",
  "LinkedIn",
  "Partner",
  "Existing client",
  "Other",
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];
