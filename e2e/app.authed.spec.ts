import { test, expect } from "@playwright/test";
import { adminClient, TEST_DEAL_PREFIX } from "./_admin";

// These tests share one user session and one (prod) database, so run them
// serially — parallel workers racing the same session/DB cause flaky writes.
test.describe.configure({ mode: "serial" });

// Runs with the saved rep session (see auth.setup.ts). Any deal these tests
// create is named with TEST_DEAL_PREFIX and wiped in afterAll so prod stays clean.

test.afterAll(async () => {
  const admin = adminClient();
  await admin.from("deals").delete().like("company", `${TEST_DEAL_PREFIX}%`);
  await admin.from("contacts").delete().like("name", `${TEST_DEAL_PREFIX}%`);
  // the Add-deal company type-ahead also creates a company-book entry
  await admin.from("companies").delete().like("name", `${TEST_DEAL_PREFIX}%`);
});

test.describe("My Week", () => {
  test("loads with greeting and an Add deal button", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/good morning/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /add deal/i }),
    ).toBeVisible();
  });

  test("Add deal button opens the modal with its fields", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /add deal/i }).click();
    const dialog = page.getByRole("dialog", { name: /add deal/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Company *")).toBeVisible();
    await expect(dialog.getByText("Stage")).toBeVisible();
    await expect(dialog.getByText("Value (£k)")).toBeVisible();
    // first touch is mandatory and defaults to today (Oleksandr, Sep 2026)
    await expect(dialog.getByText("First touch *")).toBeVisible();
    await expect(dialog.getByLabel("First touch")).toHaveValue(
      new Date().toISOString().slice(0, 10),
    );
    // close without creating anything
    await dialog.getByRole("button", { name: /close/i }).click();
    await expect(dialog).not.toBeVisible();
  });

  test.describe("task deal drawer", () => {
    // clicking a task's deal opens the drawer in place (Oleksandr, Aug 2026)
    const company = `${TEST_DEAL_PREFIX} Drawer Co`;

    test.beforeAll(async () => {
      const admin = adminClient();
      const { data: deal, error } = await admin
        .from("deals")
        .insert({ company, stage: "connection", owner_code: "E2E" })
        .select("id")
        .single();
      if (error) throw error;
      await admin.from("actions").insert({
        deal_id: deal.id,
        kind: "task",
        done: false,
        note: `${TEST_DEAL_PREFIX} follow up`,
        owner_code: "E2E",
        due_date: new Date().toISOString().slice(0, 10),
      });
      // the deal (and its task, via cascade) is wiped by the global afterAll
    });

    test("opens in place without leaving My Week", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("link", { name: company }).click();
      await expect(page.getByText("Deal record")).toBeVisible();
      await expect(page.getByRole("heading", { name: company })).toBeVisible();
      // no redirect to the pipeline
      expect(new URL(page.url()).pathname).toBe("/");
    });
  });
});

test.describe("Pipeline", () => {
  test("board renders the stage columns", async ({ page }) => {
    await page.goto("/pipeline");
    await expect(
      page.getByRole("heading", { name: /where every lead stands/i }),
    ).toBeVisible();
    // active flow columns render (Lost lives under its own tab, not here)
    await expect(page.getByText("Connection")).toBeVisible();
    await expect(page.getByText("Won")).toBeVisible();
  });

  test.describe("filters", () => {
    // filter by lead source, first touch and more (Oleksandr, Oct 2026)
    const eventCo = `${TEST_DEAL_PREFIX} Filter Event Co`;
    const partnerCo = `${TEST_DEAL_PREFIX} Filter Partner Co`;

    test.beforeAll(async () => {
      const admin = adminClient();
      const { error } = await admin.from("deals").insert([
        {
          company: eventCo,
          stage: "connection",
          owner_code: "E2E",
          source: "Event",
          first_touch_date: "2024-02-10",
        },
        {
          company: partnerCo,
          stage: "connection",
          owner_code: "E2E",
          source: "Partner",
          first_touch_date: "2025-07-01",
        },
      ]);
      if (error) throw error;
      // both deals are wiped by the global afterAll
    });

    test("lead source and first touch narrow the board via the URL", async ({
      page,
    }) => {
      await page.goto("/pipeline");
      await expect(page.getByText(eventCo)).toBeVisible();
      await expect(page.getByText(partnerCo)).toBeVisible();

      await page.getByLabel("Lead source").selectOption("Event");
      await expect(page.getByText(eventCo)).toBeVisible();
      await expect(page.getByText(partnerCo)).not.toBeVisible();
      await expect(page).toHaveURL(/source=Event/);

      await page.getByLabel("Lead source").selectOption("all");
      await page
        .getByLabel("First touch", { exact: true })
        .selectOption("custom");
      await page.getByLabel("First touch from").fill("2025-01-01");
      await expect(page.getByText(partnerCo)).toBeVisible();
      await expect(page.getByText(eventCo)).not.toBeVisible();

      // the link reproduces the filtered view
      await page.reload();
      await expect(page.getByLabel("First touch from")).toHaveValue(
        "2025-01-01",
      );
      await expect(page.getByText(partnerCo)).toBeVisible();
      await expect(page.getByText(eventCo)).not.toBeVisible();

      await page.getByRole("button", { name: "Clear all" }).click();
      await expect(page.getByText(eventCo)).toBeVisible();
      await expect(page).toHaveURL(/\/pipeline$/);
    });
  });
});

