'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { AppShell } from '@/components/layout/app-shell';
import { useSessionUser } from '@/components/providers/session-provider';
import {
  apiGet,
  apiPost,
  apiPatch,
  isApiClientError,
  streamTimetableGeneration,
} from '@/lib/api-client';
import {
  Category,
  TimetableVersionSummarySchema,
  ActivateTimetableResultSchema,
  ImportReportSchema,
  ResetReportSchema,
  SettingsSchema,
  DashboardSchema,
  ValidatorReportSchema,
  type SolverProgress,
  type GenerateTimetableResult,
  type TimetableVersionSummary,
  type ImportReport,
  type ResetReport,
  type Settings,
  type SettingsPatch,
} from '@/lib/contracts';
import {
  Database,
  Zap,
  CheckCircle2,
  Download,
  Settings as SettingsIcon,
  AlertTriangle,
  RotateCcw,
  Clock,
  Layers,
  StopCircle,
  Upload,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  X,
  ShieldAlert,
} from 'lucide-react';

interface GenerationErrorState {
  code?: string;
  message: string;
  status?: number;
  details?: unknown;
}

const CATEGORY_LABELS: Record<string, string> = {
  exam: 'Examinations (Strict Precedence)',
  regular_session: 'Regular Academic Sessions',
  institute_event: 'Institute-Level Events',
  guest_lecture: 'Distinguished Guest Lectures',
  department_event: 'Departmental Symposiums & Seminars',
  club_event: 'Student Club & Cultural Activities',
};

const RULE_SPECIFICATIONS: Record<string, { name: string; description: string }> = {
  H1: { name: 'Sessions Scheduled & Unique', description: 'Every required curriculum session scheduled and no duplicate session' },
  H2: { name: 'No Room Double-Booking', description: 'At most one session per room per period' },
  H3: { name: 'No Faculty Double-Booking', description: 'Faculty cannot teach multiple classes at once' },
  H4: { name: 'No Student Cohort Clash', description: 'No cohort has two parallel sessions' },
  H5: { name: 'Room Capacity Compliance', description: 'Enrolled students <= Room seating capacity' },
  H6: { name: 'Room Feature Compliance', description: 'AV and laboratory equipment requirements satisfied' },
  H7: { name: 'Room Allowed Uses', description: 'Room allowed uses include the scheduled activity' },
  H8: { name: 'Contiguous Lab Blocks (3h)', description: 'Practicals run in contiguous 3-period blocks' },
  H9: { name: 'Max Daily Faculty Load', description: 'Faculty assigned at most 4 teaching hours per day' },
  H10: { name: 'Weekly Course Frequency', description: 'All weekly required lecture slots mapped' },
  H11: { name: 'Department Lab Access Rules', description: 'Specialised labs allocated only to host departments' },
  H12: { name: 'Elective Basket Alignment', description: 'Basket courses run synchronously in disjoint rooms' },
  H13: { name: 'Spectra Booking Validity', description: 'Approved bookings meet room, window, capacity and group constraints' },
  H14: { name: 'Spectra Session Overrides', description: 'Moved sessions valid in target rooms and periods' },
  B1: { name: 'Booking Priority Hierarchy', description: 'Higher-priority category events strictly outrank lower' },
  B2: { name: 'Booking Window Constraint', description: 'Approved bookings placed inside requested windows' },
  B3: { name: 'Booking Venue Capacity', description: 'Assigned venue capacity covers requested attendance' },
  E1: { name: 'Exam Cohort One-Per-Day', description: 'No student cohort has more than one exam per day' },
  E2: { name: 'Exam Room Seat Split', description: 'Sum of split room seats >= total examinees' },
};

const SOFT_RULE_SPECIFICATIONS: Record<string, { name: string; description: string; weight: number }> = {
  S1: { name: 'Student Schedule Compactness', description: 'Minimising idle gap periods between classes for students', weight: 3 },
  S2: { name: 'Faculty Schedule Compactness', description: 'Minimising idle windows between teaching slots for faculty', weight: 2 },
  S3: { name: 'Room Capacity Utilization Match', description: 'Avoiding placing small groups in huge auditoriums', weight: 2 },
  S4: { name: 'Preferred Time of Day Distribution', description: 'Core lectures scheduled in morning periods P1–P4', weight: 1 },
  S5: { name: 'Faculty Building Commute Walking', description: 'Minimising inter-building transit for consecutive periods', weight: 1 },
  S6: { name: 'Even Weekly Distribution', description: 'Evenly spreading course credits and avoiding Friday late slots', weight: 1 },
};

interface SettingsFormProps {
  initialSettings: Settings;
  onSave: (patch: SettingsPatch) => void;
  isSaving: boolean;
  fieldErrors: Record<string, string[]>;
  onClearFieldError: (field: string) => void;
}

