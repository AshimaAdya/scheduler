"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/field";
import { strings } from "@/lib/strings";
import {
  createTemplates,
  updateTemplate,
  type PatternResult,
} from "./actions";

export const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

type TemplateValues = {
  id: string;
  location_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  required_skill: string;
  headcount: number;
};

type Props = {
  mode: "create" | "edit";
  template?: TemplateValues;
  locations: { id: string; name: string }[];
};

export function PatternForm({ mode, template, locations }: Props) {
  const router = useRouter();
  const action = mode === "create" ? createTemplates : updateTemplate;

  const [result, formAction, pending] = useActionState<
    PatternResult | null,
    FormData
  >(async (prev, formData) => {
    const res = await action(prev, formData);
    if (res.ok) router.push("/manage/patterns");
    return res;
  }, null);

  const f = strings.patterns.fields;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {mode === "edit" && <input type="hidden" name="id" value={template!.id} />}

      <SelectField
        label={f.location}
        name="location_id"
        required
        defaultValue={template?.location_id ?? locations[0]?.id ?? ""}
      >
        {locations.map((loc) => (
          <option key={loc.id} value={loc.id}>
            {loc.name}
          </option>
        ))}
      </SelectField>

      {mode === "create" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-ink">{f.weekdays}</legend>
          <div className="flex flex-wrap gap-3">
            {WEEKDAYS.map((d) => (
              <label key={d.value} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="weekdays" value={d.value} />
                {d.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <SelectField
          label={f.weekday}
          name="weekday"
          defaultValue={template!.weekday}
        >
          {WEEKDAYS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </SelectField>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={f.start}
          name="start_time"
          type="time"
          required
          defaultValue={template?.start_time ?? "09:00"}
        />
        <Field
          label={f.end}
          name="end_time"
          type="time"
          required
          defaultValue={template?.end_time ?? "17:00"}
        />
      </div>

      <Field
        label={f.skill}
        name="required_skill"
        hint={f.skillHint}
        required
        defaultValue={template?.required_skill ?? ""}
      />
      <Field
        label={f.headcount}
        name="headcount"
        type="number"
        min={1}
        required
        defaultValue={template?.headcount ?? 1}
      />

      {result && !result.ok && (
        <p className="text-sm text-danger">{result.error}</p>
      )}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : strings.common.save}
        </Button>
      </div>
    </form>
  );
}
