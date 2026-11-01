"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Info } from "lucide-react";

import { ErrorState } from "@/components/states/error-state";
import { TimetableGrid } from "@/components/timetable/timetable-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { useReferenceData } from "@/hooks/use-reference-data";
import { apiGet } from "@/lib/api-client";
import {
  TimetableViewSchema,
  type ChangeRequest,
  type DayCode,
  type PeriodId,
  type SessionItem,
  type TimetableAssignment,
  type TimetableViewKind,
} from "@/lib/contracts";

import { errorMessage } from "./approval-utils";
import { buildSessionInfo } from "./session-info";

type Mode = "before" | "after" | "overlay";
type Entity = { view: TimetableViewKind; id: string };
type Placement = {
  session_id: string;
  day: string;
  start_period: number;
  room_id: string;
};

const MODES: { id: Mode; label: string; active: string }[] = [
  { id: "before", label: "Before", active: "bg-white/20 text-white" },
  { id: "after", label: "After", active: "bg-[#10b981] text-black" },
  { id: "overlay", label: "Overlay", active: "bg-[#8279FF] text-white" },
];

const VIEW_LABEL: Record<TimetableViewKind, string> = {
  group: "Groups",
  faculty: "Faculty",
  room: "Rooms",
};

const keyOf = (e: Entity) => `${e.view}:${e.id}`;

/**
 * Before / After / Overlay of one affected group's, teacher's or room's week. The active
 * timetable is either the version the proposal was built on or the one it produced; sessions
 * outside `diff` hold the same slot in both, so the other side is that view with the moves
 * applied (or undone).
 */
