'use client';

import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
}

export const CITLogo: React.FC<LogoProps> = ({
  className = '',
  size = 'md',
  showSubtitle = true,
}) => {
  const iconDimensions = {
    sm: { width: 32, height: 32 },
    md: { width: 42, height: 42 },
    lg: { width: 54, height: 54 },
  }[size];

  const titleSizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl',
  }[size];

  return (
    <div className={`flex items-center gap-3.5 select-none ${className}`}>
      {/* Brand Icon: Interconnected Spatial Nodes & Central Nexus */}
      <div className="relative flex items-center justify-center">
        {/* Ambient Neon Aura */}
        <div className="absolute -inset-2 rounded-2xl bg-gradient-to-r from-[#a855f7] via-[#ec4899] to-[#f59e0b] opacity-60 blur-md animate-pulse" />
        
        <svg
          width={iconDimensions.width}
          height={iconDimensions.height}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative z-10 drop-shadow-[0_0_12px_rgba(168,85,247,0.8)]"
        >
          {/* Outer Boundary Ring */}
          <circle
            cx="24"
            cy="24"
            r="22"
            stroke="url(#ringGrad)"
            strokeWidth="1.8"
            strokeDasharray="4 3"
          />

          {/* Connected Network Pathways */}
          <path
            d="M24 8L38 16V32L24 40L10 32V16L24 8Z"
            stroke="url(#polyGrad)"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M24 8V24M38 16L24 24M38 32L24 24M24 40V24M10 32L24 24M10 16L24 24"
            stroke="rgba(245, 158, 11, 0.7)"
            strokeWidth="1.4"
          />

          {/* Central Nexus Core Node */}
          <circle cx="24" cy="24" r="6" fill="#f59e0b" />
          <circle cx="24" cy="24" r="3" fill="#04010a" />

          {/* Peripheral Spatial Resource Nodes */}
          <circle cx="24" cy="8" r="3.2" fill="#c084fc" />
          <circle cx="38" cy="16" r="3.2" fill="#f43f5e" />
          <circle cx="38" cy="32" r="3.2" fill="#a855f7" />
          <circle cx="24" cy="40" r="3.2" fill="#38bdf8" />
          <circle cx="10" cy="32" r="3.2" fill="#ec4899" />
          <circle cx="10" cy="16" r="3.2" fill="#f59e0b" />

          <defs>
            <linearGradient id="ringGrad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
              <stop stopColor="#a855f7" />
              <stop offset="0.5" stopColor="#ec4899" />
              <stop offset="1" stopColor="#f59e0b" />
            </linearGradient>
            <linearGradient id="polyGrad" x1="10" y1="8" x2="38" y2="40" gradientUnits="userSpaceOnUse">
              <stop stopColor="#c084fc" />
              <stop offset="1" stopColor="#38bdf8" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Typography */}
      <div className="flex flex-col">
        <div className="flex items-center gap-2 leading-none">
          <span className={`font-black tracking-tight text-white drop-shadow-md ${titleSizes}`}>
            CIT
          </span>
          <span
            className={`font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-[#c084fc] via-[#f43f5e] to-[#fbbf24] animate-shimmer-text ${titleSizes}`}
          >
            NEXUS
          </span>
        </div>
        {showSubtitle && (
          <span className="text-[11px] uppercase font-mono font-bold tracking-widest text-[#cbd5e1] mt-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#a855f7] inline-block animate-ping" />
            CHILIKA INSTITUTE COMMAND
          </span>
        )}
      </div>
    </div>
  );
};
