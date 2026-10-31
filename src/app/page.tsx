import React from 'react';
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
    <div className="min-h-screen flex flex-col bg-[#070A12] text-[#F4F7FB]">
      {/* Navigation Header */}
      <Navbar />

      {/* Main Content Sections */}
      <main className="flex-1">
        {/* A & B: Hero Section with Campus Spatial Network Visual */}
        <HeroSection />

        {/* C: Interactive Product Preview */}
        <ProductPreview />

        {/* D: Campus Coordination Problem Narrative */}
        <ProblemSection />

        {/* E: Core Platform Modules */}
        <PlatformModules />

        {/* F: "Intelligence proposes. Constraints decide." */}
        <ValidationPrinciple />

        {/* G: Disruption Repair Interactive Demonstration */}
        <DisruptionDemo />

        {/* H: Campus Resource Intelligence */}
        <ResourceGrid />

        {/* I: Roles & Workflows */}
        <RolesSection />

        {/* J: Final Call to Action */}
        <FinalCTA />
      </main>

      {/* K: Footer */}
      <Footer />
    </div>
  );
}
