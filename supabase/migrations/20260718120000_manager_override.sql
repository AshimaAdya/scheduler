-- ─────────────────────────────────────────────────────────────────────────────
-- Manager override — direct assign (SCH-24).
--
-- A manager resolves a coverage request by assigning someone directly (skipping
-- the remaining tiers). Atomic, mirroring accept_coverage: FOR UPDATE + guard,
-- hand the reporter's shift to the chosen employee, settle the offers, and cover
-- the request THROUGH coverage_transition (the sole writer of status/covered_by).
-- The audit row is written by coverage_transition from `p_detail`, which carries
-- the actor's action (and whether eligibility was overridden), so every override
-- is logged with actor + action + timestamp.
--
-- The other three overrides (cancel / resolve manually / force-uncovered) are
-- plain transition() calls in app code — no assignment hand-off, so no RPC.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.manager_assign_coverage(
  p_request_id   uuid,
  p_assignee     uuid,
  p_actor        uuid,
  p_auto_approve boolean,
  p_detail       jsonb
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
  if v_covered is not null
     or v_status not in ('open', 'tier1_broadcast', 'tier2_broadcast', 'escalated') then
    raise exception 'already_resolved' using errcode = 'P0001';
  end if;

  update public.shift_assignments
     set employee_id = p_assignee, assigned_via = 'manager', pending_approval = false
   where shift_id = v_shift and employee_id = v_reporter;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'reporter_not_assigned' using errcode = 'P0001';
  end if;

  update public.coverage_offers
     set response = 'accepted', responded_at = now()
   where coverage_request_id = p_request_id and employee_id = p_assignee;
  update public.coverage_offers
     set response = 'expired', responded_at = now()
   where coverage_request_id = p_request_id
     and employee_id <> p_assignee
     and response = 'pending';

  perform public.coverage_transition(
    p_request_id,
    v_status,
    'covered'::public.coverage_status,
    p_actor,
    p_detail,
    jsonb_build_object('covered_by', p_assignee::text)
  );

  if v_trigger = 'day_off' and p_auto_approve then
    update public.coverage_requests
       set time_off_approved_at = now()
     where id = p_request_id;
  end if;
end;
$$;

grant execute on function
  public.manager_assign_coverage(uuid, uuid, uuid, boolean, jsonb)
to service_role;
