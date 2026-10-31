'use client';

import React, { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface AuroraBackgroundProps extends React.HTMLProps<HTMLDivElement> {
  children?: ReactNode;
  showRadialGradient?: boolean;
}

export const AuroraBackground = ({
  className = '',
  children,
  showRadialGradient = true,
  ...props
}: AuroraBackgroundProps) => {
  return (
    <div
      className={`relative flex flex-col items-center justify-center bg-[#080D1B] text-[#F8FAFC] transition-bg overflow-hidden ${className}`}
      {...props}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className={`
            [--white-gradient:repeating-linear-gradient(100deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0.06)_7%,transparent_10%,transparent_12%,rgba(255,255,255,0.06)_16%)]
            [--aurora:repeating-linear-gradient(100deg,#6366F1_10%,#22D3EE_15%,#4338CA_20%,#06B6D4_25%,#6366F1_30%)]
            [background-image:var(--white-gradient),var(--aurora)]
            [background-size:300%,_200%]
            [background-position:50%_50%,50%_50%]
            filter blur-[10px] invert dark:invert-0
            after:content-[""] after:absolute after:inset-0 after:[background-image:var(--white-gradient),var(--aurora)] 
            after:[background-size:200%,_100%] 
            after:animate-aurora after:[background-attachment:fixed] after:mix-blend-difference
            pointer-events-none
            absolute -inset-[10px] opacity-40 will-change-transform
          `}
          style={{
            maskImage: showRadialGradient
              ? 'radial-gradient(ellipse at 100% 0%, black 10%, transparent 70%)'
              : undefined,
            WebkitMaskImage: showRadialGradient
              ? 'radial-gradient(ellipse at 100% 0%, black 10%, transparent 70%)'
              : undefined,
          }}
        />
        {/* Ambient indigo/cyan glowing orbs */}
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.25, 0.45, 0.25],
            x: [0, 40, 0],
            y: [0, -30, 0],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute -top-40 left-1/4 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-[#6366F1]/30 via-[#22D3EE]/20 to-transparent blur-[120px] pointer-events-none"
        />
        <motion.div
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.2, 0.35, 0.2],
            x: [0, -50, 0],
            y: [0, 40, 0],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute top-1/3 -right-20 w-[550px] h-[550px] rounded-full bg-gradient-to-bl from-[#22D3EE]/25 via-[#6366F1]/20 to-transparent blur-[130px] pointer-events-none"
        />
      </div>
      {children}
    </div>
  );
};

