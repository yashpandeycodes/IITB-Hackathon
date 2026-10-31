'use client';

import React from 'react';
import { motion } from 'framer-motion';

export const CrazyBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {/* 1. Deep Cosmic Purple Gradient Base */}
      <div className="absolute inset-0 bg-[#04010a]" />

      {/* 2. Dynamic Framer Motion Floating Aurora Orbs */}
      <motion.div
        animate={{
          x: [-40, 60, -20, -40],
          y: [-20, 40, -50, -20],
          scale: [1, 1.25, 0.95, 1],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -top-32 -left-32 w-[650px] h-[650px] rounded-full bg-gradient-to-tr from-[#7c3aed]/35 via-[#a855f7]/25 to-[#ec4899]/20 blur-[130px] opacity-70"
      />

      <motion.div
        animate={{
          x: [30, -50, 40, 30],
          y: [40, -40, 30, 40],
          scale: [1.1, 0.9, 1.2, 1.1],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute top-1/4 -right-40 w-[700px] h-[700px] rounded-full bg-gradient-to-br from-[#d946ef]/30 via-[#8b5cf6]/25 to-[#06b6d4]/20 blur-[140px] opacity-65"
      />

      <motion.div
        animate={{
          x: [-30, 40, -40, -30],
          y: [30, -30, 50, 30],
          scale: [0.95, 1.2, 1, 0.95],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute top-2/3 left-1/4 w-[800px] h-[800px] rounded-full bg-gradient-to-r from-[#9333ea]/25 via-[#6366f1]/20 to-[#f43f5e]/15 blur-[150px] opacity-60"
      />

      {/* 3. Golden Cyber Accent Flare in bottom right */}
      <motion.div
        animate={{
          opacity: [0.3, 0.6, 0.3],
          scale: [1, 1.15, 1],
        }}
        transition={{
          duration: 14,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -bottom-40 right-1/4 w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-[#f59e0b]/15 via-[#8b5cf6]/20 to-transparent blur-[130px]"
      />

      {/* 4. Fine Spatial Perspective Cyber Grid */}
      <div
        className="absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(168, 85, 247, 0.3) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(168, 85, 247, 0.3) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 80% 65% at 50% 35%, black 40%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 65% at 50% 35%, black 40%, transparent 100%)',
        }}
      />

      {/* 5. Animated Laser Scanline that sweeps down */}
      <motion.div
        animate={{
          top: ['-10%', '110%'],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: 'linear',
        }}
        className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#c084fc]/50 to-transparent blur-[1px] opacity-40"
      />

      {/* 6. Cinematic Vignette */}
      <div className="absolute inset-0 bg-radial-vignette opacity-80" />
    </div>
  );
};

