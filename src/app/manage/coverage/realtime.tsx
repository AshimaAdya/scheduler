"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Live-ops realtime (SCH-29): subscribe to the coverage tables and re-fetch the
 * server-rendered board when anything changes, so state updates appear without a
 * manual refresh. Refreshes are debounced so a burst of events (offers created +
 * a transition) triggers a single re-render. RLS scopes the events to the
 * manager's business.
 */
export function RealtimeCoverage() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 300);
    };

    const channel = supabase
      .channel("coverage-live-ops")
      .on("postgres_changes", { event: "*", schema: "public", table: "coverage_requests" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "coverage_offers" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_assignments" }, refresh)
      .subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
