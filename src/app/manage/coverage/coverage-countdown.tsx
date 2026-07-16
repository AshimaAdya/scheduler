"use client";

import { useEffect, useState } from "react";
import { strings } from "@/lib/strings";

function minutesLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000));
}

/** Live "N min left" countdown against the snapshotted tier window. */
export function CoverageCountdown({ expiresAt }: { expiresAt: string }) {
  const [minutes, setMinutes] = useState(() => minutesLeft(expiresAt));

  useEffect(() => {
    const id = setInterval(() => setMinutes(minutesLeft(expiresAt)), 30_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return <span>{strings.coverage.minutesLeft(minutes)}</span>;
}
