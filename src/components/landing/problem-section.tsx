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
      glowColor: 'rgba(239, 68, 68, 0.4)',
      accentColor: '#f87171',
    },
    {
      num: '02',
      title: 'Mismatched Requisition Formats',
      subtitle: 'Informal paper slips, emails, and missing specifications',
      description:
        'Booking requests arrive in scattered formats—informal emails to department heads, WhatsApp threads, or verbal requisitions. Crucial details like microphone needs, projector compatibility, or headcount limits get lost in translation.',
      impact: '80% of booking delays trace back to back-and-forth email clarifications.',
      icon: FileSpreadsheet,
      glowColor: 'rgba(245, 158, 11, 0.4)',
      accentColor: '#fbbf24',
    },
    {
      num: '03',
      title: 'The Unforeseen Ripple Effect',
      subtitle: 'A single hardware fault causes campus-wide scheduling chaos',
      description:
        'When an air conditioning failure or electrical outage strikes a 120-seat lecture theatre, manual coordinators scramble. Relocating that single batch displaces an upcoming elective, which displaces an evening tutorial, causing a domino effect of cancellations.',
      impact: '1 room outage historically cascades into 4 to 6 canceled sessions.',
      icon: Unplug,
      glowColor: 'rgba(168, 85, 247, 0.5)',
      accentColor: '#c084fc',
    },
    {
      num: '04',
      title: 'Lack of Unified Operational Telemetry',
      subtitle: 'Deans and coordinators operate with fragmented spatial visibility',
      description:
        'Departments guard their seminar rooms in silos while central lecture complexes sit under-utilized or dark. Without real-time spatial analytics, institute administration cannot make informed capital expansion or operational decisions.',
      impact: '24% of campus capacity sits idle during peak academic hours.',
      icon: TrendingDown,
      glowColor: 'rgba(56, 189, 248, 0.4)',
      accentColor: '#38bdf8',
    },
  ];

  return (
    <section id="problem-narrative" className="relative py-24 lg:py-36 scroll-mt-20 border-t border-[#a855f7]/25">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Editorial Section Header */}
        <div className="max-w-4xl mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#190938] to-[#2c0b4d] border-2 border-[#ef4444]/60 mb-5 text-sm font-mono font-bold text-[#fca5a5] shadow-[0_0_20px_rgba(239,68,68,0.3)]">
            <AlertCircle className="w-4 h-4 text-[#ef4444]" />
            <span>THE CAMPUS LOGISTICS CHALLENGE</span>
          </div>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.08] mb-6">
            A university is not a static building—it is a{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#f43f5e] via-[#c084fc] to-[#fbbf24]">
              high-frequency synchronization problem.
            </span>
          </h2>
          <p className="text-lg sm:text-xl text-[#f1f5f9] font-medium leading-relaxed">
            When academic timetables, examinations, department symposiums, and student initiatives operate in disconnected tools, friction compounds. CIT Nexus reconciles this spatial complexity.
          </p>
        </div>

        {/* 4-Column 3D Tilt Problem Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-10">
          {problems.map((p) => {
            const Icon = p.icon;
            return (
              <Card3D key={p.num} glowColor={p.glowColor} depth={15}>
                <div className="p-8 sm:p-10 rounded-3xl bg-[#0f0529]/90 border-2 border-[#a855f7]/30 hover:border-[#fbbf24] transition-all duration-300 flex flex-col justify-between h-full shadow-2xl backdrop-blur-2xl">
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <span className="font-mono text-3xl font-black text-[#cbd5e1]/40 group-hover:text-white transition-colors">
                        {p.num}
                      </span>
                      <div
                        className="p-3.5 rounded-2xl bg-[#1b0840] border border-white/10 shadow-lg"
                        style={{ color: p.accentColor }}
                      >
                        <Icon className="w-6 h-6" />
                      </div>
                    </div>

                    <h3 className="text-2xl font-black text-white mb-2">
                      {p.title}
                    </h3>
                    <div
                      className="text-sm font-mono font-bold mb-4"
                      style={{ color: p.accentColor }}
                    >
                      {p.subtitle}
                    </div>
                    <p className="text-base text-[#e2e8f0] font-medium leading-relaxed mb-8">
                      {p.description}
                    </p>
                  </div>

                  {/* Empirical friction stat */}
                  <div className="pt-5 border-t border-white/10 flex items-center gap-3 text-sm font-mono font-bold text-[#fbbf24]">
                    <span className="w-2 h-2 rounded-full bg-[#ef4444] animate-ping" />
                    <span>{p.impact}</span>
                  </div>
                </div>
              </Card3D>
            );
          })}
        </div>

        {/* Contrast Transition Banner */}
        <div className="mt-16 p-8 rounded-3xl bg-gradient-to-r from-[#1b0840] via-[#12042b] to-[#1b0840] border-2 border-[#c084fc]/50 shadow-[0_0_35px_rgba(168,85,247,0.3)] flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-[#fbbf24]/20 text-[#fbbf24] border border-[#fbbf24]/40">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <div className="text-lg font-black text-white">
                The Solution: Spatial Campus Topology
              </div>
              <div className="text-sm font-medium text-[#e2e8f0]">
                Every room, time slot, faculty duty, and student batch linked in one unified constraint system.
              </div>
            </div>
          </div>
          <a
            href="#platform-modules"
            className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-gradient-to-r from-[#c084fc] to-[#fbbf24] text-[#04010a] text-sm font-black whitespace-nowrap self-start sm:self-center shadow-lg hover:scale-105 transition-transform"
          >
            <span>EXPLORE PLATFORM MODULES</span>
            <ArrowRight className="w-4 h-4 stroke-[3]" />
          </a>
        </div>
      </div>
    </section>
  );
};
