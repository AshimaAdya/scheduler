# Observability + ops (SCH-31)

Reliability is the product — a silent broadcast failure at 6am destroys trust.
This is the safety net.

## Sentry (errors, client + server)

Wired via `@sentry/nextjs` and **inert without a DSN**, so dev/CI are unaffected.

- `src/instrumentation.ts` — server + edge `register()` + `onRequestError`.
- `src/instrumentation-client.ts` — browser init + router-transition tracing.
- `next.config.ts` — `withSentryConfig` (source-map upload only when
  `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` are set).

**Enable:** set `NEXT_PUBLIC_SENTRY_DSN` in the Vercel project (all environments).
For readable stack traces in prod, also set `SENTRY_ORG`, `SENTRY_PROJECT`,
`SENTRY_AUTH_TOKEN` (source-map upload runs during the build).

**Verify (AC):** `GET /api/debug/error` throws a deliberate error → it appears in
the Sentry project within a minute. (The route only errors when hit directly.)

## Structured logging (trace a request by id)

`src/lib/log.ts` emits one JSON line per event. The coverage engine logs:

- `coverage.opened { coverageRequestId, trigger, shiftId }` when a broadcast starts.
- `coverage.transition { coverageRequestId, from, to, actor }` on **every** status
  change (the sole writer `transition()` logs it).

**Trace a lifecycle:** grep the logs (Vercel → project → Logs) for a
`coverageRequestId` to see `opened → tier1_broadcast → tier2_broadcast →
escalated → covered | cancelled | manager_resolved` in order (AC).

## Health check

`GET /api/health` → `{ ok, db, cron: { lastRunAt, stale } }`.

- `200` when the DB is reachable **and** the tier cron is fresh.
- `503` when the DB is unreachable **or** the cron is stale.

Public and secret-free — safe to expose to an uptime monitor.

## Dead-man switch (cron stopped)

The tier-timer cron (`/api/cron/coverage-tiers`, every 2 min — SCH-23) stamps a
heartbeat in `system_heartbeats (key='tier_cron')` on each run. `/api/health`
reports `cron.stale = true` once the last run is older than **10 minutes** (five
missed runs). That is the alert condition when the cron stops.

**Configure the alert (AC — do in staging/prod):** point an uptime monitor
(BetterStack / UptimeRobot / Pingdom) at `GET /api/health` every 1–2 min and alert
on any non-`200` or on `cron.stale=true`. Alternatively use **Sentry Cron
Monitoring**: create a monitor for the `*/2 * * * *` schedule and have it alert on
a missed check-in. **Test:** disable the Vercel cron in staging and confirm the
alert fires within ~10 minutes.
