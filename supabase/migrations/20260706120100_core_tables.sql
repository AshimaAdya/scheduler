-- ─────────────────────────────────────────────────────────────────────────────
-- Core tables: businesses, locations, employees, availability_rules
--
-- Every table (except businesses, the tenant root) carries a business_id that
-- DEFAULTS to a single hardcoded sentinel business. This lets the app stay
-- single-tenant today (inserts can omit business_id) while keeping the door open
-- for real multi-tenancy later without a rewrite.
-- ─────────────────────────────────────────────────────────────────────────────

-- The one business, for now. Referenced as the business_id default everywhere.
-- Kept in sync with supabase/seed.sql and NEXT_PUBLIC / server env.
--   00000000-0000-0000-0000-000000000001

create table businesses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  -- settings jsonb holds approval_mode, timezone, and per-trigger wait-windows.
  -- Shape:
  --   {
  --     "approval_mode": "auto_publish" | "require_approval",
  --     "timezone": "America/Vancouver",
  --     "wait_windows": {
  --       "sick_call": { "tier1_minutes": int, "tier2_minutes": int },
  --       "day_off":   { "tier1_minutes": int, "tier2_minutes": int }
  --     }
  --   }
  settings   jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint businesses_settings_valid check (
    settings ->> 'approval_mode' in ('auto_publish', 'require_approval')
    and settings ? 'timezone'
    and settings ? 'wait_windows'
  )
);

create table locations (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null default '00000000-0000-0000-0000-000000000001'
                references businesses(id) on delete cascade,
  name        text not null,
  address     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table employees (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null default '00000000-0000-0000-0000-000000000001'
                     references businesses(id) on delete cascade,
  -- Links to auth.users. NULL = invited but not yet registered (invite-only signup).
  user_id          uuid unique references auth.users(id) on delete set null,
  full_name        text not null,
  email            text not null,
  phone            text,                          -- E.164, normalized in app on save
  role             user_role not null default 'employee',
  skills           text[] not null default '{}',
  max_weekly_hours numeric(5,2) not null default 40 check (max_weekly_hours >= 0),
  home_location_id uuid references locations(id) on delete set null,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Case-insensitive unique email within a business.
create unique index employees_business_email_key
  on employees (business_id, lower(email));

create table availability_rules (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null default '00000000-0000-0000-0000-000000000001'
                   references businesses(id) on delete cascade,
  employee_id    uuid not null references employees(id) on delete cascade,
  kind           availability_kind not null,

  -- Recurring rows: weekday + time range (wall-clock in the business timezone).
  -- 0 = Sunday ... 6 = Saturday.
  weekday        smallint check (weekday between 0 and 6),

  -- Exception rows: a specific calendar date override.
  exception_date date,

  -- start_time/end_time are naive `time` on purpose: recurring availability is
  -- inherently wall-clock ("Mondays 09:00–17:00"), interpreted in the business
  -- timezone — NOT a UTC instant. This is the one legitimate place naive time
  -- types are correct. See docs/schema.md.
  start_time     time,
  end_time       time,

  -- Recurring rows are windows of availability (true). Exception rows are usually
  -- blackouts (false) but can mark one-off extra availability (true).
  is_available   boolean not null default true,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint availability_recurring_shape check (
    kind <> 'recurring'
    or (weekday is not null and exception_date is null
        and start_time is not null and end_time is not null)
  ),
  constraint availability_exception_shape check (
    kind <> 'exception'
    or (exception_date is not null and weekday is null)
  ),
  constraint availability_time_order check (
    start_time is null or end_time is null or start_time < end_time
  )
);
