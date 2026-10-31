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
    md: { width: 40, height: 40 },
    lg: { width: 50, height: 50 },
  }[size];

  const titleSizes = {
    sm: 'text-base sm:text-lg',
    md: 'text-xl sm:text-2xl',
    lg: 'text-2xl sm:text-3xl',
  }[size];

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Brand Icon: Interconnected Spatial Nodes & Central Nexus */}
      <div className="relative flex items-center justify-center">
        {/* Ambient Subtle Glow */}
        <div className="absolute -inset-1.5 rounded-xl bg-gradient-to-r from-[#6366F1] to-[#22D3EE] opacity-40 blur-md pointer-events-none" />

        <svg
          width={iconDimensions.width}
          height={iconDimensions.height}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative z-10 drop-shadow-[0_2px_10px_rgba(99,102,241,0.5)]"
        >
          {/* Outer Boundary Ring */}
          <circle
            cx="24"
            cy="24"
            r="22"
            stroke="url(#ringGradSaaS)"
            strokeWidth="1.6"
            strokeDasharray="4 3"
          />

          {/* Connected Network Pathways */}
          <path
            d="M24 8L38 16V32L24 40L10 32V16L24 8Z"
            stroke="url(#polyGradSaaS)"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M24 8V24M38 16L24 24M38 32L24 24M24 40V24M10 32L24 24M10 16L24 24"
            stroke="rgba(148, 163, 184, 0.45)"
            strokeWidth="1.2"
          />

          {/* Central Nexus Core Node */}
          <circle cx="24" cy="24" r="5.5" fill="#22D3EE" />
          <circle cx="24" cy="24" r="2.8" fill="#080D1B" />

          {/* Peripheral Spatial Resource Nodes */}
          <circle cx="24" cy="8" r="2.8" fill="#6366F1" />
          <circle cx="38" cy="16" r="2.8" fill="#22D3EE" />
          <circle cx="38" cy="32" r="2.8" fill="#6366F1" />
          <circle cx="24" cy="40" r="2.8" fill="#22D3EE" />
          <circle cx="10" cy="32" r="2.8" fill="#6366F1" />
          <circle cx="10" cy="16" r="2.8" fill="#22D3EE" />

          <defs>
            <linearGradient id="ringGradSaaS" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
              <stop stopColor="#6366F1" />
              <stop offset="0.6" stopColor="#22D3EE" />
              <stop offset="1" stopColor="#0EA5E9" />
            </linearGradient>
            <linearGradient id="polyGradSaaS" x1="10" y1="8" x2="38" y2="40" gradientUnits="userSpaceOnUse">
              <stop stopColor="#6366F1" />
              <stop offset="1" stopColor="#22D3EE" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Brand Typography */}
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5 leading-none">
          <span className={`font-extrabold tracking-tight text-[#F8FAFC] ${titleSizes}`}>
            CIT
          </span>
          <span
            className={`font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-[#6366F1] via-[#818CF8] to-[#22D3EE] ${titleSizes}`}
          >
            NEXUS
          </span>
        </div>
        {showSubtitle && (
          <span className="text-[10px] uppercase font-mono font-semibold tracking-wider text-[#A7B3C9] mt-0.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22D3EE] inline-block animate-pulse" />
            CHILIKA INSTITUTE COMMAND
          </span>
        )}
      </div>
    </div>
  );
};
