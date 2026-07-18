-- ─────────────────────────────────────────────────────────────────────────────
-- Per-employee notification preference (SCH-26).
--
-- Which channel(s) to reach a person on. Defaults to 'both'; the notification
-- service falls back to the business default (settings.notifications
-- .default_channel) only when this is unset, but since it's NOT NULL default
-- 'both' every employee has an explicit preference.
-- ─────────────────────────────────────────────────────────────────────────────

create type channel_pref as enum ('email', 'sms', 'both');

alter table employees
  add column notify_pref channel_pref not null default 'both';
