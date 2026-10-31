import React from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth/jwt';
import { AppShell } from '@/components/layout/app-shell';
import { Ticket, Sparkles, Building2, ArrowRight } from 'lucide-react';

export const metadata = {
  title: 'Club Representative Hub — CIT Nexus',
  description: 'Student societies venue booking and Spectra week coordination.',
};

export default async function ClubPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) redirect('/login');

  const session = await verifySessionToken(token);
  if (!session || (session.role !== 'Club Representative' && session.role !== 'Admin')) {
    redirect('/unauthorized?role=' + (session?.role || 'Guest') + '&attemptedSector=/club');
  }

  return (
    <AppShell
      userRole={session.role}
      userName={session.name}
      userEmail={session.email}
      pageTitle="Club & Societies Command"
      breadcrumbs={[{ label: 'Club Hub' }]}
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="p-6 rounded-3xl bg-[#0B1220] border border-pink-500/30 shadow-lg">
          <h1 className="text-2xl font-bold text-white">Student Societies & Cultural Operations</h1>
          <p className="text-xs font-mono text-[#98A6BB] mt-1">
            Book event venues, check real-time availability, and coordinate Spectra Week 7 cultural events.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            <Link
              href="/bookings/new"
              className="p-4 rounded-2xl bg-[#101A2B] border border-white/5 hover:border-pink-500/40 transition-colors block"
            >
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-pink-400 mb-1">
                <Ticket className="w-4 h-4" />
                <span>Book a Venue (AI & Form)</span>
              </div>
              <div className="text-[11px] text-[#98A6BB]">Describe in Hinglish or select room</div>
            </Link>

            <Link
              href="/spectra"
              className="p-4 rounded-2xl bg-[#101A2B] border border-white/5 hover:border-[#8279FF]/40 transition-colors block"
            >
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#8279FF] mb-1">
                <Sparkles className="w-4 h-4" />
                <span>Spectra Week 7 Board</span>
              </div>
              <div className="text-[11px] text-[#98A6BB]">Auditorium, OAT & Seminar Hall decisions</div>
            </Link>

            <Link
              href="/rooms"
              className="p-4 rounded-2xl bg-[#101A2B] border border-white/5 hover:border-[#66E3F0]/40 transition-colors block"
            >
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#66E3F0] mb-1">
                <Building2 className="w-4 h-4" />
                <span>Explore Free Venues</span>
              </div>
              <div className="text-[11px] text-[#98A6BB]">Filters for sound, stage, and capacity</div>
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