function SettingsForm({
  initialSettings,
  onSave,
  isSaving,
  fieldErrors,
  onClearFieldError,
}: SettingsFormProps) {
  const [team, setTeam] = useState(initialSettings.team);
  const [llmEnabled, setLlmEnabled] = useState(initialSettings.llm_enabled);
  const [referenceDate, setReferenceDate] = useState(initialSettings.reference_date);
  const [solverSeed, setSolverSeed] = useState(initialSettings.solver_seed);
  const [priorityOrder, setPriorityOrder] = useState<Category[]>(initialSettings.priority_order);

  const movePriority = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= priorityOrder.length) return;
    const next = [...priorityOrder];
    const item = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = item;
    setPriorityOrder(next);
    onClearFieldError('priority_order');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      team: team.trim(),
      llm_enabled: llmEnabled,
      reference_date: referenceDate.trim(),
      solver_seed: Number(solverSeed),
      priority_order: priorityOrder,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {/* Team Name */}
      <div className="space-y-1.5">
        <label className="block text-xs font-mono font-bold text-white uppercase">
          Team Name
        </label>
        <input
          type="text"
          value={team}
          onChange={(e) => {
            setTeam(e.target.value);
            onClearFieldError('team');
          }}
          className={`w-full bg-[#101A2B] border rounded-xl px-3.5 py-2.5 text-xs font-mono text-white outline-none focus:border-[#66E3F0] transition-colors ${
            fieldErrors.team ? 'border-rose-500' : 'border-white/10'
          }`}
        />
        {fieldErrors.team && fieldErrors.team.length > 0 && (
          <div className="text-[11px] font-mono text-rose-400">
            {fieldErrors.team.join(', ')}
          </div>
        )}
      </div>

      {/* Solver Seed & Reference Date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="block text-xs font-mono font-bold text-white uppercase">
            Solver Seed (RNG)
          </label>
          <input
            type="number"
            value={solverSeed}
            onChange={(e) => {
              setSolverSeed(Number(e.target.value));
              onClearFieldError('solver_seed');
            }}
            className={`w-full bg-[#101A2B] border rounded-xl px-3.5 py-2.5 text-xs font-mono text-white outline-none focus:border-[#66E3F0] transition-colors ${
              fieldErrors.solver_seed ? 'border-rose-500' : 'border-white/10'
            }`}
          />
          <div className="text-[11px] text-[#98A6BB]">
            Deterministic seed for multi-objective annealing.
          </div>
          {fieldErrors.solver_seed && fieldErrors.solver_seed.length > 0 && (
            <div className="text-[11px] font-mono text-rose-400">
              {fieldErrors.solver_seed.join(', ')}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-mono font-bold text-white uppercase">
            Reference Date (YYYY-MM-DD)
          </label>
          <input
            type="text"
            placeholder="2027-01-04"
            value={referenceDate}
            onChange={(e) => {
              setReferenceDate(e.target.value);
              onClearFieldError('reference_date');
            }}
            className={`w-full bg-[#101A2B] border rounded-xl px-3.5 py-2.5 text-xs font-mono text-white outline-none focus:border-[#66E3F0] transition-colors ${
              fieldErrors.reference_date ? 'border-rose-500' : 'border-white/10'
            }`}
          />
          <div className="text-[11px] text-[#98A6BB]">
            Reference anchor for relative date parsing.
          </div>
          {fieldErrors.reference_date && fieldErrors.reference_date.length > 0 && (
            <div className="text-[11px] font-mono text-rose-400">
              {fieldErrors.reference_date.join(', ')}
            </div>
          )}
        </div>
      </div>

      {/* LLM Natural Language Parser */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-[#101A2B] border border-white/10">
        <div className="space-y-0.5">
          <div className="text-xs font-mono font-bold text-white">LLM Natural Language Parser</div>
          <div className="text-[11px] text-[#98A6BB]">
            Enable Gemini structured extraction for conversational booking requests.
          </div>
        </div>
        <input
          type="checkbox"
          checked={llmEnabled}
          onChange={(e) => setLlmEnabled(e.target.checked)}
          className="w-4 h-4 rounded text-[#66E3F0] accent-[#66E3F0] cursor-pointer"
        />
      </div>

      {/* Priority Order List */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-mono font-bold text-white uppercase">
            Priority Ordering (Precedence Order)
          </label>
          <p className="text-[11px] text-[#98A6BB]">
            Top categories take precedence when booking or scheduling conflicts arise.
          </p>
        </div>

        {fieldErrors.priority_order && fieldErrors.priority_order.length > 0 && (
          <div className="text-[11px] font-mono text-rose-400">
            {fieldErrors.priority_order.join(', ')}
          </div>
        )}

        <div className="space-y-2">
          {priorityOrder.map((cat, idx) => (
            <div
              key={cat}
              className="p-3 rounded-2xl bg-[#101A2B] border border-white/10 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 text-[11px] font-mono font-bold text-[#66E3F0] flex items-center justify-center">
                  #{idx + 1}
                </span>
                <div>
                  <div className="text-xs font-mono font-bold text-white">
                    {CATEGORY_LABELS[cat] ?? cat}
                  </div>
                  <div className="text-[10px] font-mono text-[#98A6BB]">{cat}</div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => movePriority(idx, 'up')}
                  disabled={idx === 0}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[#98A6BB] hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  title="Move Up"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => movePriority(idx, 'down')}
                  disabled={idx === priorityOrder.length - 1}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[#98A6BB] hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  title="Move Down"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Save Button */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={isSaving}
          className="px-6 py-2.5 rounded-xl text-xs font-mono font-bold bg-[#66E3F0] text-[#070A12] hover:opacity-90 shadow-md flex items-center gap-2 disabled:opacity-50 transition-all cursor-pointer"
        >
          {isSaving ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Saving Settings...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Save System Settings</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}

export default function AdminConsolePage() {
  const queryClient = useQueryClient();
  const sessionUser = useSessionUser();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');

  const [tabOverride, setTabOverride] = useState<'generate' | 'validate' | 'data' | 'export' | 'settings' | null>(null);
  const activeTab = tabOverride ?? (
    tabParam && ['generate', 'validate', 'data', 'export', 'settings'].includes(tabParam)
      ? (tabParam as 'generate' | 'validate' | 'data' | 'export' | 'settings')
      : 'generate'
  );
  const setActiveTab = (tab: 'generate' | 'validate' | 'data' | 'export' | 'settings') => setTabOverride(tab);

  // Solver generation settings
  const [seed, setSeed] = useState(42);
  const [timeBudget, setTimeBudget] = useState(30);

  // Live generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<SolverProgress | null>(null);
  const [generationResult, setGenerationResult] = useState<GenerateTimetableResult | null>(null);
  const [generationError, setGenerationError] = useState<GenerationErrorState | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Query invalidation helper for all dataset-dependent operations
  const invalidateAllDatasetQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['reference'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['timetable'] });
    queryClient.invalidateQueries({ queryKey: ['timetable', 'versions'] });
    queryClient.invalidateQueries({ queryKey: ['exams'] });
    queryClient.invalidateQueries({ queryKey: ['spectra'] });
    queryClient.invalidateQueries({ queryKey: ['validate'] });
    queryClient.invalidateQueries({ queryKey: ['settings'] });
  };

  // Dashboard query for live dataset statistics
  const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiGet('/api/dashboard', DashboardSchema),
  });

  // Validator report query
  const {
    data: validatorData,
    isLoading: validatorLoading,
    isError: validatorError,
    error: validatorErr,
    refetch: refetchValidator,
    isFetching: validatorFetching,
  } = useQuery({
    queryKey: ['validate'],
    queryFn: () => apiGet('/api/validate', ValidatorReportSchema),
    enabled: activeTab === 'validate',
  });

  // Timetable Versions query
  const {
    data: versions,
    isLoading: versionsLoading,
    isError: versionsError,
    refetch: refetchVersions,
  } = useQuery({
    queryKey: ['timetable', 'versions'],
    queryFn: () => apiGet('/api/timetable/versions', z.array(TimetableVersionSummarySchema)),
    staleTime: 10_000,
  });

  // Activate Version mutation
  const activateMutation = useMutation({
    mutationFn: (versionId: string) =>
      apiPost(`/api/timetable/versions/${versionId}/activate`, {}, ActivateTimetableResultSchema),
    onSuccess: (res) => {
      toast.success(`Timetable version ${res.version.id} is now active!`);
      invalidateAllDatasetQueries();
      refetchVersions();
    },
    onError: (err: unknown) => {
      if (isApiClientError(err)) {
        if (err.code === 'STALE_VERSION' || err.status === 409) {
          toast.error('Stale Version: This version was built for another dataset. Generate a new timetable.');
        } else if (err.code === 'HARD_CONSTRAINT') {
          toast.error(`Hard constraint violation: ${err.message}`);
        } else {
          toast.error(err.message);
        }
      } else {
        toast.error('Failed to activate timetable version.');
      }
    },
  });

  // Dataset Import state and handler
  const [isUploading, setIsUploading] = useState(false);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [importIssues, setImportIssues] = useState<Array<{ path: string; message: string }> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setImportReport(null);
    setImportIssues(null);

    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        toast.error('The selected file is not valid JSON.');
        setIsUploading(false);
        return;
      }

      const report = await apiPost('/api/admin/dataset', parsed, ImportReportSchema);
      setImportReport(report);
      toast.success(`Dataset "${report.dataset_id}" imported successfully!`);
      invalidateAllDatasetQueries();
    } catch (err: unknown) {
      if (isApiClientError(err)) {
        if (err.status === 400) {
          const details = err.details as
            | { issue_count?: number; issues?: Array<{ path: string; message: string }> }
            | undefined;
          if (details?.issues && details.issues.length > 0) {
            setImportIssues(details.issues);
            toast.error(
              `Validation failed: ${details.issue_count ?? details.issues.length} issue(s) found in dataset.`
            );
          } else {
            toast.error(`Validation failed: ${err.message}`);
          }
        } else if (err.status === 409) {
          toast.error('Conflict (409): Another dataset import or reset is in progress.');
        } else {
          toast.error(err.message);
        }
      } else {
        const msg = err instanceof Error ? err.message : 'Dataset import failed.';
        toast.error(msg);
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Reset Demo Data state and mutation
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetSource, setResetSource] = useState<'bundled' | 'stored'>('bundled');
  const [resetReport, setResetReport] = useState<ResetReport | null>(null);

  const resetMutation = useMutation({
    mutationFn: (source: 'bundled' | 'stored') =>
      apiPost('/api/admin/reset', { from: source }, ResetReportSchema),
    onSuccess: (report) => {
      setResetReport(report);
      setShowResetModal(false);
      toast.success(
        `Reset complete in ${report.ms}ms! Activated timetable: ${report.timetable_version ?? 'ready'}.`
      );
      invalidateAllDatasetQueries();
    },
    onError: (err: unknown) => {
      if (isApiClientError(err)) {
        if (err.status === 409) {
          toast.error('Conflict (409): Another dataset operation or solver generation is running.');
        } else {
          toast.error(`Reset failed: ${err.message}`);
        }
      } else {
        toast.error('Reset failed.');
      }
    },
  });

  // Settings tab queries and state
  const {
    data: settingsData,
    isLoading: settingsLoading,
    isError: settingsError,
    refetch: refetchSettings,
  } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiGet('/api/settings', SettingsSchema),
  });

  const [settingsFieldErrors, setSettingsFieldErrors] = useState<Record<string, string[]>>({});

  const saveSettingsMutation = useMutation({
    mutationFn: (patch: SettingsPatch) => apiPatch('/api/settings', patch, SettingsSchema),
    onSuccess: (updated) => {
      setSettingsFieldErrors({});
      toast.success('System settings saved successfully!');
      queryClient.setQueryData(['settings'], updated);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (err: unknown) => {
      if (isApiClientError(err)) {
        if (err.status === 400) {
          const details = err.details as
            | { fieldErrors?: Record<string, string[]>; formErrors?: string[] }
            | undefined;
          if (details?.fieldErrors) {
            setSettingsFieldErrors(details.fieldErrors);
          }
          toast.error(err.message || 'Validation error while saving settings.');
        } else {
          toast.error(err.message);
        }
      } else {
        toast.error('Failed to save settings.');
      }
    },
  });

  // Handle generation start
  const handleRunGenerator = async () => {
    setIsGenerating(true);
    setGenerationProgress(null);
    setGenerationResult(null);
    setGenerationError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await streamTimetableGeneration(
        {
          activate: true,
          seed,
          time_budget_ms: Math.min(Math.max(timeBudget * 1000, 1000), 30_000),
        },
        (progress) => {
          setGenerationProgress(progress);
        },
        { signal: controller.signal }
      );

      setGenerationResult(result);
      toast.success(`Timetable ${result.version.id} generated and activated successfully!`);

      // Invalidate relevant queries
      invalidateAllDatasetQueries();
      refetchVersions();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        toast.info('Generation cancelled by user.');
      } else if (isApiClientError(err)) {
        const errorState: GenerationErrorState = {
          code: err.code,
          message: err.message,
          status: err.status,
          details: err.details,
        };
        setGenerationError(errorState);

        if (err.status === 409) {
          toast.error(`Generation Conflict (409): ${err.message}`);
        } else if (err.status === 422 || err.code === 'INFEASIBLE') {
          toast.error('Solver Infeasible (422): Could not place all sessions without conflicts.');
        } else if (err.status === 429 || err.code === 'RATE_LIMITED') {
          toast.error(`Rate limited (429): ${err.message}`);
        } else {
          toast.error(err.message);
        }
      } else {
        const msg = err instanceof Error ? err.message : 'Generation failed.';
        setGenerationError({ message: msg });
        toast.error(msg);
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  if (sessionUser.role !== 'admin') {
    return (
      <AppShell pageTitle="Access Restricted">
        <div className="p-8 text-center font-mono">
          <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
          <h2 className="text-lg font-bold text-white">Administrator Access Required</h2>
          <p className="text-xs text-[#98A6BB] mt-1">This console is restricted to the Dean and Admin role.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      pageTitle="Dean & Admin Operational Control"
      breadcrumbs={[{ label: 'Admin Console' }]}
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Navigation Tabs Bar (§5.12) */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#0B1220] border border-white/10 overflow-x-auto">
          {[
            { id: 'generate', label: 'Generate & Solver', icon: Zap },
            { id: 'validate', label: 'Validator Audit', icon: CheckCircle2 },
            { id: 'data', label: 'Data & Datasets', icon: Database },
            { id: 'export', label: 'Export JSON', icon: Download },
            { id: 'settings', label: 'System Settings', icon: SettingsIcon },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'data' | 'generate' | 'validate' | 'export' | 'settings')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all shrink-0 ${
                  isActive
                    ? 'bg-gradient-to-r from-[#66E3F0] to-[#8279FF] text-[#070A12] shadow-md'
                    : 'text-[#98A6BB] hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab 1: Generate & Versions (§5.12) */}
        {activeTab === 'generate' && (
          <div className="space-y-6">
            <div className="p-6 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div>
                  <h2 className="text-lg font-bold text-white">Multi-Objective Constraint Timetable Engine</h2>
                  <p className="text-xs font-mono text-[#98A6BB]">
                    Compute clash-free schedules satisfying H1–H14 hard constraints while minimizing S1–S6 soft penalties.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-[#10b981]/20 text-[#34d399] border border-[#10b981]/30">
                  {isGenerating ? 'Solver Running' : 'Engine Ready'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-[#98A6BB] mb-1">DETERMINISTIC SEED</label>
                  <input
                    type="number"
                    disabled={isGenerating}
                    value={seed}
                    onChange={(e) => setSeed(Number(e.target.value))}
                    className="w-full bg-[#101A2B] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-[#98A6BB] mb-1">SOLVER TIME BUDGET (SECONDS)</label>
                  <input
                    type="number"
                    disabled={isGenerating}
                    value={timeBudget}
                    onChange={(e) => setTimeBudget(Number(e.target.value))}
                    min={1}
                    max={30}
                    className="w-full bg-[#101A2B] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Real-time Solver Progress Stream */}
              {isGenerating && generationProgress && (
                <div className="p-4 rounded-2xl bg-[#070A12] border border-[#66E3F0]/40 space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#66E3F0] font-bold uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#66E3F0] animate-ping" />
                      Phase: {generationProgress.phase} · Iteration {generationProgress.iteration}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-rose-400 font-bold">Hard: {generationProgress.hard}</span>
                      <span className="text-amber-400 font-bold">Soft: {generationProgress.soft} pts</span>
                      <span className="text-[#98A6BB]">Fest: {generationProgress.fest}</span>
                      <span className="text-xs text-white/60 font-mono">({Math.round(generationProgress.ms)} ms)</span>
                    </div>
                  </div>
                  <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#66E3F0] to-[#10b981] transition-all duration-300 rounded-full"
                      style={{
                        width:
                          generationProgress.phase === 'verify'
                            ? '100%'
                            : generationProgress.phase === 'anneal'
                            ? '85%'
                            : generationProgress.phase === 'repair'
                            ? '55%'
                            : '25%',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Final Generated Result Confirmation */}
              {generationResult && (
                <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/40 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-emerald-400">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      Version {generationResult.version.id} Generated & Activated!
                    </span>
                    <span>Algorithm: {generationResult.version.solver_meta?.algorithm ?? 'Solver'}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono text-[#cbd5e1] pt-1">
                    <div>Hard Clashes: <strong className="text-emerald-300">{generationResult.version.hard_violation_count}</strong></div>
                    <div>Soft Penalty: <strong className="text-amber-300">{generationResult.version.soft_penalty.total} pts</strong></div>
                    <div>Sessions: <strong className="text-white">{generationResult.version.assignments.length}</strong></div>
                    <div>Solver Time: <strong className="text-white">{generationResult.version.solver_meta?.ms ?? 0} ms</strong></div>
                  </div>
                  {generationResult.spectra && (
                    <div className="text-[11px] font-mono text-pink-300 pt-1 border-t border-pink-500/20">
                      Spectra Week 7 Decisions re-evaluated: {generationResult.spectra.approved} approved, {generationResult.spectra.alternatives} alternative, {generationResult.spectra.rejected} rejected.
                    </div>
                  )}
                </div>
              )}

              {/* Error Display */}
              {generationError && (
                <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/40 space-y-2 text-xs font-mono text-rose-300">
                  <div className="flex items-center gap-2 font-bold text-rose-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Generation Failed: {generationError.message}</span>
                  </div>
                  {generationError.code && (
                    <div>Error Code: <span className="text-white font-bold">{generationError.code}</span></div>
                  )}
                  {Boolean(generationError.details) && (
                    <div className="p-2.5 rounded-xl bg-black/40 text-[11px] max-h-36 overflow-y-auto font-mono text-white/80">
                      <pre>{JSON.stringify(generationError.details, null, 2)}</pre>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  onClick={handleRunGenerator}
                  disabled={isGenerating}
                  className="px-5 py-2.5 rounded-xl text-xs font-mono font-bold bg-[#66E3F0] text-[#070A12] hover:opacity-90 shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                  <Zap className="w-4 h-4 fill-current" />
                  <span>{isGenerating ? 'Solving Schedule...' : 'Generate Timetable'}</span>
                </button>

                {isGenerating && (
                  <button
                    onClick={handleCancelGeneration}
                    className="px-4 py-2.5 rounded-xl text-xs font-mono font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 flex items-center gap-2"
                  >
                    <StopCircle className="w-4 h-4" />
                    <span>Cancel Run</span>
                  </button>
                )}
              </div>
            </div>

            {/* Version Management List (§5.12) */}
            <div className="p-6 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#66E3F0]" />
                  <h3 className="text-sm font-mono font-bold text-white uppercase">Timetable Version Management</h3>
                </div>
                <button
                  onClick={() => refetchVersions()}
                  disabled={versionsLoading}
                  className="text-xs font-mono text-[#66E3F0] hover:underline flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Refresh</span>
                </button>
              </div>

              {versionsLoading ? (
                <div className="p-8 text-center text-xs font-mono text-[#98A6BB]">
                  Loading timetable versions from backend...
                </div>
              ) : versionsError ? (
                <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 text-xs font-mono text-rose-300">
                  Unable to load timetable versions. Check backend connection.
                </div>
              ) : !versions || versions.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-[#101A2B] border border-dashed border-white/10 space-y-2">
                  <Clock className="w-8 h-8 text-[#98A6BB] mx-auto opacity-50" />
                  <div className="text-xs font-mono font-bold text-white">No Timetable Versions Generated</div>
                  <p className="text-[11px] font-mono text-[#98A6BB]">
                    Click &quot;Generate Timetable&quot; above to solve and publish the baseline schedule into MongoDB.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {versions.map((ver: TimetableVersionSummary) => {
                    const isActive = ver.status === 'active';
                    return (
                      <div
                        key={ver.id}
                        className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isActive
                            ? 'bg-[#101A2B] border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                            : 'bg-[#0E1524] border-white/5 hover:border-white/20'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2 font-mono font-bold text-white text-xs">
                            <span>{ver.id}</span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                                isActive
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                  : ver.status === 'draft'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : 'bg-white/10 text-white/60 border border-white/10'
                              }`}
                            >
                              {ver.status}
                            </span>
                            {ver.solver_meta?.algorithm && (
                              <span className="text-[10px] text-[#98A6BB] font-normal hidden sm:inline">
                                · {ver.solver_meta.algorithm}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-[#98A6BB] mt-1 flex flex-wrap items-center gap-3">
                            <span>{ver.assignment_count} sessions placed</span>
                            <span>·</span>
                            <span className={ver.hard_violation_count === 0 ? 'text-[#34d399]' : 'text-rose-400 font-bold'}>
                              {ver.hard_violation_count} hard clashes
                            </span>
                            <span>·</span>
                            <span className="text-amber-300">{ver.soft_penalty.total} soft penalty</span>
                            {Boolean(ver.created_at) && (
                              <>
                                <span>·</span>
                                <span>{new Date(ver.created_at).toLocaleString()}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isActive ? (
                            <span className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Active Baseline</span>
                            </span>
                          ) : (
                            <button
                              onClick={() => activateMutation.mutate(ver.id)}
                              disabled={activateMutation.isPending}
                              className="px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold bg-[#66E3F0]/15 hover:bg-[#66E3F0]/25 text-[#66E3F0] border border-[#66E3F0]/40 transition-colors disabled:opacity-50"
                            >
                              {activateMutation.isPending ? 'Activating...' : 'Activate Version'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Validator Audit Report (§5.12) */}
        {activeTab === 'validate' && (
          <div className="space-y-6">
            <div className="p-6 rounded-3xl bg-[#0B1220] border border-white/10 space-y-5">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
                <div>
                  <h2 className="text-lg font-bold text-white">Automated Schedule Validator Audit</h2>
                  <p className="text-xs font-mono text-[#98A6BB]">
                    Exact verification matching <code>validator.py</code> specification across the active schedule.
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => refetchValidator()}
                    disabled={validatorLoading || validatorFetching}
                    className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-white/5 hover:bg-white/10 text-[#66E3F0] border border-[#66E3F0]/30 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${validatorFetching ? 'animate-spin' : ''}`} />
                    <span>{validatorFetching ? 'Auditing...' : 'Re-run Audit'}</span>
                  </button>

                  {validatorLoading ? (
                    <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-white/5 text-[#98A6BB] border border-white/10 flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Auditing...</span>
                    </span>
                  ) : validatorError ? (
                    <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                      AUDIT FAILED
                    </span>
                  ) : validatorData ? (
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-mono font-bold border ${
                        validatorData.hard_violation_count === 0
                          ? 'bg-[#10b981]/20 text-[#34d399] border-[#10b981]/40'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      }`}
                    >
                      {validatorData.hard_violation_count === 0
                        ? 'ALL HARD RULES PASSED ✓ (0 VIOLATIONS)'
                        : `${validatorData.hard_violation_count} HARD VIOLATIONS ⚠`}
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-white/5 text-[#98A6BB] border border-white/10">
                      NO AUDIT DATA
                    </span>
                  )}
                </div>
              </div>

              {/* Error State */}
              {validatorError && (
                <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/40 space-y-2">
                  <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Failed to execute schedule validator audit</span>
                  </div>
                  <p className="text-xs text-[#cbd5e1]">
                    {validatorErr instanceof Error ? validatorErr.message : 'Unable to query /api/validate.'}
                  </p>
                  <button
                    onClick={() => refetchValidator()}
                    className="px-3 py-1 rounded-lg text-xs font-mono bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30"
                  >
                    Retry Audit
                  </button>
                </div>
              )}

              {/* Loading State */}
              {validatorLoading && !validatorData && (
                <div className="py-16 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-[#66E3F0] animate-spin mx-auto" />
                  <p className="text-xs font-mono text-[#98A6BB]">
                    Running comprehensive H1–H14, B1–B3, E1–E2, and S1–S6 verification against active timetable...
                  </p>
                </div>
              )}

              {/* Audit Report Content */}
              {validatorData && (
                <div className="space-y-6">
                  {/* Warnings Section */}
                  {validatorData.warnings && validatorData.warnings.length > 0 && (
                    <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/40 space-y-2">
                      <div className="flex items-center gap-2 text-amber-400 font-mono text-xs font-bold uppercase">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>Validator Warnings ({validatorData.warnings.length})</span>
                      </div>
                      <ul className="space-y-1 text-xs text-[#cbd5e1] font-mono pl-5 list-disc">
                        {validatorData.warnings.map((w, idx) => (
                          <li key={idx}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Active Hard Violations List */}
                  {validatorData.hard_violations && validatorData.hard_violations.length > 0 && (
                    <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/40 space-y-3">
                      <div className="flex items-center gap-2 text-rose-400 font-mono text-xs font-bold uppercase">
                        <ShieldAlert className="w-4 h-4 shrink-0" />
                        <span>
                          Hard Violations ({validatorData.hard_violations.length} Clashes)
                        </span>
                      </div>
                      <div className="max-h-60 overflow-y-auto space-y-2 font-mono text-xs">
                        {validatorData.hard_violations.map((v, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-xl bg-black/40 border border-rose-500/20 flex flex-col sm:flex-row sm:items-start justify-between gap-2"
                          >
                            <div className="flex items-start gap-2 min-w-0">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 shrink-0">
                                {v.rule}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/5 text-[#98A6BB] uppercase shrink-0">
                                {v.where}
                              </span>
                              <span className="text-[#cbd5e1] text-xs leading-relaxed break-words">
                                {v.detail}
                              </span>
                            </div>

                            {v.refs && (
                              <div className="text-[10px] text-[#98A6BB] shrink-0 flex flex-wrap gap-1">
                                {v.refs.room_id && <span>Room: {v.refs.room_id}</span>}
                                {v.refs.day && <span>Day: {v.refs.day}</span>}
                                {v.refs.periods && <span>Periods: {v.refs.periods.join(', ')}</span>}
                                {v.refs.request_id && <span>Req: {v.refs.request_id}</span>}
                                {v.refs.exam_id && <span>Exam: {v.refs.exam_id}</span>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Hard Rules Table */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                      Hard Constraints Specification (H1–H14, B1–B3, E1–E2)
                    </h3>
                    <div className="overflow-x-auto rounded-2xl border border-white/5">
                      <table className="w-full text-left text-xs font-mono border-collapse">
                        <thead>
                          <tr className="border-b border-white/10 bg-[#101A2B] text-[10px] text-[#98A6BB] uppercase">
                            <th className="p-2.5">Rule Code</th>
                            <th className="p-2.5">Constraint Specification</th>
                            <th className="p-2.5">Description</th>
                            <th className="p-2.5 text-right">Violations</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 bg-[#0B1220]">
                          {Object.keys(RULE_SPECIFICATIONS).map((ruleCode) => {
                            const violationCount = validatorData.hard_by_rule?.[ruleCode] ?? 0;
                            const spec = RULE_SPECIFICATIONS[ruleCode];
                            return (
                              <tr key={ruleCode} className="hover:bg-white/[0.02]">
                                <td className="p-2.5 font-bold text-[#66E3F0]">{ruleCode}</td>
                                <td className="p-2.5 font-bold text-white">{spec.name}</td>
                                <td className="p-2.5 text-[#cbd5e1]">{spec.description}</td>
                                <td
                                  className={`p-2.5 text-right font-bold ${
                                    violationCount === 0 ? 'text-[#34d399]' : 'text-rose-400'
                                  }`}
                                >
                                  {violationCount === 0 ? '0 violations ✓' : `${violationCount} clashes ⚠`}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Soft Penalty Breakdown S1..S6 */}
                  <div className="pt-4 border-t border-white/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                        Soft Constraint Penalties (Total: {validatorData.soft_total} pts)
                      </h3>
                      <span className="text-[11px] font-mono text-[#fbbf24]">
                        Simulated annealing target objective
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {(['S1', 'S2', 'S3', 'S4', 'S5', 'S6'] as const).map((code) => {
                        const penaltyPts = validatorData.soft_penalties?.[code] ?? 0;
                        const spec = SOFT_RULE_SPECIFICATIONS[code];
                        return (
                          <div key={code} className="p-3.5 rounded-2xl bg-[#101A2B] border border-white/5 flex flex-col justify-between">
                            <div>
                              <div className="flex items-center justify-between text-xs font-mono mb-1">
                                <span className="font-bold text-[#fbbf24]">{code}: {spec.name}</span>
                                <span className="text-white font-bold">{penaltyPts} pts</span>
                              </div>
                              <div className="text-[10px] text-[#98A6BB] leading-relaxed mb-2">
                                {spec.description}
                              </div>
                            </div>
                            <div className="text-[9px] font-mono text-[#64748b]">
                              Weight: {spec.weight}x
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Spectra Week & Exam Soft Penalty Sections */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/10">
                    {/* Spectra Booking Stats */}
                    {validatorData.bookings && (
                      <div className="p-4 rounded-2xl bg-[#101A2B] border border-white/5 space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-white/5">
                          <span className="text-xs font-mono font-bold text-pink-400 uppercase">
                            Spectra Week 7 Booking Performance
                          </span>
                          <span className="text-xs font-mono text-white font-bold">
                            Score: {validatorData.bookings.booking_score} / {validatorData.bookings.booking_score_max_if_all_approved}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                          <div className="p-2 rounded-xl bg-black/30">
                            <div className="text-base font-bold text-emerald-400">
                              {validatorData.bookings.approved}
                            </div>
                            <div className="text-[10px] text-[#98A6BB]">Approved</div>
                          </div>
                          <div className="p-2 rounded-xl bg-black/30">
                            <div className="text-base font-bold text-amber-400">
                              {validatorData.bookings.alternatives}
                            </div>
                            <div className="text-[10px] text-[#98A6BB]">Alternatives</div>
                          </div>
                          <div className="p-2 rounded-xl bg-black/30">
                            <div className="text-base font-bold text-rose-400">
                              {validatorData.bookings.rejected}
                            </div>
                            <div className="text-[10px] text-[#98A6BB]">Rejected</div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-mono text-[#98A6BB] pt-1">
                          <span>Session Overrides: {validatorData.bookings.session_overrides}</span>
                          <span>Priority Inversions: {validatorData.bookings.priority_inversions.length}</span>
                        </div>
                      </div>
                    )}

                    {/* Exam Schedule Soft Penalty */}
                    <div className="p-4 rounded-2xl bg-[#101A2B] border border-white/5 space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-white/5">
                        <span className="text-xs font-mono font-bold text-[#fbbf24] uppercase">
                          Exam Schedule Validation
                        </span>
                        <span className="text-xs font-mono text-white font-bold">
                          Penalty: {validatorData.exam_soft_penalty !== undefined ? `${validatorData.exam_soft_penalty} pts` : 'None'}
                        </span>
                      </div>
                      <p className="text-xs text-[#cbd5e1] leading-relaxed">
                        {validatorData.exam_soft_penalty !== undefined
                          ? `Exam schedule satisfies 1-exam-per-day rule with ${validatorData.exam_soft_penalty} soft penalty points across morning and afternoon sessions.`
                          : 'Exams schedule not included in the current active schedule projection.'}
                      </p>
                      <div className="pt-1 flex justify-end">
                        <Link href="/exams" className="text-xs font-mono text-[#fbbf24] hover:underline">
                          View Exam Schedule ▸
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Data & Datasets (§5.12) */}
        {activeTab === 'data' && (
          <div className="space-y-6">
            {/* Active Dataset Stats */}
            <div className="p-6 rounded-3xl bg-[#0B1220] border border-white/10 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div>
                  <h2 className="text-lg font-bold text-white">Active Academic Dataset</h2>
                  <p className="text-xs font-mono text-[#98A6BB]">
                    Current dataset identifier: <strong className="text-[#66E3F0]">{dashboardData?.dataset_id ?? 'cit_public'}</strong>
                  </p>
                </div>
                {dashboardLoading && (
                  <span className="text-xs font-mono text-[#98A6BB] flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Loading stats...</span>
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-[#101A2B] border border-white/5 text-center">
                  <div className="text-2xl font-black font-mono text-white">
                    {dashboardData?.timetable.sessions_total ?? 189}
                  </div>
                  <div className="text-xs font-mono text-[#98A6BB]">Teaching Sessions</div>
                </div>
                <div className="p-4 rounded-2xl bg-[#101A2B] border border-white/5 text-center">
                  <div className="text-2xl font-black font-mono text-white">
                    {dashboardData?.utilisation.rooms.length ?? 27}
                  </div>
                  <div className="text-xs font-mono text-[#98A6BB]">Campus Rooms</div>
                </div>
                <div className="p-4 rounded-2xl bg-[#101A2B] border border-white/5 text-center">
                  <div className="text-2xl font-black font-mono text-white">
                    {dashboardData?.exams.exams_total ?? 0}
                  </div>
                  <div className="text-xs font-mono text-[#98A6BB]">Scheduled Exams</div>
                </div>
                <div className="p-4 rounded-2xl bg-[#101A2B] border border-white/5 text-center">
                  <div className="text-2xl font-black font-mono text-white">
                    {dashboardData?.bookings.requests_total ?? 0}
                  </div>
                  <div className="text-xs font-mono text-[#98A6BB]">Spectra Requests</div>
                </div>
              </div>
            </div>

            {/* Dataset Import Section */}
            <div className="p-6 rounded-3xl bg-[#0B1220] border border-white/10 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-[#66E3F0]" />
                  <h3 className="text-sm font-mono font-bold text-white uppercase">Upload & Replace Dataset</h3>
                </div>
                <span className="text-[11px] font-mono text-[#98A6BB]">Max 2 MB (JSON)</span>
              </div>

              <p className="text-xs text-[#cbd5e1] leading-relaxed">
                Upload an official academic dataset file (conforming to <code>cit_public.json</code> specification).
                Importing a new dataset validates entity foreign keys, replaces all reference collections, clears stale derived working state, and allows re-solving schedules.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileUpload}
                disabled={isUploading}
                className="hidden"
              />

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="px-5 py-2.5 rounded-xl text-xs font-mono font-bold bg-[#66E3F0] text-[#070A12] hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-50 shadow-md"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Validating & Importing...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Select Dataset File (.json)</span>
                    </>
                  )}
                </button>
              </div>

              {/* Validation Issues Display */}
              {importIssues && importIssues.length > 0 && (
                <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/40 space-y-3">
                  <div className="flex items-center gap-2 text-rose-400 font-mono text-xs font-bold">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Dataset Rejected: {importIssues.length} Validation Issue(s)</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-xl bg-black/40 p-3 space-y-1.5 font-mono text-xs">
                    {importIssues.map((issue, idx) => (
                      <div key={idx} className="flex flex-col sm:flex-row sm:items-start gap-1 text-[11px] border-b border-white/5 pb-1">
                        <span className="text-rose-400 font-bold shrink-0">{issue.path}:</span>
                        <span className="text-[#cbd5e1]">{issue.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Import Report Result */}
              {importReport && (
                <div className="p-5 rounded-2xl bg-emerald-950/20 border border-emerald-500/40 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between text-emerald-400 font-bold">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      Dataset &quot;{importReport.dataset_id}&quot; Loaded Successfully
                    </span>
                    <span className="text-[11px] text-[#98A6BB]">
                      Source: {importReport.source} · {new Date(importReport.loaded_at).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 pt-2 border-t border-white/10 text-[11px]">
                    <div className="p-2 rounded-xl bg-[#101A2B]">Sessions: <strong className="text-white">{importReport.counts.sessions}</strong></div>
                    <div className="p-2 rounded-xl bg-[#101A2B]">Rooms: <strong className="text-white">{importReport.counts.rooms}</strong></div>
                    <div className="p-2 rounded-xl bg-[#101A2B]">Faculty: <strong className="text-white">{importReport.counts.faculty}</strong></div>
                    <div className="p-2 rounded-xl bg-[#101A2B]">Groups: <strong className="text-white">{importReport.counts.student_groups}</strong></div>
                    <div className="p-2 rounded-xl bg-[#101A2B]">Courses: <strong className="text-white">{importReport.counts.courses}</strong></div>
                    <div className="p-2 rounded-xl bg-[#101A2B]">Exams: <strong className="text-white">{importReport.counts.exams}</strong></div>
                    <div className="p-2 rounded-xl bg-[#101A2B]">Bookings: <strong className="text-white">{importReport.counts.booking_requests}</strong></div>
                    <div className="p-2 rounded-xl bg-[#101A2B]">Unavailabilities: <strong className="text-white">{importReport.counts.room_unavailability}</strong></div>
                    <div className="p-2 rounded-xl bg-[#101A2B]">Cancellations: <strong className="text-white">{importReport.counts.cancellations}</strong></div>
                    <div className="p-2 rounded-xl bg-[#101A2B]">Duplicate Drops: <strong className="text-amber-300">{importReport.duplicate_cancellations.length}</strong></div>
                  </div>

                  <div className="text-[11px] text-[#98A6BB] pt-1">
                    Cleared prior working state: {importReport.cleared.timetable_versions} timetable versions, {importReport.cleared.booking_decisions} booking decisions, {importReport.cleared.session_overrides} session overrides, {importReport.cleared.change_requests} change requests.
                  </div>
                </div>
              )}
            </div>

            {/* Danger Zone: Reset Demo Data */}
            <div className="p-6 rounded-3xl bg-rose-950/20 border border-rose-500/30 space-y-4">
              <div className="flex items-center gap-2 text-rose-400 font-mono text-xs font-bold uppercase">
                <AlertTriangle className="w-4 h-4" />
                <span>Danger Zone: Reset Demo Data</span>
              </div>
              <p className="text-xs text-[#cbd5e1] leading-relaxed">
                Resets all local modifications, custom change proposals, and room bookings back to clean baseline state and generates a fresh schedule.
              </p>

              <div>
                <button
                  type="button"
                  onClick={() => setShowResetModal(true)}
                  disabled={resetMutation.isPending}
                  className="px-4 py-2.5 rounded-xl text-xs font-mono font-bold bg-rose-500 text-white shadow-md hover:bg-rose-600 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{resetMutation.isPending ? 'Resetting Pipeline...' : 'Reset Demo Data'}</span>
                </button>
              </div>

              {/* Reset Report Confirmation */}
              {resetReport && (
                <div className="p-4 rounded-2xl bg-[#101A2B] border border-rose-500/30 font-mono text-xs space-y-2">
                  <div className="flex items-center justify-between text-rose-300 font-bold">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Reset Finished in {resetReport.ms} ms
                    </span>
                    <span>Source: {resetReport.dataset.source}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-[#cbd5e1] pt-1">
                    <div>Active Timetable: <strong className="text-emerald-400">{resetReport.timetable_version ?? 'None'}</strong></div>
                    <div>Exam Schedule: <strong className="text-white">{resetReport.exam_schedule_id ?? 'None'}</strong></div>
                    <div>Spectra Decisions: <strong className="text-pink-300">{resetReport.decisions}</strong></div>
                    <div>Users Seeded: <strong className="text-white">{resetReport.users.inserted + resetReport.users.updated}</strong></div>
                  </div>
                  <div className="text-[11px] text-[#98A6BB] pt-1 border-t border-white/5">
                    Cleared: {resetReport.cleared.timetable_versions} timetables, {resetReport.cleared.booking_decisions} decisions, {resetReport.cleared.session_overrides} overrides, {resetReport.cleared.settings} settings.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Export JSON (§5.12) */}
        {activeTab === 'export' && (
          <div className="p-6 rounded-3xl bg-[#0B1220] border border-white/10 space-y-4">
            <h2 className="text-lg font-bold text-white">Download Standardized Outputs</h2>
            <p className="text-xs font-mono text-[#98A6BB]">
              Outputs conform strictly to hackathon data contracts for automated scoring.
            </p>

            <div className="space-y-3">
              <div className="p-4 rounded-2xl bg-[#101A2B] border border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono font-bold text-white">schedule.json</div>
                  <div className="text-[11px] font-mono text-[#98A6BB]">
                    Baseline schedule from active timetable version
                  </div>
                </div>
                <a
                  href="/api/export?file=schedule"
                  download="schedule.json"
                  className="px-4 py-2 rounded-xl text-xs font-mono font-bold bg-[#66E3F0] text-[#070A12] flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
              </div>

              <div className="p-4 rounded-2xl bg-[#101A2B] border border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono font-bold text-white">schedule_after.json</div>
                  <div className="text-[11px] font-mono text-[#98A6BB]">
                    Post-disruption schedule with applied change proposals
                  </div>
                </div>
                <a
                  href="/api/export?file=schedule_after"
                  download="schedule_after.json"
                  className="px-4 py-2 rounded-xl text-xs font-mono font-bold bg-[#8279FF] text-white flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Settings (§5.12) */}
        {activeTab === 'settings' && (
          <div className="p-6 rounded-3xl bg-[#0B1220] border border-white/10 space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h2 className="text-lg font-bold text-white">System & Engine Settings</h2>
                <p className="text-xs font-mono text-[#98A6BB]">
                  Configure global parameters, solver random seed, reference date, and priority ordering.
                </p>
              </div>
              <button
                type="button"
                onClick={() => refetchSettings()}
                disabled={settingsLoading}
                className="text-xs font-mono text-[#66E3F0] hover:underline flex items-center gap-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${settingsLoading ? 'animate-spin' : ''}`} />
                <span>Refresh Settings</span>
              </button>
            </div>

            {settingsLoading ? (
              <div className="p-8 text-center text-xs font-mono text-[#98A6BB]">
                Loading system settings from database...
              </div>
            ) : settingsError ? (
              <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 text-xs font-mono text-rose-300">
                Failed to load system settings. Please try refreshing.
              </div>
            ) : settingsData ? (
              <SettingsForm
                key={`${settingsData.team}-${settingsData.solver_seed}-${settingsData.reference_date}`}
                initialSettings={settingsData}
                onSave={(patch) => saveSettingsMutation.mutate(patch)}
                isSaving={saveSettingsMutation.isPending}
                fieldErrors={settingsFieldErrors}
                onClearFieldError={(field) =>
                  setSettingsFieldErrors((prev) => ({ ...prev, [field]: [] }))
                }
              />
            ) : null}
          </div>
        )}

        {/* Custom Confirmation Dialog for Reset Demo Data */}
        {showResetModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="w-full max-w-lg rounded-3xl bg-[#0D1527] border border-rose-500/30 shadow-2xl p-6 space-y-5 font-mono">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5 text-rose-400 font-bold text-sm">
                  <ShieldAlert className="w-5 h-5 shrink-0" />
                  <span>Confirm Academic Dataset Reset</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  disabled={resetMutation.isPending}
                  className="p-1 rounded-lg hover:bg-white/10 text-[#98A6BB] hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs text-[#cbd5e1] space-y-2 leading-relaxed">
                <p>
                  You are about to reset the operational dataset. This action will wipe all working state:
                </p>
                <ul className="list-disc list-inside space-y-1 text-[#98A6BB] pl-1">
                  <li>Active and draft timetable versions</li>
                  <li>Room booking decisions and session overrides</li>
                  <li>All pending and decided change proposals</li>
                  <li>Custom app settings (reverted to defaults)</li>
                </ul>
                <p className="pt-1">
                  Demo user accounts will be re-seeded idempotently and the automatic solver pipeline will generate a fresh clash-free baseline schedule.
                </p>
              </div>

              {/* Source Selection */}
              <div className="space-y-2 pt-1 border-t border-white/10">
                <div className="text-xs font-bold text-white uppercase">Reset Target Dataset:</div>
                <div className="space-y-2">
                  <label
                    className={`p-3 rounded-2xl border flex items-center gap-3 cursor-pointer transition-colors ${
                      resetSource === 'bundled'
                        ? 'bg-[#101A2B] border-[#66E3F0]/60'
                        : 'bg-[#0E1626] border-white/5 hover:border-white/20'
                    }`}
                  >
                    <input
                      type="radio"
                      name="resetSource"
                      value="bundled"
                      checked={resetSource === 'bundled'}
                      onChange={() => setResetSource('bundled')}
                      className="accent-[#66E3F0]"
                    />
                    <div>
                      <div className="text-xs font-bold text-white">Clean Baseline Dataset (cit_public.json)</div>
                      <div className="text-[11px] text-[#98A6BB]">
                        Restores initial benchmark dataset with 189 sessions and 27 rooms.
                      </div>
                    </div>
                  </label>

                  <label
                    className={`p-3 rounded-2xl border flex items-center gap-3 cursor-pointer transition-colors ${
                      resetSource === 'stored'
                        ? 'bg-[#101A2B] border-[#66E3F0]/60'
                        : 'bg-[#0E1626] border-white/5 hover:border-white/20'
                    }`}
                  >
                    <input
                      type="radio"
                      name="resetSource"
                      value="stored"
                      checked={resetSource === 'stored'}
                      onChange={() => setResetSource('stored')}
                      className="accent-[#66E3F0]"
                    />
                    <div>
                      <div className="text-xs font-bold text-white">Last Uploaded Dataset (stored)</div>
                      <div className="text-[11px] text-[#98A6BB]">
                        Re-runs baseline pipeline from the most recently imported dataset file.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  disabled={resetMutation.isPending}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[#98A6BB] hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => resetMutation.mutate(resetSource)}
                  disabled={resetMutation.isPending}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white shadow-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {resetMutation.isPending ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Executing Reset & Solving...</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Confirm & Execute Reset</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
