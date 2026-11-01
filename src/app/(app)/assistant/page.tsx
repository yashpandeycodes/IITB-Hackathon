'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import {
  Bot,
  Send,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  options?: Array<{
    title: string;
    proposedSlot: string;
    venue: string;
    movedSessions: number;
    softImpact: string;
    explanation: string;
  }>;
}

export default function AssistantPage() {
  const msgIdRef = useRef(1);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'm1',
      sender: 'assistant',
      text: 'Welcome to the CIT Nexus Scheduling Assistant preview. Conversational rescheduling and natural-language schedule queries will be powered by Phase 5 backend services.',
    },
  ]);

  const presetSuggestions = [
    'Move my Friday 3 PM lecture to Thursday morning',
    "I'm unavailable next Monday",
    'When is CS-LAB-1 free on Wednesday?',
    'Why is CS201 at 9 AM?',
  ];

  const handleSend = (userText: string) => {
    if (!userText.trim()) return;

    const userMsg: Message = {
      id: `u-${msgIdRef.current++}`,
      sender: 'user',
      text: userText,
    };

    let reply: Message;

    if (userText.includes('Friday 3 PM') || userText.includes('Thursday')) {
      reply = {
        id: `a-${msgIdRef.current++}`,
        sender: 'assistant',
        text: 'Illustrative suggestion: For moving your Friday P7 (15:00) CS101 lecture, Thursday P2 (09:00) at LH-1 is clash-free for all enrolled cohorts (Y1-A, Y1-B) with zero cascading perturbations.',
        options: [
          {
            title: 'Option A: Thursday P2 (09:00–10:00) in LH-1 (Preview)',
            proposedSlot: 'Thursday P2 (09:00–10:00)',
            venue: 'LH-1 (150 Seats)',
            movedSessions: 0,
            softImpact: '0 penalty delta (compactness preserved)',
            explanation: 'Room LH-1 is free; cohort Y1-A has no parallel practical or tutorial.',
          },
        ],
      };
    } else if (userText.includes('unavailable next Monday')) {
      reply = {
        id: `a-${msgIdRef.current++}`,
        sender: 'assistant',
        text: 'Illustrative suggestion: Marking Monday as unavailable will require relocating 4 teaching sessions (CS101, CS201, CS291 Lab, and CS204 Tutorial). Below is an illustrative reschedule proposal.',
        options: [
          {
            title: 'Minimal Perturbation Reschedule Fix (CR-0001 Preview)',
            proposedSlot: 'Distribute across Tue, Wed & Thu',
            venue: 'CR-201, CR-102 & CS-LAB-1',
            movedSessions: 4,
            softImpact: '+2 penalty points (H1..H14 passed)',
            explanation: 'All 4 sessions remapped with 0 instructor or cohort clashes.',
          },
        ],
      };
    } else {
      reply = {
        id: `a-${msgIdRef.current++}`,
        sender: 'assistant',
        text: 'Illustrative suggestion: Turing Computing Lab (CS-LAB-1) is unoccupied on Wednesday between 14:00 and 18:00 (P6–P9). Live assistant endpoints will be available in Phase 5.',
      };
    }

    setMessages((prev) => [...prev, userMsg, reply]);
    setInput('');
  };

  return (
    <AppShell
      pageTitle="AI Scheduling Assistant"
      breadcrumbs={[{ label: 'AI Assistant' }]}
    >
      <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-140px)] justify-between space-y-4">
        {/* Preview Banner */}
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-mono flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
          <div>
            <div className="font-bold text-amber-300">Preview — not connected yet</div>
            <div className="text-[11px] text-amber-200/80 mt-0.5">
              The AI Scheduling Assistant and natural language rescheduling will be powered by Phase 5 backend services (<code>POST /api/assistant</code>). The conversation below is an illustrative visual preview.
            </div>
          </div>
        </div>

        {/* Preset Suggestions (§5.10) */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[11px] font-mono text-[#98A6BB]">Quick Prompts:</span>
          {presetSuggestions.map((text, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSend(text)}
              className="px-3 py-1 rounded-xl text-xs font-mono bg-[#0B1220] hover:bg-[#132035] text-[#cbd5e1] hover:text-[#66E3F0] border border-white/10 transition-colors"
            >
              {text}
            </button>
          ))}
        </div>

        {/* Chat Thread */}
        <div className="flex-1 overflow-y-auto space-y-4 p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex items-start gap-3 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.sender === 'assistant' && (
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#66E3F0] to-[#8279FF] flex items-center justify-center text-[#070A12] shrink-0 font-bold">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-xl p-4 rounded-2xl text-xs leading-relaxed ${
                  m.sender === 'user'
                    ? 'bg-[#8279FF] text-white font-medium ml-12'
                    : 'bg-[#101A2B] text-[#cbd5e1] border border-white/10 mr-12'
                }`}
              >
                <p>{m.text}</p>

                {/* Option Cards */}
                {m.options && (
                  <div className="mt-4 space-y-2.5">
                    {m.options.map((opt, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl bg-[#070A12] border border-[#66E3F0]/40 space-y-2 text-white"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs font-mono text-[#66E3F0]">{opt.title}</span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            <ShieldCheck className="w-3 h-3 text-amber-400" />
                            Illustrative Option (Preview)
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-[#98A6BB]">
                          <div>Slot: <strong className="text-white">{opt.proposedSlot}</strong></div>
                          <div>Venue: <strong className="text-white">{opt.venue}</strong></div>
                          <div>Impact: <strong className="text-white">{opt.softImpact}</strong></div>
                          <div>Moved: <strong className="text-white">{opt.movedSessions} sessions</strong></div>
                        </div>

                        <div className="text-[11px] text-[#cbd5e1] pt-1">{opt.explanation}</div>

                        <div className="pt-2 flex items-center justify-end gap-2">
                          <Link
                            href="/approvals/CR-0001"
                            className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-[#66E3F0] text-[#070A12] flex items-center gap-1.5 shadow-sm"
                          >
                            <span>Inspect Change Proposal</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-2 rounded-2xl bg-[#0B1220] border border-white/10 flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
            placeholder="Type your rescheduling question or room query..."
            className="flex-1 bg-transparent px-3 py-2 text-xs font-mono text-white outline-none"
          />
          <button
            type="button"
            onClick={() => handleSend(input)}
            className="px-4 py-2 rounded-xl bg-[#66E3F0] text-[#070A12] text-xs font-mono font-bold flex items-center gap-1.5"
          >
            <span>Send</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </AppShell>
  );
}
