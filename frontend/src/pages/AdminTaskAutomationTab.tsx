import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from '../lib/axios';

interface AutomationRule {
  id: string;
  taskType: string;
  enabled: boolean;
  assigneeType: string;
  autoExecute: boolean;
  slaHours: number | null;
  priority: string;
  escalateAfterHours: number | null;
  emailNotify: boolean;
}

// Translation keys for each task type — resolved at render via t()
const TYPE_META: Record<string, { labelKey: string; descKey: string; categoryKey: string }> = {
  evaluate_interview:      { labelKey: 'admin.taskRules.types.evaluate_interview.label',      descKey: 'admin.taskRules.types.evaluate_interview.desc',      categoryKey: 'tasks.category.evaluation' },
  review_evaluation:       { labelKey: 'admin.taskRules.types.review_evaluation.label',       descKey: 'admin.taskRules.types.review_evaluation.desc',       categoryKey: 'tasks.category.pipeline' },
  hiring_decision:         { labelKey: 'admin.taskRules.types.hiring_decision.label',         descKey: 'admin.taskRules.types.hiring_decision.desc',         categoryKey: 'tasks.category.pipeline' },
  review_matches:          { labelKey: 'admin.taskRules.types.review_matches.label',          descKey: 'admin.taskRules.types.review_matches.desc',          categoryKey: 'tasks.category.pipeline' },
  shortlist_candidates:    { labelKey: 'admin.taskRules.types.shortlist_candidates.label',    descKey: 'admin.taskRules.types.shortlist_candidates.desc',    categoryKey: 'tasks.category.pipeline' },
  send_interview_invite:   { labelKey: 'admin.taskRules.types.send_interview_invite.label',   descKey: 'admin.taskRules.types.send_interview_invite.desc',   categoryKey: 'tasks.category.communication' },
  follow_up_invitation:    { labelKey: 'admin.taskRules.types.follow_up_invitation.label',    descKey: 'admin.taskRules.types.follow_up_invitation.desc',    categoryKey: 'tasks.category.communication' },
  interview_reminder:      { labelKey: 'admin.taskRules.types.interview_reminder.label',      descKey: 'admin.taskRules.types.interview_reminder.desc',      categoryKey: 'tasks.category.communication' },
  run_matching:            { labelKey: 'admin.taskRules.types.run_matching.label',            descKey: 'admin.taskRules.types.run_matching.desc',            categoryKey: 'tasks.category.sourcing' },
  review_agent_candidates: { labelKey: 'admin.taskRules.types.review_agent_candidates.label', descKey: 'admin.taskRules.types.review_agent_candidates.desc', categoryKey: 'tasks.category.sourcing' },
  publish_job:             { labelKey: 'admin.taskRules.types.publish_job.label',             descKey: 'admin.taskRules.types.publish_job.desc',             categoryKey: 'tasks.category.admin' },
  close_stale_job:         { labelKey: 'admin.taskRules.types.close_stale_job.label',         descKey: 'admin.taskRules.types.close_stale_job.desc',         categoryKey: 'tasks.category.admin' },
  stale_pipeline:          { labelKey: 'admin.taskRules.types.stale_pipeline.label',          descKey: 'admin.taskRules.types.stale_pipeline.desc',          categoryKey: 'tasks.category.admin' },
  sync_gohire_interviews:  { labelKey: 'admin.taskRules.types.sync_gohire_interviews.label',  descKey: 'admin.taskRules.types.sync_gohire_interviews.desc',  categoryKey: 'tasks.category.evaluation' },
  reparse_resume:          { labelKey: 'admin.taskRules.types.reparse_resume.label',          descKey: 'admin.taskRules.types.reparse_resume.desc',          categoryKey: 'tasks.category.admin' },
};

const PRIORITY_OPTIONS = ['critical', 'high', 'medium', 'low'];
const PRIORITY_COLORS: Record<string, string> = {
  critical: 'text-red-700 bg-red-50',
  high: 'text-amber-700 bg-amber-50',
  medium: 'text-blue-700 bg-blue-50',
  low: 'text-slate-600 bg-slate-50',
};

