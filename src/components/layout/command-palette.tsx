'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Calendar,
  Building,
  User,
  CheckCircle2,
  Ticket,
  Sparkles,
  Shield,
  FileText,
  X,
} from 'lucide-react';
import { CAMPUS_ROOMS } from '@/lib/dataset/cit-data';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const router = useRouter();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else onClose(); // trigger toggle from parent
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const navigateTo = (path: string) => {
    router.push(path);
    onClose();
  };

  const navItems = [
    { title: 'Dashboard', path: '/dashboard', icon: Shield, cat: 'Pages' },
    { title: 'Timetable Explorer (Group Y1-A)', path: '/timetable/group/Y1-A', icon: Calendar, cat: 'Pages' },
    { title: 'Find a Free Room', path: '/rooms', icon: Building, cat: 'Pages' },
    { title: 'New Room Booking', path: '/bookings/new', icon: Ticket, cat: 'Pages' },
    { title: 'Spectra Week 7 Board', path: '/spectra', icon: Sparkles, cat: 'Pages' },
    { title: 'Approvals Inbox (3 pending)', path: '/approvals', icon: CheckCircle2, cat: 'Pages' },
    { title: 'Disruption Change Requests', path: '/changes', icon: FileText, cat: 'Pages' },
    { title: 'AI Timetable Assistant', path: '/assistant', icon: Sparkles, cat: 'Pages' },
    { title: 'Exam Week Grid', path: '/exams', icon: Calendar, cat: 'Pages' },
    { title: 'Admin Center & Solver', path: '/admin', icon: Shield, cat: 'Pages' },
  ];

  const groupItems = [
    { title: 'Group Y1-A (First Year Section A)', path: '/timetable/group/Y1-A', icon: Calendar, cat: 'Cohorts' },
    { title: 'Group Y1-B (First Year Section B)', path: '/timetable/group/Y1-B', icon: Calendar, cat: 'Cohorts' },
    { title: 'Cohort CSE-2 (Second Year CSE)', path: '/timetable/group/CSE-2', icon: Calendar, cat: 'Cohorts' },
    { title: 'Cohort ECE-2 (Second Year ECE)', path: '/timetable/group/ECE-2', icon: Calendar, cat: 'Cohorts' },
  ];

  const roomItems = CAMPUS_ROOMS.slice(0, 8).map((r) => ({
    title: `${r.id} · ${r.name} (${r.type}, cap ${r.capacity})`,
    path: `/timetable/room/${r.id}`,
    icon: Building,
    cat: 'Venues',
  }));

  const allItems = [...navItems, ...groupItems, ...roomItems];

  const filtered = query.trim()
    ? allItems.filter((item) => item.title.toLowerCase().includes(query.toLowerCase()) || item.cat.toLowerCase().includes(query.toLowerCase()))
    : allItems;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl rounded-2xl bg-[#0e0424] border border-[#a855f7]/40 shadow-[0_25px_70px_rgba(112,26,117,0.5)] overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center px-4 py-3.5 border-b border-white/10 gap-3">
          <Search className="w-5 h-5 text-[#fbbf24]" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a group (Y1-A), room (LH-1), faculty (F07), or screen..."
            className="w-full bg-transparent text-sm font-mono text-white placeholder-white/40 outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs font-mono text-[#cbd5e1]/60">
              No matching rooms, cohorts, or commands found for &ldquo;{query}&rdquo;.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              return (
                <button
                  key={idx}
                  onClick={() => navigateTo(item.path)}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-[#1a083a] text-left transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-white/5 text-[#c084fc] group-hover:text-[#fbbf24] group-hover:bg-[#fbbf24]/10 transition-colors">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-mono font-medium text-white group-hover:text-[#fbbf24] transition-colors">
                      {item.title}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-white/50 uppercase">
                    {item.cat}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2.5 bg-[#080216] border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-white/40">
          <span>Navigate with ⌘K / Ctrl+K</span>
          <span>CIT Nexus Quick Navigation</span>
        </div>
      </div>
    </div>
  );
};

