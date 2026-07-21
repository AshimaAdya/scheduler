import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

// Wraps the build for Sentry (SCH-31). Source-map upload only happens when a
// Sentry auth token / org / project are configured (prod/staging CI); locally and
// without them the build proceeds untouched.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
});
