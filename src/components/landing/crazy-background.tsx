'use client';

import React from 'react';
import { motion } from 'framer-motion';

export const CrazyBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none">
      {/* 1. Deep University SaaS Background Base (#080D1B) */}
      <div className="absolute inset-0 bg-[#080D1B]" />

      {/* 2. Top-Center Restrained Spotlight Effect */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/3 w-[1000px] h-[550px] rounded-full pointer-events-none opacity-40 blur-[130px]"
        style={{
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.35) 0%, rgba(34, 211, 238, 0.15) 50%, transparent 75%)',
        }}
      />

      {/* 3. Slow-Moving Ambient Indigo Aurora Blob (#6366F1) */}
      <motion.div
        animate={{
          x: [-30, 40, -20, -30],
          y: [-20, 30, -30, -20],
          scale: [1, 1.15, 0.95, 1],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -top-24 -left-20 w-[550px] h-[550px] rounded-full bg-gradient-to-tr from-[#6366F1]/20 via-[#4F46E5]/15 to-transparent blur-[140px] opacity-70"
      />

      {/* 4. Electric Cyan Ambient Light Pool (#22D3EE) */}
      <motion.div
        animate={{
          x: [20, -40, 30, 20],
          y: [30, -30, 20, 30],
          scale: [1.05, 0.9, 1.15, 1.05],
        }}
        transition={{
          duration: 26,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute top-1/3 -right-24 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-[#22D3EE]/15 via-[#0EA5E9]/12 to-transparent blur-[150px] opacity-60"
      />

      {/* 5. Lower Deep Secondary Ambient Aura */}
      <motion.div
        animate={{
          x: [-20, 30, -30, -20],
          y: [20, -20, 40, 20],
        }}
        transition={{
          duration: 28,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute bottom-1/4 left-1/4 w-[650px] h-[650px] rounded-full bg-gradient-to-r from-[#4338CA]/15 via-[#6366F1]/10 to-transparent blur-[160px] opacity-50"
      />

      {/* 6. Subtle Technical Grid with Elliptical Radial Mask */}
      <div
        className="absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(148, 163, 184, 0.22) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(148, 163, 184, 0.22) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          maskImage: 'radial-gradient(ellipse 85% 70% at 50% 30%, black 30%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 85% 70% at 50% 30%, black 30%, transparent 100%)',
        }}
      />

      {/* 7. Subtle Matrix Dot Intersections */}
      <div
        className="absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: 'radial-gradient(rgba(34, 211, 238, 0.4) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          maskImage: 'radial-gradient(ellipse 70% 60% at 50% 25%, black 20%, transparent 95%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 25%, black 20%, transparent 95%)',
        }}
      />

      {/* 8. Soft Ambient Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 50% 50%, transparent 40%, #080D1B 95%)',
        }}
      />
    </div>
  );
};
