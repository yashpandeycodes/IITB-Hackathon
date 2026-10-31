/**
 * Booking priority, ported from `validator.py`'s `effective_category`.
 */
import type { Category } from "./enums";

/** Cap applied to a role that is missing from `role_category_cap`. */
const DEFAULT_ROLE_CAP: Category = "club_event";

export type PriorityRules = {
  /** Highest first. Pass the dataset's order, or the admin-edited copy from settings. */
  priority_order: readonly Category[];
  role_category_cap: Readonly<Record<string, Category>>;
};

/**
 * The category a request is ranked by: the lower of what it claims and what its role may
 * claim. An unknown role is capped at `club_event`; an unknown claimed category ranks lowest.
 */
export function effectiveCategory(
  rules: PriorityRules,
  request: { role: string; requested_category: string },
): Category {
  const order = rules.priority_order;
  const cap = Object.hasOwn(rules.role_category_cap, request.role)
    ? rules.role_category_cap[request.role]
    : DEFAULT_ROLE_CAP;
  const claimed = order.indexOf(request.requested_category as Category);
  const rank = Math.max(
    claimed === -1 ? order.length - 1 : claimed,
    order.indexOf(cap),
  );
  return order[rank];
}
