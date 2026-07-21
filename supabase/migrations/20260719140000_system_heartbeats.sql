-- ─────────────────────────────────────────────────────────────────────────────
-- System heartbeats (SCH-31) — the dead-man switch store. The tier-timer cron
-- (SCH-23) stamps its last run here every 2 minutes; the health endpoint reports
-- the coverage engine as degraded once that stamp is older than the threshold,
-- which is the alert condition when the cron stops running.
-- ─────────────────────────────────────────────────────────────────────────────

create table system_heartbeats (
  key         text primary key,
  last_run_at timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Service-role writes (the cron); managers/admins may read for a status page.
grant all on table system_heartbeats to service_role;
grant select on table system_heartbeats to authenticated;

alter table system_heartbeats enable row level security;

create policy system_heartbeats_select on system_heartbeats
  for select to authenticated
  using (public.app_is_manager_or_admin());
