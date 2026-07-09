-- ─────────────────────────────────────────────────────────────────────────────
-- RLS helper functions
--
-- These resolve the caller (auth.uid()) to their employee identity / role, and
-- are used by the policies in the next migration. They are SECURITY DEFINER so
-- that when called from inside an RLS policy on `employees` they read the table
-- WITHOUT re-triggering that policy — avoiding infinite recursion. `search_path`
-- is pinned to '' and every reference is schema-qualified to prevent hijacking.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.app_current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id from public.employees e where e.user_id = (select auth.uid());
$$;

create or replace function public.app_current_business_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.business_id from public.employees e where e.user_id = (select auth.uid());
$$;

create or replace function public.app_current_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select e.role from public.employees e where e.user_id = (select auth.uid());
$$;

create or replace function public.app_is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.employees e
    where e.user_id = (select auth.uid())
      and e.role in ('manager', 'admin')
  );
$$;

create or replace function public.app_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.employees e
    where e.user_id = (select auth.uid())
      and e.role = 'admin'
  );
$$;

-- Encapsulates domain invariant #3 at the row level for `shifts`: an employee
-- may see a shift only if it is in a PUBLISHED schedule AND it is either
-- unassigned (an open shift they could claim) or assigned to themselves. Runs as
-- definer so the "unassigned" check sees ALL assignments (not just the caller's
-- own, which their shift_assignments RLS would otherwise be limited to) — closing
-- the leak where a shift assigned to someone else would look "open".
create or replace function public.app_employee_can_see_shift(p_shift_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.shifts sh
    join public.schedules sc on sc.id = sh.schedule_id
    where sh.id = p_shift_id
      and sc.status = 'published'
      and (
        not exists (
          select 1 from public.shift_assignments a where a.shift_id = sh.id
        )
        or exists (
          select 1 from public.shift_assignments a
          where a.shift_id = sh.id
            and a.employee_id = public.app_current_employee_id()
        )
      )
  );
$$;

grant execute on function
  public.app_current_employee_id(),
  public.app_current_business_id(),
  public.app_current_role(),
  public.app_is_manager_or_admin(),
  public.app_is_admin(),
  public.app_employee_can_see_shift(uuid)
to authenticated, service_role;
