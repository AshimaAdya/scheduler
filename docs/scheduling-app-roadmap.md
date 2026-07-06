# Scheduling App — Implementation Roadmap (Setup → Production)

This is the execution companion to the build plan. It assumes: weekly schedules, configurable manager approval, tiered broadcast coverage, two-way swaps, shared staff pool, single business, built primarily with Claude Code.

---

## The faster path (read this first)

Three decisions that will cut your build time roughly in half:

1. **Use a full-stack framework with batteries included: Next.js + Supabase.**
   Supabase gives you PostgreSQL + auth + row-level security + realtime subscriptions + a hosted admin UI in one service. You skip building: login/signup, password reset, database hosting, and a chunk of your API layer. Clerk/Auth0 becomes unnecessary — Supabase Auth is enough for this scale.

2. **Skip OR-Tools for the MVP. Use a greedy scheduler first.**
   OR-Tools produces better schedules but adds a Python service, deployment complexity, and a learning curve. A greedy algorithm ("for each shift, assign the eligible employee with the fewest hours this week") is ~200 lines of TypeScript, runs in the same codebase, and produces schedules a manager can touch up in 5 minutes. Ship that, and swap in OR-Tools in phase 2 only if the greedy schedules are annoying managers. Design the scheduler as a swappable module so this replacement is painless.

3. **Let Claude Code do the heavy lifting, but YOU own the spec.**
   Claude Code is dramatically more effective when you feed it a written spec and a task list rather than vibing feature-by-feature. The two planning docs we've built are exactly that spec. The workflow below is structured around this.

With this stack, a realistic timeline is **3–5 weeks of focused part-time work to a pilot launch** with the one business, versus 8+ weeks going fully custom.

---

## Phase 0 — Setup (Day 1, ~2 hours)

### Accounts to create
| Service | Purpose | Cost to start |
|---|---|---|
| GitHub | Code repo, CI/CD | Free |
| Supabase | Database + auth + realtime | Free tier fine for pilot |
| Vercel | Hosting Next.js app + API routes + cron | Free tier fine for pilot |
| Twilio | SMS (and voice later) | Pay-as-you-go, ~$1 trial credit; buy a phone number (~$1.15/mo) |
| Resend (or SendGrid) | Transactional email | Free tier fine |
| Claude Pro/Max or Console account | Required for Claude Code | Pro works; Max if you'll use it heavily |

### Local tooling
1. Install Node.js LTS from nodejs.org (needed for Next.js dev, not for Claude Code itself)
2. Install Claude Code — the **native installer** is the recommended method now (no Node.js dependency):
   - macOS/Linux: `curl -fsSL https://claude.ai/install.sh | bash`
   - Windows (PowerShell): `irm https://claude.ai/install.ps1 | iex`
   - Verify with `claude --version`, run `claude doctor` if anything's off
   - Launch with `claude` and log in via the browser prompt
3. Install Git, and the Supabase CLI (`npm i -g supabase`) for local DB migrations
4. Optional but recommended: VS Code (Claude Code has an extension, or just use it in the terminal alongside)

### Repo bootstrap
Create the repo, then let Claude Code scaffold:
```
npx create-next-app@latest scheduler --typescript --tailwind --app
```
Commit immediately. From here on, **commit after every working feature** — this is your undo button when a Claude Code session goes sideways.

---

## Phase 1 — Project scaffolding for Claude Code (Day 1–2)

This step is what makes Claude Code effective. Do not skip it.

### 1. Create a `CLAUDE.md` in the repo root
Claude Code reads this file automatically every session. It should contain:
- One-paragraph project summary
- Tech stack and conventions (TypeScript strict, Next.js App Router, Supabase client patterns, where files live)
- The key domain rules it must never violate, e.g.:
  - "A time-off request is only approved after coverage is confirmed"
  - "Shift claims must be transactional — first confirmed YES wins, all others get 'already covered'"
  - "Employees can only ever see who is available for a shift, never another employee's full schedule"
  - "All timing windows and the manager-approval requirement are per-business config, never hardcoded"
- Commands: how to run dev server, tests, migrations

### 2. Drop the two planning docs into a `/docs` folder
`plan.md` (the build plan) and this roadmap. In prompts you can then say "per docs/plan.md section D…" and Claude Code will read it.

### 3. Define the database schema FIRST, before any features
This is the single highest-leverage prompt of the project. Something like:

