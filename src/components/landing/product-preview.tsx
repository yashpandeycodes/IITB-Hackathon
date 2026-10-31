'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  Building,
  ClipboardList,
  Users,
  Search,
  Layers,
} from 'lucide-react';
import {
  MOCK_TIMETABLE,
  MOCK_VENUES,
  MOCK_REQUESTS,
} from '@/lib/mock-data';
import { Card3D } from '@/components/ui/card-3d';

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
      venue.block.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <section id="product-preview" className="relative py-20 lg:py-32 scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0D1426] border border-white/[0.08] mb-4 text-xs font-mono font-semibold text-[#22D3EE] shadow-sm">
            <Layers className="w-3.5 h-3.5 text-[#22D3EE]" />
            <span>OPERATIONAL DEMONSTRATOR</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#F8FAFC] tracking-tight mb-4">
            Command Console in{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#6366F1] via-[#818CF8] to-[#22D3EE]">
              Live Action
            </span>
          </h2>
          <p className="text-base sm:text-lg text-[#A7B3C9] font-normal leading-relaxed">
            Experience the multi-layered dashboard: inspect cohort schedule heatmaps, real-time spatial venue occupancy, and live club venue requests.
          </p>
        </div>

        {/* 3D Floating Console Frame */}
        <Card3D glowColor="rgba(34, 211, 238, 0.15)" depth={8}>
          <div className="rounded-3xl bg-[#0D1426]/95 border border-white/[0.1] shadow-2xl backdrop-blur-2xl overflow-hidden">
            {/* Console Window Chrome Header */}
            <div className="px-6 py-4 bg-[#111B30] border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-[#EF4444]/80" />
                  <span className="w-3 h-3 rounded-full bg-[#F59E0B]/80" />
                  <span className="w-3 h-3 rounded-full bg-[#10B981]/80" />
                </div>
                <div className="h-4 w-[1px] bg-white/10 mx-1" />
                <span className="font-mono text-xs text-[#A7B3C9] font-medium hidden sm:inline">
                  cit-nexus.edu/console • Week 7 Operations
                </span>
              </div>

              {/* View Tabs */}
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#080D1B] border border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setActiveTab('timetable')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeTab === 'timetable'
                      ? 'bg-[#111B30] text-[#F8FAFC] shadow-sm'
                      : 'text-[#A7B3C9] hover:text-[#F8FAFC]'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5 text-[#6366F1]" />
                  <span>Timetable Matrix</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('rooms')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeTab === 'rooms'
                      ? 'bg-[#111B30] text-[#F8FAFC] shadow-sm'
                      : 'text-[#A7B3C9] hover:text-[#F8FAFC]'
                  }`}
                >
                  <Building className="w-3.5 h-3.5 text-[#22D3EE]" />
                  <span>Venue Grid</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('requests')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeTab === 'requests'
                      ? 'bg-[#111B30] text-[#F8FAFC] shadow-sm'
                      : 'text-[#A7B3C9] hover:text-[#F8FAFC]'
                  }`}
                >
                  <ClipboardList className="w-3.5 h-3.5 text-[#6366F1]" />
                  <span>Requisitions ({MOCK_REQUESTS.length})</span>
                </button>
              </div>
            </div>

            {/* Filter Sub-bar */}
            <div className="px-6 py-3.5 bg-[#0D1426] border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#A7B3C9]/60 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search courses, venues, faculty..."
                    className="bg-[#111B30] border border-white/[0.1] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#F8FAFC] placeholder-[#A7B3C9]/40 outline-none focus:border-[#6366F1]"
                  />
                </div>

                {activeTab === 'timetable' && (
                  <div className="flex items-center gap-1">
                    {(['All', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const).map((day) => (
                      <button
                        key={day}
                        onClick={() => setSelectedDay(day)}
                        className={`px-2.5 py-1 rounded-md text-[11px] transition-colors ${
                          selectedDay === day
                            ? 'bg-[#6366F1] text-white font-semibold'
                            : 'text-[#A7B3C9] hover:text-[#F8FAFC]'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                )}

                {activeTab === 'rooms' && (
                  <div className="flex items-center gap-1">
                    {(['All', 'Available', 'Occupied', 'Reserved'] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setRoomFilter(f)}
                        className={`px-2.5 py-1 rounded-md text-[11px] transition-colors ${
                          roomFilter === f
                            ? 'bg-[#22D3EE] text-[#080D1B] font-bold'
                            : 'text-[#A7B3C9] hover:text-[#F8FAFC]'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 text-[#A7B3C9]">
                <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                <span>Solver Matrix Synced: 0 hard clashes</span>
              </div>
            </div>

            {/* Interactive Dynamic Tab Panels */}
            <div className="p-6 min-h-[380px]">
              <AnimatePresence mode="wait">
                {/* TAB 1: TIMETABLE MATRIX */}
                {activeTab === 'timetable' && (
                  <motion.div
                    key="timetable"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-3"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {filteredSlots.map((slot) => (
                        <div
                          key={slot.id}
                          className="p-4 rounded-xl bg-[#111B30] border border-white/[0.08] hover:border-[#6366F1]/50 transition-all flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-mono font-bold text-[#6366F1] px-2 py-0.5 rounded bg-[#6366F1]/10">
                                {slot.courseCode}
                              </span>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.05] text-[#A7B3C9]">
                                {slot.day} • {slot.timeSlot}
                              </span>
                            </div>
                            <h4 className="text-sm font-bold text-[#F8FAFC] line-clamp-1 mb-1">
                              {slot.courseName}
                            </h4>
                            <p className="text-xs text-[#A7B3C9]">{slot.faculty}</p>
                          </div>

                          <div className="pt-3 mt-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-[#A7B3C9]">
                            <span>{slot.venue}</span>
                            <span className="flex items-center gap-1 font-mono text-[11px] text-[#22D3EE]">
                              <Users className="w-3 h-3" />
                              {slot.enrolled}/{slot.capacity}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* TAB 2: ROOM OCCUPANCY */}
                {activeTab === 'rooms' && (
                  <motion.div
                    key="rooms"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
                  >
                    {filteredVenues.map((venue) => (
                      <div
                        key={venue.id}
                        className="p-4 rounded-xl bg-[#111B30] border border-white/[0.08] hover:border-[#22D3EE]/50 transition-all flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-[#F8FAFC]">{venue.name}</span>
                            <span
                              className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full ${
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

                        <div className="pt-3 mt-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-[#A7B3C9]">
                          <span>Capacity: <strong className="text-[#F8FAFC]">{venue.capacity}</strong></span>
                          <span className="font-mono text-[11px] text-[#22D3EE]">
                            AC: {venue.features.some((f) => f.toLowerCase().includes('ac') || f.toLowerCase().includes('air')) ? 'Yes' : 'No'}
                          </span>
                        </div>
                      </div>
                    ))}
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
                        className="p-4 rounded-xl bg-[#111B30] border border-white/[0.08] hover:border-[#6366F1]/50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
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
        </Card3D>
      </div>
    </section>
  );
};
