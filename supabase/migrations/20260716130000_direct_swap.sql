-- ─────────────────────────────────────────────────────────────────────────────
-- Direct swap (SCH-21) — two atomic RPCs.
--
-- coverage_transition(): the transition logic lifted into SQL so it becomes the
-- CANONICAL, sole writer of coverage_requests.status — read current → assert the
-- transition is legal (mirrors state-machine.ts) → compare-and-swap on
-- `status = from` → stamp covered_at/resolved_at → append coverage_audit_log.
-- TS transition() (lib/coverage/transition.ts) is now a thin wrapper over this,
-- and accept_swap() calls it INSIDE its own transaction — so "transition is the
-- sole status writer" holds even for the in-transaction swap path.
--
-- accept_swap(): re-validated in the app first (eligibility), then this runs the
-- state change atomically: CAS-swap both shift_assignments (guards the
-- validate→swap race) and flip the request to 'covered' via coverage_transition,
-- all in one transaction (invariant #2 — the swap is a single atomic write).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.coverage_transition(
  p_request_id uuid,
  p_from       public.coverage_status,
  p_to         public.coverage_status,
  p_actor      uuid  default null,
  p_detail     jsonb default null,
  p_patch      jsonb default null
)
returns public.coverage_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed boolean;
  v_rows    int;
begin
  -- The caller passes the status it observed (`p_from`). Legality is checked
  -- against that, and the update is a compare-and-swap on `status = p_from` — the
  -- concurrency guard: two racing transitions both observe the same `from`, both
  -- attempt the update, and exactly one matches a row (the loser gets 0 rows →
  -- transition_conflict). This keeps the original transition() semantics while
  -- making the write + audit atomic and callable from inside accept_swap.

  -- Legal transitions — must stay in lockstep with src/lib/coverage/state-machine.ts.
  v_allowed := (p_from, p_to) in (
    ('open',            'tier1_broadcast'),
    ('open',            'covered'),
    ('open',            'cancelled'),
    ('open',            'manager_resolved'),
    ('tier1_broadcast', 'tier2_broadcast'),
    ('tier1_broadcast', 'covered'),
    ('tier1_broadcast', 'cancelled'),
    ('tier1_broadcast', 'manager_resolved'),
    ('tier2_broadcast', 'escalated'),
    ('tier2_broadcast', 'covered'),
    ('tier2_broadcast', 'cancelled'),
    ('tier2_broadcast', 'manager_resolved'),
    ('escalated',       'covered'),
    ('escalated',       'cancelled'),
    ('escalated',       'manager_resolved')
  );
  if not v_allowed then
    raise exception 'illegal_transition:%:%', p_from, p_to using errcode = 'P0001';
  end if;

  -- Compare-and-swap: only apply if status is still `from`. Status-adjacent
  -- columns come from p_patch (bounded allow-list: covered_by, tier_expires_at)
  -- so they're written atomically WITH the status.
  update public.coverage_requests
     set status          = p_to,
         covered_by      = coalesce((p_patch->>'covered_by')::uuid, covered_by),
         tier_expires_at = coalesce((p_patch->>'tier_expires_at')::timestamptz, tier_expires_at),
         covered_at      = case when p_to = 'covered' then now() else covered_at end,
         resolved_at     = case when p_to in ('cancelled', 'manager_resolved')
                                then now() else resolved_at end
   where id = p_request_id
     and status = p_from;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'transition_conflict:%', p_request_id using errcode = 'P0001';
  end if;

  insert into public.coverage_audit_log
    (coverage_request_id, from_status, to_status, actor_employee_id, detail)
  values
    (p_request_id, p_from, p_to, p_actor, p_detail);

  return p_to;
end;
$$;

create or replace function public.accept_swap(
  p_request_id       uuid,
  p_actor            uuid,
  p_pending_approval boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status  public.coverage_status;
  v_trigger public.coverage_trigger_type;
  v_a       uuid;   -- requester A (gives up A's shift, takes B's)
  v_b       uuid;   -- target B (= p_actor; gives up B's shift, takes A's)
  v_a_shift uuid;
  v_b_shift uuid;
  v_rows    int;
begin
  select status, trigger_type, requested_by, target_employee_id, shift_id, offered_shift_id
    into v_status, v_trigger, v_a, v_b, v_a_shift, v_b_shift
  from public.coverage_requests
  where id = p_request_id
  for update;

  if v_status is null            then raise exception 'swap_not_found'      using errcode = 'P0001'; end if;
  if v_trigger <> 'direct_swap'  then raise exception 'not_a_swap'          using errcode = 'P0001'; end if;
  if v_status  <> 'open'         then raise exception 'swap_not_open'       using errcode = 'P0001'; end if;
  if v_b is null or v_b <> p_actor then raise exception 'not_swap_target'   using errcode = 'P0001'; end if;
  if v_b_shift is null           then raise exception 'no_offered_shift'    using errcode = 'P0001'; end if;

  -- Atomic two-way swap. CAS on employee_id: each update must hit exactly the row
  -- we validated; a shift reassigned since the proposal aborts the whole swap.
  update public.shift_assignments
     set employee_id = v_a, assigned_via = 'swap', pending_approval = p_pending_approval
   where shift_id = v_b_shift and employee_id = v_b;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'swap_assignment_changed' using errcode = 'P0001'; end if;

  update public.shift_assignments
     set employee_id = v_b, assigned_via = 'swap', pending_approval = p_pending_approval
   where shift_id = v_a_shift and employee_id = v_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'swap_assignment_changed' using errcode = 'P0001'; end if;

  update public.coverage_offers
     set response = 'accepted', responded_at = now()
   where coverage_request_id = p_request_id and employee_id = v_b;

  -- Flip to covered THROUGH the canonical transition, in this same transaction.
  -- We hold a FOR UPDATE lock and observed status 'open', so pass it as p_from.
  perform public.coverage_transition(
    p_request_id,
    'open'::public.coverage_status,
    'covered'::public.coverage_status,
    p_actor,
    jsonb_build_object('swap', true),
    jsonb_build_object('covered_by', v_b::text)
  );
end;
$$;

-- Called only from service-role server actions (after the app authorizes the
-- actor and re-validates eligibility). Not exposed to authenticated clients.
grant execute on function
  public.coverage_transition(uuid, public.coverage_status, public.coverage_status, uuid, jsonb, jsonb),
  public.accept_swap(uuid, uuid, boolean)
to service_role;
