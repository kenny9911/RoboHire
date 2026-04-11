import { useTranslation } from 'react-i18next';

export interface DryRunResult {
  totalCandidates: number;
  passed: number;
  rejected: number;
  rejectionsByRule?: Record<string, { count: number; description: string }>;
}

interface Props {
  result: DryRunResult;
  onCancel: () => void;
  onEdit: () => void;
  onOverride: () => void;
  blocking?: boolean;
}

/**
 * Shown before a run starts when the hard-requirements filter would exclude
 * most or all of the pool. See `docs/icp-design.md` §4.3.
 *
 * - `blocking = true` when 0 candidates survive — only Edit + Cancel are shown.
 * - `blocking = false` (default) when some candidates survive but < 10% —
 *   Edit is primary, "Run anyway" is secondary.
 */
export default function HardRequirementsWarning({
  result,
  onCancel,
  onEdit,
  onOverride,
  blocking = false,
}: Props) {
  const { t } = useTranslation();
  const excludedPct = result.totalCandidates > 0 ? Math.round((result.rejected / result.totalCandidates) * 100) : 0;

  const topRules = Object.entries(result.rejectionsByRule || {})
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3);

  return (
    <div className="fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto bg-slate-900/50 py-10" onClick={onCancel}>
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-6 py-4">
          <svg className="mt-0.5 h-6 w-6 flex-none text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <div>
            <h2 className="text-base font-semibold text-amber-900">
              {blocking
                ? t('agents.workbench.hardRequirements.warningTitleBlocking', 'Hard requirements exclude everyone')
                : t(
                    'agents.workbench.hardRequirements.warningTitle',
                    'Hard requirements may exclude almost everyone',
                  )}
            </h2>
            <p className="text-xs text-amber-800">
              {t('agents.workbench.hardRequirements.warningSubtitle', 'Review before running.')}
            </p>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <p className="mb-2 text-sm text-slate-700">
              {t('agents.workbench.hardRequirements.ofPool', 'Of {{total}} sourced candidates:', {
                total: result.totalCandidates,
              })}
            </p>
            <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${excludedPct}%` }}
                aria-label={`${excludedPct}% excluded`}
              />
              <div className="h-full flex-1 bg-emerald-400" aria-label={`${100 - excludedPct}% remaining`} />
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-slate-500">
              <span>
                {t('agents.workbench.hardRequirements.excludedCount', '{{count}} excluded by filters', {
                  count: result.rejected,
                })}
              </span>
              <span className="font-semibold text-emerald-700">
                {t('agents.workbench.hardRequirements.remainingCount', '{{count}} would be evaluated', {
                  count: result.passed,
                })}
              </span>
            </div>
          </div>

          {topRules.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">
                {t('agents.workbench.hardRequirements.topOffenders', 'Top rules removing the pool')}
              </p>
              <ul className="space-y-1">
                {topRules.map(([id, info]) => (
                  <li key={id} className="flex items-center justify-between text-xs text-slate-700">
                    <span className="truncate">• {info.description}</span>
                    <span className="ml-2 font-mono text-amber-700">
                      {t('agents.workbench.hardRequirements.excludesN', 'excludes {{n}}', { n: info.count })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            {t('common.cancel', 'Cancel')}
          </button>
          {!blocking && (
            <button
              type="button"
              onClick={onOverride}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              {t('agents.workbench.hardRequirements.runAnyway', 'Run anyway')}
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
          >
            {t('agents.workbench.hardRequirements.editRules', 'Edit hard requirements')}
          </button>
        </div>
      </div>
    </div>
  );
}
