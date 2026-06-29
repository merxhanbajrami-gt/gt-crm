import { test as setup, expect } from "@playwright/test";
import { adminClient, TEST_EMAIL } from "./_admin";

const AUTH_FILE = "e2e/.auth/user.json";

// Establishes an authenticated session without the email round-trip:
//   1. ensure a confirmed @gt-hq.com test user exists — a least-privilege
//      'rep' (the default the handle_new_user trigger provisions); we only set
//      its profile name + rep_code 'E2E' so it can own/see its own deals;
//   2. mint a magic-link token via the admin API and complete it through the
//      app's real /auth/callback so the app sets its own session cookies;
//   3. persist those cookies as storageState for the authed project.
setup("authenticate", async ({ page }) => {
  const admin = adminClient();

  // 1. ensure the test user exists + is confirmed
  let userId: string | undefined;
  const created = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    email_confirm: true,
    user_metadata: { full_name: "E2E Tester" },
  });
  userId = created.data.user?.id;
  if (!userId) {
    const { data } = await admin.auth.admin.listUsers();
    userId = data.users.find((u) => u.email === TEST_EMAIL)?.id;
  }
  expect(userId, "could not create/find the test user").toBeTruthy();

  // profile name + rep_code only — role stays the default 'rep' (no elevation)
  await admin.from("profiles").upsert({
    id: userId!,
    email: TEST_EMAIL,
    full_name: "E2E Tester",
    rep_code: "E2E",
  });

  // 2. mint a magic-link token and complete it through the real callback
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: TEST_EMAIL,
  });
  expect(error, error?.message).toBeFalsy();
  const tokenHash = link.properties?.hashed_token;
  expect(tokenHash, "no hashed_token from generateLink").toBeTruthy();

  await page.goto(`/auth/callback?token_hash=${tokenHash}&type=magiclink`);

  // landed in the app authenticated (not bounced to /login?error=…)
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();

  // 3. persist the session
  await page.context().storageState({ path: AUTH_FILE });
});
