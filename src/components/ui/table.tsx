import type { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from "react";

/** Minimal table styled per design tokens: hairline row dividers, uppercase faint headers. */
export function Table({ className = "", ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <table className={`w-full border-collapse text-sm ${className}`} {...props} />
    </div>
  );
}

export function Th({ className = "", ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`border-b border-line px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-faint ${className}`}
      {...props}
    />
  );
}

export function Td({ className = "", ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={`border-b border-line px-4 py-3 text-ink ${className}`} {...props} />
  );
}
