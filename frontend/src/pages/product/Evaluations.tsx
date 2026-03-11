import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from '../../lib/axios';
import { usePageState } from '../../hooks/usePageState';

interface Interview {
  id: string;
  candidateName: string;
  candidateEmail: string | null;
  jobTitle: string | null;
  status: string;
  completedAt: string | null;
  duration: number | null;
  createdAt: string;
  evaluation: {
    id: string;
    overallScore: number | null;
    grade: string | null;
    verdict: string | null;
    summary: string | null;
    strengths: string[] | null;
    weaknesses: string[] | null;
  } | null;
}

const VERDICT_STYLES: Record<string, { bg: string; text: string }> = {
  strong_hire: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  hire: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  lean_hire: { bg: 'bg-blue-50', text: 'text-blue-600' },
  lean_no_hire: { bg: 'bg-amber-50', text: 'text-amber-600' },
  no_hire: { bg: 'bg-red-50', text: 'text-red-600' },
};

export default function Evaluations() {
  const { t } = useTranslation();
  const [interviews, setInterviews] = usePageState<Interview[]>('evaluations.interviews', []);
  const [loading, setLoading] = useState(interviews.length > 0 ? false : true);
  const [evaluating, setEvaluating] = useState<string | null>(null);
  const [expandedId, setExpandedId] = usePageState<string | null>('evaluations.expandedId', null);

  const fetchInterviews = async () => {
    try {
      const res = await axios.get('/api/v1/interviews', { params: { status: 'completed', limit: 50 } });
      setInterviews(res.data.data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInterviews();
  }, []);

  const handleEvaluate = async (id: string) => {
    try {
      setEvaluating(id);
      await axios.post(`/api/v1/interviews/${id}/evaluate`);
      fetchInterviews();
    } catch {
      // silent
    } finally {
      setEvaluating(null);
    }
  };

  const evaluated = interviews.filter((i) => i.evaluation);
  const pending = interviews.filter((i) => !i.evaluation);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t('product.evaluations.title', 'Evaluations')}</h2>
        <p className="mt-1 text-sm text-slate-500">{t('product.evaluations.subtitle', 'AI-powered multi-agent candidate evaluation reports.')}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
        </div>
      ) : interviews.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-slate-200 bg-white">
          <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <h3 className="text-lg font-semibold text-slate-900">{t('product.evaluations.empty', 'No evaluations yet')}</h3>
          <p className="mt-1 text-sm text-slate-500">{t('product.evaluations.emptyDesc', 'Complete interviews first, then run AI evaluations.')}</p>
          <Link to="/product/interview" className="mt-3 inline-flex text-sm font-semibold text-blue-600 hover:text-blue-700">
            {t('product.evaluations.goToInterviews', 'Go to AI Interview')}
          </Link>
        </div>
      ) : (
        <>
          {/* Pending evaluations */}
          {pending.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">{t('product.evaluations.pendingSection', 'Pending Evaluation')}</h3>
              <div className="space-y-2">
                {pending.map((interview) => (
                  <div key={interview.id} className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100">
                        <span className="text-xs font-bold text-amber-600">{interview.candidateName[0]?.toUpperCase()}</span>
                      </div>
                      <div>
                        <span className="text-sm font-semibold text-slate-900">{interview.candidateName}</span>
                        {interview.jobTitle && <span className="ml-2 text-xs text-slate-500">{interview.jobTitle}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => handleEvaluate(interview.id)}
                      disabled={evaluating === interview.id}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      {evaluating === interview.id ? (
                        <>
                          <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-white" />
                          {t('product.evaluations.evaluating', 'Evaluating...')}
                        </>
                      ) : (
                        t('product.evaluations.runEval', 'Run Evaluation')
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed evaluations */}
          {evaluated.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">{t('product.evaluations.completedSection', 'Completed Evaluations')}</h3>
              <div className="space-y-3">
                {evaluated.map((interview) => {
                  const ev = interview.evaluation!;
                  const verdictStyle = VERDICT_STYLES[ev.verdict || ''] || { bg: 'bg-slate-50', text: 'text-slate-600' };
                  const isExpanded = expandedId === interview.id;

                  return (
                    <div key={interview.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : interview.id)}
                        className="w-full p-5 text-left hover:bg-slate-50/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 shrink-0">
                              <span className="text-sm font-bold text-blue-600">{interview.candidateName[0]?.toUpperCase()}</span>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-slate-900">{interview.candidateName}</span>
                                {ev.grade && (
                                  <span className="text-xs font-bold bg-slate-100 px-2 py-0.5 rounded-full">{ev.grade}</span>
                                )}
                                {ev.verdict && (
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${verdictStyle.bg} ${verdictStyle.text}`}>
                                    {ev.verdict.replace(/_/g, ' ')}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                                {interview.jobTitle && <span>{interview.jobTitle}</span>}
                                {interview.completedAt && <span>{new Date(interview.completedAt).toLocaleDateString()}</span>}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            {ev.overallScore != null && (
                              <div className="text-center">
                                <div className={`text-2xl font-bold ${
                                  ev.overallScore >= 80 ? 'text-emerald-600' :
                                  ev.overallScore >= 60 ? 'text-blue-600' :
                                  ev.overallScore >= 40 ? 'text-amber-600' : 'text-red-600'
                                }`}>
                                  {ev.overallScore}
                                </div>
                                <div className="text-xs text-slate-400">{t('product.matching.score', 'score')}</div>
                              </div>
                            )}
                            <svg className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-slate-100 p-5 space-y-4">
                          {/* Summary */}
                          {ev.summary && (
                            <div>
                              <h4 className="text-xs font-semibold text-slate-600 mb-1">{t('product.evaluations.summary', 'Summary')}</h4>
                              <p className="text-sm text-slate-700">{ev.summary}</p>
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Strengths */}
                            {ev.strengths && Array.isArray(ev.strengths) && ev.strengths.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-emerald-600 mb-1">{t('product.evaluations.strengths', 'Strengths')}</h4>
                                <ul className="space-y-1">
                                  {ev.strengths.map((s: string, i: number) => (
                                    <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                                      <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                      {s}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Weaknesses */}
                            {ev.weaknesses && Array.isArray(ev.weaknesses) && ev.weaknesses.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-red-600 mb-1">{t('product.evaluations.weaknesses', 'Areas for Improvement')}</h4>
                                <ul className="space-y-1">
                                  {ev.weaknesses.map((w: string, i: number) => (
                                    <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                                      <svg className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                      </svg>
                                      {w}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
