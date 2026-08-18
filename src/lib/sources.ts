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
  "Client Referral",
  "Event",
  "Partner",
  "Existing Client",
  "Ex-client",
  "Other",
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];

// Closed list for deals.client_type (was HubSpot "Deal Type"). Two values on
// purpose — Oleksandr's ask was exactly New vs Existing client.
export const CLIENT_TYPES = ["New Client", "Existing Client"] as const;

export type ClientType = (typeof CLIENT_TYPES)[number];

// Why a deal was lost — asked for when marking a deal lost, grouped on the
// scorecard. Derived from the HubSpot "Closed Lost" dispositions.
export const LOST_REASONS = [
  "Went dark",
  "Budget / pricing",
  "Chose competitor",
  "Went in-house",
  "Paused / timing",
  "Not a fit",
  "Other",
] as const;

export type LostReason = (typeof LOST_REASONS)[number];
