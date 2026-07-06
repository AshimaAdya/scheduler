# Scheduler MVP — Linear Backlog

Project: **Scheduler MVP** · 5 milestones · 28 issues
Each issue is written as a self-contained spec: Claude Code should be able to implement it by reading the issue alone (plus CLAUDE.md and docs/plan.md in the repo).

Global conventions (put these in CLAUDE.md, referenced by every issue):
- Stack: Next.js (App Router, TypeScript strict) + Supabase (Postgres, Auth, RLS) + Tailwind. Deployed on Vercel.
- All timestamps stored UTC; rendered in the business's configured timezone (America/Vancouver default).
- Every table has `business_id` (single hardcoded business for now).
- Enforce permissions with Supabase RLS, never UI-only.
- Domain invariants: (1) time-off approved only after coverage confirmed; (2) shift claims are atomic, first confirmed YES wins; (3) employees see only availability/eligibility, never others' full schedules; (4) approval mode and all tier wait-windows are per-business config, never hardcoded.
- Definition of done for every issue: code + tests pass + migration files committed + brief note in PR description of decisions made.

---

## Milestone 1 — Foundation (Week 1)

### SCHED-1: Project scaffold + CI
Set up Next.js (TypeScript, App Router, Tailwind), Supabase project linking via CLI, environment variable structure (.env.example committed), Vitest + Playwright installed, GitHub Actions running typecheck/lint/tests on PR.
**AC:** `npm run dev` works; CI passes on a trivial PR; .env.example documents every required var; README has run instructions.

### SCHED-2: Database schema + migrations (do this before all other feature issues)
Create Supabase migrations for: businesses (settings jsonb: approval_mode, tier wait-windows per trigger type, timezone), locations, employees (user_id link, role: employee|manager|admin, skills text[], max_weekly_hours, phone, email), availability_rules (recurring weekly + one-off exceptions), shift_templates, shifts, schedules (week_start, status draft|published), shift_assignments, coverage_requests (trigger_type: sick_call|day_off|direct_swap; trade_type: two_way|one_way; status enum per SCHED-14), coverage_offers, notifications_log.
**AC:** migrations apply cleanly to fresh DB; seed script creates 1 business, 2 locations, 12 employees with varied skills/availability; ERD or schema doc generated into /docs/schema.md.

### SCHED-3: Row-level security policies
RLS on every table. Employees: read own record, own assignments, own coverage requests/offers, plus read-only eligibility info needed for swaps (name + "available for shift X" only — never full schedules of others). Managers: full read/write within their business. Admin: everything.
**AC:** automated tests using two Supabase clients (employee JWT, manager JWT) prove an employee cannot read another employee's assignments or availability directly; manager can.

### SCHED-4: Auth + roles
Supabase email/password auth. Signup is invite-only (manager creates employee, system emails invite link to set password). Session handling in Next.js middleware. Role available in session claims.
**AC:** invite flow works end to end; unauthenticated users redirected to login; role-gated route guard utility exists and is tested.

### SCHED-5: Location & employee management UI (manager)
CRUD screens: locations; employees (create with name/email/phone/role/skills/max hours/home location, deactivate rather than delete). Sends invite on create.
**AC:** manager can create, edit, deactivate employees and locations; deactivated employees excluded from all scheduling and broadcasts; form validation with useful errors.

### SCHED-6: Employee availability UI
Employees set recurring weekly availability (per weekday time ranges) plus one-off unavailable dates. Managers can view/edit any employee's availability.
**AC:** availability saves and round-trips correctly across timezones; overlapping ranges rejected; manager view shows availability grid per location.

### SCHED-7: Business settings page
Manager-editable: approval_mode toggle (auto_publish | require_approval), tier wait-windows (minutes) for sick_call and day_off separately, business timezone, notification sender preferences.
**AC:** settings persist in businesses.settings jsonb; changing wait-windows affects new coverage requests only (in-flight requests keep the window they started with — store window on the request at creation).

---

## Milestone 2 — Weekly schedule + generator (Week 2)

### SCHED-8: Shift templates
Per location, managers define weekly demand: e.g. Mon–Fri, 09:00–17:00, needs 2 × skill "cashier", 1 × skill "supervisor". Templates generate concrete shift slots for any given week.
**AC:** template CRUD works; generating slots for a week produces correct shifts across DST transitions (test the two DST weeks explicitly).

