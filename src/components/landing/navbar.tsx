'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { CITLogo } from '../brand/logo';
import { Menu, X, ArrowRight, Sparkles } from 'lucide-react';

export const Navbar: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'Platform Engine', href: '#platform-modules' },
    { label: 'Live Scheduling', href: '#product-preview' },
    { label: 'Campus Fleet', href: '#resource-grid' },
    { label: 'AI Validation', href: '#validation-principle' },
    { label: 'Disruption Sandbox', href: '#disruption-demo' },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-[#060212]/80 backdrop-blur-2xl border-b border-[#a855f7]/25 py-3.5 shadow-[0_10px_35px_-5px_rgba(124,58,237,0.35)]'
          : 'bg-transparent py-5 border-b border-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Brand Logo */}
          <Link href="/" className="group focus:outline-none focus:ring-2 focus:ring-[#c084fc]/50 rounded-xl p-1">
            <CITLogo size="md" />
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1.5 rounded-full bg-[#12072b]/70 border border-[#a855f7]/30 px-5 py-2 backdrop-blur-xl shadow-inner shadow-[#a855f7]/10">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="px-4 py-2 text-sm font-semibold text-[#e2e8f0] hover:text-[#ffffff] hover:bg-white/[0.08] hover:shadow-[0_0_12px_rgba(168,85,247,0.4)] rounded-full transition-all duration-200"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Action CTAs */}
          <div className="hidden sm:flex items-center gap-3.5">
            <Link
              href="/login"
              className="px-5 py-2.5 text-sm font-bold text-[#e2e8f0] hover:text-[#ffffff] transition-all hover:bg-white/[0.06] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c084fc]/40"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="relative inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-extrabold text-[#04010a] bg-gradient-to-r from-[#c084fc] via-[#f43f5e] to-[#fbbf24] hover:opacity-95 transition-all shadow-[0_0_25px_rgba(217,70,239,0.5)] hover:shadow-[0_0_35px_rgba(251,191,36,0.7)] hover:scale-105 transform-gpu"
            >
              <span>Launch Console</span>
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </Link>
          </div>

          {/* Mobile Menu Trigger */}
          <div className="flex lg:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2.5 rounded-xl bg-[#14082e] border border-[#a855f7]/40 text-[#c084fc] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#c084fc]"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Panel */}
        {mobileMenuOpen && (
          <div className="lg:hidden mt-3 rounded-3xl bg-[#0a031c]/95 border border-[#a855f7]/40 p-6 backdrop-blur-2xl shadow-2xl shadow-black animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex flex-col space-y-3">
              <div className="flex items-center gap-2 pb-3 border-b border-white/10">
                <Sparkles className="w-4 h-4 text-[#fbbf24]" />
                <span className="text-xs font-mono font-bold tracking-widest text-[#cbd5e1]">
                  CIT CAMPUS PORTAL v2.4
                </span>
              </div>
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-4 py-3 text-base font-bold text-[#e2e8f0] hover:text-white hover:bg-white/[0.08] rounded-xl transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <div className="pt-4 border-t border-white/10 flex flex-col gap-3">
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full text-center py-3 rounded-xl text-sm font-bold text-white bg-[#1a0a38] hover:bg-[#250e4f] border border-[#a855f7]/30"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-black text-[#04010a] bg-gradient-to-r from-[#c084fc] via-[#f43f5e] to-[#fbbf24] shadow-lg shadow-purple-500/30"
                >
                  <span>Launch Console (Get Started)</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
