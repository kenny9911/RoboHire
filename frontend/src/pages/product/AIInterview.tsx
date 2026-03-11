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

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/v1/interviews/${id}`);
      setInterviews((prev) => prev.filter((i) => i.id !== id));
    } catch {
      // silent
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

  const statuses = ['', 'scheduled', 'in_progress', 'completed', 'cancelled'];
  const sentCount = inviteResults.filter((r) => r.status === 'sent').length;
  const errorCount = inviteResults.filter((r) => r.status === 'error').length;

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
                            {r.status === 'sent' && r.data?.login_url && (
                              <div className="mt-2 flex items-center gap-3">
                                <a
                                  href={r.data.login_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline truncate"
                                >
                                  {t('product.interview.loginUrl', 'Interview Link')}
                                </a>
                                {r.data.qrcode_url && (
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
            {s || t('product.interview.allStatuses', 'All')}
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
                        {interview.status.replace('_', ' ')}
                      </span>
                      {interview.evaluation?.verdict && (
                        <span className={`text-xs font-bold ${VERDICT_STYLES[interview.evaluation.verdict] || 'text-slate-600'}`}>
                          {interview.evaluation.verdict.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                      {interview.jobTitle && <span>{interview.jobTitle}</span>}
                      {interview.candidateEmail && <span>{interview.candidateEmail}</span>}
                      {interview.duration && <span>{formatDuration(interview.duration)}</span>}
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
