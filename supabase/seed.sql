-- ─────────────────────────────────────────────────────────────────────────────
-- Seed data — loaded by `supabase db reset`.
--
-- 1 business, 2 locations, 12 employees (1 admin, 2 managers, 9 employees) with
-- varied skills, weekly-hour caps, home locations, and availability.
--
-- Fixed UUIDs are used so availability rows can reference employees
-- deterministically and so the sentinel business_id lines up with the column
-- defaults in the migrations.
--
-- employees.user_id is left NULL: these are invited-but-not-yet-registered
-- staff, matching the invite-only signup flow (SCH-8). Auth users get linked
-- when each employee accepts their invite.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Business ─────────────────────────────────────────────────────────────────
insert into businesses (id, name, settings) values (
  '00000000-0000-0000-0000-000000000001',
  'Harbour Coffee Co.',
  jsonb_build_object(
    'approval_mode', 'require_approval',
    'timezone', 'America/Vancouver',
    'wait_windows', jsonb_build_object(
      'sick_call', jsonb_build_object('tier1_minutes', 30,   'tier2_minutes', 30),
      'day_off',   jsonb_build_object('tier1_minutes', 1440, 'tier2_minutes', 1440)
    ),
    'notifications', jsonb_build_object(
      'default_channel', 'both',
      'from_name', 'Harbour Coffee Co.'
    )
  )
);

-- ── Locations ────────────────────────────────────────────────────────────────
insert into locations (id, name, address) values
  ('10000000-0000-0000-0000-000000000001', 'Gastown',    '12 Water St, Vancouver, BC'),
  ('10000000-0000-0000-0000-000000000002', 'Kitsilano',  '2200 W 4th Ave, Vancouver, BC');

-- ── Employees ────────────────────────────────────────────────────────────────
-- Skills vocabulary: barista, cashier, supervisor, baker, cleaner.
insert into employees (id, full_name, email, phone, role, skills, max_weekly_hours, home_location_id, active) values
  -- Admin (owner)
  ('20000000-0000-0000-0000-000000000001', 'Ashima Adya',      'ashima@harbourcoffee.test',  '+16045550101', 'admin',
     array['supervisor','barista','cashier'], 40, '10000000-0000-0000-0000-000000000001', true),

  -- Managers (one per location)
  ('20000000-0000-0000-0000-000000000002', 'Marcus Reyes',     'marcus@harbourcoffee.test',  '+16045550102', 'manager',
     array['supervisor','barista'],          40, '10000000-0000-0000-0000-000000000001', true),
  ('20000000-0000-0000-0000-000000000003', 'Priya Nadeau',     'priya@harbourcoffee.test',   '+16045550103', 'manager',
     array['supervisor','cashier','baker'],  40, '10000000-0000-0000-0000-000000000002', true),

  -- Employees — Gastown-based
  ('20000000-0000-0000-0000-000000000004', 'Liam Chen',        'liam@harbourcoffee.test',    '+16045550104', 'employee',
     array['barista','cashier'],             30, '10000000-0000-0000-0000-000000000001', true),
  ('20000000-0000-0000-0000-000000000005', 'Sofia Martins',    'sofia@harbourcoffee.test',   '+16045550105', 'employee',
     array['barista'],                       24, '10000000-0000-0000-0000-000000000001', true),
  ('20000000-0000-0000-0000-000000000006', 'Noah Williams',    'noah@harbourcoffee.test',    '+16045550106', 'employee',
     array['cashier','cleaner'],             20, '10000000-0000-0000-0000-000000000001', true),
  ('20000000-0000-0000-0000-000000000007', 'Emma Dubois',      'emma@harbourcoffee.test',    '+16045550107', 'employee',
     array['baker','barista'],               35, '10000000-0000-0000-0000-000000000001', true),

  -- Employees — Kitsilano-based
  ('20000000-0000-0000-0000-000000000008', 'Aiden Kaur',       'aiden@harbourcoffee.test',   '+16045550108', 'employee',
     array['barista','supervisor'],          38, '10000000-0000-0000-0000-000000000002', true),
  ('20000000-0000-0000-0000-000000000009', 'Olivia Rossi',     'olivia@harbourcoffee.test',  '+16045550109', 'employee',
     array['cashier'],                       16, '10000000-0000-0000-0000-000000000002', true),
  ('20000000-0000-0000-0000-00000000000a', 'Ethan Park',       'ethan@harbourcoffee.test',   '+16045550110', 'employee',
     array['barista','baker','cleaner'],     32, '10000000-0000-0000-0000-000000000002', true),
  ('20000000-0000-0000-0000-00000000000b', 'Maya Johnson',     'maya@harbourcoffee.test',    '+16045550111', 'employee',
     array['cashier','barista'],             28, '10000000-0000-0000-0000-000000000002', true),
  -- One inactive employee, to exercise "deactivated excluded from scheduling".
  ('20000000-0000-0000-0000-00000000000c', 'Sam Okafor',       'sam@harbourcoffee.test',     '+16045550112', 'employee',
     array['cleaner'],                       12, '10000000-0000-0000-0000-000000000002', false);

