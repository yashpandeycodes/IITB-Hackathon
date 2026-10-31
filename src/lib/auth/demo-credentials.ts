import "server-only";

/**
 * Passwords for the four public demo accounts (also listed in the README).
 * Kept server-side so they never ship in a client bundle; only the user seed reads them.
 */
export const DEMO_PASSWORDS: Readonly<Record<string, string>> = {
  "admin@cit.demo": "Admin@123",
  "coord.cse@cit.demo": "Coord@123",
  "faculty@cit.demo": "Faculty@123",
  "club@cit.demo": "Club@123",
};
