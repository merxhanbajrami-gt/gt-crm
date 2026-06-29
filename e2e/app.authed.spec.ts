import { test, expect } from "@playwright/test";
import { adminClient, TEST_DEAL_PREFIX } from "./_admin";

// These tests share one user session and one (prod) database, so run them
// serially — parallel workers racing the same session/DB cause flaky writes.
test.describe.configure({ mode: "serial" });

// Runs with the saved rep session (see auth.setup.ts). Any deal these tests
// create is named with TEST_DEAL_PREFIX and wiped in afterAll so prod stays clean.

test.afterAll(async () => {
  await adminClient()
    .from("deals")
    .delete()
    .like("company", `${TEST_DEAL_PREFIX}%`);
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
    // close without creating anything
    await dialog.getByRole("button", { name: /close/i }).click();
    await expect(dialog).not.toBeVisible();
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

    // and it's findable on the board via search
    await page.goto("/pipeline");
    await page.getByPlaceholder(/search deals/i).fill(company);
    await expect(page.getByText(company)).toBeVisible();
  });
});
