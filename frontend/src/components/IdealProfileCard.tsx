import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  EMPTY_IDEAL_CANDIDATE_PROFILE,
  useIdealProfile,
  type IdealProfileVersion,
} from '../hooks/useIdealProfile';
import RegenerateProfileModal from './RegenerateProfileModal';

interface Props {
  agentId: string;
  /** Compact variant used inside RunSummaryCard — fewer chips, smaller header */
  compact?: boolean;
}

/**
 * Shows the latest AgentIdealProfile for an agent. Self-fetches via
 * `useIdealProfile`. Handles empty / loading / error / regenerate states.
 */
export default function IdealProfileCard({ agentId, compact = false }: Props) {
  const { t } = useTranslation();
  const { profile, loading, error, missing, regenerate, regenerating, revert, history, fetchHistory, promoteSuggestion } =
    useIdealProfile(agentId);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [prevVersion, setPrevVersion] = useState<IdealProfileVersion | null>(null);

  useEffect(() => {
    if (historyOpen) void fetchHistory();
  }, [historyOpen, fetchHistory]);

  const handleRegenerateClick = () => {
    setPrevVersion(profile);
    setRegenOpen(true);
  };

  const confidencePct = Math.round((profile?.confidence ?? 0) * 100);
  const confidenceBucket =
    confidencePct < 30
      ? 'low'
      : confidencePct < 60
      ? 'medium'
      : confidencePct < 85
      ? 'high'
      : 'veryHigh';
  const idealProfile = profile?.profile ?? EMPTY_IDEAL_CANDIDATE_PROFILE;

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 animate-pulse rounded-lg bg-violet-100" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-40 animate-pulse rounded bg-slate-200" />
            <div className="h-2.5 w-28 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
        <p className="mt-4 text-xs italic text-slate-500">
          {t('agents.workbench.icp.generating', 'Synthesizing your taste…')}
        </p>
      </div>
    );
  }

  if (error && !missing) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-5">
        <p className="text-sm font-semibold text-rose-800">
          {t('agents.workbench.icp.errorTitle', "Couldn't load ideal profile")}
        </p>
        <p className="mt-1 text-xs text-rose-700">{error}</p>
      </div>
    );
  }

  if (missing || !profile) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 px-5 py-8 text-center">
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-violet-50 text-xl text-violet-400">
          ✦
        </div>
        <p className="text-sm font-semibold text-slate-800">
          {t('agents.workbench.icp.emptyTitle', 'Teach your agent what "great" looks like')}
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
          {t(
            'agents.workbench.icp.emptyState',
            "Like or dislike a few candidates and I'll learn what you're looking for. You can also generate a profile from the job description alone.",
          )}
        </p>
        <button
          type="button"
          onClick={() => void regenerate({ force: true })}
          disabled={regenerating}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {regenerating
            ? t('agents.workbench.icp.generating', 'Synthesizing…')
            : t('agents.workbench.icp.generateFromJD', 'Generate from job description')}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Header strip */}
        <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white px-5 py-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              {t('agents.workbench.icp.title', 'Ideal Candidate Profile')}
              <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {t('agents.workbench.icp.version', 'v{{n}}', { n: profile.version })}
              </span>
            </h3>
            <p className="text-[11px] text-slate-500">
              {t('agents.workbench.icp.subtitle', 'Learned from {{likes}} likes · {{dislikes}} dislikes', {
                likes: profile.generatedFromLikes,
                dislikes: profile.generatedFromDislikes,
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="text-[11px] font-medium text-violet-700 hover:text-violet-800"
          >
            {t('agents.workbench.icp.history', 'History')}
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Confidence bar */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {t('agents.workbench.icp.confidence', 'Confidence')}
              </span>
              <span className="text-[11px] font-semibold text-slate-900">{confidencePct}%</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-600 transition-all"
                style={{ width: `${confidencePct}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-slate-500">
              {t(`agents.workbench.icp.confidence${confidenceBucket[0].toUpperCase() + confidenceBucket.slice(1)}`, '')}
            </p>
          </div>

          {/* Narrative summary */}
          {profile.narrativeSummary && (
            <div className="rounded-xl bg-slate-900 px-4 py-3 text-sm leading-relaxed text-slate-100">
              <span className="mr-2">✨</span>
              {profile.narrativeSummary}
            </div>
          )}

          {/* Core skills */}
          {idealProfile.coreSkills.length > 0 && (
            <div>
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {t('agents.workbench.icp.coreSkills', 'Core skills')}
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {idealProfile.coreSkills.map((s) => {
                  const color =
                    s.importance === 'critical'
                      ? 'border-violet-400 bg-violet-100 text-violet-800'
                      : s.importance === 'high'
                      ? 'border-violet-300 bg-violet-50 text-violet-700'
                      : 'border-slate-300 bg-slate-50 text-slate-600';
                  return (
                    <span
                      key={s.skill}
                      title={s.rationale}
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${color}`}
                    >
                      {s.skill}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bonus skills */}
          {!compact && idealProfile.bonusSkills.length > 0 && (
            <div>
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {t('agents.workbench.icp.bonusSkills', 'Bonus skills')}
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {idealProfile.bonusSkills.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Anti-traits / red flags */}
          {idealProfile.antiSkills.length > 0 && (
            <div>
              <h4 className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                {t('agents.workbench.icp.antiTraits', 'Anti-traits / red flags')}
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {idealProfile.antiSkills.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700"
                  >
                    ✕ {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Anchor candidates */}
          {!compact && idealProfile.anchorCandidateIds.length > 0 && (
            <div>
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {t('agents.workbench.icp.anchors', 'Anchor candidates')}
              </h4>
              <p className="text-[11px] text-slate-500">
                {t('agents.workbench.icp.anchorsCount', '{{count}} liked candidates used as ground-truth exemplars', {
                  count: idealProfile.anchorCandidateIds.length,
                })}
              </p>
            </div>
          )}

          {/* Suggested hard requirements */}
          {!compact && profile.suggestedHardRequirements && profile.suggestedHardRequirements.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">
                {t('agents.workbench.icp.suggested', 'Suggested hard requirements')}
              </h4>
              <div className="space-y-1.5">
                {profile.suggestedHardRequirements.map((sugg) => (
                  <div
                    key={sugg.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-amber-100 bg-white px-2.5 py-1.5"
                  >
                    <span className="truncate text-[11px] text-slate-700">{sugg.description || sugg.field}</span>
                    <button
                      type="button"
                      onClick={() => void promoteSuggestion(sugg.id)}
                      className="rounded-md border border-amber-400 bg-white px-2 py-0.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-100"
                    >
                      {t('agents.workbench.icp.promote', 'Promote')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action row */}
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={handleRegenerateClick}
              disabled={regenerating}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {regenerating
                ? t('agents.workbench.icp.generating', 'Synthesizing…')
                : t('agents.workbench.icp.regenerate', 'Regenerate')}
            </button>
          </div>
        </div>

        {/* History drawer */}
        {historyOpen && (
          <div className="border-t border-slate-100 bg-slate-50 px-5 py-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {t('agents.workbench.icp.history', 'History')}
            </p>
            {history.length === 0 ? (
              <p className="text-xs italic text-slate-500">
                {t('agents.workbench.icp.noHistory', 'No history yet.')}
              </p>
            ) : (
              <ul className="space-y-1">
                {history.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1">
                    <span className="text-xs text-slate-700">
                      v{v.version} · {new Date(v.generatedAt).toLocaleDateString()} ·{' '}
                      {Math.round((v.confidence || 0) * 100)}%
                    </span>
                    {v.version !== profile.version && (
                      <button
                        type="button"
                        onClick={() => void revert(v.version)}
                        className="text-[11px] font-medium text-violet-700 hover:text-violet-800"
                      >
                        {t('agents.workbench.icp.revert', 'Revert')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {regenOpen && (
        <RegenerateProfileModal
          previousProfile={prevVersion}
          regenerating={regenerating}
          onConfirm={async () => {
            const next = await regenerate();
            if (!next) throw new Error('Failed to regenerate ideal profile');
          }}
          onRevert={async () => {
            if (prevVersion) await revert(prevVersion.version);
          }}
          onClose={() => setRegenOpen(false)}
          currentProfile={profile}
        />
      )}
    </>
  );
}