export function ChangeDiffGrid({ change }: { change: ChangeRequest }) {
  const { referenceData, roomName, facultyName, courseName, groupName } =
    useReferenceData();
  const [mode, setMode] = useState<Mode>("overlay");

  const entities = useMemo<Entity[]>(
    () => [
      ...change.scope.group_ids.map((id) => ({ view: "group" as const, id })),
      ...change.scope.faculty_ids.map((id) => ({
        view: "faculty" as const,
        id,
      })),
      ...change.scope.room_ids.map((id) => ({ view: "room" as const, id })),
    ],
    [change.scope],
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const entity =
    entities.find((e) => keyOf(e) === selectedKey) ?? entities[0] ?? null;

  // Same key and payload as the timetable explorer, so both screens share the cache.
  const view = entity?.view ?? "group";
  const viewId = entity?.id ?? "";
  const timetable = useQuery({
    queryKey: ["timetable", view, viewId, "regular"],
    queryFn: ({ signal }) =>
      apiGet(
        `/api/timetable?view=${encodeURIComponent(view)}&id=${encodeURIComponent(viewId)}&week=regular`,
        TimetableViewSchema,
        { signal },
      ),
    enabled: entity !== null,
    staleTime: 10_000,
  });

  const computed = useMemo(() => {
    const data = timetable.data;
    if (!data || !entity) return null;
    const info = buildSessionInfo(referenceData.sessions, change, data.cells);
    const diffIds = new Set(change.diff.map((d) => d.session_id));
    const belongs = (sessionId: string, roomId: string) => {
      if (entity.view === "room") return roomId === entity.id;
      const s = info.get(sessionId);
      if (!s) return false;
      return entity.view === "group"
        ? s.groups.includes(entity.id)
        : s.faculty_id === entity.id;
    };

    const unchanged: Placement[] = data.cells
      .filter((c) => !diffIds.has(c.session_id))
      .map((c) => ({
        session_id: c.session_id,
        day: c.day,
        start_period: c.start_period,
        room_id: c.room_id,
      }));
    const fromSide: Placement[] = [];
    const toSide: Placement[] = [];
    for (const d of change.diff) {
      if (d.from && belongs(d.session_id, d.from.room_id))
        fromSide.push({ session_id: d.session_id, ...d.from });
      if (d.to && belongs(d.session_id, d.to.room_id))
        toSide.push({ session_id: d.session_id, ...d.to });
    }

    const sessions: SessionItem[] = [];
    for (const id of new Set(
      [...unchanged, ...fromSide, ...toSide].map((p) => p.session_id),
    )) {
      const s = info.get(id);
      if (!s) continue;
      sessions.push({
        id,
        courseCode: s.course_id,
        courseName: courseName(s.course_id),
        kind: s.kind,
        groups: s.groups,
        facultyId: s.faculty_id,
        facultyName: facultyName(s.faculty_id),
        durationPeriods: s.duration,
        studentCount: s.size,
      });
    }

    const toAssignment = (p: Placement): TimetableAssignment => ({
      sessionId: p.session_id,
      day: p.day as DayCode,
      period: `P${p.start_period}` as PeriodId,
      roomId: p.room_id,
      roomName: roomName(p.room_id),
    });
    const sameCell = (a: Placement, b: Placement) =>
      a.day === b.day && a.start_period === b.start_period;

    const basis =
      data.version_id !== null && data.version_id === change.base_version
        ? "base"
        : change.proposed_version !== null &&
            data.version_id === change.proposed_version
          ? "proposed"
          : null;

    return {
      versionId: data.version_id,
      basis,
      sessions,
      before: [...unchanged, ...fromSide].map(toAssignment),
      after: [...unchanged, ...toSide].map(toAssignment),
      unchanged: unchanged.map(toAssignment),
      // A room-only move lands in the same cell: show only the new placement there.
      ghosts: fromSide
        .filter((g) => !toSide.some((n) => sameCell(g, n)))
        .map((p) => ({ ...toAssignment(p), isGhost: true })),
      news: toSide.map((p) => ({ ...toAssignment(p), isNew: true })),
      movesHere: new Set([...fromSide, ...toSide].map((p) => p.session_id))
        .size,
    };
  }, [
    timetable.data,
    entity,
    referenceData.sessions,
    change,
    roomName,
    courseName,
    facultyName,
  ]);

  if (!entity) return null;

  const entityName = (e: Entity) =>
    e.view === "group"
      ? groupName(e.id)
      : e.view === "faculty"
        ? facultyName(e.id)
        : roomName(e.id);

  return (
    <div className="space-y-4 rounded-3xl border border-white/10 bg-[#0B1220] p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="font-mono text-sm font-bold tracking-wider text-white uppercase">
            Timetable diff
          </h2>
          <p className="mt-0.5 text-xs text-[#98A6BB]">
            Pick an affected group, teacher or room to see its week before and
            after this change.
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Diff view"
          className="flex self-start rounded-xl border border-white/10 bg-[#101A2B] p-1 font-mono text-xs"
        >
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              onClick={() => setMode(m.id)}
              className={`rounded-lg px-3 py-1 font-bold transition-all ${
                mode === m.id ? m.active : "text-[#98A6BB] hover:text-white"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {(["group", "faculty", "room"] as const).map((view) => {
          const list = entities.filter((e) => e.view === view);
          if (list.length === 0) return null;
          return (
            <div key={view} className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 shrink-0 font-mono text-[10px] text-[#98A6BB] uppercase">
                {VIEW_LABEL[view]}
              </span>
              {list.map((e) => {
                const active = keyOf(e) === keyOf(entity);
                return (
                  <button
                    key={keyOf(e)}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedKey(keyOf(e))}
                    title={entityName(e)}
                    className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] font-bold transition-colors ${
                      active
                        ? "border-[#66E3F0]/60 bg-[#66E3F0]/20 text-[#66E3F0]"
                        : "border-white/10 bg-[#101A2B] text-[#98A6BB] hover:text-white"
                    }`}
                  >
                    {e.id}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
        <span className="text-white">
          {VIEW_LABEL[entity.view].replace(/s$/, "")}:{" "}
          <span className="font-bold text-[#66E3F0]">{entityName(entity)}</span>
          {computed
            ? ` · ${computed.movesHere} ${computed.movesHere === 1 ? "move" : "moves"} here`
            : ""}
        </span>
        {mode === "overlay" ? (
          <span className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1 text-rose-300">
              <span className="inline-block h-2.5 w-2.5 rounded border border-rose-500/60 bg-rose-500/30" />
              Old slot
            </span>
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="inline-block h-2.5 w-2.5 rounded border border-emerald-500/60 bg-emerald-500/30" />
              New slot
            </span>
          </span>
        ) : null}
        <Link
          href={`/timetable/${entity.view}/${encodeURIComponent(entity.id)}`}
          className="inline-flex items-center gap-1 text-[#66E3F0] hover:underline"
        >
          Current timetable
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>

      {timetable.isLoading ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : timetable.isError ? (
        <ErrorState
          title="Couldn't load this timetable"
          message={errorMessage(timetable.error)}
          onRetry={() => void timetable.refetch()}
        />
      ) : !computed || computed.versionId === null ? (
        <Notice text="No active timetable yet, so there is nothing to compare against." />
      ) : computed.basis === null ? (
        <Notice
          text={`The active timetable (${computed.versionId}) is neither the one this proposal was built on (${change.base_version}) nor the one it produced, so a before/after grid would be misleading. The moves table lists exactly what this change does.`}
        />
      ) : (
        <TimetableGrid
          assignments={
            mode === "before"
              ? computed.before
              : mode === "after"
                ? computed.after
                : computed.unchanged
          }
          sessions={computed.sessions}
          mode={mode === "overlay" ? "diff" : "view"}
          ghostAssignments={mode === "overlay" ? computed.ghosts : undefined}
          newAssignments={mode === "overlay" ? computed.news : undefined}
        />
      )}
    </div>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-white/10 bg-[#101A2B] p-4 text-xs text-[#cbd5e1]">
      <Info
        className="mt-0.5 h-4 w-4 shrink-0 text-[#66E3F0]"
        aria-hidden="true"
      />
      <span>{text}</span>
    </div>
  );
}
