import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { API_BASE } from '../config';
import axios from '../lib/axios';
import { useAuth } from '../context/AuthContext';
import RecruiterTeamFilter, { RecruiterTeamFilterValue } from './RecruiterTeamFilter';

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
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [fits, setFits] = useState<ResumeJobFit[]>([]);
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [matchProgress, setMatchProgress] = useState<{
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    currentCandidates: string[];
    batchIndex?: number;
    totalBatches?: number;
    jobTitle?: string;
  } | null>(null);
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

  // Resume selection dialog state
  const [showResumeSelect, setShowResumeSelect] = useState(false);
  const [resumeSelectForce, setResumeSelectForce] = useState(false);
  const [allResumes, setAllResumes] = useState<{ id: string; name: string; currentRole: string | null; tags: string[] }[]>([]);
  const [loadingResumes, setLoadingResumes] = useState(false);
  const [resumeSelectedIds, setResumeSelectedIds] = useState<Set<string>>(new Set());
  const [resumeSearch, setResumeSearch] = useState('');
  const [recruiterFilter, setRecruiterFilter] = useState<RecruiterTeamFilterValue>({});

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

  // Fetch resumes with optional recruiter/team filter and search
  const fetchResumesForSelect = useCallback(async (filter: RecruiterTeamFilterValue, search?: string, keepSelection?: boolean) => {
    try {
      setLoadingResumes(true);
      const params: Record<string, string> = { limit: '5000', fields: 'minimal' };
      if (filter.filterUserId) params.filterUserId = filter.filterUserId;
      if (filter.filterTeamId) params.filterTeamId = filter.filterTeamId;
      if (filter.teamView) params.teamView = 'true';
      if (search?.trim()) params.search = search.trim();
      const res = await axios.get('/api/v1/resumes', { params });
      const data = res.data.data || res.data.resumes || [];
      setAllResumes(data);
      if (!keepSelection) {
        setResumeSelectedIds(new Set(data.map((r: { id: string }) => r.id)));
      }
    } catch {
      setAllResumes([]);
    } finally {
      setLoadingResumes(false);
    }
  }, []);

  // Debounced server-side search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const recruiterFilterRef = useRef(recruiterFilter);
  recruiterFilterRef.current = recruiterFilter;

  useEffect(() => {
    if (!showResumeSelect) return;
    clearTimeout(searchTimerRef.current);
    if (!resumeSearch.trim()) {
      // When search is cleared, re-fetch all resumes but keep selection
      fetchResumesForSelect(recruiterFilterRef.current, undefined, true);
      return;
    }
    searchTimerRef.current = setTimeout(() => {
      fetchResumesForSelect(recruiterFilterRef.current, resumeSearch, true);
    }, 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [resumeSearch, showResumeSelect, fetchResumesForSelect]);

  // Open resume selection dialog
  const openResumeSelect = async (force: boolean) => {
    setResumeSelectForce(force);
    setShowResumeSelect(true);
    setResumeSearch('');
    setRecruiterFilter({});
    fetchResumesForSelect({});
  };

  // When recruiter filter changes, re-fetch resumes
  const handleRecruiterFilterChange = (filter: RecruiterTeamFilterValue) => {
    setRecruiterFilter(filter);
    fetchResumesForSelect(filter);
  };

  // Client-side filter for immediate feedback while server search is in-flight
  const filteredResumesForSelect = useMemo(() => {
    if (!resumeSearch.trim()) return allResumes;
    const q = resumeSearch.toLowerCase();
    return allResumes.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.currentRole?.toLowerCase().includes(q) ||
        r.tags?.some((tag) => tag.toLowerCase().includes(q))
    );
  }, [allResumes, resumeSearch]);

  const toggleResumeAll = () => {
    const visible = filteredResumesForSelect;
    const allSelected = visible.length > 0 && visible.every((r) => resumeSelectedIds.has(r.id));
    if (allSelected) {
      const visibleIds = new Set(visible.map((r) => r.id));
      setResumeSelectedIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setResumeSelectedIds((prev) => {
        const next = new Set(prev);
        visible.forEach((r) => next.add(r.id));
        return next;
      });
    }
  };

  const confirmResumeSelect = () => {
    setShowResumeSelect(false);
    handleAutoMatch(resumeSelectForce, Array.from(resumeSelectedIds));
  };

  const handleAutoMatch = async (force = false, resumeIds?: string[]) => {
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
          body: JSON.stringify({ force, ...(resumeIds && resumeIds.length > 0 && { resumeIds }) }),
        }
      );

      const contentType = response.headers.get('content-type') || '';

      // Handle SSE streaming response
      if (contentType.includes('text/event-stream') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentEvent = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ') && currentEvent) {
              try {
                const eventData = JSON.parse(line.slice(6));
                if (currentEvent === 'progress') {
                  setMatchProgress({
                    total: eventData.total,
                    completed: eventData.completed,
                    failed: eventData.failed,
                    skipped: eventData.skipped,
                    currentCandidates: eventData.currentCandidates || [],
                    batchIndex: eventData.batchIndex,
                    totalBatches: eventData.totalBatches,
                    jobTitle: eventData.jobTitle,
                  });
                } else if (currentEvent === 'complete') {
                  if (eventData.success) {
                    setSuccessMsg(
                      t('dashboard.autoMatch.progressComplete', { matched: eventData.data.matched })
                    );
                  }
                } else if (currentEvent === 'error') {
                  setError(eventData.error || t('dashboard.autoMatch.matchError'));
                }
              } catch {
                // ignore malformed SSE data
              }
              currentEvent = '';
            }
          }
        }

        await fetchFits();
      } else {
        // Fallback: non-streaming JSON response
        const data = await response.json();
        if (data.success) {
          setMatchProgress({
            total: data.data.total,
            completed: data.data.matched,
            failed: data.data.failed || 0,
            skipped: data.data.skipped || 0,
            currentCandidates: [],
          });
          setSuccessMsg(
            t('dashboard.autoMatch.progressComplete', { matched: data.data.matched })
          );
          await fetchFits();
        } else {
          setError(data.error || t('dashboard.autoMatch.matchError'));
        }
      }
    } catch {
      setError(t('dashboard.autoMatch.matchError'));
    } finally {
      setMatching(false);
      setMatchProgress(null);
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
              onClick={() => openResumeSelect(true)}
              disabled={matching}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
            >
              {t('dashboard.autoMatch.reMatchAll')}
            </button>
          )}
          <button
            onClick={() => openResumeSelect(false)}
            disabled={matching}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {matching ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {matchProgress
                  ? t('dashboard.autoMatch.buttonMatchingProgress', {
                      completed: matchProgress.completed + matchProgress.failed,
                      total: matchProgress.total,
                    })
                  : t('dashboard.autoMatch.buttonMatching')
                }
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

      {/* Matching Progress Panel */}
      {matching && matchProgress && (
        <div className="mx-6 mt-4 p-4 bg-indigo-50 rounded-xl border border-indigo-200">
          <div className="flex items-center gap-3 mb-3">
            <svg className="w-5 h-5 animate-spin text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-indigo-900">
                {t('dashboard.autoMatch.progressTitle', {
                  jobTitle: matchProgress.jobTitle || hiringRequest.title,
                })}
              </p>
              <p className="text-xs text-indigo-600 mt-0.5">
                {t('dashboard.autoMatch.progressStats', {
                  completed: matchProgress.completed,
                  failed: matchProgress.failed,
                  total: matchProgress.total,
                })}
                {matchProgress.skipped > 0 && (
                  <>
                    {' · '}
                    {t('dashboard.autoMatch.progressSkipped', { skipped: matchProgress.skipped })}
                  </>
                )}
                {matchProgress.batchIndex && matchProgress.totalBatches && (
                  <>
                    {' · '}
                    {t('dashboard.autoMatch.progressBatch', {
                      batch: matchProgress.batchIndex,
                      totalBatches: matchProgress.totalBatches,
                    })}
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-indigo-200 rounded-full h-2 mb-3">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
              style={{
                width: `${matchProgress.total > 0 ? ((matchProgress.completed + matchProgress.failed) / matchProgress.total) * 100 : 0}%`,
              }}
            />
          </div>

          {/* Current candidates being matched */}
          {matchProgress.currentCandidates.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-indigo-500 shrink-0">
                {t('dashboard.autoMatch.progressCurrent', 'Matching:')}
              </span>
              {matchProgress.currentCandidates.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white text-xs font-medium text-indigo-700 border border-indigo-200 animate-pulse"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                  {name}
                </span>
              ))}
            </div>
          )}
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

      {/* Resume Selection Dialog */}
      {showResumeSelect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col mx-4">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {t('dashboard.autoMatch.selectResumesTitle', 'Select Resumes to Match')}
                </h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  {hiringRequest.title}
                </p>
              </div>
              <button
                onClick={() => setShowResumeSelect(false)}
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {/* Recruiter filter (admin only) + Search + Select All */}
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">{t('dashboard.autoMatch.filterByRecruiter', 'Recruiter:')}</span>
                  <RecruiterTeamFilter value={recruiterFilter} onChange={handleRecruiterFilterChange} />
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={resumeSearch}
                  onChange={(e) => setResumeSearch(e.target.value)}
                  placeholder={t('dashboard.autoMatch.searchResumesPlaceholder', 'Search by name, role, or tag...')}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  onClick={toggleResumeAll}
                  className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  {filteredResumesForSelect.length > 0 && filteredResumesForSelect.every((r) => resumeSelectedIds.has(r.id))
                    ? t('dashboard.autoMatch.deselectAll')
                    : t('dashboard.autoMatch.selectAll')}
                </button>
              </div>

              <div className="text-xs text-slate-500">
                {resumeSearch.trim()
                  ? t('dashboard.autoMatch.resumeSelectedFiltered', '{{selected}} of {{filtered}} filtered resumes selected ({{total}} total)', {
                      selected: filteredResumesForSelect.filter((r) => resumeSelectedIds.has(r.id)).length,
                      filtered: filteredResumesForSelect.length,
                      total: resumeSelectedIds.size,
                    })
                  : t('dashboard.autoMatch.resumeSelectedCount', '{{count}} resumes selected', { count: resumeSelectedIds.size })}
              </div>

              {/* Resume List */}
              {loadingResumes ? (
                <div className="flex justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-indigo-600" />
                </div>
              ) : allResumes.length === 0 ? (
                <div className="text-center py-8 text-sm text-slate-500">
                  {t('dashboard.autoMatch.noResumesToMatch', 'No resumes found. Upload resumes first in Talent Hub.')}
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg max-h-[480px] overflow-y-auto divide-y divide-slate-100">
                  {filteredResumesForSelect.map((resume) => (
                    <label
                      key={resume.id}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={resumeSelectedIds.has(resume.id)}
                        onChange={() => {
                          setResumeSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(resume.id)) next.delete(resume.id);
                            else next.add(resume.id);
                            return next;
                          });
                        }}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-900 truncate">{resume.name}</span>
                          {resume.currentRole && (
                            <span className="text-xs text-slate-500 truncate">{resume.currentRole}</span>
                          )}
                        </div>
                        {resume.tags && resume.tags.length > 0 && (
                          <div className="flex gap-1 mt-0.5 flex-wrap">
                            {resume.tags.slice(0, 4).map((tag) => (
                              <span key={tag} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
              <button
                onClick={() => setShowResumeSelect(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={confirmResumeSelect}
                disabled={resumeSelectedIds.size === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {t('dashboard.autoMatch.startMatchingCount', 'Start Matching ({{count}} resumes)', { count: resumeSelectedIds.size })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
