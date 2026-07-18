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
- **2026-07-15 (db-test gotcha):** Each `*.db.test.ts` that creates a `schedules` row must use a DISTINCT (location, week_start) — the unique constraint collides across parallel test files (committed row vs another file's txn insert). Current weeks: rls 2026-06-01, coverage-invariants 2026-07-06, settings-snapshot 2026-07-13, schedule-workflow 2026-08-03, eligible-for-shift 2026-08-10, employee-schedule 2026-08-17, coverage-transition 2026-09-07, direct-swap 2026-11-02.
- **2026-07-15 (SCH-15):** `eligibleEmployeesForShift` (`src/lib/schedule/eligible.ts`) is the live reassign-eligibility check — reuses the SCH-13 scheduler predicates (skill/availability/hour-cap/overlap-rest) against the employee's OTHER shifts that week, so calendar and generator never drift. Manager calendar grid is in `/manage/schedule` (`schedule-grid.tsx`, client): columns per weekday, unfilled cards highlighted, tap a shift → `getEligibleForShift` → `reassignShiftAction`. Those actions use the authenticated (manager RLS) client, not service-role.
- **2026-07-16 (SCH-18):** Coverage state machine in `src/lib/coverage/`. `state-machine.ts` = `ALLOWED_TRANSITIONS` map + `assertLegalTransition` (throws `IllegalTransitionError`). `transition.ts` = the SOLE writer of `coverage_requests.status`: reads current status, asserts legality, applies a compare-and-swap update (`WHERE status = from`, throws `TransitionConflictError` on 0 rows), sets `covered_at`/`resolved_at`, writes a `coverage_audit_log` row. Status-adjacent fields (e.g. `covered_by`) go in `transition`'s `patch` so they're written atomically with status. New `coverage_audit_log` table (migration 20260716120000). A grep-guard test (`no-direct-status-write.test.ts`) fails if any file except transition.ts updates coverage_requests.status. SCH-19+ build all coverage flows on `transition()`.
- **2026-07-16 (SCH-19):** Sick-call flow. `src/lib/coverage/eligible.ts` — pure `isCoverageEligible` (wraps `employeeFitsSlot` + active + not-reporter + same-location-for-tier) and DB helper `findCoverageCandidates`. `src/lib/coverage/sick-call.ts` `reportSickCall` (service-role): verifies reporter's shift, snapshots sick_call windows, creates request (open) + tier-1 `coverage_offers` for same-location eligibles, `transition()`→tier1_broadcast w/ `tier_expires_at`, notifies candidates + managers via the stub. Employee "Can't make it" (2-tap) on `/schedule`; minimal manager board `/manage/coverage` (friendly status per design-doc language + live countdown). employee-view now returns `coverageStatus` per own shift. SCH-19 db-test week 2026-09-14.
- **2026-07-16 (SCH-20):** Planned day-off flow — same engine, different trigger. Extracted the tiered broadcast from sick-call into `src/lib/coverage/broadcast.ts` `startCoverageBroadcast({shiftId, reporterEmployeeId, triggerType})`; `reportSickCall`/`requestDayOff` are now thin wrappers passing `sick_call`/`day_off`. Day-off snapshots the longer day_off windows (tier1 1440 min vs sick_call 30). `approveDayOff` (manager, `src/lib/coverage/day-off.ts`) sets `time_off_approved_at` only — it does **not** write status, so it relies on the SCH-6 CHECK `time_off_approved_requires_coverage` (invariant #1) to make approval-before-coverage impossible at the DB level (proven in `day-off.db.test.ts` via a direct service-role bypass that the CHECK rejects). Omitting `status` from that `.update()` also keeps it clear of the grep-guard. Employee `/schedule` shows two 2-tap actions (`ShiftActions`: "Can't make it" / "Request day off"); manager board shows an "Approve day off" button only when `status==='covered' && !approved && approval_mode==='require_approval'`. SCH-20 db-test week 2026-10-05.
- **2026-07-16 (SCH-21):** Direct swap (Trigger 3, two-way). Schema was already swap-ready (`coverage_requests.trade_type/target_employee_id/offered_shift_id` + `coverage_swap_fields_only_for_swap` CHECK; `assigned_via='swap'`); `open→covered`/`open→cancelled` already legal, so no new states/columns. **`transition()` is now a thin wrapper over a SQL `coverage_transition(p_request_id, p_from, p_to, …)` function** (migration 20260716130000) — the canonical sole status writer (legality + CAS on `status=p_from` + audit, all atomic). The TS wrapper still reads the observed `from` and passes it, so the SCH-18 CAS-conflict semantics are preserved verbatim (`coverage-transition.db.test.ts` unchanged and green). **`accept_swap(p_request_id, p_actor, p_pending_approval)`** RPC does the atomic bit: CAS-swap BOTH `shift_assignments` (guards the validate→swap race) then calls `coverage_transition('open'→'covered')` inside its own `FOR UPDATE` txn — invariant #2 (one atomic write) with the single-writer invariant intact. Both RPCs granted to `service_role` only. All swap logic in `src/lib/coverage/swap.ts` (service-role): `proposeSwap`/`acceptSwap`/`declineSwap`/`convertSwapToBroadcast` (decline→broadcast reuses SCH-20 `startCoverageBroadcast` as day_off), `validateSwapPair` (re-validates BOTH directions at ACCEPT time, excluding each party's given-up shift, via shared `employeeFitsSlot`), `confirmSwap` (manager clears `pending_approval` on both assignments). Invariant #3 disclosure (`swapCandidates`/`tradeableShifts`/`getIncomingSwaps`) uses a **service-role server action with a minimal payload** — reuses `eligibleEmployeesForShift`/`employeeFitsSlot`, no eligibility duplicated in SQL (the schema.md SECURITY-DEFINER-disclosure-RPC note is superseded). approval_mode gate mirrors SCH-16 claim: `pending_approval` on the swapped assignments, manager "Confirm swap" clears it. Employee UI: `/schedule` `SwapProposer` (pick coworker → pick their shift → propose) + `SwapInbox` (accept/decline) + `FellThroughList` (broadcast instead); manager `/manage/coverage` shows "Confirm swap". SCH-21 db-test week 2026-11-02 (Aiden 008 / Maya 00b — unused elsewhere).
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
