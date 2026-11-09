import { test, expect } from "@playwright/test";
import { ageClass, isClosed } from "../src/lib/format";
import { ALL, NONE, fieldIs } from "../src/lib/dealFilters";

// Lost on the board and the Lost tab's source filter (Oleksandr, Nov 2026).

const DAY = 86400000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

test("won and lost are closed; the flow stages are not", () => {
  expect(["connection", "pursue", "attack", "close", "won", "lost"].filter(isClosed))
    .toEqual(["won", "lost"]);
});

test("a closed deal never shows as quiet", () => {
  expect(ageClass({ stage: "lost", last_touched_at: ago(400) })).toBe("");
  expect(ageClass({ stage: "won", last_touched_at: ago(400) })).toBe("");
  expect(ageClass({ stage: "pursue", last_touched_at: ago(400) })).toBe("stuck");
  expect(ageClass({ stage: "pursue", last_touched_at: ago(40) })).toBe("warn");
});

test("source filter: all, one source, or blank", () => {
  expect(fieldIs("Event", ALL)).toBe(true);
  expect(fieldIs(null, ALL)).toBe(true);
  expect(fieldIs("Event", "Event")).toBe(true);
  expect(fieldIs("Partner", "Event")).toBe(false);
  expect(fieldIs(null, NONE)).toBe(true);
  expect(fieldIs("Event", NONE)).toBe(false);
});
