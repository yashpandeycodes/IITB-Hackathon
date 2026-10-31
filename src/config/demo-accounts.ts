import type { Role, User } from "@/lib/contracts";

/**
 * The four public demo accounts (docs/architecture.md §9); one-click login cards
 * for them are added to /login with real sign-in. Identity fields mirror the `User` contract; passwords live server-side
 * only (they are also listed in the README for judges). Icons come from
 * `ROLE_META[role].icon`.
 */
export type DemoAccount = Pick<
  User,
  "id" | "email" | "name" | "role" | "department" | "faculty_id" | "club"
> & {
  /** Card heading on the login page. */
  title: string;
  /** One line: what this role can do. */
  description: string;
};

export const DEMO_ACCOUNTS = [
  {
    id: "u_admin",
    role: "admin",
    email: "admin@cit.demo",
    name: "Dean's Office",
    title: "Admin",
    description:
      "Generate timetables, run Spectra decisions and approve changes.",
    department: null,
    faculty_id: null,
    club: null,
  },
  {
    id: "u_coord_cse",
    role: "department_coordinator",
    email: "coord.cse@cit.demo",
    name: "CSE Coordinator",
    title: "Dept coordinator",
    description:
      "Manage CSE timetables, approve CSE lab bookings, request changes.",
    department: "CSE",
    faculty_id: null,
    club: null,
  },
  {
    id: "u_faculty_f06",
    role: "faculty",
    email: "faculty@cit.demo",
    name: "Dr. Arjun Mehta",
    title: "Faculty",
    description:
      "See your week, mark leave and ask the AI assistant to move a class.",
    department: "CSE",
    faculty_id: "F06",
    club: null,
  },
  {
    id: "u_club_dramatics",
    role: "club",
    email: "club@cit.demo",
    name: "Dramatics Society",
    title: "Club rep",
    description:
      "Book a venue in plain language and track each decision's reason.",
    department: null,
    faculty_id: null,
    club: "Dramatics Society",
  },
] as const satisfies readonly DemoAccount[];

export function getDemoAccount(role: Role): DemoAccount {
  const account = DEMO_ACCOUNTS.find((a) => a.role === role);
  if (!account) throw new Error(`No demo account for role "${role}"`);
  return account;
}