> "Read docs/plan.md. Design the complete Supabase/PostgreSQL schema for this app: businesses (with settings jsonb for approval mode and tier wait-windows), locations, employees (with business_id, roles, skills, max weekly hours), availability rules, shifts, schedules (weekly, with draft/published status), coverage_requests (with trigger_type: sick_call | day_off | direct_swap, and trade_type: two_way | one_way), coverage_offers (responses from employees), and notifications log. Include row-level security policies so employees only read their own data plus shift-availability info. Write it as Supabase migration files. Explain the design before writing it."

Review the schema yourself carefully — schema mistakes are 10x more expensive to fix later than code mistakes.

---

## Phase 2 — Build order (Weeks 1–3)

Build in this sequence; each step is a Claude Code session or two. Suggested prompt style included.

### Milestone 1: Foundation (2–3 days)
- Supabase auth wired up (email/password login, role stored per user: employee / manager / admin)
- CRUD screens: locations, employees, roles/skills, employee availability
- Business settings page: approval-mode toggle, tier wait-windows for each trigger type

**Prompt pattern:** "Build the employee management screens per docs/plan.md section A. Managers can CRUD employees; employees can only edit their own availability. Use Supabase RLS, not just UI hiding, to enforce this. Show me the plan before coding."

### Milestone 2: Weekly schedule + greedy generator (3–5 days)
- Shift template definition per location (e.g. "Mon–Fri needs 2 cashiers 9–5, 1 supervisor")
- Greedy generator: for each shift slot, pick eligible employee (right skill, available, under hour cap) with fewest assigned hours that week; leave slot flagged "unfilled" if nobody fits
- Draft/publish flow respecting the approval-mode setting
- Calendar view for managers (full schedule) and employees (own shifts + open shifts only)

**Prompt pattern:** "Implement the weekly schedule generator as a pure, testable function in lib/scheduler/ with a clean interface, so it can later be swapped for a constraint-solver version. Write unit tests covering: skill mismatch, hour caps, availability conflicts, and unfillable slots."

### Milestone 3: The coverage engine (5–7 days — the heart of the app)
Build as a state machine with these states per coverage request:
`open → tier1_broadcast → tier2_broadcast → escalated_to_manager → covered | cancelled | manager_resolved`

- Trigger 1 (sick call) and Trigger 2 (planned day off): same pipeline, different default wait windows
- Trigger 3 (direct swap): targeted request to one person, two-way trade by default, falls back to broadcast if declined
- **The race-condition lock:** claiming a shift must be a single atomic DB operation (`UPDATE coverage_requests SET covered_by = X WHERE id = Y AND covered_by IS NULL` — check affected rows). Tell Claude Code explicitly to write a concurrency test for two simultaneous YES responses.
- Tier timers: use Vercel Cron (or Supabase pg_cron) to check every few minutes for requests whose tier window expired and advance them
- Approval linkage: original absence auto-approves only when coverage confirms (plus manager sign-off if approval mode is on)

**Prompt pattern:** "Implement the coverage request state machine per docs/plan.md section D. Model it explicitly — a status enum with allowed transitions, never ad-hoc status strings. Two simultaneous YES replies must resolve to exactly one winner; write a test that proves it."

### Milestone 4: Notifications (2–3 days)
- Outbound: Twilio SMS + Resend email on broadcast; message includes shift details and reply instructions
- Inbound: Twilio webhook endpoint that receives SMS replies, matches sender phone → employee → their open coverage offers, parses YES/NO (strict keywords for MVP; LLM parsing is phase 2)
- Every notification logged to the notifications table (you WILL need this audit trail when someone says "I never got the text")

**Twilio gotchas to budget time for:** webhook signature validation, and A2P 10DLC registration for US/Canada business SMS (a registration process that can take days — **start it in week 1**, not when you need it).

### Milestone 5: Manager dashboard + polish (3–4 days)
- Live view: open coverage requests, current tier, who's been pinged, who declined
- Manual override buttons everywhere (assign coverage directly, cancel request, force-approve)
- Employee home: my shifts, report absence, request day off, propose swap
- Mobile responsiveness pass (employees will use phones)

---

## Phase 3 — Hardening for production (Week 4)

