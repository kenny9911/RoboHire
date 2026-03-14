import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import axios from '../../lib/axios';
import { usePageState } from '../../hooks/usePageState';

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

export default function AIInterview() {
  const { t } = useTranslation();
  const { user } = useAuth();

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

  // Arrange interview state
  const [showArrange, setShowArrange] = useState(false);
  const [arrangeStep, setArrangeStep] = useState(1); // 1=resumes, 2=job, 3=requirements, 4=send
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

  const fetchInterviews = async () => {
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
  };

  useEffect(() => {
    fetchInterviews();
  }, [statusFilter]);

  const fetchResumes = async () => {
    setLoadingResumes(true);
    try {
      const res = await axios.get('/api/v1/resumes', { params: { limit: 100, status: 'active' } });
      setResumes(res.data.data || []);
    } catch {
      // silent
    } finally {
      setLoadingResumes(false);
    }
  };

  const fetchJobs = async () => {
    setLoadingJobs(true);
    try {
      const res = await axios.get('/api/v1/jobs', { params: { limit: 100, status: 'open' } });
      setJobs(res.data.data || []);
    } catch {
      // silent
    } finally {
      setLoadingJobs(false);
    }
  };

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
    fetchResumes();
    fetchJobs();
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
        // Fetch resume text
        const resumeRes = await axios.get(`/api/v1/resumes/${resumeIds[i]}`);
        const resumeText = resumeRes.data.data?.resumeText;
        if (!resumeText) {
          results[i].status = 'error';
          results[i].error = t('product.interview.noResumeText', 'Resume text not available');
          setInviteResults([...results]);
          continue;
        }

        // Send invite
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

        // Stop on 402 (usage limit)
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
    try {
      await axios.post(`/api/v1/interviews/${id}/evaluate`);
      fetchInterviews();
    } catch {
      // silent
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
  const activeRoleCount = useMemo(
    () => new Set(interviews.map((interview) => interview.jobTitle).filter(Boolean)).size,
    [interviews]
  );
  const scheduledCount = statusCounts.scheduled || 0;
  const inProgressCount = statusCounts.in_progress || 0;
  const completedCount = statusCounts.completed || 0;
  const evaluatedCount = interviews.filter((interview) => Boolean(interview.evaluation)).length;
  const evaluatedCompletedCount = interviews.filter(
    (interview) => interview.status === 'completed' && Boolean(interview.evaluation)
  ).length;
  const pendingEvaluationCount = Math.max(0, completedCount - evaluatedCompletedCount);
  const completionRate = interviews.length > 0 ? Math.round((completedCount / interviews.length) * 100) : 0;
  const evaluationCoverage = completedCount > 0 ? Math.round((evaluatedCompletedCount / completedCount) * 100) : 0;
  const latestInterviews = interviewsByNewest.slice(0, 4);
  const pipelineSegments = [
    { key: 'scheduled', label: statusLabel('scheduled'), count: scheduledCount, color: 'bg-sky-500' },
    { key: 'in_progress', label: statusLabel('in_progress'), count: inProgressCount, color: 'bg-amber-500' },
    { key: 'completed', label: statusLabel('completed'), count: completedCount, color: 'bg-emerald-500' },
  ];

  const todoItems = useMemo(() => {
    const items: Array<{
      key: string;
      title: string;
      description: string;
      actionLabel: string;
      onAction: () => void;
      tone: string;
    }> = [];

    if (pendingEvaluationCount > 0) {
      items.push({
        key: 'evaluate',
        title: t('product.interview.todoEvaluateTitle', 'Run pending evaluations'),
        description: t(
          'product.interview.todoEvaluateDesc',
          '{{count}} completed interview(s) still need AI evaluation.',
          { count: pendingEvaluationCount }
        ),
        actionLabel: t('product.interview.todoEvaluateAction', 'Review completed'),
        onAction: () => setStatusFilter('completed'),
        tone: 'border-amber-200 bg-amber-50/70 text-amber-700',
      });
    }

    if (inProgressCount > 0) {
      items.push({
        key: 'monitor',
        title: t('product.interview.todoInProgressTitle', 'Monitor live interviews'),
        description: t(
          'product.interview.todoInProgressDesc',
          '{{count}} interview(s) are currently in progress.',
          { count: inProgressCount }
        ),
        actionLabel: t('product.interview.todoInProgressAction', 'View live'),
        onAction: () => setStatusFilter('in_progress'),
        tone: 'border-blue-200 bg-blue-50/70 text-blue-700',
      });
    }

    if (scheduledCount > 0) {
      items.push({
        key: 'scheduled',
        title: t('product.interview.todoScheduledTitle', 'Follow up on scheduled invites'),
        description: t(
          'product.interview.todoScheduledDesc',
          '{{count}} interview(s) are waiting for candidates to start.',
          { count: scheduledCount }
        ),
        actionLabel: t('product.interview.todoScheduledAction', 'View scheduled'),
        onAction: () => setStatusFilter('scheduled'),
        tone: 'border-slate-200 bg-slate-50 text-slate-700',
      });
    }

    if (items.length === 0) {
      if (interviews.length === 0) {
        items.push({
          key: 'create',
          title: t('product.interview.todoCreateTitle', 'Create your first interview batch'),
          description: t(
            'product.interview.todoCreateDesc',
            'Select resumes, choose a job, and send AI interview links in one flow.'
          ),
          actionLabel: t('product.interview.arrangeInterview', 'Arrange Interview'),
          onAction: openArrange,
          tone: 'border-emerald-200 bg-emerald-50/70 text-emerald-700',
        });
      } else {
        items.push({
          key: 'clear',
          title: t('product.interview.todoClearTitle', 'Everything is on track'),
          description: t(
            'product.interview.todoClearDesc',
            'No urgent follow-up items right now. Review interview outcomes or arrange a new batch.'
          ),
          actionLabel: t('product.interview.todoClearAction', 'View all interviews'),
          onAction: () => setStatusFilter(''),
          tone: 'border-emerald-200 bg-emerald-50/70 text-emerald-700',
        });
      }
    }

    return items.slice(0, 3);
  }, [
    interviews.length,
    inProgressCount,
    openArrange,
    pendingEvaluationCount,
    scheduledCount,
    setStatusFilter,
    t,
  ]);

  const getInterviewProgress = (interview: Interview) => {
    if (interview.status === 'cancelled' || interview.status === 'expired') {
      return {
        percent: 100,
        label: t('product.interview.progressClosed', 'Closed'),
        tone: 'bg-slate-400',
      };
    }

    if (interview.status === 'scheduled') {
      return {
        percent: 28,
        label: t('product.interview.progressScheduled', 'Scheduled'),
        tone: 'bg-sky-500',
      };
    }

    if (interview.status === 'in_progress') {
      return {
        percent: 58,
        label: t('product.interview.progressInProgress', 'Interview in progress'),
        tone: 'bg-amber-500',
      };
    }

    if (interview.status === 'completed' && !interview.evaluation) {
      return {
        percent: 82,
        label: t('product.interview.progressEvaluationPending', 'Evaluation pending'),
        tone: 'bg-indigo-500',
      };
    }

    return {
      percent: 100,
      label: t('product.interview.progressReady', 'Review ready'),
      tone: 'bg-emerald-500',
    };
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('product.interview.title', 'AI Interview')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('product.interview.subtitle', 'AI-powered interviews with automatic evaluation.')}</p>
        </div>
        <button
          onClick={openArrange}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('product.interview.arrangeInterview', 'Arrange Interview')}
        </button>
      </div>

      {/* Arrange Interview Modal */}
      {showArrange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={closeArrange}>
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col m-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
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

            {/* Step content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
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
                      {/* Progress / Results */}
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
                                {r.status === 'sending' && (
                                  <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-blue-600" />
                                )}
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
                                {r.status === 'pending' && (
                                  <div className="h-4 w-4 rounded-full border-2 border-slate-300" />
                                )}
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

            {/* Modal footer */}
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

      {!loading && (
        <>
          <div className="grid gap-6 xl:grid-cols-[1.05fr,1.45fr]">
            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_22px_44px_-34px_rgba(15,23,42,0.45)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {t('product.interview.overviewEyebrow', 'Overview')}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">
                    {t('product.interview.overviewTitle', 'Interview health')}
                  </h3>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {t('product.interview.totalCount', '{{count}} total', { count: interviews.length })}
                </span>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  {
                    label: t('product.interview.metricActiveRoles', 'Active roles'),
                    value: activeRoleCount,
                    tone: 'bg-blue-50 text-blue-700',
                  },
                  {
                    label: t('product.interview.metricCompleted', 'Completed interviews'),
                    value: completedCount,
                    tone: 'bg-emerald-50 text-emerald-700',
                  },
                  {
                    label: t('product.interview.metricLive', 'Live now'),
                    value: inProgressCount,
                    tone: 'bg-amber-50 text-amber-700',
                  },
                  {
                    label: t('product.interview.metricEvaluated', 'Evaluated'),
                    value: evaluatedCount,
                    tone: 'bg-indigo-50 text-indigo-700',
                  },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                    <p className="text-xs font-medium text-slate-500">{metric.label}</p>
                    <p className="mt-2 text-3xl font-semibold text-slate-900">{metric.value}</p>
                    <span className={`mt-3 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${metric.tone}`}>
                      {metric.label}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_22px_44px_-34px_rgba(15,23,42,0.45)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {t('product.interview.progressEyebrow', 'Progress')}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">
                    {t('product.interview.progressTitle', 'Pipeline progress')}
                  </h3>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold text-slate-900">{completionRate}%</p>
                  <p className="text-xs text-slate-500">
                    {t('product.interview.progressCompletionRate', 'completion rate')}
                  </p>
                </div>
              </div>

              <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
                {interviews.length > 0 ? (
                  <div className="flex h-full w-full">
                    {pipelineSegments.map((segment) =>
                      segment.count > 0 ? (
                        <div
                          key={segment.key}
                          className={`${segment.color} h-full`}
                          style={{ width: `${(segment.count / interviews.length) * 100}%` }}
                        />
                      ) : null
                    )}
                  </div>
                ) : (
                  <div className="h-full w-full bg-slate-100" />
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {pipelineSegments.map((segment) => (
                  <span
                    key={segment.key}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600"
                  >
                    <span className={`h-2 w-2 rounded-full ${segment.color}`} />
                    <span>{segment.label}</span>
                    <span className="font-semibold text-slate-900">{segment.count}</span>
                  </span>
                ))}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <div className="flex items-center justify-between text-sm font-medium text-slate-700">
                    <span>{t('product.interview.progressEvaluationCoverage', 'Evaluation coverage')}</span>
                    <span>{evaluationCoverage}%</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-[width] duration-500"
                      style={{ width: `${evaluationCoverage}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {t(
                      'product.interview.progressEvaluationCoverageDesc',
                      '{{evaluated}} of {{completed}} completed interviews already have evaluations.',
                      {
                        evaluated: evaluatedCompletedCount,
                        completed: completedCount,
                      }
                    )}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <div className="flex items-center justify-between text-sm font-medium text-slate-700">
                    <span>{t('product.interview.progressActionQueue', 'Action queue')}</span>
                    <span>{pendingEvaluationCount + scheduledCount + inProgressCount}</span>
                  </div>
                  <div className="mt-3 space-y-2 text-xs text-slate-500">
                    <p>
                      {t('product.interview.progressActionQueueCompleted', '{{count}} awaiting evaluation', {
                        count: pendingEvaluationCount,
                      })}
                    </p>
                    <p>
                      {t('product.interview.progressActionQueueScheduled', '{{count}} scheduled', {
                        count: scheduledCount,
                      })}
                    </p>
                    <p>
                      {t('product.interview.progressActionQueueLive', '{{count}} in progress', {
                        count: inProgressCount,
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.4fr,1fr]">
            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_22px_44px_-34px_rgba(15,23,42,0.45)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {t('product.interview.latestEyebrow', 'Recent activity')}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">
                    {t('product.interview.latestTitle', 'Latest candidates')}
                  </h3>
                </div>
              </div>

              {latestInterviews.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center text-sm text-slate-500">
                  {t('product.interview.latestEmpty', 'No candidate activity yet. Arrange an interview to populate this feed.')}
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {latestInterviews.map((interview) => (
                    <div
                      key={interview.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100">
                          <span className="text-sm font-bold text-blue-700">
                            {interview.candidateName[0]?.toUpperCase() || '?'}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {interview.candidateName}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {[interview.jobTitle, interview.candidateEmail].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[interview.status] || STATUS_STYLES.scheduled}`}>
                          {statusLabel(interview.status)}
                        </span>
                        <p className="mt-1 text-xs text-slate-400">
                          {new Date(interview.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_22px_44px_-34px_rgba(15,23,42,0.45)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {t('product.interview.todoEyebrow', 'Focus next')}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">
                    {t('product.interview.todoTitle', 'To-do list')}
                  </h3>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {todoItems.map((item) => (
                  <div key={item.key} className={`rounded-2xl border px-4 py-4 ${item.tone}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold">{item.title}</p>
                        <p className="mt-1 text-xs opacity-80">{item.description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={item.onAction}
                        className="shrink-0 rounded-full border border-current/20 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-900 transition-colors hover:bg-white"
                      >
                        {item.actionLabel}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}

      <div className="flex items-end justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            {t('product.interview.listTitle', 'Your interviews')}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {t('product.interview.listSubtitle', 'Track status, interview progress, and evaluation readiness in one place.')}
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
          {t('product.interview.totalCount', '{{count}} total', { count: interviews.length })}
        </span>
      </div>

      {/* Status filters */}
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
            {s ? statusLabel(s) : t('product.interview.allStatuses', 'All')}
          </button>
        ))}
      </div>

      {/* Interviews list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
        </div>
      ) : interviews.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-slate-200 bg-white">
          <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <h3 className="text-lg font-semibold text-slate-900">{t('product.interview.empty', 'No interviews yet')}</h3>
          <p className="mt-1 text-sm text-slate-500">{t('product.interview.emptyDesc', 'Schedule an AI interview to get started.')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {interviews.map((interview) => (
            <div
              key={interview.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-blue-200 transition-colors"
            >
              {(() => {
                const progress = getInterviewProgress(interview);

                return (
                  <>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 shrink-0">
                    <span className="text-sm font-bold text-purple-600">
                      {interview.candidateName[0]?.toUpperCase() || '?'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">{interview.candidateName}</span>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[interview.status] || STATUS_STYLES.scheduled}`}>
                        {statusLabel(interview.status)}
                      </span>
                      {interview.evaluation?.verdict && (
                        <span className={`text-xs font-bold ${VERDICT_STYLES[interview.evaluation.verdict] || 'text-slate-600'}`}>
                          {verdictLabel(interview.evaluation.verdict)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                      {interview.jobTitle && <span>{interview.jobTitle}</span>}
                      {interview.candidateEmail && <span>{interview.candidateEmail}</span>}
                      {interview.duration && <span>{formatDuration(interview.duration)}</span>}
                      {interview.recordingUrl && (
                        <a
                          href={interview.recordingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                          title={t('product.interview.viewRecording', 'View Recording')}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {t('product.interview.recording', 'Recording')}
                        </a>
                      )}
                      <span>{new Date(interview.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {interview.evaluation?.overallScore != null && (
                    <div className="text-center">
                      <div className={`text-xl font-bold ${
                        interview.evaluation.overallScore >= 80 ? 'text-emerald-600' :
                        interview.evaluation.overallScore >= 60 ? 'text-blue-600' :
                        interview.evaluation.overallScore >= 40 ? 'text-amber-600' : 'text-red-600'
                      }`}>
                        {interview.evaluation.overallScore}
                      </div>
                      <div className="text-xs text-slate-400">{t('product.matching.score', 'score')}</div>
                    </div>
                  )}

                  {interview.status === 'completed' && !interview.evaluation && (
                    <button
                      onClick={() => handleEvaluate(interview.id)}
                      title={t('product.interview.evaluate', 'Run AI Evaluation')}
                      className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                    </button>
                  )}

                  <button
                    onClick={() => handleDelete(interview.id)}
                    title={t('product.hiring.delete', 'Delete')}
                    className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
                    <div className="mt-4">
                      <div className="mb-1 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                        <span>{t('product.interview.cardProgressLabel', 'Progress')}</span>
                        <span>{progress.label}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full transition-[width] duration-500 ${progress.tone}`}
                          style={{ width: `${progress.percent}%` }}
                        />
                      </div>
                    </div>

                    {/* Invite Link & QR Code — always visible */}
                    {interview.accessToken && (
                      <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <div className="flex items-start gap-3">
                          {/* QR Code */}
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(getInviteLink(interview.accessToken!))}`}
                            alt="QR Code"
                            className="h-[72px] w-[72px] rounded-lg border border-slate-200 bg-white p-0.5 shrink-0"
                          />
                          <div className="flex-1 min-w-0 space-y-1.5">
                            {/* Interview Link */}
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
                                  onClick={() => copyToClipboard(getInviteLink(interview.accessToken!), `link-${interview.id}`)}
                                  className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                                >
                                  {copiedId === `link-${interview.id}`
                                    ? t('common.copied', 'Copied!')
                                    : t('common.copy', 'Copy')}
                                </button>
                              </div>
                            </div>
                            {/* Access Token */}
                            <div>
                              <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                                {t('product.interview.accessTokenLabel', 'Access Token')}
                              </label>
                              <div className="mt-0.5 flex items-center gap-1.5">
                                <code className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 font-mono truncate select-all">
                                  {interview.accessToken}
                                </code>
                                <button
                                  onClick={() => copyToClipboard(interview.accessToken!, `token-${interview.id}`)}
                                  className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                                >
                                  {copiedId === `token-${interview.id}`
                                    ? t('common.copied', 'Copied!')
                                    : t('common.copy', 'Copy')}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
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
