/**
 * Extra sessions requested by faculty ("I need an extra CS202 tutorial"): a new session modelled
 * on an existing one, ready to go into an `add_session` change.
 */
import type { Dataset, Session, SessionKind } from "@/lib/contracts";

/**
 * The next free id in a template's pattern: `CS202-T1` → `CS202-T2` (one past the highest number
 * already used with that prefix), `X` → `X-2`.
 */
function nextId(templateId: string, taken: ReadonlySet<string>): string {
  const match = /^(.*?)(\d+)$/.exec(templateId);
  const prefix = match ? match[1] : `${templateId}-`;
  let highest = match ? Number(match[2]) : 1;
  for (const id of taken) {
    if (!id.startsWith(prefix)) continue;
    const rest = id.slice(prefix.length);
    if (/^\d+$/.test(rest)) highest = Math.max(highest, Number(rest));
  }
  let n = highest + 1;
  while (taken.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/**
 * A new session modelled on an existing one of the same course and kind (groups, size, duration,
 * room types, accessibility; never its basket or fixed slot), taught by `faculty_id`, with the
 * next free id in the template's pattern (`CS202-T1` → `CS202-T2`). Null when the course has no
 * session of that kind.
 *
 * The template is the first such session taught by `faculty_id`, else the first outside a basket,
 * else the first. The new session needs an accessible room when the template does, or when the
 * teacher or one of its groups needs one (as the dataset's own sessions do).
 */
export function deriveExtraSession(
  dataset: Dataset,
  input: { course_id: string; kind: SessionKind; faculty_id: string },
): Session | null {
  const same = dataset.sessions.filter(
    (s) => s.course_id === input.course_id && s.kind === input.kind,
  );
  if (same.length === 0) return null;
  const template =
    same.find((s) => s.faculty_id === input.faculty_id && !s.basket_slot) ??
    same.find((s) => !s.basket_slot) ??
    same[0];
  const facultyNeeds = dataset.faculty.some(
    (f) => f.id === input.faculty_id && f.needs_accessible,
  );
  const groupNeeds = dataset.student_groups.some(
    (g) => template.groups.includes(g.id) && g.needs_accessible,
  );
  return {
    id: nextId(template.id, new Set(dataset.sessions.map((s) => s.id))),
    course_id: template.course_id,
    kind: template.kind,
    groups: [...template.groups],
    faculty_id: input.faculty_id,
    size: template.size,
    duration: template.duration,
    room_types: [...template.room_types],
    needs_accessible: template.needs_accessible || facultyNeeds || groupNeeds,
    basket_slot: null,
    fixed_slot: null,
  };
}
