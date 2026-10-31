'use client';

import React, { useState } from 'react';
import {
  Building2,
  Cpu,
  Wrench,
  Sparkles,
  Users2,
  MapPin,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { CAMPUS_RESOURCES } from '@/lib/mock-data';
import { Card3D } from '@/components/ui/card-3d';

export const ResourceGrid: React.FC = () => {
  const [selectedResourceIndex, setSelectedResourceIndex] = useState(0);

  const resourceIcons = [Building2, Cpu, Wrench, Sparkles, Users2, MapPin];

  return (
    <section id="resource-grid" className="relative py-20 lg:py-32 scroll-mt-20 border-t border-[rgba(255, 255, 255, 0.08)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0D1426] border border-[rgba(255, 255, 255, 0.08)] mb-4 text-xs font-mono font-semibold text-[#22D3EE] shadow-sm">
            <Layers className="w-3.5 h-3.5 text-[#22D3EE]" />
            <span>CAMPUS RESOURCE INVENTORY</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#F8FAFC] tracking-tight leading-[1.12] mb-4">
            Total operational visibility across{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#6366F1] via-[#818CF8] to-[#22D3EE]">
              every campus facility
            </span>
          </h2>
          <p className="text-base sm:text-lg text-[#A7B3C9] font-normal leading-relaxed">
            From specialized hardware fabrication suites to tiered lecture amphitheatres, CIT Nexus maintains live parameter models for every physical asset on campus.
          </p>
        </div>

        {/* 6-Card Interactive 3D Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {CAMPUS_RESOURCES.map((res, idx) => {
            const Icon = resourceIcons[idx % resourceIcons.length];
            const isSelected = selectedResourceIndex === idx;

            return (
              <Card3D key={res.category} glowColor="rgba(99, 102, 241, 0.25)" depth={10}>
                <div
                  onClick={() => setSelectedResourceIndex(idx)}
                  className={`p-6 sm:p-7 rounded-2xl border cursor-pointer transition-all duration-200 flex flex-col justify-between h-full backdrop-blur-xl ${
                    isSelected
                      ? 'bg-[#111B30] border-[#22D3EE] shadow-[0_8px_30px_rgba(34,211,238,0.15)]'
                      : 'bg-[#0D1426] border-[rgba(255, 255, 255, 0.08)] hover:border-[#6366F1]/50 hover:bg-[#111B30]/70'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-2.5 rounded-xl bg-[#080D1B] border border-[rgba(255, 255, 255, 0.08)] text-[#22D3EE]">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="font-mono text-xs font-bold text-[#A7B3C9] px-2.5 py-1 rounded-md bg-[#080D1B]">
                        {res.count} Facilities
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-[#F8FAFC] mb-1">
                      {res.category}
                    </h3>
                    <p className="text-xs text-[#A7B3C9] leading-relaxed mb-4">
                      {res.specs} • {res.status}
                    </p>

                    <div className="p-3 rounded-lg bg-[#080D1B]/70 border border-[rgba(148,163,184,0.1)] mb-4">
                      <span className="text-[10px] font-mono text-[#A7B3C9] uppercase block mb-1.5">
                        Highlighted Capabilities
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {res.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#111B30] text-[#22D3EE] border border-[rgba(255, 255, 255, 0.08)]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[rgba(148,163,184,0.1)] flex items-center justify-between text-xs text-[#A7B3C9]">
                    <span className="font-mono text-[10px] uppercase">
                      {isSelected ? '● Selected for Inspection' : 'Click to inspect'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#22D3EE]" />
                  </div>
                </div>
              </Card3D>
            );
          })}
        </div>
      </div>
    </section>
  );
};
