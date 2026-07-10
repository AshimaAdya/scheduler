-- ─────────────────────────────────────────────────────────────────────────────
-- Custom access token hook (SCH-8)
--
-- Injects the caller's employee role into their JWT as a `user_role` claim on
-- every token issuance, read fresh from employees.role (the source of truth) —
-- so the role in the session is never stale. Enabled via config.toml
-- ([auth.hook.custom_access_token]).
--
-- The hook runs as the `supabase_auth_admin` role. It is granted SELECT on
-- employees plus a dedicated RLS policy so it can read roles; execute is revoked
-- from application roles so only the auth system can call it.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims   jsonb;
  emp_role public.user_role;
begin
  select e.role
    into emp_role
    from public.employees e
   where e.user_id = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';

  if emp_role is not null then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(emp_role::text));
  else
    claims := jsonb_set(claims, '{user_role}', 'null'::jsonb);
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- Only the auth system may run the hook.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- Let the auth admin read roles (RLS would otherwise block it).
grant select on table public.employees to supabase_auth_admin;

create policy employees_auth_admin_read on public.employees
  as permissive for select to supabase_auth_admin
  using (true);
