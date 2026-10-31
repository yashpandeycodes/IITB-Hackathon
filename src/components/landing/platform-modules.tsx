'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  CalendarDays,
  GraduationCap,
  Building,
  RotateCcw,
  Bot,
  CheckCircle2,
  Layers,
  ArrowRight,
} from 'lucide-react';

export const PlatformModules: React.FC = () => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const bentoItems = [
    {
      id: 'timetabling',
      title: 'Automated Timetable Matrix',
      subtitle: 'Multi-Cohort Constraint Optimizer',
      desc: 'Schedules 189 weekly sessions without cohort overlaps. Concurrently solves faculty bandwidth, lab equipment requirements, transit buffers, and pedagogy needs.',
      icon: CalendarDays,
      badge: 'CORE ENGINE',
      accent: '#6366F1',
      colSpan: 'lg:col-span-8',
      bullets: [
        'Deterministic validation (zero double bookings)',
        'Cohort-specific travel time buffer between blocks',
        'Automatic lab vs lecture hall capacity matching',
      ],
      metrics: '189 Sessions • 100% Validated',
    },
    {
      id: 'exams',
      title: 'Examination Integrity Protocol',
      subtitle: 'Conflict-Free Seating & Scheduling',
      desc: 'Builds midterm and final schedules ensuring students have no concurrent papers and adequate prep spacing across academic cohorts.',
      icon: GraduationCap,
      badge: 'INTEGRITY ENGINE',
      accent: '#22D3EE',
      colSpan: 'lg:col-span-4',
      bullets: [
        'Single student cohort paper separation',
        'Physical seating density bounds',
        'Invigilator duty load balancing',
      ],
      metrics: 'Zero Student Clashes',
    },
    {
      id: 'venues',
      title: 'Spatial Venue Governance',
      subtitle: 'Priority-Aware Space Allocation',
      desc: '27 physical facilities managed under hierarchical priority rules. Academic courses hold precedence over guest seminars and student society rehearsals.',
      icon: Building,
      badge: 'FACILITY CONTROL',
      accent: '#22D3EE',
      colSpan: 'lg:col-span-4',
      bullets: [
        'Tier 1: Core Academic Courses',
        'Tier 2: Institutional Seminars & Labs',
        'Tier 3: Student Club Requisitions',
      ],
      metrics: '27 Monitored Venues',
    },
    {
      id: 'disruption',
      title: 'Disruption & Cascade Mitigation',
      subtitle: 'Instant Rescheduling on Outages',
      desc: 'When an AC fails in Lecture Hall 204 or a pipe bursts in Turing Lab, the system computes the minimal disruption plan with lowest ripple effect.',
      icon: RotateCcw,
      badge: 'RESILIENCE SOLVER',
      accent: '#6366F1',
      colSpan: 'lg:col-span-4',
      bullets: [
        'Single-click room evacuation reallocation',
        'Preserves faculty and cohort time slots',
        'Real-time student push notifications',
      ],
      metrics: '< 2.4s Repair Calculation',
    },
    {
      id: 'assistant',
      title: 'Intelligence Proposes. Constraints Decide.',
      subtitle: 'Constraint-Governed Operational Assistant',
      desc: 'Staff can ask: "Find an open auditorium for 200 people on Thursday after 3 PM". The assistant checks all 14 hard constraints before proposing the venue.',
      icon: Bot,
      badge: 'GOVERNED AI',
      accent: '#818CF8',
      colSpan: 'lg:col-span-4',
      bullets: [
        'Natural language space query parsing',
        'Automatic constraint pre-flight verification',
        'One-click draft proposal generation',
      ],
      metrics: 'Deterministic Rule Guardrails',
    },
  ];

  return (
    <section id="platform-modules" className="relative py-20 lg:py-32 scroll-mt-20 border-t border-white/[0.08]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0D1426] border border-white/[0.08] mb-4 text-xs font-mono font-semibold text-[#6366F1] shadow-sm">
            <Layers className="w-3.5 h-3.5 text-[#6366F1]" />
            <span>PLATFORM CAPABILITIES</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#F8FAFC] tracking-tight mb-4">
            Five specialized modules.{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#6366F1] via-[#818CF8] to-[#22D3EE]">
              One shared operational core.
            </span>
          </h2>
          <p className="text-base sm:text-lg text-[#A7B3C9] font-normal leading-relaxed">
            Engineered specifically to solve the distinct logistical layers of university life, from daily lectures to large-scale semester finals.
          </p>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {bentoItems.map((item, idx) => {
            const Icon = item.icon;
            const isHovered = hoveredIdx === idx;

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.5, delay: idx * 0.08 }}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className={`${item.colSpan} relative rounded-3xl bg-[#0D1426] border ${
                  isHovered ? 'border-[#6366F1]/80 shadow-[0_12px_40px_rgba(99,102,241,0.25)]' : 'border-white/[0.08]'
                } p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 hover:bg-[#111B30]/90 group overflow-hidden`}
              >
                {/* Subtle Hover Radial Bloom */}
                <div
                  style={{
                    background: `radial-gradient(400px circle at 50% 0%, ${item.accent}18, transparent 70%)`,
                  }}
                  className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-0"
                />

                {/* Top Row: Icon & Badge */}
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-5">
                    <div
                      style={{ backgroundColor: `${item.accent}15`, borderColor: `${item.accent}35` }}
                      className="w-12 h-12 rounded-2xl border flex items-center justify-center transition-transform group-hover:scale-105 shadow-sm"
                    >
                      <Icon style={{ color: item.accent }} className="w-6 h-6" />
                    </div>

                    <span
                      style={{ color: item.accent, backgroundColor: `${item.accent}12` }}
                      className="px-3 py-1 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase border border-white/[0.08]"
                    >
                      {item.badge}
                    </span>
                  </div>

                  {/* Title & Subtitle */}
                  <h3 className="text-xl sm:text-2xl font-bold text-[#F8FAFC] tracking-tight mb-1 group-hover:text-white">
                    {item.title}
                  </h3>
                  <div className="text-xs font-mono text-[#22D3EE] font-medium mb-3">
                    {item.subtitle}
                  </div>

                  {/* Description */}
                  <p className="text-xs sm:text-sm text-[#A7B3C9] leading-relaxed mb-6">
                    {item.desc}
                  </p>

                  {/* Feature Checklist */}
                  <ul className="space-y-2.5 mb-6">
                    {item.bullets.map((bullet, bIdx) => (
                      <li key={bIdx} className="flex items-start gap-2.5 text-xs text-[#A7B3C9]">
                        <CheckCircle2
                          style={{ color: item.accent }}
                          className="w-4 h-4 shrink-0 mt-0.5"
                        />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Bottom Metric Footer */}
                <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between text-xs relative z-10">
                  <span className="font-mono text-[#F8FAFC] font-semibold text-[11px]">
                    {item.metrics}
                  </span>
                  <a
                    href="#product-preview"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#A7B3C9] group-hover:text-[#22D3EE] transition-colors"
                  >
                    <span>View in Console</span>
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                  </a>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
