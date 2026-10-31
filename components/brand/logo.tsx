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
    sm: { width: 28, height: 28 },
    md: { width: 36, height: 36 },
    lg: { width: 44, height: 44 },
  }[size];

  const titleSizes = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-2xl',
  }[size];

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Brand Icon: Interconnected Spatial Nodes & Central Nexus */}
      <div className="relative flex items-center justify-center">
        <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-[#66E3F0]/20 to-[#8279FF]/20 blur-sm" />
        <svg
          width={iconDimensions.width}
          height={iconDimensions.height}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative z-10 transition-transform duration-300 hover:scale-105"
        >
          {/* Subtle Outer Boundary Ring */}
          <circle
            cx="24"
            cy="24"
            r="21"
            stroke="rgba(102, 227, 240, 0.2)"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />

          {/* Connected Network Pathways */}
          <path
            d="M24 10L36 17V31L24 38L12 31V17L24 10Z"
            stroke="rgba(130, 121, 255, 0.4)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M24 10V24M36 17L24 24M36 31L24 24M24 38V24M12 31L24 24M12 17L24 24"
            stroke="rgba(102, 227, 240, 0.45)"
            strokeWidth="1.2"
          />

          {/* Central Nexus Core Node */}
          <circle cx="24" cy="24" r="5" fill="#66E3F0" />
          <circle cx="24" cy="24" r="2.5" fill="#070A12" />

          {/* Peripheral Spatial Resource Nodes */}
          <circle cx="24" cy="10" r="2.5" fill="#8279FF" />
          <circle cx="36" cy="17" r="2.5" fill="#66E3F0" />
          <circle cx="36" cy="31" r="2.5" fill="#8279FF" />
          <circle cx="24" cy="38" r="2.5" fill="#66E3F0" />
          <circle cx="12" cy="31" r="2.5" fill="#8279FF" />
          <circle cx="12" cy="17" r="2.5" fill="#66E3F0" />
        </svg>
      </div>

      {/* Typography */}
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5 leading-none">
          <span className={`font-bold tracking-tight text-[#F4F7FB] ${titleSizes}`}>
            CIT
          </span>
          <span
            className={`font-semibold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-[#66E3F0] to-[#8279FF] ${titleSizes}`}
          >
            NEXUS
          </span>
        </div>
        {showSubtitle && (
          <span className="text-[10px] uppercase font-mono tracking-widest text-[#98A6BB]/80 mt-1">
            Chilika Institute
          </span>
        )}
      </div>
    </div>
  );
};

