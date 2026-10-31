import { describe, expect, it } from "vitest";

import { Role } from "@/lib/contracts/enums";

import {
  findActiveNavItem,
  getMobileNavForRole,
  getNavForRole,
  isNavItemActive,
  MOBILE_TAB_COUNT,
  NAV_ITEMS,
} from "./nav";

const hrefs = (items: { href: string }[]) => items.map((item) => item.href);

/** docs/frontend.md §4.1, in sidebar order. */
const EXPECTED_NAV: Record<Role, string[]> = {
  admin: [
    "/dashboard",
    "/timetable",
    "/rooms",
    "/bookings",
    "/spectra",
    "/approvals",
    "/changes",
    "/assistant",
    "/exams",
    "/admin",
  ],
  department_coordinator: [
    "/dashboard",
    "/timetable",
    "/rooms",
    "/bookings",
    "/spectra",
    "/approvals",
    "/changes",
    "/assistant",
    "/exams",
  ],
  faculty: [
    "/dashboard",
    "/timetable",
    "/rooms",
    "/bookings",
    "/spectra",
    "/changes",
    "/assistant",
    "/exams",
  ],
  club: [
    "/dashboard",
    "/timetable",
    "/rooms",
    "/bookings",
    "/spectra",
    "/exams",
  ],
};

const EXPECTED_MOBILE: Record<Role, { primary: string[]; more: string[] }> = {
  admin: {
    primary: ["/dashboard", "/timetable", "/rooms", "/approvals"],
    more: [
      "/bookings",
      "/spectra",
      "/changes",
      "/assistant",
      "/exams",
      "/admin",
    ],
  },
  department_coordinator: {
    primary: ["/dashboard", "/timetable", "/rooms", "/approvals"],
    more: ["/bookings", "/spectra", "/changes", "/assistant", "/exams"],
  },
  faculty: {
    primary: ["/dashboard", "/timetable", "/rooms", "/bookings"],
    more: ["/spectra", "/changes", "/assistant", "/exams"],
  },
  club: {
    primary: ["/dashboard", "/timetable", "/rooms", "/bookings"],
    more: ["/spectra", "/exams"],
  },
};

describe("getNavForRole", () => {
  it.each(Role.options)("matches the §4.1 table for %s", (role) => {
    expect(hrefs(getNavForRole(role))).toEqual(EXPECTED_NAV[role]);
  });

  it("gives every item at least one role and a unique href", () => {
    for (const item of NAV_ITEMS) expect(item.roles.length).toBeGreaterThan(0);
    expect(new Set(hrefs([...NAV_ITEMS])).size).toBe(NAV_ITEMS.length);
  });
});

describe("getMobileNavForRole", () => {
  it.each(Role.options)("splits tabs and the More sheet for %s", (role) => {
    const { primary, more } = getMobileNavForRole(role);
    expect(hrefs(primary)).toEqual(EXPECTED_MOBILE[role].primary);
    expect(hrefs(more)).toEqual(EXPECTED_MOBILE[role].more);
  });

  it.each(Role.options)("covers the whole nav exactly once for %s", (role) => {
    const { primary, more } = getMobileNavForRole(role);
    expect(primary).toHaveLength(MOBILE_TAB_COUNT);
    expect([...hrefs(primary), ...hrefs(more)].sort()).toEqual(
      hrefs(getNavForRole(role)).sort(),
    );
  });

  it("respects a smaller tab count", () => {
    const { primary, more } = getMobileNavForRole("admin", 2);
    expect(hrefs(primary)).toEqual(["/dashboard", "/timetable"]);
    expect(more).toHaveLength(8);
  });
});

describe("active route matching", () => {
  it("matches the route and its sub-routes only", () => {
    expect(isNavItemActive("/bookings", "/bookings")).toBe(true);
    expect(isNavItemActive("/bookings", "/bookings/new")).toBe(true);
    expect(isNavItemActive("/bookings", "/bookingsx")).toBe(false);
    expect(isNavItemActive("/admin", "/approvals")).toBe(false);
  });

  it("finds the section for nested routes", () => {
    expect(findActiveNavItem("/timetable/group/Y1-A")?.label).toBe(
      "Timetables",
    );
    expect(findActiveNavItem("/login")).toBeUndefined();
  });
});
