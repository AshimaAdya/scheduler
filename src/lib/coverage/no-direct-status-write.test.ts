import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Guard test (SCH-18 AC): the ONLY code allowed to write `coverage_requests.status`
 * is `lib/coverage/transition.ts`. This scans the source tree for any other file
 * that runs a `coverage_requests` update setting `status`, and fails if found.
 */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// A coverage_requests update whose object literal sets `status`.
const COVERAGE_STATUS_WRITE =
  /coverage_requests[\s\S]{0,400}?\.update\(\s*\{[\s\S]{0,400}?\bstatus\b/;

describe("no direct coverage status writes", () => {
  it("only transition.ts writes coverage_requests.status", () => {
    const files = walk("src");
    const offenders = files.filter((file) => {
      if (file.replace(/\\/g, "/").endsWith("lib/coverage/transition.ts")) return false;
      const src = readFileSync(file, "utf8");
      return COVERAGE_STATUS_WRITE.test(src);
    });
    expect(offenders).toEqual([]);
  });
});
