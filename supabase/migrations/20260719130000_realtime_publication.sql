-- ─────────────────────────────────────────────────────────────────────────────
-- Realtime publication (SCH-29). The manager live-ops board subscribes to these
-- tables so coverage state, offer responses, and fill/unfill changes appear
-- without a refresh. RLS still governs which rows a subscriber receives, so a
-- manager only ever gets changes for their own business.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime
      add table coverage_requests, coverage_offers, shift_assignments;
  else
    create publication supabase_realtime
      for table coverage_requests, coverage_offers, shift_assignments;
  end if;
end $$;
