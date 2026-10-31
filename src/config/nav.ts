import {
  Bot,
  CalendarDays,
  ClipboardCheck,
  DoorOpen,
  GitPullRequestArrow,
  LayoutDashboard,
  NotebookPen,
  PartyPopper,
  Settings2,
  Ticket,
  type LucideIcon,
} from "lucide-react";

import { Role } from "@/lib/contracts/enums";

export type NavItem = {
  href: string;
  /** Sidebar label. */
  label: string;
  /** Compact label for the phone tab bar. */
  shortLabel: string;
  /** One line shown in the phone "More" sheet. */
  description: string;
  icon: LucideIcon;
  roles: readonly Role[];
  /** Shown in the phone bottom tab bar instead of the "More" sheet. */
  mobilePrimary: boolean;
};

const ALL_ROLES: readonly Role[] = Role.options;

/** Navigation per docs/frontend.md §4.1, in sidebar order. */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    shortLabel: "Dashboard",
    description: "KPIs, to-dos and quick actions",
    icon: LayoutDashboard,
    roles: ALL_ROLES,
    mobilePrimary: true,
  },
  {
    href: "/timetable",
    label: "Timetables",
    shortLabel: "Timetable",
    description: "Group, faculty and room grids",
    icon: CalendarDays,
    roles: ALL_ROLES,
    mobilePrimary: true,
  },
  {
    href: "/rooms",
    label: "Find a room",
    shortLabel: "Rooms",
    description: "Free rooms by time and needs",
    icon: DoorOpen,
    roles: ALL_ROLES,
    mobilePrimary: true,
  },
  {
    href: "/bookings",
    label: "Bookings",
    shortLabel: "Bookings",
    description: "Book a venue and track requests",
    icon: Ticket,
    roles: ALL_ROLES,
    mobilePrimary: false,
  },
  {
    href: "/spectra",
    label: "Spectra week",
    shortLabel: "Spectra",
    description: "Week 7 event decisions",
    icon: PartyPopper,
    roles: ALL_ROLES,
    mobilePrimary: false,
  },
  {
    href: "/approvals",
    label: "Approvals",
    shortLabel: "Approvals",
    description: "Review changes and lab bookings",
    icon: ClipboardCheck,
    roles: ["admin", "department_coordinator"],
    mobilePrimary: true,
  },
  {
    href: "/changes",
    label: "Changes",
    shortLabel: "Changes",
    description: "Leave, closures and change requests",
    icon: GitPullRequestArrow,
    roles: ["admin", "department_coordinator", "faculty"],
    mobilePrimary: false,
  },
  {
    href: "/assistant",
    label: "AI assistant",
    shortLabel: "Assistant",
    description: "Ask to move a class or find a slot",
    icon: Bot,
    roles: ["admin", "department_coordinator", "faculty"],
    mobilePrimary: false,
  },
  {
    href: "/exams",
    label: "Exams",
    shortLabel: "Exams",
    description: "Exam week grid, AM and PM slots",
    icon: NotebookPen,
    roles: ALL_ROLES,
    mobilePrimary: false,
  },
  {
    href: "/admin",
    label: "Admin",
    shortLabel: "Admin",
    description: "Data, generate, validate, export",
    icon: Settings2,
    roles: ["admin"],
    mobilePrimary: false,
  },
];

/** Phone tab bar holds this many destinations plus "More". */
export const MOBILE_TAB_COUNT = 4;

export function getNavForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

/**
 * Split a role's nav into phone tabs and the "More" sheet. Roles with fewer
 * `mobilePrimary` items (no Approvals) get the next items in nav order instead,
 * so the tab bar always has `MOBILE_TAB_COUNT` destinations.
 */
export function getMobileNavForRole(
  role: Role,
  count: number = MOBILE_TAB_COUNT,
): { primary: NavItem[]; more: NavItem[] } {
  const items = getNavForRole(role);
  const primary = items.filter((item) => item.mobilePrimary).slice(0, count);
  for (const item of items) {
    if (primary.length >= count) break;
    if (!primary.includes(item)) primary.push(item);
  }
  const ordered = items.filter((item) => primary.includes(item));
  return {
    primary: ordered,
    more: items.filter((item) => !primary.includes(item)),
  };
}

/** True when `pathname` is `href` or one of its sub-routes. */
export function isNavItemActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function findActiveNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => isNavItemActive(item.href, pathname));
}
