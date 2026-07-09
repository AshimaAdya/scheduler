-- ─────────────────────────────────────────────────────────────────────────────
-- Row-level security policies (SCH-7)
--
-- Enables RLS on all 11 tables and grants access per role. Default-deny: a table
-- with RLS on and no matching policy denies the operation.
--
-- Roles:
--   * authenticated (a logged-in user) — governed by the policies below, keyed
--     off their linked employee row via the app_* helper functions.
--   * anon — no policies → no access.
--   * service_role — BYPASSRLS; the server uses it for privileged operations
--     (notification logging, cron tier advancement, atomic claim resolution).
--
-- Implements domain invariant #3: employees can never read another employee's
-- assignments, availability, or full schedule. Controlled disclosure of coworker
-- *eligibility* for a specific shift (name + "available for shift X") is delivered
-- later via a dedicated SECURITY DEFINER RPC (SCH-17), NOT by loosening these
-- table policies.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Table-level grants for the API roles ─────────────────────────────────────
-- This Postgres/Supabase version does NOT auto-expose new tables, so the API
-- roles need explicit table privileges. These govern TABLE-level access; the RLS
-- policies below govern which ROWS an authenticated user actually sees.
-- service_role additionally has BYPASSRLS (full server-side access).
-- anon is intentionally granted nothing.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ── businesses ───────────────────────────────────────────────────────────────
alter table businesses enable row level security;

create policy businesses_select on businesses
  for select to authenticated
  using (id = public.app_current_business_id());

create policy businesses_update on businesses
  for update to authenticated
  using (id = public.app_current_business_id() and public.app_is_manager_or_admin())
  with check (id = public.app_current_business_id() and public.app_is_manager_or_admin());

-- ── locations ────────────────────────────────────────────────────────────────
alter table locations enable row level security;

create policy locations_select on locations
  for select to authenticated
  using (business_id = public.app_current_business_id());

create policy locations_write on locations
  for all to authenticated
  using (business_id = public.app_current_business_id() and public.app_is_manager_or_admin())
  with check (business_id = public.app_current_business_id() and public.app_is_manager_or_admin());

-- ── employees ────────────────────────────────────────────────────────────────
-- Employees read ONLY their own row (no coworker rows). No employee writes at all
-- (prevents self role-escalation); managers/admins do all employee CRUD.
alter table employees enable row level security;

create policy employees_select on employees
  for select to authenticated
  using (
    id = public.app_current_employee_id()
    or (business_id = public.app_current_business_id() and public.app_is_manager_or_admin())
  );

create policy employees_write on employees
  for all to authenticated
  using (business_id = public.app_current_business_id() and public.app_is_manager_or_admin())
  with check (business_id = public.app_current_business_id() and public.app_is_manager_or_admin());

-- ── availability_rules ───────────────────────────────────────────────────────
-- Employees read + write their OWN availability only. Managers/admins all.
alter table availability_rules enable row level security;

create policy availability_select on availability_rules
  for select to authenticated
  using (
    employee_id = public.app_current_employee_id()
    or (business_id = public.app_current_business_id() and public.app_is_manager_or_admin())
  );

create policy availability_write on availability_rules
  for all to authenticated
  using (
    employee_id = public.app_current_employee_id()
    or (business_id = public.app_current_business_id() and public.app_is_manager_or_admin())
  )
  with check (
    employee_id = public.app_current_employee_id()
    or (business_id = public.app_current_business_id() and public.app_is_manager_or_admin())
  );

-- ── shift_templates ──────────────────────────────────────────────────────────
-- Managers/admins only; employees have no access.
alter table shift_templates enable row level security;

create policy shift_templates_all on shift_templates
  for all to authenticated
  using (business_id = public.app_current_business_id() and public.app_is_manager_or_admin())
  with check (business_id = public.app_current_business_id() and public.app_is_manager_or_admin());

-- ── schedules ────────────────────────────────────────────────────────────────
-- Employees read PUBLISHED schedules only; managers/admins all (incl. draft).
alter table schedules enable row level security;

create policy schedules_select on schedules
  for select to authenticated
  using (
    business_id = public.app_current_business_id()
    and (public.app_is_manager_or_admin() or status = 'published')
  );

