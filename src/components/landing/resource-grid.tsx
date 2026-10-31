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
  const glows = [
    'rgba(56, 189, 248, 0.4)',
    'rgba(192, 132, 252, 0.5)',
    'rgba(244, 63, 94, 0.4)',
    'rgba(251, 191, 36, 0.5)',
    'rgba(52, 211, 153, 0.4)',
    'rgba(217, 70, 239, 0.4)',
  ];

  return (
    <section id="resource-grid" className="relative py-24 lg:py-36 scroll-mt-20 border-t border-[#a855f7]/25">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-4xl mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#190938] to-[#2c0b4d] border-2 border-[#38bdf8]/60 mb-5 text-sm font-mono font-bold text-[#7dd3fc] shadow-[0_0_20px_rgba(56,189,248,0.3)]">
            <Layers className="w-4 h-4 text-[#38bdf8]" />
            <span>CAMPUS RESOURCE INTELLIGENCE</span>
          </div>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.08] mb-6">
            Total operational visibility across{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#c084fc] via-[#f43f5e] to-[#fbbf24]">
              every facility
            </span>
          </h2>
          <p className="text-lg sm:text-xl text-[#f1f5f9] font-medium leading-relaxed">
            From specialized hardware fabrication suites to 1,200-seat convocation amphitheatres, CIT Nexus maintains live parameter models for every physical asset on campus.
          </p>
        </div>

        {/* 6-Card Interactive 3D Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {CAMPUS_RESOURCES.map((res, idx) => {
            const Icon = resourceIcons[idx % resourceIcons.length];
            const isSelected = selectedResourceIndex === idx;
            return (
              <Card3D key={res.category} glowColor={glows[idx % glows.length]} depth={15}>
                <div
                  onClick={() => setSelectedResourceIndex(idx)}
                  className={`p-8 rounded-3xl border-2 cursor-pointer transition-all duration-300 flex flex-col justify-between h-full backdrop-blur-2xl ${
                    isSelected
                      ? 'bg-[#180738] border-[#fbbf24] shadow-[0_0_35px_rgba(251,191,36,0.4)]'
                      : 'bg-[#0f0426]/90 border-[#a855f7]/30 hover:border-white shadow-xl'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <div className="p-4 rounded-2xl bg-[#070114] border border-white/10 text-[#fbbf24] shadow-md">
                        <Icon className="w-7 h-7" />
                      </div>
                      <span className="text-xs font-mono font-black px-3 py-1 rounded-full bg-white/10 text-white border border-white/20">
                        {res.status}
                      </span>
                    </div>

                    <h3 className="text-2xl font-black text-white mb-2">
                      {res.category}
                    </h3>
                    <div className="text-sm font-mono font-bold text-[#c084fc] mb-5">
                      {res.count} • {res.specs}
                    </div>

                    {/* Feature Tags */}
                    <div className="flex flex-wrap gap-2 mt-4">
                      {res.tags.map((t) => (
                        <span
                          key={t}
                          className="text-xs font-semibold px-3 py-1 rounded-lg bg-[#070114] text-[#cbd5e1] border border-white/10"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-8 pt-5 border-t border-white/10 flex items-center justify-between text-xs font-mono font-bold text-[#fbbf24]">
                    <span>
                      {isSelected ? 'ACTIVE SELECTION' : 'CLICK TO INSPECT'}
                    </span>
                    <ArrowRight className="w-4 h-4 text-[#fbbf24]" />
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
