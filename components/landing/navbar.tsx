'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { CITLogo } from '../brand/logo';
import { Menu, X, ArrowRight, ShieldCheck } from 'lucide-react';

export const Navbar: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 24);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'Platform', href: '#platform-modules' },
    { label: 'Scheduling', href: '#product-preview' },
    { label: 'Venue Management', href: '#resource-grid' },
    { label: 'AI Copilot', href: '#validation-principle' },
    { label: 'About', href: '#problem-narrative' },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-[#070A12]/85 backdrop-blur-md border-b border-[#F4F7FB]/10 py-3 shadow-lg shadow-black/40'
          : 'bg-transparent py-5 border-b border-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Brand Logo */}
          <Link href="/" className="group focus:outline-none focus:ring-2 focus:ring-[#66E3F0]/50 rounded-lg p-1">
            <CITLogo size="md" />
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 rounded-full bg-[#101A2B]/60 border border-[#F4F7FB]/08 px-4 py-1.5 backdrop-blur-md">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="px-3.5 py-1.5 text-xs font-medium text-[#98A6BB] hover:text-[#F4F7FB] hover:bg-white/[0.04] rounded-full transition-colors focus:outline-none focus:text-[#66E3F0]"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Action CTAs */}
          <div className="hidden sm:flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-xs font-medium text-[#98A6BB] hover:text-[#F4F7FB] transition-colors focus:outline-none focus:ring-2 focus:ring-[#66E3F0]/40 rounded-lg"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="relative inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-[#070A12] bg-[#66E3F0] hover:bg-[#7ff0fc] transition-all shadow-[0_0_15px_-3px_rgba(102,227,240,0.4)] hover:shadow-[0_0_20px_0px_rgba(102,227,240,0.6)] focus:outline-none focus:ring-2 focus:ring-[#66E3F0]"
            >
              <span>Get started</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Mobile Menu Trigger */}
          <div className="flex sm:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-[#98A6BB] hover:text-[#F4F7FB] hover:bg-[#101A2B] focus:outline-none focus:ring-2 focus:ring-[#66E3F0]/50"
              aria-label={mobileMenuOpen ? 'Close main navigation menu' : 'Open main navigation menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-6 h-6 text-[#66E3F0]" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Panel */}
        {mobileMenuOpen && (
          <div className="sm:hidden mt-3 rounded-2xl bg-[#0B1220]/95 border border-[#F4F7FB]/10 p-5 backdrop-blur-xl shadow-2xl animate-in fade-in slide-in-from-top-3 duration-200">
            <div className="flex flex-col space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-[#F4F7FB]/08">
                <ShieldCheck className="w-4 h-4 text-[#66E3F0]" />
                <span className="text-[11px] font-mono tracking-wider text-[#98A6BB]">CIT CAMPUS PORTAL</span>
              </div>
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-3 py-2 text-sm font-medium text-[#98A6BB] hover:text-[#F4F7FB] hover:bg-white/[0.04] rounded-lg transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <div className="pt-3 border-t border-[#F4F7FB]/10 flex flex-col gap-2.5">
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full text-center py-2.5 rounded-lg text-sm font-medium text-[#98A6BB] hover:text-[#F4F7FB] bg-[#101A2B]/80 hover:bg-[#101A2B] border border-[#F4F7FB]/08"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-[#070A12] bg-[#66E3F0] hover:bg-[#7ff0fc] shadow-lg shadow-[#66E3F0]/20"
                >
                  <span>Get started</span>
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

