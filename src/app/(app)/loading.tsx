'use client';

import React from 'react';
import { DynamicLogo } from '@/components/brand/dynamic-logo';

export default function AppLoading() {
  return (
    <div className="flex flex-1 min-h-[60vh] items-center justify-center py-16 px-4">
      <DynamicLogo 
        size="md" 
        showSubtitle={true}
        statusText="Loading campus view..."
      />
    </div>
  );
}

