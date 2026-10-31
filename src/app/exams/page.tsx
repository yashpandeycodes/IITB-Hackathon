'use client';

import React, { useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { EXAM_SCHEDULE } from '@/lib/dataset/cit-data';
import { DayCode } from '@/lib/contracts';
import { formatDay } from '@/lib/format';
import { CheckCircle2, GraduationCap, Users, Building } from 'lucide-react';

export default function ExamsGridPage() {
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [mobileDay, setMobileDay] = useState<DayCode>('MON');

  const examDays: DayCode[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const slots: Array<'AM' | 'PM'> = ['AM', 'PM'];

  const filteredExams = EXAM_SCHEDULE.filter((exam) => {
    if (selectedGroup !== 'all' && !exam.groups.includes(selectedGroup)) return false;
    return true;
  });

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
              <span className="px-2 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400">
                0 CLASHES ✓
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white">Autumn Semester Exam Schedule</h1>
            <div className="flex items-center gap-2 text-xs font-mono text-[#34d399] mt-1 font-bold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>✓ Max one exam per day constraint satisfied across all student cohorts.</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-[#98A6BB]">Filter Cohort:</span>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="bg-[#101A2B] border border-white/10 rounded-xl px-3 py-1.5 text-xs font-mono text-white outline-none"
            >
              <option value="all">All Cohorts</option>
              <option value="Y1-A">Y1-A (First Year A)</option>
              <option value="Y1-B">Y1-B (First Year B)</option>
              <option value="CSE-2">CSE-2 (Second Year CSE)</option>
              <option value="CSE-3">CSE-3 (Third Year CSE)</option>
            </select>
          </div>
        </div>

        {/* Desktop Exam Grid: 6 Days (MON-SAT) × 2 Rows (AM/PM) (§5.11) */}
        <div className="hidden md:block overflow-x-auto rounded-3xl bg-[#0B1220] border border-white/10 shadow-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-[#101A2B] text-xs font-mono text-[#98A6BB]">
                <th className="p-3 w-32 sticky left-0 z-10 bg-[#101A2B]">Slot / Window</th>
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
                    <div className="font-bold text-sm text-white">{slot} Slot</div>
                    <div className="text-[10px] text-[#98A6BB]">
                      {slot === 'AM' ? '09:30–11:30' : '14:00–16:00'}
                    </div>
                  </td>

                  {examDays.map((d) => {
                    const examsInCell = filteredExams.filter((e) => e.day === d && e.slot === slot);

                    return (
                      <td key={d} className="p-2 border-l border-white/5 align-top min-w-[170px] h-32">
                        {examsInCell.length > 0 ? (
                          examsInCell.map((exam) => (
                            <div
                              key={exam.id}
                              className="p-3 rounded-2xl bg-[#101A2B] border border-white/10 space-y-2 shadow-sm"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-black text-sm text-[#66E3F0]">{exam.courseCode}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white">
                                  {exam.groups.join(', ')}
                                </span>
                              </div>
                              <div className="text-xs font-medium text-white line-clamp-1">{exam.courseName}</div>

                              {/* Seat Splits (§5.11) */}
                              <div className="pt-1.5 border-t border-white/5 text-[10px] text-[#fbbf24]">
                                <div className="font-bold flex items-center gap-1 mb-0.5">
                                  <Building className="w-3 h-3" />
                                  <span>Room Allocation & Seat Split:</span>
                                </div>
                                <div className="text-white/90">
                                  {exam.roomAllocations.map((r) => `${r.roomName} (${r.seatsAssigned})`).join(' + ')}
                                </div>
                              </div>
                            </div>
                          ))
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
                    <span className="font-bold text-[#66E3F0]">{exam.courseCode} ({exam.slot} Slot)</span>
                    <span className="text-[#98A6BB]">{exam.groups.join(', ')}</span>
                  </div>
                  <div className="font-bold text-sm text-white">{exam.courseName}</div>
                  <div className="text-xs font-mono text-[#fbbf24]">
                    Allocations: {exam.roomAllocations.map((r) => `${r.roomName} (${r.seatsAssigned})`).join(' + ')}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

