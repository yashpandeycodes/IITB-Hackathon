"use client";

/** Remove a session from the timetable: a `remove_session` change. */
import { useMemo, useState } from "react";

import { useReferenceData } from "@/hooks/use-reference-data";
import type { ChangeProposalRequestInput, SessionUser } from "@/lib/contracts";

import { kindFor, sessionsInScope } from "./change-scope";
import { Field, NoteField, Notice } from "./change-ui";
import { ProposalActions } from "./proposal-actions";
import { SessionSelect } from "./session-select";

export function RemoveSessionForm({
  user,
  initialSession,
}: {
  user: SessionUser;
  initialSession?: string | null;
}) {
  const { referenceData } = useReferenceData();
  const sessions = useMemo(
    () => sessionsInScope(user, referenceData),
    [user, referenceData],
  );
  const [choice, setChoice] = useState(initialSession ?? "");
  const [note, setNote] = useState("");

  if (sessions.length === 0) {
    return (
      <Notice tone="warning">There are no sessions you can remove.</Notice>
    );
  }

  const sessionId = sessions.some((s) => s.id === choice) ? choice : "";
  const blockedReason = sessionId ? null : "Choose a session.";
  const body: ChangeProposalRequestInput | null = blockedReason
    ? null
    : {
        kind: kindFor(user, "disruption"),
        description: note.trim() || undefined,
        changes: [{ type: "remove_session", session_id: sessionId }],
      };

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#98A6BB]">
        Drop a session for the rest of the semester. Nothing else moves; the
        removed session is listed in the diff.
      </p>
      <Field label="Session" htmlFor="remove-session">
        <SessionSelect
          id="remove-session"
          sessions={sessions}
          value={sessionId}
          onChange={setChoice}
        />
      </Field>
      <NoteField id="remove-note" value={note} onChange={setNote} />
      <ProposalActions body={body} blockedReason={blockedReason} />
    </div>
  );
}
