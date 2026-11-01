"use client";

/**
 * Load a change file in the starter-pack format (`{ id?, dataset?, description?, changes }`,
 * CrunchWeek_StarterPack/README.md "Disruption file format"): pick or drop the JSON file (or
 * paste it), check it against the change-file schema, list what it changes, then preview and
 * file it as a `disruption`. Its `changes` are sent exactly as written.
 */
import { useMemo, useRef, useState, type DragEvent } from "react";
import { FileJson, Upload, X } from "lucide-react";

import { useReferenceData } from "@/hooks/use-reference-data";
import {
  DisruptionSchema,
  type ChangeProposalRequestInput,
  type DisruptionChange,
} from "@/lib/contracts";
import { cn } from "@/lib/utils";

import type { IssueLine } from "./api-errors";
import { formatDayList, formatPeriodList } from "./change-format";
import { Field, INPUT_CLASS, IssueList, Notice } from "./change-ui";
import { ProposalActions } from "./proposal-actions";

/** The request body takes these top-level fields; anything else in a file is left out. */
const FILE_FIELDS = ["id", "dataset", "description", "changes"] as const;
const MAX_FILE_BYTES = 1_000_000;

type Parsed =
  | { state: "empty" }
  | { state: "invalid"; title: string; issues: IssueLine[] }
  | {
      state: "ok";
      id: string | undefined;
      dataset: string | undefined;
      description: string | undefined;
      changes: DisruptionChange[];
      ignored: string[];
      body: ChangeProposalRequestInput;
    };

function issuePath(path: readonly PropertyKey[]): string {
  let out = "";
  for (const part of path) {
    if (typeof part === "number") out += `[${part}]`;
    else out += out === "" ? String(part) : `.${String(part)}`;
  }
  return out;
}

