/**
 * Turns an `ApiClientError`'s `details` into lines a form can list: `PathIssue[]`
 * (`{path, message}`, 400), `{ issues: string[] }` (403 scope), `Violation[]`
 * (`{rule, detail}`, 409 HARD_CONSTRAINT) and Zod's flattened `{formErrors, fieldErrors}`.
 */
import { isApiClientError } from "@/lib/api-client";

export type IssueLine = {
  /** A field path (`changes[0].faculty_id`) or a rule code (`H4`); null when there is none. */
  label: string | null;
  message: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fromItem(item: unknown): IssueLine | null {
  if (typeof item === "string") return { label: null, message: item };
  if (!isRecord(item)) return null;
  if (typeof item.message === "string")
    return {
      label:
        typeof item.path === "string" && item.path !== "" ? item.path : null,
      message: item.message,
    };
  if (typeof item.rule === "string" && typeof item.detail === "string")
    return { label: item.rule, message: item.detail };
  return null;
}

export function errorIssues(error: unknown): IssueLine[] {
  if (!isApiClientError(error)) return [];
  const details = error.details;
  const lines: IssueLine[] = [];
  if (Array.isArray(details)) {
    for (const item of details) {
      const line = fromItem(item);
      if (line) lines.push(line);
    }
  } else if (isRecord(details)) {
    if (Array.isArray(details.issues))
      for (const item of details.issues) {
        const line = fromItem(item);
        if (line) lines.push(line);
      }
    if (Array.isArray(details.formErrors))
      for (const message of details.formErrors)
        if (typeof message === "string") lines.push({ label: null, message });
    if (isRecord(details.fieldErrors))
      for (const [field, messages] of Object.entries(details.fieldErrors))
        if (Array.isArray(messages))
          for (const message of messages)
            if (typeof message === "string")
              lines.push({ label: field, message });
  }
  return lines;
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
