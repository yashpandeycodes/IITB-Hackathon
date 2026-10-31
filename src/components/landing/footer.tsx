import React from 'react';
import Link from 'next/link';
import { CITLogo } from '../brand/logo';

export const Footer: React.FC = () => {
  return (
    <footer className="relative border-t border-[#a855f7]/30 bg-[#060114] py-20 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 pb-14 border-b border-white/10">
          {/* Brand & Mission Column */}
          <div className="md:col-span-5 flex flex-col justify-between">
            <div>
              <Link href="/" className="inline-block mb-5">
                <CITLogo size="md" />
              </Link>
              <p className="text-base text-[#cbd5e1] leading-relaxed max-w-md mb-8 font-medium">
                CIT Nexus connects timetables, examinations, spaces, and campus events into one coordinated digital command center for Chilika Institute of Technology.
              </p>
            </div>

            <div className="inline-flex items-center gap-2.5 text-xs font-mono font-bold text-[#c084fc]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#34d399] shadow-[0_0_8px_#34d399]" />
              <span>Campus Operational Topology v2.4 (Prototype)</span>
            </div>
          </div>

          {/* Quick Navigation Links */}
          <div className="md:col-span-3">
            <h4 className="text-sm font-mono font-black tracking-wider text-white uppercase mb-5">
              Platform Architecture
            </h4>
            <ul className="space-y-3.5 text-sm font-semibold text-[#cbd5e1]">
              <li>
                <a href="#platform-modules" className="hover:text-white hover:underline transition-colors">
                  Intelligent Timetabling
                </a>
              </li>
              <li>
                <a href="#platform-modules" className="hover:text-white hover:underline transition-colors">
                  Exam Planning Suite
                </a>
              </li>
              <li>
                <a href="#resource-grid" className="hover:text-white hover:underline transition-colors">
                  Venue & Event Management
                </a>
              </li>
              <li>
                <a href="#disruption-demo" className="hover:text-white hover:underline transition-colors">
                  Disruption Repair Simulator
                </a>
              </li>
              <li>
                <a href="#validation-principle" className="hover:text-white hover:underline transition-colors">
                  Deterministic Validation Principle
                </a>
              </li>
            </ul>
          </div>

          {/* Account & Resources */}
          <div className="md:col-span-4">
            <h4 className="text-sm font-mono font-black tracking-wider text-white uppercase mb-5">
              Access & Governance
            </h4>
            <ul className="space-y-3.5 text-sm font-semibold text-[#cbd5e1] mb-8">
              <li>
                <Link href="/login" className="text-[#fbbf24] hover:underline transition-colors font-bold">
                  Institutional Login Portal &rarr;
                </Link>
              </li>
              <li>
                <Link href="/signup" className="text-[#c084fc] hover:underline transition-colors font-bold">
                  Request Portal Account (Demo) &rarr;
                </Link>
              </li>
              <li>
                <a href="#product-preview" className="hover:text-white transition-colors">
                  Interactive Preview Console
                </a>
              </li>
            </ul>

            <div className="p-5 rounded-2xl bg-[#110529] border border-[#a855f7]/30 text-xs font-medium text-[#cbd5e1] leading-relaxed shadow-lg">
              <strong className="text-white block mb-1.5 font-bold">Concept Prototype Notice:</strong>
              This frontend interface is an architectural demonstrator for Chilika Institute of Technology. No production databases, solver engines, or authenticated sessions are active.
            </div>
          </div>
        </div>

        {/* Bottom Credits & Copyright */}
        <div className="pt-10 flex flex-col sm:flex-row items-center justify-between gap-5 text-sm font-mono font-bold text-[#cbd5e1]">
          <div>
            &copy; 2026 CIT Nexus. A campus operations platform concept for CIT.
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <span className="text-[#34d399]">Deterministic Constraint Model</span>
            <span>•</span>
            <span className="text-[#fbbf24]">Zero Unverified AI Authority</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