function parseChangeFile(text: string): Parsed {
  if (text.trim() === "") return { state: "empty" };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return {
      state: "invalid",
      title: "This isn't valid JSON.",
      issues: [
        {
          label: null,
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
  // A bare list of changes is accepted as `{ changes: [...] }`.
  if (Array.isArray(raw)) raw = { changes: raw };
  if (typeof raw !== "object" || raw === null) {
    return {
      state: "invalid",
      title: "A change file is a JSON object with a changes list.",
      issues: [],
    };
  }
  const record = raw as Record<string, unknown>;
  const result = DisruptionSchema.safeParse(record);
  const extra: IssueLine[] = [];
  for (const field of ["id", "dataset", "description"] as const)
    if (record[field] !== undefined && typeof record[field] !== "string")
      extra.push({ label: field, message: "Must be text." });
  if (!result.success || extra.length > 0) {
    return {
      state: "invalid",
      title: "This file doesn't match the change-file format.",
      issues: [
        ...extra,
        ...(result.success
          ? []
          : result.error.issues.slice(0, 20).map((issue) => ({
              label: issuePath(issue.path) || null,
              message: issue.message,
            }))),
      ],
    };
  }
  const changes = result.data.changes;
  if (changes.length === 0) {
    return {
      state: "invalid",
      title: "The file has no changes.",
      issues: [],
    };
  }
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const id = str(record.id);
  const dataset = str(record.dataset);
  const description = str(record.description);
  return {
    state: "ok",
    id,
    dataset,
    description,
    changes,
    ignored: Object.keys(record).filter(
      (k) => !(FILE_FIELDS as readonly string[]).includes(k),
    ),
    body: {
      kind: "disruption",
      ...(id !== undefined ? { id } : {}),
      ...(dataset !== undefined ? { dataset } : {}),
      ...(description !== undefined ? { description } : {}),
      // Sent exactly as written in the file (unknown keys included).
      changes: record.changes as ChangeProposalRequestInput["changes"],
    },
  };
}

const TYPE_LABELS: Record<DisruptionChange["type"], string> = {
  faculty_unavailable: "Faculty unavailable",
  room_unavailable: "Room closed",
  add_faculty: "Faculty added",
  add_session: "Session added",
  remove_session: "Session removed",
};

export function ChangeFileForm() {
  const { referenceData, facultyName, roomName } = useReferenceData();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const parsed = useMemo(() => parseChangeFile(text), [text]);

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    setReadError(null);
    if (file.size > MAX_FILE_BYTES) {
      setReadError(`${file.name} is over 1 MB; change files are far smaller.`);
      return;
    }
    try {
      setText(await file.text());
      setFileName(file.name);
    } catch {
      setReadError(`Couldn't read ${file.name}.`);
    }
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    void loadFile(e.dataTransfer.files?.[0]);
  };

  const clear = () => {
    setText("");
    setFileName(null);
    setReadError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const describe = (c: DisruptionChange): string => {
    switch (c.type) {
      case "faculty_unavailable":
        return `${c.faculty_id} (${facultyName(c.faculty_id)}) unavailable ${formatDayList(c.days)} ${formatPeriodList(c.periods)}${c.reason ? ` · ${c.reason}` : ""}`;
      case "room_unavailable":
        return `${c.room_id} (${roomName(c.room_id)}) closed ${formatDayList(c.days)} ${formatPeriodList(c.periods)}${c.reason ? ` · ${c.reason}` : ""}`;
      case "add_faculty":
        return `New faculty ${c.faculty.id}${c.faculty.name ? ` · ${c.faculty.name}` : ""}${c.faculty.department ? ` (${c.faculty.department})` : ""}`;
      case "add_session":
        return `New ${c.session.kind} ${c.session.id} · ${c.session.course_id} · ${c.session.groups.join(", ")} · ${c.session.faculty_id} · ${c.session.duration} period${c.session.duration === 1 ? "" : "s"}${c.session.fixed_slot ? ` · fixed ${c.session.fixed_slot.day} P${c.session.fixed_slot.start_period}` : ""}`;
      case "remove_session":
        return `Remove ${c.session_id}`;
    }
  };

  const counts =
    parsed.state === "ok"
      ? Object.entries(
          parsed.changes.reduce<Record<string, number>>((acc, c) => {
            acc[c.type] = (acc[c.type] ?? 0) + 1;
            return acc;
          }, {}),
        )
      : [];
  const datasetMismatch =
    parsed.state === "ok" &&
    parsed.dataset !== undefined &&
    referenceData.dataset_id !== "" &&
    parsed.dataset !== referenceData.dataset_id;

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#98A6BB]">
        Load a change file in the starter-pack format (faculty unavailable, room
        closed, faculty or session added, session removed). The engine proposes
        the fix with the fewest moves; nothing changes until it is approved.
      </p>

      <label
        htmlFor="change-file-input"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "block cursor-pointer space-y-2 rounded-2xl border-2 border-dashed p-6 text-center transition-colors",
          dragging
            ? "border-[#8279FF] bg-[#8279FF]/15"
            : "border-[#8279FF]/40 bg-[#12082b] hover:border-[#8279FF]/70",
        )}
      >
        <Upload className="mx-auto size-7 text-[#8279FF]" aria-hidden="true" />
        <div className="text-sm font-bold text-white">
          Drop a change file here, or tap to choose one
        </div>
        <div className="text-xs text-[#98A6BB]">
          JSON · {"{ id, dataset, description, changes: [...] }"}
        </div>
        <input
          ref={inputRef}
          id="change-file-input"
          type="file"
          accept=".json,application/json"
          className="sr-only"
          onChange={(e) => void loadFile(e.target.files?.[0])}
        />
      </label>

      {readError ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200"
        >
          {readError}
        </div>
      ) : null}

      <Field
        label={fileName ? `Contents of ${fileName}` : "Or paste the JSON"}
        htmlFor="change-file-text"
      >
        <textarea
          id="change-file-text"
          rows={fileName ? 8 : 5}
          spellCheck={false}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (fileName) setFileName(null);
          }}
          placeholder='{ "changes": [ { "type": "room_unavailable", "room_id": "…", "days": ["MON"], "periods": [1, 2], "reason": "…" } ] }'
          className={cn(INPUT_CLASS, "resize-y")}
        />
      </Field>
      {text ? (
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1 font-mono text-[11px] text-[#98A6BB] hover:bg-white/10"
        >
          <X className="size-3" aria-hidden="true" /> Clear
        </button>
      ) : null}

      {parsed.state === "invalid" ? (
        <IssueList title={parsed.title} issues={parsed.issues} />
      ) : null}
      {parsed.state === "invalid" && parsed.issues.length === 0 ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200"
        >
          {parsed.title}
        </div>
      ) : null}

      {parsed.state === "ok" ? (
        <section
          aria-label="Change file summary"
          className="space-y-3 rounded-2xl border border-white/10 bg-[#101A2B] p-4"
        >
          <div className="flex items-start gap-2">
            <FileJson
              className="mt-0.5 size-4 shrink-0 text-[#8279FF]"
              aria-hidden="true"
            />
            <div className="min-w-0 space-y-0.5">
              <div className="font-mono text-xs font-bold break-all text-white">
                {parsed.id ?? fileName ?? "Change file"}
                {parsed.dataset ? (
                  <span className="font-normal text-[#98A6BB]">
                    {" "}
                    · for {parsed.dataset}
                  </span>
                ) : null}
              </div>
              {parsed.description ? (
                <p className="text-xs break-words text-[#98A6BB]">
                  {parsed.description}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {counts.map(([type, n]) => (
              <span
                key={type}
                className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white/90"
              >
                {n} × {TYPE_LABELS[type as DisruptionChange["type"]] ?? type}
              </span>
            ))}
          </div>
          <ol className="list-decimal space-y-1 pl-5 font-mono text-[11px] text-white/85">
            {parsed.changes.map((c, i) => (
              <li key={i} className="break-words">
                {describe(c)}
              </li>
            ))}
          </ol>
          {datasetMismatch ? (
            <Notice tone="warning">
              This file was written for {parsed.dataset}, but{" "}
              {referenceData.dataset_id} is loaded. It can still be applied if
              its ids exist.
            </Notice>
          ) : null}
          {parsed.ignored.length > 0 ? (
            <Notice tone="warning">
              Left out (not part of the change-file format):{" "}
              {parsed.ignored.join(", ")}.
            </Notice>
          ) : null}
        </section>
      ) : null}

      <ProposalActions
        body={parsed.state === "ok" ? parsed.body : null}
        blockedReason={
          parsed.state === "empty"
            ? "Load or paste a change file."
            : parsed.state === "invalid"
              ? "Fix the file first."
              : null
        }
        hint="Filed as a change file (disruption): an admin can approve it after reviewing the moves."
      />
    </div>
  );
}
