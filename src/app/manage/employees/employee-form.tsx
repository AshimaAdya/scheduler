"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/field";
import { strings } from "@/lib/strings";
import { createEmployee, updateEmployee, type EmployeeResult } from "./actions";

type EmployeeValues = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  skills: string[];
  max_weekly_hours: number;
  home_location_id: string | null;
  notify_pref: string;
};

type Props = {
  mode: "create" | "edit";
  employee?: EmployeeValues;
  locations: { id: string; name: string }[];
};

export function EmployeeForm({ mode, employee, locations }: Props) {
  const router = useRouter();
  const action = mode === "create" ? createEmployee : updateEmployee;

  const [result, formAction, pending] = useActionState<
    EmployeeResult | null,
    FormData
  >(async (prev, formData) => {
    const res = await action(prev, formData);
    if (res.ok) router.push("/manage/employees");
    return res;
  }, null);

  const errors = result && !result.ok ? result.errors : undefined;
  const f = strings.person.fields;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {mode === "edit" && <input type="hidden" name="id" value={employee!.id} />}

      <Field
        label={f.name}
        name="full_name"
        required
        defaultValue={employee?.full_name ?? ""}
        error={errors?.full_name}
      />
      <Field
        label={f.email}
        name="email"
        type="email"
        required
        defaultValue={employee?.email ?? ""}
        error={errors?.email}
      />
      <Field
        label={f.phone}
        name="phone"
        defaultValue={employee?.phone ?? ""}
        error={errors?.phone}
      />
      <SelectField
        label={f.role}
        name="role"
        defaultValue={employee?.role ?? "employee"}
        error={errors?.role}
      >
        <option value="employee">{strings.person.roles.employee}</option>
        <option value="manager">{strings.person.roles.manager}</option>
        <option value="admin">{strings.person.roles.admin}</option>
      </SelectField>
      <Field
        label={f.skills}
        name="skills"
        hint={f.skillsHint}
        defaultValue={employee?.skills.join(", ") ?? ""}
      />
      <Field
        label={f.maxHours}
        name="max_weekly_hours"
        type="number"
        min={0}
        max={168}
        defaultValue={employee?.max_weekly_hours ?? 40}
        error={errors?.max_weekly_hours}
      />
      <SelectField
        label={f.homeLocation}
        name="home_location_id"
        defaultValue={employee?.home_location_id ?? ""}
      >
        <option value="">—</option>
        {locations.map((loc) => (
          <option key={loc.id} value={loc.id}>
            {loc.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label={f.notifyPref}
        name="notify_pref"
        defaultValue={employee?.notify_pref ?? "both"}
      >
        <option value="both">{strings.settings.channels.both}</option>
        <option value="email">{strings.settings.channels.email}</option>
        <option value="sms">{strings.settings.channels.sms}</option>
      </SelectField>

      {mode === "create" && (
        <p className="text-sm text-muted">{strings.person.inviteNote}</p>
      )}
      {result && !result.ok && result.error && (
        <p className="text-sm text-danger">{result.error}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : strings.common.save}
        </Button>
      </div>
    </form>
  );
}
