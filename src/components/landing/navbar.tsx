'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { CITLogo } from '../brand/logo';
import { Menu, X, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';

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
    { label: 'Live Console', href: '#product-preview' },
    { label: 'Campus Fleet', href: '#resource-grid' },
    { label: 'Validation Principle', href: '#validation-principle' },
    { label: 'Disruption Sandbox', href: '#disruption-demo' },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-[#080D1B]/85 backdrop-blur-xl border-b border-[rgba(148,163,184,0.18)] py-3 shadow-[0_4px_24px_-2px_rgba(0,0,0,0.5)]'
          : 'bg-transparent py-5 border-b border-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Brand Logo */}
          <Link
            href="/"
            className="group focus:outline-none focus:ring-2 focus:ring-[#6366F1]/50 rounded-xl p-1 transition-opacity hover:opacity-90"
          >
            <CITLogo size="md" />
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1 rounded-full bg-[#0D1426]/80 border border-[rgba(148,163,184,0.18)] px-4 py-1.5 backdrop-blur-md shadow-sm">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="px-3.5 py-1.5 text-xs font-semibold text-[#A7B3C9] hover:text-[#F8FAFC] hover:bg-white/[0.05] rounded-full transition-all duration-150"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Action CTAs */}
          <div className="hidden sm:flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-xs font-semibold text-[#A7B3C9] hover:text-[#F8FAFC] transition-colors rounded-lg hover:bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/50"
            >
              Sign In
            </Link>

            {/* Premium Moving Border CTA Button */}
            <Link
              href="/signup"
              className="relative inline-flex items-center justify-center p-[1px] overflow-hidden rounded-xl group focus:outline-none focus:ring-2 focus:ring-[#22D3EE]/50"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-[#6366F1] via-[#22D3EE] to-[#6366F1] rounded-xl transition-all duration-300 opacity-80 group-hover:opacity-100 group-hover:scale-105" />
              <span className="relative flex items-center gap-2 px-4 py-2 text-xs font-bold text-[#F8FAFC] bg-[#0D1426] rounded-[11px] transition-all duration-200 group-hover:bg-[#111B30]">
                <span>Launch Console</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#22D3EE] transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
            </Link>
          </div>

          {/* Mobile Menu Trigger */}
          <div className="flex lg:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl bg-[#0D1426] border border-[rgba(148,163,184,0.18)] text-[#A7B3C9] hover:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#6366F1]"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="lg:hidden bg-[#0D1426]/95 backdrop-blur-2xl border-b border-[rgba(148,163,184,0.18)] px-4 pt-4 pb-6 mt-3 shadow-2xl"
          >
            <div className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium text-[#A7B3C9] hover:text-[#F8FAFC] hover:bg-white/[0.04] transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <div className="pt-3 mt-2 border-t border-[rgba(148,163,184,0.15)] flex flex-col gap-2.5">
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full text-center py-2.5 rounded-lg text-sm font-semibold text-[#A7B3C9] hover:text-[#F8FAFC] bg-white/[0.03] border border-[rgba(148,163,184,0.15)]"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold text-[#F8FAFC] bg-gradient-to-r from-[#6366F1] to-[#22D3EE] shadow-md"
                >
                  <span>Launch Console</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
