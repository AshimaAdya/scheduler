import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from "react";

const controlBase =
  "w-full rounded-control border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent";

function Label({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-semibold text-ink">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-faint">{hint}</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  );
}

/** Labeled text input with hint + inline error, styled per design tokens. */
export function Field({
  label,
  hint,
  error,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  return (
    <Label label={label} hint={hint} error={error}>
      <input
        className={`${controlBase} ${error ? "border-danger" : "border-line"} ${className}`}
        {...props}
      />
    </Label>
  );
}

/** Labeled select, matching Field. */
export function SelectField({
  label,
  hint,
  error,
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  return (
    <Label label={label} hint={hint} error={error}>
      <select
        className={`${controlBase} ${error ? "border-danger" : "border-line"} ${className}`}
        {...props}
      >
        {children}
      </select>
    </Label>
  );
}