- **Testing:** end-to-end test of the three coverage flows with Playwright; the concurrency test; timezone tests (shifts near midnight, DST transitions — genuinely a top bug source in scheduling apps)
- **Timezones:** store everything UTC, render in the business's local timezone, be explicit in CLAUDE.md about this
- **Error monitoring:** add Sentry (free tier) — you need to know when a broadcast fails silently
- **Secrets:** all keys in Vercel/Supabase env vars, never in code; separate dev and prod Twilio numbers
- **Backups:** Supabase paid tier ($25/mo) for daily backups before real business data goes in — this is employee scheduling data, losing it means chaos
- **Access review:** manually test as an employee account that you cannot see others' schedules or hit manager endpoints
- **Privacy basics (BC/Canada context):** you're handling employee personal info — PIPA (BC's Personal Information Protection Act) applies to private-sector employee data. Keep collection minimal (name, phone, email, availability — you don't need reasons for sick calls stored as free text), write a one-page privacy notice, and check BC Employment Standards rules on scheduling/overtime before finalizing the constraint rules. Worth 30 minutes with the actual business owner on this.

---

## Phase 4 — Pilot launch (Week 4–5)

1. **Shadow week:** generate schedules in the app while the business still uses their old method; compare. Fix what managers complain about.
2. **Import real data:** employees, roles, availability (build a simple CSV import — Claude Code can knock this out in an hour)
3. **Onboard employees:** a 1-page guide + a test broadcast so everyone confirms they receive SMS
4. **Go live with a kill switch:** managers keep full manual override; if the coverage engine misbehaves, they can run that week by hand while you fix it
5. **Feedback loop:** a simple "report a problem" link that emails you; check Sentry daily for week one

---

## Working with Claude Code — the habits that matter

1. **Plan mode first for anything non-trivial.** Start sessions with planning (Shift+Tab into plan mode, or just say "make a plan first, don't code yet"), review the plan, then let it execute. Catches wrong directions before they cost you an hour.
2. **One milestone-chunk per session.** "Build milestone 3 step by step" beats twenty micro-prompts, but don't ask for the whole app at once — quality drops and you lose the ability to review.
3. **Make it write tests as it goes,** especially for the coverage engine. Tell it "write the test first" for the race-condition and state-transition logic.
4. **Commit constantly.** Before each new Claude Code task, commit. If a session goes wrong, `git checkout .` and re-prompt with better instructions.
5. **Review the diffs.** You know how to code — use that on the 20% that matters: schema changes, the state machine, RLS policies, anything touching money/approval logic. UI code you can skim.
6. **Update CLAUDE.md when you make decisions.** Every architectural decision you make mid-build ("we're using pg_cron not Vercel cron") goes in CLAUDE.md so future sessions respect it.

---

## Where Linear fits

Use Linear as your task tracker for this — it's genuinely useful here for two reasons:
1. **You'll be working in milestone chunks over ~5 weeks part-time.** A backlog you can reorder beats a mental list, and each Linear issue maps cleanly to one Claude Code session.
2. **Claude Code can connect to Linear via MCP**, so you can literally tell Claude Code "pick up SCHED-14 and implement it" and it reads the issue description as its spec. Write acceptance criteria into each issue and the loop gets very tight.

Suggested structure: one Linear project ("Scheduler MVP"), 5 milestones matching the phases above, ~25–30 issues total. Issue titles like "Coverage state machine + tier timers", each with acceptance criteria copied from this roadmap.

---

## Total cost summary (pilot)

| Item | Monthly |
|---|---|
| Vercel | $0 (hobby) → $20 (pro, when live) |
| Supabase | $0 → $25 (backups, when live) |
| Twilio number + SMS | ~$5–30 depending on volume |
| Resend email | $0 |
| Sentry | $0 |
| Claude Pro/Max (for Claude Code) | $20–200 |
| **Total** | **~$50–275/mo**, mostly your Claude subscription |

---

## The one-week-at-a-time summary

- **Week 0 (a weekend):** accounts, installs, repo, CLAUDE.md, schema designed and reviewed. Start Twilio A2P registration NOW.
- **Week 1:** auth, employee/location/availability management, settings
- **Week 2:** shift templates, greedy generator, schedule views, publish flow
- **Week 3:** coverage engine (all three triggers), notifications in/out
- **Week 4:** dashboard, polish, hardening, shadow week begins
- **Week 5:** data import, onboarding, pilot go-live
