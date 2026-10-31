'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  Building,
  ClipboardList,
  Users,
  Search,
  Sparkles,
  Info,
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
    <section id="product-preview" className="relative py-24 lg:py-36 scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-4xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#190938] to-[#2c0b4d] border-2 border-[#fbbf24]/50 mb-5 text-sm font-mono font-bold text-[#fbbf24] shadow-[0_0_20px_rgba(251,191,36,0.3)]">
            <Sparkles className="w-4 h-4 text-[#fbbf24]" />
            <span>INTERACTIVE PRODUCT PREVIEW</span>
          </div>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight mb-6">
            A command console built for{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#c084fc] via-[#f43f5e] to-[#fbbf24] animate-shimmer-text">
              scale and precision
            </span>
          </h2>
          <p className="text-lg sm:text-xl text-[#f1f5f9] font-medium leading-relaxed">
            Test the live interface. Switch views between multi-cohort schedule matrices, room telemetries, and multi-tier approval pipelines.
          </p>
        </div>

        {/* Dashboard Shell Mockup */}
        <div className="rounded-3xl bg-[#0c041f]/95 border-2 border-[#a855f7]/40 shadow-[0_20px_70px_-10px_rgba(168,85,247,0.35)] backdrop-blur-2xl overflow-hidden">
          {/* Top Window / App Frame Chrome */}
          <div className="bg-[#150733] px-6 py-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded-full bg-[#ef4444] shadow-[0_0_8px_#ef4444]" />
                <div className="w-3.5 h-3.5 rounded-full bg-[#f59e0b] shadow-[0_0_8px_#f59e0b]" />
                <div className="w-3.5 h-3.5 rounded-full bg-[#10b981] shadow-[0_0_8px_#10b981]" />
              </div>
              <span className="text-sm font-mono font-bold text-white tracking-wider hidden sm:inline">
                CIT Nexus OS v2.4 • Academic Year 2026-27 • Live Command View
              </span>
            </div>

            {/* Illustrative Demo Flag */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#f59e0b]/20 border border-[#f59e0b]/50 text-xs font-mono font-extrabold text-[#fde047]">
              <Info className="w-4 h-4 text-[#fde047]" />
              <span>ILLUSTRATIVE DEMO DATA</span>
            </div>
          </div>

          {/* Interactive Navigation Tabs & Search Controls */}
          <div className="p-6 bg-[#0f0526] border-b border-white/10 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            {/* View Switcher Tabs */}
            <div className="inline-flex p-1.5 rounded-2xl bg-[#050110] border border-[#a855f7]/40 shadow-inner">
              <button
                type="button"
                onClick={() => setActiveTab('timetable')}
                className={`flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  activeTab === 'timetable'
                    ? 'bg-gradient-to-r from-[#c084fc] to-[#a855f7] text-[#04010a] shadow-[0_0_20px_rgba(168,85,247,0.6)] font-black'
                    : 'text-[#cbd5e1] hover:text-white'
                }`}
              >
                <Calendar className="w-4 h-4" />
                <span>Timetable Matrix</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('rooms')}
                className={`flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  activeTab === 'rooms'
                    ? 'bg-gradient-to-r from-[#c084fc] to-[#a855f7] text-[#04010a] shadow-[0_0_20px_rgba(168,85,247,0.6)] font-black'
                    : 'text-[#cbd5e1] hover:text-white'
                }`}
              >
                <Building className="w-4 h-4" />
                <span>Room Availability</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('requests')}
                className={`flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  activeTab === 'requests'
                    ? 'bg-gradient-to-r from-[#c084fc] to-[#a855f7] text-[#04010a] shadow-[0_0_20px_rgba(168,85,247,0.6)] font-black'
                    : 'text-[#cbd5e1] hover:text-white'
                }`}
              >
                <ClipboardList className="w-4 h-4" />
                <span>Requisition Pipeline</span>
              </button>
            </div>

            {/* Filter / Search input */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1 md:w-80">
                <Search className="w-4 h-4 text-[#c084fc] absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter by code, hall, faculty..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#180938] border border-[#a855f7]/40 rounded-xl pl-11 pr-4 py-2.5 text-sm font-medium text-white placeholder-[#cbd5e1]/60 focus:outline-none focus:border-[#fbbf24] shadow-inner"
                />
              </div>
            </div>
          </div>

          {/* Tab View Content */}
          <div className="p-6 sm:p-8 min-h-[440px] bg-[#070214]/80">
            <AnimatePresence mode="wait">
              {/* TAB 1: TIMETABLE */}
              {activeTab === 'timetable' && (
                <motion.div
                  key="timetable"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-5"
                >
                  {/* Day filter pills */}
                  <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
                    <span className="text-[#fbbf24] font-mono font-bold text-xs mr-2">ACADEMIC DAY:</span>
                    {(['All', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const).map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setSelectedDay(day)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                          selectedDay === day
                            ? 'bg-[#a855f7] text-white border border-white shadow-[0_0_15px_rgba(168,85,247,0.6)]'
                            : 'text-[#cbd5e1] hover:text-white bg-[#150733] border border-white/10'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>

                  {/* Timetable Cards */}
                  <div className="space-y-3.5">
                    {filteredSlots.length === 0 ? (
                      <div className="text-center py-16 text-white font-mono text-base">
                        No scheduled sessions match the filter criteria.
                      </div>
                    ) : (
                      filteredSlots.map((slot) => {
                        const occupancy = Math.round((slot.enrolled / slot.capacity) * 100);
                        return (
                          <div
                            key={slot.id}
                            className="p-5 rounded-2xl bg-[#14082e]/80 border border-[#a855f7]/30 hover:border-[#fbbf24] hover:shadow-[0_0_25px_rgba(168,85,247,0.3)] transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group"
                          >
                            <div className="flex items-start sm:items-center gap-4">
                              {/* Day & Time Block */}
                              <div className="px-3.5 py-2 rounded-xl bg-[#080214] border border-[#a855f7]/40 text-center min-w-[85px] shadow-inner">
                                <span className="block text-sm font-mono text-[#fbbf24] font-black">
                                  {slot.day}
                                </span>
                                <span className="block text-xs font-mono font-bold text-[#e2e8f0] whitespace-nowrap">
                                  {slot.timeSlot.split('–')[0]}
                                </span>
                              </div>

                              {/* Course Details */}
                              <div>
                                <div className="flex items-center gap-2.5 flex-wrap">
                                  <span className="text-sm font-mono font-black text-[#c084fc] px-2 py-0.5 rounded bg-[#a855f7]/20 border border-[#a855f7]/40">
                                    {slot.courseCode}
                                  </span>
                                  <span className="text-base font-extrabold text-white">
                                    {slot.courseName}
                                  </span>
                                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/10 text-[#fbbf24] border border-[#fbbf24]/30">
                                    {slot.tag}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-[#cbd5e1] mt-1.5 font-medium">
                                  <span className="text-white">{slot.faculty}</span>
                                  <span>•</span>
                                  <span className="text-[#38bdf8] font-semibold">{slot.venue}</span>
                                </div>
                              </div>
                            </div>

                            {/* Capacity progress & Status Badge */}
                            <div className="flex items-center gap-5 self-end md:self-center">
                              <div className="text-right">
                                <div className="flex items-center gap-1.5 justify-end text-xs font-mono font-bold text-white">
                                  <Users className="w-3.5 h-3.5 text-[#fbbf24]" />
                                  <span>
                                    {slot.enrolled}/{slot.capacity} ({occupancy}%)
                                  </span>
                                </div>
                                <div className="w-28 h-2 bg-[#080214] rounded-full mt-1.5 overflow-hidden border border-white/10">
                                  <div
                                    className={`h-full rounded-full ${
                                      occupancy > 90
                                        ? 'bg-gradient-to-r from-[#f59e0b] to-[#ef4444]'
                                        : 'bg-gradient-to-r from-[#38bdf8] to-[#c084fc]'
                                    }`}
                                    style={{ width: `${occupancy}%` }}
                                  />
                                </div>
                              </div>

                              <span
                                className={`text-xs font-mono font-extrabold px-3.5 py-1.5 rounded-full border shadow-md ${
                                  slot.status === 'In Session'
                                    ? 'bg-[#10b981]/20 text-[#34d399] border-[#10b981]/50'
                                    : slot.status === 'Exam Window'
                                    ? 'bg-[#f59e0b]/20 text-[#fbbf24] border-[#f59e0b]/50'
                                    : 'bg-[#a855f7]/20 text-[#c084fc] border-[#a855f7]/50'
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
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-5"
                >
                  {/* Status filter pills */}
                  <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
                    <span className="text-[#fbbf24] font-mono font-bold text-xs mr-2">ROOM STATUS:</span>
                    {(['All', 'Available', 'Occupied', 'Reserved'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setRoomFilter(st)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                          roomFilter === st
                            ? 'bg-[#a855f7] text-white border border-white shadow-[0_0_15px_rgba(168,85,247,0.6)]'
                            : 'text-[#cbd5e1] hover:text-white bg-[#150733] border border-white/10'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>

                  {/* Rooms Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredVenues.map((venue) => (
                      <div
                        key={venue.id}
                        className="p-5 rounded-2xl bg-[#14082e]/80 border border-[#a855f7]/30 hover:border-[#fbbf24] hover:shadow-[0_0_30px_rgba(168,85,247,0.3)] transition-all flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-base font-extrabold text-white">
                              {venue.name}
                            </span>
                            <span
                              className={`text-xs font-mono font-black px-2.5 py-1 rounded-full border ${
                                venue.currentStatus === 'Available'
                                  ? 'bg-[#10b981]/25 text-[#34d399] border-[#10b981]/50'
                                  : venue.currentStatus === 'Reserved'
                                  ? 'bg-[#c084fc]/25 text-[#e879f9] border-[#c084fc]/50'
                                  : 'bg-[#f59e0b]/25 text-[#fbbf24] border-[#f59e0b]/50'
                              }`}
                            >
                              {venue.currentStatus}
                            </span>
                          </div>

                          <div className="text-sm font-semibold text-[#cbd5e1] mb-4">
                            {venue.block} • <strong className="text-[#fbbf24] font-bold">{venue.capacity} seats</strong>
                          </div>

                          {/* Features */}
                          <div className="flex flex-wrap gap-2 mb-4">
                            {venue.features.slice(0, 3).map((f) => (
                              <span
                                key={f}
                                className="text-xs px-2.5 py-1 rounded-lg bg-white/[0.08] text-white border border-white/10 font-medium"
                              >
                                {f}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Next Available time & load */}
                        <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs font-mono font-bold text-[#e2e8f0]">
                          <span>Next Free: <strong className="text-white">{venue.nextAvailable}</strong></span>
                          <span className="text-[#38bdf8]">LOAD: {venue.utilizationRate}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* TAB 3: REQUISITION PIPELINE */}
              {activeTab === 'requests' && (
                <motion.div
                  key="requests"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4"
                >
                  {MOCK_REQUESTS.map((req) => (
                    <div
                      key={req.id}
                      className="p-5 rounded-2xl bg-[#14082e]/80 border border-[#a855f7]/30 hover:border-[#fbbf24] transition-all flex flex-col md:flex-row md:items-center justify-between gap-5"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2.5 mb-2">
                          <span className="text-xs font-mono font-black px-2.5 py-1 rounded-md bg-[#a855f7]/30 text-[#fbcfe8] border border-[#a855f7]/50">
                            {req.id}
                          </span>
                          <span className="text-base font-extrabold text-white">
                            {req.title}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-sm text-[#cbd5e1] font-medium">
                          <span>By: <strong className="text-white">{req.requestedBy}</strong> ({req.role})</span>
                          <span>•</span>
                          <span>Venue: <strong className="text-[#fbbf24]">{req.venue}</strong></span>
                          <span>•</span>
                          <span>Time: {req.date} ({req.attendees} attendees)</span>
                        </div>

                        <p className="text-sm text-[#e2e8f0] mt-2 italic">
                          &ldquo;{req.notes}&rdquo;
                        </p>
                      </div>

                      {/* Constraint verification score & Status */}
                      <div className="flex items-center gap-4 self-end md:self-center">
                        <div className="text-right">
                          <div className="text-xs font-mono font-bold text-[#cbd5e1]">CONSTRAINT SCORE</div>
                          <div className="text-base font-mono font-black text-[#34d399]">
                            {req.constraintScore}/100 PASSED
                          </div>
                        </div>

                        <span
                          className={`text-xs font-mono font-black px-4 py-2 rounded-xl border shadow-lg ${
                            req.status === 'Approved'
                              ? 'bg-[#10b981]/20 text-[#34d399] border-[#10b981]/50'
                              : req.status === 'Constraint Checked'
                              ? 'bg-[#38bdf8]/20 text-[#38bdf8] border-[#38bdf8]/50'
                              : 'bg-[#f59e0b]/20 text-[#fbbf24] border-[#f59e0b]/50'
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

          {/* Operational Metrics Bar at Footer of Preview */}
          <div className="bg-[#14082e] px-6 py-5 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
            <div>
              <div className="text-xs font-bold font-mono text-[#cbd5e1]">MONITORED VENUES</div>
              <div className="text-lg font-black font-mono text-white mt-1">
                {CAMPUS_METRICS.totalRoomsManaged} Halls & Labs
              </div>
            </div>
            <div>
              <div className="text-xs font-bold font-mono text-[#cbd5e1]">EVALUATION LATENCY</div>
              <div className="text-lg font-black font-mono text-[#38bdf8] mt-1">
                {CAMPUS_METRICS.averageConflictResolutionSecs}s Deterministic
              </div>
            </div>
            <div>
              <div className="text-xs font-bold font-mono text-[#cbd5e1]">DOUBLE-BOOKING PROOF</div>
              <div className="text-lg font-black font-mono text-[#34d399] mt-1">
                {CAMPUS_METRICS.conflictPreventionAccuracy} Zero Clashes
              </div>
            </div>
            <div>
              <div className="text-xs font-bold font-mono text-[#cbd5e1]">SPACE UTILIZATION GAIN</div>
              <div className="text-lg font-black font-mono text-[#fbbf24] mt-1">
                {CAMPUS_METRICS.resourceUtilizationGain}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
