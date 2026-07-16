import { describe, it, expect } from "vitest";
import { parseCsv, processEmployeeCsv } from "./csv";

const LOCATIONS = [
  { id: "loc-gastown", name: "Gastown" },
  { id: "loc-kits", name: "Kitsilano" },
];

const HEADER = "name,email,phone,role,skills,max_weekly_hours,home_location";

describe("parseCsv", () => {
  it("parses quoted fields containing commas", () => {
    const rows = parseCsv('a,"b, c",d\n1,"2, 3",4');
    expect(rows[0]).toEqual(["a", "b, c", "d"]);
    expect(rows[1]).toEqual(["1", "2, 3", "4"]);
  });

  it("handles escaped quotes", () => {
    expect(parseCsv('"he said ""hi"""')[0]).toEqual(['he said "hi"']);
  });
});

describe("processEmployeeCsv", () => {
  it("accepts valid rows and resolves the home location by name", () => {
    const csv = `${HEADER}\nJordan Tse,jordan@x.test,604 555 1234,employee,"barista, cashier",32,Gastown`;
    const plan = processEmployeeCsv(csv, LOCATIONS, []);
    expect(plan.counts).toEqual({ ok: 1, duplicate: 0, error: 0 });
    const row = plan.rows[0];
    expect(row.status).toBe("ok");
    expect(row.data?.home_location_id).toBe("loc-gastown");
    expect(row.data?.phone).toBe("+16045551234");
    expect(row.data?.skills).toEqual(["barista", "cashier"]);
  });

  it("reports malformed rows with line numbers without aborting valid rows", () => {
    const csv = [
      HEADER,
      "Good One,good@x.test,,employee,barista,20,Gastown", // line 2 ok
      "Bad Email,not-an-email,,employee,barista,20,Gastown", // line 3 error
      "Also Good,good2@x.test,,manager,,40,", // line 4 ok
    ].join("\n");
    const plan = processEmployeeCsv(csv, LOCATIONS, []);
    expect(plan.counts.ok).toBe(2);
    expect(plan.counts.error).toBe(1);
    const bad = plan.rows.find((r) => r.status === "error");
    expect(bad?.line).toBe(3);
    expect(bad?.errors?.length).toBeGreaterThan(0);
  });

  it("flags an unknown location as an error with its line", () => {
    const csv = `${HEADER}\nX,x@x.test,,employee,barista,20,Nowhere`;
    const plan = processEmployeeCsv(csv, LOCATIONS, []);
    expect(plan.rows[0].status).toBe("error");
    expect(plan.rows[0].line).toBe(2);
  });

  it("skips duplicate emails within the file and against existing", () => {
    const csv = [
      HEADER,
      "A,dup@x.test,,employee,barista,20,Gastown", // ok
      "B,dup@x.test,,employee,barista,20,Gastown", // duplicate in file
      "C,already@x.test,,employee,barista,20,Gastown", // duplicate vs existing
    ].join("\n");
    const plan = processEmployeeCsv(csv, LOCATIONS, ["already@x.test"]);
    expect(plan.counts.ok).toBe(1);
    expect(plan.counts.duplicate).toBe(2);
  });

  it("ignores blank lines", () => {
    const csv = `${HEADER}\n\nA,a@x.test,,employee,barista,20,Gastown\n`;
    const plan = processEmployeeCsv(csv, LOCATIONS, []);
    expect(plan.rows).toHaveLength(1);
  });
});
