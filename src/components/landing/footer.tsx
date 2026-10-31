import React from 'react';
import Link from 'next/link';
import { CITLogo } from '../brand/logo';

export const Footer: React.FC = () => {
  return (
    <footer className="relative border-t border-[rgba(255, 255, 255, 0.08)] bg-[#080D1B] py-16 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 pb-12 border-b border-[rgba(255, 255, 255, 0.08)]">
          {/* Brand & Mission Column */}
          <div className="md:col-span-5 flex flex-col justify-between">
            <div>
              <Link href="/" className="inline-block mb-4">
                <CITLogo size="md" />
              </Link>
              <p className="text-sm text-[#A7B3C9] leading-relaxed max-w-md mb-6 font-medium">
                CIT Nexus connects timetables, examinations, venue spaces, and campus events into one coordinated digital command center for Chilika Institute of Technology.
              </p>
            </div>

            <div className="inline-flex items-center gap-2.5 text-xs font-mono font-medium text-[#22D3EE]">
              <span className="w-2 h-2 rounded-full bg-[#10B981] shadow-[0_0_8px_#10B981]" />
              <span>Campus Operational Topology v2.4 (Active)</span>
            </div>
          </div>

          {/* Quick Navigation Links */}
          <div className="md:col-span-3">
            <h4 className="text-xs font-mono font-semibold tracking-wider text-[#F8FAFC] uppercase mb-4">
              Platform Architecture
            </h4>
            <ul className="space-y-3 text-sm text-[#A7B3C9]">
              <li>
                <a href="#platform-modules" className="hover:text-[#F8FAFC] hover:text-[#22D3EE] transition-colors">
                  Intelligent Timetabling
                </a>
              </li>
              <li>
                <a href="#platform-modules" className="hover:text-[#F8FAFC] hover:text-[#22D3EE] transition-colors">
                  Exam Planning Suite
                </a>
              </li>
              <li>
                <a href="#resource-grid" className="hover:text-[#F8FAFC] hover:text-[#22D3EE] transition-colors">
                  Venue & Event Management
                </a>
              </li>
              <li>
                <a href="#disruption-demo" className="hover:text-[#F8FAFC] hover:text-[#22D3EE] transition-colors">
                  Disruption Repair Simulator
                </a>
              </li>
              <li>
                <a href="#validation-principle" className="hover:text-[#F8FAFC] hover:text-[#22D3EE] transition-colors">
                  Deterministic Validation Principle
                </a>
              </li>
            </ul>
          </div>

          {/* Account & Resources */}
          <div className="md:col-span-4">
            <h4 className="text-xs font-mono font-semibold tracking-wider text-[#F8FAFC] uppercase mb-4">
              Access & Governance
            </h4>
            <ul className="space-y-3 text-sm text-[#A7B3C9] mb-6">
              <li>
                <Link href="/login" className="text-[#22D3EE] hover:text-[#6366F1] transition-colors font-medium">
                  Institutional Login Portal &rarr;
                </Link>
              </li>
              <li>
                <Link href="/signup" className="text-[#A7B3C9] hover:text-[#F8FAFC] transition-colors font-medium">
                  Request Portal Account &rarr;
                </Link>
              </li>
              <li>
                <a href="#product-preview" className="hover:text-[#F8FAFC] transition-colors">
                  Interactive Preview Console
                </a>
              </li>
            </ul>

            <div className="p-4 rounded-xl bg-[#0D1426] border border-[rgba(255, 255, 255, 0.08)] text-xs text-[#A7B3C9] leading-relaxed">
              <strong className="text-[#F8FAFC] block mb-1 font-semibold">Institutional Notice:</strong>
              CIT Nexus is the operational demonstrator for Chilika Institute of Technology. All scheduling constraints, room allocations, and role permissions are deterministically validated.
            </div>
          </div>
        </div>

        {/* Bottom Credits & Copyright */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-[#A7B3C9]">
          <div>
            &copy; {new Date().getFullYear()} CIT Nexus. Chilika Institute of Technology. All rights reserved.
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[#10B981]">Deterministic Constraint Model</span>
            <span>•</span>
            <span className="text-[#22D3EE]">Zero Unverified AI Authority</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
