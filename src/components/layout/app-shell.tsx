'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Calendar,
  Building2,
  Ticket,
  Sparkles,
  CheckCircle2,
  Shuffle,
  Bot,
  GraduationCap,
  ShieldAlert,
  Search,
  LogOut,
  Menu,
  X,
  Compass,
} from 'lucide-react';
import { CITLogo } from '@/components/brand/logo';
import { CommandPalette } from './command-palette';

interface AppShellProps {
  children: React.ReactNode;
  userRole?: string;
  userName?: string;
  userEmail?: string;
  pageTitle?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  userRole = 'Admin',
  userName = 'Dr. Rajesh Verma',
  userEmail = 'admin@citnexus.edu',
  pageTitle,
  breadcrumbs = [],
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch {
      router.push('/login');
    }
  };

  const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['Admin', 'Department Coordinator', 'Faculty', 'Club Representative'] },
    { label: 'Timetables', href: '/timetable/group/Y1-A', icon: Calendar, roles: ['Admin', 'Department Coordinator', 'Faculty', 'Club Representative'] },
    { label: 'Find a room', href: '/rooms', icon: Building2, roles: ['Admin', 'Department Coordinator', 'Faculty', 'Club Representative'] },
    { label: 'Bookings', href: '/bookings', icon: Ticket, roles: ['Admin', 'Department Coordinator', 'Faculty', 'Club Representative'] },
    { label: 'Spectra week', href: '/spectra', icon: Sparkles, roles: ['Admin', 'Department Coordinator', 'Faculty', 'Club Representative'] },
    { label: 'Approvals', href: '/approvals', icon: CheckCircle2, roles: ['Admin', 'Department Coordinator'], badge: '3' },
    { label: 'Changes', href: '/changes', icon: Shuffle, roles: ['Admin', 'Department Coordinator', 'Faculty'] },
    { label: 'AI assistant', href: '/assistant', icon: Bot, roles: ['Admin', 'Department Coordinator', 'Faculty'] },
    { label: 'Exams', href: '/exams', icon: GraduationCap, roles: ['Admin', 'Department Coordinator', 'Faculty', 'Club Representative'] },
    { label: 'Admin', href: '/admin', icon: ShieldAlert, roles: ['Admin'] },
  ];

  // Filter allowed items for the role
  const visibleNavItems = navItems.filter((item) => item.roles.includes(userRole));

  return (
    <div className="min-h-screen bg-[#070A12] text-white flex flex-col lg:flex-row relative">
      {/* ⌘K Command Palette Modal */}
      <CommandPalette isOpen={isCommandOpen} onClose={() => setIsCommandOpen(false)} />

      {/* Desktop Sidebar (§4.1) */}
      <aside className="hidden lg:flex w-64 flex-col justify-between bg-[#0B1220] border-r border-white/10 shrink-0 sticky top-0 h-screen p-4">
        <div>
          {/* Logo & Header */}
          <div className="flex items-center justify-between pb-5 border-b border-white/10 px-2">
            <Link href="/dashboard">
              <CITLogo size="sm" />
            </Link>
          </div>

          {/* User Role Pill */}
          <div className="my-4 px-3 py-2.5 rounded-xl bg-[#101A2B] border border-white/10 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-white leading-tight truncate max-w-[140px]">
                {userName}
              </div>
              <div className="text-[10px] font-mono font-bold text-[#66E3F0] uppercase tracking-wider">
                {userRole}
              </div>
            </div>
            <span className="w-2 h-2 rounded-full bg-[#10b981] shadow-[0_0_8px_#10b981]" />
          </div>

          {/* Search Trigger (⌘K) */}
          <button
            onClick={() => setIsCommandOpen(true)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[#132035] hover:bg-[#1a2b47] border border-white/10 text-xs text-[#98A6BB] transition-colors mb-4 group"
          >
            <span className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-[#66E3F0]" />
              <span>Search command...</span>
            </span>
            <kbd className="px-1.5 py-0.5 rounded bg-black/40 text-[10px] font-mono border border-white/10 text-white/70">
              ⌘K
            </kbd>
          </button>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-[#66E3F0]/15 to-[#8279FF]/15 text-[#66E3F0] border border-[#66E3F0]/40 font-bold shadow-[0_0_15px_rgba(102,227,240,0.15)]'
                      : 'text-[#98A6BB] hover:text-white hover:bg-[#101A2B]'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-[#66E3F0]' : 'text-[#98A6BB]'}`} />
                    <span>{item.label}</span>
                  </span>
                  {item.badge && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-[#8279FF] text-white">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom Session Details & Logout */}
        <div className="pt-4 border-t border-white/10 space-y-2">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-mono font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-colors"
          >
            <span className="flex items-center gap-2">
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </span>
            <span className="text-[10px] opacity-60">ESC</span>
          </button>
        </div>
      </aside>

      {/* Main Content Pane */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="h-16 px-4 md:px-6 bg-[#0B1220]/80 backdrop-blur-md border-b border-white/10 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div>
              {breadcrumbs.length > 0 && (
                <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-[#98A6BB]">
                  <Link href="/dashboard" className="hover:text-white">Nexus</Link>
                  {breadcrumbs.map((b, i) => (
                    <React.Fragment key={i}>
                      <span>/</span>
                      {b.href ? (
                        <Link href={b.href} className="hover:text-white">{b.label}</Link>
                      ) : (
                        <span className="text-white font-bold">{b.label}</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              )}
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
                {pageTitle || 'Campus Command Center'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setIsCommandOpen(true)}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#101A2B] hover:bg-[#132035] border border-white/10 text-xs font-mono text-[#98A6BB]"
            >
              <Search className="w-3.5 h-3.5 text-[#66E3F0]" />
              <span>⌘K Jump</span>
            </button>

            <Link
              href="/rooms"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-[#66E3F0]/15 hover:bg-[#66E3F0]/25 text-[#66E3F0] border border-[#66E3F0]/40 transition-colors"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Find a room ▸</span>
            </Link>

            <Link
              href="/bookings/new"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold bg-gradient-to-r from-[#8279FF] to-[#66E3F0] hover:opacity-90 text-[#070A12] shadow-sm transition-opacity"
            >
              <Ticket className="w-3.5 h-3.5" />
              <span>Book Venue</span>
            </Link>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 p-4 md:p-6 pb-20 lg:pb-6 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Mobile Drawer Navigation Sheet */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-72 max-w-[85%] bg-[#0B1220] border-r border-white/10 p-5 flex flex-col justify-between z-10">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
                <CITLogo size="sm" />
                <button onClick={() => setMobileMenuOpen(false)} className="p-1 rounded-lg hover:bg-white/10">
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>

              <div className="p-3 rounded-xl bg-[#101A2B] border border-white/10 mb-4">
                <div className="text-xs font-bold text-white">{userName}</div>
                <div className="text-[10px] font-mono text-[#66E3F0] uppercase font-bold">{userRole}</div>
              </div>

              <nav className="space-y-1">
                {visibleNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium ${
                        isActive
                          ? 'bg-[#66E3F0]/20 text-[#66E3F0] font-bold border border-[#66E3F0]/30'
                          : 'text-[#98A6BB] hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </span>
                      {item.badge && (
                        <span className="px-1.5 py-0.2 rounded bg-[#8279FF] text-white text-[10px] font-mono font-bold">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <button
              onClick={handleLogout}
              className="w-full py-2.5 rounded-xl text-xs font-mono font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      )}

      {/* Mobile Bottom Tab Bar (§4.1 & §8) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#0B1220]/95 backdrop-blur-lg border-t border-white/10 flex items-center justify-around px-2 z-40">
        <Link
          href="/dashboard"
          className={`flex flex-col items-center gap-1 text-[10px] font-mono ${
            pathname === '/dashboard' ? 'text-[#66E3F0] font-bold' : 'text-[#98A6BB]'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Home</span>
        </Link>

        <Link
          href="/timetable/group/Y1-A"
          className={`flex flex-col items-center gap-1 text-[10px] font-mono ${
            pathname.startsWith('/timetable') ? 'text-[#66E3F0] font-bold' : 'text-[#98A6BB]'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Timetable</span>
        </Link>

        <Link
          href="/rooms"
          className={`flex flex-col items-center gap-1 text-[10px] font-mono ${
            pathname === '/rooms' ? 'text-[#66E3F0] font-bold' : 'text-[#98A6BB]'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Rooms</span>
        </Link>

        {userRole === 'Admin' || userRole === 'Department Coordinator' ? (
          <Link
            href="/approvals"
            className={`flex flex-col items-center gap-1 text-[10px] font-mono relative ${
              pathname.startsWith('/approvals') ? 'text-[#66E3F0] font-bold' : 'text-[#98A6BB]'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Approvals</span>
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#8279FF]" />
          </Link>
        ) : (
          <Link
            href="/bookings"
            className={`flex flex-col items-center gap-1 text-[10px] font-mono ${
              pathname.startsWith('/bookings') ? 'text-[#66E3F0] font-bold' : 'text-[#98A6BB]'
            }`}
          >
            <Ticket className="w-4 h-4" />
            <span>Bookings</span>
          </Link>
        )}

        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center gap-1 text-[10px] font-mono text-[#98A6BB] hover:text-white"
        >
          <Menu className="w-4 h-4" />
          <span>More</span>
        </button>
      </div>
    </div>
  );
};

