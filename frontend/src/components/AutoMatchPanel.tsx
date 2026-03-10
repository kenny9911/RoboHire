import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { API_BASE } from '../config';

interface ResumeJobFit {
  id: string;
  resumeId: string;
  fitScore: number | null;
  fitGrade: string | null;
  fitData: {
    verdict?: string;
    matchedSkills?: string[];
    missingCriticalSkills?: string[];
    experienceAlignment?: string;
    topReasons?: string[];
    recommendation?: string;
    hardRequirementGaps?: Array<{ requirement: string; severity: string; candidateStatus: string }>;
    transferableSkills?: Array<{ required: string; candidateHas: string; relevance: string }>;
  } | null;
  pipelineStatus: string;
  createdAt: string;
  updatedAt: string;
  resume: {
    id: string;
    name: string;
    email: string | null;
    currentRole: string | null;
    experienceYears: string | null;
    tags: string[];
  };
}

interface HiringRequestForPanel {
  id: string;
  title: string;
  requirements: string;
  jobDescription?: string;
  status: string;
}

interface AutoMatchPanelProps {
  hiringRequest: HiringRequestForPanel;
  onCandidatesUpdated?: () => void;
}

const STATUS_TABS = ['all', 'matched', 'shortlisted', 'rejected', 'invited'] as const;
type StatusTab = typeof STATUS_TABS[number];

function getScoreColor(score: number | null): string {
  if (score === null) return 'text-gray-400';
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-500';
}

function getScoreBg(score: number | null): string {
  if (score === null) return 'bg-gray-100';
  if (score >= 80) return 'bg-emerald-50';
  if (score >= 60) return 'bg-amber-50';
  return 'bg-red-50';
}

function getVerdictColor(verdict: string | undefined): string {
  if (!verdict) return 'bg-gray-100 text-gray-600';
  if (verdict.includes('Strong')) return 'bg-emerald-100 text-emerald-700';
  if (verdict.includes('Good')) return 'bg-blue-100 text-blue-700';
  if (verdict.includes('Moderate')) return 'bg-amber-100 text-amber-700';
  if (verdict.includes('Weak')) return 'bg-orange-100 text-orange-700';
  return 'bg-red-100 text-red-700';
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'shortlisted': return 'bg-blue-100 text-blue-700';
    case 'invited': return 'bg-emerald-100 text-emerald-700';
    case 'rejected': return 'bg-red-100 text-red-700';
    default: return 'bg-gray-100 text-gray-600';
  }
}

function getSeverityColor(severity: string): string {
  if (severity === 'dealbreaker') return 'border-red-400 bg-red-50';
  if (severity === 'significant') return 'border-orange-400 bg-orange-50';
  return 'border-yellow-400 bg-yellow-50';
}