-- ── Availability ─────────────────────────────────────────────────────────────
-- Recurring weekly windows (weekday: 0=Sun .. 6=Sat), plus a couple of one-off
-- exceptions. Varied across employees to give the generator something to chew on.

-- Ashima (admin): Mon–Fri mornings
insert into availability_rules (employee_id, kind, weekday, start_time, end_time) values
  ('20000000-0000-0000-0000-000000000001', 'recurring', 1, '07:00', '15:00'),
  ('20000000-0000-0000-0000-000000000001', 'recurring', 2, '07:00', '15:00'),
  ('20000000-0000-0000-0000-000000000001', 'recurring', 3, '07:00', '15:00'),
  ('20000000-0000-0000-0000-000000000001', 'recurring', 4, '07:00', '15:00'),
  ('20000000-0000-0000-0000-000000000001', 'recurring', 5, '07:00', '15:00');

-- Marcus (manager): Mon–Sat full days
insert into availability_rules (employee_id, kind, weekday, start_time, end_time) values
  ('20000000-0000-0000-0000-000000000002', 'recurring', 1, '08:00', '18:00'),
  ('20000000-0000-0000-0000-000000000002', 'recurring', 2, '08:00', '18:00'),
  ('20000000-0000-0000-0000-000000000002', 'recurring', 3, '08:00', '18:00'),
  ('20000000-0000-0000-0000-000000000002', 'recurring', 4, '08:00', '18:00'),
  ('20000000-0000-0000-0000-000000000002', 'recurring', 5, '08:00', '18:00'),
  ('20000000-0000-0000-0000-000000000002', 'recurring', 6, '08:00', '14:00');

-- Priya (manager): Tue–Sat
insert into availability_rules (employee_id, kind, weekday, start_time, end_time) values
  ('20000000-0000-0000-0000-000000000003', 'recurring', 2, '06:00', '14:00'),
  ('20000000-0000-0000-0000-000000000003', 'recurring', 3, '06:00', '14:00'),
  ('20000000-0000-0000-0000-000000000003', 'recurring', 4, '06:00', '14:00'),
  ('20000000-0000-0000-0000-000000000003', 'recurring', 5, '06:00', '14:00'),
  ('20000000-0000-0000-0000-000000000003', 'recurring', 6, '06:00', '14:00');

-- Liam: part-time evenings Wed–Sun
insert into availability_rules (employee_id, kind, weekday, start_time, end_time) values
  ('20000000-0000-0000-0000-000000000004', 'recurring', 3, '15:00', '21:00'),
  ('20000000-0000-0000-0000-000000000004', 'recurring', 4, '15:00', '21:00'),
  ('20000000-0000-0000-0000-000000000004', 'recurring', 5, '15:00', '21:00'),
  ('20000000-0000-0000-0000-000000000004', 'recurring', 6, '09:00', '21:00'),
  ('20000000-0000-0000-0000-000000000004', 'recurring', 0, '09:00', '17:00');

