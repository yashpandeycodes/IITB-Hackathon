'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface DynamicLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
  statusText?: string;
  className?: string;
}

export const DynamicLogo: React.FC<DynamicLogoProps> = ({
  size = 'lg',
  showSubtitle = true,
  statusText,
  className = '',
}) => {
  const dimensions = {
    sm: { box: 64, icon: 48, text: 'text-xl' },
    md: { box: 96, icon: 72, text: 'text-2xl' },
    lg: { box: 128, icon: 96, text: 'text-3xl sm:text-4xl' },
    xl: { box: 160, icon: 120, text: 'text-4xl sm:text-5xl' },
  }[size];

  // 6 peripheral node positions matching the hexagonal geometry
  const nodes = [
    { cx: 24, cy: 9, color: '#6366F1' },    // Top
    { cx: 37, cy: 16.5, color: '#22D3EE' }, // Top-Right
    { cx: 37, cy: 31.5, color: '#6366F1' }, // Bottom-Right
    { cx: 24, cy: 39, color: '#22D3EE' },   // Bottom
    { cx: 11, cy: 31.5, color: '#6366F1' }, // Bottom-Left
    { cx: 11, cy: 16.5, color: '#22D3EE' }, // Top-Left
  ];

  return (
    <div className={`flex flex-col items-center justify-center select-none ${className}`}>
      {/* Dynamic Animated Brand Icon Container */}
      <div className="relative flex items-center justify-center" style={{ width: dimensions.box, height: dimensions.box }}>
        
        {/* Outward Radial Quantum Ripple Ring 1 */}
        <motion.div
          className="absolute inset-0 rounded-full border border-[#22D3EE]/30"
          animate={{
            scale: [0.85, 1.45, 1.8],
            opacity: [0.6, 0.2, 0],
          }}
          transition={{
            duration: 2.8,
            repeat: Infinity,
            ease: 'easeOut',
          }}
        />

        {/* Outward Radial Quantum Ripple Ring 2 (Staggered) */}
        <motion.div
          className="absolute inset-0 rounded-full border border-[#6366F1]/30"
          animate={{
            scale: [0.85, 1.45, 1.8],
            opacity: [0.6, 0.2, 0],
          }}
          transition={{
            duration: 2.8,
            delay: 1.4,
            repeat: Infinity,
            ease: 'easeOut',
          }}
        />

        {/* Ambient Radial Neon Core Glow */}
        <motion.div
          className="absolute -inset-4 rounded-full bg-gradient-to-r from-[#6366F1]/40 via-[#38BDF8]/40 to-[#22D3EE]/40 blur-2xl pointer-events-none"
          animate={{
            scale: [0.9, 1.15, 0.9],
            opacity: [0.45, 0.75, 0.45],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Rotating Outer Gyroscopic Ring */}
        <motion.svg
          width={dimensions.icon}
          height={dimensions.icon}
          viewBox="0 0 48 48"
          fill="none"
          className="absolute z-10"
          animate={{ rotate: 360 }}
          transition={{
            duration: 14,
            repeat: Infinity,
            ease: 'linear',
          }}
        >
          <circle
            cx="24"
            cy="24"
            r="22"
            stroke="url(#dynamicRingGrad)"
            strokeWidth="1.6"
            strokeDasharray="5 4"
            strokeOpacity="0.85"
          />
          <defs>
            <linearGradient id="dynamicRingGrad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
              <stop stopColor="#6366F1" />
              <stop offset="0.5" stopColor="#22D3EE" />
              <stop offset="1" stopColor="#818CF8" />
            </linearGradient>
          </defs>
        </motion.svg>

        {/* Counter-Rotating Secondary Dash Ring */}
        <motion.svg
          width={dimensions.icon * 0.88}
          height={dimensions.icon * 0.88}
          viewBox="0 0 48 48"
          fill="none"
          className="absolute z-10"
          animate={{ rotate: -360 }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: 'linear',
          }}
        >
          <circle
            cx="24"
            cy="24"
            r="20"
            stroke="#22D3EE"
            strokeWidth="0.8"
            strokeDasharray="2 6"
            strokeOpacity="0.5"
          />
        </motion.svg>

        {/* Central Hexagonal Core & Spoke Pathways (Framer Motion Animated) */}
        <svg
          width={dimensions.icon}
          height={dimensions.icon}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative z-20 drop-shadow-[0_0_16px_rgba(34,211,238,0.5)]"
        >
          {/* Hexagonal Perimeter Network Boundary */}
          <motion.path
            d="M24 9L37 16.5V31.5L24 39L11 31.5V16.5L24 9Z"
            stroke="url(#dynamicPolyGrad)"
            strokeWidth="2"
            strokeLinejoin="round"
            initial={{ pathLength: 0.2, opacity: 0.6 }}
            animate={{
              pathLength: [0.2, 1, 0.2],
              opacity: [0.6, 1, 0.6],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />

          {/* Internal Radial Spokes */}
          <motion.path
            d="M24 9V24M37 16.5L24 24M37 31.5L24 24M24 39V24M11 31.5L24 24M11 16.5L24 24"
            stroke="rgba(148, 163, 184, 0.55)"
            strokeWidth="1.4"
            animate={{
              strokeOpacity: [0.3, 0.8, 0.3],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />

          {/* 6 Peripheral Spatial Resource Nodes (Pulsing Sequence) */}
          {nodes.map((node, i) => (
            <motion.circle
              key={i}
              cx={node.cx}
              cy={node.cy}
              r="2.8"
              fill={node.color}
              animate={{
                scale: [1, 1.4, 1],
                fillOpacity: [0.7, 1, 0.7],
              }}
              transition={{
                duration: 1.6,
                delay: i * 0.25,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          ))}

          {/* Central Nexus Core Node (Breathing Pulse) */}
          <motion.circle
            cx="24"
            cy="24"
            r="5.5"
            fill="#22D3EE"
            animate={{
              scale: [1, 1.25, 1],
              fill: ['#22D3EE', '#67E8F9', '#22D3EE'],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
          <circle cx="24" cy="24" r="2.6" fill="#070A12" />

          <defs>
            <linearGradient id="dynamicPolyGrad" x1="10" y1="8" x2="38" y2="40" gradientUnits="userSpaceOnUse">
              <stop stopColor="#6366F1" />
              <stop offset="0.5" stopColor="#818CF8" />
              <stop offset="1" stopColor="#22D3EE" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Brand Typography with Ambient Shimmer */}
      <motion.div
        className="mt-5 flex flex-col items-center"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className="flex items-center gap-2">
          <span className={`font-extrabold tracking-tight text-[#F8FAFC] ${dimensions.text}`}>
            CIT
          </span>
          <span
            className={`font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-[#6366F1] via-[#818CF8] to-[#22D3EE] ${dimensions.text}`}
          >
            NEXUS
          </span>
        </div>

        {showSubtitle && (
          <div className="mt-1 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22D3EE] animate-pulse" />
            <span className="text-[11px] font-mono font-semibold uppercase tracking-widest text-[#94A3B8]">
              Chilika Institute Command
            </span>
          </div>
        )}
      </motion.div>

      {/* Status Progress Indicator */}
      {statusText && (
        <motion.div
          className="mt-4 flex flex-col items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="w-44 h-1 bg-[#1E293B] rounded-full overflow-hidden relative">
            <motion.div
              className="absolute top-0 bottom-0 bg-gradient-to-r from-[#6366F1] via-[#22D3EE] to-[#6366F1] rounded-full"
              style={{ width: '40%' }}
              animate={{
                x: ['-100%', '300%'],
              }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          </div>
          <span className="text-xs font-mono text-[#64748B] tracking-wide animate-pulse">
            {statusText}
          </span>
        </motion.div>
      )}
    </div>
  );
};

