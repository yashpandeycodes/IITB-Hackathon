'use client';

import React, { useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
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
  glow: string;
}

const NODES: CampusNode[] = [
  {
    id: 'n-1',
    name: 'Lecture Hall 204',
    code: 'LH 204',
    type: 'Core Academic Tiered',
    x: 22,
    y: 28,
    status: 'In Session',
    detail: 'CS-301 Advanced Algorithms (82/90 Enrolled)',
    capacity: '90 Seats',
    accent: '#38bdf8',
    glow: 'rgba(56, 189, 248, 0.6)',
  },
  {
    id: 'n-2',
    name: 'Turing Computing Lab',
    code: 'TURING LAB',
    type: 'AI & GPU Cluster',
    x: 74,
    y: 22,
    status: 'In Session',
    detail: 'CS-342 Distributed Systems (60/65)',
    capacity: '65 RTX 4080 Nodes',
    accent: '#c084fc',
    glow: 'rgba(192, 132, 252, 0.7)',
  },
  {
    id: 'n-3',
    name: 'Seminar Hall 1',
    code: 'SEM HALL 1',
    type: 'Hybrid Telepresence',
    x: 18,
    y: 72,
    status: 'Available',
    detail: 'Ready for Requisition • AC Pre-cooled',
    capacity: '120 Seats',
    accent: '#34d399',
    glow: 'rgba(52, 211, 153, 0.6)',
  },
  {
    id: 'n-4',
    name: 'Sarabhai Auditorium',
    code: 'SARABHAI AUD',
    type: 'Grand Convocation',
    x: 78,
    y: 74,
    status: 'Exam Reserved',
    detail: 'Mid-Sem Window Slot A (1:1 Spacing)',
    capacity: '450 Seats',
    accent: '#fbbf24',
    glow: 'rgba(251, 191, 36, 0.7)',
  },
  {
    id: 'n-5',
    name: 'CAD Simulation Lab 2',
    code: 'CAD LAB 2',
    type: 'Engineering Workstations',
    x: 48,
    y: 86,
    status: 'In Session',
    detail: 'ME-405 CFD Simulation Batch B',
    capacity: '50 Seats',
    accent: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.6)',
  },
];

