-- ─────────────────────────────────────────────────────────────────────────────
-- coverage_audit_log (SCH-18)
--
-- Every coverage-request state change is recorded here by the single
-- transition() function (lib/coverage/transition.ts). Gives a full history of
-- how each request moved through open → tier1_broadcast → tier2_broadcast →
-- escalated → covered | cancelled | manager_resolved, and who acted.
-- ─────────────────────────────────────────────────────────────────────────────

create table coverage_audit_log (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null default '00000000-0000-0000-0000-000000000001'
                        references businesses(id) on delete cascade,
  coverage_request_id uuid references coverage_requests(id) on delete cascade,
  from_status         coverage_status,
  to_status           coverage_status not null,
  actor_employee_id   uuid references employees(id) on delete set null,
  detail              jsonb,
  created_at          timestamptz not null default now()
);

create index coverage_audit_log_request_id_idx on coverage_audit_log (coverage_request_id);
create index coverage_audit_log_business_id_idx on coverage_audit_log (business_id);

-- This Supabase version does not auto-expose new tables — grant explicitly.
grant all on table coverage_audit_log to service_role;
grant select, insert on table coverage_audit_log to authenticated;

alter table coverage_audit_log enable row level security;

-- Managers/admins read + append within their business; service_role bypasses.
create policy coverage_audit_select on coverage_audit_log
  for select to authenticated
  using (business_id = public.app_current_business_id() and public.app_is_manager_or_admin());

create policy coverage_audit_insert on coverage_audit_log
  for insert to authenticated
  with check (business_id = public.app_current_business_id() and public.app_is_manager_or_admin());
