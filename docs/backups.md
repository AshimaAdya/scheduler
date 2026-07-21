# Database backups + restore (SCH-31)

Before any real employee data lands, backups must be on and a restore proven.

## Enable (do before the pilot)

- [ ] Upgrade the Supabase project to a **paid plan** (Free has no automated
      backups).
- [ ] Confirm **daily backups** are enabled (Supabase → Database → Backups).
- [ ] If available on the plan, enable **Point-in-Time Recovery (PITR)** for
      finer-grained restore.
- [ ] Record where backups live and the retention window in the runbook below.

## Restore runbook (test once — AC)

1. Create a **scratch Supabase project** (do NOT restore over production).
2. Download the latest daily backup from the production project.
3. Restore it into the scratch project (`supabase db dump` / dashboard restore, or
   `psql` the backup into the scratch DB).
4. Verify integrity: row counts on `employees`, `schedules`, `shifts`,
   `coverage_requests`; spot-check a covered request's `coverage_audit_log` trail.
5. Confirm migrations line up: `supabase migration list` against the scratch DB.
6. Record the restore date + duration here; delete the scratch project.

- [ ] **Restore tested on:** ____________ (owner: __________)

## Notes

- Migrations are the source of truth for schema; `supabase/migrations/` +
  `supabase/seed.sql` recreate a blank environment. Backups protect **data**, not
  schema.
- Never commit real backups or dumps (they contain PII). `.env*` and dumps are
  gitignored.