export const CampusNetworkVisual: React.FC = () => {
  const [activeNode, setActiveNode] = useState<CampusNode>(NODES[0]);

  // 3D Mouse Tilt Physics
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseX = useSpring(x, { stiffness: 200, damping: 20 });
  const mouseY = useSpring(y, { stiffness: 200, damping: 20 });

  const rotateX = useTransform(mouseY, [-0.5, 0.5], ['14deg', '-14deg']);
  const rotateY = useTransform(mouseX, [-0.5, 0.5], ['-18deg', '18deg']);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width - 0.5;
    const yPct = (e.clientY - rect.top) / rect.height - 0.5;
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ perspective: 1400 }}
      className="relative w-full aspect-[4/3] max-w-2xl mx-auto select-none"
    >
      {/* 3D Tilted Glass Container */}
      <motion.div
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
        }}
        className="relative w-full h-full rounded-3xl bg-gradient-to-b from-[#14082e]/90 via-[#0a031a]/95 to-[#04010a] border-2 border-[#a855f7]/40 p-5 sm:p-7 shadow-[0_25px_60px_-15px_rgba(168,85,247,0.4)] backdrop-blur-3xl overflow-hidden transition-all duration-300"
      >
        {/* Luminous Core Glow in 3D Space */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-gradient-to-tr from-[#9333ea]/30 via-[#ec4899]/25 to-[#f59e0b]/20 blur-3xl pointer-events-none" />

        {/* Dynamic Holographic Grid Floor */}
        <div
          className="absolute inset-0 opacity-25 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(192, 132, 252, 0.3) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(192, 132, 252, 0.3) 1px, transparent 1px)
            `,
            backgroundSize: '36px 36px',
          }}
        />

        {/* Top Telemetry Header Deck (Elevated in Z) */}
        <div
          style={{ transform: 'translateZ(40px)' }}
          className="relative z-20 flex items-center justify-between pb-3.5 border-b border-[#a855f7]/25 text-xs font-mono"
        >
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#fbbf24] opacity-80" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[#fbbf24]" />
            </span>
            <span className="text-white font-bold tracking-wider text-sm">
              SPATIAL CAMPUS GRID
            </span>
            <span className="hidden sm:inline text-[#a855f7] font-extrabold">•</span>
            <span className="hidden sm:inline text-[#e2e8f0] font-semibold">CIT COMMAND v2.4</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-gradient-to-r from-[#9333ea]/30 to-[#f43f5e]/30 text-[#fbcfe8] text-xs font-black border border-[#ec4899]/50 shadow-[0_0_12px_rgba(236,72,153,0.4)]">
              68 ACTIVE NODES
            </span>
          </div>
        </div>

        {/* Spatial Stage */}
        <div className="relative w-full h-[calc(100%-48px)] min-h-[320px]">
          {/* Animated Connecting Lasers & SVG Vectors */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none z-10"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="laserPurple" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#c084fc" stopOpacity="0.9" />
                <stop offset="50%" stopColor="#ec4899" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.8" />
              </linearGradient>
            </defs>

            {/* Central hub laser lines */}
            <line x1="50%" y1="50%" x2="22%" y2="28%" stroke="url(#laserPurple)" strokeWidth="2.2" strokeDasharray="5 3" />
            <line x1="50%" y1="50%" x2="74%" y2="22%" stroke="url(#laserPurple)" strokeWidth="2.2" strokeDasharray="5 3" />
            <line x1="50%" y1="50%" x2="18%" y2="72%" stroke="url(#laserPurple)" strokeWidth="2.2" strokeDasharray="5 3" />
            <line x1="50%" y1="50%" x2="78%" y2="74%" stroke="url(#laserPurple)" strokeWidth="2.2" strokeDasharray="5 3" />
            <line x1="50%" y1="50%" x2="48%" y2="86%" stroke="url(#laserPurple)" strokeWidth="2.2" strokeDasharray="5 3" />

            {/* Outer Perimeter Mesh */}
            <polygon
              points="22%,28% 74%,22% 78%,74% 48%,86% 18%,72%"
              fill="rgba(168, 85, 247, 0.05)"
              stroke="rgba(217, 70, 239, 0.35)"
              strokeWidth="1.5"
            />
          </svg>

          {/* Central Nexus 3D Power Core */}
          <div
            style={{ transform: 'translateZ(65px)' }}
            className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center"
          >
            <div className="relative flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-[#9333ea] via-[#ec4899] to-[#fbbf24] p-1 shadow-[0_0_40px_rgba(217,70,239,0.7)] group">
              <div className="w-full h-full rounded-xl bg-[#0b031d] flex items-center justify-center">
                <Cpu className="w-8 h-8 sm:w-10 sm:h-10 text-[#fbbf24] animate-pulse" />
              </div>
            </div>
            <div className="mt-2 text-center">
              <span className="block text-xs font-black font-mono tracking-widest text-white drop-shadow">
                NEXUS ENGINE
              </span>
              <span className="block text-[11px] font-mono font-bold text-[#fbbf24]">
                DISPATCH SYNCHRONIZED
              </span>
            </div>
          </div>

          {/* 3D Floating Interactive Room Nodes */}
          {NODES.map((node) => {
            const isSelected = activeNode?.id === node.id;
            return (
              <motion.div
                key={node.id}
                style={{
                  top: `${node.y}%`,
                  left: `${node.x}%`,
                  transform: 'translateZ(50px) translate(-50%, -50%)',
                }}
                className="absolute z-30 cursor-pointer"
                onClick={() => setActiveNode(node)}
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.95 }}
              >
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 backdrop-blur-xl transition-all duration-300 ${
                    isSelected
                      ? 'bg-[#1e0a42] border-[#fbbf24] shadow-[0_0_30px_rgba(251,191,36,0.8)] scale-110'
                      : 'bg-[#100424]/90 border-[#a855f7]/40 hover:border-white shadow-lg'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-[0_0_8px]"
                    style={{ backgroundColor: node.accent, boxShadow: `0 0 10px ${node.glow}` }}
                  />
                  <span className="text-xs sm:text-sm font-black font-mono tracking-wide text-white whitespace-nowrap">
                    {node.code}
                  </span>
                  <span
                    className="hidden sm:inline-block text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: `${node.accent}25`, color: node.accent }}
                  >
                    {node.status}
                  </span>
                </div>
              </motion.div>
            );
          })}

          {/* Elevated Active Telemetry Popup Deck (Pop out in Z) */}
          <div
            style={{ transform: 'translateZ(75px)' }}
            className="absolute bottom-2 left-2 right-2 sm:right-auto sm:left-3 z-40 max-w-sm p-4 sm:p-5 rounded-2xl bg-[#13062b]/95 border-2 border-[#fbbf24]/60 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/15">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#fbbf24]" />
                <span className="text-sm font-black text-white">{activeNode.name}</span>
              </div>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-white/10 text-[#fef08a] border border-[#fbbf24]/30">
                {activeNode.capacity}
              </span>
            </div>
            
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-1.5 text-[#e2e8f0] font-semibold">
                <Clock className="w-3.5 h-3.5 text-[#c084fc] shrink-0" />
                <span>{activeNode.detail}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[#34d399] font-mono font-bold text-[11px] pt-1">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>HARD CONSTRAINT VERIFIED • ZERO CONFLICTS</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
