'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { useReferenceData } from '@/hooks/use-reference-data';
import {
  Upload,
  AlertTriangle,
} from 'lucide-react';

export default function NewChangeRequestPage() {
  const router = useRouter();
  const { referenceData } = useReferenceData();

  const [activeTab, setActiveTab] = useState<'faculty' | 'room' | 'add' | 'remove' | 'upload'>('faculty');
  const [selectedFaculty, setSelectedFaculty] = useState('F07');
  const [unavailDay, setUnavailDay] = useState('MON');
  const [selectedRoom, setSelectedRoom] = useState('CR-102');
  const [closureReason, setClosureReason] = useState('Plumbing / Water Leak Repair');
  const [jsonContent, setJsonContent] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Navigate directly to the illustrative proposal diff preview
    router.push('/approvals/CR-0001');
  };

  return (
    <AppShell
      pageTitle="Submit Schedule Disruption"
      breadcrumbs={[{ label: 'Changes', href: '/changes' }, { label: 'New Change' }]}
    >
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Preview Banner */}
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-mono flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
          <div>
            <div className="font-bold text-amber-300">Preview — not connected yet</div>
            <div className="text-[11px] text-amber-200/80 mt-0.5">
              Disruption recalculation and change proposals will be powered by Phase 5 backend solver endpoints. The form below provides an illustrative interactive preview.
            </div>
          </div>
        </div>

        {/* Header (§5.9) */}
        <div className="p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm">
          <h1 className="text-xl sm:text-2xl font-black text-white">Disruption & Reschedule Proposer</h1>
          <p className="text-xs font-mono text-[#98A6BB] mt-1">
            The constraint solver will compute the minimal perturbation fix with zero hard violations.
          </p>

          {/* 5 Tabs (§5.9) */}
          <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab('faculty')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                activeTab === 'faculty' ? 'bg-[#66E3F0] text-[#070A12]' : 'bg-[#101A2B] text-[#98A6BB]'
              }`}
            >
              Faculty Leave
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('room')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                activeTab === 'room' ? 'bg-[#66E3F0] text-[#070A12]' : 'bg-[#101A2B] text-[#98A6BB]'
              }`}
            >
              Room Closure
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('add')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                activeTab === 'add' ? 'bg-[#66E3F0] text-[#070A12]' : 'bg-[#101A2B] text-[#98A6BB]'
              }`}
            >
              Add Session
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('remove')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                activeTab === 'remove' ? 'bg-[#66E3F0] text-[#070A12]' : 'bg-[#101A2B] text-[#98A6BB]'
              }`}
            >
              Remove Session
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                activeTab === 'upload' ? 'bg-[#8279FF] text-white' : 'bg-[#101A2B] text-[#98A6BB]'
              }`}
            >
              Upload Change File (JSON)
            </button>
          </div>
        </div>

        {/* Tab 1: Faculty Leave */}
        {activeTab === 'faculty' && (
          <form onSubmit={handleSubmit} className="p-6 rounded-3xl bg-[#0B1220] border border-white/10 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono text-[#98A6BB] mb-1">FACULTY MEMBER</label>
                <select
                  value={selectedFaculty}
                  onChange={(e) => setSelectedFaculty(e.target.value)}
                  className="w-full bg-[#101A2B] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                >
                  {referenceData.faculty.length > 0 ? (
                    referenceData.faculty.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.id} ({f.name})
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="F07">F07 (Dr. Shalini Gupta)</option>
                      <option value="F19">F19 (Dr. A. Sengupta)</option>
                      <option value="F21">F21 (Dr. M. Roy)</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono text-[#98A6BB] mb-1">LEAVE / UNAVAILABLE DAY</label>
                <select
                  value={unavailDay}
                  onChange={(e) => setUnavailDay(e.target.value)}
                  className="w-full bg-[#101A2B] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                >
                  <option value="MON">Every Monday (Full Day Leave)</option>
                  <option value="TUE">Tuesday</option>
                  <option value="WED">Wednesday</option>
                  <option value="THU">Thursday</option>
                  <option value="FRI">Friday</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-2xl text-xs font-mono font-bold bg-[#66E3F0] text-[#070A12] shadow-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            >
              <span>Preview Minimal Reschedule Proposal ▸</span>
            </button>
          </form>
        )}

        {/* Tab 2: Room Closure */}
        {activeTab === 'room' && (
          <form onSubmit={handleSubmit} className="p-6 rounded-3xl bg-[#0B1220] border border-white/10 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono text-[#98A6BB] mb-1">AFFECTED VENUE</label>
                <select
                  value={selectedRoom}
                  onChange={(e) => setSelectedRoom(e.target.value)}
                  className="w-full bg-[#101A2B] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                >
                  {referenceData.rooms.length > 0 ? (
                    referenceData.rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.id} ({r.name})
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="CR-102">CR-102 (Classroom 102)</option>
                      <option value="CR-201">CR-201 (Classroom 201)</option>
                      <option value="LH-1">LH-1 (Lecture Hall 1)</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono text-[#98A6BB] mb-1">CLOSURE REASON</label>
                <input
                  type="text"
                  value={closureReason}
                  onChange={(e) => setClosureReason(e.target.value)}
                  className="w-full bg-[#101A2B] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-2xl text-xs font-mono font-bold bg-[#66E3F0] text-[#070A12] shadow-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            >
              <span>Preview Room Relocations ▸</span>
            </button>
          </form>
        )}

        {/* Tab 5: Upload Change File (JSON) (§5.9) */}
        {activeTab === 'upload' && (
          <form onSubmit={handleSubmit} className="p-6 rounded-3xl bg-[#0B1220] border border-[#8279FF]/40 space-y-4">
            <div className="p-8 border-2 border-dashed border-[#8279FF]/50 rounded-2xl text-center space-y-2 bg-[#12082b]">
              <Upload className="w-8 h-8 text-[#8279FF] mx-auto" />
              <div className="text-sm font-bold text-white">Drag & drop changes JSON file here</div>
              <div className="text-xs text-[#98A6BB]">Matches standard schema: changes[] array with session and constraints</div>
            </div>

            <textarea
              rows={4}
              value={jsonContent}
              onChange={(e) => setJsonContent(e.target.value)}
              placeholder='[ { "type": "faculty_unavailability", "faculty_id": "F07", "day": "MON" } ]'
              className="w-full bg-[#101A2B] border border-white/10 rounded-xl p-3 text-xs font-mono text-white outline-none font-mono"
            />

            <button
              type="submit"
              className="w-full py-3 rounded-2xl text-xs font-mono font-bold bg-[#8279FF] text-white shadow-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            >
              <span>Preview Change Batch ▸</span>
            </button>
          </form>
        )}
      </div>
    </AppShell>
  );
}
