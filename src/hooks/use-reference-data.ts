"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiGet } from "@/lib/api-client";
import { ReferenceDataSchema, type ReferenceData } from "@/lib/contracts/ui";

export const REFERENCE_QUERY_KEY = ["reference"] as const;

const EMPTY_REFERENCE: ReferenceData = {
  rooms: [],
  faculty: [],
  student_groups: [],
  courses: [],
  sessions: [],
  exams: [],
  booking_requests: [],
  calendar_periods: [],
};

export function useReferenceData() {
  const query = useQuery({
    queryKey: REFERENCE_QUERY_KEY,
    queryFn: async (): Promise<ReferenceData> => {
      try {
        return await apiGet("/api/reference", ReferenceDataSchema);
      } catch {
        // If /api/reference is not yet mounted on the backend, return empty fallback without throwing
        return EMPTY_REFERENCE;
      }
    },
    staleTime: Infinity,
  });

  const lookups = useMemo(() => {
    const data = query.data ?? EMPTY_REFERENCE;
    const roomMap = new Map<string, string>();
    const facultyMap = new Map<string, string>();
    const groupMap = new Map<string, string>();
    const courseMap = new Map<string, string>();

    data.rooms?.forEach((r) => roomMap.set(r.id, r.name));
    data.faculty?.forEach((f) => facultyMap.set(f.id, f.name));
    data.student_groups?.forEach((g) => groupMap.set(g.id, g.name));
    data.courses?.forEach((c) => courseMap.set(c.code, c.name));

    return {
      roomName: (id: string) => roomMap.get(id) ?? id,
      facultyName: (id: string) => facultyMap.get(id) ?? id,
      groupName: (id: string) => groupMap.get(id) ?? id,
      courseName: (code: string) => courseMap.get(code) ?? code,
      roomMap,
      facultyMap,
      groupMap,
      courseMap,
    };
  }, [query.data]);

  return {
    ...query,
    ...lookups,
    referenceData: query.data ?? EMPTY_REFERENCE,
  };
}

export function useInvalidateReference() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: REFERENCE_QUERY_KEY });
}

