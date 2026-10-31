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

export const ResourceGrid: React.FC = () => {
  const [selectedResourceIndex, setSelectedResourceIndex] = useState(0);

  const resourceIcons = [Building2, Cpu, Wrench, Sparkles, Users2, MapPin];

  return (
    <section id="resource-grid" className="relative py-20 lg:py-32 scroll-mt-20 border-t border-[#F4F7FB]/08 bg-[#070A12]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#101A2B] border border-[#66E3F0]/25 mb-4 text-xs font-mono text-[#66E3F0]">
            <Layers className="w-3.5 h-3.5" />
            <span>CAMPUS RESOURCE INTELLIGENCE</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#F4F7FB] tracking-tight leading-tight mb-4">
            Total operational visibility across every space and facility
          </h2>
          <p className="text-base sm:text-lg text-[#98A6BB] leading-relaxed">
            From specialized hardware fabrication suites to 1,200-seat convocation amphitheatres, CIT Nexus maintains live parameter models for every physical asset on campus.
          </p>
        </div>

        {/* 6-Card Interactive Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {CAMPUS_RESOURCES.map((res, idx) => {
            const Icon = resourceIcons[idx % resourceIcons.length];
            const isSelected = selectedResourceIndex === idx;
            return (
              <div
                key={res.category}
                onClick={() => setSelectedResourceIndex(idx)}
                className={`p-6 rounded-3xl border cursor-pointer transition-all duration-300 flex flex-col justify-between group ${
                  isSelected
                    ? 'bg-[#101A2B] border-[#66E3F0] shadow-[0_0_25px_-5px_rgba(102,227,240,0.3)]'
                    : 'bg-[#0B1220]/80 border-[#F4F7FB]/08 hover:border-[#F4F7FB]/25 hover:bg-[#101A2B]/40'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 rounded-2xl bg-[#070A12] border border-white/06 text-[#66E3F0] group-hover:scale-105 transition-transform">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.04] text-[#98A6BB] border border-white/08">
                      {res.status}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-[#F4F7FB] mb-1 group-hover:text-[#66E3F0] transition-colors">
                    {res.category}
                  </h3>
                  <div className="text-xs font-mono text-[#66E3F0] mb-3">
                    {res.count} • {res.specs}
                  </div>

                  {/* Feature Tags */}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {res.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-[#070A12] text-[#98A6BB] border border-white/05"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-6 pt-3 border-t border-[#F4F7FB]/06 flex items-center justify-between text-[11px] font-mono text-[#98A6BB]">
                  <span className="group-hover:text-[#F4F7FB] transition-colors">
                    {isSelected ? 'ACTIVE SELECTION' : 'CLICK TO INSPECT'}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#66E3F0] group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
