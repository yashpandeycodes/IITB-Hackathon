'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  Network,
  GraduationCap,
  Layers,
  Info,
} from 'lucide-react';
import { USER_ROLES } from '@/lib/mock-data';

export const RolesSection: React.FC = () => {
  const roleIcons = [ShieldCheck, Network, GraduationCap, Layers];

  return (
    <section className="relative py-20 lg:py-32 scroll-mt-20 border-t border-[#F4F7FB]/08">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#101A2B] border border-[#8279FF]/25 mb-4 text-xs font-mono text-[#8279FF]">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>ROLE-BASED GOVERNANCE</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#F4F7FB] tracking-tight mb-4">
            Unified access tailored to every campus responsibility
          </h2>
          <p className="text-base sm:text-lg text-[#98A6BB]">
            Whether overseeing institute-wide accreditation audits or requesting a workshop hall for a coding hackathon, CIT Nexus enforces appropriate operational boundaries.
          </p>
        </div>

        {/* 4 Roles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {USER_ROLES.map((role, idx) => {
            const Icon = roleIcons[idx % roleIcons.length];
            return (
              <motion.div
                key={role.role}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
                className="p-6 rounded-3xl bg-[#0B1220]/90 border border-[#F4F7FB]/08 hover:border-[#66E3F0]/30 transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 rounded-2xl bg-[#101A2B] border border-white/05 text-[#66E3F0] group-hover:scale-110 transition-transform">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#66E3F0]/10 text-[#66E3F0] border border-[#66E3F0]/20 font-bold">
                      {role.badge}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-[#F4F7FB] mb-1">
                    {role.role}
                  </h3>
                  <div className="text-xs font-mono text-[#8279FF] mb-3">
                    {role.scope}
                  </div>

                  <p className="text-xs text-[#98A6BB] leading-relaxed mb-4">
                    {role.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-[#F4F7FB]/06 text-[11px] text-[#98A6BB]">
                  <strong className="text-[#F4F7FB]/80 block mb-1 font-mono text-[10px]">
                    CORE RESPONSIBILITY:
                  </strong>
                  {role.permissionsSummary}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Prototype Clarification Banner */}
        <div className="p-4 rounded-2xl bg-[#101A2B]/60 border border-[#F4F7FB]/08 flex items-center gap-3 text-xs text-[#98A6BB]">
          <Info className="w-4 h-4 text-[#66E3F0] shrink-0" />
          <span>
            <strong>Prototype Note:</strong> The role options above represent intended production architectures. Choosing a role in the frontend signup flow does not grant administrative privileges or alter backend states in this demonstrator.
          </span>
        </div>
      </div>
    </section>
  );
};
