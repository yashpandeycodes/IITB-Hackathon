'use client';

import React, { useState, useEffect } from 'react';
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
import { useCurrentUser, useDashboard } from '@/lib/api-queries';
import { ROLE_LABEL } from '@/lib/auth/roles';
import type { Role } from '@/lib/contracts';

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
  userRole: propUserRole,
  userName: propUserName,
  userEmail: propUserEmail,
  pageTitle,
  breadcrumbs = [],
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Read current user and dashboard from TanStack Query
  const { user } = useCurrentUser();
  const { data: dashboardData } = useDashboard();

  // Resolve user identity: props take precedence if given, otherwise active session
  const effectiveRoleValue: Role = user?.role ?? 'admin';
  const effectiveRoleLabel = user ? ROLE_LABEL[user.role] : (propUserRole ?? 'Admin');
  const effectiveName = propUserName ?? user?.name ?? 'User';
  const effectiveEmail = propUserEmail ?? user?.email ?? '';

  // Faculty timetable link points to their own timetable
  const timetableHref =
    user?.role === 'faculty' && user?.faculty_id
      ? `/timetable/faculty/${user.faculty_id}`
      : '/timetable/group/Y1-A';

  // Pending approvals badge count from real dashboard data
  const pendingApprovalsCount = dashboardData?.pending_approvals?.total ?? 0;

  // Keyboard shortcut listener for ⌘K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      roles: ['admin', 'department_coordinator', 'faculty', 'club'],
    },
    {
      label: 'Timetables',
      href: timetableHref,
      icon: Calendar,
      roles: ['admin', 'department_coordinator', 'faculty', 'club'],
    },
    {
      label: 'Find a room',
      href: '/rooms',
      icon: Building2,
      roles: ['admin', 'department_coordinator', 'faculty', 'club'],
    },
    {
      label: 'Bookings',
      href: '/bookings',
      icon: Ticket,
      roles: ['admin', 'department_coordinator', 'faculty', 'club'],
    },
    {
      label: 'Spectra week',
      href: '/spectra',
      icon: Sparkles,
      roles: ['admin', 'department_coordinator', 'faculty', 'club'],
    },
    {
      label: 'Approvals',
      href: '/approvals',
      icon: CheckCircle2,
      roles: ['admin', 'department_coordinator'],
      badge: pendingApprovalsCount > 0 ? String(pendingApprovalsCount) : undefined,
    },
    {
      label: 'Changes',
      href: '/changes',
      icon: Shuffle,
      roles: ['admin', 'department_coordinator', 'faculty'],
    },
    {
      label: 'AI assistant',
      href: '/assistant',
      icon: Bot,
      roles: ['admin', 'department_coordinator', 'faculty'],
    },
    {
      label: 'Exams',
      href: '/exams',
      icon: GraduationCap,
      roles: ['admin', 'department_coordinator', 'faculty', 'club'],
    },
    {
      label: 'Admin',
      href: '/admin',
      icon: ShieldAlert,
      roles: ['admin'],
    },
  ];

  // Filter allowed items for the role
  const visibleNavItems = navItems.filter((item) => item.roles.includes(effectiveRoleValue));

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
                {effectiveName}
              </div>
              <div className="text-[10px] font-mono font-bold text-[#66E3F0] uppercase tracking-wider">
                {effectiveRoleLabel}
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
              const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
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
              <span>Find room, session or event...</span>
              <kbd className="px-1.5 py-0.5 rounded bg-black/40 text-[10px] border border-white/10 text-white/50">
                ⌘K
              </kbd>
            </button>

            <Link
              href="/rooms"
              className="px-3 py-1.5 rounded-xl bg-[#66E3F0]/10 hover:bg-[#66E3F0]/20 border border-[#66E3F0]/30 text-xs font-mono font-bold text-[#66E3F0] flex items-center gap-1.5 transition-colors"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Find a room</span>
            </Link>
          </div>
        </header>

        {/* Page Content Body */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 pb-20 lg:pb-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
          <div className="fixed inset-y-0 left-0 w-72 bg-[#0B1220] border-r border-white/10 p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
                <CITLogo size="sm" />
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* User profile on mobile */}
              <div className="mb-4 px-3 py-2.5 rounded-xl bg-[#101A2B] border border-white/10">
                <div className="text-xs font-bold text-white truncate">{effectiveName}</div>
                <div className="text-[10px] font-mono text-[#66E3F0] uppercase font-bold">{effectiveRoleLabel}</div>
              </div>

              <nav className="space-y-1">
                {visibleNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium ${
                        isActive
                          ? 'bg-[#66E3F0]/20 text-[#66E3F0] font-bold border border-[#66E3F0]/40'
                          : 'text-[#98A6BB] hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <Icon className="w-4 h-4" />
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

            <div className="pt-4 border-t border-white/10">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-mono text-rose-400 hover:bg-rose-500/10"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Sticky Bottom Tab Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#0B1220]/95 backdrop-blur-md border-t border-white/10 flex items-center justify-around px-2 z-40">
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
          href={timetableHref}
          className={`flex flex-col items-center gap-1 text-[10px] font-mono ${
            pathname.startsWith('/timetable') ? 'text-[#66E3F0] font-bold' : 'text-[#98A6BB]'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Schedule</span>
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

        {effectiveRoleValue === 'admin' || effectiveRoleValue === 'department_coordinator' ? (
          <Link
            href="/approvals"
            className={`flex flex-col items-center gap-1 text-[10px] font-mono relative ${
              pathname === '/approvals' ? 'text-[#66E3F0] font-bold' : 'text-[#98A6BB]'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Approvals</span>
            {pendingApprovalsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#8279FF]" />
            )}
          </Link>
        ) : (
          <Link
            href="/spectra"
            className={`flex flex-col items-center gap-1 text-[10px] font-mono ${
              pathname === '/spectra' ? 'text-pink-400 font-bold' : 'text-[#98A6BB]'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Spectra</span>
          </Link>
        )}
      </div>
    </div>
  );
};
