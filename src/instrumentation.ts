import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

/**
 * Server + edge error monitoring (SCH-31). Inert without a DSN, so dev / CI /
 * local builds are unaffected; set NEXT_PUBLIC_SENTRY_DSN in prod/staging to turn
 * it on.
 */
export async function register(): Promise<void> {
  if (!dsn) return;
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    enabled: true,
  });
}

// Reports errors thrown in nested React Server Components to Sentry.
export const onRequestError = Sentry.captureRequestError;