export default function AdminTaskAutomationTab() {
  const { t } = useTranslation();
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchRules = useCallback(async () => {
    try {
      const res = await axios.get('/api/v1/tasks/admin/rules');
      setRules(res.data.rules || []);
      setError('');
    } catch {
      setError(t('admin.taskRules.fetchError', 'Failed to load automation rules'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void fetchRules(); }, [fetchRules]);

  const updateRule = async (taskType: string, updates: Partial<AutomationRule>) => {
    setSaving(taskType);
    try {
      await axios.patch(`/api/v1/tasks/admin/rules/${taskType}`, updates);
      setRules((prev) => prev.map((r) => r.taskType === taskType ? { ...r, ...updates } : r));
    } catch {
      setError(t('admin.taskRules.updateError', 'Failed to update rule'));
    }
    setSaving(null);
  };

  const resetDefaults = async () => {
    if (!confirm(t('admin.taskRules.resetConfirm', 'Reset all automation rules to defaults? This cannot be undone.'))) return;
    setLoading(true);
    try {
      const res = await axios.post('/api/v1/tasks/admin/rules/reset');
      setRules(res.data.rules || []);
    } catch {
      setError(t('admin.taskRules.resetError', 'Failed to reset rules'));
    }
    setLoading(false);
  };

  const runStaleChecks = async () => {
    try {
      await axios.post('/api/v1/tasks/admin/run-stale-checks');
      alert(t('admin.taskRules.staleChecksSuccess', 'Stale checks triggered successfully'));
    } catch {
      setError(t('admin.taskRules.staleChecksError', 'Failed to trigger stale checks'));
    }
  };

  // Group rules by category
  const grouped = rules.reduce((acc, rule) => {
    const catKey = TYPE_META[rule.taskType]?.categoryKey || 'tasks.category.admin';
    const cat = t(catKey, catKey);
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(rule);
    return acc;
  }, {} as Record<string, AutomationRule[]>);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t('admin.taskRules.title', 'Task Automation Rules')}</h2>
          <p className="text-sm text-slate-500 mt-0.5">{t('admin.taskRules.subtitle', 'Configure which tasks are auto-generated and their SLA thresholds')}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={runStaleChecks}
            className="px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
          >
            {t('admin.taskRules.runStaleChecks', 'Run Stale Checks')}
          </button>
          <button
            onClick={resetDefaults}
            className="px-3 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
          >
            {t('admin.taskRules.resetDefaults', 'Reset to Defaults')}
          </button>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}

      {/* Rules by category */}
      {Object.entries(grouped).map(([category, categoryRules]) => (
        <div key={category} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700">{category}</h3>
          </div>

          <div className="divide-y divide-slate-100">
            {categoryRules.map((rule) => {
              const meta = TYPE_META[rule.taskType];
              const label = meta ? t(meta.labelKey, rule.taskType) : rule.taskType;
              const desc = meta ? t(meta.descKey, '') : '';
              const isSaving = saving === rule.taskType;

              return (
                <div key={rule.taskType} className={`px-5 py-4 ${!rule.enabled ? 'opacity-60' : ''}`}>
                  <div className="flex items-start gap-4">
                    {/* Toggle */}
                    <label className="relative inline-flex items-center cursor-pointer mt-0.5">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(e) => updateRule(rule.taskType, { enabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:ring-2 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                    </label>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-semibold text-slate-900">{label}</h4>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          rule.assigneeType === 'agent' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {rule.assigneeType === 'agent' ? t('tasks.badge.agent', 'Agent') : t('admin.taskRules.human', 'Human')}
                        </span>
                        {isSaving && <span className="text-[10px] text-blue-500">{t('admin.taskRules.saving', 'Saving...')}</span>}
                      </div>
                      <p className="text-xs text-slate-500 mb-3">{desc}</p>

                      {/* Config row */}
                      {rule.enabled && (
                        <div className="flex flex-wrap items-center gap-3">
                          {/* Priority */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400 uppercase font-semibold">{t('admin.taskRules.priority', 'Priority')}</span>
                            <select
                              value={rule.priority}
                              onChange={(e) => updateRule(rule.taskType, { priority: e.target.value })}
                              className={`text-xs border-0 rounded px-2 py-1 font-medium ${PRIORITY_COLORS[rule.priority] || ''}`}
                            >
                              {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{t(`tasks.priority.${p}`, p)}</option>)}
                            </select>
                          </div>

                          {/* SLA */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400 uppercase font-semibold">{t('admin.taskRules.sla', 'SLA')}</span>
                            <input
                              type="number"
                              min={0}
                              value={rule.slaHours ?? ''}
                              onChange={(e) => updateRule(rule.taskType, { slaHours: e.target.value ? parseInt(e.target.value) : null })}
                              className="w-16 text-xs border border-slate-200 rounded px-2 py-1 text-center"
                              placeholder={t('admin.taskRules.none', 'None')}
                            />
                            <span className="text-[10px] text-slate-400">{t('admin.taskRules.hours', 'hours')}</span>
                          </div>

                          {/* Escalate */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400 uppercase font-semibold">{t('admin.taskRules.escalate', 'Escalate')}</span>
                            <input
                              type="number"
                              min={0}
                              value={rule.escalateAfterHours ?? ''}
                              onChange={(e) => updateRule(rule.taskType, { escalateAfterHours: e.target.value ? parseInt(e.target.value) : null })}
                              className="w-16 text-xs border border-slate-200 rounded px-2 py-1 text-center"
                              placeholder={t('admin.taskRules.none', 'None')}
                            />
                            <span className="text-[10px] text-slate-400">{t('admin.taskRules.hours', 'hours')}</span>
                          </div>

                          {/* Auto-execute (agent tasks only) */}
                          {rule.assigneeType === 'agent' && (
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={rule.autoExecute}
                                onChange={(e) => updateRule(rule.taskType, { autoExecute: e.target.checked })}
                                className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-[10px] text-slate-500 font-medium">{t('admin.taskRules.autoExecute', 'Auto-execute')}</span>
                            </label>
                          )}

                          {/* Email notify */}
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={rule.emailNotify}
                              onChange={(e) => updateRule(rule.taskType, { emailNotify: e.target.checked })}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-[10px] text-slate-500 font-medium">{t('admin.taskRules.emailNotify', 'Email notify')}</span>
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
