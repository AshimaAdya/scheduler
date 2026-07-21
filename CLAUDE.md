@AGENTS.md

# Scheduler — CLAUDE.md

Automated employee scheduling web app for a single business with multiple locations. Employees set availability; the system generates weekly schedules, handles sick-call and day-off coverage via tiered broadcast, and supports direct shift swaps. Built to be resellable later (multi-tenancy is not active now but the data model must be ready for it).

---

## Stack

| Layer | Choice |
|---|---|
| Frontend / API | Next.js 16 App Router, TypeScript strict |
| Styling | Tailwind CSS v4 — no CSS modules, no inline styles |
| Database / Auth / Realtime | Supabase (PostgreSQL + RLS + `@supabase/ssr`) |
| Hosting | Vercel |
| SMS / Voice | Twilio (Milestone 4) |
| Email | Resend (Milestone 4) |
| Error monitoring | Sentry (Milestone 5) |
| Unit tests | Vitest + Testing Library |
| E2E tests | Playwright |

---

## File layout

```
src/
  app/                  # Next.js App Router — routes and API handlers
    api/                # Route handlers (server-only)
    (auth)/             # Auth-gated route group
    layout.tsx
    page.tsx
  lib/                  # Pure business logic — no framework imports
    scheduler/          # Schedule generator (ScheduleGenerator interface)
    coverage/           # Coverage request state machine
    notifications/      # Notification channel abstraction
    supabase/           # Supabase client factories (see Supabase patterns below)
  components/           # Shared UI components
  __tests__/            # Unit tests (Vitest)
e2e/                    # Playwright E2E tests
supabase/
  migrations/           # All schema changes live here — never edit the DB directly
  seed.sql              # Dev seed data
docs/                   # Planning documents — read these for domain context
```

---

## Supabase client patterns

Use the correct client for the context — mixing these is a common bug:

```ts
// Server Components, Route Handlers, Server Actions
import { createServerClient } from "@supabase/ssr";
// (see src/lib/supabase/server.ts for the configured factory)

// Client Components only
import { createBrowserClient } from "@supabase/ssr";
// (see src/lib/supabase/client.ts for the configured factory)

// Service-role operations (bypasses RLS) — server-only, never import in client code
import { createServiceRoleClient } from "@/lib/supabase/service-role";
```

**RLS is the enforcement layer.** Every permission check must have a corresponding RLS policy. Never rely on UI-only hiding for security.

---

## TypeScript rules

- `strict: true` — no `any`, no `@ts-ignore` without a comment explaining why
- No type assertions (`as Foo`) without a comment explaining why
- `moduleResolution: bundler` — import paths must include extensions only when needed by the runtime

---

## Domain invariants — never violate these

1. **Time-off is only approved after coverage is confirmed.** A day-off request stays in `pending` status until a replacement is confirmed (and manager sign-off given if `approval_mode = require_approval`). This must be enforced at the DB level (constraint or trigger), not just app code.

2. **Shift claims are atomic. First confirmed YES wins, all others get "already covered."** The claim operation must be a single atomic DB write: `UPDATE coverage_requests SET covered_by = :employee, status = 'covered' WHERE id = :id AND covered_by IS NULL` — check affected row count. Two simultaneous YES replies must resolve to exactly one winner.

3. **Employees can only ever see who is available/eligible for a specific shift — never another employee's full schedule.** When building queries, eligibility payloads must contain only: employee name + "available for shift X". Never return assignment data for other employees.

4. **Approval mode and all tier wait-windows are per-business config, never hardcoded.** These live in `businesses.settings` (jsonb). Always read them from the business record at request time; never put a literal number of minutes in application logic.

---

## Multi-tenancy note

The app is single-business for now. Every table has a `business_id` column. Scope every query with `business_id`. Default it to the one real business UUID from env. This costs nothing today and avoids a painful migration if multi-tenancy is added later.

---

## Timestamps

- **Store:** always UTC `timestamptz`
- **Render:** always in `businesses.settings.timezone` (default `America/Vancouver`)
- Never store local time. Never hardcode a timezone in application logic.
- Test shifts near midnight and across DST transitions — these are the top bug source in scheduling apps.

---

## Scheduler module

`src/lib/scheduler/` exports a `ScheduleGenerator` interface. The current implementation is greedy (MVP). Do not bypass the interface — it exists so the greedy implementation can be swapped for a constraint-solver in phase 2 without touching callers.

---

## Coverage state machine

`src/lib/coverage/` owns all coverage request state transitions. The only legal states are:

```
open → tier1_broadcast → tier2_broadcast → escalated → covered
                                                      → cancelled
                                                      → manager_resolved
```

- State changes go through one `transition()` function that writes an audit row
- Illegal transitions throw
- **No code path outside `transition()` may mutate `coverage_requests.status`**

---

## Commands

