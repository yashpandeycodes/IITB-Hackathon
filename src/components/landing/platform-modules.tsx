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
  Shield,
  Layers,
  Sparkles,
  ArrowRight,
  Cpu,
} from 'lucide-react';
import { CORE_MODULES } from '@/lib/mock-data';

export const PlatformModules: React.FC = () => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const bentoItems = [
    {
      id: 'timetabling',
      title: 'Automated Timetable Matrix',
      subtitle: 'Multi-Cohort Constraint Optimizer',
      desc: 'Schedules 189 weekly sessions without cohort overlaps. Solves faculty availability, lab equipment requirements, and student break constraints concurrently.',
      icon: CalendarDays,
      badge: 'CORE ENGINE',
      accent: '#6366F1',
      colSpan: 'lg:col-span-8',
      bullets: [
        'Hard constraint validation (zero double bookings)',
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
      desc: 'Staff can ask: "Find an open auditorium for 200 people on Thursday after 3 PM". The assistant checks all 14 hard constraints before suggesting the venue.',
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
    <section id="platform-modules" className="relative py-20 lg:py-32 scroll-mt-20 border-t border-[rgba(148,163,184,0.12)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0D1426] border border-[rgba(148,163,184,0.18)] mb-4 text-xs font-mono font-semibold text-[#6366F1] shadow-sm">
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
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className={`${item.colSpan} relative rounded-2xl bg-[#0D1426] border border-[rgba(148,163,184,0.16)] p-6 sm:p-7 flex flex-col justify-between transition-all duration-300 hover:border-[#6366F1]/50 hover:bg-[#111B30]/90 hover:shadow-[0_12px_40px_rgba(0,0,0,0.5)] group`}
              >
                {/* Top Row: Icon & Badge */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div
                      style={{ backgroundColor: `${item.accent}15`, borderColor: `${item.accent}35` }}
                      className="w-10 h-10 rounded-xl border flex items-center justify-center transition-transform group-hover:scale-105"
                    >
                      <Icon style={{ color: item.accent }} className="w-5 h-5" />
                    </div>

                    <span
                      style={{ color: item.accent, backgroundColor: `${item.accent}12` }}
                      className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase border border-[rgba(148,163,184,0.12)]"
                    >
                      {item.badge}
                    </span>
                  </div>

                  {/* Title & Subtitle */}
                  <h3 className="text-lg sm:text-xl font-bold text-[#F8FAFC] tracking-tight mb-1 group-hover:text-white">
                    {item.title}
                  </h3>
                  <div className="text-xs font-mono text-[#22D3EE] font-medium mb-3">
                    {item.subtitle}
                  </div>

                  {/* Description */}
                  <p className="text-xs sm:text-sm text-[#A7B3C9] leading-relaxed mb-5">
                    {item.desc}
                  </p>

                  {/* Feature Checklist */}
                  <ul className="space-y-2 mb-6">
                    {item.bullets.map((bullet, bIdx) => (
                      <li key={bIdx} className="flex items-start gap-2 text-xs text-[#A7B3C9]">
                        <CheckCircle2
                          style={{ color: item.accent }}
                          className="w-3.5 h-3.5 shrink-0 mt-0.5"
                        />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Bottom Metric Footer */}
                <div className="pt-4 border-t border-[rgba(148,163,184,0.12)] flex items-center justify-between text-xs">
                  <span className="font-mono text-[#F8FAFC] font-semibold text-[11px]">
                    {item.metrics}
                  </span>
                  <a
                    href="#product-preview"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#A7B3C9] group-hover:text-[#22D3EE] transition-colors"
                  >
                    <span>View in Console</span>
                    <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
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
