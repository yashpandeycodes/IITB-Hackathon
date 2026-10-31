'use client';

import React from 'react';
import {
  ShieldCheck,
  Network,
  GraduationCap,
  Layers,
  Info,
} from 'lucide-react';
import { USER_ROLES } from '@/lib/mock-data';
import { Card3D } from '@/components/ui/card-3d';

export const RolesSection: React.FC = () => {
  const roleIcons = [ShieldCheck, Network, GraduationCap, Layers];
  const glows = [
    'rgba(251, 191, 36, 0.4)',
    'rgba(192, 132, 252, 0.4)',
    'rgba(56, 189, 248, 0.4)',
    'rgba(244, 63, 94, 0.4)',
  ];

  return (
    <section className="relative py-24 lg:py-36 scroll-mt-20 border-t border-[#a855f7]/25">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-4xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#190938] to-[#2c0b4d] border-2 border-[#fbbf24]/60 mb-5 text-sm font-mono font-bold text-[#fde047] shadow-[0_0_20px_rgba(251,191,36,0.3)]">
            <ShieldCheck className="w-4 h-4 text-[#fbbf24]" />
            <span>ROLE-BASED GOVERNANCE</span>
          </div>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight mb-6">
            Unified access tailored to{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#c084fc] via-[#f43f5e] to-[#fbbf24]">
              every stakeholder
            </span>
          </h2>
          <p className="text-lg sm:text-xl text-[#f1f5f9] font-medium leading-relaxed">
            Whether overseeing institute-wide accreditation audits or requesting a workshop hall for a coding hackathon, CIT Nexus enforces appropriate operational boundaries.
          </p>
        </div>

        {/* 4 Roles 3D Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {USER_ROLES.map((role, idx) => {
            const Icon = roleIcons[idx % roleIcons.length];
            return (
              <Card3D key={role.role} glowColor={glows[idx % glows.length]} depth={12}>
                <div className="p-7 rounded-3xl bg-[#0e0424]/90 border-2 border-[#a855f7]/30 hover:border-[#fbbf24] transition-all flex flex-col justify-between h-full backdrop-blur-2xl shadow-xl">
                  <div>
                    <div className="flex items-center justify-between mb-5">
                      <div className="p-3.5 rounded-2xl bg-[#190938] border border-white/10 text-[#fbbf24] shadow-md">
                        <Icon className="w-6 h-6" />
                      </div>
                      <span className="text-[10px] font-mono font-black px-2.5 py-1 rounded-full bg-white/10 text-[#c084fc] border border-white/20">
                        {role.badge}
                      </span>
                    </div>

                    <h3 className="text-xl font-black text-white mb-1.5">
                      {role.role}
                    </h3>
                    <div className="text-xs font-mono font-bold text-[#fbbf24] mb-4">
                      {role.scope}
                    </div>

                    <p className="text-sm text-[#cbd5e1] font-medium leading-relaxed mb-6">
                      {role.description}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-white/10 text-xs text-[#e2e8f0]">
                    <strong className="text-white block mb-1 font-mono text-xs uppercase font-black">
                      CORE MANDATE:
                    </strong>
                    {role.permissionsSummary}
                  </div>
                </div>
              </Card3D>
            );
          })}
        </div>

        {/* Prototype Clarification Banner */}
        <div className="p-6 rounded-3xl bg-[#14062e] border-2 border-[#fbbf24]/40 flex items-center gap-4 text-sm text-[#fde047] font-medium shadow-xl">
          <Info className="w-6 h-6 text-[#fbbf24] shrink-0" />
          <span>
            <strong className="text-white font-bold">Prototype Notice:</strong> The role options above represent intended production architectures. Choosing a role in the frontend signup flow does not grant administrative privileges or alter backend states in this demonstrator.
          </span>
        </div>
      </div>
    </section>
  );
};
