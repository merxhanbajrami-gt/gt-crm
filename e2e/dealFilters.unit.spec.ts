import { test, expect } from "@playwright/test";
import {
  ALL,
  NONE,
  NO_FILTERS,
  activeFilterCount,
  fieldOptions,
  matchesDeal,
  parseFilters,
  touchRange,
  writeFilters,
  type DealFilters,
} from "../src/lib/dealFilters";
import type { Deal } from "../src/lib/types";

// Pipeline filters (Oleksandr, Oct 2026) — the matching and URL round trip.

const deal = (patch: Partial<Deal> = {}): Deal => ({
  id: "d1",
  legacy_id: null,
  company: "Acme",
  dealname: "Acme – Jo",
  contact_name: "Jo Bloggs",
  title: null,
  email: null,
  phone: null,
  linkedin_url: null,
  stage: "pursue",
  value: 0,
  last_touched_at: "2026-10-01T00:00:00Z",
  owner_code: "OK",
  owner_name: "Oleksandr Kicha",
  owner_id: null,
  client_type: "New Client",
  source: "John",
  company_id: null,
  first_touch_date: "2026-03-15",
  business_segment: "Commercial",
  close_date: null,
  lost_reason: null,
  hot: false,
  last_activity: null,
  n_contacts: 0,
  created_at: "2026-03-15T00:00:00Z",
  updated_at: "2026-03-15T00:00:00Z",
  ...patch,
});

const f = (patch: Partial<DealFilters>): DealFilters => ({
  ...NO_FILTERS,
  ...patch,
});

test.describe("matchesDeal", () => {
  test("no filters match every deal", () => {
    expect(matchesDeal(deal(), NO_FILTERS, false)).toBe(true);
    expect(matchesDeal(deal({ source: null }), NO_FILTERS, false)).toBe(true);
  });

  test("lead source: a value, or blank", () => {
    expect(matchesDeal(deal(), f({ source: "John" }), false)).toBe(true);
    expect(matchesDeal(deal(), f({ source: "Kate" }), false)).toBe(false);
    expect(matchesDeal(deal(), f({ source: NONE }), false)).toBe(false);
    expect(matchesDeal(deal({ source: null }), f({ source: NONE }), false)).toBe(
      true,
    );
    expect(matchesDeal(deal({ source: "" }), f({ source: NONE }), false)).toBe(
      true,
    );
  });

  test("owner, client type and segment", () => {
    expect(matchesDeal(deal(), f({ owner: "OK" }), false)).toBe(true);
    expect(matchesDeal(deal(), f({ owner: "JH" }), false)).toBe(false);
    expect(
      matchesDeal(deal({ owner_code: null }), f({ owner: NONE }), false),
    ).toBe(true);
    expect(matchesDeal(deal(), f({ clientType: "Existing Client" }), false)).toBe(
      false,
    );
    expect(matchesDeal(deal(), f({ segment: "Defence" }), false)).toBe(false);
    expect(
      matchesDeal(deal({ business_segment: "Defence" }), f({ segment: "Defence" }), false),
    ).toBe(true);
  });

  test("first touch custom range is inclusive and may be open-ended", () => {
    const d = deal({ first_touch_date: "2026-03-15" });
    const custom = (from: string, to: string) =>
      f({ touch: "custom", from, to });
    expect(matchesDeal(d, custom("2026-03-15", "2026-03-15"), false)).toBe(true);
    expect(matchesDeal(d, custom("2026-03-16", "2026-12-31"), false)).toBe(false);
    expect(matchesDeal(d, custom("2026-01-01", ""), false)).toBe(true);
    expect(matchesDeal(d, custom("", "2026-03-14"), false)).toBe(false);
    // reversed bounds mean the same window
    expect(matchesDeal(d, custom("2026-12-31", "2026-01-01"), false)).toBe(true);
  });

  test("first touch presets resolve against today", () => {
    const now = new Date("2026-10-19T12:00:00Z");
    expect(touchRange(f({ touch: "month" }), now)).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(touchRange(f({ touch: "any" }), now)).toBeNull();
    expect(touchRange(f({ touch: "custom" }), now)).toBeNull();
    const range = touchRange(f({ touch: "year" }), now);
    expect(matchesDeal(deal(), f({ touch: "year" }), false, range)).toBe(true);
    expect(
      matchesDeal(deal({ first_touch_date: "2025-12-31" }), f({ touch: "year" }), false, range),
    ).toBe(false);
  });

  test("hot and no-task toggles", () => {
    expect(matchesDeal(deal(), f({ hot: true }), false)).toBe(false);
    expect(matchesDeal(deal({ hot: true }), f({ hot: true }), false)).toBe(true);
    expect(matchesDeal(deal(), f({ noTask: true }), false)).toBe(false);
    expect(matchesDeal(deal(), f({ noTask: true }), true)).toBe(true);
  });

  test("search covers the lead source and combines with filters", () => {
    expect(matchesDeal(deal(), f({ q: "john" }), false)).toBe(true);
    expect(matchesDeal(deal(), f({ q: "acme", owner: "JH" }), false)).toBe(
      false,
    );
  });
});

test.describe("URL round trip", () => {
  test("default filters write no params and keep others", () => {
    const out = writeFilters(NO_FILTERS, new URLSearchParams("deal=abc"));
    expect(out.toString()).toBe("deal=abc");
  });

  test("set filters survive write → parse", () => {
    const set = f({
      owner: "OK",
      source: NONE,
      clientType: "Ex-Client",
      segment: "Defence",
      touch: "custom",
      from: "2025-01-01",
      to: "2025-06-30",
      hot: true,
      noTask: true,
      q: "acme",
    });
    const params = Object.fromEntries(
      writeFilters(set, new URLSearchParams()),
    );
    expect(params).toEqual({
      q: "acme",
      owner: "OK",
      source: "none",
      type: "Ex-Client",
      segment: "Defence",
      touch: "custom",
      from: "2025-01-01",
      to: "2025-06-30",
      hot: "1",
      notask: "1",
    });
    expect(parseFilters(params)).toEqual(set);
  });

  test("bad params fall back to no filter", () => {
    const parsed = parseFilters({
      touch: "fortnight",
      from: "yesterday",
      hot: "yes",
      owner: ["JH", "OK"],
    });
    expect(parsed).toEqual(f({ owner: "JH" }));
    // dates only count with the custom preset
    expect(parseFilters({ touch: "month", from: "2025-01-01" }).from).toBe("");
  });

  test("activeFilterCount ignores search and empty custom ranges", () => {
    expect(activeFilterCount(f({ q: "acme" }))).toBe(0);
    expect(activeFilterCount(f({ touch: "custom" }))).toBe(0);
    expect(
      activeFilterCount(f({ source: NONE, touch: "year", noTask: true })),
    ).toBe(3);
  });
});

test.describe("fieldOptions", () => {
  test("lists used values in list order, extras A–Z, then blanks", () => {
    const deals = [
      deal({ source: "Kate" }),
      deal({ source: "John" }),
      deal({ source: "John" }),
      deal({ source: "Webinar" }), // legacy value outside the closed list
      deal({ source: null }),
    ];
    const opts = fieldOptions(
      deals,
      (d) => d.source,
      ["Nikita", "John", "Kate"],
      "No source",
    );
    expect(opts).toEqual([
      { value: "John", label: "John", count: 2 },
      { value: "Kate", label: "Kate", count: 1 },
      { value: "Webinar", label: "Webinar", count: 1 },
      { value: NONE, label: "No source", count: 1 },
    ]);
    expect(opts.some((o) => o.value === ALL)).toBe(false);
  });
});
