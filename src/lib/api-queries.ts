"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  apiGet,
  apiPatch,
  apiPost,
  ApiClientError,
  isApiClientError,
} from "@/lib/api-client";
import {
  ActivateTimetableResultSchema,
  DashboardSchema,
  ExamScheduleSchema,
  GenerateTimetableResultSchema,
  ResetReportSchema,
  RoomAvailabilitySchema,
  SettingsPatchSchema,
  SettingsSchema,
  SpectraRunResultSchema,
  TimetableCheckRequestSchema,
  TimetableCheckResultSchema,
  TimetableVersionSummarySchema,
  TimetableViewSchema,
  UserSchema,
  ValidatorReportSchema,
  type ActivateTimetableResult,
  type Dashboard,
  type ExamSchedule,
  type GenerateTimetableRequest,
  type GenerateTimetableResult,
  type ResetReport,
  type ResetRequest,
  type RoomAvailability,
  type RoomAvailabilityQuery,
  type Settings,
  type SettingsPatch,
  type SolverProgress,
  type SpectraRunResult,
  type TimetableCheckRequest,
  type TimetableCheckResult,
  type TimetableVersionSummary,
  type TimetableView,
  type TimetableViewQuery,
  type User,
  type ValidatorReport,
} from "@/lib/contracts";

export { ApiClientError, isApiClientError };

// ==========================================
// 1. Central Query Keys
// ==========================================

export const queryKeys = {
  auth: {
    me: ["auth", "me"] as const,
  },
  dashboard: ["dashboard"] as const,
  timetable: {
    view: (query: Partial<TimetableViewQuery>) =>
      ["timetable", "view", query.view, query.id, query.week ?? "regular"] as const,
    versions: ["timetable", "versions"] as const,
  },
  rooms: {
    available: (query: Partial<RoomAvailabilityQuery>) =>
      ["rooms", "available", query] as const,
  },
  exams: ["exams"] as const,
  spectra: ["spectra"] as const,
  validate: ["validate"] as const,
  settings: ["settings"] as const,
};

// ==========================================
// 2. Query Hooks
// ==========================================

/** Current authenticated session user (`GET /api/auth/me`). */
export function useCurrentUser() {
  const query = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: () => apiGet("/api/auth/me", UserSchema),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return {
    ...query,
    user: query.data,
    role: query.data?.role,
    isAuthenticated: Boolean(query.data),
  };
}

/** Operational dashboard metrics (`GET /api/dashboard`). */
export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => apiGet("/api/dashboard", DashboardSchema),
    staleTime: 15_000,
  });
}

/** Weekly timetable view by group, faculty, or room (`GET /api/timetable`). */
export function useTimetable(query: TimetableViewQuery) {
  const params = new URLSearchParams({
    view: query.view,
    id: query.id,
    week: query.week ?? "regular",
  });

  return useQuery({
    queryKey: queryKeys.timetable.view(query),
    queryFn: () => apiGet(`/api/timetable?${params.toString()}`, TimetableViewSchema),
    enabled: Boolean(query.view && query.id),
  });
}

/** Room availability search for a period window (`GET /api/rooms/available`). */
export function useRoomAvailability(query?: RoomAvailabilityQuery) {
  const params = new URLSearchParams();
  if (query) {
    params.set("day", query.day);
    params.set("from_period", String(query.from_period));
    params.set("to_period", String(query.to_period));
    if (query.use) params.set("use", query.use);
    if (query.min_capacity !== undefined)
      params.set("min_capacity", String(query.min_capacity));
    if (query.needs && query.needs.length > 0)
      params.set("needs", query.needs.join(","));
    if (query.types && query.types.length > 0)
      params.set("types", query.types.join(","));
    if (query.accessible !== undefined)
      params.set("accessible", String(query.accessible));
  }

  const enabled = Boolean(
    query &&
      query.day &&
      query.from_period !== undefined &&
      query.to_period !== undefined,
  );

  return useQuery({
    queryKey: queryKeys.rooms.available(query ?? {}),
    queryFn: () =>
      apiGet(
        `/api/rooms/available?${params.toString()}`,
        z.array(RoomAvailabilitySchema),
      ),
    enabled,
  });
}

