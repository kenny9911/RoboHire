import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from '../../lib/axios';
import { usePageState } from '../../hooks/usePageState';
import { formatDateTimeLabel } from '../../utils/dateTime';
import { highlightEvaluationKeywords } from '../../utils/evaluationHighlight';

interface TranscriptTurn {
  role: string;
  content: string;
  timestamp?: string;
  userTime?: number;
}

interface Interview {
  id: string;
  candidateName: string;
  candidateEmail: string | null;
  jobTitle: string | null;
  status: string;
  type: string;
  completedAt: string | null;
  duration: number | null;
  createdAt: string;
  recordingUrl: string | null;
  transcript: TranscriptTurn[] | null;
  metadata: {
    inviteData?: { request_introduction_id?: string };
    request_introduction_id?: string;
    gohireDataFetchedAt?: string;
    resumeDownloadUrl?: string;
  } | null;
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

function TranscriptView({ transcript }: { transcript: TranscriptTurn[] }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
      {transcript.map((turn, i) => {
        const isInterviewer = turn.role === 'interviewer';
        return (
          <div key={i} className={`flex ${isInterviewer ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
              isInterviewer
                ? 'bg-slate-100 text-slate-800'
                : 'bg-blue-50 text-blue-900'
            }`}>
              <div className="text-[10px] font-semibold mb-0.5 opacity-60">
                {isInterviewer
                  ? t('product.evaluations.interviewer', 'Interviewer')
                  : t('product.evaluations.candidate', 'Candidate')}
              </div>
              <p className="whitespace-pre-wrap leading-relaxed">{turn.content}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VideoPlayer({ url }: { url: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  return (
    <div className="rounded-xl overflow-hidden bg-black">
      <video
        ref={videoRef}
        src={url}
        controls
        className="w-full max-h-[400px]"
        preload="metadata"
      />
    </div>
  );
}

export default function Evaluations() {
  const { t } = useTranslation();
  const [interviews, setInterviews] = usePageState<Interview[]>('evaluations.interviews', []);
  const [loading, setLoading] = useState(interviews.length > 0 ? false : true);
  const [evaluating, setEvaluating] = useState<string | null>(null);
  const [fetchingData, setFetchingData] = useState<string | null>(null);
  const [expandedId, setExpandedId] = usePageState<string | null>('evaluations.expandedId', null);
  const [activeTab, setActiveTab] = useState<Record<string, string>>({});

  const fetchInterviews = async () => {
    try {
      const res = await axios.get('/api/v1/interviews', { params: { limit: 50 } });
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

  const handleFetchGohireData = async (id: string) => {
    try {
      setFetchingData(id);
      await axios.post(`/api/v1/interviews/${id}/fetch-gohire-data`);
      await fetchInterviews();
    } catch {
      // silent
    } finally {
      setFetchingData(null);
    }
  };

  const handleEvaluate = async (id: string) => {
    try {
      setEvaluating(id);
      await axios.post(`/api/v1/interviews/${id}/evaluate`);
      await fetchInterviews();
    } catch {
      // silent
    } finally {
      setEvaluating(null);
    }
  };

  const getTab = (id: string) => activeTab[id] || 'video';
  const setTab = (id: string, tab: string) => setActiveTab(prev => ({ ...prev, [id]: tab }));

  const hasGohireId = (interview: Interview) => {
    const meta = interview.metadata;
    return !!(meta?.inviteData?.request_introduction_id || meta?.request_introduction_id);
  };

  // Group interviews: needs data fetch, has data but needs evaluation, evaluated
  const needsDataFetch = interviews.filter(i => hasGohireId(i) && !i.transcript && !i.recordingUrl && i.type === 'ai_video');
  const pendingEvaluation = interviews.filter(i => i.transcript && !i.evaluation);
  const evaluated = interviews.filter(i => i.evaluation);

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
          {/* Needs data fetch from GoHire */}
          {needsDataFetch.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">{t('product.evaluations.needsDataSection', 'Awaiting Interview Data')}</h3>
              <div className="space-y-2">
                {needsDataFetch.map((interview) => (
                  <div key={interview.id} className="flex items-center justify-between rounded-xl border border-purple-200 bg-purple-50/50 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100">
                        <span className="text-xs font-bold text-purple-600">{interview.candidateName[0]?.toUpperCase()}</span>
                      </div>
                      <div>
                        <span className="text-sm font-semibold text-slate-900">{interview.candidateName}</span>
                        {interview.jobTitle && <span className="ml-2 text-xs text-slate-500">{interview.jobTitle}</span>}
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {t('product.evaluations.statusScheduled', 'Interview scheduled')} &middot; {formatDateTimeLabel(interview.createdAt)}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleFetchGohireData(interview.id)}
                      disabled={fetchingData === interview.id}
                      className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 transition-colors disabled:opacity-50"
                    >
                      {fetchingData === interview.id ? (
                        <>
                          <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-white" />
                          {t('product.evaluations.fetchingData', 'Fetching...')}
                        </>
                      ) : (
                        t('product.evaluations.fetchData', 'Fetch Interview Data')
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending evaluations - has transcript but no evaluation */}
          {pendingEvaluation.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">{t('product.evaluations.pendingSection', 'Pending Evaluation')}</h3>
              <div className="space-y-3">
                {pendingEvaluation.map((interview) => {
                  const isExpanded = expandedId === interview.id;
                  return (
                    <div key={interview.id} className="rounded-2xl border border-amber-200 bg-white overflow-hidden">
                      <div className="flex items-center justify-between p-4">
                        <button onClick={() => setExpandedId(isExpanded ? null : interview.id)} className="flex items-center gap-3 text-left">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100">
                            <span className="text-xs font-bold text-amber-600">{interview.candidateName[0]?.toUpperCase()}</span>
                          </div>
                          <div>
                            <span className="text-sm font-semibold text-slate-900">{interview.candidateName}</span>
                            {interview.jobTitle && <span className="ml-2 text-xs text-slate-500">{interview.jobTitle}</span>}
                          </div>
                          <svg className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
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

                      {isExpanded && (
                        <div className="border-t border-amber-100 p-5 space-y-4">
                          {/* Tabs: Video / Transcript */}
                          <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 w-fit">
                            {interview.recordingUrl && (
                              <button
                                onClick={() => setTab(interview.id, 'video')}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                  getTab(interview.id) === 'video' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                }`}
                              >
                                {t('product.evaluations.videoTab', 'Video')}
                              </button>
                            )}
                            {interview.transcript && (
                              <button
                                onClick={() => setTab(interview.id, 'transcript')}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                  getTab(interview.id) === 'transcript' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                }`}
                              >
                                {t('product.evaluations.transcriptTab', 'Transcript')}
                              </button>
                            )}
                          </div>

                          {getTab(interview.id) === 'video' && interview.recordingUrl && (
                            <VideoPlayer url={interview.recordingUrl} />
                          )}

                          {getTab(interview.id) === 'transcript' && interview.transcript && Array.isArray(interview.transcript) && (
                            <TranscriptView transcript={interview.transcript} />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
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
                          {/* Video / Transcript / Evaluation tabs */}
                          <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 w-fit">
                            <button
                              onClick={() => setTab(interview.id, 'evaluation')}
                              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                (getTab(interview.id) === 'evaluation' || (!interview.recordingUrl && !interview.transcript && getTab(interview.id) === 'video'))
                                  ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                              }`}
                            >
                              {t('product.evaluations.evaluationTab', 'Evaluation')}
                            </button>
                            {interview.recordingUrl && (
                              <button
                                onClick={() => setTab(interview.id, 'video')}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                  getTab(interview.id) === 'video' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                }`}
                              >
                                {t('product.evaluations.videoTab', 'Video')}
                              </button>
                            )}
                            {interview.transcript && Array.isArray(interview.transcript) && interview.transcript.length > 0 && (
                              <button
                                onClick={() => setTab(interview.id, 'transcript')}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                  getTab(interview.id) === 'transcript' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                }`}
                              >
                                {t('product.evaluations.transcriptTab', 'Transcript')}
                              </button>
                            )}
                          </div>

                          {/* Video tab */}
                          {getTab(interview.id) === 'video' && interview.recordingUrl && (
                            <VideoPlayer url={interview.recordingUrl} />
                          )}

                          {/* Transcript tab */}
                          {getTab(interview.id) === 'transcript' && interview.transcript && Array.isArray(interview.transcript) && (
                            <TranscriptView transcript={interview.transcript} />
                          )}

                          {/* Evaluation tab (default) */}
                          {(getTab(interview.id) === 'evaluation' || (!interview.recordingUrl && !interview.transcript && getTab(interview.id) === 'video')) && (
                            <>
                              {ev.summary && (
                                <div>
                                  <h4 className="text-xs font-semibold text-slate-600 mb-1">{t('product.evaluations.summary', 'Summary')}</h4>
                                  <p className="text-sm text-slate-700">{ev.summary}</p>
                                </div>
                              )}

                              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                {ev.strengths && Array.isArray(ev.strengths) && ev.strengths.length > 0 && (
                                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-2.5">
                                      <h4 className="text-sm font-semibold text-slate-900">{t('product.evaluations.strengths', 'Strengths')}</h4>
                                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                                        {ev.strengths.length}
                                      </span>
                                    </div>
                                    <ul className="divide-y divide-slate-100">
                                      {ev.strengths.map((s: string, i: number) => (
                                        <li key={i} className="py-2.5 first:pt-0 last:pb-0">
                                          <div className="flex items-start gap-2.5">
                                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                                              {i + 1}
                                            </span>
                                            <p className="text-xs font-normal leading-6 text-slate-800 sm:text-[13px]" dangerouslySetInnerHTML={{ __html: highlightEvaluationKeywords(s, 'green') }} />
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {ev.weaknesses && Array.isArray(ev.weaknesses) && ev.weaknesses.length > 0 && (
                                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-2.5">
                                      <h4 className="text-sm font-semibold text-slate-900">{t('product.evaluations.weaknesses', 'Areas for Improvement')}</h4>
                                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                                        {ev.weaknesses.length}
                                      </span>
                                    </div>
                                    <ul className="divide-y divide-slate-100">
                                      {ev.weaknesses.map((w: string, i: number) => (
                                        <li key={i} className="py-2.5 first:pt-0 last:pb-0">
                                          <div className="flex items-start gap-2.5">
                                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                                              {i + 1}
                                            </span>
                                            <p className="text-xs font-normal leading-6 text-slate-800 sm:text-[13px]" dangerouslySetInnerHTML={{ __html: highlightEvaluationKeywords(w, 'red') }} />
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
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
