import React from 'react';
import Link from 'next/link';
import { CITLogo } from '../brand/logo';

export const Footer: React.FC = () => {
  return (
    <footer className="relative border-t border-[#F4F7FB]/08 bg-[#070A12] py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 pb-12 border-b border-[#F4F7FB]/08">
          {/* Brand & Mission Column */}
          <div className="md:col-span-5 flex flex-col justify-between">
            <div>
              <Link href="/" className="inline-block mb-4">
                <CITLogo size="md" />
              </Link>
              <p className="text-sm text-[#98A6BB] leading-relaxed max-w-sm mb-6">
                CIT Nexus connects timetables, examinations, spaces, and campus events into one coordinated digital command center for Chilika Institute of Technology.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 text-xs font-mono text-[#66E3F0]">
              <span className="w-2 h-2 rounded-full bg-[#10B981]" />
              <span>Campus Operational Topology v2.4 (Prototype)</span>
            </div>
          </div>

          {/* Quick Navigation Links */}
          <div className="md:col-span-3">
            <h4 className="text-xs font-mono font-bold tracking-wider text-[#F4F7FB] uppercase mb-4">
              Platform Architecture
            </h4>
            <ul className="space-y-2.5 text-xs text-[#98A6BB]">
              <li>
                <a href="#platform-modules" className="hover:text-[#F4F7FB] transition-colors">
                  Intelligent Timetabling
                </a>
              </li>
              <li>
                <a href="#platform-modules" className="hover:text-[#F4F7FB] transition-colors">
                  Exam Planning Suite
                </a>
              </li>
              <li>
                <a href="#resource-grid" className="hover:text-[#F4F7FB] transition-colors">
                  Venue & Event Management
                </a>
              </li>
              <li>
                <a href="#disruption-demo" className="hover:text-[#F4F7FB] transition-colors">
                  Disruption Repair Simulator
                </a>
              </li>
              <li>
                <a href="#validation-principle" className="hover:text-[#F4F7FB] transition-colors">
                  Deterministic Validation Principle
                </a>
              </li>
            </ul>
          </div>

          {/* Account & Resources */}
          <div className="md:col-span-4">
            <h4 className="text-xs font-mono font-bold tracking-wider text-[#F4F7FB] uppercase mb-4">
              Access & Governance
            </h4>
            <ul className="space-y-2.5 text-xs text-[#98A6BB] mb-6">
              <li>
                <Link href="/login" className="hover:text-[#66E3F0] transition-colors">
                  Institutional Login Portal
                </Link>
              </li>
              <li>
                <Link href="/signup" className="hover:text-[#66E3F0] transition-colors">
                  Request Portal Account (Demo)
                </Link>
              </li>
              <li>
                <a href="#product-preview" className="hover:text-[#F4F7FB] transition-colors">
                  Interactive Preview Console
                </a>
              </li>
            </ul>

            <div className="p-3.5 rounded-xl bg-[#101A2B]/60 border border-white/06 text-[11px] text-[#98A6BB] leading-relaxed">
              <strong className="text-[#F4F7FB] block mb-1">Concept Prototype Notice:</strong>
              This frontend interface is an architectural demonstrator for Chilika Institute of Technology. No production databases, solver engines, or authenticated sessions are active.
            </div>
          </div>
        </div>

        {/* Bottom Credits & Copyright */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-[#98A6BB]">
          <div>
            &copy; 2026 CIT Nexus. A campus operations platform concept for CIT.
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span>Deterministic Constraint Model</span>
            <span>•</span>
            <span>Zero Unverified AI Authority</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
