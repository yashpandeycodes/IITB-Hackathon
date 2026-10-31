'use client';

import React from 'react';
import { motion } from 'framer-motion';

export const BackgroundBeams = ({ className = '' }: { className?: string }) => {
  return (
    <div
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
    >
      <svg
        className="absolute w-full h-full opacity-35"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1440 900"
        fill="none"
      >
        <g opacity="0.6">
          <motion.path
            d="M-200 100C300 300 600 -100 1100 250C1400 450 1600 200 1800 300"
            stroke="url(#beam-gradient-1)"
            strokeWidth="1.5"
            strokeDasharray="8 12"
            animate={{
              strokeDashoffset: [0, -200],
            }}
            transition={{
              duration: 25,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
          <motion.path
            d="M-100 400C400 200 800 600 1200 300C1500 150 1700 500 1900 350"
            stroke="url(#beam-gradient-2)"
            strokeWidth="1.5"
            strokeDasharray="10 16"
            animate={{
              strokeDashoffset: [0, 260],
            }}
            transition={{
              duration: 30,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
          <motion.path
            d="M-50 700C350 500 700 850 1150 600C1450 450 1650 700 1850 550"
            stroke="url(#beam-gradient-1)"
            strokeWidth="1"
            strokeDasharray="6 10"
            animate={{
              strokeDashoffset: [0, -180],
            }}
            transition={{
              duration: 22,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        </g>
        <defs>
          <linearGradient
            id="beam-gradient-1"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#6366F1" stopOpacity="0" />
            <stop offset="50%" stopColor="#22D3EE" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
          </linearGradient>
          <linearGradient
            id="beam-gradient-2"
            x1="0%"
            y1="100%"
            x2="100%"
            y2="0%"
          >
            <stop offset="0%" stopColor="#22D3EE" stopOpacity="0" />
            <stop offset="50%" stopColor="#6366F1" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
};