```bash
npm run dev          # Next.js dev server → http://localhost:3000
npm run build        # Production build
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run test         # Vitest unit tests (run once)
npm run test:watch   # Vitest in watch mode
npm run test:e2e     # Playwright E2E (requires dev server or uses webServer config)

npx supabase start          # Start local Supabase stack (Docker required)
npx supabase db push        # Apply migrations to remote project
npx supabase migration new <name>   # Create a new migration file
npx supabase gen types typescript --local > src/lib/supabase/database.types.ts
```

---

## Decisions log

_Append architectural decisions here as they're made mid-build so future sessions respect them._

- **2026-07-06:** Schedule cadence is weekly. Greedy scheduler for MVP; `ScheduleGenerator` interface is swappable for OR-Tools in phase 2.
- **2026-07-06:** Supabase Auth (not Clerk/Auth0) — sufficient for single-business scale and avoids a separate service.
- **2026-07-06:** Timestamps stored UTC; rendered in `businesses.settings.timezone` (`America/Vancouver` default).
- **2026-07-06:** Tier wait-windows stored on the coverage request at creation time — in-flight requests keep the window they started with; changing settings only affects new requests.
- **2026-07-14 (SCH-11):** `businesses.settings` is typed in `src/lib/settings/` — `types.ts` (`BusinessSettings` + `DEFAULT_SETTINGS`), `resolve.ts` (`resolveSettings` merges jsonb over defaults — always read settings through this), `wait-windows.ts` (`waitWindowsFor` — the accessor M3 uses to snapshot windows onto a coverage request), `validate.ts`. Settings UI at `/manage/settings`. Seed defaults: require_approval, sick_call 30/30, day_off 1440/1440. Snapshot behavior proven by `settings-snapshot.db.test.ts`.
- **2026-07-06:** Direct swap data model includes `trade_type: two_way | one_way` from day one; only `two_way` is exposed in the UI for the MVP.
- **2026-07-06 (SCH-6):** Schema uses native Postgres enum types for fixed domains. `business_id` defaults to the sentinel UUID `00000000-0000-0000-0000-000000000001` (the one seeded business) on every table. See `docs/schema.md` for the full schema.
- **2026-07-06 (SCH-6):** `headcount` on `shift_templates` is expanded into individual single-seat `shifts`; an unfilled seat = a shift with no `shift_assignment`.
- **2026-07-06 (SCH-6):** All three coverage triggers share one `coverage_requests` table; swap-only columns are nullable + CHECK-guarded to `direct_swap`. Time-off approval is a column (`time_off_approved_at`), not a separate table.
- **2026-07-06 (SCH-6):** Time-off invariant enforced by a **CHECK constraint** (`time_off_approved_at IS NULL OR status = 'covered'`) — unbypassable, not a trigger. Proven by `src/__tests__/db/coverage-invariants.db.test.ts`.
- **2026-07-06 (SCH-6):** Recurring availability / template demand use naive `time`/`date` (wall-clock in business tz) by design; concrete `shifts` are `timestamptz` UTC. This is not a violation of the UTC rule.
- **2026-07-15 (SCH-12):** Local→UTC for slot generation uses **date-fns-tz** (`fromZonedTime`) — DST-correct. Pure `generateWeekSlots(templates, weekStart, timezone)` in `src/lib/scheduler/generate-slots.ts` (week starts Monday; expands headcount into single-seat slots). It only computes slots; persisting them into a draft schedule is SCH-14. DST proven by `generate-slots.test.ts` (spring-forward Mar 8 2026, fall-back Nov 1 2026, America/Vancouver). Template CRUD ("shift patterns") at `/manage/patterns`.
- **2026-07-15 (ops gotcha):** Do NOT run `npm run test`/`build` (heavy CPU) concurrently with `npx supabase db reset` — it can crash the container mid-init ("error running container"), leaving a schema-less DB. Re-run the reset alone to recover.
- **2026-07-15 (SCH-13):** Greedy scheduler behind `ScheduleGenerator` (`src/lib/scheduler/types.ts`) — impl `GreedyScheduleGenerator` (`greedy.ts`), predicates in `eligibility.ts`, seeded PRNG `rng.ts` (mulberry32) for reproducible tie-breaks. Generator is timezone-free: slots carry pre-derived `localWeekday/localStart/localEnd/localDate` (caller derives via date-fns-tz), so availability is a pure comparison. Assign fewest-hours-first; min 10h rest (`MIN_REST_HOURS`); unfillable slots flagged in `result.unfilled`, never dropped. Swap for OR-Tools later without touching callers.
- **2026-07-15 (SCH-14):** Draft/publish orchestration in `src/lib/schedule/service.ts` (`generateScheduleForWeek`/`publishSchedule`/`reassignShift`) takes a Supabase client + uses the **service-role** client from the action layer (authorized via `requireManager`). Re-generate deletes+recreates a DRAFT only; a published schedule is never touched (returns error). `auto_publish` publishes immediately. Local fields derived in `src/lib/schedule/build-input.ts`. Notifications go through `src/lib/notifications/` — `NotificationService` interface + `LoggingNotificationService` stub (writes `notifications_log`; real Resend/Twilio in M4). Schedule edits/publishes audited in new `schedule_audit_log` table. UI at `/manage/schedule` (rich calendar + click-reassign is SCH-15).
- **2026-07-15 (SCH-17):** CSV employee import in `src/lib/employees/csv.ts` — `parseCsv` (RFC-4180 quoted fields), `processEmployeeCsv` reuses SCH-9 `validateEmployee`, resolves home-location by name, reports per-row errors with line numbers, flags duplicates (in-file + vs DB). UI at `/manage/employees/import` (preview → import, reuses `sendEmployeeInvite`); template at `/manage/employees/import/template` (route handler). Pure logic unit-tested. **M2 complete (SCH-12..17).**
- **2026-07-15 (SCH-16):** Employee schedule view `src/lib/schedule/employee-view.ts` (`getEmployeeSchedule`) MUST be called with the employee's own authenticated client — RLS then guarantees invariant #3 (no other employee's shifts/assignments in the payload). Open-shift claim `src/lib/schedule/claim.ts` (`claimShift`) is service-role + atomic (unique(shift_id) → double-claim fails), sets `pending_approval = (approval_mode === 'require_approval')`, `assigned_via='claim'`. Shared eligibility `src/lib/schedule/fits.ts` (`employeeFitsSlot`) is the single source of truth used by claim + view (+ SCH-15 reassign). Employee UI at `/schedule`.
- **2026-07-15 (db-test gotcha):** Each `*.db.test.ts` that creates a `schedules` row must use a DISTINCT (location, week_start) — the unique constraint collides across parallel test files (committed row vs another file's txn insert). Current weeks: rls 2026-06-01, coverage-invariants 2026-07-06, settings-snapshot 2026-07-13, schedule-workflow 2026-08-03, eligible-for-shift 2026-08-10, employee-schedule 2026-08-17, coverage-transition 2026-09-07, direct-swap 2026-11-02, coverage-claim 2026-12-07, escalation 2027-01-04, manager-override 2027-02-01.
- **2026-07-15 (SCH-15):** `eligibleEmployeesForShift` (`src/lib/schedule/eligible.ts`) is the live reassign-eligibility check — reuses the SCH-13 scheduler predicates (skill/availability/hour-cap/overlap-rest) against the employee's OTHER shifts that week, so calendar and generator never drift. Manager calendar grid is in `/manage/schedule` (`schedule-grid.tsx`, client): columns per weekday, unfilled cards highlighted, tap a shift → `getEligibleForShift` → `reassignShiftAction`. Those actions use the authenticated (manager RLS) client, not service-role.
- **2026-07-16 (SCH-18):** Coverage state machine in `src/lib/coverage/`. `state-machine.ts` = `ALLOWED_TRANSITIONS` map + `assertLegalTransition` (throws `IllegalTransitionError`). `transition.ts` = the SOLE writer of `coverage_requests.status`: reads current status, asserts legality, applies a compare-and-swap update (`WHERE status = from`, throws `TransitionConflictError` on 0 rows), sets `covered_at`/`resolved_at`, writes a `coverage_audit_log` row. Status-adjacent fields (e.g. `covered_by`) go in `transition`'s `patch` so they're written atomically with status. New `coverage_audit_log` table (migration 20260716120000). A grep-guard test (`no-direct-status-write.test.ts`) fails if any file except transition.ts updates coverage_requests.status. SCH-19+ build all coverage flows on `transition()`.
- **2026-07-16 (SCH-19):** Sick-call flow. `src/lib/coverage/eligible.ts` — pure `isCoverageEligible` (wraps `employeeFitsSlot` + active + not-reporter + same-location-for-tier) and DB helper `findCoverageCandidates`. `src/lib/coverage/sick-call.ts` `reportSickCall` (service-role): verifies reporter's shift, snapshots sick_call windows, creates request (open) + tier-1 `coverage_offers` for same-location eligibles, `transition()`→tier1_broadcast w/ `tier_expires_at`, notifies candidates + managers via the stub. Employee "Can't make it" (2-tap) on `/schedule`; minimal manager board `/manage/coverage` (friendly status per design-doc language + live countdown). employee-view now returns `coverageStatus` per own shift. SCH-19 db-test week 2026-09-14.
- **2026-07-16 (SCH-20):** Planned day-off flow — same engine, different trigger. Extracted the tiered broadcast from sick-call into `src/lib/coverage/broadcast.ts` `startCoverageBroadcast({shiftId, reporterEmployeeId, triggerType})`; `reportSickCall`/`requestDayOff` are now thin wrappers passing `sick_call`/`day_off`. Day-off snapshots the longer day_off windows (tier1 1440 min vs sick_call 30). `approveDayOff` (manager, `src/lib/coverage/day-off.ts`) sets `time_off_approved_at` only — it does **not** write status, so it relies on the SCH-6 CHECK `time_off_approved_requires_coverage` (invariant #1) to make approval-before-coverage impossible at the DB level (proven in `day-off.db.test.ts` via a direct service-role bypass that the CHECK rejects). Omitting `status` from that `.update()` also keeps it clear of the grep-guard. Employee `/schedule` shows two 2-tap actions (`ShiftActions`: "Can't make it" / "Request day off"); manager board shows an "Approve day off" button only when `status==='covered' && !approved && approval_mode==='require_approval'`. SCH-20 db-test week 2026-10-05.
- **2026-07-16 (SCH-21):** Direct swap (Trigger 3, two-way). Schema was already swap-ready (`coverage_requests.trade_type/target_employee_id/offered_shift_id` + `coverage_swap_fields_only_for_swap` CHECK; `assigned_via='swap'`); `open→covered`/`open→cancelled` already legal, so no new states/columns. **`transition()` is now a thin wrapper over a SQL `coverage_transition(p_request_id, p_from, p_to, …)` function** (migration 20260716130000) — the canonical sole status writer (legality + CAS on `status=p_from` + audit, all atomic). The TS wrapper still reads the observed `from` and passes it, so the SCH-18 CAS-conflict semantics are preserved verbatim (`coverage-transition.db.test.ts` unchanged and green). **`accept_swap(p_request_id, p_actor, p_pending_approval)`** RPC does the atomic bit: CAS-swap BOTH `shift_assignments` (guards the validate→swap race) then calls `coverage_transition('open'→'covered')` inside its own `FOR UPDATE` txn — invariant #2 (one atomic write) with the single-writer invariant intact. Both RPCs granted to `service_role` only. All swap logic in `src/lib/coverage/swap.ts` (service-role): `proposeSwap`/`acceptSwap`/`declineSwap`/`convertSwapToBroadcast` (decline→broadcast reuses SCH-20 `startCoverageBroadcast` as day_off), `validateSwapPair` (re-validates BOTH directions at ACCEPT time, excluding each party's given-up shift, via shared `employeeFitsSlot`), `confirmSwap` (manager clears `pending_approval` on both assignments). Invariant #3 disclosure (`swapCandidates`/`tradeableShifts`/`getIncomingSwaps`) uses a **service-role server action with a minimal payload** — reuses `eligibleEmployeesForShift`/`employeeFitsSlot`, no eligibility duplicated in SQL (the schema.md SECURITY-DEFINER-disclosure-RPC note is superseded). approval_mode gate mirrors SCH-16 claim: `pending_approval` on the swapped assignments, manager "Confirm swap" clears it. Employee UI: `/schedule` `SwapProposer` (pick coworker → pick their shift → propose) + `SwapInbox` (accept/decline) + `FellThroughList` (broadcast instead); manager `/manage/coverage` shows "Confirm swap". SCH-21 db-test week 2026-11-02 (Aiden 008 / Maya 00b — unused elsewhere).
- **2026-07-17 (SCH-22):** Atomic claim resolution (invariant #2). `accept_coverage(p_request_id, p_actor, p_auto_approve)` SECURITY DEFINER RPC (migration `20260717120000`) resolves a broadcast accept in ONE txn: `FOR UPDATE` + guard (`covered_by IS NULL` & active) → reassign the reporter's shift to the winner (`assigned_via='claim'`) → mark winning offer `accepted` / others `expired` → `coverage_transition(→covered, covered_by=winner)` → for `day_off` in auto mode, set `time_off_approved_at` (post-cover, CHECK-safe). First confirmed YES wins; the loser re-reads a covered request and gets `already_covered`. App layer `src/lib/coverage/respond.ts` (`acceptCoverageOffer`/`declineCoverageOffer`/`getCoverageAsks`, service-role): re-validates the actor still fits via `findCoverageCandidates` (sameLocationOnly:false), reads approval_mode, fans out winner/reporter/loser("already covered")/manager notifications. **`covered_by` is now written ONLY inside `coverage_transition`** — no TS `.update()` sets it (grep-guard extended in `no-direct-status-write.test.ts`). Employee UI: `/schedule` "Shifts you're asked to cover" (`CoverageAsks`: "Yes, I'll cover" / "Can't"). Required concurrency AC proven in `coverage-claim.db.test.ts` (Promise.all two accepts → exactly one winner, week 2026-12-07, Ethan 00a reporter / Aiden 008 / Maya 00b).
- **2026-07-17 (SCH-23):** Tier timers + escalation cron — **Vercel Cron** (not pg_cron; documented in PR), so the sweep reuses the TS engine (`transition`, `findCoverageCandidates`, `NotificationService`) with zero SQL duplication. `src/lib/coverage/escalation.ts`: pure `nextTierAction(request, now)` (fake-clock testable — expired tier1 → advance_to_tier2 w/ `now+tier2_wait`; expired tier2 → escalate; else none) + `advanceExpiredTiers(supabase, {now, notifier})` service-role sweep — selects `status IN (tier1_broadcast,tier2_broadcast) AND tier_expires_at < now`; tier1→tier2 opens to OTHER-location eligibles (`findCoverageCandidates(sameLocationOnly:false)` minus already-offered) with tier-2 offers + re-armed expiry; tier2→escalated notifies managers with an asked/declined/no-response breakdown (from `coverage_offers`). Idempotent: `transition()` CAS means overlapping sweeps can't both advance (loser's `TransitionConflictError` caught+skipped), advancing bumps `tier_expires_at` into the future, and `unique(request,employee)` backstops offer dupes. Route `src/app/api/cron/coverage-tiers/route.ts` (GET, `force-dynamic`, `Authorization: Bearer $CRON_SECRET`) → service-role client. `vercel.json` crons `*/2 * * * *`; `CRON_SECRET` in `.env.example`. No migration (existing columns). Tests: `escalation.test.ts` (fake clock), `escalation.db.test.ts` (1-min window tier1→tier2→escalated + breakdown + idempotency, week 2027-01-04).
- **2026-07-18 (SCH-24):** Manager override controls — a manager can always intervene on an active (non-terminal, non-swap) coverage request. `src/lib/coverage/overrides.ts` (service-role): `managerAssign` (direct-assign — validates eligibility via `findCoverageCandidates`, or an explicit `overrideEligibility` emergency path logged in the audit detail; atomic via new `manager_assign_coverage` RPC that reassigns the reporter's shift → assignee `assigned_via='manager'`, settles offers, covers through `coverage_transition`, day_off auto-approve), `cancelRequest` (→cancelled, reporter keeps shift), `forceApproveUncovered` (deletes the reporter's assignment → shift unfilled, →manager_resolved), `resolveManually` (→manager_resolved, assignments untouched), `assignmentOptions` (eligible + others-for-override). The three non-assign actions are plain `transition()` calls (no covered_by), so every override is audited with actor + action (in `detail`) + timestamp. Manager actions in `manage/coverage/actions.ts` authorize via `requireManager` then run **service-role** (because `transition()`/`coverage_transition` and the RPC are service_role-only). UI: `OverridePanel` on `/manage/coverage` (assign picker w/ eligibility-override toggle + two-tap confirms) shown for overridable broadcasts. Migration `20260718120000`. db-test week 2027-02-01 (Liam reporter / Aiden eligible / Noah override-only / Marcus actor). **M3 complete (SCH-18..24).**
- **2026-07-18 (SCH-25, M4 start):** Real notifications. `src/lib/notifications/` — provider-agnostic `DeliveryChannel` interface (`channels/types.ts`), `ResendEmailChannel` (`channels/resend-email.ts`, `fetch`-based, no SDK, throws on non-2xx to drive retry), `templates.ts` (`renderTemplate` registry for all 12 live template ids + `TEMPLATE_IDS`, unknown→generic fallback), `enrich.ts` (resolves `payload.shiftId`→when/where/skill via `formatInTimeZone`), `service.ts` `MultiChannelNotificationService` (enrich→render→`sendWithRetry` [max 3, exp backoff, injectable]→log to `notifications_log`; **never throws** — a failed send is logged `failed`, not propagated), `factory.ts` `getNotificationService` (registers Resend when `RESEND_API_KEY`+`RESEND_FROM` set, else 0 channels → `queued` rows / no network). **Routing is by `settings.notifications.default_channel`** (email/sms/both), NOT the per-message `channel` (now `@deprecated` optional). All ~6 `?? new LoggingNotificationService` defaults swapped to `?? getNotificationService`; `LoggingNotificationService` kept for tests. No migration (`notifications_log` already had status/provider/provider_message_id/error/sent_at). Manager delivery log `/manage/notifications` + copy preview `/manage/notifications/preview` (renders all templates). SMS (SCH-26) plugs in by registering a channel — zero caller changes. Tests: `templates.test.ts`, `service.test.ts` (retry), `notifications.db.test.ts` (sent/failed/queued rows).
- **2026-07-19 (SCH-26):** Twilio SMS outbound. `channels/twilio-sms.ts` `TwilioSmsChannel` (`fetch`, Basic auth, throws on non-2xx/missing phone). **Dev-safety = hard env gate:** `factory.ts` `buildChannels()` registers SMS ONLY when `SMS_LIVE === "true"` AND all three `TWILIO_*` vars set — dev/CI have none → sms prefs logged `queued`, zero Twilio calls (proven by `factory.test.ts` via `vi.stubEnv`). `renderTemplate(template, channel, ctx)` is now channel-aware; added the two missing tier-1 ask templates (`coverage_ask`/`coverage_ask_day_off`, previously hit the generic fallback) + SMS "Reply YES to take it, NO to pass." variants for all ask templates. **Per-employee preference:** new `channel_pref` enum + `employees.notify_pref` column (default `both`, migration `20260719120000`); service resolves each recipient's channels from `notify_pref` (falls back to business `default_channel`). Manager sets it via a "How to reach them" select on the employee form (validation/actions/`[id]` page updated). Notif-log `provider`: email→`resend`, sms→`twilio`. A2P 10DLC checklist in `docs/twilio-a2p.md` + `SMS_LIVE` in `.env.example`. Tests: `twilio-sms.test.ts`, `factory.test.ts` (env gate), `sms-preference.db.test.ts` (email/sms/both per pref, uses inactive Sam 00c). No schedule week (log-only db tests).
- **2026-07-19 (SCH-27):** Twilio inbound webhook. Route `src/app/api/sms/inbound/route.ts` (POST, `force-dynamic`): validates `X-Twilio-Signature` (`channels/twilio-signature.ts` — HMAC-SHA1 over url+sorted-params, timing-safe; reject→403) then `handleInboundSms` → TwiML reply. `src/lib/notifications/inbound.ts`: pure `parseSmsReply` (strict YES/NO + optional number, punctuation/case-tolerant, bare number picks; contradictory/unknown→clarify), `handleInboundSms` (service-role): match `From`→employee by phone (unknown→safe generic reply, logged), list their pending offers on non-terminal-except-covered requests; 1 offer → YES=`acceptCoverageOffer` (SCH-22 atomic; already-covered surfaces its error), NO=`declineCoverageOffer`; ≥2 → numbered disambiguation ("Reply … YES 1"), "YES n" resolves the nth (sorted by shift start), NO-all declines all. Every inbound logged to `notifications_log` (template `sms_inbound`, provider twilio, payload{from,body,action}) for manager visibility. URL rebuilt from `x-forwarded-*` (override `TWILIO_INBOUND_URL`). SMS reply copy in `strings.smsReplies`. Also fixed a stray bad import in `sms-preference.db.test.ts` (NotificationChannel from wrong module — tsc-only, esbuild ignored it). Tests: `twilio-signature.test.ts` (accept/forge/tamper/missing), `inbound.test.ts` (parse), `sms-inbound.db.test.ts` (YES→covered, already-covered reply, 2-offer disambig + "YES 2", unknown number). **M4 note:** db-test recipients must be an employee NO other file broadcasts to — sms-inbound uses **Noah (006, cashier) on cashier shifts** because `listOpenOffers` is global and Aiden/Maya/Sofia receive offers from escalation/coverage-claim in parallel. week 2027-03-01.
- **2026-07-19 (SCH-28):** Employee home = decision feed + bottom-nav shell (deck E2/E3/E7/E9). **`/` is now the "For you" feed** (was `redirect("/dashboard")`); `/dashboard` is a redirect shim to `/`; login default + `requireManager` employee-redirect → `/` (guard.ts still returns `/dashboard` → shim, so guard tests stay green). Feed (`src/app/page.tsx`, server): reply-needed FIRST (`CoverageAsks` inline YES/NO via SCH-22 + `SwapInbox`) → next shift (`ShiftActions` or `ProgressDots`) → claimable (`ClaimButton`) → requests summary; reuses `getEmployeeSchedule`(RLS) + `getCoverageAsks`/`getIncomingSwaps`(service-role) + `./schedule/*` components (no route-group move). `/schedule` trimmed to My schedule (own+claimable). New `/requests` (E7): `getMyRequests` (`lib/coverage/my-requests.ts`, service-role — resolves coverer FIRST name) + `ProgressDots` three-step journey (`lib/coverage/journey.ts` `journeyStep`: tier1/open→team, tier2→other locations, escalated→manager, covered→done — **replaces "Tier N" on screen**). New `/profile` (E9): `notify_pref` control (`updateMyNotifyPref` action — service-role self-update since employees can't write `employees` under RLS), masked phone, availability/manage links, sign out. Shared `components/bottom-nav.tsx` (For you·My schedule·Requests·Profile, `usePathname` active) rendered per page (`pb-24`); `components/progress-dots.tsx`; `lib/name.ts` `firstName` (privacy: first names only, no full-name lists). Deep-link after login already worked (proxy `?next=` + login-form). No migration. Tests: `journey.test.ts` (+firstName), `my-requests.db.test.ts`. **Lighthouse ≥85 = manual check (server-rendered, tiny client islands).** **M4 complete (SCH-25..28).**
- **2026-07-19 (SCH-29, M5 start):** Manager live-ops board = enhanced `/manage/coverage`. **Realtime** via Supabase subscriptions: migration `20260719130000` adds `coverage_requests`/`coverage_offers`/`shift_assignments` to the `supabase_realtime` publication (RLS still scopes events to the manager's business); client `realtime.tsx` `RealtimeCoverage` subscribes to `postgres_changes` on all three and does a **debounced `router.refresh()`** (300ms) so the server-rendered board re-fetches without a manual refresh. Board loaders in `src/lib/coverage/board.ts` (manager RLS client): `getOfferBreakdown` (per active broadcast: asked count + declined/waiting FIRST names) rendered as a faint line per request; `getUnfilledThisWeek` (published shifts starts_at in [now, now+7d] with no assignment → "Fill it" → `/manage/schedule`). Countdown (`CoverageCountdown`, SCH-19) already accurate vs snapshotted `tier_expires_at`; every active broadcast already links to its SCH-24 `OverridePanel` inline. First realtime usage in the app; browser client `src/lib/supabase/client.ts`. No React state store — realtime just triggers a server re-render. Tests: `board.db.test.ts` (unfilled window + offer breakdown); realtime itself is a manual check. db-test note: board loaders query a **now..now+7d** window, so its shifts are dated ~2 days out (every other file uses far-future dates → no overlap).
- **2026-07-19 (SCH-30):** Playwright E2E suite in `e2e/` (config had `webServer`/`testDir` scaffolding; now populated). Harness: `global-setup.ts` bootstraps manager (Marcus) + employee (Liam) passwords via service-role (same as dev-login) then UI-logs-in each → saves `storageState` to `e2e/.auth/{manager,employee}.json` (gitignored); specs `test.use({ storageState })` per role. `helpers/db.ts` (service-role seed/read — createSchedule/Shift/assign/seedBroadcast/seedSwap/seedCoveredDayOff/expireTierNow/requestState/setApprovalMode, cleanup per distinct week), `helpers/api.ts` (`postInboundSms` signs with `computeTwilioSignature`; `runTierCron` GET w/ `CRON_SECRET`), `helpers/time.ts` (`nextSlot` → future shift on a given local weekday so the coverer is available). Specs seed via service-role, act via UI/API, assert via UI+DB: smoke, sick-call (SMS YES→covered→board), day-off-escalation (cron is the clock: tier1→tier2→escalated), swap (B accepts on feed→both assignments swap), approval-mode (approve button only in require_approval), timezone (23:00-local shift shows local day, not UTC). `playwright.config.ts`: `globalSetup`, screenshot/video/trace-on-failure, chromium-only, workers 1, `fullyParallel:false` (shared business), webServer `npm run dev` local / `npm run start` CI with `CRON_SECRET`/`TWILIO_AUTH_TOKEN`/`TWILIO_INBOUND_URL` env. CI (`.github/workflows/ci.yml`) new **`e2e` job**: `supabase start`→`db reset`→**`test:db`** (wires the SCH-22 concurrency into CI)→`db reset`→`build`→`playwright install`→`test:e2e`, uploads `playwright-report`/`test-results` artifacts (`if: always()`). **Verified statically** (typecheck covers `e2e/` via `**/*.ts`, lint, build, `playwright test --list` collects all 7); the browser run is CI-only (local dev server was stale + `.env.local` lacks CRON/TWILIO). db-test note: e2e seeds shifts on real-time-relative future dates (weeks 2027-06-07..07-05).
- **2026-07-19 (SCH-31, M5):** Observability + ops. **Sentry** via `@sentry/nextjs` (10.67), Next-16 instrumentation: `src/instrumentation.ts` (`register`+`onRequestError`), `src/instrumentation-client.ts` (browser+`onRouterTransitionStart`), `next.config.ts` wrapped with `withSentryConfig` — all **inert without `NEXT_PUBLIC_SENTRY_DSN`** so dev/CI/build are unaffected (verified build passes with no DSN). Test-error route `/api/debug/error` (throws). **Structured logging** `src/lib/log.ts` `logEvent` (JSON lines, injectable sink) — `transition()` emits `coverage.transition {coverageRequestId,from,to,actor}` on every step (sole writer → full lifecycle greppable by id) + `coverage.opened` in broadcast. **Health** `/api/health` (public, `force-dynamic`): db reachability + cron freshness → 200/503. **Dead-man switch:** migration `20260719140000` `system_heartbeats(key,last_run_at)`; `src/lib/coverage/heartbeat.ts` (`recordCronRun` upsert `tier_cron`; `cronFreshness`/pure `isStale`, 10-min threshold); the tier cron route stamps it each run; health reports `stale` = the alert condition. **PROXY FIX:** `src/proxy.ts` matcher now excludes `/api` (`(?!api|...)`) — API routes self-authenticate (cron secret, Twilio signature) or are public (health/debug); previously the auth proxy 307'd them, which would have broken real Vercel Cron, the Twilio webhook, and the SCH-30 E2E cron/sms specs. Docs `docs/observability.md` (Sentry/dead-man-alert/log-grep) + `docs/backups.md` (Supabase daily backups + restore runbook — pre-pilot checklist). Ops ACs (Sentry capture, staging alert, backup restore) are documented, not locally verifiable. Tests: `log.test.ts`, `heartbeat.test.ts` (isStale), `heartbeat.db.test.ts`.
- **2026-07-06 (SCH-6):** DB integration tests are `*.db.test.ts`, run via `npm run test:db` against local Supabase — excluded from `npm run test` so CI stays DB-free until SCH-26.
- **2026-07-09 (SCH-7):** RLS on all 11 tables via `app_*` SECURITY DEFINER helper functions (keyed off `employees.user_id = auth.uid()`). Enforcement layer, not UI. `service_role` (BYPASSRLS) is the server's privileged path.
- **2026-07-09 (SCH-7):** Employees have **no write access to the `employees` table** (prevents self role-escalation); employee self-service = editing own `availability_rules`. Managers/admins do all employee CRUD.
- **2026-07-09 (SCH-7):** Invariant #3 baseline is own-data-only; coworker eligibility disclosure for swaps will come from a `SECURITY DEFINER` RPC (`get_eligible_employees_for_shift`) in SCH-17 — never by loosening table RLS.
- **2026-07-09 (SCH-7):** This Supabase version does not auto-expose new tables — every schema migration that adds tables must also `GRANT` privileges to `authenticated`/`service_role` (see `20260709120100_rls_policies.sql`).
- **2026-07-10 (SCH-8):** Next.js 16 renamed `middleware.ts` → **`src/proxy.ts`** (exported fn `proxy`, Node runtime). Do not create `middleware.ts`.
- **2026-07-10 (SCH-8):** Supabase client factories live in `src/lib/supabase/` — `client.ts` (browser), `server.ts` (async, uses `cookies()`), `service-role.ts` (`server-only`, BYPASSRLS). Use the right one per context.
- **2026-07-10 (SCH-8):** Role reaches the JWT via a custom access token hook (`custom_access_token_hook`) adding a `user_role` claim from `employees.role`. Enabling it required config.toml changes → the local stack must be restarted (`supabase stop && start`) when auth config changes, not just `db reset`.
- **2026-07-10 (SCH-8):** Auth gating is centralized in pure utils `src/lib/auth/{routes,guard}.ts` (unit-tested); `src/lib/auth/session.ts` has `requireUser`/`requireManager` for Server Components. Manager/admin routes live under `/manage`.
- **2026-07-10 (SCH-8):** `NEXT_PUBLIC_*` env vars are build-time inlined — a build (and the browser client) needs them present. Local dev uses a gitignored `.env.local` (copy from `.env.example`).
- **2026-07-14 (SCH-10):** Availability stays naive wall-clock (`time`/`date`) per SCH-6 — recurring times round-trip tz-independently by design (a Vancouver "9:00" shows "9:00" everywhere); do NOT UTC-convert them. Validation in `src/lib/availability/validate.ts` (overlaps/order). Editor `src/components/availability-editor.tsx` reused by `/availability` (employee), `/manage/employees/[id]/availability`, and the `/manage/availability` grid. Save = replace recurring rows (RLS-scoped: employee self or manager).
- **2026-07-14 (SCH-10, testing gotcha):** Each `*.db.test.ts` that creates an auth user must use a DISTINCT seeded employee/email — files share one DB and collide otherwise (rls→Liam/Marcus, auth-invite→Emma/Priya, recovery→Olivia, availability→Noah). If the local DB drifts (leftover employees/user links from interrupted runs), `npx supabase db reset` restores the clean seed.
- **2026-07-13 (SCH-9):** Design system follows **Design direction v1** (Linear doc) + `docs/ui-page-deck.html`. Tokens are Tailwind v4 `@theme` in `globals.css` (`bg-bg`, `text-ink`, `bg-accent`, `rounded-card`, status `text-warn/ok/danger`). Reusable primitives in `src/components/ui/`. Calm-minimal, no shadows/gradients, sentence case, weights 400/600. Apply from every new screen.
- **2026-07-13 (SCH-9):** All user-facing copy lives in `src/lib/strings.ts` (translation-ready); product name is the `APP_NAME` constant ("ShiftCover"), never hardcoded. Internal status terms (tier1_broadcast etc.) must never reach the screen — see the mapping in the design doc/deck.
- **2026-07-13 (SCH-9):** `getSchedulableEmployees()` in `src/lib/employees/queries.ts` is the CANONICAL source of scheduling/broadcast candidates — always `active = true`. The scheduler (SCH-14) and coverage broadcasts (SCH-15) MUST use it so deactivation is enforced in one place.
- **2026-07-13 (SCH-9):** Phone → E.164 via `src/lib/phone.ts` (`normalizeToE164`, NA-first). Employee form validation in `src/lib/validation/employee.ts`. Both pure + unit-tested; server actions authorize via `requireManager` then write under RLS (service-role only for the auth-admin invite).
