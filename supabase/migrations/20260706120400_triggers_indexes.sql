-- ─────────────────────────────────────────────────────────────────────────────
-- Shared triggers + indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- Keep updated_at current on every row update.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'businesses', 'locations', 'employees', 'availability_rules',
    'shift_templates', 'schedules', 'shifts', 'shift_assignments',
    'coverage_requests', 'coverage_offers', 'notifications_log'
  ]
  loop
    execute format(
      'create trigger %I_set_updated_at
         before update on %I
         for each row execute function set_updated_at()',
      t, t
    );
  end loop;
end;
$$;

-- ── Foreign-key / lookup indexes ────────────────────────────────────────────
-- business_id on every table (queries are always tenant-scoped).
create index locations_business_id_idx          on locations (business_id);
create index employees_business_id_idx          on employees (business_id);
create index employees_user_id_idx              on employees (user_id);
create index employees_home_location_id_idx     on employees (home_location_id);
create index availability_rules_business_id_idx on availability_rules (business_id);
create index availability_rules_employee_id_idx on availability_rules (employee_id);
create index shift_templates_business_id_idx    on shift_templates (business_id);
create index shift_templates_location_id_idx    on shift_templates (location_id);
create index schedules_business_id_idx          on schedules (business_id);
create index schedules_location_id_idx          on schedules (location_id);
create index shifts_business_id_idx             on shifts (business_id);
create index shifts_schedule_id_idx             on shifts (schedule_id);
create index shifts_location_starts_idx         on shifts (location_id, starts_at);
create index shift_assignments_business_id_idx  on shift_assignments (business_id);
create index shift_assignments_employee_id_idx  on shift_assignments (employee_id);
create index coverage_requests_business_id_idx  on coverage_requests (business_id);
create index coverage_requests_shift_id_idx     on coverage_requests (shift_id);
create index coverage_requests_requested_by_idx on coverage_requests (requested_by);
-- Cron sweep (SCH-19): find in-flight broadcasts whose tier window has expired.
create index coverage_requests_tier_sweep_idx
  on coverage_requests (status, tier_expires_at)
  where status in ('tier1_broadcast', 'tier2_broadcast');
create index coverage_offers_business_id_idx    on coverage_offers (business_id);
create index coverage_offers_request_id_idx     on coverage_offers (coverage_request_id);
create index coverage_offers_employee_id_idx    on coverage_offers (employee_id);
create index notifications_log_business_id_idx  on notifications_log (business_id);
create index notifications_log_recipient_idx    on notifications_log (recipient_employee_id);
create index notifications_log_request_id_idx   on notifications_log (coverage_request_id);
