import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from '../lib/axios';
import HardRequirementsEditor, { type HardRequirement } from './HardRequirementsEditor';

interface PresetRow {
  id: string;
  name: string;
  scope: 'private' | 'shared';
  criteria: AgentCriterion[];
  user?: { id: string; name: string | null; email: string } | null;
}

/**
 * Criterion — a single weighted rule the agent uses to evaluate candidates.
 * Pinned criteria are MANDATORY (dealbreaker if missing). Order within each
 * bucket (mostImportant / leastImportant) drives the scoring weight.
 *
 * Stored in `agent.config.criteria` as JSON — no new Prisma table required.
 */
export interface AgentCriterion {
  id: string;
  text: string;
  pinned: boolean;
  bucket: 'most' | 'least';
}

interface Props {
  agentId: string;
  initial: AgentCriterion[];
  onClose: () => void;
  onSaved: (criteria: AgentCriterion[]) => void;
}

function makeId(): string {
  return `c_${Math.random().toString(36).slice(2, 10)}`;
}

export default function AgentCriteriaModal({ agentId, initial, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const [criteria, setCriteria] = useState<AgentCriterion[]>(
    initial.length > 0 ? initial : [{ id: makeId(), text: '', pinned: false, bucket: 'most' }],
  );
  const [hardRequirements, setHardRequirements] = useState<HardRequirement[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [presets, setPresets] = useState<PresetRow[]>([]);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState('');

  // Load the user's visible presets once on mount
  useEffect(() => {
    void axios
      .get('/api/v1/agents/criteria-presets')
      .then((res) => setPresets((res.data.data || []) as PresetRow[]))
      .catch(() => setPresets([]));
  }, []);

  // Load the agent's existing hard requirements so edits in the modal persist
  // alongside soft criteria. Falls back to an empty array if the endpoint is
  // not yet available.
  useEffect(() => {
    void axios
      .get(`/api/v1/agents/${agentId}`)
      .then((res) => {
        const cfg = (res.data?.data?.config ?? {}) as { hardRequirements?: HardRequirement[] };
        setHardRequirements(cfg.hardRequirements ?? []);
      })
      .catch(() => setHardRequirements([]));
  }, [agentId]);

  const applyPreset = (preset: PresetRow) => {
    // Regenerate IDs so drag-and-drop has stable unique keys in this session.
    const cloned = preset.criteria.map((c) => ({ ...c, id: makeId() }));
    setCriteria(cloned);
    setPresetsOpen(false);
  };

  const saveAsPreset = async () => {
    if (!presetName.trim()) return;
    const cleaned = criteria.map((c) => ({ ...c, text: c.text.trim() })).filter((c) => c.text.length > 0);
    if (cleaned.length === 0) {
      setError(t('agents.workbench.criteria.saveFailed', 'Failed to save criteria'));
      return;
    }
    try {
      const res = await axios.post('/api/v1/agents/criteria-presets', {
        name: presetName.trim(),
        criteria: cleaned,
      });
      setPresets((prev) => [res.data.data, ...prev]);
      setSaveOpen(false);
      setPresetName('');
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || t('agents.workbench.criteria.saveFailed', 'Failed to save criteria'));
    }
  };

  const mostImportant = criteria.filter((c) => c.bucket === 'most');
  const leastImportant = criteria.filter((c) => c.bucket === 'least');

  const addCriterion = (bucket: 'most' | 'least') => {
    setCriteria((prev) => [...prev, { id: makeId(), text: '', pinned: false, bucket }]);
  };

  const updateText = (id: string, text: string) => {
    setCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, text } : c)));
  };

  const togglePin = (id: string) => {
    setCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)));
  };

  const removeCriterion = (id: string) => {
    setCriteria((prev) => prev.filter((c) => c.id !== id));
  };

  // Move a criterion relative to another. Handles cross-bucket drops.
  const reorder = useCallback((sourceId: string, targetId: string) => {
    setCriteria((prev) => {
      const source = prev.find((c) => c.id === sourceId);
      const target = prev.find((c) => c.id === targetId);
      if (!source || !target || source.id === target.id) return prev;

      const remaining = prev.filter((c) => c.id !== sourceId);
      const targetIdx = remaining.findIndex((c) => c.id === targetId);
      const updatedSource = { ...source, bucket: target.bucket };
      remaining.splice(targetIdx, 0, updatedSource);
      return remaining;
    });
  }, []);

  const moveToEmpty = useCallback((sourceId: string, bucket: 'most' | 'least') => {
    setCriteria((prev) =>
      prev.map((c) => (c.id === sourceId ? { ...c, bucket } : c)),
    );
  }, []);

  const handleSave = async () => {
    setError(null);
    // Strip empty-text criteria before saving — user may have added empty rows.
    const cleaned = criteria
      .map((c) => ({ ...c, text: c.text.trim() }))
      .filter((c) => c.text.length > 0);

    setSaving(true);
    try {
      // Fetch existing config to preserve other keys, then patch just `criteria`
      const existing = await axios.get(`/api/v1/agents/${agentId}`);
      const existingConfig = (existing.data.data?.config as Record<string, unknown> | null) ?? {};

      await axios.patch(`/api/v1/agents/${agentId}`, {
        config: { ...existingConfig, criteria: cleaned, hardRequirements },
      });
      // Also hit the dedicated HR endpoint so the backend's validation + audit
      // log captures the change. Swallow errors — the config PATCH above is
      // the source of truth and will already succeed or fail the save.
      try {
        await axios.patch(`/api/v1/agents/${agentId}/hard-requirements`, { hardRequirements });
      } catch {
        /* ignore — endpoint may not yet be deployed */
      }
      onSaved(cleaned);
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || t('agents.workbench.criteria.saveFailed', 'Failed to save criteria'));
    } finally {
      setSaving(false);
    }
  };

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/40 backdrop-blur-[2px] py-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            {t('agents.workbench.criteria.title', 'Criteria')}
          </h2>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-700 hover:text-violet-800"
                onClick={() => setPresetsOpen((v) => !v)}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                {t('agents.workbench.criteria.selectPreset', 'Select Preset')}
              </button>
              {presetsOpen && (
                <div
                  className="absolute right-0 top-7 z-10 w-72 rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
                  onMouseLeave={() => setPresetsOpen(false)}
                >
                  {presets.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-500">
                      {t('agents.workbench.criteria.noPresets', 'No presets saved yet')}
                    </p>
                  ) : (
                    presets.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => applyPreset(p)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                          {p.scope}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="relative">
              <button
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-900"
                onClick={() => setSaveOpen((v) => !v)}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {t('agents.workbench.criteria.savePreset', 'Save Preset')}
              </button>
              {saveOpen && (
                <div className="absolute right-0 top-7 z-10 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                  <input
                    type="text"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder={t('agents.workbench.criteria.presetNamePlaceholder', 'Preset name')}
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                    autoFocus
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      onClick={() => setSaveOpen(false)}
                      className="rounded-lg px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
                    >
                      {t('common.cancel', 'Cancel')}
                    </button>
                    <button
                      onClick={saveAsPreset}
                      disabled={!presetName.trim()}
                      className="rounded-lg bg-violet-600 px-3 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                    >
                      {t('common.save', 'Save')}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto px-6 pb-2 pt-5">
          {/* HARD REQUIREMENTS */}
          <div className="mb-4">
            <HardRequirementsEditor
              value={hardRequirements}
              onChange={setHardRequirements}
              compact
            />
            <p className="mt-2 px-1 text-[11px] italic text-slate-500">
              ↓{' '}
              {t(
                'agents.workbench.criteria.hrRelationship',
                'Hard requirements run first to filter the pool. Then soft criteria score what\'s left.',
              )}
            </p>
          </div>

          {/* MOST IMPORTANT */}
          <CriteriaBucket
            label={t('agents.workbench.criteria.mostImportant', 'Most Important')}
            tone="most"
            items={mostImportant}
            dragId={dragId}
            dragOverId={dragOverId}
            onDragStart={setDragId}
            onDragOver={setDragOverId}
            onDragEnd={() => {
              setDragId(null);
              setDragOverId(null);
            }}
            onReorder={reorder}
            onMoveToEmpty={(sourceId) => moveToEmpty(sourceId, 'most')}
            onUpdateText={updateText}
            onTogglePin={togglePin}
            onRemove={removeCriterion}
            onAdd={() => addCriterion('most')}
          />

          {/* LEAST IMPORTANT */}
          <CriteriaBucket
            label={t('agents.workbench.criteria.leastImportant', 'Least Important')}
            tone="least"
            items={leastImportant}
            dragId={dragId}
            dragOverId={dragOverId}
            onDragStart={setDragId}
            onDragOver={setDragOverId}
            onDragEnd={() => {
              setDragId(null);
              setDragOverId(null);
            }}
            onReorder={reorder}
            onMoveToEmpty={(sourceId) => moveToEmpty(sourceId, 'least')}
            onUpdateText={updateText}
            onTogglePin={togglePin}
            onRemove={removeCriterion}
            onAdd={() => addCriterion('least')}
          />

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button
            onClick={() => addCriterion('most')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {t('agents.workbench.criteria.addCriterion', 'Add Criterion')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
          >
            {saving ? t('common.saving', 'Saving…') : t('agents.workbench.criteria.update', 'Update')}
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M7 7h10v10" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

interface BucketProps {
  label: string;
  tone: 'most' | 'least';
  items: AgentCriterion[];
  dragId: string | null;
  dragOverId: string | null;
  onDragStart: (id: string | null) => void;
  onDragOver: (id: string | null) => void;
  onDragEnd: () => void;
  onReorder: (sourceId: string, targetId: string) => void;
  onMoveToEmpty: (sourceId: string) => void;
  onUpdateText: (id: string, text: string) => void;
  onTogglePin: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}

function CriteriaBucket({
  label,
  tone,
  items,
  dragId,
  dragOverId,
  onDragStart,
  onDragOver,
  onDragEnd,
  onReorder,
  onMoveToEmpty,
  onUpdateText,
  onTogglePin,
  onRemove,
  onAdd,
}: BucketProps) {
  const { t } = useTranslation();

  // Empty-bucket drop target (so you can drag a criterion into an empty bucket)
  const handleEmptyDragOver = (e: React.DragEvent) => {
    if (!dragId) return;
    e.preventDefault();
  };
  const handleEmptyDrop = (e: React.DragEvent) => {
    if (!dragId) return;
    e.preventDefault();
    onMoveToEmpty(dragId);
    onDragEnd();
  };

  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {label}
        </span>
        <span className="h-px flex-1 bg-slate-100" />
      </div>

      {items.length === 0 ? (
        <div
          onDragOver={handleEmptyDragOver}
          onDrop={handleEmptyDrop}
          className={`rounded-xl border border-dashed px-4 py-5 text-center text-xs text-slate-400 ${
            dragId ? 'border-violet-300 bg-violet-50/40' : 'border-slate-200'
          }`}
        >
          {t('agents.workbench.criteria.dragHere', 'Drop a criterion here, or click Add below.')}
        </div>
      ) : (
        <div className={`space-y-2 rounded-2xl ${tone === 'most' ? 'bg-slate-50/60 p-3' : ''}`}>
          {items.map((item, i) => (
            <CriterionRow
              key={item.id}
              item={item}
              index={i}
              tone={tone}
              isDragging={dragId === item.id}
              isDragOver={dragOverId === item.id && dragId !== item.id}
              onDragStart={() => onDragStart(item.id)}
              onDragOver={(e) => {
                if (!dragId || dragId === item.id) return;
                e.preventDefault();
                onDragOver(item.id);
              }}
              onDragLeave={() => {
                if (dragOverId === item.id) onDragOver(null);
              }}
              onDrop={(e) => {
                if (!dragId) return;
                e.preventDefault();
                onReorder(dragId, item.id);
                onDragEnd();
              }}
              onDragEnd={onDragEnd}
              onUpdateText={(text) => onUpdateText(item.id, text)}
              onTogglePin={() => onTogglePin(item.id)}
              onRemove={() => onRemove(item.id)}
            />
          ))}
        </div>
      )}

      <button
        onClick={onAdd}
        className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 hover:text-violet-700"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        {t('agents.workbench.criteria.addToBucket', 'Add to {{bucket}}', { bucket: label.toLowerCase() })}
      </button>
    </section>
  );
}

interface RowProps {
  item: AgentCriterion;
  index: number;
  tone: 'most' | 'least';
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onUpdateText: (text: string) => void;
  onTogglePin: () => void;
  onRemove: () => void;
}

function CriterionRow({
  item,
  index,
  tone,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onUpdateText,
  onTogglePin,
  onRemove,
}: RowProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      draggable
      onDragStart={(e) => {
        // Setting data is required for Firefox to initiate the drag.
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(e);
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`group relative flex items-center gap-2 rounded-xl border bg-white px-2.5 py-2 transition-all ${
        isDragging ? 'opacity-40' : 'opacity-100'
      } ${
        isDragOver
          ? 'border-violet-500 ring-2 ring-violet-200'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      {/* Pin toggle — separate affordance from drag/order */}
      <button
        type="button"
        onClick={onTogglePin}
        className={`flex h-7 w-7 flex-none items-center justify-center rounded-lg transition-colors ${
          item.pinned ? 'bg-violet-100 text-violet-700' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
        }`}
        aria-label={item.pinned ? t('agents.workbench.criteria.unpin', 'Unpin') : t('agents.workbench.criteria.pin', 'Pin as mandatory')}
        title={
          item.pinned
            ? t('agents.workbench.criteria.pinnedHint', 'Mandatory — agent must treat this as a dealbreaker')
            : t('agents.workbench.criteria.pinHint', 'Click to mark as mandatory requirement')
        }
      >
        <svg
          className="h-3.5 w-3.5"
          fill={item.pinned ? 'currentColor' : 'none'}
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={item.pinned ? 0 : 2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 5l5 5-5 5M12 19V5M19 5v14" />
        </svg>
      </button>

      {/* Drag handle */}
      <span
        className="flex h-7 w-4 flex-none cursor-grab items-center justify-center text-slate-300 hover:text-slate-500 active:cursor-grabbing"
        aria-hidden="true"
      >
        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
          <circle cx="7" cy="5" r="1.25" />
          <circle cx="13" cy="5" r="1.25" />
          <circle cx="7" cy="10" r="1.25" />
          <circle cx="13" cy="10" r="1.25" />
          <circle cx="7" cy="15" r="1.25" />
          <circle cx="13" cy="15" r="1.25" />
        </svg>
      </span>

      {/* Order number chip */}
      <span
        className={`flex h-6 w-6 flex-none items-center justify-center rounded-md text-[11px] font-semibold ${
          tone === 'most' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
        }`}
      >
        {index + 1}
      </span>

      {/* Text input — borderless idle, border on focus */}
      <input
        ref={inputRef}
        type="text"
        value={item.text}
        onChange={(e) => onUpdateText(e.target.value)}
        placeholder={t(
          'agents.workbench.criteria.placeholder',
          'Should have experience in leadership and management',
        )}
        className="min-w-0 flex-1 border-0 bg-transparent py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
      />

      {/* Remove — appears on hover */}
      <button
        type="button"
        onClick={onRemove}
        className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-slate-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
        aria-label={t('common.delete', 'Delete')}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <circle cx="12" cy="12" r="10" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l6 6M15 9l-6 6" />
        </svg>
      </button>
    </div>
  );
}
