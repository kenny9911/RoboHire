import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import RecruiterTeamFilter, { type RecruiterTeamFilterValue } from '../../components/RecruiterTeamFilter';
import axios from '../../lib/axios';
import { usePageState } from '../../hooks/usePageState';
import { formatDateTimeLabel } from '../../utils/dateTime';

interface Interview {
  id: string;
  candidateName: string;
  candidateEmail: string | null;
  jobTitle: string | null;
  status: string;
  type: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  duration: number | null;
  recordingUrl: string | null;
  accessToken: string | null;
  gohireUserId: string | null;
  metadata: {
    inviteData?: {
      user_id?: number | string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  } | null;
  gohireInviteLog?: {
    provider?: string;
    deliveryMode?: string;
    endpoint?: string;
    method?: string;
    generatedAt?: string;
    requestId?: string | null;
    actualCall?: string;
    requestBody?: Record<string, unknown>;
    responseBody?: Record<string, unknown>;
  } | null;
  createdAt: string;
  evaluation: {
    overallScore: number | null;
    grade: string | null;
    verdict: string | null;
  } | null;
}

interface ResumeListItem {
  id: string;
  name: string;
  email: string | null;
  currentRole: string | null;
  experienceYears: string | null;
  tags: string[];
}

interface JobListItem {
  id: string;
  title: string;
  companyName: string | null;
  department: string | null;
  location: string | null;
  description: string | null;
  interviewRequirements: string | null;
  status: string;
}

interface InviteResult {
  resumeId: string;
  resumeName: string;
  status: 'pending' | 'sending' | 'sent' | 'error';
  accessToken?: string;
  data?: {
    login_url?: string;
    qrcode_url?: string;
    name?: string;
    email?: string;
    job_title?: string;
    message?: string;
  };
  error?: string;
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-500',
  expired: 'bg-red-100 text-red-700',
};

const VERDICT_STYLES: Record<string, string> = {
  strong_hire: 'text-emerald-600',
  hire: 'text-emerald-500',
  lean_hire: 'text-blue-600',
  lean_no_hire: 'text-amber-600',
  no_hire: 'text-red-600',
};

const VERDICT_BG: Record<string, string> = {
  strong_hire: 'bg-emerald-50 border-emerald-200',
  hire: 'bg-emerald-50 border-emerald-100',
  lean_hire: 'bg-blue-50 border-blue-100',
  lean_no_hire: 'bg-amber-50 border-amber-100',
  no_hire: 'bg-red-50 border-red-100',
};

export default function AIInterview() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      scheduled: t('product.interview.status.scheduled', 'Scheduled'),
      in_progress: t('product.interview.status.inProgress', 'In Progress'),
      completed: t('product.interview.status.completed', 'Completed'),
      cancelled: t('product.interview.status.cancelled', 'Cancelled'),
      expired: t('product.interview.status.expired', 'Expired'),
    };
    return map[status] || status;
  };

  const verdictLabel = (verdict: string) => {
    const map: Record<string, string> = {
      strong_hire: t('product.interview.verdict.strongHire', 'Strong Hire'),
      hire: t('product.interview.verdict.hire', 'Hire'),
      lean_hire: t('product.interview.verdict.leanHire', 'Lean Hire'),
      lean_no_hire: t('product.interview.verdict.leanNoHire', 'Lean No Hire'),
      no_hire: t('product.interview.verdict.noHire', 'No Hire'),
    };
    return map[verdict] || verdict;
  };

  const [interviews, setInterviews] = usePageState<Interview[]>('interview.list', []);
  const [loading, setLoading] = useState(interviews.length > 0 ? false : true);
  const [statusFilter, setStatusFilter] = usePageState<string>('interview.statusFilter', '');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [evaluatingIds, setEvaluatingIds] = useState<Set<string>>(new Set());

  // Arrange interview state
  const [showArrange, setShowArrange] = useState(false);
  const [arrangeStep, setArrangeStep] = useState(1);
  const [arrangeRecruiterFilter, setArrangeRecruiterFilter] = useState<RecruiterTeamFilterValue>({});
  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [selectedResumeIds, setSelectedResumeIds] = useState<Set<string>>(new Set());
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [interviewReqs, setInterviewReqs] = useState('');
  const [resumeSearch, setResumeSearch] = useState('');
  const [jobSearch, setJobSearch] = useState('');
  const [loadingResumes, setLoadingResumes] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [inviteResults, setInviteResults] = useState<InviteResult[]>([]);
  const [sending, setSending] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [syncingInterviewId, setSyncingInterviewId] = useState<string | null>(null);

  const fetchInterviews = useCallback(async () => {
    try {
      const params: Record<string, string | number> = { limit: 50 };
      if (statusFilter) params.status = statusFilter;
      const res = await axios.get('/api/v1/interviews', { params });
      setInterviews(res.data.data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchInterviews();
  }, [fetchInterviews]);

  const fetchResumes = useCallback(async () => {
    setLoadingResumes(true);
    try {
      const collected: ResumeListItem[] = [];
      const seen = new Set<string>();
      let page = 1;
      let totalPages = 1;

      do {
        const params: Record<string, string | number> = {
          page,
          limit: 50,
          status: 'active',
        };
        if (arrangeRecruiterFilter.filterUserId) params.filterUserId = arrangeRecruiterFilter.filterUserId;
        if (arrangeRecruiterFilter.filterTeamId) params.filterTeamId = arrangeRecruiterFilter.filterTeamId;

        const res = await axios.get('/api/v1/resumes', { params });
        const pageItems: ResumeListItem[] = res.data.data || [];
        pageItems.forEach((item) => {
          if (seen.has(item.id)) return;
          seen.add(item.id);
          collected.push(item);
        });

        totalPages = Math.max(1, Number(res.data.pagination?.totalPages || 1));
        page += 1;
      } while (page <= totalPages);

      setResumes(collected);
    } catch {
      // silent
    } finally {
      setLoadingResumes(false);
    }
  }, [arrangeRecruiterFilter.filterTeamId, arrangeRecruiterFilter.filterUserId]);

  const fetchJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const collected: JobListItem[] = [];
      const seen = new Set<string>();
      let page = 1;
      let totalPages = 1;

      do {
        const params: Record<string, string | number> = {
          page,
          limit: 50,
          status: 'open',
        };
        if (arrangeRecruiterFilter.filterUserId) params.filterUserId = arrangeRecruiterFilter.filterUserId;
        if (arrangeRecruiterFilter.filterTeamId) params.filterTeamId = arrangeRecruiterFilter.filterTeamId;

        const res = await axios.get('/api/v1/jobs', { params });
        const pageItems: JobListItem[] = res.data.data || [];
        pageItems.forEach((item) => {
          if (seen.has(item.id)) return;
          seen.add(item.id);
          collected.push(item);
        });

        totalPages = Math.max(1, Number(res.data.pagination?.totalPages || 1));
        page += 1;
      } while (page <= totalPages);

      setJobs(collected);
    } catch {
      // silent
    } finally {
      setLoadingJobs(false);
    }
  }, [arrangeRecruiterFilter.filterTeamId, arrangeRecruiterFilter.filterUserId]);

  useEffect(() => {
    if (!showArrange) return;
    fetchResumes();
    fetchJobs();
  }, [fetchJobs, fetchResumes, showArrange]);

  const openArrange = () => {
    setShowArrange(true);
    setArrangeStep(1);
    setSelectedResumeIds(new Set());
    setSelectedJobId('');
    setInterviewReqs('');
    setResumeSearch('');
    setJobSearch('');
    setInviteResults([]);
    setSending(false);
  };

  const closeArrange = () => {
    if (sending) return;
    setShowArrange(false);
  };

  const toggleResume = (id: string) => {
    setSelectedResumeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllResumes = () => {
    setSelectedResumeIds(new Set(filteredResumes.map((r) => r.id)));
  };

  const deselectAllResumes = () => {
    setSelectedResumeIds(new Set());
  };

  const selectJob = (id: string) => {
    setSelectedJobId(id);
    const job = jobs.find((j) => j.id === id);
    if (job?.interviewRequirements) {
      setInterviewReqs(job.interviewRequirements);
    }
  };

  const handleArrangeRecruiterFilterChange = (filter: RecruiterTeamFilterValue) => {
    setArrangeRecruiterFilter(filter);
    setArrangeStep(1);
    setSelectedResumeIds(new Set());
    setSelectedJobId('');
    setInterviewReqs('');
    setInviteResults([]);
  };

  const filteredResumes = useMemo(() => {
    if (!resumeSearch.trim()) return resumes;
    const q = resumeSearch.toLowerCase();
    return resumes.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.currentRole?.toLowerCase().includes(q),
    );
  }, [resumes, resumeSearch]);

  const filteredJobs = useMemo(() => {
    if (!jobSearch.trim()) return jobs;
    const q = jobSearch.toLowerCase();
    return jobs.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.companyName?.toLowerCase().includes(q) ||
        j.department?.toLowerCase().includes(q),
    );
  }, [jobs, jobSearch]);

  const selectedJob = jobs.find((j) => j.id === selectedJobId);

  const handleSendInvites = async () => {
    if (selectedResumeIds.size === 0 || !selectedJob) return;
    setSending(true);

    const resumeIds = Array.from(selectedResumeIds);
    const results: InviteResult[] = resumeIds.map((id) => ({
      resumeId: id,
      resumeName: resumes.find((r) => r.id === id)?.name || 'Unknown',
      status: 'pending',
    }));
    setInviteResults([...results]);

    for (let i = 0; i < resumeIds.length; i++) {
      results[i].status = 'sending';
      setInviteResults([...results]);

      try {
        const resumeRes = await axios.get(`/api/v1/resumes/${resumeIds[i]}`);
        const resumeText = resumeRes.data.data?.resumeText;
        if (!resumeText) {
          results[i].status = 'error';
          results[i].error = t('product.interview.noResumeText', 'Resume text not available');
          setInviteResults([...results]);
          continue;
        }

        const inviteRes = await axios.post('/api/v1/invite-candidate', {
          resume: resumeText,
          jd: selectedJob.description || selectedJob.title,
          recruiter_email: user?.email || '',
          interviewer_requirement: interviewReqs || undefined,
        });

        results[i].status = 'sent';
        results[i].data = inviteRes.data.data;
        results[i].accessToken = inviteRes.data.data?.accessToken;
        setInviteResults([...results]);
      } catch (err: any) {
        results[i].status = 'error';
        results[i].error = err?.response?.data?.error || err?.message || 'Failed';
        setInviteResults([...results]);
        if (err?.response?.status === 402) break;
      }
    }

    setSending(false);
    fetchInterviews();
  };

  const handleDelete = (id: string) => {
    setConfirmDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      await axios.delete(`/api/v1/interviews/${confirmDeleteId}`);
      setInterviews((prev) => prev.filter((i) => i.id !== confirmDeleteId));
    } catch {
      // silent
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const handleEvaluate = async (id: string) => {
    setEvaluatingIds((prev) => new Set(prev).add(id));
    try {
      await axios.post(`/api/v1/interviews/${id}/evaluate`);
      fetchInterviews();
    } catch {
      // silent
    } finally {
      setEvaluatingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleBatchEvaluate = async () => {
    const pending = interviews.filter((i) => i.status === 'completed' && !i.evaluation);
    for (const interview of pending) {
      await handleEvaluate(interview.id);
    }
  };

  const handleViewGoHireEvaluation = async (interview: Interview) => {
    const userId = interview.gohireUserId || interview.metadata?.inviteData?.user_id;
    if (!userId) return;

    setSyncingInterviewId(interview.id);
    try {
      // 1. Check for existing GoHireInterview
      const res = await axios.get('/api/v1/gohire-interviews', {
        params: { gohireUserId: String(userId), limit: 1 },
      });
      const matches = res.data.data || [];
      if (matches.length > 0) {
        navigate(`/product/interview-hub/${matches[0].id}`);
        return;
      }

      // 2. No record found — sync from GoHire
      const requestIntroductionId = interview.metadata?.inviteData?.request_introduction_id;
      const syncRes = await axios.post('/api/v1/gohire-interviews/sync-from-invite', {
        gohireUserId: String(userId),
        requestIntroductionId: requestIntroductionId || undefined,
      });

      if (syncRes.data.success && syncRes.data.data?.id) {
        navigate(`/product/interview-hub/${syncRes.data.data.id}`);
      } else {
        alert(t('product.interview.goHireInterviewNotReady', 'Interview not yet completed on GoHire'));
      }
    } catch {
      alert(t('product.interview.goHireSyncFailed', 'Failed to sync interview data'));
    } finally {
      setSyncingInterviewId(null);
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getInviteLink = (accessToken: string) => {
    return `${window.location.origin}/interview-room?token=${accessToken}`;
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const statuses = ['', 'scheduled', 'in_progress', 'completed', 'cancelled'];
  const sentCount = inviteResults.filter((r) => r.status === 'sent').length;
  const errorCount = inviteResults.filter((r) => r.status === 'error').length;

  const interviewsByNewest = useMemo(
    () => [...interviews].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [interviews]
  );

  const statusCounts = useMemo(() => {
    return interviews.reduce<Record<string, number>>((acc, interview) => {
      acc[interview.status] = (acc[interview.status] || 0) + 1;
      return acc;
    }, {});
  }, [interviews]);

  const scheduledCount = statusCounts.scheduled || 0;
  const inProgressCount = statusCounts.in_progress || 0;
  const completedCount = statusCounts.completed || 0;
  const evaluatedCount = interviews.filter((i) => Boolean(i.evaluation)).length;
  const evaluatedCompletedCount = interviews.filter(
    (i) => i.status === 'completed' && Boolean(i.evaluation)
  ).length;
  const pendingEvaluationCount = Math.max(0, completedCount - evaluatedCompletedCount);

  // Verdict distribution for completed+evaluated interviews
  const verdictCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    interviews.forEach((i) => {
      if (i.evaluation?.verdict) {
        counts[i.evaluation.verdict] = (counts[i.evaluation.verdict] || 0) + 1;
      }
    });
    return counts;
  }, [interviews]);

  const avgScore = useMemo(() => {
    const scored = interviews.filter((i) => i.evaluation?.overallScore != null);
    if (scored.length === 0) return null;
    return Math.round(scored.reduce((s, i) => s + (i.evaluation!.overallScore || 0), 0) / scored.length);
  }, [interviews]);

  const avgDuration = useMemo(() => {
    const withDuration = interviews.filter((i) => i.duration && i.duration > 0);
    if (withDuration.length === 0) return null;
    return Math.round(withDuration.reduce((s, i) => s + i.duration!, 0) / withDuration.length);
  }, [interviews]);

  const hireRate = useMemo(() => {
    if (evaluatedCount === 0) return null;
    const hires = interviews.filter((i) =>
      i.evaluation?.verdict && ['strong_hire', 'hire', 'lean_hire'].includes(i.evaluation.verdict)
    ).length;
    return Math.round((hires / evaluatedCount) * 100);
  }, [interviews, evaluatedCount]);

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('product.interview.title', 'AI Interview')}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{t('product.interview.subtitle', 'AI-powered interviews with automatic evaluation.')}</p>
        </div>
        <button
          onClick={openArrange}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('product.interview.arrangeInterview', 'Arrange Interview')}
        </button>
      </div>

      {/* ── Arrange Interview Modal ── */}
      {showArrange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={closeArrange}>
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {t('product.interview.arrangeInterview', 'Arrange Interview')}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t('product.interview.step', 'Step')} {arrangeStep} / 4
                </p>
              </div>
              <button onClick={closeArrange} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {user?.role === 'admin' && (
                <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        {t('product.interview.recruiterScope', 'Recruiter Scope')}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {t('product.interview.recruiterScopeDesc', 'Filter candidate and job options by recruiter or team before arranging interviews.')}
                      </p>
                    </div>
                    <RecruiterTeamFilter
                      value={arrangeRecruiterFilter}
                      onChange={handleArrangeRecruiterFilterChange}
                    />
                  </div>
                </div>
              )}

              {/* Step 1: Select Resumes */}
              {arrangeStep === 1 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-900">
                      {t('product.interview.selectResumes', 'Select Resumes')}
                    </h4>
                    <div className="flex items-center gap-2">
                      <button onClick={selectAllResumes} className="text-xs text-blue-600 hover:text-blue-800">
                        {t('product.interview.selectAll', 'Select All')}
                      </button>
                      <span className="text-slate-300">|</span>
                      <button onClick={deselectAllResumes} className="text-xs text-slate-500 hover:text-slate-700">
                        {t('product.interview.deselectAll', 'Deselect All')}
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={resumeSearch}
                    onChange={(e) => setResumeSearch(e.target.value)}
                    placeholder={t('product.interview.searchResumes', 'Search by name, email, or role...')}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />

                  {loadingResumes ? (
                    <div className="flex justify-center py-8">
                      <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-blue-600" />
                    </div>
                  ) : filteredResumes.length === 0 ? (
                    <div className="text-center py-8 text-sm text-slate-500">
                      {t('product.interview.noResumes', 'No resumes found. Upload resumes in Talent Hub first.')}
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-80 overflow-y-auto">
                      {filteredResumes.map((r) => (
                        <label
                          key={r.id}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                            selectedResumeIds.has(r.id) ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedResumeIds.has(r.id)}
                            onChange={() => toggleResume(r.id)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 shrink-0">
                            <span className="text-xs font-bold text-purple-600">{r.name[0]?.toUpperCase()}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-900 truncate">{r.name}</p>
                            <p className="text-xs text-slate-500 truncate">
                              {[r.currentRole, r.email, r.experienceYears ? `${r.experienceYears} yrs` : null].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          {r.tags.length > 0 && (
                            <div className="flex gap-1 shrink-0">
                              {r.tags.slice(0, 2).map((tag) => (
                                <span key={tag} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{tag}</span>
                              ))}
                            </div>
                          )}
                        </label>
                      ))}
                    </div>
                  )}

                  <div className="text-sm text-slate-600">
                    {t('product.interview.selectedCount', '{{count}} selected', { count: selectedResumeIds.size })}
                  </div>
                </div>
              )}

              {/* Step 2: Select Job */}
              {arrangeStep === 2 && (
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-slate-900">
                    {t('product.interview.selectJob', 'Select Job')}
                  </h4>
                  <input
                    type="text"
                    value={jobSearch}
                    onChange={(e) => setJobSearch(e.target.value)}
                    placeholder={t('product.interview.searchJobs', 'Search by title, company, or department...')}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  {loadingJobs ? (
                    <div className="flex justify-center py-8">
                      <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-blue-600" />
                    </div>
                  ) : filteredJobs.length === 0 ? (
                    <div className="text-center py-8 text-sm text-slate-500">
                      {t('product.interview.noJobs', 'No open jobs found. Create a job first.')}
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-80 overflow-y-auto">
                      {filteredJobs.map((j) => (
                        <label
                          key={j.id}
                          className={`flex items-center gap-3 px-3 py-3 rounded-lg cursor-pointer transition-colors ${
                            selectedJobId === j.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'
                          }`}
                        >
                          <input
                            type="radio"
                            name="job"
                            checked={selectedJobId === j.id}
                            onChange={() => selectJob(j.id)}
                            className="border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-900">{j.title}</p>
                            <p className="text-xs text-slate-500">
                              {[j.companyName, j.department, j.location].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Interview Requirements */}
              {arrangeStep === 3 && (
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-slate-900">
                    {t('product.interview.interviewReqs', 'Interview Requirements')}
                  </h4>
                  <p className="text-xs text-slate-500">
                    {t('product.interview.interviewReqsDesc', 'Specify requirements for the interviewer AI. This will guide the interview focus areas.')}
                  </p>
                  {selectedJob && (
                    <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                      <span className="font-medium text-slate-700">{t('product.interview.selectedJobLabel', 'Job')}: </span>
                      {selectedJob.title}
                      {selectedJob.companyName && ` @ ${selectedJob.companyName}`}
                    </div>
                  )}
                  <textarea
                    value={interviewReqs}
                    onChange={(e) => setInterviewReqs(e.target.value)}
                    rows={6}
                    placeholder={t('product.interview.interviewReqsPlaceholder', 'e.g., Focus on system design and distributed systems experience. Assess problem-solving ability with real-world scenarios. Evaluate cultural fit for a fast-paced startup environment.')}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  {!interviewReqs.trim() && (
                    <button
                      type="button"
                      onClick={() => setInterviewReqs(t('product.interview.interviewReqsPlaceholder', 'e.g., Focus on system design and distributed systems experience. Assess problem-solving ability with real-world scenarios. Evaluate cultural fit for a fast-paced startup environment.').replace(/^(e\.g\.,?\s*|例如[：:]\s*)/i, ''))}
                      className="mt-1.5 text-xs text-blue-500 hover:text-blue-700 transition-colors"
                    >
                      {t('product.interview.useSuggestion', 'Use suggestion')}
                    </button>
                  )}
                </div>
              )}

              {/* Step 4: Confirm & Send */}
              {arrangeStep === 4 && (
                <div className="space-y-4">
                  {inviteResults.length === 0 ? (
                    <>
                      <h4 className="text-sm font-semibold text-slate-900">
                        {t('product.interview.confirmSend', 'Confirm & Send')}
                      </h4>
                      <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                        <div className="px-4 py-3 flex items-center justify-between">
                          <span className="text-sm text-slate-600">{t('product.interview.candidates', 'Candidates')}</span>
                          <span className="text-sm font-semibold text-slate-900">{selectedResumeIds.size}</span>
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between">
                          <span className="text-sm text-slate-600">{t('product.interview.jobLabel', 'Job')}</span>
                          <span className="text-sm font-semibold text-slate-900">{selectedJob?.title || '-'}</span>
                        </div>
                        {interviewReqs && (
                          <div className="px-4 py-3">
                            <span className="text-sm text-slate-600">{t('product.interview.requirements', 'Requirements')}</span>
                            <p className="text-xs text-slate-500 mt-1 line-clamp-3">{interviewReqs}</p>
                          </div>
                        )}
                      </div>
                      <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
                        {t('product.interview.sendNote', 'Interview invitations will be sent to each candidate one by one. Each invite uses 1 interview credit.')}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-slate-900">
                          {sending
                            ? t('product.interview.inviteProgress', 'Sending {{current}}/{{total}}', {
                                current: inviteResults.filter((r) => r.status !== 'pending').length,
                                total: inviteResults.length,
                              })
                            : t('product.interview.inviteComplete', 'Invitations Complete')}
                        </h4>
                        {!sending && (
                          <div className="text-xs text-slate-500">
                            {sentCount > 0 && (
                              <span className="text-emerald-600 font-medium">{sentCount} {t('product.interview.sent', 'sent')}</span>
                            )}
                            {errorCount > 0 && (
                              <span className="text-red-600 font-medium ml-2">{errorCount} {t('product.interview.failed', 'failed')}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="space-y-2 max-h-80 overflow-y-auto">
                        {inviteResults.map((r) => (
                          <div
                            key={r.resumeId}
                            className={`rounded-lg border px-4 py-3 ${
                              r.status === 'sent'
                                ? 'border-emerald-200 bg-emerald-50/50'
                                : r.status === 'error'
                                  ? 'border-red-200 bg-red-50/50'
                                  : r.status === 'sending'
                                    ? 'border-blue-200 bg-blue-50/50'
                                    : 'border-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {r.status === 'sending' && <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-blue-600" />}
                                {r.status === 'sent' && (
                                  <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                                {r.status === 'error' && (
                                  <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                )}
                                {r.status === 'pending' && <div className="h-4 w-4 rounded-full border-2 border-slate-300" />}
                                <span className="text-sm font-medium text-slate-900">{r.resumeName}</span>
                              </div>
                              <span className="text-xs text-slate-500">
                                {r.status === 'sending' && t('product.interview.sending', 'Sending...')}
                                {r.status === 'sent' && t('product.interview.sent', 'Sent')}
                                {r.status === 'error' && t('product.interview.sendError', 'Error')}
                                {r.status === 'pending' && t('product.interview.pending', 'Pending')}
                              </span>
                            </div>
                            {r.status === 'sent' && r.accessToken && (
                              <div className="mt-2 flex items-center gap-3">
                                <a
                                  href={getInviteLink(r.accessToken)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline truncate"
                                >
                                  {t('product.interview.loginUrl', 'Interview Link')}
                                </a>
                                {r.data?.qrcode_url && (
                                  <a href={r.data.qrcode_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                                    {t('product.interview.qrCode', 'QR Code')}
                                  </a>
                                )}
                              </div>
                            )}
                            {r.status === 'error' && r.error && (
                              <p className="mt-1 text-xs text-red-600">{r.error}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200">
              <div>
                {arrangeStep > 1 && arrangeStep < 4 && (
                  <button
                    onClick={() => setArrangeStep(arrangeStep - 1)}
                    className="text-sm text-slate-600 hover:text-slate-800"
                  >
                    {t('product.interview.back', 'Back')}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {(!sending || arrangeStep < 4) && (
                  <button onClick={closeArrange} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
                    {inviteResults.length > 0 && !sending
                      ? t('product.interview.close', 'Close')
                      : t('product.interview.cancel', 'Cancel')}
                  </button>
                )}
                {arrangeStep === 1 && (
                  <button
                    onClick={() => setArrangeStep(2)}
                    disabled={selectedResumeIds.size === 0}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {t('product.interview.next', 'Next')}
                  </button>
                )}
                {arrangeStep === 2 && (
                  <button
                    onClick={() => setArrangeStep(3)}
                    disabled={!selectedJobId}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {t('product.interview.next', 'Next')}
                  </button>
                )}
                {arrangeStep === 3 && (
                  <button
                    onClick={() => setArrangeStep(4)}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
                  >
                    {t('product.interview.next', 'Next')}
                  </button>
                )}
                {arrangeStep === 4 && inviteResults.length === 0 && (
                  <button
                    onClick={handleSendInvites}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    {t('product.interview.sendInvites', 'Send Invites')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Metrics Strip ── */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: t('product.interview.metricTotal', 'Total'), value: interviews.length, accent: 'border-l-slate-400' },
            { label: t('product.interview.status.scheduled', 'Scheduled'), value: scheduledCount, accent: 'border-l-blue-400' },
            { label: t('product.interview.metricLive', 'Live Now'), value: inProgressCount, accent: 'border-l-amber-400', pulse: inProgressCount > 0 },
            { label: t('product.interview.status.completed', 'Completed'), value: completedCount, accent: 'border-l-emerald-400' },
            { label: t('product.interview.metricEvaluated', 'Evaluated'), value: evaluatedCount, accent: 'border-l-indigo-400' },
            {
              label: avgScore != null
                ? t('product.interview.metricAvgScore', 'Avg Score')
                : hireRate != null
                  ? t('product.interview.metricHireRate', 'Hire Rate')
                  : t('product.interview.metricAvgDuration', 'Avg Duration'),
              value: avgScore != null
                ? avgScore
                : hireRate != null
                  ? `${hireRate}%`
                  : avgDuration != null
                    ? formatDuration(avgDuration)
                    : '-',
              accent: 'border-l-purple-400',
            },
          ].map((m) => (
            <div key={m.label} className={`rounded-xl border border-slate-200 bg-white px-4 py-3 border-l-4 ${m.accent}`}>
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{m.label}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xl font-bold text-slate-900">{m.value}</span>
                {'pulse' in m && m.pulse && (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Action Alerts ── */}
      {!loading && pendingEvaluationCount > 0 && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50/70 px-5 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 shrink-0">
              <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-800">
                {t('product.interview.pendingEvalBanner', '{{count}} interview(s) awaiting AI evaluation', { count: pendingEvaluationCount })}
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                {t('product.interview.pendingEvalBannerDesc', 'Run evaluations to get hiring recommendations and scores.')}
              </p>
            </div>
          </div>
          <button
            onClick={handleBatchEvaluate}
            disabled={evaluatingIds.size > 0}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
          >
            {evaluatingIds.size > 0 ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-b-2 border-white" />
                {t('product.interview.evaluating', 'Evaluating...')}
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {t('product.interview.evaluateAll', 'Evaluate All')}
              </>
            )}
          </button>
        </div>
      )}

      {!loading && inProgressCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50/70 px-5 py-3">
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
          </span>
          <p className="text-sm font-medium text-blue-800">
            {t('product.interview.liveBanner', '{{count}} interview(s) currently in progress', { count: inProgressCount })}
          </p>
          <button
            onClick={() => setStatusFilter('in_progress')}
            className="ml-auto text-xs font-semibold text-blue-700 hover:text-blue-900"
          >
            {t('product.interview.todoInProgressAction', 'View live')} →
          </button>
        </div>
      )}

      {/* ── Verdict Distribution (if there are evaluations) ── */}
      {!loading && evaluatedCount > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-800">
              {t('product.interview.verdictDistribution', 'Evaluation Results')}
            </h3>
            <span className="text-xs text-slate-500">
              {t('product.interview.evaluatedOf', '{{evaluated}} of {{total}} evaluated', { evaluated: evaluatedCount, total: interviews.length })}
            </span>
          </div>
          <div className="flex gap-2">
            {(['strong_hire', 'hire', 'lean_hire', 'lean_no_hire', 'no_hire'] as const).map((verdict) => {
              const count = verdictCounts[verdict] || 0;
              return (
                <div
                  key={verdict}
                  className={`flex-1 text-center rounded-lg border py-2.5 px-1 ${count > 0 ? VERDICT_BG[verdict] : 'bg-slate-50 border-slate-100'}`}
                >
                  <p className={`text-lg font-bold ${count > 0 ? VERDICT_STYLES[verdict] : 'text-slate-300'}`}>{count}</p>
                  <p className="text-[10px] font-medium text-slate-500 mt-0.5 leading-tight">{verdictLabel(verdict)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Status Filter Tabs + Interview List ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1.5 bg-slate-100 rounded-lg p-1">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {s ? statusLabel(s) : t('product.interview.allStatuses', 'All')}
              {s && statusCounts[s] ? ` (${statusCounts[s]})` : s === '' ? ` (${interviews.length})` : ''}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-400">
          {t('product.interview.totalCount', '{{count}} total', { count: interviews.length })}
        </span>
      </div>

      {/* ── Interview List ── */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
        </div>
      ) : interviews.length === 0 ? (
        <div className="text-center py-16 rounded-xl border border-dashed border-slate-200 bg-white">
          <svg className="w-12 h-12 mx-auto text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <h3 className="text-base font-semibold text-slate-900">{t('product.interview.empty', 'No interviews yet')}</h3>
          <p className="mt-1 text-sm text-slate-500">{t('product.interview.emptyDesc', 'Schedule an AI interview to get started.')}</p>
          <button
            onClick={openArrange}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('product.interview.arrangeInterview', 'Arrange Interview')}
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
          {interviewsByNewest.map((interview) => {
            const isExpanded = expandedId === interview.id;
            const isEvaluating = evaluatingIds.has(interview.id);
            const showAdminGoHireCall =
              user?.role === 'admin' &&
              Boolean(interview.gohireInviteLog || interview.gohireUserId || interview.metadata?.inviteData?.user_id);

            return (
              <div key={interview.id} className="group">
                {/* Main row */}
                <div
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/50 transition-colors cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : interview.id)}
                >
                  {/* Avatar */}
                  <div className={`flex h-9 w-9 items-center justify-center rounded-full shrink-0 ${
                    interview.evaluation?.verdict && ['strong_hire', 'hire'].includes(interview.evaluation.verdict)
                      ? 'bg-emerald-100'
                      : interview.evaluation?.verdict === 'no_hire'
                        ? 'bg-red-100'
                        : interview.status === 'in_progress'
                          ? 'bg-amber-100'
                          : 'bg-slate-100'
                  }`}>
                    <span className={`text-xs font-bold ${
                      interview.evaluation?.verdict && ['strong_hire', 'hire'].includes(interview.evaluation.verdict)
                        ? 'text-emerald-600'
                        : interview.evaluation?.verdict === 'no_hire'
                          ? 'text-red-600'
                          : interview.status === 'in_progress'
                            ? 'text-amber-600'
                            : 'text-slate-600'
                    }`}>
                      {interview.candidateName[0]?.toUpperCase() || '?'}
                    </span>
                  </div>

                  {/* Name + meta */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">{interview.candidateName}</span>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[interview.status] || STATUS_STYLES.scheduled}`}>
                        {statusLabel(interview.status)}
                      </span>
                      {interview.status === 'in_progress' && (
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                      {interview.jobTitle && <span className="truncate max-w-[180px]">{interview.jobTitle}</span>}
                      {interview.jobTitle && interview.duration && <span className="text-slate-300">·</span>}
                      {interview.duration && interview.duration > 0 && <span>{formatDuration(interview.duration)}</span>}
                      {(interview.duration || interview.jobTitle) && <span className="text-slate-300">·</span>}
                      <span>{formatDateTimeLabel(interview.createdAt)}</span>
                    </div>
                  </div>

                  {/* Verdict + Score */}
                  {interview.evaluation?.verdict && (
                    <div className="text-right shrink-0 hidden sm:block">
                      <span className={`text-xs font-bold ${VERDICT_STYLES[interview.evaluation.verdict] || 'text-slate-600'}`}>
                        {verdictLabel(interview.evaluation.verdict)}
                      </span>
                      {interview.evaluation.overallScore != null && (
                        <div className={`text-lg font-bold leading-none mt-0.5 ${
                          interview.evaluation.overallScore >= 80 ? 'text-emerald-600' :
                          interview.evaluation.overallScore >= 60 ? 'text-blue-600' :
                          interview.evaluation.overallScore >= 40 ? 'text-amber-600' : 'text-red-600'
                        }`}>
                          {interview.evaluation.overallScore}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {interview.status === 'completed' && !interview.evaluation && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEvaluate(interview.id); }}
                        disabled={isEvaluating}
                        title={t('product.interview.evaluate', 'Run AI Evaluation')}
                        className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
                      >
                        {isEvaluating ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-blue-600" />
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                          </svg>
                        )}
                      </button>
                    )}

                    {interview.recordingUrl && (
                      <a
                        href={interview.recordingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title={t('product.interview.viewRecording', 'View Recording')}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </a>
                    )}

                    {interview.accessToken && (
                      <button
                        onClick={(e) => { e.stopPropagation(); copyToClipboard(getInviteLink(interview.accessToken!), `link-${interview.id}`); }}
                        title={copiedId === `link-${interview.id}` ? t('common.copied', 'Copied!') : t('product.interview.copyLink', 'Copy invite link')}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        {copiedId === `link-${interview.id}` ? (
                          <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                        )}
                      </button>
                    )}

                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(interview.id); }}
                      title={t('common.delete', 'Delete')}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>

                    {/* Expand chevron */}
                    <svg className={`w-4 h-4 text-slate-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-5 pb-4 pt-0 bg-slate-50/50 border-t border-slate-100">
                    <div className="grid sm:grid-cols-2 gap-4 pt-3">
                      {/* Left: details */}
                      <div className="space-y-2 text-xs">
                        {interview.candidateEmail && (
                          <div className="flex gap-2">
                            <span className="text-slate-400 w-16 shrink-0">{t('product.interview.emailLabel', 'Email')}</span>
                            <span className="text-slate-700">{interview.candidateEmail}</span>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <span className="text-slate-400 w-16 shrink-0">{t('product.interview.typeLabel', 'Type')}</span>
                          <span className="text-slate-700">{interview.type === 'ai_video' ? 'AI Video' : interview.type === 'ai_audio' ? 'AI Audio' : 'AI Text'}</span>
                        </div>
                        {interview.scheduledAt && (
                          <div className="flex gap-2">
                            <span className="text-slate-400 w-16 shrink-0">{t('product.interview.status.scheduled', 'Scheduled')}</span>
                            <span className="text-slate-700">{formatDateTimeLabel(interview.scheduledAt)}</span>
                          </div>
                        )}
                        {interview.startedAt && (
                          <div className="flex gap-2">
                            <span className="text-slate-400 w-16 shrink-0">{t('product.interview.startedLabel', 'Started')}</span>
                            <span className="text-slate-700">{formatDateTimeLabel(interview.startedAt)}</span>
                          </div>
                        )}
                        {interview.completedAt && (
                          <div className="flex gap-2">
                            <span className="text-slate-400 w-16 shrink-0">{t('product.interview.completedLabel', 'Ended')}</span>
                            <span className="text-slate-700">{formatDateTimeLabel(interview.completedAt)}</span>
                          </div>
                        )}
                        {interview.duration && interview.duration > 0 && (
                          <div className="flex gap-2">
                            <span className="text-slate-400 w-16 shrink-0">{t('product.interview.durationLabel', 'Duration')}</span>
                            <span className="text-slate-700">{formatDuration(interview.duration)}</span>
                          </div>
                        )}
                        {interview.evaluation?.grade && (
                          <div className="flex gap-2">
                            <span className="text-slate-400 w-16 shrink-0">{t('product.interview.gradeLabel', 'Grade')}</span>
                            <span className="font-semibold text-slate-900">{interview.evaluation.grade}</span>
                          </div>
                        )}
                      </div>

                      {/* Right: invite link + QR */}
                      {interview.accessToken && (
                        <div className="space-y-2">
                          <div className="flex items-start gap-3">
                            <img
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(getInviteLink(interview.accessToken!))}`}
                              alt="QR Code"
                              className="h-[72px] w-[72px] rounded-lg border border-slate-200 bg-white p-0.5 shrink-0"
                            />
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <div>
                                <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                                  {t('product.interview.inviteLinkLabel', 'Interview Link')}
                                </label>
                                <div className="mt-0.5 flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    readOnly
                                    value={getInviteLink(interview.accessToken!)}
                                    className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 font-mono select-all"
                                  />
                                  <button
                                    onClick={() => copyToClipboard(getInviteLink(interview.accessToken!), `exp-link-${interview.id}`)}
                                    className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                                  >
                                    {copiedId === `exp-link-${interview.id}`
                                      ? t('common.copied', 'Copied!')
                                      : t('common.copy', 'Copy')}
                                  </button>
                                </div>
                              </div>
                              <div>
                                <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                                  {t('product.interview.accessTokenLabel', 'Access Token')}
                                </label>
                                <div className="mt-0.5 flex items-center gap-1.5">
                                  <code className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 font-mono truncate select-all">
                                    {interview.accessToken}
                                  </code>
                                  <button
                                    onClick={() => copyToClipboard(interview.accessToken!, `exp-token-${interview.id}`)}
                                    className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                                  >
                                    {copiedId === `exp-token-${interview.id}`
                                      ? t('common.copied', 'Copied!')
                                      : t('common.copy', 'Copy')}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* View GoHire Evaluation button */}
                      {(interview.gohireUserId || interview.metadata?.inviteData?.user_id) && (
                        <div className="sm:col-span-2 pt-2 border-t border-slate-200">
                          <button
                            onClick={() => handleViewGoHireEvaluation(interview)}
                            disabled={syncingInterviewId === interview.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-wait"
                          >
                            {syncingInterviewId === interview.id ? (
                              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            )}
                            {syncingInterviewId === interview.id
                              ? t('product.interview.syncingGoHireData', 'Syncing interview data...')
                              : t('product.interview.viewGoHireEvaluation', 'View GoHire Evaluation')}
                          </button>
                        </div>
                      )}

                      {showAdminGoHireCall && (
                        <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                                {t('product.interview.gohireCallLogLabel', 'GoHire Call Log')}
                              </p>
                              {interview.gohireInviteLog ? (
                                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-amber-900">
                                  {interview.gohireInviteLog.deliveryMode && (
                                    <span>
                                      {t('product.interview.gohireCallMode', 'Mode')}: {interview.gohireInviteLog.deliveryMode}
                                    </span>
                                  )}
                                  {interview.gohireInviteLog.method && interview.gohireInviteLog.endpoint && (
                                    <span>
                                      {t('product.interview.gohireCallEndpoint', 'Endpoint')}: {interview.gohireInviteLog.method} {interview.gohireInviteLog.endpoint}
                                    </span>
                                  )}
                                  {interview.gohireInviteLog.generatedAt && (
                                    <span>
                                      {t('product.interview.gohireCallGeneratedAt', 'Generated')}: {new Date(interview.gohireInviteLog.generatedAt).toLocaleString()}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <p className="mt-2 text-xs text-amber-800">
                                  {t('product.interview.gohireCallMissing', 'No GoHire call log was captured for this older interview record.')}
                                </p>
                              )}
                            </div>
                            {interview.gohireInviteLog?.actualCall && (
                              <button
                                type="button"
                                onClick={() => copyToClipboard(interview.gohireInviteLog!.actualCall!, `gohire-call-${interview.id}`)}
                                className="shrink-0 rounded-md border border-amber-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100 transition-colors"
                              >
                                {copiedId === `gohire-call-${interview.id}`
                                  ? t('common.copied', 'Copied!')
                                  : t('product.interview.copyGoHireCall', 'Copy Call')}
                              </button>
                            )}
                          </div>

                          {interview.gohireInviteLog?.actualCall && (
                            <pre className="mt-3 max-h-64 overflow-auto rounded-lg border border-amber-200 bg-white p-3 text-[11px] leading-5 text-slate-700 whitespace-pre-wrap break-words">
                              {interview.gohireInviteLog.actualCall}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">{t('common.confirmDelete', 'Confirm Delete')}</h3>
            <p className="mt-2 text-sm text-slate-500">{t('common.confirmDeleteMessage', 'Are you sure you want to delete this item? This action cannot be undone.')}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={confirmDelete}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                {t('common.delete', 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
