'use client';

import React from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { MOCK_CHANGE_REQUESTS } from '@/lib/dataset/cit-data';
import { StatusBadge } from '@/components/semantic/badges';
import { Shuffle, Plus, ArrowRight, Upload, AlertCircle } from 'lucide-react';

export default function ChangesListPage() {
  return (
    <AppShell
      pageTitle="Schedule Changes & Disruptions"
      breadcrumbs={[{ label: 'Changes' }]}
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header (§5.9) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white">Disruptions & Change Proposals</h1>
            <p className="text-xs font-mono text-[#98A6BB] mt-0.5">
              Submit faculty unavailabilities, emergency room closures, or upload JSON change batches.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/changes/new"
              className="px-4 py-2 rounded-xl text-xs font-mono font-bold bg-[#66E3F0] text-[#070A12] shadow-sm flex items-center gap-1.5 hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              <span>New Change Request</span>
            </Link>
          </div>
        </div>

        {/* Change Requests List (§5.9) */}
        <div className="space-y-4">
          {MOCK_CHANGE_REQUESTS.map((change) => (
            <div
              key={change.id}
              className="p-5 rounded-3xl bg-[#0B1220] border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-sm text-[#66E3F0]">{change.id}</span>
                  <StatusBadge status={change.status} />
                  <span className="text-[10px] font-mono text-[#98A6BB]">· {change.createdAt}</span>
                </div>
                <h3 className="text-base font-bold text-white">{change.title}</h3>
                <p className="text-xs text-[#98A6BB]">{change.reason}</p>
                <div className="text-[11px] font-mono text-emerald-400 font-bold pt-1">
                  0 hard violations ✓ · {change.moves.length} sessions moved
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Link
                  href={`/approvals/${change.id}`}
                  className="px-4 py-2 rounded-xl text-xs font-mono font-bold bg-white/10 hover:bg-white/20 text-white flex items-center gap-1.5 transition-colors"
                >
                  <span>Inspect Diff</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

