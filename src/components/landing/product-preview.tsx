'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  Building,
  ClipboardList,
  Users,
  Search,
  CheckCircle2,
  Info,
  Clock,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  MOCK_TIMETABLE,
  MOCK_VENUES,
  MOCK_REQUESTS,
  CAMPUS_METRICS,
} from '@/lib/mock-data';

export const ProductPreview: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'timetable' | 'rooms' | 'requests'>('timetable');
  const [selectedDay, setSelectedDay] = useState<'All' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri'>('All');
  const [roomFilter, setRoomFilter] = useState<'All' | 'Available' | 'Occupied' | 'Reserved'>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Filtered timetable slots
  const filteredSlots = MOCK_TIMETABLE.filter((slot) => {
    const matchesDay = selectedDay === 'All' || slot.day === selectedDay;
    const matchesSearch =
      slot.courseCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      slot.courseName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      slot.venue.toLowerCase().includes(searchQuery.toLowerCase()) ||
      slot.faculty.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesDay && matchesSearch;
  });

  // Filtered venues
  const filteredVenues = MOCK_VENUES.filter((venue) => {
    const matchesStatus = roomFilter === 'All' || venue.currentStatus === roomFilter;
    const matchesSearch =
      venue.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      venue.block.toLowerCase().includes(searchQuery.toLowerCase()) ||
      venue.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <section id="product-preview" className="relative py-20 lg:py-32 scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0D1426] border border-[rgba(148,163,184,0.18)] mb-4 text-xs font-mono font-semibold text-[#22D3EE] shadow-sm">
            <Layers className="w-3.5 h-3.5 text-[#22D3EE]" />
            <span>INTERACTIVE DASHBOARD CONSOLE</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#F8FAFC] tracking-tight mb-4">
            Unified operations console built for{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#6366F1] via-[#818CF8] to-[#22D3EE]">
              institutional precision
            </span>
          </h2>
          <p className="text-base sm:text-lg text-[#A7B3C9] font-normal leading-relaxed">
            Test the live interface. Switch views between multi-cohort schedule matrices, venue availability telemetries, and multi-tier approval pipelines.
          </p>
        </div>

        {/* Dashboard Shell Mockup with Restrained Depth */}
        <div className="rounded-2xl bg-[#0D1426] border border-[rgba(148,163,184,0.18)] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur-xl overflow-hidden">
          {/* Top Window / App Frame Chrome */}
          <div className="bg-[#111B30] px-5 py-3.5 border-b border-[rgba(148,163,184,0.14)] flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#EF4444]/80" />
                <div className="w-3 h-3 rounded-full bg-[#F59E0B]/80" />
                <div className="w-3 h-3 rounded-full bg-[#10B981]/80" />
              </div>
              <span className="text-xs font-mono font-semibold text-[#A7B3C9] ml-2 hidden sm:inline">
                cit-nexus-console.prod • AY 2026-27 • Live Coordination Matrix
              </span>
            </div>

            {/* Illustrative Demo Badge */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#111B30] border border-[rgba(148,163,184,0.18)] text-[11px] font-mono text-[#22D3EE] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22D3EE] animate-pulse" />
              <span>LIVE MOCKUP DATA</span>
            </div>
          </div>

          {/* Navigation Tabs & Search Controls */}
          <div className="p-4 sm:p-5 bg-[#0D1426] border-b border-[rgba(148,163,184,0.12)] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* View Switcher Tabs */}
            <div className="inline-flex p-1 rounded-xl bg-[#080D1B] border border-[rgba(148,163,184,0.15)] shadow-inner">
              <button
                type="button"
                onClick={() => setActiveTab('timetable')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'timetable'
                    ? 'bg-[#6366F1] text-white shadow-[0_2px_10px_rgba(99,102,241,0.35)]'
                    : 'text-[#A7B3C9] hover:text-[#F8FAFC]'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Timetable Matrix</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('rooms')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'rooms'
                    ? 'bg-[#6366F1] text-white shadow-[0_2px_10px_rgba(99,102,241,0.35)]'
                    : 'text-[#A7B3C9] hover:text-[#F8FAFC]'
                }`}
              >
                <Building className="w-3.5 h-3.5" />
                <span>Venue Availability</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('requests')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'requests'
                    ? 'bg-[#6366F1] text-white shadow-[0_2px_10px_rgba(99,102,241,0.35)]'
                    : 'text-[#A7B3C9] hover:text-[#F8FAFC]'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>Requisition Queue</span>
              </button>
            </div>

            {/* Filter / Search input */}
            <div className="relative flex-1 md:w-72">
              <Search className="w-3.5 h-3.5 text-[#A7B3C9] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search course, hall, faculty..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#111B30] border border-[rgba(148,163,184,0.18)] rounded-lg pl-9 pr-3.5 py-1.5 text-xs text-[#F8FAFC] placeholder-[#A7B3C9]/60 focus:outline-none focus:border-[#6366F1] transition-colors"
              />
            </div>
          </div>

          {/* Tab View Content Area */}
          <div className="p-5 sm:p-7 min-h-[420px] bg-[#080D1B]/60">
            <AnimatePresence mode="wait">
              {/* TAB 1: TIMETABLE */}
              {activeTab === 'timetable' && (
                <motion.div
                  key="timetable"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  {/* Day filter pills */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    <span className="text-[11px] font-mono font-semibold text-[#A7B3C9] mr-1 uppercase">Day:</span>
                    {(['All', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const).map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setSelectedDay(day)}
                        className={`px-3 py-1 rounded-md text-xs font-mono font-medium transition-all ${
                          selectedDay === day
                            ? 'bg-[#22D3EE]/15 text-[#22D3EE] border border-[#22D3EE]/40 font-bold'
                            : 'text-[#A7B3C9] hover:text-[#F8FAFC] bg-[#111B30] border border-[rgba(148,163,184,0.14)]'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>

                  {/* Timetable Cards */}
                  <div className="space-y-2.5">
                    {filteredSlots.length === 0 ? (
                      <div className="text-center py-14 text-[#A7B3C9] font-mono text-sm">
                        No scheduled sessions match the filter criteria.
                      </div>
                    ) : (
                      filteredSlots.map((slot) => {
                        const occupancy = Math.round((slot.enrolled / slot.capacity) * 100);
                        return (
                          <div
                            key={slot.id}
                            className="p-4 rounded-xl bg-[#0D1426] border border-[rgba(148,163,184,0.14)] hover:border-[#6366F1]/50 hover:bg-[#111B30]/70 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 group"
                          >
                            <div className="flex items-start sm:items-center gap-3.5">
                              {/* Day & Time Block */}
                              <div className="px-3 py-1.5 rounded-lg bg-[#111B30] border border-[rgba(148,163,184,0.16)] text-center min-w-[75px]">
                                <span className="block text-xs font-mono text-[#22D3EE] font-bold">
                                  {slot.day}
                                </span>
                                <span className="block text-[11px] font-mono text-[#A7B3C9] whitespace-nowrap">
                                  {slot.timeSlot.split('–')[0]}
                                </span>
                              </div>

                              {/* Course Details */}
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-mono font-bold text-[#6366F1] px-2 py-0.5 rounded bg-[#6366F1]/10 border border-[#6366F1]/30">
                                    {slot.courseCode}
                                  </span>
                                  <span className="text-sm font-bold text-[#F8FAFC]">
                                    {slot.courseName}
                                  </span>
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/[0.06] text-[#A7B3C9]">
                                    {slot.tag}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-[#A7B3C9] mt-1">
                                  <span className="text-[#F8FAFC] font-medium">{slot.faculty}</span>
                                  <span>•</span>
                                  <span className="text-[#22D3EE]">{slot.venue}</span>
                                </div>
                              </div>
                            </div>

                            {/* Capacity progress & Status Badge */}
                            <div className="flex items-center gap-4 self-end md:self-center">
                              <div className="text-right">
                                <div className="flex items-center gap-1.5 justify-end text-[11px] font-mono text-[#A7B3C9]">
                                  <Users className="w-3 h-3 text-[#A7B3C9]" />
                                  <span>
                                    {slot.enrolled}/{slot.capacity} ({occupancy}%)
                                  </span>
                                </div>
                                <div className="w-24 h-1.5 bg-[#111B30] rounded-full mt-1 overflow-hidden border border-[rgba(148,163,184,0.1)]">
                                  <div
                                    className={`h-full rounded-full ${
                                      occupancy > 90
                                        ? 'bg-[#F59E0B]'
                                        : 'bg-gradient-to-r from-[#6366F1] to-[#22D3EE]'
                                    }`}
                                    style={{ width: `${occupancy}%` }}
                                  />
                                </div>
                              </div>

                              <span
                                className={`text-[11px] font-mono font-semibold px-2.5 py-1 rounded-md border ${
                                  slot.status === 'In Session'
                                    ? 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/30'
                                    : slot.status === 'Exam Window'
                                    ? 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30'
                                    : 'bg-[#6366F1]/10 text-[#818CF8] border-[#6366F1]/30'
                                }`}
                              >
                                {slot.status}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </motion.div>
              )}

              {/* TAB 2: ROOM AVAILABILITY */}
              {activeTab === 'rooms' && (
                <motion.div
                  key="rooms"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    <span className="text-[11px] font-mono font-semibold text-[#A7B3C9] mr-1 uppercase">Status:</span>
                    {(['All', 'Available', 'Occupied', 'Reserved'] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setRoomFilter(status)}
                        className={`px-3 py-1 rounded-md text-xs font-mono font-medium transition-all ${
                          roomFilter === status
                            ? 'bg-[#22D3EE]/15 text-[#22D3EE] border border-[#22D3EE]/40 font-bold'
                            : 'text-[#A7B3C9] hover:text-[#F8FAFC] bg-[#111B30] border border-[rgba(148,163,184,0.14)]'
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredVenues.map((venue) => (
                      <div
                        key={venue.id}
                        className="p-4 rounded-xl bg-[#0D1426] border border-[rgba(148,163,184,0.14)] hover:border-[#6366F1]/50 transition-all flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-[#F8FAFC]">{venue.name}</span>
                            <span
                              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                                venue.currentStatus === 'Available'
                                  ? 'bg-[#10B981]/15 text-[#10B981]'
                                  : venue.currentStatus === 'Occupied'
                                  ? 'bg-[#EF4444]/15 text-[#EF4444]'
                                  : 'bg-[#F59E0B]/15 text-[#F59E0B]'
                              }`}
                            >
                              {venue.currentStatus}
                            </span>
                          </div>
                          <p className="text-xs text-[#A7B3C9]">{venue.block} • {venue.category}</p>
                        </div>

                        <div className="pt-3 mt-3 border-t border-[rgba(148,163,184,0.1)] flex items-center justify-between text-xs text-[#A7B3C9]">
                          <span>Capacity: <strong className="text-[#F8FAFC]">{venue.capacity}</strong></span>
                          <span className="font-mono text-[11px] text-[#22D3EE]">AC: {venue.features.some((f) => f.toLowerCase().includes('ac') || f.toLowerCase().includes('air')) ? 'Yes' : 'No'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* TAB 3: REQUISITIONS */}
              {activeTab === 'requests' && (
                <motion.div
                  key="requests"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-3"
                >
                  {MOCK_REQUESTS.map((req) => (
                    <div
                      key={req.id}
                      className="p-4 rounded-xl bg-[#0D1426] border border-[rgba(148,163,184,0.14)] hover:border-[#6366F1]/50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono font-bold text-[#6366F1] px-2 py-0.5 rounded bg-[#6366F1]/10">
                            {req.id}
                          </span>
                          <span className="text-sm font-bold text-[#F8FAFC]">{req.title}</span>
                        </div>
                        <p className="text-xs text-[#A7B3C9]">
                          Requested by <span className="text-[#F8FAFC]">{req.requestedBy}</span> ({req.role}) • Venue: <span className="text-[#22D3EE]">{req.venue}</span> • {req.date} ({req.timeRange})
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span
                          className={`text-[11px] font-mono font-semibold px-2.5 py-1 rounded-md border ${
                            req.status === 'Approved'
                              ? 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/30'
                              : req.status === 'Constraint Checked'
                              ? 'bg-[#22D3EE]/10 text-[#22D3EE] border-[#22D3EE]/30'
                              : 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30'
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
};
