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
    accent: '#22D3EE',
    glow: 'rgba(34, 211, 238, 0.4)',
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
    capacity: '65 High-Spec Workstations',
    accent: '#6366F1',
    glow: 'rgba(99, 102, 241, 0.45)',
  },
  {
    id: 'n-3',
    name: 'Seminar Hall 1',
    code: 'SEM HALL 1',
    type: 'Hybrid Telepresence',
    x: 18,
    y: 72,
    status: 'Available',
    detail: 'Ready for Requisition • AC Enabled',
    capacity: '120 Seats',
    accent: '#10B981',
    glow: 'rgba(16, 185, 129, 0.4)',
  },
  {
    id: 'n-4',
    name: 'Main Auditorium',
    code: 'AUDITORIUM',
    type: 'Multi-Tier Plenary',
    x: 78,
    y: 75,
    status: 'Exam Reserved',
    detail: 'Spectra Fest Tech Keynote (Pending Admin Approval)',
    capacity: '650 Seats',
    accent: '#F59E0B',
    glow: 'rgba(245, 158, 11, 0.4)',
  },
];

export const CampusNetworkVisual: React.FC = () => {
  const [selectedNode, setSelectedNode] = useState<CampusNode>(NODES[0]);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // 3D Tilt Physics
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseXSpring = useSpring(x, { stiffness: 240, damping: 20 });
  const mouseYSpring = useSpring(y, { stiffness: 240, damping: 20 });

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ['7deg', '-7deg']);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ['-7deg', '7deg']);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;

    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <div
      style={{ perspective: 1200 }}
      className="relative w-full max-w-xl mx-auto select-none"
    >
      {/* Soft Ambient Light Halo */}
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-[#6366F1]/15 via-[#22D3EE]/10 to-transparent blur-2xl opacity-60 pointer-events-none" />

      <motion.div
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
        }}
        className="relative rounded-3xl bg-[#0D1426]/90 border border-[rgba(148,163,184,0.18)] p-6 backdrop-blur-xl shadow-2xl transition-shadow duration-300 hover:shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
      >
        {/* Terminal Header Bar */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-[rgba(148,163,184,0.12)]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]/80" />
            <span className="text-[11px] font-mono text-[#A7B3C9] ml-2 font-medium">
              cit_spatial_grid.topology
            </span>
          </div>

          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#111B30] border border-[rgba(148,163,184,0.14)] text-[10px] font-mono text-[#22D3EE] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22D3EE] animate-pulse" />
            <span>27 VENUES MONITORED</span>
          </div>
        </div>

        {/* Spatial Topology Mesh Visualizer */}
        <div className="relative w-full h-[270px] rounded-2xl bg-[#080D1B]/90 border border-[rgba(148,163,184,0.12)] overflow-hidden">
          {/* Subtle Grid Coordinates */}
          <div
            className="absolute inset-0 opacity-[0.14]"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(148, 163, 184, 0.25) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(148, 163, 184, 0.25) 1px, transparent 1px)
              `,
              backgroundSize: '32px 32px',
            }}
          />

          {/* Connected SVG Pathways */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <motion.path
              d="M 120 75 L 390 60 L 410 200 L 95 190 Z"
              fill="none"
              stroke="rgba(99, 102, 241, 0.25)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            <motion.path
              d="M 120 75 L 410 200"
              fill="none"
              stroke="rgba(34, 211, 238, 0.3)"
              strokeWidth="1.5"
            />
            <motion.path
              d="M 390 60 L 95 190"
              fill="none"
              stroke="rgba(99, 102, 241, 0.3)"
              strokeWidth="1.5"
            />
          </svg>

          {/* Central Optimization Indicator */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-[#111B30] border border-[#22D3EE]/40 flex items-center justify-center mx-auto mb-1.5 shadow-[0_0_15px_rgba(34,211,238,0.25)]">
              <Cpu className="w-4 h-4 text-[#22D3EE]" />
            </div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#A7B3C9] block">
              CSP Solver Active
            </span>
          </div>

          {/* Interactive Nodes */}
          {NODES.map((node) => {
            const isSelected = selectedNode.id === node.id;
            const isHovered = hoveredNode === node.id;

            return (
              <motion.button
                key={node.id}
                type="button"
                onClick={() => setSelectedNode(node)}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                style={{
                  left: `${node.x}%`,
                  top: `${node.y}%`,
                }}
                whileHover={{ scale: 1.15 }}
                className="absolute -translate-x-1/2 -translate-y-1/2 group focus:outline-none z-20"
              >
                <div className="relative flex items-center justify-center">
                  {/* Ping Ring for In-Session or Selected */}
                  {(isSelected || node.status === 'In Session') && (
                    <span
                      style={{ backgroundColor: node.accent }}
                      className="absolute w-8 h-8 rounded-full opacity-35 animate-ping"
                    />
                  )}

                  {/* Node Circle */}
                  <div
                    style={{
                      borderColor: node.accent,
                      boxShadow: isSelected || isHovered ? `0 0 16px ${node.glow}` : 'none',
                    }}
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 border-2 ${
                      isSelected
                        ? 'bg-[#111B30] scale-110'
                        : 'bg-[#0D1426] hover:bg-[#111B30]'
                    }`}
                  >
                    <Building2
                      className="w-3.5 h-3.5 transition-colors"
                      style={{ color: node.accent }}
                    />
                  </div>

                  {/* Label Pill */}
                  <div className="absolute top-8 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded-md bg-[#0D1426]/95 border border-[rgba(148,163,184,0.18)] text-[10px] font-mono font-semibold text-[#F8FAFC] shadow-md pointer-events-none">
                    {node.code}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Selected Node Inspector Card */}
        <div className="mt-4 p-4 rounded-2xl bg-[#111B30] border border-[rgba(148,163,184,0.15)] flex items-center justify-between transition-all">
          <div className="flex items-center gap-3">
            <div
              style={{ backgroundColor: `${selectedNode.accent}18`, borderColor: selectedNode.accent }}
              className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
            >
              <Building2 style={{ color: selectedNode.accent }} className="w-5 h-5" />
            </div>

            <div className="text-left">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#F8FAFC]">
                  {selectedNode.name}
                </span>
                <span
                  style={{ color: selectedNode.accent, backgroundColor: `${selectedNode.accent}15` }}
                  className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold"
                >
                  {selectedNode.status}
                </span>
              </div>
              <p className="text-[11px] text-[#A7B3C9] mt-0.5">
                {selectedNode.detail} • <span className="text-[#F8FAFC] font-medium">{selectedNode.capacity}</span>
              </p>
            </div>
          </div>

          <div className="hidden sm:flex flex-col items-end text-right">
            <span className="text-[10px] font-mono text-[#A7B3C9] uppercase">Constraint State</span>
            <span className="text-xs font-bold text-[#10B981] flex items-center gap-1 mt-0.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              0 Violations
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
