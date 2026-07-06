# Automated Employee Scheduling App — Build Plan

## 1. My recommendation up front

Build a **custom web app** (not a no-code stack). Reasons:
- You said this could become a resellable product — no-code tools (Airtable, Zapier, Bubble) can't be white-labeled or sold cleanly, and they get expensive/fragile fast at 30+ employees × multiple locations.
- The "check coverage → notify → wait for response → approve" workflow is a real state machine with race conditions (two people might say yes at once). That needs actual backend logic, not automation glue.
- The good news: you don't need to build the hard infrastructure (SMS, calling, email, auth) yourself — you'll use existing APIs for those and only write the business logic. This keeps the "coding" surface area small.

Think of it as: **you write the brain (scheduling rules + approval workflow), you rent the mouth and ears (Twilio for calls/texts, SendGrid for email, an auth provider for logins).**

---

## 2. Core modules you need

### A. Org & Employee Management
- Employees, roles, locations, departments, pay type, max hours/week, skills/certifications (e.g. only certain staff can do certain shifts)
- Manager/admin roles per location + a super-admin role (important since you have multiple locations)

### B. Availability & Constraints
- Each employee sets recurring availability + one-off blackout dates
- Constraints engine: max hours/week, min rest between shifts, required skill coverage per shift, labor law rules (overtime thresholds, minor work-hour restrictions if applicable, required break windows)

### C. Auto-Scheduling Engine (the monthly schedule generator)
This is the algorithmic core. Two real approaches:
1. **Constraint solver (recommended)** — use Google **OR-Tools** (free, open source, has Python bindings) to solve shift assignment as a constraint satisfaction / optimization problem (cover every shift, respect availability, balance hours fairly, minimize overtime cost). This is a well-trodden problem — you're not inventing new math, just configuring constraints.
2. Simpler heuristic/greedy algorithm if OR-Tools feels heavy — faster to build, less optimal, fine for an MVP.

Output: a draft **weekly** schedule (not monthly). Weekly is easier to keep accurate (availability changes more often than once a month) and easier for employees to plan around.

**Auto-publish is a per-business setting.** In the business/location settings, add a toggle: `require_manager_approval: true/false`. If true, the generated schedule sits in "draft" until a manager clicks publish. If false, it publishes automatically once generated (still editable after). This is a simple config flag, not two separate systems — same generator, same review UI, just whether publish is manual or automatic.

### D. Coverage Requests — two flavors, same underlying engine

Both flows use the same tiered-broadcast engine (find eligible people → notify → first yes wins → confirm), just triggered differently:

**1. Sick-call / unplanned absence** (as described below)
**2. Planned day-off request with swap** — employee requests a specific future day off *in advance*. Flow:
   - Employee submits a day-off request for a shift they're scheduled for
   - System immediately runs the same tiered broadcast (same location → other locations → manager) to find someone to take that shift
   - Because it's planned ahead of time, the wait windows can be longer (hours/days instead of minutes) since there's no urgency
   - Day-off request is only **approved once a replacement confirms** — this was your original requirement, and it now applies to both sick-calls and planned time-off requests uniformly
   - If manager-approval mode is on for the business, the manager still gets a final look before it's locked in, even after coverage is found

Because it's the same engine, you're not building two separate systems — just two triggers (immediate vs scheduled-in-advance) feeding the same "find coverage" pipeline. This significantly reduces build complexity.

Coverage/sick-call flow detail:

1. Employee reports unavailable for a shift (app button, or texts/calls in — see below)
2. System finds eligible replacements: same skill/role, available that slot, under weekly hour cap, hasn't already declined
3. **Tiered escalation, broadcast within tiers:**
   - **Tier 1:** Broadcast to all eligible employees at the *same location* simultaneously via SMS/email, "Can you cover [shift] on [date]? Reply YES/NO." Wait a time window (e.g. 30-60 min).
   - **Tier 2:** If nobody responds/accepts, broadcast to eligible employees at *other locations* (if the business has shared staff pools or willing floaters). Wait another window.
   - **Tier 3:** If still no coverage, escalate to the manager to handle manually (call around, approve the absence uncovered, pull someone from a different role, etc.)
4. First qualifying "YES" wins the shift — system needs a lock/transaction so two people can't double-claim it (whoever's reply hits the server first gets it; everyone else gets an auto "shift already covered" reply)
5. Original employee's time-off is auto-approved once coverage confirmed; manager gets notified either way
6. Each tier's wait window should be configurable per business (e.g. some businesses want tier 1 to only wait 15 min before expanding, others can wait longer) — and configurable per *trigger type* too: sick-calls need short windows (minutes), planned day-off requests can use longer windows (hours) since there's no urgency.

**Direct employee-to-employee swaps** (third trigger, simplest one): Employee A picks a specific shift and proposes a trade to a specific coworker (Employee B). Default is a **two-way trade** (A takes B's shift, B takes A's) — build this as the primary path. Design the data model so a one-directional "just cover me, no trade back" option can be added later without restructuring (e.g. a `trade_type: two_way | one_way` field on the swap request from day one, even if only `two_way` is exposed in the UI at first). If B declines, A can either pick someone else manually or fall back to the broadcast engine above. If manager-approval mode is on, the swap still needs a manager sign-off before it's final.

**Visibility rule:** employees never see each other's full schedules. When picking a swap partner or when the system runs the broadcast, it only shows **who is eligible/available** for that specific shift — not anyone's complete calendar. This keeps schedules private while still letting the coverage/swap flow work.

Where an actual LLM *can* help (optional, not required):
- Parsing free-text replies ("yeah I can do it" vs "can't, sorry") instead of requiring strict YES/NO — nice UX polish, not core functionality
- Placing an automated **voice call** that speaks the shift details and listens for a verbal yes/no (via Twilio + a speech-to-text/LLM combo) — doable but adds real complexity; I'd build this in phase 2, not the MVP

