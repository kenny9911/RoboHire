import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from '../../lib/axios';
import { API_BASE } from '../../config';
import { usePageState } from '../../hooks/usePageState';
import MatchingSessionHistory from '../../components/MatchingSessionHistory';
import MatchDetailModal from '../../components/MatchDetailModal';

interface Job {
  id: string;
  title: string;
  status: string;
  department?: string;
  location?: string;
  passingScore?: number | null;
}

interface Resume {
  id: string;
  name: string;
  currentRole: string | null;
  experienceYears: string | null;
  tags: string[];
}

interface MatchResult {
  id: string;
  jobId: string;
  resumeId: string;
  score: number | null;
  grade: string | null;
  status: string;
  appliedAt: string | null;
  matchData: any;
  createdAt: string;
  resume: {
    id: string;
    name: string;
    email: string | null;
    currentRole: string | null;
    experienceYears: string | null;
    tags: string[];
  };
}

interface MatchProgress {
  total: number;
  completed: number;
  failed: number;
  currentCandidateName: string | null;
  jobTitle: string;
  jobIndex?: number;
  jobCount?: number;
}

interface PreFilterProgress {
  status: string;
  total: number;
  passed?: number;
  excluded?: number;
  durationMs?: number;
}

interface MatchingCriteriaSnapshot {
  selectedResumeCount: number;
  locations: string[];
  jobTypes: string[];
  freeText: string | null;
  hasPreFilter: boolean;
}

interface SessionCriteriaResume {
  id: string;
  name: string;
  currentRole: string | null;
  experienceYears: string | null;
  tags: string[];
}

interface SelectedMatchingSession {
  id: string;
  title: string | null;
  status: string;
  createdAt: string;
  completedAt: string | null;
  preFilterModel: string | null;
  preFilterResult: any;
  totalResumes: number;
  totalFiltered: number;
  totalMatched: number;
  totalFailed: number;
  avgScore: number | null;
  topGrade: string | null;
  job: {
    id: string;
    title: string;
    description?: string | null;
  };
  criteriaSnapshot?: MatchingCriteriaSnapshot;
  selectedResumes: SessionCriteriaResume[];
}

const GRADE_COLORS: Record<string, string> = {
  'A+': 'bg-emerald-100 text-emerald-700',
  A: 'bg-emerald-100 text-emerald-700',
  'B+': 'bg-blue-100 text-blue-700',
  B: 'bg-blue-100 text-blue-700',
  'C': 'bg-amber-100 text-amber-700',
  D: 'bg-orange-100 text-orange-700',
  F: 'bg-red-100 text-red-700',
};

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-slate-100 text-slate-600',
  reviewed: 'bg-blue-100 text-blue-700',
  shortlisted: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  applied: 'bg-indigo-100 text-indigo-700',
  invited: 'bg-purple-100 text-purple-700',
};

const JOB_TYPES = ['full-time', 'part-time', 'contract', 'internship'];
const DEFAULT_MATCH_MIN_SCORE = '60';
const DEFAULT_MAX_JOB_MATCHES_PER_RESUME = '3';
const DEFAULT_MAX_RESUME_MATCHES_PER_JOB = '3';