create policy schedules_write on schedules
  for all to authenticated
  using (business_id = public.app_current_business_id() and public.app_is_manager_or_admin())
  with check (business_id = public.app_current_business_id() and public.app_is_manager_or_admin());

-- ── shifts ───────────────────────────────────────────────────────────────────
-- Employees: own-assigned + open (unassigned) shifts in published schedules only.
-- Managers/admins: all shifts in business.
alter table shifts enable row level security;

create policy shifts_select on shifts
  for select to authenticated
  using (
    business_id = public.app_current_business_id()
    and (public.app_is_manager_or_admin() or public.app_employee_can_see_shift(id))
  );

create policy shifts_write on shifts
  for all to authenticated
  using (business_id = public.app_current_business_id() and public.app_is_manager_or_admin())
  with check (business_id = public.app_current_business_id() and public.app_is_manager_or_admin());

-- ── shift_assignments ────────────────────────────────────────────────────────
-- Employees read their OWN assignments only (invariant #3). Managers/admins all.
alter table shift_assignments enable row level security;

create policy shift_assignments_select on shift_assignments
  for select to authenticated
  using (
    employee_id = public.app_current_employee_id()
    or (business_id = public.app_current_business_id() and public.app_is_manager_or_admin())
  );

create policy shift_assignments_write on shift_assignments
  for all to authenticated
  using (business_id = public.app_current_business_id() and public.app_is_manager_or_admin())
  with check (business_id = public.app_current_business_id() and public.app_is_manager_or_admin());

-- ── coverage_requests ────────────────────────────────────────────────────────
-- Employees read requests they're involved in and may create their own. Status
-- transitions (update/delete) are manager/service-role territory.
alter table coverage_requests enable row level security;

create policy coverage_requests_select on coverage_requests
  for select to authenticated
  using (
    (business_id = public.app_current_business_id() and public.app_is_manager_or_admin())
    or requested_by = public.app_current_employee_id()
    or target_employee_id = public.app_current_employee_id()
    or covered_by = public.app_current_employee_id()
    or exists (
      select 1 from public.coverage_offers o
      where o.coverage_request_id = coverage_requests.id
        and o.employee_id = public.app_current_employee_id()
    )
  );

create policy coverage_requests_insert on coverage_requests
  for insert to authenticated
  with check (
    business_id = public.app_current_business_id()
    and (public.app_is_manager_or_admin() or requested_by = public.app_current_employee_id())
  );

create policy coverage_requests_update on coverage_requests
  for update to authenticated
  using (business_id = public.app_current_business_id() and public.app_is_manager_or_admin())
  with check (business_id = public.app_current_business_id() and public.app_is_manager_or_admin());

create policy coverage_requests_delete on coverage_requests
  for delete to authenticated
  using (business_id = public.app_current_business_id() and public.app_is_manager_or_admin());

-- ── coverage_offers ──────────────────────────────────────────────────────────
-- Employees read + respond to (update) their OWN offers. Broadcast creation
-- (insert) and deletion are manager/service-role.
alter table coverage_offers enable row level security;

create policy coverage_offers_select on coverage_offers
  for select to authenticated
  using (
    employee_id = public.app_current_employee_id()
    or (business_id = public.app_current_business_id() and public.app_is_manager_or_admin())
  );

create policy coverage_offers_update on coverage_offers
  for update to authenticated
  using (
    employee_id = public.app_current_employee_id()
    or (business_id = public.app_current_business_id() and public.app_is_manager_or_admin())
  )
  with check (
    employee_id = public.app_current_employee_id()
    or (business_id = public.app_current_business_id() and public.app_is_manager_or_admin())
  );

create policy coverage_offers_insert on coverage_offers
  for insert to authenticated
  with check (business_id = public.app_current_business_id() and public.app_is_manager_or_admin());

create policy coverage_offers_delete on coverage_offers
  for delete to authenticated
  using (business_id = public.app_current_business_id() and public.app_is_manager_or_admin());

-- ── notifications_log ────────────────────────────────────────────────────────
-- Read-only audit trail: employees see their own; managers/admins see all.
-- No write policies → only service_role (BYPASSRLS) writes the log.
alter table notifications_log enable row level security;

create policy notifications_log_select on notifications_log
  for select to authenticated
  using (
    recipient_employee_id = public.app_current_employee_id()
    or (business_id = public.app_current_business_id() and public.app_is_manager_or_admin())
  );
