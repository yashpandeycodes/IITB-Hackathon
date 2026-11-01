'use client';

import React, { useState, useEffect } from 'react';
import { DynamicLogo } from '@/components/brand/dynamic-logo';

const LOADING_STATUSES = [
  'Calibrating spatial grid...',
  'Synchronizing campus operations...',
  'Verifying venue allocations...',
  'Loading Chilika Institute command...',
];

export default function Loading() {
  const [statusIndex, setStatusIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStatusIndex((prev) => (prev + 1) % LOADING_STATUSES.length);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#070A12] px-4">
      {/* Background Subtle Spatial Grid Pattern */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, #6366F1 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }}
      />

      {/* Dynamic Animated Logo Component */}
      <DynamicLogo 
        size="lg" 
        showSubtitle={true}
        statusText={LOADING_STATUSES[statusIndex]}
      />
    </div>
  );
}

