import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from '../lib/axios';

/**
 * Admin Memory Manager — Phase 7 break-glass access UI.
 *
 * Three-pane layout:
 *   Left:  user directory with search + memory counts
 *   Right: tabbed view of the selected user (Profile / Memories / Interactions / Audit)
 *   Modal: memory detail + edit / delete / pin with reason field
 *
 * Every action on this page is audited server-side via AdminMemoryService.
 * The reason field is surfaced prominently so admins can capture their
 * justification before hitting destructive buttons.
 *
 * See `docs/context-engineering-v7.md` §8.2 for the governance policy this
 * screen implements.
 */

// ── Types ───────────────────────────────────────────────────────────────────

interface UserRow {
  userId: string;
  name: string | null;
  email: string;
  memoryCount: number;
  interactionCount: number;
  profileVersion: number | null;
  lastActivityAt: string | null;
}

interface MemoryRow {
  id: string;
  kind: string;
  scope: string;
  scopeId: string;
  content: string;
  weight: number;
  baselineWeight: number;
  reinforceCount: number;
  lastSeenAt: string;
  expiresAt: string | null;
  jobContext: unknown;
  sourceEventId: string | null;
  sourceAgentId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface InteractionRow {
  id: string;
  eventType: string;
  candidateId: string;
  agentId: string | null;
  runId: string | null;
  durationMs: number | null;
  metadata: unknown;
  createdAt: string;
}

interface AuditRow {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  changes: unknown;
  createdAt: string;
  admin: { id: string; name: string | null; email: string };
}

interface ProfileData {
  user: { id: string; name: string | null; email: string; createdAt: string; role: string | null } | null;
  profile: {
    id: string;
    userId: string;
    topSkills: unknown;
    topAntiSkills: unknown;
    topLocations: unknown;
    topIndustries: unknown;
    topCompanySizes: unknown;
    recurringHardReqs: unknown;
    signalsLearned: number;
    agentCount: number;
    lastRebuiltAt: string;
  } | null;
}

type PaneTab = 'profile' | 'memories' | 'interactions' | 'audit';

// ── Main component ──────────────────────────────────────────────────────────

export default function AdminMemoryTab() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userTotal, setUserTotal] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PaneTab>('profile');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [editMemory, setEditMemory] = useState<MemoryRow | null>(null);

  // Load user directory
  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await axios.get('/api/v1/admin/memory/users', {
        params: { search: userSearch, limit: 50 },
      });
      setUsers((res.data.data as UserRow[]) ?? []);
      setUserTotal(res.data.pagination?.total ?? 0);
    } catch (err) {
      console.error('Failed to load memory users:', err);
    } finally {
      setLoadingUsers(false);
    }
  }, [userSearch]);

  useEffect(() => {
    const timer = setTimeout(loadUsers, 200); // debounce search
    return () => clearTimeout(timer);
  }, [loadUsers]);

  const selectedUser = useMemo(
    () => users.find((u) => u.userId === selectedUserId) ?? null,
    [users, selectedUserId],
  );

  return (
    <div className="flex h-[calc(100vh-220px)] gap-4">
      {/* Left: user directory */}
      <aside className="flex w-80 flex-none flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            {t('admin.memory.users', 'Users with memory data')}
          </h3>
          <input
            type="text"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder={t('admin.memory.searchPlaceholder', 'Search by email or name…')}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
          />
          <p className="mt-2 text-[10px] text-slate-500">
            {t('admin.memory.showingN', '{{shown}} of {{total}} users', { shown: users.length, total: userTotal })}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingUsers ? (
            <div className="p-4 text-xs text-slate-500">{t('common.loading', 'Loading…')}</div>
          ) : users.length === 0 ? (
            <div className="p-4 text-xs text-slate-500">
              {t('admin.memory.noUsers', 'No users match')}
            </div>
          ) : (
            users.map((u) => (
              <button
                key={u.userId}
                onClick={() => setSelectedUserId(u.userId)}
                className={`flex w-full flex-col items-start gap-0.5 border-b border-slate-100 px-4 py-2.5 text-left transition-colors hover:bg-slate-50 ${
                  selectedUserId === u.userId ? 'bg-violet-50' : ''
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="truncate text-xs font-semibold text-slate-900">
                    {u.name || u.email}
                  </span>
                  {u.memoryCount > 0 && (
                    <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                      {u.memoryCount}
                    </span>
                  )}
                </div>
                <span className="truncate text-[10px] text-slate-500">{u.email}</span>
                <span className="text-[10px] text-slate-400">
                  {u.interactionCount} {t('admin.memory.interactions', 'interactions')}
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Right: detail pane */}
      <main className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {!selectedUserId || !selectedUser ? (
          <div className="flex h-full items-center justify-center px-6 py-12 text-center">
            <div>
              <svg className="mx-auto h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p className="mt-3 text-sm text-slate-500">
                {t('admin.memory.pickUser', 'Select a user to view their memory data')}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700">
                {(selectedUser.name || selectedUser.email).slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-slate-900">
                  {selectedUser.name || selectedUser.email}
                </h3>
                <p className="truncate text-[11px] text-slate-500">{selectedUser.email}</p>
              </div>
              <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 font-mono text-[10px] font-semibold text-amber-700">
                {t('admin.memory.breakGlass', 'BREAK-GLASS · AUDITED')}
              </span>
            </div>

            {/* Tabs */}
            <div className="border-b border-slate-100 px-5">
              <div className="flex gap-4">
                {(['profile', 'memories', 'interactions', 'audit'] as PaneTab[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`relative py-3 text-xs font-medium transition-colors ${
                      activeTab === key ? 'text-violet-700' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {t(`admin.memory.tabs.${key}`, key)}
                    {activeTab === key && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t bg-violet-600" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'profile' && <ProfilePane userId={selectedUserId} onReload={loadUsers} />}
              {activeTab === 'memories' && (
                <MemoriesPane userId={selectedUserId} onEdit={setEditMemory} onReload={loadUsers} />
              )}
              {activeTab === 'interactions' && <InteractionsPane userId={selectedUserId} />}
              {activeTab === 'audit' && <AuditPane userId={selectedUserId} />}
            </div>
          </>
        )}
      </main>

      {/* Edit memory modal */}
      {editMemory && (
        <MemoryEditModal
          memory={editMemory}
          onClose={() => setEditMemory(null)}
          onSaved={() => {
            setEditMemory(null);
            loadUsers();
          }}
        />
      )}
    </div>
  );
}

// ── Sub-panes ───────────────────────────────────────────────────────────────

function ProfilePane({ userId, onReload }: { userId: string; onReload: () => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/v1/admin/memory/users/${userId}/profile`);
      setData(res.data.data as ProfileData);
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const rebuild = async () => {
    setRebuilding(true);
    try {
      await axios.post(`/api/v1/admin/memory/users/${userId}/profile/rebuild`);
      await load();
      onReload();
    } catch (err) {
      console.error('Failed to rebuild:', err);
    } finally {
      setRebuilding(false);
    }
  };

  const reset = async () => {
    if (!window.confirm(t('admin.memory.confirmReset', 'Reset this user\'s memory profile? This cannot be undone.'))) return;
    try {
      await axios.delete(`/api/v1/admin/memory/users/${userId}/profile`);
      await load();
      onReload();
    } catch (err) {
      console.error('Failed to reset:', err);
    }
  };

  if (loading) return <div className="p-6 text-xs text-slate-500">{t('common.loading', 'Loading…')}</div>;
  if (!data?.profile) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-500">{t('admin.memory.noProfile', 'No recruiter profile yet.')}</p>
        <button
          onClick={rebuild}
          disabled={rebuilding}
          className="mt-3 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {rebuilding
            ? t('admin.memory.rebuilding', 'Rebuilding…')
            : t('admin.memory.buildProfile', 'Build profile now')}
        </button>
      </div>
    );
  }

  const p = data.profile;
  return (
    <div className="space-y-5 p-5">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label={t('admin.memory.signalsLearned', 'Signals learned')} value={p.signalsLearned} />
        <StatCard label={t('admin.memory.agents', 'Agents')} value={p.agentCount} />
        <StatCard
          label={t('admin.memory.lastRebuilt', 'Last rebuilt')}
          value={new Date(p.lastRebuiltAt).toLocaleDateString()}
        />
      </div>

      <AggregateList label={t('admin.memory.topSkills', 'Top skills')} items={p.topSkills} accent="violet" />
      <AggregateList label={t('admin.memory.topAntiSkills', 'Top anti-skills')} items={p.topAntiSkills} accent="amber" />
      <AggregateList label={t('admin.memory.topLocations', 'Top locations')} items={p.topLocations} />
      <AggregateList label={t('admin.memory.topIndustries', 'Top industries')} items={p.topIndustries} />

      <div className="flex items-center gap-2 border-t border-slate-100 pt-4">
        <button
          onClick={rebuild}
          disabled={rebuilding}
          className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {rebuilding ? t('admin.memory.rebuilding', 'Rebuilding…') : t('admin.memory.rebuild', 'Rebuild profile')}
        </button>
        <button
          onClick={reset}
          className="rounded-xl border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
        >
          {t('admin.memory.reset', 'Reset profile')}
        </button>
      </div>
    </div>
  );
}

function MemoriesPane({
  userId,
  onEdit,
  onReload,
}: {
  userId: string;
  onEdit: (m: MemoryRow) => void;
  onReload: () => void;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<MemoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/v1/admin/memory/users/${userId}/memories`, {
        params: { limit: 100 },
      });
      setRows((res.data.data as MemoryRow[]) ?? []);
    } catch (err) {
      console.error('Failed to load memories:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    if (!window.confirm(t('admin.memory.confirmDelete', 'Delete this memory? Audit will retain the record.'))) return;
    try {
      await axios.delete(`/api/v1/admin/memory/memory/${id}`);
      await load();
      onReload();
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  if (loading) return <div className="p-6 text-xs text-slate-500">{t('common.loading', 'Loading…')}</div>;
  if (rows.length === 0) {
    return <div className="p-6 text-xs text-slate-500">{t('admin.memory.noMemories', 'No memories yet for this user.')}</div>;
  }

  return (
    <div className="space-y-2 p-5">
      {rows.map((m) => (
        <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
                  {m.kind}
                </span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{m.scope}</span>
                <span className="font-mono text-[10px] text-slate-400">w={m.weight.toFixed(2)}</span>
                {m.reinforceCount > 1 && (
                  <span className="font-mono text-[10px] text-emerald-600">×{m.reinforceCount}</span>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">{m.content}</p>
              <p className="mt-1 text-[10px] text-slate-400">
                {t('admin.memory.lastSeen', 'Last seen')}: {new Date(m.lastSeenAt).toLocaleString()}
                {m.expiresAt && (
                  <>
                    {' · '}
                    {t('admin.memory.expires', 'expires')}: {new Date(m.expiresAt).toLocaleDateString()}
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-none items-center gap-1">
              <button
                onClick={() => onEdit(m)}
                className="rounded border border-slate-200 px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-50"
              >
                {t('common.edit', 'Edit')}
              </button>
              <button
                onClick={() => remove(m.id)}
                className="rounded border border-red-200 px-2 py-1 text-[10px] text-red-600 hover:bg-red-50"
              >
                {t('common.delete', 'Delete')}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function InteractionsPane({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<InteractionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    axios
      .get(`/api/v1/admin/memory/users/${userId}/interactions`, { params: { limit: 200 } })
      .then((res) => setRows((res.data.data as InteractionRow[]) ?? []))
      .catch((err) => console.error('Failed to load interactions:', err))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) return <div className="p-6 text-xs text-slate-500">{t('common.loading', 'Loading…')}</div>;
  if (rows.length === 0) {
    return (
      <div className="p-6 text-xs text-slate-500">
        {t('admin.memory.noInteractions', 'No interaction events captured yet.')}
      </div>
    );
  }

  return (
    <div className="p-5">
      <ol className="space-y-1 font-mono text-[11px]">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 border-b border-slate-100 py-1.5">
            <span className="text-slate-400">{new Date(r.createdAt).toLocaleTimeString()}</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">{r.eventType}</span>
            <span className="truncate text-slate-600">candidate:{r.candidateId.slice(0, 10)}</span>
            {r.durationMs && <span className="text-slate-400">{r.durationMs}ms</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function AuditPane({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    axios
      .get('/api/v1/admin/memory/audit', { params: { targetId: userId, limit: 100 } })
      .then((res) => setRows((res.data.data as AuditRow[]) ?? []))
      .catch((err) => console.error('Failed to load audit:', err))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) return <div className="p-6 text-xs text-slate-500">{t('common.loading', 'Loading…')}</div>;

  return (
    <div className="p-5">
      <p className="mb-3 text-[11px] text-slate-500">
        {t(
          'admin.memory.auditHint',
          'Every admin action on this user\'s data is captured here. Audit entries are immutable.',
        )}
      </p>
      {rows.length === 0 ? (
        <div className="text-xs text-slate-500">{t('admin.memory.noAudit', 'No audit entries yet.')}</div>
      ) : (
        <ol className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
              <div className="flex items-center gap-2">
                <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
                  {r.action}
                </span>
                <span className="text-[11px] text-slate-600">{r.admin.name || r.admin.email}</span>
                <span className="ml-auto text-[10px] text-slate-400">
                  {new Date(r.createdAt).toLocaleString()}
                </span>
              </div>
              {r.reason && (
                <p className="mt-1 rounded bg-slate-50 px-2 py-1 text-[11px] italic text-slate-600">
                  "{r.reason}"
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ── Memory Edit Modal ───────────────────────────────────────────────────────

function MemoryEditModal({
  memory,
  onClose,
  onSaved,
}: {
  memory: MemoryRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [content, setContent] = useState(memory.content);
  const [weight, setWeight] = useState(memory.weight);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await axios.patch(
        `/api/v1/admin/memory/memory/${memory.id}`,
        { content, weight, reason },
        { headers: reason ? { 'X-Memory-Access-Reason': reason } : {} },
      );
      onSaved();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || t('admin.memory.saveFailed', 'Failed to save'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 py-10 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-sm font-semibold text-slate-900">
            {t('admin.memory.editModal.title', 'Edit memory')}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            {t(
              'admin.memory.editModal.warning',
              'This is a break-glass edit. The action, before/after, and optional reason are stored in an immutable audit log.',
            )}
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-600">
              {t('admin.memory.editModal.content', 'Content')}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-600">
              {t('admin.memory.editModal.weight', 'Weight (0-10)')}
            </label>
            <input
              type="number"
              step="0.1"
              min={0}
              max={10}
              value={weight}
              onChange={(e) => setWeight(parseFloat(e.target.value))}
              className="w-32 rounded-xl border border-slate-300 px-3 py-1.5 font-mono text-xs focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-600">
              {t('admin.memory.editModal.reason', 'Reason (optional, captured in audit log)')}
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('admin.memory.editModal.reasonPlaceholder', 'e.g. support ticket #1234, correcting stale fact')}
              className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-xs focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </div>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
              {error}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200"
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            onClick={save}
            disabled={saving || !content.trim()}
            className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {saving ? t('common.saving', 'Saving…') : t('common.save', 'Save')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Small helpers ───────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-lg font-semibold text-slate-900">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function AggregateList({
  label,
  items,
  accent = 'slate',
}: {
  label: string;
  items: unknown;
  accent?: 'violet' | 'amber' | 'slate';
}) {
  const arr = Array.isArray(items) ? (items as Array<{ key: string; weight: number; sourceCount?: number }>) : [];
  if (arr.length === 0) return null;
  const chipClass =
    accent === 'violet'
      ? 'border-violet-200 bg-violet-50 text-violet-700'
      : accent === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-slate-200 bg-slate-50 text-slate-700';
  return (
    <div>
      <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</h4>
      <div className="flex flex-wrap gap-1.5">
        {arr.slice(0, 12).map((item) => (
          <span key={item.key} className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] ${chipClass}`}>
            {item.key}
            <span className="font-mono text-[9px] opacity-60">{item.weight.toFixed(2)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
