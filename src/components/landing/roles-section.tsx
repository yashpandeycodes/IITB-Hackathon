'use client';

import React from 'react';
import {
  ShieldCheck,
  Network,
  GraduationCap,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import { USER_ROLES } from '@/lib/mock-data';
import { Card3D } from '@/components/ui/card-3d';

export const RolesSection: React.FC = () => {
  const roleIcons = [ShieldCheck, Network, GraduationCap, Layers];

  return (
    <section className="relative py-20 lg:py-32 scroll-mt-20 border-t border-[rgba(255, 255, 255, 0.08)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0D1426] border border-[rgba(255, 255, 255, 0.08)] mb-4 text-xs font-mono font-semibold text-[#6366F1] shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-[#6366F1]" />
            <span>ROLE-BASED GOVERNANCE</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#F8FAFC] tracking-tight mb-4">
            Unified access tailored to{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#6366F1] via-[#818CF8] to-[#22D3EE]">
              every campus stakeholder
            </span>
          </h2>
          <p className="text-base sm:text-lg text-[#A7B3C9] font-normal leading-relaxed">
            Whether overseeing institute-wide accreditation audits or requesting a workshop hall for a coding hackathon, CIT Nexus enforces strict operational boundaries.
          </p>
        </div>

        {/* 4 Roles 3D Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {USER_ROLES.map((role, idx) => {
            const Icon = roleIcons[idx % roleIcons.length];
            return (
              <Card3D key={role.role} glowColor="rgba(99, 102, 241, 0.2)" depth={8}>
                <div className="p-6 rounded-2xl bg-[#0D1426] border border-[rgba(255, 255, 255, 0.08)] hover:border-[#6366F1]/50 hover:bg-[#111B30]/70 transition-all flex flex-col justify-between h-full backdrop-blur-xl shadow-lg">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-2.5 rounded-xl bg-[#111B30] border border-[rgba(255, 255, 255, 0.08)] text-[#22D3EE]">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#111B30] text-[#A7B3C9] border border-[rgba(255, 255, 255, 0.08)]">
                        {role.badge}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-[#F8FAFC] mb-1">
                      {role.role}
                    </h3>
                    <p className="text-xs text-[#A7B3C9] leading-relaxed mb-4">
                      {role.description}
                    </p>

                    <div className="pt-3 border-t border-[rgba(148,163,184,0.1)] space-y-2">
                      <div className="flex items-start gap-2 text-xs text-[#A7B3C9]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#22D3EE] shrink-0 mt-0.5" />
                        <span><strong className="text-[#F8FAFC]">Scope:</strong> {role.scope}</span>
                      </div>
                      <div className="flex items-start gap-2 text-xs text-[#A7B3C9]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#6366F1] shrink-0 mt-0.5" />
                        <span><strong className="text-[#F8FAFC]">Permissions:</strong> {role.permissionsSummary}</span>
                      </div>
                    </div>
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
