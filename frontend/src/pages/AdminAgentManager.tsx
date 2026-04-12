/**
 * Admin Agent Manager
 *
 * Fleet-wide control plane for AI agents.
 *
 * - `admin` role: full access (all filters, bulk actions, force-cancel,
 *   mark-failed, pause, delete, force re-run, sweep).
 * - `internal` role: READ-ONLY slice (PRD §4 Phase 4). Can see everything
 *   but cannot mutate; the frontend hides the bulk toolbars, Run-sweep
 *   button, and ReasonModal entry points, and the backend enforces the
 *   same restriction via per-route `requireAdmin` guards on the mutating
 *   endpoints. Any non-admin/non-internal user hitting the route sees a
 *   403 fallback.
 *
 * Spec: docs/admin-agent-manager-prd.md §4 (roles), §5 Track B (design).
 *
 * Three tabs: Agents, Runs, Cost. Polls every 5s. Per Q4 polling is the
 * cadence for v1; SSE comes later when stable.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from '../lib/axios';
import { useAuth } from '../context/AuthContext';

const POLL_INTERVAL_MS = 5000;
type Tab = 'agents' | 'runs' | 'cost';
type CostWindow = 'today' | '7d' | '30d';

interface SummaryData {
  totalAgents: number;
  activeAgents: number;
  totalRuns: number;
  liveRuns: number;
  staleRuns: number;
  today: { runs: number; costUsd: number; tokensIn: number; tokensOut: number };
  thresholds: { staleDisplayMinutes: number; watchdogStaleMinutes: number };
}

interface AgentRow {
  id: string;
  name: string;
  description: string;
  status: string;
  taskType: string;
  calibrationState: string;
  consecutiveLikes: number;
  totalSourced: number;
  totalApproved: number;
  totalRejected: number;
  totalContacted: number;
  lastRunAt: string | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string };
  job: { id: string; title: string } | null;
  _count: { candidates: number; runs: number };
  liveRun: {
    id: string;
    status: string;
    startedAt: string | null;
    lastHeartbeatAt: string | null;
  } | null;
  hasStuckRun: boolean;
}

interface RunRow {
  id: string;
  agentId: string;
  status: string;
  triggeredBy: string;
  startedAt: string | null;
  completedAt: string | null;
  lastHeartbeatAt: string | null;
  error: string | null;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  llmCallCount: number;
  durationMs: number;
  swept: boolean;
  sweepReason: string | null;
  createdAt: string;
  stale: boolean;
  agent: {
    id: string;
    name: string;
    taskType: string;
    user: { id: string; name: string | null; email: string };
  };
  _count: { candidates: number; activities: number };
}

interface CostRollup {
  window: CostWindow;
  since: string;
  totals: { runs: number; costUsd: number; tokensIn: number; tokensOut: number; llmCallCount: number };
  byUser: Array<{ userId: string; name: string | null; email: string; runs: number; costUsd: number; tokens: number }>;
  byAgent: Array<{ agentId: string; name: string; ownerEmail: string; runs: number; costUsd: number; tokens: number }>;
  byDay: Array<{ date: string; runs: number; costUsd: number; tokens: number }>;
}

const API = '/api/v1/agent-manager';

export default function AdminAgentManager() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('agents');
  const [summary, setSummary] = useState<SummaryData | null>(null);

  // Role-based feature gating. Admins can mutate; internal users get a
  // read-only slice per PRD §4 Phase 4. Anyone else sees a 403 below.
  const role = user?.role;
  const canMutate = role === 'admin';
  const canRead = role === 'admin' || role === 'internal';

  const fetchSummary = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/summary`);
      setSummary(res.data.data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchSummary();
    const iv = setInterval(fetchSummary, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [fetchSummary]);

  if (!canRead) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">{t('admin.agentManager.forbidden.title', 'Admin only')}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {t('admin.agentManager.forbidden.body', 'You need an administrator or internal account to access the Agent Manager.')}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-2">
      {/* Header */}
      <div>
        <nav className="flex items-center gap-1.5 text-sm text-slate-500">
          <Link to="/product/admin" className="hover:text-slate-700">
            {t('admin.title', 'Admin')}
          </Link>
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-medium text-slate-900">{t('admin.agentManager.title', 'Agent Manager')}</span>
        </nav>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          {t('admin.agentManager.heading', 'Agent Manager')}
        </h1>
        <p className="text-sm text-slate-500">
          {t('admin.agentManager.subheading', 'Fleet-wide control plane for AI agents.')}
        </p>
      </div>

      {/* Read-only banner for internal role */}
      {!canMutate && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <svg className="mt-0.5 h-5 w-5 flex-none text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <div className="text-sm">
            <p className="font-medium text-blue-900">{t('admin.agentManager.readOnly.title', 'Read-only view')}</p>
            <p className="text-blue-700">
              {t('admin.agentManager.readOnly.body', 'Internal users can see the full fleet but cannot run bulk actions, cancel runs, or sweep. Ask an admin if you need to intervene.')}
            </p>
          </div>
        </div>
      )}

      {/* Health summary */}
      <SummaryCard summary={summary} onSweep={fetchSummary} canMutate={canMutate} />

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-slate-200">
        {(['agents', 'runs', 'cost'] as Tab[]).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`relative pb-2.5 text-sm font-medium transition-colors ${
              tab === key ? 'text-violet-600' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {t(`admin.agentManager.tabs.${key}`, key)}
            {tab === key && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-violet-600" />}
          </button>
        ))}
      </div>

      {tab === 'agents' && <AgentsTab onMutate={fetchSummary} canMutate={canMutate} />}
      {tab === 'runs' && <RunsTab onMutate={fetchSummary} canMutate={canMutate} />}
      {tab === 'cost' && <CostTab />}
    </div>
  );
}

// ── Summary card ────────────────────────────────────────────────────────────

function SummaryCard({ summary, onSweep, canMutate }: { summary: SummaryData | null; onSweep: () => void; canMutate: boolean }) {
  const { t } = useTranslation();
  const [sweeping, setSweeping] = useState(false);
  const [sweepResult, setSweepResult] = useState<string | null>(null);

  const runSweep = async () => {
    if (sweeping) return;
    setSweeping(true);
    setSweepResult(null);
    try {
      const res = await axios.post(`${API}/runs/sweep`);
      setSweepResult(t('admin.agentManager.summary.sweptN', 'Reaped {{n}} stale run(s)', { n: res.data.data.swept }));
      onSweep();
    } catch {
      setSweepResult(t('admin.agentManager.summary.sweepFailed', 'Sweep failed'));
    } finally {
      setSweeping(false);
      setTimeout(() => setSweepResult(null), 6000);
    }
  };

  if (!summary) {
    return <div className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white" />;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
          <Stat label={t('admin.agentManager.summary.totalAgents', 'Agents')} value={summary.totalAgents} />
          <Stat label={t('admin.agentManager.summary.liveRuns', 'Live runs')} value={summary.liveRuns} />
          <Stat
            label={t('admin.agentManager.summary.staleRuns', 'Stale runs')}
            value={summary.staleRuns}
            tone={summary.staleRuns > 0 ? 'red' : 'slate'}
          />
          <Stat
            label={t('admin.agentManager.summary.todayRuns', 'Today · runs')}
            value={summary.today.runs}
          />
          <Stat
            label={t('admin.agentManager.summary.todayCost', 'Today · spend')}
            value={`$${summary.today.costUsd.toFixed(2)}`}
          />
          <Stat
            label={t('admin.agentManager.summary.todayTokens', 'Today · tokens')}
            value={`${formatNumber(summary.today.tokensIn + summary.today.tokensOut)}`}
          />
          <Stat
            label={t('admin.agentManager.summary.activeAgents', 'Active agents')}
            value={summary.activeAgents}
          />
          <Stat label={t('admin.agentManager.summary.totalRuns', 'Total runs')} value={summary.totalRuns} />
        </div>
        {canMutate && (
          <div className="flex shrink-0 flex-col items-end gap-2">
            <button
              onClick={runSweep}
              disabled={sweeping}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {sweeping ? t('admin.agentManager.summary.sweeping', 'Sweeping…') : t('admin.agentManager.summary.runSweep', 'Run sweep')}
            </button>
            {sweepResult && <span className="text-xs text-slate-500">{sweepResult}</span>}
            <p className="max-w-xs text-right text-[11px] text-slate-400">
              {t('admin.agentManager.summary.sweepHint', 'Reap any run with no heartbeat for {{n}} min.', {
                n: summary.thresholds.watchdogStaleMinutes,
              })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'slate' }: { label: string; value: number | string; tone?: 'slate' | 'red' }) {
  return (
    <div>
      <div className={`text-2xl font-bold ${tone === 'red' ? 'text-red-600' : 'text-slate-900'}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

// ── Agents tab ──────────────────────────────────────────────────────────────

function AgentsTab({ onMutate, canMutate }: { onMutate: () => void; canMutate: boolean }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<{
    status: string;
    calibrationState: string;
    hasStuckRun: boolean;
    q: string;
  }>({ status: '', calibrationState: '', hasStuckRun: false, q: '' });
  const [bulkBusy, setBulkBusy] = useState(false);
  const [reasonModal, setReasonModal] = useState<{ action: string; ids: string[] } | null>(null);

  const load = useCallback(async () => {
    try {
      const params: Record<string, string> = { limit: '100' };
      if (filters.status) params.status = filters.status;
      if (filters.calibrationState) params.calibrationState = filters.calibrationState;
      if (filters.hasStuckRun) params.hasStuckRun = 'true';
      if (filters.q) params.q = filters.q;
      const res = await axios.get(`${API}/agents`, { params });
      setRows(res.data.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
    const iv = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [load]);

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const runBulk = async (action: string, reason?: string) => {
    if (selected.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const res = await axios.post(`${API}/bulk`, {
        action,
        ids: Array.from(selected),
        ...(reason ? { reason } : {}),
      });
      const { ok, failed } = res.data.data;
      setSelected(new Set());
      setReasonModal(null);
      if (failed > 0) {
        // eslint-disable-next-line no-alert
        alert(t('admin.agentManager.bulk.partial', '{{ok}} succeeded, {{failed}} failed', { ok, failed }));
      }
      load();
      onMutate();
    } catch {
      // eslint-disable-next-line no-alert
      alert(t('admin.agentManager.bulk.failed', 'Bulk action failed'));
    } finally {
      setBulkBusy(false);
    }
  };

  const requestBulk = (action: string) => {
    if (selected.size === 0) return;
    if (action === 'mark-failed') {
      setReasonModal({ action, ids: Array.from(selected) });
      return;
    }
    if (action === 'delete') {
      // eslint-disable-next-line no-alert
      if (!confirm(t('admin.agentManager.bulk.confirmDelete', 'Permanently delete {{n}} agent(s)? This cannot be undone.', { n: selected.size }))) {
        return;
      }
    }
    runBulk(action);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <FilterInput
          label={t('admin.agentManager.filters.search', 'Search')}
          value={filters.q}
          onChange={(v) => setFilters({ ...filters, q: v })}
          placeholder={t('admin.agentManager.filters.searchPh', 'name or description…')}
        />
        <FilterSelect
          label={t('admin.agentManager.filters.status', 'Status')}
          value={filters.status}
          onChange={(v) => setFilters({ ...filters, status: v })}
          options={[
            { value: '', label: t('admin.agentManager.filters.any', 'Any') },
            { value: 'active', label: 'active' },
            { value: 'paused', label: 'paused' },
            { value: 'completed', label: 'completed' },
          ]}
        />
        <FilterSelect
          label={t('admin.agentManager.filters.calibration', 'Calibration')}
          value={filters.calibrationState}
          onChange={(v) => setFilters({ ...filters, calibrationState: v })}
          options={[
            { value: '', label: t('admin.agentManager.filters.any', 'Any') },
            { value: 'pending', label: 'pending' },
            { value: 'calibrating', label: 'calibrating' },
            { value: 'calibrated', label: 'calibrated' },
          ]}
        />
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={filters.hasStuckRun}
            onChange={(e) => setFilters({ ...filters, hasStuckRun: e.target.checked })}
            className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
          />
          {t('admin.agentManager.filters.stuckOnly', 'Stuck runs only')}
        </label>
        <div className="ml-auto text-xs text-slate-400">
          {t('admin.agentManager.filters.totalRows', '{{n}} agent(s)', { n: rows.length })}
        </div>
      </div>

      {/* Bulk action toolbar — admin only */}
      {canMutate && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
          <span className="text-sm font-medium text-violet-800">
            {t('admin.agentManager.bulk.selected', '{{n}} selected', { n: selected.size })}
          </span>
          <div className="flex flex-wrap gap-2">
            <BulkBtn label={t('admin.agentManager.actions.forceRun', 'Force re-run')} onClick={() => requestBulk('force-run')} disabled={bulkBusy} />
            <BulkBtn label={t('admin.agentManager.actions.pause', 'Pause')} onClick={() => requestBulk('pause')} disabled={bulkBusy} />
            <BulkBtn label={t('admin.agentManager.actions.unpause', 'Unpause')} onClick={() => requestBulk('unpause')} disabled={bulkBusy} />
            <BulkBtn label={t('admin.agentManager.actions.delete', 'Delete')} onClick={() => requestBulk('delete')} disabled={bulkBusy} tone="red" />
          </div>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-violet-700 hover:underline">
            {t('admin.agentManager.bulk.clear', 'Clear')}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {canMutate && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={toggleAll}
                    className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                  />
                </th>
              )}
              <Th>{t('admin.agentManager.cols.name', 'Name')}</Th>
              <Th>{t('admin.agentManager.cols.owner', 'Owner')}</Th>
              <Th>{t('admin.agentManager.cols.status', 'Status')}</Th>
              <Th>{t('admin.agentManager.cols.calibration', 'Calibration')}</Th>
              <Th>{t('admin.agentManager.cols.live', 'Live run')}</Th>
              <Th>{t('admin.agentManager.cols.stats', 'Pool')}</Th>
              <Th>{t('admin.agentManager.cols.lastRun', 'Last run')}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={canMutate ? 8 : 7} className="py-12 text-center text-sm text-slate-400">
                  {t('common.loading', 'Loading…')}
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={canMutate ? 8 : 7} className="py-12 text-center text-sm text-slate-400">
                  {t('admin.agentManager.table.empty', 'No agents match the current filters.')}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className={`hover:bg-slate-50 ${selected.has(r.id) ? 'bg-violet-50/30' : ''}`}>
                {canMutate && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                      className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                  </td>
                )}
                <td className="px-4 py-3">
                  <Link to={`/product/agents/${r.id}`} className="font-medium text-slate-900 hover:text-violet-700">
                    {r.name}
                  </Link>
                  {r.job && <div className="text-xs text-slate-400">{r.job.title}</div>}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  <div>{r.user.name || r.user.email}</div>
                  <div className="text-slate-400">{r.user.email}</div>
                </td>
                <td className="px-4 py-3">
                  <StatusPill value={r.status} />
                </td>
                <td className="px-4 py-3">
                  <CalibrationPill state={r.calibrationState} likes={r.consecutiveLikes} />
                </td>
                <td className="px-4 py-3">
                  {r.liveRun ? (
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        {r.liveRun.status}
                      </span>
                      {r.hasStuckRun && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                          STALE
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  <span className="font-medium text-slate-900">{r._count.candidates}</span> /{' '}
                  <span>{r._count.runs}</span> runs
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{r.lastRunAt ? formatRelative(r.lastRunAt) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reasonModal && (
        <ReasonModal
          title={t('admin.agentManager.reason.markFailedTitle', 'Why are you marking these as failed?')}
          onCancel={() => setReasonModal(null)}
          onSubmit={(reason) => runBulk(reasonModal.action, reason)}
        />
      )}
    </div>
  );
}

// ── Runs tab ────────────────────────────────────────────────────────────────

function RunsTab({ onMutate, canMutate }: { onMutate: () => void; canMutate: boolean }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<{
    status: string;
    stale: boolean;
    durationOverSec: string;
    costOverUsd: string;
  }>({ status: '', stale: false, durationOverSec: '', costOverUsd: '' });
  const [bulkBusy, setBulkBusy] = useState(false);
  const [reasonModal, setReasonModal] = useState<{ action: string; ids: string[] } | null>(null);

  const load = useCallback(async () => {
    try {
      const params: Record<string, string> = { limit: '100' };
      if (filters.status) params.status = filters.status;
      if (filters.stale) params.stale = 'true';
      if (filters.durationOverSec) params.durationOverSec = filters.durationOverSec;
      if (filters.costOverUsd) params.costOverUsd = filters.costOverUsd;
      const res = await axios.get(`${API}/runs`, { params });
      setRows(res.data.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
    const iv = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [load]);

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const runBulk = async (action: string, reason?: string) => {
    if (selected.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const res = await axios.post(`${API}/bulk`, {
        action,
        ids: Array.from(selected),
        ...(reason ? { reason } : {}),
      });
      const { ok, failed } = res.data.data;
      setSelected(new Set());
      setReasonModal(null);
      if (failed > 0) {
        // eslint-disable-next-line no-alert
        alert(t('admin.agentManager.bulk.partial', '{{ok}} succeeded, {{failed}} failed', { ok, failed }));
      }
      load();
      onMutate();
    } catch {
      // eslint-disable-next-line no-alert
      alert(t('admin.agentManager.bulk.failed', 'Bulk action failed'));
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <FilterSelect
          label={t('admin.agentManager.filters.status', 'Status')}
          value={filters.status}
          onChange={(v) => setFilters({ ...filters, status: v })}
          options={[
            { value: '', label: t('admin.agentManager.filters.any', 'Any') },
            { value: 'queued', label: 'queued' },
            { value: 'running', label: 'running' },
            { value: 'completed', label: 'completed' },
            { value: 'failed', label: 'failed' },
            { value: 'cancelled', label: 'cancelled' },
          ]}
        />
        <FilterInput
          label={t('admin.agentManager.filters.durationGt', 'Duration > (sec)')}
          value={filters.durationOverSec}
          onChange={(v) => setFilters({ ...filters, durationOverSec: v })}
          placeholder="60"
        />
        <FilterInput
          label={t('admin.agentManager.filters.costGt', 'Cost > ($)')}
          value={filters.costOverUsd}
          onChange={(v) => setFilters({ ...filters, costOverUsd: v })}
          placeholder="0.50"
        />
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={filters.stale}
            onChange={(e) => setFilters({ ...filters, stale: e.target.checked })}
            className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
          />
          {t('admin.agentManager.filters.staleOnly', 'Stale only')}
        </label>
        <div className="ml-auto text-xs text-slate-400">
          {t('admin.agentManager.filters.totalRunRows', '{{n}} run(s)', { n: rows.length })}
        </div>
      </div>

      {canMutate && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
          <span className="text-sm font-medium text-violet-800">
            {t('admin.agentManager.bulk.selected', '{{n}} selected', { n: selected.size })}
          </span>
          <div className="flex flex-wrap gap-2">
            <BulkBtn
              label={t('admin.agentManager.actions.cancel', 'Cancel')}
              onClick={() => runBulk('cancel')}
              disabled={bulkBusy}
            />
            <BulkBtn
              label={t('admin.agentManager.actions.markFailed', 'Mark failed…')}
              onClick={() => setReasonModal({ action: 'mark-failed', ids: Array.from(selected) })}
              disabled={bulkBusy}
              tone="red"
            />
          </div>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-violet-700 hover:underline">
            {t('admin.agentManager.bulk.clear', 'Clear')}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {canMutate && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={toggleAll}
                    className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                  />
                </th>
              )}
              <Th>{t('admin.agentManager.cols.agent', 'Agent')}</Th>
              <Th>{t('admin.agentManager.cols.runStatus', 'Status')}</Th>
              <Th>{t('admin.agentManager.cols.duration', 'Duration')}</Th>
              <Th>{t('admin.agentManager.cols.cost', 'Cost')}</Th>
              <Th>{t('admin.agentManager.cols.tokens', 'Tokens')}</Th>
              <Th>{t('admin.agentManager.cols.candidates', 'Cands')}</Th>
              <Th>{t('admin.agentManager.cols.heartbeat', 'Last beat')}</Th>
              <Th>{t('admin.agentManager.cols.created', 'Created')}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={canMutate ? 9 : 8} className="py-12 text-center text-sm text-slate-400">
                  {t('common.loading', 'Loading…')}
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={canMutate ? 9 : 8} className="py-12 text-center text-sm text-slate-400">
                  {t('admin.agentManager.table.emptyRuns', 'No runs match the current filters.')}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className={`hover:bg-slate-50 ${selected.has(r.id) ? 'bg-violet-50/30' : ''}`}>
                {canMutate && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                      className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                  </td>
                )}
                <td className="px-4 py-3">
                  <Link to={`/product/agents/${r.agent.id}`} className="font-medium text-slate-900 hover:text-violet-700">
                    {r.agent.name}
                  </Link>
                  <div className="text-xs text-slate-400">{r.agent.user.email}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <RunStatusPill status={r.status} />
                    {r.stale && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                        STALE
                      </span>
                    )}
                    {r.swept && (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                        {r.sweepReason?.toUpperCase()}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {r.durationMs > 0 ? `${(r.durationMs / 1000).toFixed(1)}s` : '—'}
                </td>
                <td className="px-4 py-3 text-xs font-medium text-slate-900">
                  ${(r.costUsd ?? 0).toFixed(4)}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {formatNumber((r.tokensIn ?? 0) + (r.tokensOut ?? 0))}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">{r._count.candidates}</td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {r.lastHeartbeatAt ? formatRelative(r.lastHeartbeatAt) : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{formatRelative(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reasonModal && (
        <ReasonModal
          title={t('admin.agentManager.reason.markFailedTitle', 'Why are you marking these as failed?')}
          onCancel={() => setReasonModal(null)}
          onSubmit={(reason) => runBulk(reasonModal.action, reason)}
        />
      )}
    </div>
  );
}

// ── Cost tab ────────────────────────────────────────────────────────────────

function CostTab() {
  const { t } = useTranslation();
  const [data, setData] = useState<CostRollup | null>(null);
  const [loading, setLoading] = useState(true);
  const [window, setWindow] = useState<CostWindow>('7d');

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/cost-rollup`, { params: { window } });
      setData(res.data.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [window]);

  useEffect(() => {
    load();
    const iv = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [load]);

  const maxByDay = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, ...data.byDay.map((d) => d.costUsd));
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(['today', '7d', '30d'] as CostWindow[]).map((w) => (
          <button
            key={w}
            onClick={() => setWindow(w)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              window === w
                ? 'border-violet-500 bg-violet-50 text-violet-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t(`admin.agentManager.cost.window.${w}`, w)}
          </button>
        ))}
      </div>

      {loading || !data ? (
        <div className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      ) : (
        <>
          {/* Totals */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label={t('admin.agentManager.cost.totalRuns', 'Runs')} value={data.totals.runs} />
            <Stat label={t('admin.agentManager.cost.totalCost', 'Spend')} value={`$${data.totals.costUsd.toFixed(2)}`} />
            <Stat
              label={t('admin.agentManager.cost.totalTokens', 'Tokens')}
              value={formatNumber(data.totals.tokensIn + data.totals.tokensOut)}
            />
            <Stat label={t('admin.agentManager.cost.llmCalls', 'LLM calls')} value={data.totals.llmCallCount} />
          </div>

          {/* By day chart (CSS bars — Recharts not added to keep diff small) */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">
              {t('admin.agentManager.cost.byDay', 'Spend by day')}
            </h3>
            <div className="flex items-end gap-2" style={{ height: 140 }}>
              {data.byDay.length === 0 ? (
                <div className="w-full text-center text-xs text-slate-400">
                  {t('admin.agentManager.cost.noData', 'No data in window.')}
                </div>
              ) : (
                data.byDay.map((d) => (
                  <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date} · $${d.costUsd.toFixed(4)}`}>
                    <div
                      className="w-full rounded-t bg-violet-500/80 transition-all hover:bg-violet-600"
                      style={{ height: `${(d.costUsd / maxByDay) * 100}%`, minHeight: 2 }}
                    />
                    <div className="text-[10px] text-slate-400">{d.date.slice(5)}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* By user / By agent — two side-by-side tables */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RollupTable
              title={t('admin.agentManager.cost.byUser', 'By owner')}
              rows={data.byUser.map((u) => ({
                key: u.userId,
                label: u.name || u.email,
                sub: u.email,
                runs: u.runs,
                cost: u.costUsd,
                tokens: u.tokens,
              }))}
            />
            <RollupTable
              title={t('admin.agentManager.cost.byAgentTitle', 'By agent')}
              rows={data.byAgent.map((a) => ({
                key: a.agentId,
                label: a.name,
                sub: a.ownerEmail,
                runs: a.runs,
                cost: a.costUsd,
                tokens: a.tokens,
                href: `/product/agents/${a.agentId}`,
              }))}
            />
          </div>
        </>
      )}
    </div>
  );
}

function RollupTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ key: string; label: string; sub: string; runs: number; cost: number; tokens: number; href?: string }>;
}) {
  const { t } = useTranslation();
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <h3 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">{title}</h3>
      {rows.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400">
          {t('admin.agentManager.cost.noData', 'No data in window.')}
        </div>
      ) : (
        <table className="min-w-full divide-y divide-slate-100 text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">{t('admin.agentManager.cost.col.name', 'Name')}</th>
              <th className="px-3 py-2 text-right">{t('admin.agentManager.cost.col.runs', 'Runs')}</th>
              <th className="px-3 py-2 text-right">{t('admin.agentManager.cost.col.cost', 'Cost')}</th>
              <th className="px-3 py-2 text-right">{t('admin.agentManager.cost.col.tokens', 'Tokens')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.slice(0, 20).map((r) => (
              <tr key={r.key}>
                <td className="px-3 py-2">
                  {r.href ? (
                    <Link to={r.href} className="font-medium text-slate-900 hover:text-violet-700">
                      {r.label}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-900">{r.label}</span>
                  )}
                  <div className="text-[10px] text-slate-400">{r.sub}</div>
                </td>
                <td className="px-3 py-2 text-right text-slate-600">{r.runs}</td>
                <td className="px-3 py-2 text-right font-medium text-slate-900">${r.cost.toFixed(4)}</td>
                <td className="px-3 py-2 text-right text-slate-600">{formatNumber(r.tokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Shared atoms ────────────────────────────────────────────────────────────

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}

function FilterInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-44 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-36 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function BulkBtn({
  label,
  onClick,
  disabled,
  tone,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'red';
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
        tone === 'red'
          ? 'border border-red-200 bg-white text-red-700 hover:bg-red-50'
          : 'border border-violet-200 bg-white text-violet-700 hover:bg-violet-100'
      }`}
    >
      {label}
    </button>
  );
}

function StatusPill({ value }: { value: string }) {
  const palette: Record<string, string> = {
    active: 'bg-green-50 text-green-700 border-green-200',
    paused: 'bg-amber-50 text-amber-700 border-amber-200',
    completed: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${palette[value] ?? palette.completed}`}>
      {value}
    </span>
  );
}

function CalibrationPill({ state, likes }: { state: string; likes: number }) {
  const palette: Record<string, string> = {
    pending: 'bg-slate-50 text-slate-600 border-slate-200',
    calibrating: 'bg-amber-50 text-amber-700 border-amber-200',
    calibrated: 'bg-green-50 text-green-700 border-green-200',
  };
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${palette[state] ?? palette.pending}`}>
      {state === 'calibrating' ? `${state} ${likes}/3` : state}
    </span>
  );
}

function RunStatusPill({ status }: { status: string }) {
  const palette: Record<string, string> = {
    queued: 'bg-amber-50 text-amber-700',
    running: 'bg-amber-50 text-amber-700',
    completed: 'bg-green-50 text-green-700',
    failed: 'bg-red-50 text-red-600',
    cancelled: 'bg-slate-100 text-slate-600',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${palette[status] ?? palette.cancelled}`}>{status}</span>;
}

function ReasonModal({
  title,
  onCancel,
  onSubmit,
}: {
  title: string;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="border-b border-slate-200 px-6 py-5">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        </div>
        <div className="px-6 py-5">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder={t('admin.agentManager.reason.placeholder', 'e.g. Process restarted; executor process is dead.')}
            className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button onClick={onCancel} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            onClick={() => onSubmit(reason.trim())}
            disabled={reason.trim().length < 5}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {t('admin.agentManager.actions.markFailed', 'Mark failed')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
