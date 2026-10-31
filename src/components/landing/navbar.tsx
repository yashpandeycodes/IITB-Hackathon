'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { CITLogo } from '../brand/logo';
import { Menu, X, ArrowRight } from 'lucide-react';
import { Button as MovingBorderButton } from '@/components/ui/moving-border';
import { MagneticButton } from '@/components/ui/magnetic-button';

export const Navbar: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'Architecture', href: '#platform-modules' },
    { label: 'Validation Model', href: '#validation-principle' },
    { label: 'Disruption Solver', href: '#disruption-demo' },
    { label: 'Campus Resources', href: '#resource-grid' },
    { label: 'Governance Matrix', href: '#roles-section' },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'py-3 bg-[#080D1B]/85 backdrop-blur-xl border-b border-white/[0.08] shadow-[0_10px_30px_rgba(0,0,0,0.5)]'
          : 'py-5 bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Official Brand Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <CITLogo size="sm" showSubtitle={true} />
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1 p-1 rounded-full bg-[#0D1426]/80 border border-white/[0.08] backdrop-blur-md">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="px-3.5 py-1.5 rounded-full text-xs font-medium text-[#A7B3C9] hover:text-[#F8FAFC] hover:bg-white/[0.05] transition-all"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* CTA Buttons */}
          <div className="hidden sm:flex items-center gap-3">
            <MagneticButton strength={0.25}>
              <Link
                href="/login"
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#A7B3C9] hover:text-[#F8FAFC] hover:bg-white/[0.05] transition-all"
              >
                Sign In
              </Link>
            </MagneticButton>

            <MagneticButton strength={0.3}>
              <Link href="/login">
                <MovingBorderButton
                  borderRadius="0.75rem"
                  className="px-4 py-2 text-xs font-bold bg-[#0D1426] text-white hover:bg-[#111B30] transition-colors gap-2"
                >
                  <span>Launch Console</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#22D3EE]" />
                </MovingBorderButton>
              </Link>
            </MagneticButton>
          </div>

          {/* Mobile Menu Trigger */}
          <div className="flex sm:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl bg-[#0D1426] border border-white/[0.1] text-[#A7B3C9] hover:text-[#F8FAFC]"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="sm:hidden bg-[#080D1B]/95 backdrop-blur-2xl border-b border-white/[0.1] px-4 pt-3 pb-6 overflow-hidden"
          >
            <div className="flex flex-col space-y-2 mb-4">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-3 py-2 text-sm font-medium text-[#A7B3C9] hover:text-[#F8FAFC] hover:bg-white/[0.04] rounded-lg transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>

            <div className="pt-3 border-t border-white/[0.08] flex flex-col gap-2.5">
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full py-2.5 text-center text-xs font-semibold text-[#A7B3C9] rounded-xl bg-[#0D1426] border border-white/[0.08]"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full py-2.5 text-center text-xs font-bold text-white rounded-xl bg-gradient-to-r from-[#6366F1] to-[#22D3EE] shadow-md shadow-[#6366F1]/20"
              >
                Request Access
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
