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

// Closed list for deals.client_type (was HubSpot "Deal Type") and for the
// company-level client status. Ex-Client added Sep 2026 (Oleksandr). Winning
// a deal flips New Client / Ex-Client → Existing Client (DB trigger, 0017).
export const CLIENT_TYPES = ["New Client", "Existing Client", "Ex-Client"] as const;

export type ClientType = (typeof CLIENT_TYPES)[number];

// Which side of the business an account sits on (Oleksandr, Sep 2026). Defence
// sells differently from the rest, so it gets its own tab on Companies and its
// own field on a deal. Commercial is the general case; a Defence deal marks its
// company Defence and later deals for that company default to Defence.
export const BUSINESS_SEGMENTS = ["Commercial", "Defence"] as const;

export type BusinessSegment = (typeof BUSINESS_SEGMENTS)[number];

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
