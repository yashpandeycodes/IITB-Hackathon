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
    <section id="product-preview" className="relative py-20 lg:py-32 scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#101A2B] border border-[#66E3F0]/20 mb-4 text-xs font-mono text-[#66E3F0]">
            <Sparkles className="w-3.5 h-3.5" />
            <span>INTERACTIVE PRODUCT PREVIEW</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#F4F7FB] tracking-tight mb-4">
            A digital command center designed for modern universities
          </h2>
          <p className="text-base sm:text-lg text-[#98A6BB]">
            Explore the live frontend interface. Switch between weekly scheduling matrices, room telemetry, and multi-tier approval pipelines.
          </p>
        </div>

        {/* Dashboard Shell Mockup */}
        <div className="rounded-3xl bg-[#0B1220] border border-[#F4F7FB]/12 shadow-2xl shadow-black/80 overflow-hidden">
          {/* Top Window / App Frame Chrome */}
          <div className="bg-[#101A2B] px-4 py-3.5 border-b border-[#F4F7FB]/10 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#EF4444]/80" />
                <div className="w-3 h-3 rounded-full bg-[#F59E0B]/80" />
                <div className="w-3 h-3 rounded-full bg-[#10B981]/80" />
              </div>
              <span className="text-xs font-mono text-[#98A6BB] hidden sm:inline">
                CIT Nexus OS v2.4 • Academic Year 2026-27 • Semester II
              </span>
            </div>

            {/* Illustrative Demo Flag */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[10px] font-mono font-medium text-[#F59E0B]">
              <Info className="w-3 h-3" />
              <span>ILLUSTRATIVE DEMO DATA</span>
            </div>
          </div>

          {/* Interactive Navigation Tabs & Search Controls */}
          <div className="p-4 sm:p-6 bg-[#0E1626]/90 border-b border-[#F4F7FB]/08 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* View Switcher Tabs */}
            <div className="inline-flex p-1 rounded-xl bg-[#070A12] border border-[#F4F7FB]/08">
              <button
                type="button"
                onClick={() => setActiveTab('timetable')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'timetable'
                    ? 'bg-[#66E3F0] text-[#070A12] shadow-sm'
                    : 'text-[#98A6BB] hover:text-[#F4F7FB]'
                }`}
              >
                <Calendar className="w-4 h-4" />
                <span>Timetable Matrix</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('rooms')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'rooms'
                    ? 'bg-[#66E3F0] text-[#070A12] shadow-sm'
                    : 'text-[#98A6BB] hover:text-[#F4F7FB]'
                }`}
              >
                <Building className="w-4 h-4" />
                <span>Room Availability</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('requests')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'requests'
                    ? 'bg-[#66E3F0] text-[#070A12] shadow-sm'
                    : 'text-[#98A6BB] hover:text-[#F4F7FB]'
                }`}
              >
                <ClipboardList className="w-4 h-4" />
                <span>Requisition Pipeline</span>
              </button>
            </div>

            {/* Filter / Search input */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 md:w-64">
                <Search className="w-3.5 h-3.5 text-[#98A6BB] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter by code, faculty, hall..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#101A2B] border border-[#F4F7FB]/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#F4F7FB] placeholder-[#98A6BB]/60 focus:outline-none focus:border-[#66E3F0]"
                />
              </div>
            </div>
          </div>

          {/* Tab View Content */}
          <div className="p-4 sm:p-6 min-h-[420px] bg-[#070A12]/60">
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
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                    <span className="text-[#98A6BB] font-mono text-[11px] mr-1">DAY:</span>
                    {(['All', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const).map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setSelectedDay(day)}
                        className={`px-3 py-1 rounded-md text-xs font-mono transition-colors ${
                          selectedDay === day
                            ? 'bg-[#101A2B] text-[#66E3F0] border border-[#66E3F0]/40 font-bold'
                            : 'text-[#98A6BB] hover:text-[#F4F7FB] bg-white/[0.02]'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>

                  {/* Timetable Table / Cards */}
                  <div className="space-y-2.5">
                    {filteredSlots.length === 0 ? (
                      <div className="text-center py-12 text-[#98A6BB] font-mono text-sm">
                        No scheduled sessions match the filter criteria.
                      </div>
                    ) : (
                      filteredSlots.map((slot) => {
                        const occupancy = Math.round((slot.enrolled / slot.capacity) * 100);
                        return (
                          <div
                            key={slot.id}
                            className="p-4 rounded-xl bg-[#101A2B]/70 border border-[#F4F7FB]/08 hover:border-[#66E3F0]/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 group"
                          >
                            <div className="flex items-start sm:items-center gap-3">
                              {/* Day & Time Block */}
                              <div className="px-2.5 py-1.5 rounded-lg bg-[#070A12] border border-[#F4F7FB]/10 text-center min-w-[70px]">
                                <span className="block text-[10px] font-mono text-[#66E3F0] font-bold">
                                  {slot.day}
                                </span>
                                <span className="block text-[9px] font-mono text-[#98A6BB] whitespace-nowrap">
                                  {slot.timeSlot.split('–')[0]}
                                </span>
                              </div>

                              {/* Course Details */}
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-bold text-[#66E3F0]">
                                    {slot.courseCode}
                                  </span>
                                  <span className="text-xs font-bold text-[#F4F7FB]">
                                    {slot.courseName}
                                  </span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-[#98A6BB] border border-white/[0.06]">
                                    {slot.tag}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-[#98A6BB] mt-1">
                                  <span>{slot.faculty}</span>
                                  <span>•</span>
                                  <span className="text-[#F4F7FB]/80">{slot.venue}</span>
                                </div>
                              </div>
                            </div>

                            {/* Capacity progress & Status Badge */}
                            <div className="flex items-center gap-4 self-end md:self-center">
                              <div className="text-right">
                                <div className="flex items-center gap-1.5 justify-end text-[11px] font-mono text-[#98A6BB]">
                                  <Users className="w-3 h-3" />
                                  <span>
                                    {slot.enrolled}/{slot.capacity} ({occupancy}%)
                                  </span>
                                </div>
                                <div className="w-24 h-1.5 bg-[#070A12] rounded-full mt-1 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      occupancy > 90 ? 'bg-[#F59E0B]' : 'bg-[#66E3F0]'
                                    }`}
                                    style={{ width: `${occupancy}%` }}
                                  />
                                </div>
                              </div>

                              <span
                                className={`text-[11px] font-mono font-medium px-2.5 py-1 rounded-full border ${
                                  slot.status === 'In Session'
                                    ? 'bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30'
                                    : slot.status === 'Exam Window'
                                    ? 'bg-[#8279FF]/15 text-[#8279FF] border-[#8279FF]/30'
                                    : 'bg-[#66E3F0]/10 text-[#66E3F0] border-[#66E3F0]/25'
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
                  {/* Status filter pills */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                    <span className="text-[#98A6BB] font-mono text-[11px] mr-1">STATUS:</span>
                    {(['All', 'Available', 'Occupied', 'Reserved'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setRoomFilter(st)}
                        className={`px-3 py-1 rounded-md text-xs font-mono transition-colors ${
                          roomFilter === st
                            ? 'bg-[#101A2B] text-[#66E3F0] border border-[#66E3F0]/40 font-bold'
                            : 'text-[#98A6BB] hover:text-[#F4F7FB] bg-white/[0.02]'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>

                  {/* Rooms Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {filteredVenues.map((venue) => (
                      <div
                        key={venue.id}
                        className="p-4 rounded-xl bg-[#101A2B]/70 border border-[#F4F7FB]/08 hover:border-[#66E3F0]/30 transition-all flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-[#F4F7FB]">
                              {venue.name}
                            </span>
                            <span
                              className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                                venue.currentStatus === 'Available'
                                  ? 'bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30'
                                  : venue.currentStatus === 'Reserved'
                                  ? 'bg-[#8279FF]/15 text-[#8279FF] border-[#8279FF]/30'
                                  : 'bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30'
                              }`}
                            >
                              {venue.currentStatus}
                            </span>
                          </div>

                          <div className="text-xs text-[#98A6BB] mb-3">
                            {venue.block} • <span className="text-[#F4F7FB]">{venue.capacity} seats</span>
                          </div>

                          {/* Features */}
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {venue.features.slice(0, 3).map((f) => (
                              <span
                                key={f}
                                className="text-[10px] px-2 py-0.5 rounded bg-white/[0.03] text-[#98A6BB] border border-white/[0.05]"
                              >
                                {f}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Next Available time & load */}
                        <div className="pt-2 border-t border-[#F4F7FB]/06 flex items-center justify-between text-[11px] font-mono text-[#98A6BB]">
                          <span>Next Slot: {venue.nextAvailable}</span>
                          <span className="text-[#66E3F0]">Util: {venue.utilizationRate}%</span>
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
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-3"
                >
                  {MOCK_REQUESTS.map((req) => (
                    <div
                      key={req.id}
                      className="p-4 rounded-xl bg-[#101A2B]/70 border border-[#F4F7FB]/08 hover:border-[#66E3F0]/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#66E3F0]/10 text-[#66E3F0] border border-[#66E3F0]/20 font-bold">
                            {req.id}
                          </span>
                          <span className="text-xs font-semibold text-[#F4F7FB]">
                            {req.title}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-[#98A6BB]">
                          <span>By: <strong className="text-[#F4F7FB]">{req.requestedBy}</strong> ({req.role})</span>
                          <span>•</span>
                          <span>Venue: <strong className="text-[#F4F7FB]">{req.venue}</strong></span>
                          <span>•</span>
                          <span>Time: {req.date} ({req.attendees} attendees)</span>
                        </div>

                        <p className="text-xs text-[#98A6BB]/80 mt-1.5 italic">
                          &ldquo;{req.notes}&rdquo;
                        </p>
                      </div>

                      {/* Constraint verification score & Status */}
                      <div className="flex items-center gap-3 self-end md:self-center">
                        <div className="text-right">
                          <div className="text-[10px] font-mono text-[#98A6BB]">CONSTRAINT SCORE</div>
                          <div className="text-sm font-mono font-bold text-[#10B981]">
                            {req.constraintScore}/100 PASSED
                          </div>
                        </div>

                        <span
                          className={`text-xs font-mono font-medium px-3 py-1.5 rounded-lg border ${
                            req.status === 'Approved'
                              ? 'bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30'
                              : req.status === 'Constraint Checked'
                              ? 'bg-[#66E3F0]/15 text-[#66E3F0] border-[#66E3F0]/30'
                              : 'bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30'
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
          <div className="bg-[#101A2B]/80 px-4 py-3 border-t border-[#F4F7FB]/08 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-xs text-[#98A6BB]">Monitored Venues</div>
              <div className="text-sm font-bold font-mono text-[#F4F7FB]">
                {CAMPUS_METRICS.totalRoomsManaged} Halls & Labs
              </div>
            </div>
            <div>
              <div className="text-xs text-[#98A6BB]">Solver Evaluation Latency</div>
              <div className="text-sm font-bold font-mono text-[#66E3F0]">
                {CAMPUS_METRICS.averageConflictResolutionSecs}s Deterministic
              </div>
            </div>
            <div>
              <div className="text-xs text-[#98A6BB]">Double-Booking Prevention</div>
              <div className="text-sm font-bold font-mono text-[#10B981]">
                {CAMPUS_METRICS.conflictPreventionAccuracy}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#98A6BB]">Space Utilization Gain</div>
              <div className="text-sm font-bold font-mono text-[#8279FF]">
                {CAMPUS_METRICS.resourceUtilizationGain}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
