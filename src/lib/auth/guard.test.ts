import { describe, it, expect } from "vitest";
import { canAccessRoute, isManagerRole, redirectTargetFor } from "./guard";

describe("isManagerRole", () => {
  it("treats manager and admin as manager-level", () => {
    expect(isManagerRole("manager")).toBe(true);
    expect(isManagerRole("admin")).toBe(true);
  });
  it("rejects employee and null", () => {
    expect(isManagerRole("employee")).toBe(false);
    expect(isManagerRole(null)).toBe(false);
    expect(isManagerRole(undefined)).toBe(false);
  });
});

describe("canAccessRoute", () => {
  it("allows anyone (even unauthenticated) on public routes", () => {
    expect(canAccessRoute(null, "/login")).toBe(true);
    expect(canAccessRoute(null, "/accept-invite")).toBe(true);
    expect(canAccessRoute(null, "/forgot-password")).toBe(true);
    expect(canAccessRoute(null, "/auth/confirm")).toBe(true);
  });

  it("denies unauthenticated users on protected routes", () => {
    expect(canAccessRoute(null, "/dashboard")).toBe(false);
    expect(canAccessRoute(null, "/manage")).toBe(false);
  });

  it("lets any authenticated role into non-manager routes", () => {
    expect(canAccessRoute("employee", "/dashboard")).toBe(true);
    expect(canAccessRoute("manager", "/dashboard")).toBe(true);
  });

  it("blocks employees from manager routes but allows managers/admins", () => {
    expect(canAccessRoute("employee", "/manage")).toBe(false);
    expect(canAccessRoute("employee", "/manage/employees")).toBe(false);
    expect(canAccessRoute("manager", "/manage/employees")).toBe(true);
    expect(canAccessRoute("admin", "/manage/settings")).toBe(true);
  });

  it("does not treat lookalike paths as manager routes", () => {
    // "/management-report" must not match the "/manage" prefix.
    expect(canAccessRoute("employee", "/management-report")).toBe(true);
  });
});

describe("redirectTargetFor", () => {
  it("returns null when access is allowed", () => {
    expect(redirectTargetFor("employee", "/dashboard")).toBeNull();
    expect(redirectTargetFor(null, "/login")).toBeNull();
  });
  it("sends unauthenticated users to /login", () => {
    expect(redirectTargetFor(null, "/dashboard")).toBe("/login");
  });
  it("sends wrong-role users to /dashboard", () => {
    expect(redirectTargetFor("employee", "/manage")).toBe("/dashboard");
  });
});
