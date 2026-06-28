# GT / OS — internal CRM

A lightweight internal CRM for GT-HQ, replacing HubSpot. Sales pipeline, contacts,
lost-deal analysis, and a founder scorecard — built for GT employees only.

## Architecture (the short version)

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 16 (App Router, TS strict) | Server components + the existing GT/OS design |
| Backend | **Supabase only** — no FastAPI | Postgres + auto API + RLS + Auth cover everything at this scale |
| Data API | PostgREST (auto) + Postgres views/RPCs | CRUD is free; scorecard aggregations are SQL views |
| Auth | Supabase Auth + Google Workspace SSO | Everyone has a Google account; domain-restricted to GT-HQ |
| AuthZ | Row Level Security + JWT role claim | `manager` sees all, `rep` sees own — enforced in the DB |
| Runtime | Bun | Org standard |
| Deploy | Render native Node web service (no Docker) | Render runs Next.js + Bun natively; simpler to maintain |

Roles: `admin`, `manager` (founder/director view — sees everything), `rep` (sees and
edits only their own deals, matched by `rep_code`).

## Local development

```bash
bun install
cp .env.example .env.local   # fill in your Supabase keys
bun run dev                  # http://localhost:3000
```

## Supabase setup (one time)

1. Create a project at supabase.com. Copy the URL + anon key + service-role key
   from **Project Settings → API** into `.env.local`.
2. Apply the schema (SQL Editor, in order):
   `supabase/migrations/0001_init.sql` → `0002_rls.sql` → `0003_auth_hooks.sql` → `0004_scorecard.sql`
3. Load the seed data (294 deals + 3,653 contacts from the original export):
   - regenerate it with `bun run scripts/extract-seed.mjs` (reads the prototype HTML), then
   - run `supabase/seed/seed.sql` in the SQL Editor.
4. **Authentication → Providers → Google**: enable it and paste your Google OAuth
   client ID + secret. In Google Cloud Console the **authorized redirect URI must be
   Supabase's** callback: `https://<project-ref>.supabase.co/auth/v1/callback`
   (Supabase handles the OAuth dance, then bounces back to the app).
   Then under **Authentication → URL Configuration**, set the Site URL and add
   `https://<your-app>/auth/callback` (and `http://localhost:3000/auth/callback`
   for dev) to the **Redirect URLs** allowlist.
5. **Authentication → Hooks**:
   - *Before user created* → `hook_restrict_signup_by_email_domain` (locks sign-in to `gt-hq.com`)
   - *Custom access token* → `custom_access_token_hook` (puts the role in the JWT)
6. Change the allowed domain anytime: edit `public.signup_email_domains`.

## Assigning roles & linking reps

New users default to `rep`. To make someone a manager and link them to their deals:

```sql
update public.user_roles set role = 'manager' where user_id = '<uuid>';
update public.profiles set rep_code = 'JO' where id = '<uuid>';  -- their initials in the deal data
```

Role changes take effect on the user's next token refresh.

## Deploy to Render

1. Push this repo to GitHub.
2. Render → **New → Blueprint**, point it at the repo (uses `render.yaml`).
3. Set the three secrets in the Render dashboard:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
4. Add the deployed URL's `/auth/callback` to Google OAuth and Supabase redirect URLs.

The Blueprint runs on the **Starter** plan (always-on, no cold starts).

## Security notes

- The anon key is safe in the browser **only because RLS is on every table**.
- The service-role key bypasses RLS — it is server-only and never prefixed with `NEXT_PUBLIC_`.
- Internal-only access is enforced server-side by the domain allowlist hook, not just
  the Google domain hint.

## Project layout

```
src/app/(app)/      authed views: My Week (/), pipeline, lost, contacts, scorecard
src/app/login       Google sign-in
src/app/auth        OAuth callback + sign-out
src/lib/supabase    browser / server / admin / proxy clients
src/lib/session.ts  resolves the current user + role + rep_code
src/proxy.ts        session refresh + route gating (Next 16 proxy)
supabase/migrations schema, RLS, auth hooks, scorecard views
supabase/seed       generated seed data
scripts             seed extractor
```
