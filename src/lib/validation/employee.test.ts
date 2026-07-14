import { describe, it, expect } from "vitest";
import { parseSkills, validateEmployee } from "./employee";

describe("parseSkills", () => {
  it("splits, trims, lowercases, and dedupes", () => {
    expect(parseSkills("Barista, cashier , barista")).toEqual([
      "barista",
      "cashier",
    ]);
  });
  it("returns an empty array for blank input", () => {
    expect(parseSkills("   ")).toEqual([]);
  });
});

describe("validateEmployee", () => {
  const valid = {
    full_name: "Jordan Tse",
    email: "Jordan@Harbour.test",
    phone: "604 555 1234",
    role: "employee",
    skills: "barista, cashier",
    max_weekly_hours: "32",
    home_location_id: "10000000-0000-0000-0000-000000000001",
  };

  it("accepts and normalizes valid input", () => {
    const result = validateEmployee(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.email).toBe("jordan@harbour.test");
      expect(result.data.phone).toBe("+16045551234");
      expect(result.data.skills).toEqual(["barista", "cashier"]);
      expect(result.data.max_weekly_hours).toBe(32);
      expect(result.data.role).toBe("employee");
    }
  });

  it("requires a name", () => {
    const result = validateEmployee({ ...valid, full_name: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.full_name).toBeDefined();
  });

  it("rejects a bad email", () => {
    const result = validateEmployee({ ...valid, email: "not-an-email" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.email).toBeDefined();
  });

  it("rejects an invalid role", () => {
    const result = validateEmployee({ ...valid, role: "superuser" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.role).toBeDefined();
  });

  it("rejects an unparseable phone", () => {
    const result = validateEmployee({ ...valid, phone: "123" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.phone).toBeDefined();
  });

  it("allows a blank phone (optional)", () => {
    const result = validateEmployee({ ...valid, phone: "" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.phone).toBeNull();
  });

  it("rejects out-of-range hours", () => {
    const result = validateEmployee({ ...valid, max_weekly_hours: "200" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.max_weekly_hours).toBeDefined();
  });
});
