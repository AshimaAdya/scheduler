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
- **2026-07-06:** Direct swap data model includes `trade_type: two_way | one_way` from day one; only `two_way` is exposed in the UI for the MVP.
