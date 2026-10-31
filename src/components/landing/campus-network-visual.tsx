'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, Cpu, CheckCircle2, Clock } from 'lucide-react';

interface CampusNode {
  id: string;
  name: string;
  code: string;
  type: string;
  x: number; // percentage
  y: number; // percentage
  status: 'In Session' | 'Available' | 'Exam Reserved';
  detail: string;
  capacity: string;
  accent: string;
}

const NODES: CampusNode[] = [
  {
    id: 'n-1',
    name: 'Lecture Hall 204',
    code: 'LH 204',
    type: 'Core Academic',
    x: 22,
    y: 28,
    status: 'In Session',
    detail: 'CS-301 Algorithms (82/90)',
    capacity: '90 Seats',
    accent: '#66E3F0',
  },
  {
    id: 'n-2',
    name: 'Turing Computing Lab',
    code: 'TURING LAB',
    type: 'AI & Systems',
    x: 74,
    y: 22,
    status: 'In Session',
    detail: 'CS-342 Distributed Lab',
    capacity: '65 Nodes',
    accent: '#8279FF',
  },
  {
    id: 'n-3',
    name: 'Seminar Hall 1',
    code: 'SEM HALL 1',
    type: 'Hybrid Hall',
    x: 18,
    y: 72,
    status: 'Available',
    detail: 'Ready for Requisition',
    capacity: '120 Seats',
    accent: '#10B981',
  },
  {
    id: 'n-4',
    name: 'Sarabhai Auditorium',
    code: 'SARABHAI AUD',
    type: 'Grand Complex',
    x: 78,
    y: 74,
    status: 'Exam Reserved',
    detail: 'Mid-Sem Window Slot A',
    capacity: '450 Seats',
    accent: '#F59E0B',
  },
  {
    id: 'n-5',
    name: 'CAD Simulation Lab 2',
    code: 'CAD LAB 2',
    type: 'Engineering',
    x: 48,
    y: 86,
    status: 'In Session',
    detail: 'ME-405 CFD Simulation',
    capacity: '50 Seats',
    accent: '#38BDF8',
  },
];