### SCHED-9: Greedy schedule generator
Pure function in lib/scheduler/ behind a `ScheduleGenerator` interface (swappable for a constraint solver later). Input: week, shift slots, employees with skills/availability/max hours, existing assignments. Algorithm: for each slot (chronological), assign the eligible employee (skill match, available, under max hours, no overlapping assignment, min 10h rest since previous shift) with fewest assigned hours that week; tie-break randomly with seeded RNG for reproducibility. Unfillable slots flagged.
**AC:** unit tests cover: skill mismatch, hour cap reached, availability conflict, overlap, rest-period violation, unfillable slot, fairness (hours spread within 20% across equally-available employees on a synthetic dataset).

### SCHED-10: Schedule draft/publish workflow
Generate button creates a draft weekly schedule. If approval_mode = require_approval, manager reviews/edits then publishes. If auto_publish, publish immediately after generation (still editable after). Publishing notifies all assigned employees (email; SMS comes in M4 — stub the notification service interface now).
**AC:** both modes tested; editing a published schedule creates an audit log entry; re-generating a draft replaces it, never touches published schedules.

### SCHED-11: Manager schedule calendar view
Week view per location: grid of shifts with assignees, unfilled slots highlighted, drag-free MVP (click shift → reassign from eligible list). Eligible list = skill + availability + hour-cap checked live.
**AC:** manager can manually reassign; ineligible employees not offered; unfilled slots visually distinct; works on tablet width.

### SCHED-12: Employee schedule view
Employee sees: own upcoming shifts, and open/unfilled shifts they're eligible to claim (claiming creates a pending assignment that respects approval_mode). No visibility of other employees' schedules.
**AC:** RLS-verified: response payloads contain no other employees' assignment data; claiming an open shift works and respects approval mode; mobile responsive.

### SCHED-13: CSV import
Manager uploads CSV of employees (name, email, phone, role, skills, max hours, location). Validates, previews, imports, sends invites.
**AC:** malformed rows reported with line numbers without aborting valid rows; duplicate emails skipped with warning; template CSV downloadable.

---

## Milestone 3 — Coverage engine (Week 3) — the core differentiator

### SCHED-14: Coverage request state machine
Implement explicitly in lib/coverage/: states `open → tier1_broadcast → tier2_broadcast → escalated → covered | cancelled | manager_resolved`, with an allowed-transitions map; illegal transitions throw. All state changes go through one `transition()` function that writes an audit row.
**AC:** unit tests for every legal and illegal transition; state change log table populated; no code path mutates status outside transition().

### SCHED-15: Trigger 1 — sick call flow
Employee taps "Can't make this shift" on an upcoming shift → creates coverage_request (trigger_type sick_call) → immediately enters tier1_broadcast: system finds eligible employees (skill, availability, hour cap, not the reporter, active) at the same location and creates coverage_offers + queues notifications. Manager notified that the process started.
**AC:** eligibility query has unit tests; reporter cannot receive their own broadcast; request visible on manager dashboard immediately.

### SCHED-16: Trigger 2 — planned day-off flow
Employee requests a future scheduled shift off → coverage_request (trigger_type day_off) with longer configured wait windows → same pipeline as SCHED-15. Time-off status shows "pending — finding coverage" until covered; only then auto-approve (plus manager confirmation if approval_mode requires).
**AC:** the invariant "day off never approved before coverage confirmed" enforced at DB level (constraint or trigger), not just app code; test proves approval is impossible while request is uncovered.

### SCHED-17: Trigger 3 — direct swap (two-way trade)
Employee A picks one of their shifts → system shows eligible coworkers (eligibility only, no schedules) → A proposes a two-way trade offering one of B's shifts A is eligible for (system lists valid trade pairs). B accepts/declines. Decline → A may retry with someone else or convert to broadcast (becomes a day_off-style request). Data model includes trade_type two_way|one_way but UI ships two_way only.
**AC:** both sides' eligibility validated at accept time (not just proposal time — availability may have changed); accepted swap updates both assignments atomically; approval_mode gate applies.

### SCHED-18: Atomic claim resolution (the race-condition issue)
Accepting a coverage offer resolves via a single atomic operation: `UPDATE coverage_requests SET covered_by = :employee, status = 'covered' WHERE id = :id AND covered_by IS NULL` and checking affected-row count (or equivalent Postgres function). Losers get an automatic "shift already covered" notification.
**AC:** a test fires two simultaneous accepts (Promise.all against real Postgres, not mocks) and asserts exactly one winner, one polite loser message, and consistent final state. This test is required, not optional.

### SCHED-19: Tier timers + escalation
Cron (Vercel Cron or Supabase pg_cron — pick one, document why in the PR) runs every 2 minutes: finds broadcasts whose window (stored on the request at creation) has expired → advances tier1→tier2 (eligible employees at other locations, shared pool) → tier2→escalated (notify manager with a summary: who was asked, who declined, who ignored).
**AC:** timer logic unit-tested with fake clock; a request created with a 1-minute window in test env escalates correctly end-to-end; escalation message contains the ask/decline/no-response breakdown.

