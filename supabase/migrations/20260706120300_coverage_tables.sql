-- ─────────────────────────────────────────────────────────────────────────────
-- Coverage engine tables: coverage_requests, coverage_offers, notifications_log
--
-- coverage_requests is the heart of the app. All three triggers (sick_call,
-- day_off, direct_swap) run through this one table — "same engine, different
-- trigger". Swap-only columns are nullable and CHECK-guarded to direct_swap.
--
-- DB-LEVEL INVARIANTS enforced here (not just in app code):
--   1. Time-off is never approved before coverage is confirmed
--      → time_off_approved_at may only be set when status = 'covered'.
--   2. A 'covered' request always names its replacement
--      → status = 'covered' requires covered_by NOT NULL.
-- ─────────────────────────────────────────────────────────────────────────────

create table coverage_requests (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null default '00000000-0000-0000-0000-000000000001'
                       references businesses(id) on delete cascade,

  -- The shift needing coverage (for sick_call/day_off) or A's shift (direct_swap).
  shift_id           uuid not null references shifts(id) on delete cascade,
  -- The reporter / requester / swap initiator (A).
  requested_by       uuid not null references employees(id) on delete restrict,

  trigger_type       coverage_trigger_type not null,
  -- Swap-only. NULL for sick_call/day_off.
  trade_type         trade_type,

  status             coverage_status not null default 'open',

  -- The winning replacement. Target of the atomic claim:
  --   UPDATE coverage_requests SET covered_by = :emp, status = 'covered'
  --   WHERE id = :id AND covered_by IS NULL;  -- check affected rows (SCH-18)
  covered_by         uuid references employees(id) on delete restrict,

  -- Direct-swap counterparty (B) and B's shift that A takes (two-way trade).
  target_employee_id uuid references employees(id) on delete restrict,
  offered_shift_id   uuid references shifts(id) on delete set null,

  -- Wait-windows SNAPSHOTTED from businesses.settings at creation time, so
  -- changing settings later never affects in-flight requests.
  tier1_wait_minutes int,
  tier2_wait_minutes int,
  -- Deadline for the CURRENT broadcast tier = now() + that tier's window, set on
  -- entering the tier. The cron sweep (SCH-19) queries this to advance tiers.
  tier_expires_at    timestamptz,

  covered_at           timestamptz,
  -- Invariant-guarded: the moment the absence was finally approved.
  time_off_approved_at timestamptz,
  resolved_at          timestamptz,   -- terminal states (cancelled/manager_resolved)

  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Swap-only columns must be null unless this is a direct_swap.
  constraint coverage_swap_fields_only_for_swap check (
    trigger_type = 'direct_swap'
    or (trade_type is null and target_employee_id is null and offered_shift_id is null)
  ),

  -- INVARIANT 1: time-off approval requires confirmed coverage.
  constraint time_off_approved_requires_coverage check (
    time_off_approved_at is null or status = 'covered'
  ),

  -- INVARIANT 2: a covered request always names who covered it.
  constraint covered_requires_covered_by check (
    status <> 'covered' or covered_by is not null
  )
);

create table coverage_offers (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null default '00000000-0000-0000-0000-000000000001'
                        references businesses(id) on delete cascade,
  coverage_request_id uuid not null references coverage_requests(id) on delete cascade,
  employee_id         uuid not null references employees(id) on delete cascade,
  tier                smallint not null check (tier in (1, 2)),
  response            offer_response not null default 'pending',
  notified_at         timestamptz,
  responded_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Never ask the same person twice for the same request.
  constraint coverage_offers_request_employee_key unique (coverage_request_id, employee_id)
);

create table notifications_log (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null default '00000000-0000-0000-0000-000000000001'
                          references businesses(id) on delete cascade,
  recipient_employee_id uuid references employees(id) on delete set null,
  coverage_request_id   uuid references coverage_requests(id) on delete set null,
  coverage_offer_id     uuid references coverage_offers(id) on delete set null,
  channel               notification_channel not null,
  template              text not null,
  status                notification_status not null default 'queued',
  provider              text,               -- 'twilio' | 'resend'
  provider_message_id   text,
  error                 text,
  payload               jsonb,              -- rendered content snapshot / metadata
  sent_at               timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
