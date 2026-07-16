"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { strings } from "@/lib/strings";
import {
  generateScheduleAction,
  publishScheduleAction,
} from "./actions";
import type { GenerateResult, PublishResult } from "@/lib/schedule/service";

export function GenerateButton({
  locationId,
  weekStart,
  existing,
  disabled,
}: {
  locationId: string;
  weekStart: string;
  existing: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [result, action, pending] = useActionState<GenerateResult | null, FormData>(
    async (prev, formData) => {
      const res = await generateScheduleAction(prev, formData);
      if (res.ok) router.refresh();
      return res;
    },
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="location_id" value={locationId} />
      <input type="hidden" name="week_start" value={weekStart} />
      <Button type="submit" disabled={pending || disabled}>
        {pending
          ? "Generating…"
          : existing
            ? strings.schedule.regenerate
            : strings.schedule.generate}
      </Button>
      {result && !result.ok && (
        <p className="text-sm text-danger">{result.error}</p>
      )}
    </form>
  );
}

export function PublishButton({ scheduleId }: { scheduleId: string }) {
  const router = useRouter();
  const [result, action, pending] = useActionState<PublishResult | null, FormData>(
    async (prev, formData) => {
      const res = await publishScheduleAction(prev, formData);
      if (res.ok) router.refresh();
      return res;
    },
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="schedule_id" value={scheduleId} />
      <Button type="submit" disabled={pending}>
        {pending ? "Publishing…" : strings.schedule.publish}
      </Button>
      {result && !result.ok && (
        <p className="text-sm text-danger">{result.error}</p>
      )}
    </form>
  );
}