test.describe("Contacts", () => {
  // RLS: a rep only sees contacts they own, so seed one for the E2E rep
  const contactName = `${TEST_DEAL_PREFIX} Contact Person`;

  test.beforeAll(async () => {
    const admin = adminClient();
    await admin.from("contacts").insert({
      name: contactName,
      email: "autotest-contact@gt-hq.com",
      title: "QA Champion",
      stage: "connection",
      owner_code: "E2E",
    });
  });

  test("book search opens the contact record with its sections", async ({
    page,
  }) => {
    await page.goto("/contacts");
    await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible();

    await page.getByPlaceholder(/search contacts/i).fill(contactName);
    const cell = page.getByRole("cell", { name: contactName }).first();
    await expect(cell).toBeVisible();

    // row opens the editable contact record
    await cell.click();
    await expect(page.getByText("Contact record")).toBeVisible();
    await expect(page.getByText(/^Deal$/)).toBeVisible();
    await expect(page.getByText(/^Notes \(/)).toBeVisible();
  });
});

test.describe("Lost", () => {
  test("table sorts by closed date", async ({ page }) => {
    await page.goto("/lost");
    await expect(
      page.getByRole("heading", { name: /deals we lost/i }),
    ).toBeVisible();
    // newest-closed first by default; clicking flips the direction
    const closed = page.getByRole("columnheader", { name: /closed/i });
    await expect(closed).toContainText("▼");
    await closed.click();
    await expect(closed).toContainText("▲");
  });
});

test.describe("Scorecard", () => {
  test("date range presets drive the dated numbers", async ({ page }) => {
    await page.goto("/scorecard");
    await expect(page.getByRole("heading", { name: "Scorecard" })).toBeVisible();
    // the dated tiles (the funnel repeats "Leads added" as a bar label)
    const tiles = page.locator(".stat .label");
    await expect(tiles.filter({ hasText: "Leads added" })).toBeVisible();
    await expect(tiles.filter({ hasText: "New clients" })).toBeVisible();
    await page.getByRole("button", { name: "This quarter" }).click();
    await expect(page).toHaveURL(/range=quarter/);
    await expect(page.getByRole("button", { name: "This quarter" })).toHaveClass(
      /on/,
    );
    // custom range shows the two date pickers
    await page.getByRole("button", { name: "Custom" }).click();
    await expect(page.getByLabel("From", { exact: true })).toBeVisible();
    await expect(page.getByLabel("To", { exact: true })).toBeVisible();
  });
});

test.describe("Companies", () => {
  test("client status columns and filter", async ({ page }) => {
    await page.goto("/companies");
    await expect(
      page.getByRole("columnheader", { name: /client type/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: /client since/i }),
    ).toBeVisible();
    // filter to clients only: every visible tag reads Existing Client
    await page.getByRole("button", { name: "Existing Client", exact: true }).click();
    await expect(page.getByText(/matches\.$/)).toBeVisible();
    const tags = page.locator("tbody td:nth-child(2)");
    await expect(tags.first()).toHaveText("Existing Client");
    await expect(tags.filter({ hasNotText: "Existing Client" })).toHaveCount(0);
  });

  test("book lists imported companies and opens the company record", async ({
    page,
  }) => {
    await page.goto("/companies");
    await expect(
      page.getByRole("heading", { name: "Companies" }),
    ).toBeVisible();

    // search the whole book for a company imported from HubSpot
    await page.getByPlaceholder(/search companies/i).fill("Cyera");
    const cell = page.getByRole("cell", { name: /cyera/i }).first();
    await expect(cell).toBeVisible();

    // row opens the company record with its deals / contacts / notes sections
    await cell.click();
    await expect(page.getByText("Company record")).toBeVisible();
    await expect(page.getByText(/^Deals \(/)).toBeVisible();
    await expect(page.getByText(/^Contacts \(/)).toBeVisible();
    await expect(page.getByText(/^Notes \(/)).toBeVisible();
    // client status is editable on the record
    await expect(page.getByLabel("Client type")).toBeVisible();
    await expect(
      page.getByRole("complementary").getByText("Client since"),
    ).toBeVisible();
  });
});

test.describe("Create a deal (end-to-end, self-cleaning)", () => {
  test("add a deal from My Week and find it on the pipeline", async ({
    page,
  }) => {
    const company = `${TEST_DEAL_PREFIX} ${Date.now()}`;

    await page.goto("/");
    await page.getByRole("button", { name: /add deal/i }).click();
    const dialog = page.getByRole("dialog", { name: /add deal/i });
    await dialog.getByPlaceholder("Acme Corp").fill(company);
    await dialog.getByRole("button", { name: "Add deal", exact: true }).click();
    await expect(dialog).not.toBeVisible();

    // it persisted — poll (write latency / refresh can lag the modal close)
    const admin = adminClient();
    await expect
      .poll(
        async () => {
          const { count } = await admin
            .from("deals")
            .select("*", { count: "exact", head: true })
            .eq("company", company);
          return count ?? 0;
        },
        { message: "deal was not persisted", timeout: 10_000 },
      )
      .toBeGreaterThan(0);
    // …with today's first-touch date (mandatory since 0017)
    const { data: saved } = await admin
      .from("deals")
      .select("first_touch_date")
      .eq("company", company)
      .single();
    expect(saved?.first_touch_date).toBe(new Date().toISOString().slice(0, 10));

    // and it's findable on the board via search
    await page.goto("/pipeline");
    await page.getByPlaceholder(/search deals/i).fill(company);
    await expect(page.getByText(company)).toBeVisible();
  });
});
