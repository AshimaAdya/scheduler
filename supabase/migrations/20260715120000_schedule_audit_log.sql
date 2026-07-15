-- ─────────────────────────────────────────────────────────────────────────────
-- schedule_audit_log (SCH-14)
--
-- Append-only trail of schedule lifecycle events: generated, published, and any
-- edit to a PUBLISHED schedule (reassignments). Lets managers see who changed a
-- live schedule and when.
-- ─────────────────────────────────────────────────────────────────────────────

create table schedule_audit_log (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null default '00000000-0000-0000-0000-000000000001'
                      references businesses(id) on delete cascade,
  schedule_id       uuid references schedules(id) on delete cascade,
  actor_employee_id uuid references employees(id) on delete set null,
  action            text not null,   -- 'generated' | 'published' | 'edited'
  detail            jsonb,
  created_at        timestamptz not null default now()
);

create index schedule_audit_log_schedule_id_idx on schedule_audit_log (schedule_id);
create index schedule_audit_log_business_id_idx on schedule_audit_log (business_id);

-- This Supabase version does not auto-expose new tables — grant explicitly.
grant all on table schedule_audit_log to service_role;
grant select, insert on table schedule_audit_log to authenticated;

alter table schedule_audit_log enable row level security;

-- Managers/admins read and append within their business; service_role bypasses.
create policy schedule_audit_select on schedule_audit_log
  for select to authenticated
  using (business_id = public.app_current_business_id() and public.app_is_manager_or_admin());

create policy schedule_audit_insert on schedule_audit_log
  for insert to authenticated
  with check (business_id = public.app_current_business_id() and public.app_is_manager_or_admin());
