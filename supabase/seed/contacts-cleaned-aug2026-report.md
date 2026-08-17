# Cleaned contact list import — Aug 2026

Source: `GT-Contacts+John-Merged.xlsx` (Oleksandr, 2026-08-17), keyed on the
HubSpot Record ID. The sheet wins over June-import data wherever it has a
value; blanks keep what's in the CRM.

- 3468 sheet contacts processed (2046 titles,
  1879 LinkedIn URLs, 2934 emails).
- Contacts not yet in the CRM are inserted; existing ones refreshed in place.
- 3422 contacts carry a company name — linked to the company book
  where the name matches exactly one company and the contact had no link yet.
- 495 deals get their primary-contact fields refreshed from the
  cleaned data (name, title, email, LinkedIn).

## Not acted on

- The workbook's "Removed" sheet (109 contacts with IDs still in the CRM) is
  ignored — deleting people needs an explicit decision, and some may be
  referenced by deals/notes. Say the word and a follow-up can archive them.
