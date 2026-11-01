"use client";

/** A session picker grouped by course, with a quick text filter for long lists. */
import { useMemo, useState } from "react";

import { useReferenceData } from "@/hooks/use-reference-data";
import type { ReferenceSession } from "@/lib/contracts";

import { INPUT_CLASS } from "./change-ui";

export function SessionSelect({
  id,
  sessions,
  value,
  onChange,
}: {
  id: string;
  sessions: readonly ReferenceSession[];
  value: string;
  onChange: (sessionId: string) => void;
}) {
  const { courseName, facultyName } = useReferenceData();
  const [filter, setFilter] = useState("");

  const groups = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const byCourse = new Map<string, ReferenceSession[]>();
    for (const s of sessions) {
      const text =
        `${s.id} ${s.course_id} ${courseName(s.course_id)} ${s.faculty_id} ${s.groups.join(" ")}`.toLowerCase();
      if (needle && !text.includes(needle) && s.id !== value) continue;
      const list = byCourse.get(s.course_id) ?? [];
      list.push(s);
      byCourse.set(s.course_id, list);
    }
    return [...byCourse.entries()].sort(([a], [b]) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [sessions, filter, value, courseName]);

  return (
    <div className="space-y-1.5">
      {sessions.length > 20 ? (
        <input
          type="search"
          aria-label="Filter sessions"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by session, course, faculty or group…"
          className={INPUT_CLASS}
        />
      ) : null}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLASS}
      >
        <option value="">Choose a session…</option>
        {groups.map(([course, list]) => (
          <optgroup key={course} label={`${course} · ${courseName(course)}`}>
            {list.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} · {s.kind} · {s.groups.join(", ")} ·{" "}
                {facultyName(s.faculty_id)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
