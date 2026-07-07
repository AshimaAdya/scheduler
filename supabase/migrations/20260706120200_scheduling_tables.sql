-- ─────────────────────────────────────────────────────────────────────────────
-- Scheduling tables: shift_templates, schedules, shifts, shift_assignments
--
-- Model: a shift_template row describes weekly demand for ONE skill at ONE
-- location on ONE weekday (with a headcount). Generating a week expands each
-- template into `headcount` concrete `shifts` — one seat per shift row — so an
-- unfilled seat is simply a shift with no shift_assignment.
-- ─────────────────────────────────────────────────────────────────────────────

create table shift_templates (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null default '00000000-0000-0000-0000-000000000001'
                   references businesses(id) on delete cascade,
  location_id    uuid not null references locations(id) on delete cascade,
  weekday        smallint not null check (weekday between 0 and 6),
  -- Wall-clock demand window in the business timezone (see availability note).
  start_time     time not null,
  end_time       time not null,
  required_skill text not null,
  headcount      int not null default 1 check (headcount > 0),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint shift_templates_time_order check (start_time < end_time)
);

create table schedules (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null default '00000000-0000-0000-0000-000000000001'
                 references businesses(id) on delete cascade,
  location_id  uuid not null references locations(id) on delete cascade,
  week_start   date not null,
  status       schedule_status not null default 'draft',
  generated_at timestamptz,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- One schedule per location per week.
  constraint schedules_location_week_key unique (location_id, week_start)
);

create table shifts (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null default '00000000-0000-0000-0000-000000000001'
                   references businesses(id) on delete cascade,
  schedule_id    uuid not null references schedules(id) on delete cascade,
  location_id    uuid not null references locations(id) on delete cascade,
  -- NULL when a shift was added manually rather than generated from a template.
  template_id    uuid references shift_templates(id) on delete set null,
  -- Concrete UTC instants. Rendered in the business timezone in the UI.
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  required_skill text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint shifts_time_order check (ends_at > starts_at)
);

create table shift_assignments (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null default '00000000-0000-0000-0000-000000000001'
                  references businesses(id) on delete cascade,
  -- One seat = one shift = at most one assignment.
  shift_id      uuid not null unique references shifts(id) on delete cascade,
  employee_id   uuid not null references employees(id) on delete restrict,
  assigned_via  assignment_source not null default 'generator',
  -- true when an employee claimed an open shift and it awaits manager sign-off
  -- (approval_mode = require_approval).
  pending_approval boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
