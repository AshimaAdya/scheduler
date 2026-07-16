"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Table, Th, Td } from "@/components/ui/table";
import { strings } from "@/lib/strings";
import type { ImportPlan, ImportRowStatus } from "@/lib/employees/csv";
import { previewImport, runImport, type RunImportResult } from "./actions";

const statusTone: Record<ImportRowStatus, "ok" | "warn" | "danger"> = {
  ok: "ok",
  duplicate: "warn",
  error: "danger",
};

export function ImportForm() {
  const router = useRouter();
  const [csvText, setCsvText] = useState("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [result, setResult] = useState<RunImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setPlan(null);
    setResult(null);
    setError(null);
    const file = e.target.files?.[0];
    setCsvText(file ? await file.text() : "");
  }

  function preview() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await previewImport(csvText);
      if (res.ok) setPlan(res.plan);
      else setError(res.error);
    });
  }

  function confirmImport() {
    setError(null);
    startTransition(async () => {
      const res = await runImport(csvText);
      if (res.ok) {
        setResult(res);
        setPlan(null);
        router.refresh();
      } else setError(res.error);
    });
  }

  const label = { ...strings.import };

  return (
    <div className="flex flex-col gap-4">
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={onFile}
        className="text-sm"
      />

      <div className="flex gap-2">
        <Button onClick={preview} disabled={pending || !csvText}>
          {label.preview}
        </Button>
        {plan && plan.counts.ok > 0 && (
          <Button variant="secondary" onClick={confirmImport} disabled={pending}>
            {pending ? label.importing : label.confirm}
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {result?.ok && (
        <p className="text-sm text-ok">
          {label.done(result.imported, result.skipped, result.failed)}
          {result.errors.length > 0 && (
            <span className="mt-2 block text-danger">
              {result.errors.map((er) => (
                <span key={er} className="block">
                  {er}
                </span>
              ))}
            </span>
          )}
        </p>
      )}

      {plan && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            {label.summary(plan.counts.ok, plan.counts.duplicate, plan.counts.error)}
          </p>
          <Table>
            <thead>
              <tr>
                <Th>{label.columns.line}</Th>
                <Th>{label.columns.name}</Th>
                <Th>{label.columns.email}</Th>
                <Th>{label.columns.status}</Th>
              </tr>
            </thead>
            <tbody>
              {plan.rows.map((row) => (
                <tr key={row.line}>
                  <Td className="text-faint">{row.line}</Td>
                  <Td>{row.name || "—"}</Td>
                  <Td className="text-muted">{row.email || "—"}</Td>
                  <Td>
                    <Chip tone={statusTone[row.status]}>{label[row.status]}</Chip>
                    {row.errors && (
                      <span className="mt-1 block text-xs text-danger">
                        {row.errors.join(" ")}
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
