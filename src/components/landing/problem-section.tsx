'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  FileSpreadsheet,
  Unplug,
  Split,
  CheckCircle2,
  ArrowDownRight,
  TrendingDown,
} from 'lucide-react';

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
      accent: '#EF4444',
    },
    {
      num: '02',
      title: 'Mismatched Requisition Formats',
      subtitle: 'Informal paper slips, emails, and missing specifications',
      description:
        'Booking requests arrive in scattered formats—informal emails to department heads, WhatsApp threads, or verbal requisitions. Crucial details like microphone needs, projector compatibility, or headcount limits get lost in translation.',
      impact: '80% of booking delays trace back to back-and-forth email clarifications.',
      icon: FileSpreadsheet,
      accent: '#F59E0B',
    },
    {
      num: '03',
      title: 'The Unforeseen Ripple Effect',
      subtitle: 'A single hardware fault causes campus-wide scheduling chaos',
      description:
        'When an air conditioning failure or electrical outage strikes a 120-seat lecture theatre, manual coordinators scramble. Relocating that single batch displaces an upcoming elective, which displaces an evening tutorial, causing a domino effect of cancellations.',
      impact: '1 room outage historically cascades into 4 to 6 canceled sessions.',
      icon: Unplug,
      accent: '#8279FF',
    },
    {
      num: '04',
      title: 'Lack of Unified Operational Telemetry',
      subtitle: 'Deans and coordinators operate with fragmented spatial visibility',
      description:
        'Departments guard their seminar rooms in silos while central lecture complexes sit under-utilized or dark. Without real-time spatial analytics, institute administration cannot make informed capital expansion or operational decisions.',
      impact: '24% of campus capacity sits idle during peak academic hours.',
      icon: TrendingDown,
      accent: '#66E3F0',
    },
  ];

  return (
    <section id="problem-narrative" className="relative py-20 lg:py-32 scroll-mt-20 border-t border-[#F4F7FB]/08 bg-[#070A12]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Editorial Section Header */}
        <div className="max-w-3xl mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#101A2B] border border-[#EF4444]/25 mb-4 text-xs font-mono text-[#EF4444]">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>THE CAMPUS COORDINATION PROBLEM</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#F4F7FB] tracking-tight leading-tight mb-6">
            A modern institute is not a static building—it is a high-frequency synchronization challenge.
          </h2>
          <p className="text-base sm:text-lg text-[#98A6BB] leading-relaxed">
            When academic timetables, examinations, department symposiums, and student initiatives operate in disjointed tools, friction compounds. CIT Nexus reconciles this spatial complexity.
          </p>
        </div>

        {/* 4-Column Problem Grid with Deep Aesthetic */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {problems.map((p, idx) => {
            const Icon = p.icon;
            return (
              <motion.div
                key={p.num}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="relative p-6 sm:p-8 rounded-3xl bg-[#0B1220]/80 border border-[#F4F7FB]/08 hover:border-[#F4F7FB]/20 transition-all duration-300 flex flex-col justify-between group"
              >
                {/* Subtle Glow Backdrop on Hover */}
                <div
                  className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none"
                  style={{ backgroundColor: p.accent }}
                />

                <div>
                  <div className="flex items-center justify-between mb-6">
                    <span className="font-mono text-2xl font-bold text-[#98A6BB]/40 group-hover:text-[#F4F7FB] transition-colors">
                      {p.num}
                    </span>
                    <div
                      className="p-3 rounded-2xl bg-[#101A2B] border border-white/05"
                      style={{ color: p.accent }}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-[#F4F7FB] mb-2 group-hover:text-[#66E3F0] transition-colors">
                    {p.title}
                  </h3>
                  <div className="text-xs font-mono text-[#66E3F0]/90 mb-3">
                    {p.subtitle}
                  </div>
                  <p className="text-sm text-[#98A6BB] leading-relaxed mb-6">
                    {p.description}
                  </p>
                </div>

                {/* Empirical friction stat */}
                <div className="pt-4 border-t border-[#F4F7FB]/08 flex items-center gap-2 text-xs font-mono text-[#F4F7FB]/80">
                  <ArrowDownRight className="w-3.5 h-3.5 text-[#EF4444]" />
                  <span>{p.impact}</span>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Contrast Transition Banner */}
        <div className="mt-12 p-6 rounded-2xl bg-gradient-to-r from-[#101A2B] via-[#0B1220] to-[#101A2B] border border-[#66E3F0]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#66E3F0]/10 text-[#66E3F0]">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#F4F7FB]">
                The Solution: Spatial Topology Orchestration
              </div>
              <div className="text-xs text-[#98A6BB]">
                Every room, time slot, faculty duty, and student batch linked in one unified constraint system.
              </div>
            </div>
          </div>
          <a
            href="#platform-modules"
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#66E3F0] hover:text-[#8279FF] transition-colors whitespace-nowrap self-start sm:self-center font-mono"
          >
            <span>EXPLORE PLATFORM MODULES</span>
            <span>&rarr;</span>
          </a>
        </div>
      </div>
    </section>
  );
};