export default function SmartMatching() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [jobs, setJobs] = usePageState<Job[]>('matching.jobs', []);
  const [selectedJobIds, setSelectedJobIds] = usePageState<string[]>('matching.selectedJobIds', []);
  const [matches, setMatches] = usePageState<MatchResult[]>('matching.matches', []);
  const [loadingJobs, setLoadingJobs] = useState(jobs.length > 0 ? false : true);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [running, setRunning] = useState(false);
  const [matchProgress, setMatchProgress] = useState<MatchProgress | null>(null);
  const [preFilterProgress, setPreFilterProgress] = useState<PreFilterProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = usePageState<string>('matching.statusFilter', '');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionRefreshTrigger, setSessionRefreshTrigger] = useState(0);
  const [detailMatch, setDetailMatch] = useState<MatchResult | null>(null);
  const [showAIMatchModal, setShowAIMatchModal] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [showSessionCriteriaModal, setShowSessionCriteriaModal] = useState(false);
  const [selectedSessionMeta, setSelectedSessionMeta] = useState<SelectedMatchingSession | null>(null);
  const [resumeCount, setResumeCount] = useState(0);
  const [savedSessionCount, setSavedSessionCount] = useState(0);
  const [loadingOverviewCounts, setLoadingOverviewCounts] = useState(true);
  const [modalLaunchJobIds, setModalLaunchJobIds] = useState<string[]>([]);
  const wasAIMatchModalOpenRef = useRef(false);

  // AI Match modal state
  const [modalJobIds, setModalJobIds] = useState<Set<string>>(new Set());
  const [modalJobSearch, setModalJobSearch] = useState('');
  const [modalResumes, setModalResumes] = useState<Resume[]>([]);
  const [loadingModalResumes, setLoadingModalResumes] = useState(false);
  const [modalSelectedResumeIds, setModalSelectedResumeIds] = useState<Set<string>>(new Set());
  const [modalResumeSearch, setModalResumeSearch] = useState('');
  const [modalShowFilters, setModalShowFilters] = useState(false);
  const [modalLocations, setModalLocations] = useState('');
  const [modalSelectedJobTypes, setModalSelectedJobTypes] = useState<Set<string>>(new Set());
  const [modalFreeText, setModalFreeText] = useState('');
  const [modalSessionName, setModalSessionName] = useState('');
  const [modalMatchNameEdited, setModalMatchNameEdited] = useState(false);
  const [modalMinScore, setModalMinScore] = useState<string>(DEFAULT_MATCH_MIN_SCORE);
  const [modalMaxJobMatchesPerResume, setModalMaxJobMatchesPerResume] = useState<string>(DEFAULT_MAX_JOB_MATCHES_PER_RESUME);
  const [modalMaxResumeMatchesPerJob, setModalMaxResumeMatchesPerJob] = useState<string>(DEFAULT_MAX_RESUME_MATCHES_PER_JOB);

  const filteredJobs = useMemo(() => {
    if (!modalJobSearch.trim()) return jobs;
    const q = modalJobSearch.toLowerCase();
    return jobs.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.department?.toLowerCase().includes(q) ||
        j.location?.toLowerCase().includes(q)
    );
  }, [jobs, modalJobSearch]);
  const sortedFilteredJobs = useMemo(() => {
    return [...filteredJobs].sort((a, b) => {
      const selectionRank = Number(modalJobIds.has(b.id)) - Number(modalJobIds.has(a.id));
      if (selectionRank !== 0) return selectionRank;
      return a.title.localeCompare(b.title, i18n.language);
    });
  }, [filteredJobs, i18n.language, modalJobIds]);

  const buildAutoMatchName = useCallback((jobIds: Iterable<string>) => {
    const selectedIds = new Set(jobIds);
    const selectedJobs = jobs.filter((job) => selectedIds.has(job.id));

    if (selectedJobs.length === 1) {
      return t('product.matching.autoMatchNameSingle', '{{title}} 匹配', {
        title: selectedJobs[0].title,
      });
    }

    if (selectedJobs.length > 1) {
      const extraCount = selectedJobs.length - 1;
      return t('product.matching.autoMatchNameMulti', '{{title}} 等 {{count}} 个职位匹配', {
        title: selectedJobs[0].title,
        count: extraCount,
      });
    }

    return t('product.matching.autoMatchNameFallback', 'AI 匹配 {{date}}', {
      date: new Intl.DateTimeFormat(i18n.language, {
        month: 'numeric',
        day: 'numeric',
      }).format(new Date()),
    });
  }, [i18n.language, jobs, t]);

  // Modal resume filtering
  const filteredModalResumes = useMemo(() => {
    if (!modalResumeSearch.trim()) return modalResumes;
    const q = modalResumeSearch.toLowerCase();
    return modalResumes.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.currentRole?.toLowerCase().includes(q) ||
        r.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  }, [modalResumes, modalResumeSearch]);

  // When search filter narrows the candidate list, restrict selection to visible resumes only
  useEffect(() => {
    if (!modalResumeSearch.trim()) return; // No filter active — keep full selection
    const visibleIds = new Set(filteredModalResumes.map((r) => r.id));
    setModalSelectedResumeIds((prev) => {
      const next = new Set<string>();
      prev.forEach((id) => { if (visibleIds.has(id)) next.add(id); });
      if (next.size === prev.size) return prev; // no change
      return next;
    });
  }, [filteredModalResumes, modalResumeSearch]);

  const allModalVisibleSelected = filteredModalResumes.length > 0 && filteredModalResumes.every((r) => modalSelectedResumeIds.has(r.id));

  const getJobStatusLabel = useCallback((status: string) => {
    return t(
      `product.matching.jobStatus.${status}`,
      status.replace(/_/g, ' ')
    );
  }, [t]);

  const getAuthHeaders = useCallback((stream = false): Record<string, string> => {
    const token = localStorage.getItem('auth_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (stream) {
      headers.Accept = 'text/event-stream';
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }, []);

  const getCompletionMessage = useCallback((completed: number, failed: number, total: number, filtered?: number) => {
    let msg = '';
    if (failed > 0) {
      msg = t('product.matching.completePartial', 'Matching finished: {{completed}} completed, {{failed}} failed, {{total}} total.', {
        completed,
        failed,
        total,
      });
    } else {
      msg = t('product.matching.completeSuccess', 'Matching finished: {{completed}} of {{total}} resumes completed.', {
        completed,
        total,
      });
    }
    if (filtered && filtered > 0) {
      msg += ' ' + t('product.matching.preFilteredCount', '({{filtered}} pre-filtered out)', { filtered });
    }
    return msg;
  }, [t]);

  const formatRunMatchingError = useCallback((payload?: any, status?: number) => {
    if (payload?.error) return payload.error;
    if (status === 402) {
      return t('product.matching.limitExceeded', 'You have used all available matching credits. Upgrade or top up to continue.');
    }
    return t('product.matching.errorGeneric', 'Matching failed. Please try again.');
  }, [t]);

  // Fetch user's jobs (skip if cached)
  useEffect(() => {
    if (jobs.length > 0) return;
    (async () => {
      try {
        const res = await axios.get('/api/v1/jobs', { params: { limit: 100 } });
        setJobs(res.data.data || []);
      } catch {
        // silent
      } finally {
        setLoadingJobs(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingOverviewCounts(true);
      const [resumesRes, sessionsRes] = await Promise.allSettled([
        axios.get('/api/v1/resumes', { params: { limit: 1 } }),
        axios.get('/api/v1/matching/sessions', { params: { limit: 1 } }),
      ]);

      if (cancelled) return;

      if (resumesRes.status === 'fulfilled') {
        setResumeCount(resumesRes.value.data.meta?.total || resumesRes.value.data.data?.length || 0);
      }

      if (sessionsRes.status === 'fulfilled') {
        setSavedSessionCount(sessionsRes.value.data.meta?.total || sessionsRes.value.data.data?.length || 0);
      }

      setLoadingOverviewCounts(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionRefreshTrigger]);

  // Fetch resumes when AI Match modal opens
  useEffect(() => {
    if (!showAIMatchModal) return;
    (async () => {
      try {
        setLoadingModalResumes(true);
        const res = await axios.get('/api/v1/resumes', { params: { limit: 500 } });
        const data = res.data.data || res.data.resumes || [];
        setModalResumes(data);
        setModalSelectedResumeIds(new Set(data.map((r: Resume) => r.id)));
      } catch {
        setModalResumes([]);
      } finally {
        setLoadingModalResumes(false);
      }
    })();
  }, [showAIMatchModal]);

  // Reset modal state when opening
  useEffect(() => {
    const justOpened = showAIMatchModal && !wasAIMatchModalOpenRef.current;
    wasAIMatchModalOpenRef.current = showAIMatchModal;

    if (!justOpened) return;

    const initialJobIds = modalLaunchJobIds.length > 0 ? modalLaunchJobIds : selectedJobIds;
    setModalJobIds(new Set(initialJobIds));
    setModalJobSearch('');
    setModalResumeSearch('');
    setModalShowFilters(false);
    setModalLocations('');
    setModalSelectedJobTypes(new Set());
    setModalFreeText('');
    setModalMatchNameEdited(false);
    setModalSessionName(buildAutoMatchName(initialJobIds));
    setModalMinScore(DEFAULT_MATCH_MIN_SCORE);
    setModalMaxJobMatchesPerResume(DEFAULT_MAX_JOB_MATCHES_PER_RESUME);
    setModalMaxResumeMatchesPerJob(DEFAULT_MAX_RESUME_MATCHES_PER_JOB);
    setModalLaunchJobIds([]);
  }, [buildAutoMatchName, modalLaunchJobIds, selectedJobIds, showAIMatchModal]);

  useEffect(() => {
    if (!showAIMatchModal || modalMatchNameEdited) return;
    setModalSessionName(buildAutoMatchName(modalJobIds));
  }, [buildAutoMatchName, modalJobIds, modalMatchNameEdited, showAIMatchModal]);

  // Fetch match results for all selected jobs
  const [passingScoreMap, setPassingScoreMap] = useState<Record<string, number>>({});
  const [applyingIds, setApplyingIds] = useState<Set<string>>(new Set());

  const fetchMatches = useCallback(async (jobIds: string[]) => {
    if (jobIds.length === 0) {
      setMatches([]);
      return;
    }
    try {
      setLoadingMatches(true);
      const params: any = { sort: 'score', order: 'desc' };
      if (statusFilter) params.status = statusFilter;
      const results = await Promise.all(
        jobIds.map((jobId) => axios.get(`/api/v1/matching/results/${jobId}`, { params }).catch(() => ({ data: { data: [], meta: {} } })))
      );
      const scoreMap: Record<string, number> = {};
      results.forEach((res) => {
        const meta = res.data.meta;
        if (meta?.jobId && meta?.passingScore != null) {
          scoreMap[meta.jobId] = meta.passingScore;
        }
      });
      setPassingScoreMap((prev) => ({ ...prev, ...scoreMap }));
      const allMatches = results.flatMap((res) => res.data.data || []);
      allMatches.sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0));
      setMatches(allMatches);
    } catch {
      setMatches([]);
    } finally {
      setLoadingMatches(false);
    }
  }, [statusFilter]);

  // Load session-specific matches
  const fetchSessionMatches = useCallback(async (sessionId: string) => {
    try {
      setLoadingMatches(true);
      const res = await axios.get(`/api/v1/matching/sessions/${sessionId}`);
      const session = res.data.data?.session;
      setMatches(res.data.data?.matches || []);
      setSelectedSessionMeta(
        session
          ? {
              ...session,
              selectedResumes: res.data.data?.selectedResumes || [],
            }
          : null
      );
    } catch {
      setMatches([]);
      setSelectedSessionMeta(null);
    } finally {
      setLoadingMatches(false);
    }
  }, []);

  useEffect(() => {
    if (running) return; // Don't fetch while matching is in progress
    if (selectedSessionId) {
      fetchSessionMatches(selectedSessionId);
    } else if (selectedJobIds.length > 0) {
      fetchMatches(selectedJobIds);
    } else {
      setMatches([]);
    }
  }, [selectedJobIds, selectedSessionId, fetchMatches, fetchSessionMatches, running]);

  // Keyboard handler for modals
  useEffect(() => {
    if (!showAIMatchModal && !showHistoryDrawer && !showSessionCriteriaModal) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showAIMatchModal) setShowAIMatchModal(false);
        if (showHistoryDrawer) setShowHistoryDrawer(false);
        if (showSessionCriteriaModal) setShowSessionCriteriaModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAIMatchModal, showHistoryDrawer, showSessionCriteriaModal]);

  const toggleModalJob = useCallback((jobId: string) => {
    setModalJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }, []);

  const toggleModalResume = useCallback((id: string) => {
    setModalSelectedResumeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllModalResumes = useCallback(() => {
    if (allModalVisibleSelected) {
      const visibleIds = new Set(filteredModalResumes.map((r) => r.id));
      setModalSelectedResumeIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setModalSelectedResumeIds((prev) => {
        const next = new Set(prev);
        filteredModalResumes.forEach((r) => next.add(r.id));
        return next;
      });
    }
  }, [filteredModalResumes, allModalVisibleSelected]);

  const toggleModalJobType = useCallback((jt: string) => {
    setModalSelectedJobTypes((prev) => {
      const next = new Set(prev);
      if (next.has(jt)) next.delete(jt);
      else next.add(jt);
      return next;
    });
  }, []);

  // Run AI matching for each selected job sequentially with SSE
  const runMatchingForJob = async (
    jobId: string,
    jobTitle: string,
    jobIndex: number,
    jobCount: number,
    config: {
      resumeIds: string[];
      preFilter?: { locations?: string[]; jobTypes?: string[]; freeText?: string };
      sessionName?: string;
    }
  ) => {
    setPreFilterProgress(null);
    setMatchProgress({
      total: 0,
      completed: 0,
      failed: 0,
      currentCandidateName: null,
      jobTitle,
      jobIndex,
      jobCount,
    });

    const sessionName = jobCount > 1
      ? `${config.sessionName ? config.sessionName + ' — ' : ''}${jobTitle}`
      : config.sessionName;

    const response = await fetch(`${API_BASE}/api/v1/matching/run`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      credentials: 'include',
      body: JSON.stringify({
        jobId,
        resumeIds: config.resumeIds,
        preFilter: config.preFilter,
        sessionName,
        locale: i18n.language,
      }),
    });

    const contentType = response.headers.get('content-type') || '';

    if (!response.ok && !contentType.includes('text/event-stream')) {
      let payload: any = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      throw new Error(formatRunMatchingError(payload, response.status));
    }

    let matchedCount = 0;
    let failedCount = 0;
    let totalCount = 0;
    let filteredCount = 0;

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

              if (currentEvent === 'prefilter') {
                setPreFilterProgress({
                  status: eventData.status,
                  total: eventData.total ?? 0,
                  passed: eventData.passed,
                  excluded: eventData.excluded,
                  durationMs: eventData.durationMs,
                });
              } else if (currentEvent === 'progress') {
                setMatchProgress({
                  total: eventData.total ?? 0,
                  completed: eventData.completed ?? 0,
                  failed: eventData.failed ?? 0,
                  currentCandidateName: eventData.currentCandidateName ?? null,
                  jobTitle: eventData.jobTitle || jobTitle,
                  jobIndex,
                  jobCount,
                });
              } else if (currentEvent === 'complete' && eventData.success) {
                matchedCount = eventData.data?.totalMatched ?? 0;
                failedCount = eventData.data?.totalFailed ?? 0;
                totalCount = eventData.data?.total ?? matchedCount + failedCount;
                filteredCount = eventData.data?.totalFiltered ?? 0;
              } else if (currentEvent === 'error') {
                throw new Error(eventData.error || 'Matching failed');
              }
            } catch (e: any) {
              if (e.message && e.message !== 'Matching failed') throw e;
            }
            currentEvent = '';
          }
        }
      }
    } else {
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(formatRunMatchingError(data, response.status));
      }
      matchedCount = data.data?.totalMatched ?? 0;
      failedCount = data.data?.totalFailed ?? 0;
      totalCount = matchedCount + failedCount;
    }

    return { matched: matchedCount, failed: failedCount, total: totalCount, filtered: filteredCount };
  };

  const handleRunFromModal = async () => {
    const jobIds = Array.from(modalJobIds);
    if (jobIds.length === 0) return;

    // Update selected jobs in page state
    setSelectedJobIds(jobIds);
    setShowAIMatchModal(false);

    const resumeIds = Array.from(modalSelectedResumeIds);
    const hasPreFilter = modalLocations.trim() || modalSelectedJobTypes.size > 0 || modalFreeText.trim();
    const preFilter: any = {};
    if (modalLocations.trim()) {
      preFilter.locations = modalLocations.split(',').map((l: string) => l.trim()).filter(Boolean);
    }
    if (modalSelectedJobTypes.size > 0) {
      preFilter.jobTypes = Array.from(modalSelectedJobTypes);
    }
    if (modalFreeText.trim()) {
      preFilter.freeText = modalFreeText.trim();
    }

    const config = {
      resumeIds,
      preFilter: hasPreFilter ? preFilter : undefined,
      sessionName: modalSessionName.trim() || undefined,
      minScore: modalMinScore ? Number(modalMinScore) : undefined,
      maxJobMatchesPerResume: modalMaxJobMatchesPerResume ? Number(modalMaxJobMatchesPerResume) : undefined,
      maxResumeMatchesPerJob: modalMaxResumeMatchesPerJob ? Number(modalMaxResumeMatchesPerJob) : undefined,
    };

    const matchJobs = jobs.filter((j) => modalJobIds.has(j.id));

    try {
      setRunning(true);
      setError(null);
      setSuccessMessage(null);
      setMatches([]);

      let totalMatched = 0;
      let totalFailed = 0;
      let totalAll = 0;
      let totalFiltered = 0;

      for (let i = 0; i < matchJobs.length; i++) {
        const job = matchJobs[i];
        try {
          const result = await runMatchingForJob(job.id, job.title, i + 1, matchJobs.length, config);
          totalMatched += result.matched;
          totalFailed += result.failed;
          totalAll += result.total;
          totalFiltered += result.filtered;
        } catch (err: any) {
          setError((prev) => (prev ? prev + '\n' : '') + `${job.title}: ${err.message}`);
        }
      }

      setSuccessMessage(getCompletionMessage(totalMatched, totalFailed, totalAll, totalFiltered));

      setSelectedSessionId(null);
      setSelectedSessionMeta(null);
      setShowSessionCriteriaModal(false);
      await fetchMatches(jobIds);
      setSessionRefreshTrigger((prev) => prev + 1);
    } catch {
      setError(t('product.matching.errorGeneric', 'Matching failed. Please try again.'));
    } finally {
      setRunning(false);
      setMatchProgress(null);
      setPreFilterProgress(null);
    }
  };

  // Update match status
  const handleStatusUpdate = async (matchId: string, newStatus: string) => {
    try {
      await axios.patch(`/api/v1/matching/results/${matchId}`, { status: newStatus });
      setMatches((prev) =>
        prev.map((m) => (m.id === matchId ? { ...m, status: newStatus } : m))
      );
    } catch {
      // handle error
    }
  };

  const handleApplyAndInvite = async (match: MatchResult) => {
    setApplyingIds((prev) => new Set(prev).add(match.id));
    setSuccessMessage(null);
    try {
      const res = await axios.post(`/api/v1/matching/results/${match.id}/apply-invite`);
      if (res.data.success) {
        setMatches((prev) =>
          prev.map((m) => (m.id === match.id ? { ...m, status: 'applied', appliedAt: new Date().toISOString() } : m))
        );
        setSuccessMessage(t('product.matching.applyInviteSuccess', 'Applied and interview scheduled successfully.'));
      }
    } catch {
      setError(t('product.matching.applyInviteError', 'Failed to apply and create interview'));
    } finally {
      setApplyingIds((prev) => {
        const next = new Set(prev);
        next.delete(match.id);
        return next;
      });
    }
  };

  const handleSelectSession = useCallback((sessionId: string | null) => {
    setSelectedSessionId(sessionId);
    if (!sessionId) {
      setSelectedSessionMeta(null);
      setShowSessionCriteriaModal(false);
    }
    setShowHistoryDrawer(false);
  }, []);

  const openAIMatchModal = useCallback((jobIds?: string[]) => {
    setModalLaunchJobIds(jobIds && jobIds.length > 0 ? jobIds : []);
    setShowAIMatchModal(true);
  }, []);

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/product');
  }, [navigate]);

  const statuses = ['', 'new', 'reviewed', 'shortlisted', 'applied', 'rejected', 'invited'];
  const processedCount = matchProgress ? matchProgress.completed + matchProgress.failed : 0;
  const progressPercent = matchProgress
    ? matchProgress.total > 0
      ? Math.max(8, (processedCount / matchProgress.total) * 100)
      : 8
    : 0;



  const selectedSessionSummaryItems = useMemo(() => {
    if (!selectedSessionMeta) return [];

    const criteria = selectedSessionMeta.criteriaSnapshot;
    const items = [
      t('product.matching.sessionSummaryResumeCount', '{{count}} resumes selected', {
        count: criteria?.selectedResumeCount ?? selectedSessionMeta.selectedResumes.length ?? 0,
      }),
    ];

    if (criteria?.locations?.length) {
      items.push(
        t('product.matching.sessionSummaryLocations', 'Locations: {{locations}}', {
          locations: criteria.locations.join(', '),
        })
      );
    }

    if (criteria?.jobTypes?.length) {
      items.push(
        t('product.matching.sessionSummaryJobTypes', 'Job types: {{jobTypes}}', {
          jobTypes: criteria.jobTypes.join(', '),
        })
      );
    }

    return items;
  }, [selectedSessionMeta, t]);

  const selectedSessionFreeText = selectedSessionMeta?.criteriaSnapshot?.freeText?.trim() || '';
  const selectedSessionDescription = selectedSessionMeta?.job?.description?.trim() || '';
  const openJobs = useMemo(() => jobs.filter((job) => job.status === 'open'), [jobs]);
  const highlightedJobs = useMemo(() => {
    const source = openJobs.length > 0 ? openJobs : jobs;
    return [...source]
      .sort((a, b) => {
        const statusRank = Number(b.status === 'open') - Number(a.status === 'open');
        if (statusRank !== 0) return statusRank;
        return a.title.localeCompare(b.title, i18n.language);
      })
      .slice(0, 4);
  }, [jobs, openJobs, i18n.language]);
  const showOverview = !running && !selectedSessionId && selectedJobIds.length === 0;
  const overviewLoading = showOverview && (loadingJobs || loadingOverviewCounts);

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
            title={t('common.back', 'Back')}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span>{t('common.back', 'Back')}</span>
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{t('product.matching.title', 'Smart Matching')}</h2>
            <p className="text-sm text-slate-500">{t('product.matching.subtitle', 'AI-powered candidate-job matching with detailed analysis.')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistoryDrawer(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {t('product.matching.history', 'History')}
          </button>
          <button
            onClick={() => openAIMatchModal()}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {running ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                {matchProgress?.total
                  ? t('product.matching.runningProgress', 'Matching {{processed}} / {{total}}', {
                      processed: processedCount,
                      total: matchProgress.total,
                    })
                  : t('product.matching.running', 'Matching...')}
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {t('product.matching.aiMatch', 'AI Match')}
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex items-start justify-between gap-3">
            <p className="whitespace-pre-line">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-400 transition-colors hover:text-red-600"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <div className="flex items-start justify-between gap-3">
            <p>{successMessage}</p>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-400 transition-colors hover:text-emerald-600"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Viewing session banner */}
      {selectedSessionId && (
        <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 via-cyan-50 to-sky-50 px-5 py-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">
                    {t('product.matching.viewingSession', 'Viewing saved session results')}
                  </p>
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {selectedSessionMeta?.title || t('product.matching.untitledSession', 'Untitled Session')}
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-white/80 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  {selectedSessionMeta?.job?.title && (
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 font-semibold text-blue-700">
                      {selectedSessionMeta.job.title}
                    </span>
                  )}
                  {selectedSessionSummaryItems.map((item) => (
                    <span key={item} className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                      {item}
                    </span>
                  ))}
                </div>

                {selectedSessionFreeText && (
                  <p className="mt-3 text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">
                      {t('product.matching.sessionRequirements', 'Requirement summary')}:
                    </span>{' '}
                    {selectedSessionFreeText}
                  </p>
                )}

                {!selectedSessionFreeText && selectedSessionDescription && (
                  <p className="mt-3 line-clamp-2 text-sm text-slate-600">
                    <span className="font-semibold text-slate-900">
                      {t('product.matching.sessionJobDescription', 'Job summary')}:
                    </span>{' '}
                    {selectedSessionDescription}
                  </p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                onClick={() => setShowSessionCriteriaModal(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-3.5 py-2 text-sm font-semibold text-blue-700 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-6m3 6V7m3 10v-4m4 6H5a2 2 0 01-2-2V7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2z" />
                </svg>
                {t('product.matching.viewSelectionsAndCriteria', 'Match Details')}
              </button>
              <button
                onClick={() => handleSelectSession(null)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
                title={t('product.matching.backToCurrent', 'Back to current results')}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {showOverview && (
        <div className="space-y-5">
          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
              <p className="text-xs font-medium text-slate-500">{t('product.matching.overviewOpenRoles', 'Open roles')}</p>
              {overviewLoading ? (
                <div className="mt-2 h-8 w-12 animate-pulse rounded-lg bg-slate-100" />
              ) : (
                <p className="mt-1 text-2xl font-bold text-slate-900">{openJobs.length}</p>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
              <p className="text-xs font-medium text-slate-500">{t('product.matching.overviewTalentPool', 'Talent pool')}</p>
              {overviewLoading ? (
                <div className="mt-2 h-8 w-12 animate-pulse rounded-lg bg-slate-100" />
              ) : (
                <p className="mt-1 text-2xl font-bold text-slate-900">{resumeCount}</p>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
              <p className="text-xs font-medium text-slate-500">{t('product.matching.overviewSavedSessions', 'Saved sessions')}</p>
              {overviewLoading ? (
                <div className="mt-2 h-8 w-12 animate-pulse rounded-lg bg-slate-100" />
              ) : (
                <p className="mt-1 text-2xl font-bold text-slate-900">{savedSessionCount}</p>
              )}
            </div>
          </div>

          {/* Quick Start CTA */}
          {overviewLoading ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-10">
              <div className="animate-pulse">
                <div className="mx-auto h-12 w-12 rounded-full bg-slate-100" />
                <div className="mx-auto mt-4 h-6 w-56 rounded-lg bg-slate-100" />
                <div className="mx-auto mt-3 h-4 w-80 max-w-full rounded bg-slate-100" />
                <div className="mx-auto mt-6 flex justify-center gap-3">
                  <div className="h-10 w-32 rounded-lg bg-slate-100" />
                  <div className="h-10 w-36 rounded-lg bg-slate-100" />
                </div>
              </div>
            </div>
          ) : openJobs.length === 0 || resumeCount === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-slate-900">
                {t('product.matching.getStarted', 'Get started with AI Matching')}
              </h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                {t('product.matching.getStartedDesc', 'Create a job and upload candidate resumes to run your first AI match.')}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <Link
                  to="/product/jobs"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  {t('product.matching.createJobFirst', 'Create a job')}
                </Link>
                <Link
                  to="/product/talent"
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  {t('product.matching.addCandidatesFirst', 'Add candidates')}
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {t('product.matching.readyToMatch', 'Ready to match')}
                  </h3>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {t('product.matching.readyToMatchDesc', 'Select jobs and candidates to start a new AI matching session.')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openAIMatchModal()}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  {t('product.matching.startNewSession', 'AI Matching')}
                </button>
              </div>

              {/* Quick-pick roles */}
              {highlightedJobs.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="mb-2 text-xs font-medium text-slate-400 uppercase tracking-wider">
                    {t('product.matching.quickPick', 'Quick pick a role')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {highlightedJobs.map((job) => (
                      <button
                        key={job.id}
                        onClick={() => openAIMatchModal([job.id])}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                      >
                        <span className="truncate max-w-[200px]">{job.title}</span>
                        <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recent Sessions */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">
                {t('product.matching.recentMatches', 'Recent Matches')}
              </h3>
              <button
                type="button"
                onClick={() => setShowHistoryDrawer(true)}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                {t('product.matching.viewAll', 'View all')}
              </button>
            </div>
            <MatchingSessionHistory
              onSelectSession={handleSelectSession}
              selectedSessionId={selectedSessionId}
              refreshTrigger={sessionRefreshTrigger}
              embedded
              limit={5}
            />
          </div>
        </div>
      )}

      {/* Status filter */}
      {selectedJobIds.length > 0 && !selectedSessionId && (
        <div className="flex gap-2 flex-wrap">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s || t('product.matching.allStatuses', 'All')}
            </button>
          ))}
        </div>
      )}

      {/* Pre-filter progress */}
      {running && preFilterProgress && (
        <div className={`rounded-xl border p-5 ${
          preFilterProgress.status === 'running'
            ? 'border-purple-200 bg-gradient-to-r from-purple-50 via-violet-50 to-fuchsia-50'
            : 'border-purple-200 bg-purple-50'
        }`}>
          {preFilterProgress.status === 'running' ? (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/80 border-t-transparent" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {t('product.matching.preFilterRunning', 'Pre-filtering {{total}} resumes...', { total: preFilterProgress.total })}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {t('product.matching.preFilterRunningDesc', 'AI is screening candidates to find the best matches for this job.')}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-purple-700">
              <svg className="w-5 h-5 text-purple-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {t('product.matching.preFilterComplete', 'Pre-filter complete: {{passed}} passed, {{excluded}} excluded', {
                passed: preFilterProgress.passed ?? 0,
                excluded: preFilterProgress.excluded ?? 0,
              })}
              {preFilterProgress.durationMs && (
                <span className="text-purple-500 ml-1">({(preFilterProgress.durationMs / 1000).toFixed(1)}s)</span>
              )}
            </div>
          )}
        </div>
      )}

      {running && matchProgress && (!preFilterProgress || preFilterProgress.status === 'completed') && (
        <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 via-cyan-50 to-sky-50 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/80 border-t-transparent" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {matchProgress.jobCount && matchProgress.jobCount > 1
                    ? t('product.matching.progressTitleMulti', 'Job {{jobIndex}}/{{jobCount}}: Matching resumes for {{jobTitle}}', {
                        jobIndex: matchProgress.jobIndex,
                        jobCount: matchProgress.jobCount,
                        jobTitle: matchProgress.jobTitle,
                      })
                    : t('product.matching.progressTitle', 'Matching resumes for {{jobTitle}}', {
                        jobTitle: matchProgress.jobTitle,
                      })
                  }
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {t('product.matching.progressStats', '{{processed}} / {{total}} resumes processed', {
                    processed: processedCount,
                    total: matchProgress.total || '...',
                  })}
                  {matchProgress.failed > 0 && (
                    <>
                      {' · '}
                      {t('product.matching.progressFailed', '{{failed}} failed', {
                        failed: matchProgress.failed,
                      })}
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-white/80 bg-white/80 px-4 py-3 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">
                {t('product.matching.progressCurrentLabel', 'Currently matching')}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {matchProgress.currentCandidateName
                  ? t('product.matching.progressCurrent', '{{candidateName}} -> {{jobTitle}}', {
                      candidateName: matchProgress.currentCandidateName,
                      jobTitle: matchProgress.jobTitle,
                    })
                  : t('product.matching.progressPreparing', 'Preparing the next resume...')}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-xs font-medium text-blue-700">
              <span>{t('product.matching.running', 'Matching...')}</span>
              <span>
                {matchProgress.total > 0
                  ? `${processedCount}/${matchProgress.total}`
                  : t('product.matching.progressStarting', 'Starting...')}
              </span>
            </div>
            <div className="h-2 rounded-full bg-blue-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-[width] duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Match Results */}
      {(selectedJobIds.length > 0 || selectedSessionId) && (
        <>
          {loadingMatches ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
            </div>
          ) : matches.length === 0 ? (
            running ? (
              <div className="rounded-xl border border-slate-200 bg-white py-16 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {t('product.matching.running', 'Matching...')}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {t('product.matching.runningEmpty', 'Matching is in progress. Results will appear here automatically.')}
                </p>
              </div>
            ) : (
            <div className="text-center py-16 rounded-xl border border-slate-200 bg-white">
              <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <h3 className="text-lg font-semibold text-slate-900">{t('product.matching.noResults', 'No match results yet')}</h3>
              <p className="mt-1 text-sm text-slate-500">{t('product.matching.noResultsDesc', 'Click "Run AI Matching" to match candidates against this job.')}</p>
            </div>
            )
          ) : (
            <div className="space-y-3">
              {matches.map((match) => (
                <div
                  key={match.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 hover:border-blue-200 transition-colors"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 shrink-0">
                        <span className="text-sm font-bold text-blue-600">
                          {match.resume.name?.[0]?.toUpperCase() || '?'}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            to={`/product/talent/${match.resume.id}`}
                            className="text-sm font-semibold text-slate-900 hover:text-blue-700 transition-colors"
                          >
                            {match.resume.name}
                          </Link>
                          {match.grade && (
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${GRADE_COLORS[match.grade] || 'bg-slate-100 text-slate-600'}`}>
                              {match.grade}
                            </span>
                          )}
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[match.status] || STATUS_COLORS.new}`}>
                            {match.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 flex-wrap">
                          {match.resume.currentRole && <span>{match.resume.currentRole}</span>}
                          {match.resume.experienceYears && <span>{match.resume.experienceYears} {t('product.talent.yearsExp', 'years experience')}</span>}
                          {match.resume.email && <span className="hidden sm:inline">{match.resume.email}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {match.score !== null && (
                        <div className="text-center">
                          <div className={`text-2xl font-bold ${
                            match.score >= 80 ? 'text-emerald-600' :
                            match.score >= 60 ? 'text-blue-600' :
                            match.score >= 40 ? 'text-amber-600' : 'text-red-600'
                          }`}>
                            {match.score}
                          </div>
                          <div className="text-xs text-slate-400">{t('product.matching.score', 'score')}</div>
                        </div>
                      )}

                      {match.matchData?.preferenceAlignment && match.matchData.preferenceAlignment.overallScore < 100 && (
                        <div className="text-center">
                          <div className={`text-lg font-bold ${
                            match.matchData.preferenceAlignment.overallScore >= 80 ? 'text-emerald-600' :
                            match.matchData.preferenceAlignment.overallScore >= 50 ? 'text-amber-600' : 'text-red-500'
                          }`}>
                            {match.matchData.preferenceAlignment.overallScore}
                          </div>
                          <div className="text-[10px] text-slate-400">{t('product.matching.prefScore', 'pref. fit')}</div>
                        </div>
                      )}

                      <div className="flex items-center gap-1">
                        {/* Apply + Invite: only for passing candidates not yet applied */}
                        {match.score != null && match.score >= (passingScoreMap[match.jobId] ?? 60) && match.status !== 'applied' && match.status !== 'invited' && (
                          <>
                            <button
                              onClick={() => handleStatusUpdate(match.id, 'applied')}
                              title={t('product.matching.apply', 'Apply')}
                              className="p-2 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleApplyAndInvite(match)}
                              disabled={applyingIds.has(match.id)}
                              title={t('product.matching.applyAndInvite', 'Apply & Invite Interview')}
                              className="p-2 rounded-lg text-purple-600 hover:bg-purple-50 transition-colors disabled:opacity-50"
                            >
                              {applyingIds.has(match.id) ? (
                                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-purple-600" />
                              ) : (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              )}
                            </button>
                          </>
                        )}
                        {match.status === 'applied' && (
                          <span className="px-2 py-1 text-xs font-semibold text-indigo-600 bg-indigo-50 rounded-lg">
                            {t('product.matching.applied', 'Applied')}
                          </span>
                        )}
                        {match.status !== 'shortlisted' && match.status !== 'applied' && (
                          <button
                            onClick={() => handleStatusUpdate(match.id, 'shortlisted')}
                            title={t('product.matching.shortlist', 'Shortlist')}
                            className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                        )}
                        {match.status !== 'rejected' && match.status !== 'applied' && (
                          <button
                            onClick={() => handleStatusUpdate(match.id, 'rejected')}
                            title={t('product.matching.reject', 'Reject')}
                            className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                        {match.matchData && (
                          <button
                            onClick={() => setDetailMatch(match)}
                            title={t('product.matching.viewDetails', 'View Details')}
                            className="p-2 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                            </svg>
                          </button>
                        )}
                        <Link
                          to={`/product/talent/${match.resume.id}`}
                          title={t('product.matching.viewProfile', 'View Profile')}
                          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </Link>
                      </div>
                    </div>
                  </div>

                  {match.resume.tags && match.resume.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {match.resume.tags.slice(0, 6).map((tag) => (
                        <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {tag}
                        </span>
                      ))}
                      {match.resume.tags.length > 6 && (
                        <span className="text-xs text-slate-400">+{match.resume.tags.length - 6}</span>
                      )}
                    </div>
                  )}

                  {match.matchData?.highlights && Array.isArray(match.matchData.highlights) && match.matchData.highlights.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <p className="text-xs text-slate-500">
                        {match.matchData.highlights.slice(0, 3).join(' · ')}
                      </p>
                    </div>
                  )}

                  {match.matchData?.preferenceAlignment?.warnings?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {match.matchData.preferenceAlignment.warnings.slice(0, 3).map((w: string, i: number) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] text-amber-700">
                          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                          {w}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ============ AI Match Modal ============ */}
      {showAIMatchModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowAIMatchModal(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {t('product.matching.aiMatch', 'AI Match')}
                </h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  {t('product.matching.aiMatchDesc', 'Select jobs and candidates, then configure matching parameters.')}
                </p>
              </div>
              <button
                onClick={() => setShowAIMatchModal(false)}
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Two-Panel Body */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="flex-1 flex divide-x divide-slate-200 overflow-hidden">
                {/* ---- Left Panel: Jobs ---- */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="px-4 pt-4 pb-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-slate-800">
                        {t('product.matching.selectJobs', 'Select Jobs')}
                        {modalJobIds.size > 0 && (
                          <span className="ml-1.5 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                            {modalJobIds.size}
                          </span>
                        )}
                      </h4>
                      {modalJobIds.size > 0 && (
                        <button
                          onClick={() => setModalJobIds(new Set())}
                          className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          {t('product.matching.jobPickerClear', 'Clear all')}
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={modalJobSearch}
                      onChange={(e) => setModalJobSearch(e.target.value)}
                      placeholder={t('product.matching.searchJobs', 'Search jobs...')}
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 pb-3">
                    {loadingJobs ? (
                      <div className="flex justify-center py-10">
                        <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-blue-600" />
                      </div>
                    ) : jobs.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
                        <p className="text-sm text-slate-500">{t('product.matching.noJobs', 'No jobs found. Create a job first.')}</p>
                        <Link
                          to="/product/jobs"
                          className="mt-1 inline-flex text-sm font-semibold text-blue-600 hover:text-blue-700"
                        >
                          {t('product.matching.goToJobs', 'Go to Jobs')}
                        </Link>
                      </div>
                    ) : (
                      <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
                        {sortedFilteredJobs.length === 0 ? (
                          <div className="px-4 py-6 text-center text-sm text-slate-500">
                            {t('product.matching.jobPickerEmptySearch', 'No jobs match your search.')}
                          </div>
                        ) : (
                          sortedFilteredJobs.map((job) => {
                            const selected = modalJobIds.has(job.id);
                            return (
                              <label
                                key={job.id}
                                className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors ${
                                  selected ? 'bg-blue-50' : 'hover:bg-slate-50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleModalJob(job.id)}
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-slate-900 truncate">{job.title}</span>
                                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                      job.status === 'open' ? 'bg-emerald-100 text-emerald-700' :
                                      job.status === 'draft' ? 'bg-slate-100 text-slate-500' :
                                      job.status === 'closed' || job.status === 'filled' ? 'bg-rose-100 text-rose-700' :
                                      'bg-amber-100 text-amber-700'
                                    }`}>
                                      {getJobStatusLabel(job.status)}
                                    </span>
                                  </div>
                                  {(job.department || job.location) && (
                                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                                      {[job.department, job.location].filter(Boolean).join(' · ')}
                                    </p>
                                  )}
                                </div>
                              </label>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* ---- Right Panel: Candidates ---- */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="px-4 pt-4 pb-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-slate-800">
                        {t('product.matching.selectCandidates', 'Select Candidates')}
                        {modalSelectedResumeIds.size > 0 && (
                          <span className="ml-1.5 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                            {modalSelectedResumeIds.size}
                          </span>
                        )}
                      </h4>
                      <button
                        onClick={toggleAllModalResumes}
                        className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {allModalVisibleSelected
                          ? t('product.matching.deselectAll', 'Deselect All')
                          : t('product.matching.selectAll', 'Select All')}
                      </button>
                    </div>
                    <input
                      type="text"
                      value={modalResumeSearch}
                      onChange={(e) => setModalResumeSearch(e.target.value)}
                      placeholder={t('product.matching.searchResumes', 'Search by name, role, or tag...')}
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 pb-3">
                    {loadingModalResumes ? (
                      <div className="flex justify-center py-10">
                        <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-blue-600" />
                      </div>
                    ) : modalResumes.length === 0 ? (
                      <div className="text-center py-10 text-sm text-slate-500">
                        {t('product.matching.noResumesFound', 'No resumes found. Upload resumes first.')}
                      </div>
                    ) : (
                      <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
                        {filteredModalResumes.map((resume) => (
                          <label
                            key={resume.id}
                            className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={modalSelectedResumeIds.has(resume.id)}
                              onChange={() => toggleModalResume(resume.id)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-900 truncate">{resume.name}</span>
                                {resume.currentRole && (
                                  <span className="text-xs text-slate-500 truncate">{resume.currentRole}</span>
                                )}
                              </div>
                              {resume.tags.length > 0 && (
                                <div className="flex gap-1 mt-0.5 flex-wrap">
                                  {resume.tags.slice(0, 3).map((tag) => (
                                    <span key={tag} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            {resume.experienceYears && (
                              <span className="text-xs text-slate-400 shrink-0">{resume.experienceYears}y</span>
                            )}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ---- Configuration Bar ---- */}
              <div className="border-t border-slate-200 px-6 py-3 space-y-3 bg-slate-50/50">
                <div className="flex items-center gap-3">
                  {/* Match Name */}
                  <div className="flex-1">
                    <input
                      type="text"
                      value={modalSessionName}
                      onChange={(e) => {
                        setModalSessionName(e.target.value);
                        setModalMatchNameEdited(true);
                      }}
                      placeholder={t('product.matching.sessionNamePlaceholder', 'Match name')}
                      aria-label={t('product.matching.sessionName', 'Match Name')}
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  {/* Min Score */}
                  <div className="w-28">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={modalMinScore}
                      onChange={(e) => setModalMinScore(e.target.value)}
                      placeholder={t('product.matching.minScore', 'Min Score')}
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  {/* Max Job Matches Per Resume */}
                  <div className="w-36">
                    <input
                      type="number"
                      min={1}
                      value={modalMaxJobMatchesPerResume}
                      onChange={(e) => setModalMaxJobMatchesPerResume(e.target.value)}
                      placeholder={t('product.matching.maxJobMatchesPerResume', 'Max Jobs/Resume')}
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  {/* Max Resume Matches Per Job */}
                  <div className="w-40">
                    <input
                      type="number"
                      min={1}
                      value={modalMaxResumeMatchesPerJob}
                      onChange={(e) => setModalMaxResumeMatchesPerJob(e.target.value)}
                      placeholder={t('product.matching.maxResumeMatchesPerJob', 'Max Resumes/Job')}
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  {/* Advanced filters toggle */}
                  <button
                    onClick={() => setModalShowFilters(!modalShowFilters)}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      modalShowFilters
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-slate-300 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    {t('product.matching.advancedFilters', 'Advanced Pre-Filters (AI)')}
                  </button>
                </div>

                {/* Expandable advanced filters */}
                {modalShowFilters && (
                  <div className="space-y-3 pt-2 border-t border-slate-200">
                    <p className="text-xs text-slate-500">
                      {t('product.matching.advancedFiltersDesc', 'AI will pre-screen resumes before full matching, filtering out clearly irrelevant candidates.')}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          {t('product.matching.filterLocations', 'Preferred Locations')}
                        </label>
                        <input
                          type="text"
                          value={modalLocations}
                          onChange={(e) => setModalLocations(e.target.value)}
                          placeholder={t('product.matching.filterLocationsPlaceholder', 'e.g., San Francisco, Remote, New York')}
                          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          {t('product.matching.filterJobTypes', 'Job Types')}
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {JOB_TYPES.map((jt) => (
                            <button
                              key={jt}
                              onClick={() => toggleModalJobType(jt)}
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                modalSelectedJobTypes.has(jt)
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {t(`product.matching.filterJobType.${jt}`, jt)}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        {t('product.matching.filterFreeText', 'Custom Filter Instructions')}
                      </label>
                      <textarea
                        value={modalFreeText}
                        onChange={(e) => setModalFreeText(e.target.value)}
                        placeholder={t('product.matching.filterFreeTextPlaceholder', 'e.g., Must have 3+ years of Python experience, exclude candidates without a degree')}
                        rows={2}
                        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
              <button
                onClick={() => setShowAIMatchModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleRunFromModal}
                disabled={modalJobIds.size === 0 || modalSelectedResumeIds.size === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {t('product.matching.startMatchingModal', 'Start Matching ({{jobs}} jobs, {{resumes}} resumes)', {
                  jobs: modalJobIds.size,
                  resumes: modalSelectedResumeIds.size,
                })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ History Drawer ============ */}
      {showHistoryDrawer && (
        <div className="fixed inset-0 z-50" onClick={() => setShowHistoryDrawer(false)}>
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/30 transition-opacity" />
          {/* Drawer */}
          <div
            className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl flex flex-col animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: 'slideInRight 0.2s ease-out' }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">
                {t('product.matching.sessionHistory', 'Session History')}
              </h3>
              <button
                onClick={() => setShowHistoryDrawer(false)}
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <MatchingSessionHistory
                onSelectSession={handleSelectSession}
                selectedSessionId={selectedSessionId}
                refreshTrigger={sessionRefreshTrigger}
                embedded
              />
            </div>
          </div>
        </div>
      )}

      {/* ============ Session Criteria Modal ============ */}
      {showSessionCriteriaModal && selectedSessionMeta && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
          onClick={() => setShowSessionCriteriaModal(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">
                  {t('product.matching.savedSessionDetails', 'Saved session details')}
                </p>
                <h3 className="mt-1 text-xl font-bold text-slate-900">
                  {selectedSessionMeta.title || t('product.matching.untitledSession', 'Untitled Session')}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedSessionMeta.job?.title || t('product.matching.noJobLinked', 'No linked job')}
                  {' · '}
                  {new Date(selectedSessionMeta.createdAt).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => setShowSessionCriteriaModal(false)}
                className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid flex-1 gap-6 overflow-y-auto px-6 py-5 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-5">
                <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {t('product.matching.matchRequirements', 'Match requirements')}
                  </p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                        {t('product.matching.targetJob', 'Target job')}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {selectedSessionMeta.job?.title || '-'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                        {t('product.matching.selectedResumesLabel', 'Selected resumes')}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {t('product.matching.selectedCount', '{{count}} selected', {
                          count:
                            selectedSessionMeta.criteriaSnapshot?.selectedResumeCount ??
                            selectedSessionMeta.selectedResumes.length,
                        })}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                        {t('product.matching.filterLocations', 'Preferred Locations')}
                      </p>
                      <p className="mt-2 text-sm text-slate-700">
                        {selectedSessionMeta.criteriaSnapshot?.locations?.length
                          ? selectedSessionMeta.criteriaSnapshot.locations.join(', ')
                          : t('product.matching.noneSpecified', 'Not specified')}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                        {t('product.matching.filterJobTypes', 'Job Types')}
                      </p>
                      <p className="mt-2 text-sm text-slate-700">
                        {selectedSessionMeta.criteriaSnapshot?.jobTypes?.length
                          ? selectedSessionMeta.criteriaSnapshot.jobTypes.join(', ')
                          : t('product.matching.noneSpecified', 'Not specified')}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      {t('product.matching.filterFreeText', 'Custom Filter Instructions')}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {selectedSessionMeta.criteriaSnapshot?.freeText ||
                        t('product.matching.noneSpecified', 'Not specified')}
                    </p>
                  </div>

                  {selectedSessionMeta.job?.description && (
                    <div className="mt-4 rounded-2xl border border-white bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                        {t('product.matching.sessionJobDescription', 'Job summary')}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {selectedSessionMeta.job.description}
                      </p>
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        {t('product.matching.selectedResumesLabel', 'Selected resumes')}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {t('product.matching.selectedCount', '{{count}} selected', {
                          count: selectedSessionMeta.selectedResumes.length,
                        })}
                      </p>
                    </div>
                    {selectedSessionMeta.preFilterResult && (
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                        {t('product.matching.preFilterSummary', 'Pre-filter: {{passed}} passed, {{excluded}} excluded', {
                          passed: selectedSessionMeta.preFilterResult.passedIds?.length ?? 0,
                          excluded: selectedSessionMeta.preFilterResult.excluded?.length ?? 0,
                        })}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 max-h-[320px] space-y-3 overflow-y-auto pr-1">
                    {selectedSessionMeta.selectedResumes.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                        {t('product.matching.noSelectedResumesSaved', 'No selected resumes were saved for this session.')}
                      </div>
                    ) : (
                      selectedSessionMeta.selectedResumes.map((resume) => (
                        <div key={resume.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{resume.name}</p>
                              {resume.currentRole && (
                                <p className="mt-0.5 truncate text-xs text-slate-500">{resume.currentRole}</p>
                              )}
                            </div>
                            {resume.experienceYears && (
                              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm">
                                {resume.experienceYears}y
                              </span>
                            )}
                          </div>
                          {resume.tags.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {resume.tags.slice(0, 6).map((tag) => (
                                <span key={tag} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>

              <div className="space-y-5">
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {t('product.matching.sessionMetrics', 'Session metrics')}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                        {t('product.matching.totalMatchedLabel', 'Matched')}
                      </p>
                      <p className="mt-2 text-lg font-bold text-slate-900">{selectedSessionMeta.totalMatched}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                        {t('product.matching.totalFilteredLabel', 'Filtered')}
                      </p>
                      <p className="mt-2 text-lg font-bold text-slate-900">{selectedSessionMeta.totalFiltered}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                        {t('product.matching.avgScoreShort', 'Avg score')}
                      </p>
                      <p className="mt-2 text-lg font-bold text-slate-900">
                        {selectedSessionMeta.avgScore ?? '-'}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                        {t('product.matching.topGradeShort', 'Top grade')}
                      </p>
                      <p className="mt-2 text-lg font-bold text-slate-900">
                        {selectedSessionMeta.topGrade || '-'}
                      </p>
                    </div>
                  </div>
                </section>

                {selectedSessionMeta.preFilterResult?.excluded?.length > 0 && (
                  <section className="rounded-2xl border border-slate-200 bg-white p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {t('product.matching.prefilterExclusions', 'Pre-filter exclusions')}
                    </p>
                    <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                      {selectedSessionMeta.preFilterResult.excluded.map((item: any, index: number) => (
                        <div key={`${item.resumeId || 'excluded'}-${index}`} className="rounded-2xl bg-rose-50 px-4 py-3">
                          <p className="text-sm font-semibold text-rose-700">{item.resumeName || item.resumeId || t('product.matching.excludedCandidate', 'Excluded candidate')}</p>
                          {item.reason && (
                            <p className="mt-1 text-sm leading-6 text-rose-600">{item.reason}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                onClick={() => setShowSessionCriteriaModal(false)}
                className="inline-flex items-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                {t('common.close', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline CSS for drawer animation */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      {/* Match detail modal */}
      <MatchDetailModal
        open={!!detailMatch}
        onClose={() => setDetailMatch(null)}
        matchData={detailMatch?.matchData}
        candidateName={detailMatch?.resume?.name || ''}
        score={detailMatch?.score ?? null}
        grade={detailMatch?.grade ?? null}
      />
    </div>
  );
}