### SCHED-20: Manager override controls
On any coverage request, manager can: assign someone directly (skips remaining tiers), cancel the request, force-approve the absence uncovered (marks shift unfilled), or resolve manually. Every override audit-logged.
**AC:** all four actions work from the dashboard at any state before covered/cancelled; audit log shows actor + action + timestamp.

---

## Milestone 4 — Notifications (Week 3–4)

### SCHED-21: Notification service abstraction + email channel
lib/notifications/ with a channel interface (send, provider-agnostic). Implement email via Resend: broadcast asks, shift published, swap proposals, escalations, "already covered". Every send logged to notifications_log (recipient, channel, template, status, provider id).
**AC:** all templates render with real data in a preview route; failed sends recorded with error and visible on a manager-facing delivery log; retry with backoff (max 3).

### SCHED-22: Twilio SMS outbound
SMS channel for the same events. Message format for broadcasts: shift date/time/location/role + "Reply YES to take this shift, NO to pass." Respect per-employee channel preference (sms|email|both, default both).
**AC:** SMS sends logged like email; phone numbers normalized to E.164 on employee save; dev environment uses a Twilio test number and never texts real staff (env-gated).

### SCHED-23: Twilio inbound webhook (YES/NO replies)
Endpoint validates Twilio signature, matches From number → employee → their most recent open coverage_offer, parses strict YES/NO (case-insensitive, trims punctuation). YES → atomic claim (SCHED-18). NO → mark declined. Unmatched/ambiguous → polite auto-reply asking them to reply YES or NO, logged for manager visibility.
**AC:** signature validation rejects forged requests (tested); YES on an already-covered request returns the "already covered" reply; employee with two open offers gets a disambiguation reply listing them ("Reply YES 1 or YES 2").

### SCHED-24: Employee home + report-absence UX polish
Mobile-first employee home: my next shifts, report sick, request day off, propose swap, my pending requests with live status. One-tap flows, minimal typing.
**AC:** every core employee action reachable in ≤2 taps from home; Lighthouse mobile score ≥ 85; works logged-out → login → deep-link back to intended action.

---

## Milestone 5 — Hardening + pilot (Week 4–5)

### SCHED-25: Manager dashboard (live operations view)
Single screen: open coverage requests with current tier + countdown, who was contacted/declined/silent, unfilled shifts this week, pending approvals (if approval mode on). Realtime via Supabase subscriptions.
**AC:** state changes appear without refresh; countdown accurate; links jump to override controls.

### SCHED-26: E2E test suite
Playwright covering: sick call → tier1 YES via simulated SMS webhook → covered → absence approved; day off → no responses → tier2 → escalation; direct swap accept; approval-mode on/off variants; the concurrency test from SCHED-18 wired into CI.
**AC:** suite runs in CI headless under 10 minutes; failures produce traces/screenshots as artifacts.

### SCHED-27: Observability + ops
Sentry (client + server), structured logging on the coverage engine (request id through every transition), health-check endpoint, alerting if the tier-timer cron hasn't run in 10 minutes (dead-man switch), daily DB backup confirmed on Supabase plan.
**AC:** deliberately thrown test error appears in Sentry; cron dead-man alert fires when cron disabled in staging.

### SCHED-28: Pilot readiness pack
Seed→real-data cutover checklist; employee one-page guide (PDF) "how to reply to shift texts"; manager guide; test-broadcast button ("send a hello text to all staff to confirm delivery"); privacy notice page (PIPA-appropriate, data minimal); kill-switch doc: how managers run a week fully manually if the engine misbehaves.
**AC:** test broadcast reaches all seeded employees and logs delivery per person; both guides exported to /docs and linked from dashboard.

---

## Dependency notes for sequencing
- SCHED-2 blocks everything. SCHED-3/4 block all UI issues.
- SCHED-14 blocks 15–20. SCHED-18 blocks 23. SCHED-21 blocks 22/23.
- M2 and M3 can partially interleave, but finish SCHED-9/10 before SCHED-15 (coverage needs published schedules to act on).

## How to drive this with Claude Code (minimal-touch loop)
1. Connect Linear MCP to Claude Code (`claude mcp add` — Linear's MCP endpoint) once.
2. Per issue: `Read Linear issue SCHED-N. Plan first, show me the plan, then implement it fully including the acceptance criteria as tests. When done, summarize what to verify manually in one paragraph.`
3. You review the plan (30 seconds), let it run, review the diff on schema/state-machine/RLS issues only, commit, mark the issue Done, move to next.
4. When you make a decision mid-build, tell Claude Code to append it to CLAUDE.md.
