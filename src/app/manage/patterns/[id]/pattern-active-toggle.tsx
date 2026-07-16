"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setTemplateActive } from "../actions";
import { strings } from "@/lib/strings";

export function PatternActiveToggle({
  id,
  active,
}: {
  id: string;
  active: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const res = await setTemplateActive(id, !active);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant={active ? "danger" : "secondary"}
        size="sm"
        onClick={toggle}
        disabled={pending}
      >
        {pending
          ? "Saving…"
          : active
            ? strings.patterns.turnOff
            : strings.patterns.turnOn}
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