export const CampusNetworkVisual: React.FC = () => {
  const [activeNode, setActiveNode] = useState<CampusNode | null>(NODES[0]);

  return (
    <div className="relative w-full aspect-[4/3] max-w-2xl mx-auto rounded-3xl bg-gradient-to-b from-[#0B1220] to-[#070A12] border border-[#F4F7FB]/10 p-4 sm:p-6 shadow-[0_0_50px_-10px_rgba(102,227,240,0.15)] overflow-hidden select-none">
      {/* Background Architectural Grid Lines */}
      <div className="absolute inset-0 campus-grid-bg opacity-40 pointer-events-none" />

      {/* Atmospheric Spatial Glows */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-[#66E3F0]/08 blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-60 h-60 rounded-full bg-[#8279FF]/10 blur-3xl pointer-events-none" />

      {/* Campus Coordinate Header */}
      <div className="relative z-20 flex items-center justify-between pb-3 border-b border-[#F4F7FB]/08 text-[11px] font-mono text-[#98A6BB]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#66E3F0] animate-pulse" />
          <span className="text-[#F4F7FB] font-semibold">CAMPUS SPATIAL TOPOLOGY</span>
          <span className="hidden sm:inline text-white/30">|</span>
          <span className="hidden sm:inline text-white/60">GRID 42.84°N 85.12°E</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 rounded bg-[#66E3F0]/10 text-[#66E3F0] text-[10px] font-semibold border border-[#66E3F0]/20">
            SYNCED: 68 NODES
          </span>
        </div>
      </div>

      {/* Network Interactive Map Canvas */}
      <div className="relative w-full h-[calc(100%-40px)] min-h-[300px]">
        {/* SVG Interconnection Pathways */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="cyanLine" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#66E3F0" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#8279FF" stopOpacity="0.2" />
            </linearGradient>
            <linearGradient id="pulseGlow" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#66E3F0" stopOpacity="0.1" />
              <stop offset="50%" stopColor="#66E3F0" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#66E3F0" stopOpacity="0.1" />
            </linearGradient>
          </defs>

          {/* Central Hub Lines radiating to each node */}
          {/* Center coordinate: 50% 48% */}
          <line
            x1="50%"
            y1="48%"
            x2="22%"
            y2="28%"
            stroke="rgba(102, 227, 240, 0.25)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          <line
            x1="50%"
            y1="48%"
            x2="74%"
            y2="22%"
            stroke="rgba(130, 121, 255, 0.3)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          <line
            x1="50%"
            y1="48%"
            x2="18%"
            y2="72%"
            stroke="rgba(16, 185, 129, 0.25)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          <line
            x1="50%"
            y1="48%"
            x2="78%"
            y2="74%"
            stroke="rgba(245, 158, 11, 0.25)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          <line
            x1="50%"
            y1="48%"
            x2="48%"
            y2="86%"
            stroke="rgba(56, 189, 248, 0.25)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />

          {/* Inter-block perimeter circuits */}
          <path
            d="M 22% 28% L 74% 22% L 78% 74% L 48% 86% L 18% 72% Z"
            fill="none"
            stroke="rgba(244, 247, 251, 0.08)"
            strokeWidth="1"
          />

          {/* Animated Pulse Packets (Travel along vectors) */}
          <circle cx="50%" cy="48%" r="3" fill="#66E3F0">
            <animate attributeName="r" values="3;7;3" dur="3s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.8;0.2;0.8" dur="3s" repeatCount="indefinite" />
          </circle>
        </svg>

        {/* Central Core: CIT Nexus Dispatch Engine */}
        <div className="absolute top-[48%] left-[50%] -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center">
          <div className="relative flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#101A2B] border-2 border-[#66E3F0]/60 shadow-[0_0_30px_rgba(102,227,240,0.35)]">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-tr from-[#66E3F0]/20 to-[#8279FF]/20 animate-pulse pointer-events-none" />
            <Cpu className="w-7 h-7 sm:w-8 sm:h-8 text-[#66E3F0]" />
          </div>
          <div className="mt-2 text-center pointer-events-none">
            <span className="block text-[10px] font-mono font-bold tracking-widest text-[#F4F7FB]">NEXUS CORE</span>
            <span className="block text-[9px] font-mono text-[#66E3F0]">DISPATCH ACTIVE</span>
          </div>
        </div>

        {/* Dynamic Campus Nodes */}
        {NODES.map((node) => {
          const isSelected = activeNode?.id === node.id;
          return (
            <motion.div
              key={node.id}
              style={{ top: `${node.y}%`, left: `${node.x}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-30 cursor-pointer"
              onClick={() => setActiveNode(node)}
              whileHover={{ scale: 1.08 }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            >
              {/* Outer status glow */}
              <div
                className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border backdrop-blur-md transition-all duration-300 ${isSelected
                    ? 'bg-[#132035] border-[#66E3F0] shadow-[0_0_20px_rgba(102,227,240,0.4)]'
                    : 'bg-[#0B1220]/80 border-[#F4F7FB]/15 hover:border-[#F4F7FB]/40'
                  }`}
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: node.accent }}
                />
                <span className="text-[11px] font-mono font-semibold tracking-wide text-[#F4F7FB]">
                  {node.code}
                </span>

                {/* Sub-label for status */}
                <span
                  className="hidden sm:inline-block text-[9px] font-mono px-1.5 py-0.2 rounded"
                  style={{
                    backgroundColor: `${node.accent}15`,
                    color: node.accent,
                  }}
                >
                  {node.status}
                </span>
              </div>
            </motion.div>
          );
        })}

        {/* Floating Active Node Telemetry Card */}
        {activeNode && (
          <motion.div
            key={activeNode.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-2 left-2 right-2 sm:right-auto sm:left-3 z-40 max-w-xs p-3.5 rounded-2xl bg-[#0B1220]/95 border border-[#66E3F0]/30 backdrop-blur-xl shadow-xl shadow-black/60"
          >
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-[#F4F7FB]/10">
              <div className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[#66E3F0]" />
                <span className="text-xs font-bold text-[#F4F7FB]">{activeNode.name}</span>
              </div>
              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-white/[0.05] text-[#98A6BB]">
                {activeNode.capacity}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-[#98A6BB]">
              <span className="flex items-center gap-1 text-[#F4F7FB]">
                <Clock className="w-3 h-3 text-[#66E3F0]" />
                {activeNode.detail}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between pt-1.5 border-t border-[#F4F7FB]/06 text-[10px] text-[#66E3F0]">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Rule-verified session
              </span>
              <span className="font-mono text-[9px] text-[#98A6BB]">CLICK TO INSPECT</span>
            </div>
          </motion.div>
        )}

        {/* Small Bottom Right Floating Live Indicator */}
        <div className="hidden sm:flex absolute bottom-2 right-3 z-20 items-center gap-2 px-3 py-1.5 rounded-xl bg-[#101A2B]/75 border border-[#F4F7FB]/10 backdrop-blur-md text-[10px] font-mono text-[#98A6BB]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-ping" />
          <span>SCHEDULE SYNCHRONIZED</span>
        </div>
      </div>
    </div>
  );
};
