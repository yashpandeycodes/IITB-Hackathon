'use client';

import React from 'react';
import {
  AlertCircle,
  FileSpreadsheet,
  Unplug,
  Split,
  CheckCircle2,
  TrendingDown,
  ArrowRight,
} from 'lucide-react';
import { Card3D } from '@/components/ui/card-3d';

export const ProblemSection: React.FC = () => {
  const problems = [
    {
      num: '01',
      title: 'Resource Collisions at Scale',
      subtitle: 'Static spreadsheets cannot handle dynamic campus life',
      description:
        'Lectures, mid-term examinations, guest workshops, and club activities compete simultaneously for premium tiered halls and GPU computing labs. Without continuous cross-cohort constraint verification, double bookings are discovered only after faculty and students arrive.',
      impact: 'Up to 14 double-booking incidents per semester in unmanaged environments.',
      icon: Split,
      glowColor: 'rgba(239, 68, 68, 0.25)',
      accentColor: '#EF4444',
    },
    {
      num: '02',
      title: 'Mismatched Requisition Formats',
      subtitle: 'Informal paper slips, emails, and missing specifications',
      description:
        'Booking requests arrive in scattered formats—informal emails to department heads, WhatsApp threads, or verbal requisitions. Crucial details like microphone needs, projector compatibility, or headcount limits get lost in translation.',
      impact: '80% of booking delays trace back to back-and-forth email clarifications.',
      icon: FileSpreadsheet,
      glowColor: 'rgba(245, 158, 11, 0.25)',
      accentColor: '#F59E0B',
    },
    {
      num: '03',
      title: 'The Unforeseen Ripple Effect',
      subtitle: 'A single hardware fault causes campus-wide scheduling chaos',
      description:
        'When an air conditioning failure or electrical outage strikes a 120-seat lecture theatre, manual coordinators scramble. Relocating that single batch displaces an upcoming elective, which displaces an evening tutorial, causing a domino effect of cancellations.',
      impact: '1 room outage historically cascades into 4 to 6 canceled sessions.',
      icon: Unplug,
      glowColor: 'rgba(99, 102, 241, 0.3)',
      accentColor: '#6366F1',
    },
    {
      num: '04',
      title: 'Lack of Unified Operational Telemetry',
      subtitle: 'Deans and coordinators operate with fragmented spatial visibility',
      description:
        'Departments guard their seminar rooms in silos while central lecture complexes sit under-utilized or dark. Without real-time spatial analytics, institute administration cannot make informed capital expansion or operational decisions.',
      impact: '24% of campus capacity sits idle during peak academic hours.',
      icon: TrendingDown,
      glowColor: 'rgba(34, 211, 238, 0.25)',
      accentColor: '#22D3EE',
    },
  ];

  return (
    <section id="problem-narrative" className="relative py-20 lg:py-32 scroll-mt-20 border-t border-[rgba(255, 255, 255, 0.08)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0D1426] border border-[rgba(255, 255, 255, 0.08)] mb-4 text-xs font-mono font-semibold text-[#EF4444] shadow-sm">
            <AlertCircle className="w-3.5 h-3.5 text-[#EF4444]" />
            <span>THE CAMPUS LOGISTICS CHALLENGE</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#F8FAFC] tracking-tight leading-[1.12] mb-4">
            A university is not a static building—it is a{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#6366F1] via-[#818CF8] to-[#22D3EE]">
              high-frequency synchronization problem.
            </span>
          </h2>
          <p className="text-base sm:text-lg text-[#A7B3C9] font-normal leading-relaxed">
            When academic timetables, examinations, department symposiums, and student initiatives operate in disconnected tools, friction compounds. CIT Nexus reconciles this spatial complexity.
          </p>
        </div>

        {/* 4-Card 3D Tilt Problem Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {problems.map((p) => {
            const Icon = p.icon;
            return (
              <Card3D key={p.num} glowColor={p.glowColor} depth={10}>
                <div className="p-6 sm:p-8 rounded-2xl bg-[#0D1426] border border-[rgba(255, 255, 255, 0.08)] hover:border-[#6366F1]/50 transition-all duration-300 flex flex-col justify-between h-full shadow-lg backdrop-blur-xl">
                  <div>
                    <div className="flex items-center justify-between mb-5">
                      <span className="font-mono text-2xl font-black text-[#A7B3C9]/40">
                        {p.num}
                      </span>
                      <div
                        className="p-2.5 rounded-xl bg-[#111B30] border border-[rgba(255, 255, 255, 0.08)] shadow-sm"
                        style={{ color: p.accentColor }}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                    </div>

                    <h3 className="text-xl font-bold text-[#F8FAFC] mb-1.5">
                      {p.title}
                    </h3>
                    <div
                      className="text-xs font-mono font-semibold mb-3"
                      style={{ color: p.accentColor }}
                    >
                      {p.subtitle}
                    </div>
                    <p className="text-xs sm:text-sm text-[#A7B3C9] font-normal leading-relaxed mb-6">
                      {p.description}
                    </p>
                  </div>

                  {/* Impact pill */}
                  <div className="pt-4 border-t border-[rgba(255, 255, 255, 0.08)] flex items-center gap-2 text-xs font-mono text-[#F8FAFC]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
                    <span className="text-[#A7B3C9]">{p.impact}</span>
                  </div>
                </div>
              </Card3D>
            );
          })}
        </div>

        {/* Contrast Transition Banner */}
        <div className="mt-12 p-6 sm:p-8 rounded-2xl bg-[#0D1426] border border-[rgba(255, 255, 255, 0.08)] flex flex-col sm:flex-row sm:items-center justify-between gap-5 shadow-xl">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 rounded-xl bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <div className="text-base font-bold text-[#F8FAFC]">
                The Solution: Spatial Campus Topology
              </div>
              <div className="text-xs sm:text-sm text-[#A7B3C9] mt-0.5">
                Every room, time slot, faculty duty, and student batch linked in one unified constraint system.
              </div>
            </div>
          </div>

          <a
            href="#platform-modules"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6366F1] to-[#22D3EE] text-[#080D1B] text-xs font-bold whitespace-nowrap self-start sm:self-center shadow-md hover:opacity-95 transition-all"
          >
            <span>Explore Modules</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
};
