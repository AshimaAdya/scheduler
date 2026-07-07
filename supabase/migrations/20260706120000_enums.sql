-- ─────────────────────────────────────────────────────────────────────────────
-- Enums + extensions
--
-- Native Postgres enum types are used for fixed domains: they give clean
-- generated TypeScript types and are the values the app switches on. Adding a
-- value later is `ALTER TYPE ... ADD VALUE`.
-- ─────────────────────────────────────────────────────────────────────────────

-- gen_random_uuid() is built into Postgres 13+ core (pgcrypto not required),
-- but we keep this here to be explicit and portable.
create extension if not exists pgcrypto;

create type user_role as enum ('employee', 'manager', 'admin');

create type schedule_status as enum ('draft', 'published');

create type availability_kind as enum ('recurring', 'exception');

create type coverage_trigger_type as enum ('sick_call', 'day_off', 'direct_swap');

create type trade_type as enum ('two_way', 'one_way');

-- Full lifecycle of a coverage request. Legal transitions are enforced in
-- application code (lib/coverage transition()); the enum just bounds the domain.
create type coverage_status as enum (
  'open',
  'tier1_broadcast',
  'tier2_broadcast',
  'escalated',
  'covered',
  'cancelled',
  'manager_resolved'
);

create type offer_response as enum ('pending', 'accepted', 'declined', 'expired');

create type assignment_source as enum ('generator', 'manager', 'claim', 'swap');

create type notification_channel as enum ('sms', 'email');

create type notification_status as enum ('queued', 'sent', 'delivered', 'failed');