### E. Manager Dashboard
- Approve/edit AI-generated schedules before publishing
- Live view of open shifts, pending coverage requests, who's been contacted
- Manual override at any point (managers should always be able to intervene)

### F. Notifications Layer
- SMS + voice: **Twilio**
- Email: **SendGrid** or **Postmark**
- Push notifications: only needed if you build a mobile app (Firebase Cloud Messaging is free and standard)

### G. Auth
- Use **Clerk** or **Auth0** rather than building login/password/reset flows yourself. Handles multi-role, multi-location permissions with minimal code.

---

## 3. How employees interact (my recommendation)

Given 30+ employees across locations, I'd do:
- **Mobile-friendly web app (PWA)**, not a native iOS/Android app — same codebase as your admin dashboard, no App Store approval process, employees just open a link/bookmark on their phone. This is the right MVP choice for cost and speed.
- **SMS/voice as the fallback channel** for the sick-call and coverage-request flow specifically, since not everyone will open an app when they're sick at 6am — texting "can't come in today" should work even if they never log in.
- Native app only becomes worth it later if you're selling this as a polished product and clients expect app-store presence.

---

## 4. Suggested tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (React) | One codebase, works as PWA, huge ecosystem |
| Backend | Node.js (or Python/FastAPI if you prefer Python for the OR-Tools solver) | |
| Database | PostgreSQL | Relational data (shifts, employees, constraints) fits well |
| Scheduling engine | Google OR-Tools | Free, proven constraint solver |
| Auth | Clerk or Auth0 | Avoid building this yourself |
| SMS/Voice | Twilio | Industry standard, good docs |
| Email | SendGrid/Postmark | |
| Hosting | Vercel (frontend) + Railway/Render/AWS (backend+DB) | Cheap to start, scales later |
| Background jobs | A queue (BullMQ if Node, Celery if Python) | Needed for "wait for response, then escalate" timers |

---

## 5. Suggested build phases

**Phase 1 — MVP (4-6 weeks solo, more if part-time)**
- Employee/location/role management
- Manual + auto-generated monthly schedule (basic OR-Tools setup)
- Manager approval dashboard
- Basic sick-call flow: employee reports out → system texts eligible coverage list → first YES wins → manager notified
- Email + SMS only (skip voice calls for now)

**Phase 2**
- Voice call fallback for coverage requests
- Free-text reply parsing (light LLM use)
- Shift-swap requests between employees directly (not just sick coverage)
- Analytics: hours worked, overtime costs, no-show rates

**Phase 3 (only later, if you decide to resell)**
- Not needed now since this is single-business only for now, but worth knowing: retrofitting multi-tenancy later mainly means adding a `business_id` to every table and scoping every query by it. Cleanest if, even now, you design your database as if `business_id` exists (default it to a single hardcoded value) — costs almost nothing today and saves a painful migration later if you ever do expand.

---

## 6. Rough cost estimate (running costs, not dev time)

- Twilio: pay-per-SMS/call, roughly $0.0079/SMS, a few cents/min for calls — at 30 employees this is likely $20-50/month unless call volume is heavy
- SendGrid: free tier covers this easily at your scale
- Hosting (Vercel + Railway/Render + Postgres): $20-50/month to start
- Clerk/Auth0: free tier covers up to a few thousand users

So running costs are genuinely small — the real cost is your dev time.

---

## 7. Things to nail down before/while building

- **Labor law compliance** for your local jurisdiction (overtime rules, mandatory rest periods, predictive scheduling laws — some cities/states require advance notice of schedules and penalize last-minute changes). This affects your constraint engine and your coverage-request UX (e.g. some jurisdictions require paying a penalty if you change someone's shift with short notice).
- **Tie-breaking rules** when multiple employees say yes to cover a shift — first response? Seniority? Fewest hours this week (to avoid burning out your most available person)?
- **Escalation path** when nobody covers — does the original employee's absence get denied, does the manager get called, does it go to overtime for existing staff?
- **Data privacy** — you'll be handling employee contact info and possibly health-related info ("calling in sick") — worth a basic privacy policy and secure data handling even at small scale, especially if you resell this later.

---

## 8. Decisions made so far

- Schedule cadence: **weekly**, not monthly
- Manager approval: **configurable per business** (toggle between auto-publish and require-approval)
- Coverage requests: **tiered broadcast** — same location first, then expand to other locations, then escalate to manager if unresolved
- Staff pool: **shared across locations**, so cross-location broadcast (Tier 2) is a real, regularly-used path, not an edge case
- Wait-window timing: **configurable**, and should differ by trigger type (short for sick-calls, longer for planned day-off requests)
- Features needed: both **sick-call/day-off coverage** (broadcast-based) and **direct employee-to-employee shift swaps** (targeted, one-to-one) — both run through the same underlying "propose → confirm → approve" engine, just triggered differently
- Swap direction: **two-way trade by default**; one-directional "just cover me" is a possible future option, so the data model should support both from the start even though only two-way ships first
- Schedule visibility: employees only ever see **who is available/eligible** for a given shift — never a coworker's full schedule
- Multi-tenancy: **not needed now** — single business only; keep the data model loosely ready for it (a `business_id` field defaulted to one value) so a future expansion isn't a full rewrite

## 9. Still worth answering

1. What are the actual default wait-window lengths you want (e.g. sick-call: 20 min per tier; planned day-off: 24 hours per tier)? You can pick placeholder numbers now and make them adjustable later.
2. For the two-way trade — does A get to see a list of "available" coworkers to pick from (system suggests eligible trade partners for A's shift), or does A need to already know who they want to ask?
