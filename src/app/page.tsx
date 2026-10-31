import React from 'react';
import { CrazyBackground } from '@/components/landing/crazy-background';
import { Navbar } from '@/components/landing/navbar';
import { HeroSection } from '@/components/landing/hero';
import { ProductPreview } from '@/components/landing/product-preview';
import { ProblemSection } from '@/components/landing/problem-section';
import { PlatformModules } from '@/components/landing/platform-modules';
import { ValidationPrinciple } from '@/components/landing/validation-principle';
import { DisruptionDemo } from '@/components/landing/disruption-demo';
import { ResourceGrid } from '@/components/landing/resource-grid';
import { RolesSection } from '@/components/landing/roles-section';
import { FinalCTA } from '@/components/landing/final-cta';
import { Footer } from '@/components/landing/footer';

export default function HomePage() {
  return (
    <div className="relative min-h-screen flex flex-col bg-[#04010a] text-white selection:bg-[#c084fc]/30 selection:text-[#fbbf24]">
      {/* Super Crazy Animated Background Experience */}
      <CrazyBackground />

      {/* Navigation Header */}
      <Navbar />

      {/* Main Content Sections */}
      <main className="flex-1 relative z-10">
        {/* A & B: Hero Section with 3D Spatial Campus Visual */}
        <HeroSection />

        {/* C: Interactive Product Preview Console */}
        <ProductPreview />

        {/* D: Campus Coordination Problem Narrative with 3D Cards */}
        <ProblemSection />

        {/* E: Core Platform Modules with Interactive Switcher */}
        <PlatformModules />

        {/* F: "Intelligence proposes. Constraints decide." */}
        <ValidationPrinciple />

        {/* G: Disruption Repair Interactive Demonstration */}
        <DisruptionDemo />

        {/* H: Campus Resource Intelligence with 3D Cards */}
        <ResourceGrid />

        {/* I: Roles & Workflows with 3D Governance Cards */}
        <RolesSection />

        {/* J: Final Call to Action */}
        <FinalCTA />
      </main>

      {/* K: Footer */}
      <Footer />
    </div>
  );
}
