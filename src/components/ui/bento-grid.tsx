'use client';

import React from 'react';
import { motion } from 'framer-motion';

export const BentoGrid = ({
  className = '',
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div
      className={`grid md:auto-rows-[19rem] grid-cols-1 md:grid-cols-3 gap-5 max-w-7xl mx-auto ${className}`}
    >
      {children}
    </div>
  );
};

export const BentoGridItem = ({
  className = '',
  title,
  description,
  header,
  icon,
  badge,
  accent = '#6366F1',
}: {
  className?: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  header?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: string;
  accent?: string;
}) => {
  return (
    <motion.div
      whileHover={{ y: -5 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`row-span-1 rounded-2xl group/bento hover:shadow-2xl transition duration-300 p-6 bg-[#0D1426] border border-white/[0.08] hover:border-[${accent}]/50 justify-between flex flex-col space-y-4 relative overflow-hidden ${className}`}
    >
      {/* Subtle hover gradient bloom */}
      <div
        style={{
          background: `radial-gradient(400px circle at 50% 0%, ${accent}22, transparent 70%)`,
        }}
        className="pointer-events-none absolute -inset-px opacity-0 group-hover/bento:opacity-100 transition-opacity duration-300 z-10"
      />

      <div className="relative z-20 flex flex-col h-full justify-between">
        {header}
        <div className="group-hover/bento:translate-x-1 transition duration-200">
          <div className="flex items-center justify-between mb-3">
            <div
              style={{ backgroundColor: `${accent}18`, borderColor: `${accent}35` }}
              className="p-2.5 rounded-xl border"
            >
              {icon}
            </div>
            {badge && (
              <span
                style={{ color: accent, backgroundColor: `${accent}15` }}
                className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase border border-white/[0.08]"
              >
                {badge}
              </span>
            )}
          </div>
          <div className="font-bold text-[#F8FAFC] text-lg mb-1.5 mt-2">
            {title}
          </div>
          <div className="font-normal text-[#A7B3C9] text-xs leading-relaxed">
            {description}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

