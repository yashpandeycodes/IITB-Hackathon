'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Spotlight } from '@/components/ui/spotlight';
import { BackgroundBeams } from '@/components/ui/background-beams';

export const CrazyBackground: React.FC = () => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 bg-[#080D1B]">
      {/* 1. Deep Midnight Navy Technical Grid Texture */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255, 255, 255, 0.4) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.4) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }}
      />

      {/* 2. Micro Dot Matrix Intersections */}
      <div
        className="absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: 'radial-gradient(rgba(34, 211, 238, 0.6) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          backgroundPosition: '0 0',
        }}
      />

      {/* 3. Aceternity Spotlight Effect */}
      <Spotlight
        className="-top-40 left-0 md:left-60 md:-top-20"
        fill="#22D3EE"
      />
      <Spotlight
        className="top-1/3 -right-20 md:right-40"
        fill="#6366F1"
      />

      {/* 4. Aceternity Background Beams */}
      <BackgroundBeams />

      {/* 5. Slow-moving Aurora Ambient Lighting Waves */}
      <motion.div
        animate={{
          scale: [1, 1.25, 1],
          opacity: [0.35, 0.55, 0.35],
          x: [0, 60, 0],
          y: [0, -40, 0],
        }}
        transition={{
          duration: 16,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -top-32 -left-32 w-[650px] h-[650px] rounded-full bg-gradient-to-br from-[#6366F1]/30 via-[#22D3EE]/20 to-transparent blur-[140px]"
      />

      <motion.div
        animate={{
          scale: [1.2, 1, 1.2],
          opacity: [0.25, 0.45, 0.25],
          x: [0, -60, 0],
          y: [0, 50, 0],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute top-1/2 -right-32 w-[700px] h-[700px] rounded-full bg-gradient-to-bl from-[#22D3EE]/25 via-[#6366F1]/20 to-transparent blur-[150px]"
      />

      <motion.div
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.18, 0.3, 0.18],
        }}
        transition={{
          duration: 14,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -bottom-40 left-1/3 w-[600px] h-[600px] rounded-full bg-gradient-to-t from-[#6366F1]/20 via-[#22D3EE]/15 to-transparent blur-[130px]"
      />

      {/* 6. Subtle Interactive Mouse Spotlight Following Cursor */}
      <div
        className="absolute inset-0 transition-opacity duration-500 opacity-60"
        style={{
          background: `radial-gradient(650px circle at ${mousePos.x}px ${mousePos.y}px, rgba(34, 211, 238, 0.05), transparent 70%)`,
        }}
      />

      {/* 7. Bottom Vignette for Smooth Contrast */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#080D1B] to-transparent" />
    </div>
  );
};