export default function AutoMatchPanel({ hiringRequest, onCandidatesUpdated }: AutoMatchPanelProps) {
  const { t } = useTranslation();
  const [fits, setFits] = useState<ResumeJobFit[]>([]);
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [, setMatchProgress] = useState<{ total: number; matched: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [recruiterEmail, setRecruiterEmail] = useState('');
  const [interviewerReq, setInterviewerReq] = useState('');

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const token = localStorage.getItem('auth_token');
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  }, []);

  const fetchFits = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${API_BASE}/api/v1/hiring-requests/${hiringRequest.id}/resume-fits`,
        { headers: getAuthHeaders(), credentials: 'include' }
      );
      const data = await response.json();
      if (data.success) {
        setFits(data.data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [hiringRequest.id, getAuthHeaders]);

  useEffect(() => {
    fetchFits();
  }, [fetchFits]);

  const handleAutoMatch = async (force = false) => {
    try {
      setMatching(true);
      setError(null);
      setSuccessMsg(null);
      setMatchProgress(null);

      const response = await fetch(
        `${API_BASE}/api/v1/hiring-requests/${hiringRequest.id}/auto-match`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          credentials: 'include',
          body: JSON.stringify({ force }),
        }
      );
      const data = await response.json();
      if (data.success) {
        setMatchProgress({ total: data.data.total, matched: data.data.matched });
        setSuccessMsg(
          t('dashboard.autoMatch.progressComplete', { matched: data.data.matched })
        );
        await fetchFits();
      } else {
        setError(data.error || t('dashboard.autoMatch.matchError'));
      }
    } catch {
      setError(t('dashboard.autoMatch.matchError'));
    } finally {
      setMatching(false);
    }
  };

  const handleUpdateStatus = async (fitId: string, pipelineStatus: string) => {
    try {
      const response = await fetch(
        `${API_BASE}/api/v1/hiring-requests/${hiringRequest.id}/resume-fits/${fitId}`,
        {
          method: 'PATCH',
          headers: getAuthHeaders(),
          credentials: 'include',
          body: JSON.stringify({ pipelineStatus }),
        }
      );
      const data = await response.json();
      if (data.success) {
        setFits(prev => prev.map(f => f.id === fitId ? { ...f, pipelineStatus } : f));
      } else {
        setError(data.error || t('dashboard.autoMatch.updateError'));
      }
    } catch {
      setError(t('dashboard.autoMatch.updateError'));
    }
  };

  const handleBulkStatus = async (status: string) => {
    const promises = Array.from(selectedIds).map(fitId =>
      handleUpdateStatus(fitId, status)
    );
    await Promise.all(promises);
    setSelectedIds(new Set());
  };

  const handleInvite = async () => {
    try {
      setInviting(true);
      setError(null);
      const resumeIds = Array.from(selectedIds)
        .map(fitId => fits.find(f => f.id === fitId)?.resumeId)
        .filter(Boolean) as string[];

      const response = await fetch(
        `${API_BASE}/api/v1/hiring-requests/${hiringRequest.id}/batch-invite-from-library`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          credentials: 'include',
          body: JSON.stringify({
            resumeIds,
            recruiter_email: recruiterEmail || undefined,
            interviewer_requirement: interviewerReq || undefined,
          }),
        }
      );
      const data = await response.json();
      if (data.success) {
        if (data.data.failed > 0) {
          setSuccessMsg(
            t('dashboard.autoMatch.invitePartial', {
              sent: data.data.sent,
              total: data.data.total,
              failed: data.data.failed,
            })
          );
        } else {
          setSuccessMsg(t('dashboard.autoMatch.inviteSuccess', { count: data.data.sent }));
        }
        setShowInviteModal(false);
        setSelectedIds(new Set());
        await fetchFits();
        onCandidatesUpdated?.();
      } else {
        setError(data.error || t('dashboard.autoMatch.inviteError'));
      }
    } catch {
      setError(t('dashboard.autoMatch.inviteError'));
    } finally {
      setInviting(false);
    }
  };

  // Filtering
  const filteredFits = useMemo(() => {
    let result = fits;
    if (statusTab !== 'all') {
      result = result.filter(f => f.pipelineStatus === statusTab);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(f =>
        f.resume.name.toLowerCase().includes(q) ||
        (f.resume.currentRole || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [fits, statusTab, searchQuery]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: fits.length };
    for (const f of fits) {
      counts[f.pipelineStatus] = (counts[f.pipelineStatus] || 0) + 1;
    }
    return counts;
  }, [fits]);

  const toggleSelect = (fitId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(fitId)) next.delete(fitId);
      else next.add(fitId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredFits.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredFits.map(f => f.id)));
    }
  };

  return (
    <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900">
            {t('dashboard.autoMatch.title')}
          </h3>
          {fits.length > 0 && (
            <span className="px-2.5 py-0.5 text-xs font-medium bg-indigo-100 text-indigo-700 rounded-full">
              {fits.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {fits.length > 0 && (
            <button
              onClick={() => handleAutoMatch(true)}
              disabled={matching}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
            >
              {t('dashboard.autoMatch.reMatchAll')}
            </button>
          )}
          <button
            onClick={() => handleAutoMatch(false)}
            disabled={matching}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {matching ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t('dashboard.autoMatch.buttonMatching')}
              </>
            ) : (
              t('dashboard.autoMatch.button')
            )}
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">&times;</button>
        </div>
      )}
      {successMsg && (
        <div className="mx-6 mt-4 p-3 bg-emerald-50 text-emerald-700 text-sm rounded-lg border border-emerald-200">
          {successMsg}
          <button onClick={() => setSuccessMsg(null)} className="ml-2 text-emerald-500 hover:text-emerald-700">&times;</button>
        </div>
      )}

      {/* Empty state */}
      {!loading && fits.length === 0 && !matching && (
        <div className="px-6 py-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p className="text-gray-600 font-medium">{t('dashboard.autoMatch.noMatchesYet')}</p>
          <p className="text-gray-400 text-sm mt-1">{t('dashboard.autoMatch.noMatchesDesc')}</p>
        </div>
      )}

      {/* Loading */}
      {loading && fits.length === 0 && (
        <div className="px-6 py-8 text-center text-gray-500 text-sm">
          {t('dashboard.loading')}
        </div>
      )}

      {/* Results */}
      {fits.length > 0 && (
        <>
          {/* Filter toolbar */}
          <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
            {/* Status tabs */}
            <div className="flex gap-1">
              {STATUS_TABS.map(tab => (
                <button
                  key={tab}
                  onClick={() => setStatusTab(tab)}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                    statusTab === tab
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {t(`dashboard.autoMatch.filter${tab.charAt(0).toUpperCase() + tab.slice(1)}`)}
                  {statusCounts[tab] !== undefined && (
                    <span className="ml-1 text-xs opacity-60">({statusCounts[tab] || 0})</span>
                  )}
                </button>
              ))}
            </div>
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t('dashboard.autoMatch.search')}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Select all bar */}
          <div className="px-6 py-2 border-b border-gray-50 flex items-center gap-3 text-xs text-gray-500">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.size > 0 && selectedIds.size === filteredFits.length}
                onChange={toggleSelectAll}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              {selectedIds.size > 0
                ? t('dashboard.autoMatch.deselectAll')
                : t('dashboard.autoMatch.selectAll')
              }
            </label>
            {selectedIds.size > 0 && (
              <span className="text-indigo-600 font-medium">
                {t('dashboard.autoMatch.selected', { count: selectedIds.size })}
              </span>
            )}
          </div>

          {/* Results table */}
          <div className="divide-y divide-gray-50">
            {filteredFits.map(fit => {
              const data = fit.fitData;
              const isExpanded = expandedId === fit.id;
              const matchedSkills = data?.matchedSkills || [];
              const missingSkills = data?.missingCriticalSkills || [];

              return (
                <div key={fit.id} className="hover:bg-gray-50/50 transition-colors">
                  {/* Main row */}
                  <div className="px-6 py-3 flex items-center gap-4">
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={selectedIds.has(fit.id)}
                      onChange={() => toggleSelect(fit.id)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
                    />

                    {/* Expand toggle */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : fit.id)}
                      className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                    >
                      <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>

                    {/* Name + Role */}
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/product/talent/${fit.resume.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-indigo-600 transition-colors"
                      >
                        {fit.resume.name}
                      </Link>
                      {fit.resume.currentRole && (
                        <p className="text-xs text-gray-500 truncate">{fit.resume.currentRole}</p>
                      )}
                    </div>

                    {/* Score */}
                    <div className={`flex-shrink-0 w-14 text-center px-2 py-1 rounded-lg ${getScoreBg(fit.fitScore)}`}>
                      <span className={`text-sm font-bold ${getScoreColor(fit.fitScore)}`}>
                        {fit.fitScore ?? '—'}
                      </span>
                    </div>

                    {/* Grade */}
                    <span className="flex-shrink-0 w-10 text-center text-sm font-semibold text-gray-700">
                      {fit.fitGrade || '—'}
                    </span>

                    {/* Verdict */}
                    <span className={`flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded-full ${getVerdictColor(data?.verdict)}`}>
                      {data?.verdict || '—'}
                    </span>

                    {/* Skills preview */}
                    <div className="hidden lg:flex flex-shrink-0 gap-1 max-w-[200px]">
                      {matchedSkills.slice(0, 2).map(skill => (
                        <span key={skill} className="px-1.5 py-0.5 text-[10px] bg-emerald-50 text-emerald-700 rounded">
                          {skill}
                        </span>
                      ))}
                      {matchedSkills.length > 2 && (
                        <span className="px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-500 rounded">
                          {t('dashboard.autoMatch.moreSkills', { count: matchedSkills.length - 2 })}
                        </span>
                      )}
                    </div>

                    {/* Status dropdown */}
                    <select
                      value={fit.pipelineStatus}
                      onChange={e => handleUpdateStatus(fit.id, e.target.value)}
                      className={`flex-shrink-0 px-2 py-1 text-xs font-medium rounded-lg border-0 cursor-pointer ${getStatusColor(fit.pipelineStatus)}`}
                    >
                      <option value="matched">{t('dashboard.autoMatch.statusMatched')}</option>
                      <option value="shortlisted">{t('dashboard.autoMatch.statusShortlisted')}</option>
                      <option value="rejected">{t('dashboard.autoMatch.statusRejected')}</option>
                      <option value="invited">{t('dashboard.autoMatch.statusInvited')}</option>
                    </select>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && data && (
                    <div className="px-6 pb-4 pl-16 space-y-3">
                      {/* Recommendation */}
                      {data.recommendation && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1">{t('dashboard.autoMatch.recommendation')}</p>
                          <p className="text-sm text-gray-700">{data.recommendation}</p>
                        </div>
                      )}

                      {/* Top Reasons */}
                      {data.topReasons && data.topReasons.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1">{t('dashboard.autoMatch.topReasons')}</p>
                          <ul className="text-sm text-gray-700 space-y-0.5">
                            {data.topReasons.map((reason, i) => (
                              <li key={i} className="flex items-start gap-1.5">
                                <span className="text-indigo-400 mt-1.5 flex-shrink-0 w-1 h-1 rounded-full bg-indigo-400" />
                                {reason}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Experience */}
                      {data.experienceAlignment && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1">{t('dashboard.autoMatch.experienceAlignment')}</p>
                          <p className="text-sm text-gray-700">{data.experienceAlignment}</p>
                        </div>
                      )}

                      {/* Skills */}
                      <div className="flex gap-6">
                        {matchedSkills.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-1">{t('dashboard.autoMatch.matchedSkills')}</p>
                            <div className="flex flex-wrap gap-1">
                              {matchedSkills.map(skill => (
                                <span key={skill} className="px-2 py-0.5 text-xs bg-emerald-50 text-emerald-700 rounded">
                                  {skill}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {missingSkills.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-1">{t('dashboard.autoMatch.missingSkills')}</p>
                            <div className="flex flex-wrap gap-1">
                              {missingSkills.map(skill => (
                                <span key={skill} className="px-2 py-0.5 text-xs bg-red-50 text-red-600 rounded">
                                  {skill}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Hard requirement gaps */}
                      {data.hardRequirementGaps && data.hardRequirementGaps.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1">{t('dashboard.autoMatch.hardRequirementGaps')}</p>
                          <div className="space-y-1">
                            {data.hardRequirementGaps.map((gap, i) => (
                              <div key={i} className={`pl-2 border-l-2 py-1 px-2 rounded-r text-xs ${getSeverityColor(gap.severity)}`}>
                                <span className="font-medium">{gap.requirement}</span>
                                <span className="text-gray-500 ml-2">{gap.candidateStatus}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Transferable skills */}
                      {data.transferableSkills && data.transferableSkills.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1">{t('dashboard.autoMatch.transferableSkills')}</p>
                          <div className="space-y-1">
                            {data.transferableSkills.map((ts, i) => (
                              <div key={i} className="text-xs text-gray-700 flex items-center gap-1">
                                <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">{ts.candidateHas}</span>
                                <span className="text-gray-400">&rarr;</span>
                                <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded">{ts.required}</span>
                                <span className="text-gray-400 ml-1">({ts.relevance})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* View resume link */}
                      <Link
                        to={`/product/talent/${fit.resume.id}`}
                        className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        {t('dashboard.autoMatch.viewResume')} &rarr;
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {filteredFits.length === 0 && (
            <div className="px-6 py-8 text-center text-gray-400 text-sm">
              {t('dashboard.autoMatch.noMatchesYet')}
            </div>
          )}
        </>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-0 px-6 py-3 bg-white border-t border-gray-200 flex items-center justify-between shadow-lg rounded-b-xl">
          <span className="text-sm text-gray-600 font-medium">
            {t('dashboard.autoMatch.selected', { count: selectedIds.size })}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBulkStatus('shortlisted')}
              className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            >
              {t('dashboard.autoMatch.shortlistSelected')}
            </button>
            <button
              onClick={() => handleBulkStatus('rejected')}
              className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
            >
              {t('dashboard.autoMatch.rejectSelected')}
            </button>
            <button
              onClick={() => setShowInviteModal(true)}
              className="px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
            >
              {t('dashboard.autoMatch.inviteSelected')}
            </button>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {t('dashboard.autoMatch.inviteModalTitle')}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {t('dashboard.autoMatch.inviteModalDesc')}
            </p>

            <div className="mb-3 p-3 bg-indigo-50 rounded-lg text-sm text-indigo-700">
              {t('dashboard.autoMatch.candidateCount', { count: selectedIds.size })}
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('dashboard.autoMatch.recruiterEmail')}
                </label>
                <input
                  type="email"
                  value={recruiterEmail}
                  onChange={e => setRecruiterEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('dashboard.autoMatch.interviewerRequirement')}
                </label>
                <textarea
                  value={interviewerReq}
                  onChange={e => setInterviewerReq(e.target.value)}
                  rows={3}
                  placeholder={t('dashboard.autoMatch.interviewerRequirementPlaceholder')}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <p className="text-xs text-amber-600 mb-4">
              {t('dashboard.autoMatch.usageNote', { count: selectedIds.size })}
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowInviteModal(false)}
                disabled={inviting}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                {t('dashboard.autoMatch.cancel')}
              </button>
              <button
                onClick={handleInvite}
                disabled={inviting}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {inviting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {t('dashboard.autoMatch.sending')}
                  </>
                ) : (
                  t('dashboard.autoMatch.send')
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
