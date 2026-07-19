import { journeyStep } from "@/lib/coverage/journey";
import { strings } from "@/lib/strings";

const LABELS = [strings.journey.team, strings.journey.other, strings.journey.manager];

/**
 * Three-dot progress: your team → other locations → your manager. Filled dots =
 * reached, the current step is accented, and "covered" fills them all. Presents
 * the friendly journey label — never "Tier N".
 */
export function ProgressDots({ status }: { status: string }) {
  const j = journeyStep(status);
  if (!j) return null;

  const label = j.complete ? strings.journey.done : LABELS[j.step - 1];

  return (
    <div className="flex flex-col gap-1" aria-label={label}>
      <div className="flex items-center gap-1.5">
        {[1, 2, 3].map((i) => {
          const reached = j.complete || i <= j.step;
          return (
            <span
              key={i}
              className={`h-2 w-2 rounded-full ${reached ? "bg-accent" : "bg-line"}`}
            />
          );
        })}
      </div>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