/** Active midsem exam schedule (`GET /api/exams`). */
export function useExams() {
  return useQuery({
    queryKey: queryKeys.exams,
    queryFn: () => apiGet("/api/exams", ExamScheduleSchema.nullable()),
  });
}

/** Validator report checking active schedule health (`GET /api/validate`). */
export function useValidatorReport() {
  return useQuery({
    queryKey: queryKeys.validate,
    queryFn: () => apiGet("/api/validate", ValidatorReportSchema),
  });
}

/** System operational settings (`GET /api/settings`). */
export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => apiGet("/api/settings", SettingsSchema),
  });
}

/** Timetable history versions (`GET /api/timetable/versions`). */
export function useTimetableVersions() {
  return useQuery({
    queryKey: queryKeys.timetable.versions,
    queryFn: () =>
      apiGet(
        "/api/timetable/versions",
        z.array(TimetableVersionSummarySchema),
      ),
  });
}

// ==========================================
// 3. Mutation Hooks
// ==========================================

/** Reset demo data to bundled or uploaded state (`POST /api/admin/reset`). */
export function useResetDemoData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body?: ResetRequest) =>
      apiPost("/api/admin/reset", body ?? { from: "bundled" }, ResetReportSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: ["timetable"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.exams });
      queryClient.invalidateQueries({ queryKey: queryKeys.validate });
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
    },
  });
}

/** Activate a specific timetable version (`POST /api/timetable/versions/:id/activate`). */
export function useActivateTimetable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (versionId: string) =>
      apiPost(
        `/api/timetable/versions/${encodeURIComponent(versionId)}/activate`,
        undefined,
        ActivateTimetableResultSchema,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: ["timetable"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.validate });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
    },
  });
}

/** Generate a midsem exam schedule (`POST /api/exams/generate`). */
export function useGenerateExams() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiPost("/api/exams/generate", undefined, ExamScheduleSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.exams });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: queryKeys.validate });
    },
  });
}

/** Run Spectra Week-7 event decisions (`POST /api/spectra/run`). */
export function useRunSpectra() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiPost("/api/spectra/run", undefined, SpectraRunResultSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: ["timetable"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.validate });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
    },
  });
}

/** Update settings patch (`PATCH /api/settings`). */
export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: SettingsPatch) =>
      apiPatch("/api/settings", patch, SettingsSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

/** What-if schedule check (`POST /api/timetable/check`). */
export function useCheckTimetable() {
  return useMutation({
    mutationFn: (request: TimetableCheckRequest) =>
      apiPost(
        "/api/timetable/check",
        request,
        TimetableCheckResultSchema,
      ),
  });
}

// ==========================================
// 4. Live Progress SSE Helper
// ==========================================

export interface StreamTimetableCallbacks {
  onProgress: (progress: SolverProgress) => void;
  onResult: (result: GenerateTimetableResult) => void;
  onError: (error: { code: string; message: string; details?: unknown }) => void;
}

/**
 * Initiates timetable generation with streamed Server-Sent Events (`POST /api/timetable/generate`).
 */
export async function streamGenerateTimetable(
  request: GenerateTimetableRequest,
  callbacks: StreamTimetableCallbacks,
): Promise<void> {
  const response = await fetch("/api/timetable/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    const message =
      errorJson?.error?.message ??
      `Failed to generate timetable (HTTP ${response.status})`;
    callbacks.onError({
      code: errorJson?.error?.code ?? "GENERATION_FAILED",
      message,
      details: errorJson?.error?.details,
    });
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onError({
      code: "NO_STREAM",
      message: "Streaming response body is not supported.",
    });
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";

    for (const block of lines) {
      if (!block.trim()) continue;
      const eventMatch = block.match(/^event:\s*(\w+)/m);
      const dataMatch = block.match(/^data:\s*(.+)$/m);

      if (!eventMatch || !dataMatch) continue;
      const event = eventMatch[1];
      const rawData = dataMatch[1];

      try {
        const parsed = JSON.parse(rawData);
        if (event === "progress") {
          callbacks.onProgress(parsed as SolverProgress);
        } else if (event === "result") {
          callbacks.onResult(parsed as GenerateTimetableResult);
        } else if (event === "error") {
          callbacks.onError(parsed);
        }
      } catch (err) {
        console.error("Failed to parse SSE frame:", err, rawData);
      }
    }
  }
}

