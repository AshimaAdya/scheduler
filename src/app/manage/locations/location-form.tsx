"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import {
  createLocation,
  updateLocation,
  type LocationResult,
} from "./actions";
import { strings } from "@/lib/strings";

type Props = {
  mode: "create" | "edit";
  location?: { id: string; name: string; address: string | null };
};

export function LocationForm({ mode, location }: Props) {
  const router = useRouter();
  const action = mode === "create" ? createLocation : updateLocation;
  const [result, formAction, pending] = useActionState<
    LocationResult | null,
    FormData
  >(async (prev, formData) => {
    const res = await action(prev, formData);
    if (res.ok && mode === "edit") router.push("/manage/locations");
    return res;
  }, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {mode === "edit" && <input type="hidden" name="id" value={location!.id} />}
      <Field
        label={strings.locations.nameLabel}
        name="name"
        required
        defaultValue={location?.name ?? ""}
      />
      <Field
        label={strings.locations.addressLabel}
        name="address"
        defaultValue={location?.address ?? ""}
      />
      {result?.ok === false && (
        <p className="text-sm text-danger">{result.error}</p>
      )}
      {result?.ok === true && mode === "create" && (
        <p className="text-sm text-ok">{strings.locations.created}</p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : strings.common.save}
        </Button>
      </div>
    </form>
  );
}