-- Sofia: Mon/Wed/Fri mornings
insert into availability_rules (employee_id, kind, weekday, start_time, end_time) values
  ('20000000-0000-0000-0000-000000000005', 'recurring', 1, '07:00', '12:00'),
  ('20000000-0000-0000-0000-000000000005', 'recurring', 3, '07:00', '12:00'),
  ('20000000-0000-0000-0000-000000000005', 'recurring', 5, '07:00', '12:00');

-- Noah: weekends only
insert into availability_rules (employee_id, kind, weekday, start_time, end_time) values
  ('20000000-0000-0000-0000-000000000006', 'recurring', 6, '08:00', '16:00'),
  ('20000000-0000-0000-0000-000000000006', 'recurring', 0, '08:00', '16:00');

-- Emma: Mon–Thu early (baker)
insert into availability_rules (employee_id, kind, weekday, start_time, end_time) values
  ('20000000-0000-0000-0000-000000000007', 'recurring', 1, '05:00', '13:00'),
  ('20000000-0000-0000-0000-000000000007', 'recurring', 2, '05:00', '13:00'),
  ('20000000-0000-0000-0000-000000000007', 'recurring', 3, '05:00', '13:00'),
  ('20000000-0000-0000-0000-000000000007', 'recurring', 4, '05:00', '13:00');

-- Aiden: Mon–Fri full days
insert into availability_rules (employee_id, kind, weekday, start_time, end_time) values
  ('20000000-0000-0000-0000-000000000008', 'recurring', 1, '08:00', '17:00'),
  ('20000000-0000-0000-0000-000000000008', 'recurring', 2, '08:00', '17:00'),
  ('20000000-0000-0000-0000-000000000008', 'recurring', 3, '08:00', '17:00'),
  ('20000000-0000-0000-0000-000000000008', 'recurring', 4, '08:00', '17:00'),
  ('20000000-0000-0000-0000-000000000008', 'recurring', 5, '08:00', '17:00');

-- Olivia: Sat/Sun short shifts
insert into availability_rules (employee_id, kind, weekday, start_time, end_time) values
  ('20000000-0000-0000-0000-000000000009', 'recurring', 6, '10:00', '14:00'),
  ('20000000-0000-0000-0000-000000000009', 'recurring', 0, '10:00', '14:00');

-- Ethan: Tue–Sat mixed
insert into availability_rules (employee_id, kind, weekday, start_time, end_time) values
  ('20000000-0000-0000-0000-00000000000a', 'recurring', 2, '06:00', '14:00'),
  ('20000000-0000-0000-0000-00000000000a', 'recurring', 3, '06:00', '14:00'),
  ('20000000-0000-0000-0000-00000000000a', 'recurring', 4, '14:00', '21:00'),
  ('20000000-0000-0000-0000-00000000000a', 'recurring', 5, '14:00', '21:00'),
  ('20000000-0000-0000-0000-00000000000a', 'recurring', 6, '08:00', '16:00');

-- Maya: Mon–Fri afternoons
insert into availability_rules (employee_id, kind, weekday, start_time, end_time) values
  ('20000000-0000-0000-0000-00000000000b', 'recurring', 1, '12:00', '20:00'),
  ('20000000-0000-0000-0000-00000000000b', 'recurring', 2, '12:00', '20:00'),
  ('20000000-0000-0000-0000-00000000000b', 'recurring', 3, '12:00', '20:00'),
  ('20000000-0000-0000-0000-00000000000b', 'recurring', 4, '12:00', '20:00'),
  ('20000000-0000-0000-0000-00000000000b', 'recurring', 5, '12:00', '20:00');

-- One-off exceptions (blackouts): Liam unavailable a specific Saturday; Aiden a Friday.
insert into availability_rules (employee_id, kind, exception_date, is_available) values
  ('20000000-0000-0000-0000-000000000004', 'exception', '2026-07-11', false),
  ('20000000-0000-0000-0000-000000000008', 'exception', '2026-07-17', false);
