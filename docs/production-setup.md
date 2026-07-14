# Production setup & onboarding

Notes for deploying ShiftCover to a real URL. These cover the two things that
work differently in production than in local dev: **sending auth emails** and
**bootstrapping the first admin**. Neither is built yet — this is the checklist.

## 1. Configure email delivery (SMTP) for Supabase Auth

Invite and password-reset emails are sent by Supabase Auth. Locally they're
caught by Mailpit (`http://localhost:54324`); in production they must go to real
inboxes, so Auth needs a real SMTP provider.

- [ ] Set up **Resend** (or another SMTP provider) and get an API key.
- [ ] Configure Supabase Auth SMTP:
  - Hosted Supabase: Project → Authentication → Emails → SMTP settings.
  - Or in `supabase/config.toml` under `[auth.email.smtp]` (currently commented
    out), using `pass = "env(RESEND_API_KEY)"` or the provider's SMTP creds.
- [ ] Set `RESEND_API_KEY` (and any SMTP host/user vars) in the production
      environment — it's a placeholder in `.env.example` today.
- [ ] Confirm the invite email template (`supabase/templates/invite.html`) links
      to the deployed `/auth/confirm` URL (it uses `{{ .SiteURL }}`), and that
      `site_url` / `additional_redirect_urls` in `config.toml` point at the real
      domain, not `127.0.0.1`.
- [ ] Send a test invite to a real address and confirm the link works end to end.

Until SMTP is configured, invite/reset emails silently won't arrive in prod.

## 2. Bootstrap the first admin (per business)

Signup is invite-only, and only a logged-in manager/admin can invite people — so
the **first** admin of a business has to be created out of band, once. This is an
operator action, never a public signup. Pick one:

- **Supabase dashboard (simplest):** Authentication → Add user (create the
  owner's auth account with a password), then in the SQL editor / Table editor
  insert their `employees` row with `role = 'admin'` and set `user_id` to the new
  auth user's id. They can then sign in and invite everyone else.
- **One-time setup script:** the same service-role approach as
  `scripts/dev-login.mjs`, run once against the production database. If reused for
  prod, keep the non-local guard and gate it behind `FORCE_DEV_LOGIN=1`
  deliberately, or better, write a dedicated `scripts/bootstrap-admin.mjs`.
- **Provisioning step (multi-tenant future):** when onboarding a new business,
  the provisioning flow creates that business row + its first admin.

After the first admin exists, onboarding is self-sustaining: **admin → invites
managers → managers invite employees**, all via the normal invite email
(`createEmployee` in the manager UI), with bulk loading via CSV import (SCH-13).

## 3. Local dev only: `npm run dev:login`

`scripts/dev-login.mjs` sets a password on a seeded employee so you can sign in
locally without the email step. It refuses to run against a non-local Supabase
URL. It is a local convenience, not a production mechanism — production uses the
bootstrap above.

```bash
npm run dev:login -- ashima@harbourcoffee.test Password123!
```
