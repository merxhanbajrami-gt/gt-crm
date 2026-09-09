# Date backfill — September 2026

For Oleksandr. What was wrong, what was fixed, and what still needs a human.

## First touch (your point 1)

**Finding.** The June import never copied HubSpot's *Create Date* into First
Touch. Only 27 of the 527 migrated deals had a date, and those were set by
hand in the app. The other 500 were blank.

**Fix.** First Touch = HubSpot *Create Date* for all 500 blank deals, taken
from your 11 Aug 2026 export and matched on the HubSpot Record ID. The 27
hand-set dates were left as they were (they all equal the Create Date anyway).

| First touch year | Deals |
| --- | --- |
| 2023 | 278 |
| 2024 | 109 |
| 2025 | 76 |
| 2026 | 71 |

First Touch is now mandatory: the Add-deal form requires it (defaults to
today), the database rejects a blank, and the deal record will not let you
clear it.

## Close dates (needed for the Lost sort and for "client since")

**Finding.** 187 closed deals had no close date: 39 won, 148 lost. HubSpot has
no Close Date for them either, but it reports *Days to close: 0* for every one,
which means HubSpot treated them as closed on their creation day.

**Fix.** Close date = HubSpot *Create Date* for those 187 deals. That is
HubSpot's own answer, not a guess, but for old deals it may be off. If a
"client since" or a Lost closed date looks wrong, correct the close date in the
deal record and the company updates itself.

## Won deals with no company link

"Client since" is the first won deal's close date, so a won deal must point at
its company. 22 won deals did not.

**Linked automatically (11):** Feeld (2), Hadean, Optegra, Vodori (2) by exact
name; Balloon One, Mspark LLC, and Segen (3) after checking the names by hand.

**Still unlinked (11) — please open each deal and pick the company:**

| Deal | Why not linked |
| --- | --- |
| Asahi Breweris \| Nick Eaves | "Asahi Technologies" and "asahibeer.com" exist; unclear which, if either |
| Bain \| 1 Full-stack Developer role | no Bain company record |
| Boots \| Opticians Clinic Forecasting Platform | two "Boots Opticians" records — merge them first |
| Clone \| Chad (2 roles) | no company record |
| CoolPlanet Hubspot build \| Henry Ingram | no company record |
| Debora Brooksbank-Taylor deal | no company record (person, not company) |
| FrontLine | no company record |
| Reevoo team expansion – Reevoo | no company record (Feefo, formerly Reevoo, exists — your call) |
| Stage Entertainment | no company record |
| TAPS \| Web Developer | no company record |
| threesixhealth deal – Ross Grey | no company record |

## How the Companies page now decides "client type"

1. A value you set by hand on the company record wins (use this for
   **Ex-Client**, or for a client we won before the CRM).
2. Otherwise, any won deal → **Existing Client**, client since = first won
   deal's close date.
3. Otherwise, a deal marked Existing Client → **Existing Client** (sold to them
   before HubSpot tracked it; no client-since date).
4. Otherwise, any deal at all → **New Client** (a prospect).
5. No deals → blank.

Winning a deal flips that deal's client type from New Client or Ex-Client to
Existing Client, and removes an Ex-Client override on its company.

Current split: 82 Existing Client (79 with a client-since date), 273 New
Client, 2,076 companies with no deals on record.
