-- ─────────────────────────────────────────────────────────────────────────────
-- Atomic coverage claim (SCH-22) — invariant #2.
--
-- accept_coverage(): a broadcast candidate accepts a sick-call / day-off cover
-- request. Everything happens in ONE transaction so two simultaneous "yes"
-- replies resolve to exactly one winner:
--   * FOR UPDATE lock + guard (covered_by IS NULL, still active),
--   * hand the reporter's shift to the winner (their new assignment),
--   * mark the winning offer accepted, the rest expired,
--   * flip the request to 'covered' THROUGH coverage_transition (the sole status
--     writer — and the only thing that sets covered_by), and
--   * for a day-off in auto mode, approve the time off in the same transaction
--     (invariant #1: only ever after coverage is confirmed).
-- The loser re-reads a covered request and is rejected with 'already_covered'.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.accept_coverage(
  p_request_id   uuid,
  p_actor        uuid,
  p_auto_approve boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status   public.coverage_status;
  v_trigger  public.coverage_trigger_type;
  v_reporter uuid;
  v_shift    uuid;
  v_covered  uuid;
  v_rows     int;
begin
  select status, trigger_type, requested_by, shift_id, covered_by
    into v_status, v_trigger, v_reporter, v_shift, v_covered
  from public.coverage_requests
  where id = p_request_id
  for update;

  if v_status is null then
    raise exception 'coverage_not_found' using errcode = 'P0001';
  end if;
  if v_trigger = 'direct_swap' then
    raise exception 'not_a_broadcast' using errcode = 'P0001';
  end if;
  -- First confirmed YES wins; everyone arriving after is already covered.
  if v_covered is not null
     or v_status not in ('open', 'tier1_broadcast', 'tier2_broadcast', 'escalated') then
    raise exception 'already_covered' using errcode = 'P0001';
  end if;

  -- Winner takes over the reporter's shift (their new assignment).
  update public.shift_assignments
     set employee_id = p_actor, assigned_via = 'claim', pending_approval = false
   where shift_id = v_shift and employee_id = v_reporter;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'reporter_not_assigned' using errcode = 'P0001';
  end if;

  update public.coverage_offers
     set response = 'accepted', responded_at = now()
   where coverage_request_id = p_request_id and employee_id = p_actor;
  update public.coverage_offers
     set response = 'expired', responded_at = now()
   where coverage_request_id = p_request_id
     and employee_id <> p_actor
     and response = 'pending';

  -- Sole status writer; also the only path that sets covered_by.
  perform public.coverage_transition(
    p_request_id,
    v_status,
    'covered'::public.coverage_status,
    p_actor,
    jsonb_build_object('claim', true),
    jsonb_build_object('covered_by', p_actor::text)
  );

  -- Day-off in auto mode: approve the time off now that coverage is confirmed
  -- (the DB CHECK guarantees this can only run post-cover).
  if v_trigger = 'day_off' and p_auto_approve then
    update public.coverage_requests
       set time_off_approved_at = now()
     where id = p_request_id;
  end if;
end;
$$;

grant execute on function public.accept_coverage(uuid, uuid, boolean) to service_role;
