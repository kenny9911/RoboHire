import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  EMPTY_IDEAL_CANDIDATE_PROFILE,
  type IdealProfileVersion,
} from '../hooks/useIdealProfile';

interface Props {
  /** The version before the regen was triggered. */
  previousProfile: IdealProfileVersion | null;
  /** The currently-loaded profile — after a successful regen, this is the NEW version. */
  currentProfile: IdealProfileVersion | null;
  regenerating: boolean;
  onConfirm: () => Promise<void>;
  onRevert: () => Promise<void>;
  onClose: () => void;
}

/**
 * Diff modal shown when the user clicks Regenerate on the ICP card. Fires the
 * POST on mount, shows a loading spinner while it runs, then renders a side-by-side
 * diff of old vs new version. User can accept the new version (default) or
 * discard, which reverts to the previous version.
 */
export default function RegenerateProfileModal({
  previousProfile,
  currentProfile,
  regenerating,
  onConfirm,
  onRevert,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<'loading' | 'diff' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  // Fire the regen call once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await onConfirm();
        if (!cancelled) setPhase('diff');
      } catch (err: unknown) {
        if (!cancelled) {
          setPhase('error');
          setError(err instanceof Error ? err.message : 'Regen failed');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // onConfirm intentionally omitted — we only want to fire once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDiscard = async () => {
    await onRevert();
    onClose();
  };

  const oldConfPct = Math.round((previousProfile?.confidence ?? 0) * 100);
  const newConfPct = Math.round((currentProfile?.confidence ?? 0) * 100);
  const delta = newConfPct - oldConfPct;
  const previousIdealProfile = previousProfile?.profile ?? EMPTY_IDEAL_CANDIDATE_PROFILE;
  const currentIdealProfile = currentProfile?.profile ?? EMPTY_IDEAL_CANDIDATE_PROFILE;

  const oldSkills = new Set(previousIdealProfile.coreSkills.map((s) => s.skill));
  const newSkills = new Set(currentIdealProfile.coreSkills.map((s) => s.skill));
  const added = Array.from(newSkills).filter((s) => !oldSkills.has(s));
  const removed = Array.from(oldSkills).filter((s) => !newSkills.has(s));

  const oldAntiSkills = new Set(previousIdealProfile.antiSkills);
  const newAntiSkills = new Set(currentIdealProfile.antiSkills);
  const addedAnti = Array.from(newAntiSkills).filter((s) => !oldAntiSkills.has(s));
  const removedAnti = Array.from(oldAntiSkills).filter((s) => !newAntiSkills.has(s));

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-900/50 py-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            {t('agents.workbench.regenModal.title', 'Regenerate ideal profile')}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label={t('common.close', 'Close')}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {phase === 'loading' || regenerating ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
              <p className="text-sm font-medium text-slate-700">
                {t('agents.workbench.regenModal.comparing', 'Analyzing signals…')}
              </p>
              <p className="max-w-sm text-xs text-slate-500">
                {t(
                  'agents.workbench.icp.generatingHint',
                  'Typically 5–15 seconds. Re-learning from likes and dislikes.',
                )}
              </p>
            </div>
          ) : phase === 'error' ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4">
              <p className="text-sm font-semibold text-rose-800">
                {t('agents.workbench.icp.errorTitle', "Couldn't regenerate the profile")}
              </p>
              {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Confidence delta */}
              <div className="flex items-center gap-3 rounded-xl border border-violet-100 bg-violet-50/50 px-4 py-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700">
                  {t('agents.workbench.regenModal.confidenceDelta', 'Confidence')}
                </span>
                <span className="text-sm font-semibold text-slate-700">
                  {oldConfPct}% → {newConfPct}%
                </span>
                <span
                  className={`ml-auto rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                    delta >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}
                </span>
              </div>

              {/* Narrative diff */}
              <div>
                <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {t('agents.workbench.icp.narrative', 'Narrative')}
                </h4>
                <div className="space-y-1">
                  {previousProfile?.narrativeSummary && (
                    <div className="rounded-md bg-rose-50/60 px-3 py-2 text-xs text-slate-700">
                      <span className="mr-2 font-mono text-rose-500">-</span>
                      {previousProfile.narrativeSummary}
                    </div>
                  )}
                  {currentProfile?.narrativeSummary && (
                    <div className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-slate-700">
                      <span className="mr-2 font-mono text-emerald-600">+</span>
                      {currentProfile.narrativeSummary}
                    </div>
                  )}
                </div>
              </div>

              {/* Added / removed skills */}
              {(added.length > 0 || removed.length > 0) && (
                <div>
                  <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {t('agents.workbench.icp.coreSkills', 'Core skills')}
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {added.map((s) => (
                      <span
                        key={`+${s}`}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700"
                      >
                        + {s}
                      </span>
                    ))}
                    {removed.map((s) => (
                      <span
                        key={`-${s}`}
                        className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50/60 px-2 py-0.5 text-[11px] text-rose-700 opacity-70"
                      >
                        − {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(addedAnti.length > 0 || removedAnti.length > 0) && (
                <div>
                  <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {t('agents.workbench.icp.antiTraits', 'Anti-traits')}
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {addedAnti.map((s) => (
                      <span
                        key={`+${s}`}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700"
                      >
                        + ✕ {s}
                      </span>
                    ))}
                    {removedAnti.map((s) => (
                      <span
                        key={`-${s}`}
                        className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50/60 px-2 py-0.5 text-[11px] text-rose-700 opacity-70"
                      >
                        − ✕ {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === 'diff' && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
            <button
              type="button"
              onClick={handleDiscard}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t('agents.workbench.regenModal.discard', 'Discard')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
            >
              {t('agents.workbench.regenModal.applyNew', 'Apply new version')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
