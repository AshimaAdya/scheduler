import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

/**
 * Browser error monitoring (SCH-31). Inert without a DSN. Client-side JS errors
 * and unhandled rejections are captured once NEXT_PUBLIC_SENTRY_DSN is set.
 */
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
