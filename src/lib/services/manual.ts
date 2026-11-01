import "server-only";
import type { Db } from "mongodb";
import type {
  Assignment,
  ChangeRequest,
  ManualPlacementRequest,
  SessionUser,
} from "@/lib/contracts";
import { checkPlacement } from "@/lib/engine";
import { hardConstraint } from "@/lib/errors";
import { proposeChange } from "./changes";

/**
 * Manual placement (`POST /api/manual/place`, architecture §9: admins anywhere, coordinators for
 * their department's sessions): pin one session at a slot, as a `manual_edit` change request that
 * an admin still approves.
 *
 * - `repair: false` (default): the slot must be free as the active timetable stands. The engine
 *   checks the placement with every other session where it is; any hard violation is a
 *   `409 HARD_CONSTRAINT` (details = the violations) and nothing is stored. A clean placement is
 *   proposed with no other session allowed to move (ejection depth 0).
 * - `repair: true`: whatever blocks the slot is moved (fewest moves), and the proposal is stored
 *   as `pending` or `infeasible` like any other change.
 *
 * Every other check (role and department scope, unknown ids, the pending cap, the lock) is
 * {@link proposeChange}'s.
 */
export async function placeManually(
  db: Db,
  user: SessionUser,
  body: ManualPlacementRequest,
): Promise<ChangeRequest> {
  const placement: Assignment = {
    session_id: body.session_id,
    day: body.day,
    start_period: body.start_period,
    room_id: body.room_id,
  };
  const request = {
    kind: "manual_edit" as const,
    changes: [],
    placements: [placement],
    ...(body.description !== undefined && { description: body.description }),
  };
  if (body.repair) return proposeChange(db, user, request);
  return proposeChange(db, user, request, {
    maxDepth: 0,
    precheck: ({ dataset, base }) => {
      const check = checkPlacement({
        dataset,
        assignments: base.assignments,
        placement,
      });
      if (check.ok) return;
      const n = check.violations.length;
      const blockers =
        check.blockers.length > 0
          ? ` (in the way: ${check.blockers.join(", ")})`
          : "";
      throw hardConstraint(
        `${placement.session_id} can't go to ${placement.day} P${placement.start_period} in ${placement.room_id}: it would break ${n} hard rule${n === 1 ? "" : "s"}${blockers}. Ask for a repair to move what's in the way.`,
        check.violations,
      );
    },
  });
}
