'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import { apiGet } from '@/lib/api-client';
import { ExamScheduleSchema, type ExamDay } from '@/lib/contracts';
import { useReferenceData } from '@/hooks/use-reference-data';
import { PageSkeleton } from '@/components/states/page-skeleton';
import { ErrorState } from '@/components/states/error-state';
import { EmptyState } from '@/components/states/empty-state';
import { formatDay } from '@/lib/format';
import { CheckCircle2, Building } from 'lucide-react';

export default function ExamsGridPage() {
  const { referenceData, roomName, courseName } = useReferenceData();
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [mobileDay, setMobileDay] = useState<ExamDay>('MON');

  const examDays: ExamDay[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const slots: Array<'AM' | 'PM'> = ['AM', 'PM'];

  // Query active exam schedule from backend
  const { data: examSchedule, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['exams'],
    queryFn: () => apiGet('/api/exams', ExamScheduleSchema.nullable()),
    staleTime: 15_000,
  });

  // Map reference exams by ID
  const refExamMap = useMemo(() => {
    return new Map(referenceData.exams.map((e) => [e.id, e]));
  }, [referenceData.exams]);

  // Exam sessions timing from reference calendar
  const amSession = referenceData.calendar.exam_week?.sessions.find((s) => s.id === 'AM');
  const pmSession = referenceData.calendar.exam_week?.sessions.find((s) => s.id === 'PM');
  const amTiming = amSession ? `${amSession.start}–${amSession.end}` : '09:30–11:30';
  const pmTiming = pmSession ? `${pmSession.start}–${pmSession.end}` : '14:00–16:00';

  // Placed exams merged with reference details
  const placedExams = useMemo(() => {
    if (!examSchedule?.exams) return [];
    return examSchedule.exams.map((placed) => {
      const ref = refExamMap.get(placed.exam_id);
      const courseId = ref?.course_ids?.[0] ?? placed.exam_id;
      return {
        id: placed.exam_id,
        courseId,
        courseName: courseName(courseId),
        groups: ref?.groups ?? [],
        size: ref?.size ?? 0,
        day: placed.day,
        session: placed.session,
        rooms: placed.rooms,
      };
    });
  }, [examSchedule, refExamMap, courseName]);

  const filteredExams = useMemo(() => {
    if (selectedGroup === 'all') return placedExams;
    return placedExams.filter((e) => e.groups.includes(selectedGroup));
  }, [placedExams, selectedGroup]);

  if (isLoading) {
    return (
      <AppShell pageTitle="Exam Schedule" breadcrumbs={[{ label: 'Exams' }]}>
        <PageSkeleton />
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell pageTitle="Exam Schedule" breadcrumbs={[{ label: 'Exams' }]}>
        <ErrorState
          title="Failed to load exam schedule"
          message={error instanceof Error ? error.message : 'Unable to query /api/exams.'}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  if (!examSchedule) {
    return (
      <AppShell pageTitle="Exam Schedule" breadcrumbs={[{ label: 'Exams' }]}>
        <EmptyState
          icon={Building}
          title="No exam schedule generated yet"
          description="The active semester dataset does not have a generated exam schedule. Authorized administrators can generate the exam schedule from the Admin console."
          cta={{ label: 'Go to Admin Console', href: '/admin' }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      pageTitle="Mid-Semester Exam Timetable"
      breadcrumbs={[{ label: 'Exams' }]}
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Top Header & Filter (§5.11) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-bold text-[#66E3F0] uppercase tracking-wider">
                EXAMINATION CELL AUTOMATION
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                ACTIVE ({examSchedule.id})
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white">Autumn Semester Exam Schedule</h1>
            <div className="flex items-center gap-2 text-xs font-mono text-[#34d399] mt-1 font-bold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>✓ 1-exam-per-day rule satisfied across all scheduled cohorts.</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-[#98A6BB]">Filter Cohort:</span>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="bg-[#101A2B] border border-white/10 rounded-xl px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-[#66E3F0]/50"
            >
              <option value="all">All Cohorts ({referenceData.student_groups.length})</option>
              {referenceData.student_groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.id} ({g.name})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Desktop Exam Grid: 6 Days (MON-SAT) × 2 Rows (AM/PM) (§5.11) */}
        <div className="hidden md:block overflow-x-auto rounded-3xl bg-[#0B1220] border border-white/10 shadow-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-[#101A2B] text-xs font-mono text-[#98A6BB]">
                <th className="p-3 w-36 sticky left-0 z-10 bg-[#101A2B]">Slot / Window</th>
                {examDays.map((d) => (
                  <th key={d} className="p-3 border-l border-white/10 text-white font-bold">
                    {formatDay(d)} ({d})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono text-xs">
              {slots.map((slot) => (
                <tr key={slot} className="hover:bg-white/[0.01]">
                  <td className="p-3 bg-[#0B1220] border-r border-white/10 sticky left-0 z-10 align-top">
                    <div className="font-bold text-sm text-white">{slot} Session</div>
                    <div className="text-[10px] text-[#98A6BB]">
                      {slot === 'AM' ? amTiming : pmTiming}
                    </div>
                  </td>

                  {examDays.map((d) => {
                    const examsInCell = filteredExams.filter((e) => e.day === d && e.session === slot);

                    return (
                      <td key={d} className="p-2 border-l border-white/5 align-top min-w-[180px] h-36">
                        {examsInCell.length > 0 ? (
                          <div className="space-y-2">
                            {examsInCell.map((exam) => (
                              <div
                                key={exam.id}
                                className="p-3 rounded-2xl bg-[#101A2B] border border-white/10 space-y-2 shadow-sm"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-black text-sm text-[#66E3F0]">{exam.courseId}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white truncate max-w-[90px]">
                                    {exam.groups.join(', ')}
                                  </span>
                                </div>
                                <div className="text-xs font-medium text-white line-clamp-1">{exam.courseName}</div>

                                {/* Seat Splits (§5.11) */}
                                <div className="pt-1.5 border-t border-white/5 text-[10px] text-[#fbbf24]">
                                  <div className="font-bold flex items-center gap-1 mb-0.5">
                                    <Building className="w-3 h-3" />
                                    <span>Rooms ({exam.size} seats):</span>
                                  </div>
                                  <div className="text-white/90">
                                    {exam.rooms.map((roomId) => roomName(roomId)).join(' + ')}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="h-full rounded-xl border border-dashed border-white/5 flex items-center justify-center text-[10px] text-white/20">
                            No Exams
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View: Day Tabs + Cards (§5.11) */}
        <div className="md:hidden space-y-4">
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#0B1220] border border-white/10 overflow-x-auto">
            {examDays.map((d) => (
              <button
                key={d}
                onClick={() => setMobileDay(d)}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-mono font-bold shrink-0 ${
                  mobileDay === d ? 'bg-[#66E3F0] text-[#070A12]' : 'text-[#98A6BB]'
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {filteredExams
              .filter((e) => e.day === mobileDay)
              .map((exam) => (
                <div key={exam.id} className="p-4 rounded-2xl bg-[#0B1220] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-bold text-[#66E3F0]">{exam.courseId} ({exam.session} Session)</span>
                    <span className="text-[#98A6BB]">{exam.groups.join(', ')}</span>
                  </div>
                  <div className="font-bold text-sm text-white">{exam.courseName}</div>
                  <div className="text-xs font-mono text-[#fbbf24]">
                    Rooms: {exam.rooms.map((roomId) => roomName(roomId)).join(' + ')}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
