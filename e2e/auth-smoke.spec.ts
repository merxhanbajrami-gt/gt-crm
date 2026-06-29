import { test, expect } from "@playwright/test";

// Unauthenticated smoke tests. The app uses magic-link auth, so these cover the
// public surface — which is exactly where our redirect regressions lived
// (callback + signout pointing at the internal localhost:10000 behind Render's
// proxy). The host assertions below would have caught both bugs.

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "https://gt-crm.onrender.com";
const host = new URL(baseURL).host;

test.describe("login page", () => {
  test("renders the sign-in form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Your week, in one view.")).toBeVisible();
    await expect(page.getByPlaceholder("you@gt-hq.com")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /sign-in link/i }),
    ).toBeVisible();
  });

  test("blocks an invalid email client-side", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("you@gt-hq.com").fill("not-an-email");
    await page.getByRole("button", { name: /sign-in link/i }).click();
    // HTML5 validation stops submission: still on /login, no "check inbox" state
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole("button", { name: /sign-in link/i }),
    ).toBeVisible();
  });
});

test.describe("auth guard", () => {
  for (const path of ["/", "/pipeline", "/contacts", "/scorecard", "/lost"]) {
    test(`unauthenticated ${path} redirects to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});

test.describe("auth redirects stay on the configured host (regression guard)", () => {
  test("callback with no params -> /login on the same host", async ({
    request,
  }) => {
    const res = await request.get("/auth/callback", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    const loc = res.headers()["location"] ?? "";
    expect(loc).toContain(host);
    expect(loc).not.toContain("localhost:10000");
    expect(loc).toContain("error=");
  });

  test("signout -> /login on the same host", async ({ request }) => {
    const res = await request.post("/auth/signout", { maxRedirects: 0 });
    expect(res.status()).toBe(303);
    const loc = res.headers()["location"] ?? "";
    expect(loc).toContain(`${host}/login`);
    expect(loc).not.toContain("localhost:10000");
  });

  test("spoofed x-forwarded-host is not honored (no open redirect)", async ({
    request,
  }) => {
    const res = await request.get("/auth/callback", {
      maxRedirects: 0,
      headers: { "x-forwarded-host": "evil.example.com" },
    });
    const loc = res.headers()["location"] ?? "";
    expect(loc).not.toContain("evil.example.com");
  });
});
