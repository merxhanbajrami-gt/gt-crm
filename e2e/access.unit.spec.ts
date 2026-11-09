import { test, expect } from "@playwright/test";
import {
  ROLE_LABEL,
  canShareDeals,
  isGuest,
  tabAllowed,
} from "../src/lib/access";
import type { AppRole } from "../src/lib/types";

// Guest access (Nov 2026) — what the UI offers each role. RLS enforces the
// data rules; supabase/tests/guest_access.sql checks those.

const ROLES: AppRole[] = ["admin", "manager", "rep", "guest"];
const TABS = [
  "/",
  "/pipeline",
  "/lost",
  "/contacts",
  "/companies",
  "/scorecard",
  "/ideas",
];

test("only the guest role is a guest", () => {
  expect(ROLES.filter(isGuest)).toEqual(["guest"]);
});

test("admins and managers share deals; reps and guests don't", () => {
  expect(ROLES.filter(canShareDeals)).toEqual(["admin", "manager"]);
});

test("a guest keeps My Week, Pipeline, Lost, Contacts and Companies", () => {
  expect(TABS.filter((t) => tabAllowed("guest", t))).toEqual([
    "/",
    "/pipeline",
    "/lost",
    "/contacts",
    "/companies",
  ]);
});

test("the team keeps every tab", () => {
  for (const role of ["admin", "manager", "rep"] as AppRole[]) {
    expect(TABS.filter((t) => tabAllowed(role, t))).toEqual(TABS);
  }
});

test("every role has a label", () => {
  for (const role of ROLES) expect(ROLE_LABEL[role]).toBeTruthy();
});
