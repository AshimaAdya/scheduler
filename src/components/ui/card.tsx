import type { HTMLAttributes } from "react";

/** White card, hairline border, generous radius, no shadow (Design direction v1). */
export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-card border border-line bg-surface p-5 ${className}`}
      {...props}
    />
  );
}
