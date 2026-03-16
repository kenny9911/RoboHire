import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from '../lib/axios';
import SEO from '../components/SEO';
import ResumeUploadModal from '../components/ResumeUploadModal';
import RefineDiffView from '../components/RefineDiffView';
import { ResumeRenderer, parsedDataToMarkdown } from '../components/ResumeRenderer';

type Tab = 'overview' | 'insights' | 'jobfit' | 'appliedJobs' | 'invitations' | 'notes';

interface AppliedJobMatch {
  id: string;
  jobId: string;
  jobTitle: string;
  department: string | null;
  location: string | null;
  workType: string | null;
  employmentType: string | null;
  companyName: string | null;
  jobStatus: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryText: string | null;
  salaryPeriod: string | null;
  score: number | null;
  grade: string | null;
  status: string;
  appliedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  interview: { id: string; status: string; scheduledAt: string | null; completedAt: string | null; type: string } | null;
}

interface AppliedHRFit {
  id: string;
  hiringRequestId: string;
  hiringRequestTitle: string;
  hiringRequestStatus: string;
  fitScore: number | null;
  fitGrade: string | null;
  pipelineStatus: string;
  invitedAt: string | null;
  createdAt: string;
  interview: { id: string; status: string; scheduledAt: string | null; completedAt: string | null; type: string } | null;
}

interface AppliedJobsData {
  jobMatches: AppliedJobMatch[];
  hiringRequestFits: AppliedHRFit[];
}

interface InvitationRecord {
  id: string;
  hiringRequestId: string;
  hiringRequestTitle: string;
  hiringRequestStatus: string;
  invitedAt: string | null;
  fitScore: number | null;
  fitGrade: string | null;
  inviteData: Record<string, any> | null;
  interview: {
    id: string;
    status: string;
    scheduledAt: string | null;
    completedAt: string | null;
    type: string;
  } | null;
}

interface ResumeData {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  currentRole: string | null;
  experienceYears: string | null;
  resumeText: string;
  parsedData: Record<string, unknown> | null;
  insightData: Record<string, unknown> | null;
  jobFitData: Record<string, unknown> | null;
  fileName: string | null;
  status: string;
  tags: string[];
  notes: string | null;
  createdAt: string;
  resumeJobFits: Array<{
    fitScore: number | null;
    fitGrade: string | null;
    fitData: Record<string, unknown> | null;
    hiringRequest: { id: string; title: string; status: string };
  }>;
}

type HeaderActionTone = 'primary' | 'secondary' | 'success' | 'destructive';

interface HeaderActionButtonProps {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  tone?: HeaderActionTone;
  disabled?: boolean;
}

function HeaderActionButton({
  label,
  icon,
  onClick,
  tone = 'secondary',
  disabled = false,
}: HeaderActionButtonProps) {
  const toneStyles: Record<HeaderActionTone, { button: string; icon: string }> = {
    primary: {
      button: 'border-blue-600 bg-blue-600 text-white shadow-sm hover:border-blue-700 hover:bg-blue-700',
      icon: 'border-white/15 bg-white/10 text-white',
    },
    secondary: {
      button: 'border-slate-200 bg-white text-slate-700 shadow-sm hover:border-blue-200 hover:bg-blue-50/60 hover:text-blue-700',
      icon: 'border-slate-200 bg-slate-50 text-slate-500',
    },
    success: {
      button: 'border-emerald-600 bg-emerald-600 text-white shadow-sm hover:border-emerald-700 hover:bg-emerald-700',
      icon: 'border-white/15 bg-white/10 text-white',
    },
    destructive: {
      button: 'border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50',
      icon: 'border-rose-100 bg-rose-50 text-rose-600',
    },
  };

  const styles = toneStyles[tone];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-2.5 text-[13px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 ${styles.button}`}
    >
      <span className={`flex h-6 w-6 items-center justify-center rounded-md border ${styles.icon}`}>
        {icon}
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function hasResumeParseWarning(parsed: Record<string, unknown> | null): boolean {
  const summary = typeof parsed?.summary === 'string' ? parsed.summary.trim().toLowerCase() : '';
  return summary.startsWith('unable to parse resume');
}

export default function ResumeDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [insightLoading, setInsightLoading] = useState(false);
  const [jobFitLoading, setJobFitLoading] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [tagsValue, setTagsValue] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [replaceUploadOpen, setReplaceUploadOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteJobs, setInviteJobs] = useState<Array<{ id: string; title: string; description: string | null }>>([]);
  const [inviteSelectedJobId, setInviteSelectedJobId] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteJobsLoading, setInviteJobsLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<Record<string, unknown> | null>(null);
  const [inviteError, setInviteError] = useState('');
  const [invitations, setInvitations] = useState<InvitationRecord[]>([]);
  const [invitationsMap, setInvitationsMap] = useState<Record<string, InvitationRecord>>({});
  const [appliedJobsData, setAppliedJobsData] = useState<AppliedJobsData | null>(null);
  const [appliedJobsLoading, setAppliedJobsLoading] = useState(false);

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [editSaving, setEditSaving] = useState(false);

  // Version history state
  const [versions, setVersions] = useState<Array<{ id: string; versionName: string | null; name: string; currentRole: string | null; changeNote: string | null; createdAt: string }>>([]);
  const [restoreLoading, setRestoreLoading] = useState<string | null>(null);

  // Refine resume state
  const [refineModalOpen, setRefineModalOpen] = useState(false);
  const [refineJobs, setRefineJobs] = useState<Array<{ id: string; title: string; description: string | null }>>([]);
  const [refineJobsLoading, setRefineJobsLoading] = useState(false);
  const [refineSelectedJobId, setRefineSelectedJobId] = useState('');
  const [refineLoading, setRefineLoading] = useState(false);
  const [refineResult, setRefineResult] = useState<{ refinedParsedData: any; changes: string[]; matchedSkills: string[]; emphasizedExperiences: string[] } | null>(null);
  const [refineError, setRefineError] = useState('');

  // Re-parse state
  const [reparseLoading, setReparseLoading] = useState(false);

  // Version selector state
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [versionPreviewData, setVersionPreviewData] = useState<Record<string, any> | null>(null);
  const [versionPreviewLoading, setVersionPreviewLoading] = useState(false);
  const [versionDropdownOpen, setVersionDropdownOpen] = useState(false);
  const [deleteVersionLoading, setDeleteVersionLoading] = useState<string | null>(null);
  const versionDropdownRef = useRef<HTMLDivElement>(null);

  const fetchInvitations = useCallback(async () => {
    if (!id) return;
    try {
      const res = await axios.get(`/api/v1/resumes/${id}/invitations`);
      if (res.data.success) {
        const list: InvitationRecord[] = res.data.data || [];
        setInvitations(list);
        const map: Record<string, InvitationRecord> = {};
        for (const inv of list) map[inv.hiringRequestId] = inv;
        setInvitationsMap(map);
      }
    } catch {
      // silently fail
    }
  }, [id]);

  const fetchAppliedJobs = useCallback(async () => {
    if (!id) return;
    setAppliedJobsLoading(true);
    try {
      const res = await axios.get(`/api/v1/resumes/${id}/applied-jobs`);
      if (res.data.success) setAppliedJobsData(res.data.data);
    } catch {
      // silently fail
    } finally {
      setAppliedJobsLoading(false);
    }
  }, [id]);

  const fetchResume = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/v1/resumes/${id}`);
      if (res.data.success) {
        setResume(res.data.data);
        setNotesValue(res.data.data.notes || '');
        setTagsValue((res.data.data.tags || []).join(', '));
      } else {
        setError(res.data.error || 'Not found');
      }
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.error || err.message : 'Failed to load resume');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchVersions = useCallback(async () => {
    if (!id) return;
    try {
      const res = await axios.get(`/api/v1/resumes/${id}/versions`);
      if (res.data.success) setVersions(res.data.data || []);
    } catch { /* silent */ }
  }, [id]);

  useEffect(() => {
    fetchResume();
    fetchInvitations();
    fetchVersions();
    fetchAppliedJobs();
  }, [fetchResume, fetchInvitations, fetchVersions, fetchAppliedJobs]);

  const generateInsights = async (force = false) => {
    if (!resume) return;
    setInsightLoading(true);
    try {
      const query = force ? '?force=true' : '';
      const res = await axios.post(`/api/v1/resumes/${resume.id}/insights${query}`);
      if (res.data.success) {
        setResume(prev => prev ? { ...prev, insightData: res.data.data } : prev);
      }
    } catch (err) {
      console.error('Insight error:', err);
    } finally {
      setInsightLoading(false);
    }
  };

  const handleReparse = async () => {
    if (!resume) return;
    setReparseLoading(true);
    try {
      const res = await axios.post(`/api/v1/resumes/${resume.id}/reparse`);
      if (res.data.success) {
        setResume(prev => prev ? { ...prev, parsedData: res.data.data.parsedData, name: res.data.data.name } : prev);
      }
    } catch (err) {
      console.error('Re-parse error:', err);
    } finally {
      setReparseLoading(false);
    }
  };

  const analyzeJobFit = async () => {
    if (!resume) return;
    setJobFitLoading(true);
    try {
      const res = await axios.post(`/api/v1/resumes/${resume.id}/job-fit`);
      if (res.data.success) {
        setResume(prev => prev ? { ...prev, jobFitData: res.data.data } : prev);
      }
    } catch (err) {
      console.error('Job fit error:', err);
    } finally {
      setJobFitLoading(false);
    }
  };

  const saveNotesAndTags = async () => {
    if (!resume) return;
    setSaveStatus('saving');
    try {
      const tags = tagsValue.split(',').map(t => t.trim()).filter(Boolean);
      await axios.patch(`/api/v1/resumes/${resume.id}`, { notes: notesValue, tags });
      setResume(prev => prev ? { ...prev, notes: notesValue, tags } : prev);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('idle');
    }
  };

  const handleArchive = async () => {
    if (!resume) return;
    await axios.delete(`/api/v1/resumes/${resume.id}`);
    navigate('/product/talent');
  };

  const handleInviteFromFit = async (hiringRequestId: string, title: string) => {
    if (!resume) return;
    setInviteModalOpen(true);
    setInviteResult(null);
    setInviteError('');
    setInviteLoading(true);
    setInviteJobs([]);
    setInviteSelectedJobId('');
    try {
      const hrRes = await axios.get(`/api/v1/hiring-requests/${hiringRequestId}`);
      const hr = hrRes.data.data;
      const jdText = hr.jobDescription || hr.requirements || title;
      const res = await axios.post('/api/v1/invite-candidate', {
        resume: resume.resumeText,
        jd: jdText,
        recruiter_email: resume.email || undefined,
      });
      if (res.data.success) {
        setInviteResult(res.data.data);
        fetchInvitations(); // Refresh invitation status
      } else {
        setInviteError(res.data.error || 'Failed to send invitation');
      }
    } catch (err: any) {
      setInviteError(err?.response?.data?.error || 'Failed to send invitation');
    } finally {
      setInviteLoading(false);
    }
  };

  const openInviteModal = async () => {
    setInviteModalOpen(true);
    setInviteResult(null);
    setInviteError('');
    setInviteSelectedJobId('');
    setInviteJobsLoading(true);
    try {
      const res = await axios.get('/api/v1/jobs', { params: { status: 'open', limit: 50 } });
      const jobs = (res.data.data || []).map((j: any) => ({ id: j.id, title: j.title, description: j.description }));
      setInviteJobs(jobs);
      if (jobs.length > 0) setInviteSelectedJobId(jobs[0].id);
    } catch {
      setInviteJobs([]);
    } finally {
      setInviteJobsLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!resume || !inviteSelectedJobId) return;
    const selectedJob = inviteJobs.find(j => j.id === inviteSelectedJobId);
    if (!selectedJob) return;
    setInviteLoading(true);
    setInviteError('');
    try {
      const res = await axios.post('/api/v1/invite-candidate', {
        resume: resume.resumeText,
        jd: selectedJob.description || selectedJob.title,
        recruiter_email: resume.email || undefined,
      });
      if (res.data.success) {
        setInviteResult(res.data.data);
        fetchInvitations(); // Refresh invitation status
      } else {
        setInviteError(res.data.error || 'Failed to send invitation');
      }
    } catch (err: any) {
      setInviteError(err?.response?.data?.error || 'Failed to send invitation');
    } finally {
      setInviteLoading(false);
    }
  };

  // ─── Edit Mode ─────────────────────────────────────────────────────
  const enterEditMode = () => {
    if (!resume) return;
    const pd = (resume.parsedData || {}) as Record<string, any>;
    setEditForm({
      name: resume.name || '',
      email: resume.email || '',
      phone: resume.phone || '',
      currentRole: resume.currentRole || '',
      experienceYears: resume.experienceYears || '',
      summary: pd.summary || '',
      skills: Array.isArray(pd.skills) ? pd.skills.join(', ') : (pd.skills && typeof pd.skills === 'object' ? Object.values(pd.skills).flat().join(', ') : ''),
      experience: Array.isArray(pd.experience) ? pd.experience.map((e: any) => ({
        role: e.role || '', company: e.company || '', location: e.location || '',
        startDate: e.startDate || '', endDate: e.endDate || '',
        description: e.description || '',
        achievements: Array.isArray(e.achievements) ? e.achievements.join('\n') : '',
        technologies: Array.isArray(e.technologies) ? e.technologies.join(', ') : '',
      })) : [],
      education: Array.isArray(pd.education) ? pd.education.map((e: any) => ({
        degree: e.degree || '', institution: e.institution || '', field: e.field || '',
        endDate: e.endDate || '', gpa: e.gpa || '',
      })) : [],
      certifications: Array.isArray(pd.certifications) ? pd.certifications.map((c: any) => ({
        name: c.name || '', issuer: c.issuer || '', date: c.date || '',
      })) : [],
      projects: Array.isArray(pd.projects) ? pd.projects.map((p: any) => ({
        name: p.name || '', description: p.description || '',
        technologies: Array.isArray(p.technologies) ? p.technologies.join(', ') : '',
      })) : [],
      versionName: '',
    });
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditForm({});
  };

  const saveEdit = async () => {
    if (!resume) return;
    setEditSaving(true);
    try {
      const skillsArray = typeof editForm.skills === 'string'
        ? editForm.skills.split(',').map((s: string) => s.trim()).filter(Boolean)
        : editForm.skills;

      const experienceOut = (editForm.experience || []).map((e: any) => ({
        ...e,
        achievements: typeof e.achievements === 'string'
          ? e.achievements.split('\n').map((a: string) => a.trim()).filter(Boolean)
          : (e.achievements || []),
        technologies: typeof e.technologies === 'string'
          ? e.technologies.split(',').map((t: string) => t.trim()).filter(Boolean)
          : (e.technologies || []),
      }));

      const projectsOut = (editForm.projects || []).map((p: any) => ({
        ...p,
        technologies: typeof p.technologies === 'string'
          ? p.technologies.split(',').map((t: string) => t.trim()).filter(Boolean)
          : (p.technologies || []),
      }));

      const parsedData = {
        ...((resume.parsedData || {}) as Record<string, any>),
        summary: editForm.summary,
        skills: skillsArray,
        experience: experienceOut,
        education: editForm.education,
        certifications: editForm.certifications,
        projects: projectsOut,
      };

      await axios.put(`/api/v1/resumes/${resume.id}`, {
        name: editForm.name,
        email: editForm.email || null,
        phone: editForm.phone || null,
        currentRole: editForm.currentRole || null,
        experienceYears: editForm.experienceYears || null,
        parsedData,
        versionName: editForm.versionName || undefined,
      });
      setEditMode(false);
      fetchResume();
      fetchVersions();
    } catch (err) {
      console.error('Failed to save resume edit:', err);
    } finally {
      setEditSaving(false);
    }
  };

  // ─── Version Selector ────────────────────────────────────────────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (versionDropdownRef.current && !versionDropdownRef.current.contains(e.target as Node)) {
        setVersionDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectVersion = useCallback(async (versionId: string | null) => {
    setVersionDropdownOpen(false);
    if (!versionId) {
      setSelectedVersionId(null);
      setVersionPreviewData(null);
      return;
    }
    setSelectedVersionId(versionId);
    setVersionPreviewLoading(true);
    try {
      const res = await axios.get(`/api/v1/resumes/${id}/versions/${versionId}`);
      if (res.data.success) {
        setVersionPreviewData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load version:', err);
      setSelectedVersionId(null);
    } finally {
      setVersionPreviewLoading(false);
    }
  }, [id]);

  const setVersionAsActive = async () => {
    if (!selectedVersionId || !resume) return;
    setRestoreLoading(selectedVersionId);
    try {
      await axios.post(`/api/v1/resumes/${resume.id}/versions/${selectedVersionId}/restore`);
      setSelectedVersionId(null);
      setVersionPreviewData(null);
      fetchResume();
      fetchVersions();
    } catch (err) {
      console.error('Failed to set version as active:', err);
    } finally {
      setRestoreLoading(null);
    }
  };

  const deleteVersion = async (versionId: string) => {
    if (!resume) return;
    setDeleteVersionLoading(versionId);
    try {
      await axios.delete(`/api/v1/resumes/${resume.id}/versions/${versionId}`);
      if (selectedVersionId === versionId) {
        setSelectedVersionId(null);
        setVersionPreviewData(null);
      }
      fetchVersions();
    } catch (err) {
      console.error('Failed to delete version:', err);
    } finally {
      setDeleteVersionLoading(null);
    }
  };

  const isPreviewingVersion = selectedVersionId !== null;
  const selectedVersionInfo = versions.find(v => v.id === selectedVersionId);

  // ─── Refine Resume ────────────────────────────────────────────────
  const openRefineModal = async () => {
    setRefineModalOpen(true);
    setRefineResult(null);
    setRefineError('');
    setRefineSelectedJobId('');
    setRefineJobsLoading(true);
    try {
      const res = await axios.get('/api/v1/jobs', { params: { status: 'open', limit: 100 } });
      const jobs = (res.data.data || []).map((j: any) => ({ id: j.id, title: j.title, description: j.description }));
      setRefineJobs(jobs);
      if (jobs.length > 0) setRefineSelectedJobId(jobs[0].id);
    } catch {
      setRefineJobs([]);
    } finally {
      setRefineJobsLoading(false);
    }
  };

  const handleRefine = async () => {
    if (!resume || !refineSelectedJobId) return;
    setRefineLoading(true);
    setRefineError('');
    try {
      const lang = (window.localStorage.getItem('i18nextLng') || navigator.language || 'en').split('-')[0];
      const res = await axios.post(`/api/v1/resumes/${resume.id}/refine`, { jobId: refineSelectedJobId, language: lang });
      if (res.data.success) {
        setRefineResult(res.data.data);
      } else {
        setRefineError(res.data.error || 'Refine failed');
      }
    } catch (err: any) {
      setRefineError(err?.response?.data?.error || 'Failed to refine resume');
    } finally {
      setRefineLoading(false);
    }
  };

  const applyRefine = async () => {
    if (!resume || !refineResult) return;
    const selectedJob = refineJobs.find(j => j.id === refineSelectedJobId);
    setEditSaving(true);
    try {
      await axios.put(`/api/v1/resumes/${resume.id}`, {
        name: resume.name,
        parsedData: refineResult.refinedParsedData,
        versionName: selectedJob ? `Refined for ${selectedJob.title}` : 'Refined',
      });
      setRefineModalOpen(false);
      setRefineResult(null);
      fetchResume();
      fetchVersions();
    } catch (err) {
      console.error('Failed to apply refined resume:', err);
    } finally {
      setEditSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (error || !resume) {
    return (
      <div className="max-w-4xl mx-auto">
        <button onClick={() => navigate('/product/talent')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 mb-6">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          {t('resumeLibrary.detail.back', 'Back to Resumes')}
        </button>
        <div className="bg-red-50 text-red-700 rounded-xl p-6 text-center">{error || 'Resume not found'}</div>
      </div>
    );
  }

  const parsed = resume.parsedData as Record<string, unknown> | null;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: t('resumeLibrary.detail.tabs.overview', 'Overview') },
    { key: 'insights', label: t('resumeLibrary.detail.tabs.insights', 'AI Insights') },
    { key: 'jobfit', label: t('resumeLibrary.detail.tabs.jobFit', 'Job Fit') },
    { key: 'appliedJobs', label: `${t('resumeLibrary.detail.tabs.appliedJobs', 'Applied Jobs')}${appliedJobsData ? ` (${appliedJobsData.jobMatches.length + (appliedJobsData.hiringRequestFits || []).filter(f => f.pipelineStatus === 'invited' || f.interview).length})` : ''}` },
    { key: 'invitations', label: `${t('resumeLibrary.detail.tabs.invitations', 'Invitations')}${invitations.length > 0 ? ` (${invitations.length})` : ''}` },
    { key: 'notes', label: t('resumeLibrary.detail.tabs.notes', 'Notes & Tags') },
  ];

  const inviteActionLabel = t('resumeLibrary.detail.headerActions.interview', 'Interview');
  const editActionLabel = t('resumeLibrary.detail.headerActions.edit', 'Edit');
  const reuploadActionLabel = t('resumeLibrary.detail.headerActions.upload', 'Upload');
  const regenerateActionLabel = insightLoading
    ? t('resumeLibrary.detail.headerActions.insightsLoading', 'Loading...')
    : t('resumeLibrary.detail.headerActions.insights', 'Insights');
  const rematchActionLabel = jobFitLoading
    ? t('resumeLibrary.detail.headerActions.matchLoading', 'Matching...')
    : t('resumeLibrary.detail.headerActions.match', 'Match');
  const refineActionLabel = t('resumeLibrary.detail.headerActions.optimize', 'Optimize');
  const archiveActionLabel = t('resumeLibrary.detail.actions.archive', 'Archive');
  const hasCompletedInterview = invitations.some(
    (inv) => inv.interview?.status === 'completed' || Boolean(inv.interview?.completedAt)
  );
  const interviewActionTone: HeaderActionTone = hasCompletedInterview ? 'success' : 'primary';

  return (
    <div className="max-w-5xl mx-auto">
      <SEO title={`${resume.name} - Resume`} noIndex />

      {/* Back */}
      <button onClick={() => navigate('/product/talent')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 mb-6">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        {t('resumeLibrary.detail.back', 'Back to Resumes')}
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900">{resume.name}</h1>
            {resume.currentRole && <p className="text-sm text-gray-600 mt-1">{resume.currentRole}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
              {resume.email && <span>{resume.email}</span>}
              {resume.phone && <span>{resume.phone}</span>}
              {resume.fileName && <span>{resume.fileName}</span>}
            </div>
            {/* Version selector */}
            {versions.length > 0 && (
              <div className="relative mt-3" ref={versionDropdownRef}>
                <button
                  onClick={() => setVersionDropdownOpen(!versionDropdownOpen)}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                    isPreviewingVersion
                      ? 'border-blue-300 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                  </svg>
                  {isPreviewingVersion
                    ? (selectedVersionInfo?.versionName || selectedVersionInfo?.name || t('resumeLibrary.detail.versions.autoSave', 'Auto-save'))
                    : t('resumeLibrary.detail.versions.current', 'Current Version')}
                  <span className="text-[10px] text-gray-400 ml-0.5">({versions.length + 1})</span>
                  <svg className={`w-3 h-3 transition-transform ${versionDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {versionDropdownOpen && (
                  <div className="absolute left-0 top-full mt-1 z-30 w-80 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
                    {/* Current version */}
                    <button
                      onClick={() => selectVersion(null)}
                      className={`w-full text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors border-b border-gray-100 ${
                        !isPreviewingVersion ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900">{t('resumeLibrary.detail.versions.current', 'Current Version')}</span>
                        {!isPreviewingVersion && (
                          <span className="text-[10px] font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">
                            {t('resumeLibrary.detail.versions.active', 'Active')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{resume.name} — {resume.currentRole || ''}</p>
                    </button>

                    {/* Version list */}
                    <div className="max-h-60 overflow-y-auto">
                      {versions.map(v => (
                        <div
                          key={v.id}
                          className={`flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors ${
                            selectedVersionId === v.id ? 'bg-blue-50' : ''
                          }`}
                        >
                          <button
                            onClick={() => selectVersion(v.id)}
                            className="flex-1 text-left min-w-0"
                          >
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {v.versionName || v.name || t('resumeLibrary.detail.versions.autoSave', 'Auto-save')}
                            </p>
                            <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
                              <span>{new Date(v.createdAt).toLocaleDateString()}</span>
                              {v.changeNote && <span className="truncate">— {v.changeNote}</span>}
                            </div>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteVersion(v.id); }}
                            disabled={deleteVersionLoading === v.id}
                            className="ml-2 p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0 disabled:opacity-50"
                            title={t('resumeLibrary.detail.versions.delete', 'Delete')}
                          >
                            {deleteVersionLoading === v.id ? (
                              <div className="h-3.5 w-3.5 animate-spin rounded-full border-b-2 border-red-400" />
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="w-full lg:w-auto lg:max-w-[58%]">
            <div className="overflow-x-auto pb-1">
              <div className="flex min-w-max gap-2 lg:ml-auto">
                <HeaderActionButton
                  onClick={openInviteModal}
                  tone={interviewActionTone}
                  disabled={isPreviewingVersion}
                  label={inviteActionLabel}
                  icon={(
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6.75A2.25 2.25 0 0013.5 4.5h-6a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 007.5 19.5h6a2.25 2.25 0 002.25-2.25V13.5l4.5 4.5v-12l-4.5 4.5z" />
                    </svg>
                  )}
                />
                <HeaderActionButton
                  onClick={enterEditMode}
                  disabled={isPreviewingVersion}
                  label={editActionLabel}
                  icon={(
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  )}
                />
                <HeaderActionButton
                  onClick={() => setReplaceUploadOpen(true)}
                  disabled={isPreviewingVersion}
                  label={reuploadActionLabel}
                  icon={(
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V4.5m0 0l-3.75 3.75M12 4.5l3.75 3.75M3.75 15.75v2.25A2.25 2.25 0 006 20.25h12A2.25 2.25 0 0020.25 18v-2.25" />
                    </svg>
                  )}
                />
                <HeaderActionButton
                  onClick={() => generateInsights(true)}
                  disabled={insightLoading || isPreviewingVersion}
                  label={regenerateActionLabel}
                  icon={(
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 19.5h16.5M6.75 16.5v-4.5m5.25 4.5V9m5.25 7.5V6" />
                    </svg>
                  )}
                />
                <HeaderActionButton
                  onClick={analyzeJobFit}
                  disabled={jobFitLoading || isPreviewingVersion}
                  label={rematchActionLabel}
                  icon={(
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h9m0 0-2.25-2.25M16.5 7.5l-2.25 2.25M16.5 16.5h-9m0 0 2.25-2.25M7.5 16.5l2.25 2.25" />
                    </svg>
                  )}
                />
                <HeaderActionButton
                  onClick={openRefineModal}
                  disabled={isPreviewingVersion}
                  label={refineActionLabel}
                  icon={(
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 7.5h15m-12 4.5h9m-6 4.5h3" />
                    </svg>
                  )}
                />
                <HeaderActionButton
                  onClick={handleArchive}
                  tone="destructive"
                  disabled={isPreviewingVersion}
                  label={archiveActionLabel}
                  icon={(
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5v10.125A2.625 2.625 0 0117.625 20.25H6.375A2.625 2.625 0 013.75 17.625V7.5m16.5 0H3.75m16.5 0-1.06-2.118A1.125 1.125 0 0018.184 4.5H5.816c-.426 0-.815.24-1.006.62L3.75 7.5" />
                    </svg>
                  )}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-1 mb-6">
        {tabs.map(tb => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === tb.key ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* Version preview banner */}
      {isPreviewingVersion && (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-sm font-medium text-blue-800">
              {t('resumeLibrary.detail.versions.previewing', 'Previewing')}: {selectedVersionInfo?.versionName || selectedVersionInfo?.name || t('resumeLibrary.detail.versions.autoSave', 'Auto-save')}
            </span>
            {selectedVersionInfo && (
              <span className="text-xs text-blue-500">— {new Date(selectedVersionInfo.createdAt).toLocaleDateString()}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={setVersionAsActive}
              disabled={restoreLoading !== null}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
            >
              {restoreLoading ? (
                <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-emerald-600" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {t('resumeLibrary.detail.versions.setActive', 'Set as Active')}
            </button>
            <button
              onClick={() => selectedVersionId && deleteVersion(selectedVersionId)}
              disabled={deleteVersionLoading !== null}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              {deleteVersionLoading ? (
                <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-red-400" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              )}
              {t('resumeLibrary.detail.versions.delete', 'Delete')}
            </button>
            <button
              onClick={() => selectVersion(null)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
              {t('resumeLibrary.detail.versions.backToCurrent', 'Back to Current')}
            </button>
          </div>
        </div>
      )}

      {/* Tab content */}
      {tab === 'overview' && (
        editMode && !isPreviewingVersion ? (
          <EditModeView form={editForm} setForm={setEditForm} saving={editSaving} onSave={saveEdit} onCancel={cancelEdit} t={t} />
        ) : isPreviewingVersion ? (
          versionPreviewLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : versionPreviewData ? (
            <OverviewTab parsed={versionPreviewData.parsedData as Record<string, unknown> | null} t={t} />
          ) : null
        ) : (
          <OverviewTab parsed={parsed} t={t} onReparse={handleReparse} reparseLoading={reparseLoading} />
        )
      )}
      {tab === 'insights' && <InsightsTab data={resume.insightData} loading={insightLoading} onGenerate={() => generateInsights(true)} t={t} />}
      {tab === 'jobfit' && <JobFitTab data={resume.jobFitData} loading={jobFitLoading} onAnalyze={analyzeJobFit} onInvite={handleInviteFromFit} invitationsMap={invitationsMap} t={t} />}
      {tab === 'appliedJobs' && <AppliedJobsTab data={appliedJobsData} loading={appliedJobsLoading} onRefresh={fetchAppliedJobs} resumeId={resume.id} t={t} />}
      {tab === 'invitations' && <InvitationsTab invitations={invitations} resumeText={resume.resumeText} onRefresh={fetchInvitations} t={t} />}
      {tab === 'notes' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('resumeLibrary.notes.tags', 'Tags')}</label>
            <input
              type="text"
              value={tagsValue}
              onChange={e => setTagsValue(e.target.value)}
              placeholder={t('resumeLibrary.notes.addTag', 'e.g. senior, frontend, interviewed')}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-400 mt-1">Separate tags with commas</p>
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('resumeLibrary.notes.notes', 'Notes')}</label>
            <textarea
              value={notesValue}
              onChange={e => setNotesValue(e.target.value)}
              rows={6}
              placeholder={t('resumeLibrary.notes.notesPlaceholder', 'Add notes about this candidate...')}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
            />
          </div>
          <button
            onClick={saveNotesAndTags}
            disabled={saveStatus === 'saving'}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saveStatus === 'saving' ? t('resumeLibrary.notes.saving', 'Saving...') : saveStatus === 'saved' ? t('resumeLibrary.notes.saved', 'Saved!') : t('resumeLibrary.notes.save', 'Save')}
          </button>
        </div>
      )}

      <ResumeUploadModal
        open={replaceUploadOpen}
        onClose={() => setReplaceUploadOpen(false)}
        onUploaded={() => {
          setReplaceUploadOpen(false);
          setTab('overview');
          fetchResume();
        }}
        replaceResumeId={resume.id}
      />

      {/* Invite Interview Modal */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {t('resumeLibrary.detail.invite.title', 'Invite to Interview')}
              </h3>
              <button
                onClick={() => setInviteModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Candidate info */}
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-sm font-medium text-gray-900">{resume.name}</p>
                {resume.currentRole && <p className="text-xs text-gray-500 mt-0.5">{resume.currentRole}</p>}
                {resume.email && <p className="text-xs text-gray-500">{resume.email}</p>}
              </div>

              {!inviteResult ? (
                <>
                  {/* Job selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {t('resumeLibrary.detail.invite.selectJob', 'Select a job position')}
                    </label>
                    {inviteJobsLoading ? (
                      <div className="flex items-center gap-2 py-3 text-sm text-gray-500">
                        <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-indigo-600" />
                        {t('resumeLibrary.detail.invite.loadingJobs', 'Loading jobs...')}
                      </div>
                    ) : inviteJobs.length === 0 ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                        {t('resumeLibrary.detail.invite.noJobs', 'No open jobs found. Please create and publish a job first.')}
                      </div>
                    ) : (
                      <select
                        value={inviteSelectedJobId}
                        onChange={e => setInviteSelectedJobId(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      >
                        {inviteJobs.map(j => (
                          <option key={j.id} value={j.id}>{j.title}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {inviteError && (
                    <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{inviteError}</div>
                  )}

                  {/* Actions */}
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      onClick={() => setInviteModalOpen(false)}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {t('resumeLibrary.detail.invite.cancel', 'Cancel')}
                    </button>
                    <button
                      onClick={handleInvite}
                      disabled={inviteLoading || !inviteSelectedJobId || inviteJobs.length === 0}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
                    >
                      {inviteLoading && <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />}
                      {inviteLoading
                        ? t('resumeLibrary.detail.invite.sending', 'Sending...')
                        : t('resumeLibrary.detail.invite.send', 'Send Invitation')}
                    </button>
                  </div>
                </>
              ) : (
                /* Success result */
                <div className="space-y-4">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <span className="text-sm font-semibold text-emerald-800">{t('resumeLibrary.detail.invite.success', 'Invitation sent successfully!')}</span>
                    </div>
                    {(inviteResult as any).job_title && (
                      <p className="text-xs text-emerald-700">{t('resumeLibrary.detail.invite.position', 'Position')}: {(inviteResult as any).job_title}</p>
                    )}
                  </div>

                  {(inviteResult as any).login_url && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{t('resumeLibrary.detail.invite.interviewLink', 'Interview Link')}</label>
                      <div className="flex items-center gap-2">
                        <input
                          readOnly
                          value={(inviteResult as any).login_url}
                          className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 font-mono"
                        />
                        <button
                          onClick={() => { navigator.clipboard.writeText((inviteResult as any).login_url); }}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
                        >
                          {t('actions.copy', 'Copy')}
                        </button>
                      </div>
                    </div>
                  )}

                  {(inviteResult as any).qrcode_url && (
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mb-2">{t('resumeLibrary.detail.invite.qrCode', 'WeChat QR Code')}</p>
                      <img src={(inviteResult as any).qrcode_url} alt="QR Code" className="w-32 h-32 mx-auto rounded-lg border border-gray-200" />
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => setInviteModalOpen(false)}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                      {t('resumeLibrary.detail.invite.done', 'Done')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Refine Resume Modal */}
      {refineModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className={`bg-white rounded-2xl shadow-xl w-full ${refineResult ? 'max-w-6xl' : 'max-w-2xl'} mx-4 max-h-[90vh] overflow-y-auto`}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {t('resumeLibrary.detail.refine.title', 'Refine Resume for Job')}
              </h3>
              <button onClick={() => { setRefineModalOpen(false); setRefineResult(null); }} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              {!refineResult ? (
                <>
                  <p className="text-sm text-gray-600">{t('resumeLibrary.detail.refine.description', 'Select a job to tailor this resume. The AI will emphasize matching skills and experiences without altering any facts.')}</p>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {t('resumeLibrary.detail.refine.selectJob', 'Select a job')}
                    </label>
                    {refineJobsLoading ? (
                      <div className="flex items-center gap-2 py-3 text-sm text-gray-500">
                        <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-indigo-600" />
                        {t('resumeLibrary.detail.invite.loadingJobs', 'Loading jobs...')}
                      </div>
                    ) : refineJobs.length === 0 ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                        {t('resumeLibrary.detail.invite.noJobs', 'No open jobs found. Please create and publish a job first.')}
                      </div>
                    ) : (
                      <select
                        value={refineSelectedJobId}
                        onChange={e => setRefineSelectedJobId(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      >
                        {refineJobs.map(j => (
                          <option key={j.id} value={j.id}>{j.title}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {refineError && (
                    <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{refineError}</div>
                  )}

                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => setRefineModalOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                      {t('resumeLibrary.detail.invite.cancel', 'Cancel')}
                    </button>
                    <button
                      onClick={handleRefine}
                      disabled={refineLoading || !refineSelectedJobId || refineJobs.length === 0}
                      className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
                    >
                      {refineLoading && <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />}
                      {refineLoading
                        ? t('resumeLibrary.detail.refine.refining', 'Refining...')
                        : t('resumeLibrary.detail.refine.refine', 'Refine Resume')}
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <RefineDiffView
                    original={parsed}
                    refined={refineResult.refinedParsedData}
                    changes={refineResult.changes}
                    matchedSkills={refineResult.matchedSkills}
                    emphasizedExperiences={refineResult.emphasizedExperiences}
                    t={t}
                  />

                  <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                    <button onClick={() => { setRefineModalOpen(false); setRefineResult(null); }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                      {t('resumeLibrary.detail.refine.discard', 'Discard')}
                    </button>
                    <button
                      onClick={applyRefine}
                      disabled={editSaving}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
                    >
                      {editSaving && <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />}
                      {editSaving
                        ? t('resumeLibrary.detail.refine.applying', 'Applying...')
                        : t('resumeLibrary.detail.refine.applyAndSave', 'Apply & Save')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Edit Mode View ──────────────────────────────────────────────────
function EditModeView({ form, setForm, saving, onSave, onCancel, t }: {
  form: Record<string, any>;
  setForm: (fn: (prev: Record<string, any>) => Record<string, any>) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  t: (k: string, f?: any) => string;
}) {
  const updateField = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));

  const updateExperience = (index: number, field: string, value: string) => {
    setForm(prev => {
      const exp = [...(prev.experience || [])];
      exp[index] = { ...exp[index], [field]: value };
      return { ...prev, experience: exp };
    });
  };

  const addExperience = () => {
    setForm(prev => ({
      ...prev,
      experience: [...(prev.experience || []), { role: '', company: '', startDate: '', endDate: '', description: '' }],
    }));
  };

  const removeExperience = (index: number) => {
    setForm(prev => ({
      ...prev,
      experience: (prev.experience || []).filter((_: any, i: number) => i !== index),
    }));
  };

  const updateEducation = (index: number, field: string, value: string) => {
    setForm(prev => {
      const edu = [...(prev.education || [])];
      edu[index] = { ...edu[index], [field]: value };
      return { ...prev, education: edu };
    });
  };

  const addEducation = () => {
    setForm(prev => ({
      ...prev,
      education: [...(prev.education || []), { degree: '', institution: '', field: '', endDate: '' }],
    }));
  };

  const removeEducation = (index: number) => {
    setForm(prev => ({
      ...prev,
      education: (prev.education || []).filter((_: any, i: number) => i !== index),
    }));
  };

  const updateCertification = (index: number, field: string, value: string) => {
    setForm(prev => {
      const certs = [...(prev.certifications || [])];
      certs[index] = { ...certs[index], [field]: value };
      return { ...prev, certifications: certs };
    });
  };

  const addCertification = () => {
    setForm(prev => ({
      ...prev,
      certifications: [...(prev.certifications || []), { name: '', issuer: '', date: '' }],
    }));
  };

  const removeCertification = (index: number) => {
    setForm(prev => ({
      ...prev,
      certifications: (prev.certifications || []).filter((_: any, i: number) => i !== index),
    }));
  };

  const updateProject = (index: number, field: string, value: string) => {
    setForm(prev => {
      const projs = [...(prev.projects || [])];
      projs[index] = { ...projs[index], [field]: value };
      return { ...prev, projects: projs };
    });
  };

  const addProject = () => {
    setForm(prev => ({
      ...prev,
      projects: [...(prev.projects || []), { name: '', description: '', technologies: '' }],
    }));
  };

  const removeProject = (index: number) => {
    setForm(prev => ({
      ...prev,
      projects: (prev.projects || []).filter((_: any, i: number) => i !== index),
    }));
  };

  const inputClass = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500';
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1';

  return (
    <div className="space-y-6">
      {/* Save/Cancel bar */}
      <div className="flex items-center justify-between bg-violet-50 border border-violet-200 rounded-xl px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-violet-800">{t('resumeLibrary.detail.edit.editing', 'Editing Resume')}</span>
          <input
            type="text"
            value={form.versionName || ''}
            onChange={e => updateField('versionName', e.target.value)}
            placeholder={t('resumeLibrary.detail.edit.versionNamePlaceholder', 'Version name (optional)')}
            className="px-3 py-1.5 text-xs border border-violet-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 w-52"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-4 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            {t('resumeLibrary.detail.edit.cancel', 'Cancel')}
          </button>
          <button onClick={onSave} disabled={saving} className="px-4 py-1.5 text-sm font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 inline-flex items-center gap-2">
            {saving && <div className="h-3.5 w-3.5 animate-spin rounded-full border-b-2 border-white" />}
            {saving ? t('resumeLibrary.detail.edit.saving', 'Saving...') : t('resumeLibrary.detail.edit.save', 'Save Changes')}
          </button>
        </div>
      </div>

      {/* Basic Info */}
      <Section title={t('resumeLibrary.detail.edit.basicInfo', 'Basic Information')}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>{t('resumeLibrary.detail.edit.name', 'Full Name')}</label>
            <input type="text" value={form.name || ''} onChange={e => updateField('name', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t('resumeLibrary.detail.edit.email', 'Email')}</label>
            <input type="email" value={form.email || ''} onChange={e => updateField('email', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t('resumeLibrary.detail.edit.phone', 'Phone')}</label>
            <input type="text" value={form.phone || ''} onChange={e => updateField('phone', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t('resumeLibrary.detail.edit.currentRole', 'Current Role')}</label>
            <input type="text" value={form.currentRole || ''} onChange={e => updateField('currentRole', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t('resumeLibrary.detail.edit.experienceYears', 'Years of Experience')}</label>
            <input type="text" value={form.experienceYears || ''} onChange={e => updateField('experienceYears', e.target.value)} className={inputClass} />
          </div>
        </div>
      </Section>

      {/* Summary */}
      <Section title={t('resumeLibrary.detail.overview.summary', 'Professional Summary')}>
        <textarea
          value={form.summary || ''}
          onChange={e => updateField('summary', e.target.value)}
          rows={4}
          className={inputClass + ' resize-y'}
        />
      </Section>

      {/* Skills */}
      <Section title={t('resumeLibrary.detail.overview.skills', 'Skills')}>
        <textarea
          value={form.skills || ''}
          onChange={e => updateField('skills', e.target.value)}
          rows={3}
          placeholder={t('resumeLibrary.detail.edit.skillsPlaceholder', 'Comma-separated skills...')}
          className={inputClass + ' resize-y'}
        />
      </Section>

      {/* Experience */}
      <Section title={t('resumeLibrary.detail.overview.experience', 'Work Experience')}>
        <div className="space-y-4">
          {(form.experience || []).map((exp: any, i: number) => (
            <div key={i} className="relative border border-gray-100 rounded-lg p-4 bg-gray-50/50">
              <button onClick={() => removeExperience(i)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>{t('resumeLibrary.detail.edit.role', 'Role')}</label>
                  <input type="text" value={exp.role || ''} onChange={e => updateExperience(i, 'role', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>{t('resumeLibrary.detail.edit.company', 'Company')}</label>
                  <input type="text" value={exp.company || ''} onChange={e => updateExperience(i, 'company', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>{t('resumeLibrary.detail.edit.location', 'Location')}</label>
                  <input type="text" value={exp.location || ''} onChange={e => updateExperience(i, 'location', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>{t('resumeLibrary.detail.edit.startDate', 'Start Date')}</label>
                  <input type="text" value={exp.startDate || ''} onChange={e => updateExperience(i, 'startDate', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>{t('resumeLibrary.detail.edit.endDate', 'End Date')}</label>
                  <input type="text" value={exp.endDate || ''} onChange={e => updateExperience(i, 'endDate', e.target.value)} className={inputClass} />
                </div>
              </div>
              <div className="mt-3">
                <label className={labelClass}>{t('resumeLibrary.detail.edit.description', 'Description')}</label>
                <textarea value={exp.description || ''} onChange={e => updateExperience(i, 'description', e.target.value)} rows={3} className={inputClass + ' resize-y'} />
              </div>
              <div className="mt-3">
                <label className={labelClass}>{t('resumeLibrary.detail.edit.achievements', 'Achievements (one per line)')}</label>
                <textarea value={exp.achievements || ''} onChange={e => updateExperience(i, 'achievements', e.target.value)} rows={3} placeholder={t('resumeLibrary.detail.edit.achievementsPlaceholder', 'One achievement per line...')} className={inputClass + ' resize-y'} />
              </div>
              <div className="mt-3">
                <label className={labelClass}>{t('resumeLibrary.detail.edit.technologies', 'Technologies (comma-separated)')}</label>
                <input type="text" value={exp.technologies || ''} onChange={e => updateExperience(i, 'technologies', e.target.value)} placeholder={t('resumeLibrary.detail.edit.technologiesPlaceholder', 'React, Node.js, PostgreSQL...')} className={inputClass} />
              </div>
            </div>
          ))}
          <button onClick={addExperience} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            {t('resumeLibrary.detail.edit.addExperience', 'Add Experience')}
          </button>
        </div>
      </Section>

      {/* Education */}
      <Section title={t('resumeLibrary.detail.overview.education', 'Education')}>
        <div className="space-y-4">
          {(form.education || []).map((edu: any, i: number) => (
            <div key={i} className="relative border border-gray-100 rounded-lg p-4 bg-gray-50/50">
              <button onClick={() => removeEducation(i)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>{t('resumeLibrary.detail.edit.degree', 'Degree')}</label>
                  <input type="text" value={edu.degree || ''} onChange={e => updateEducation(i, 'degree', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>{t('resumeLibrary.detail.edit.institution', 'Institution')}</label>
                  <input type="text" value={edu.institution || ''} onChange={e => updateEducation(i, 'institution', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>{t('resumeLibrary.detail.edit.fieldOfStudy', 'Field of Study')}</label>
                  <input type="text" value={edu.field || ''} onChange={e => updateEducation(i, 'field', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>{t('resumeLibrary.detail.edit.graduationDate', 'Graduation Date')}</label>
                  <input type="text" value={edu.endDate || ''} onChange={e => updateEducation(i, 'endDate', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>{t('resumeLibrary.detail.edit.gpa', 'GPA')}</label>
                  <input type="text" value={edu.gpa || ''} onChange={e => updateEducation(i, 'gpa', e.target.value)} className={inputClass} />
                </div>
              </div>
            </div>
          ))}
          <button onClick={addEducation} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            {t('resumeLibrary.detail.edit.addEducation', 'Add Education')}
          </button>
        </div>
      </Section>

      {/* Certifications */}
      <Section title={t('resumeLibrary.detail.overview.certifications', 'Certifications')}>
        <div className="space-y-4">
          {(form.certifications || []).map((cert: any, i: number) => (
            <div key={i} className="relative border border-gray-100 rounded-lg p-4 bg-gray-50/50">
              <button onClick={() => removeCertification(i)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>{t('resumeLibrary.detail.edit.certName', 'Certification Name')}</label>
                  <input type="text" value={cert.name || ''} onChange={e => updateCertification(i, 'name', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>{t('resumeLibrary.detail.edit.certIssuer', 'Issuer')}</label>
                  <input type="text" value={cert.issuer || ''} onChange={e => updateCertification(i, 'issuer', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>{t('resumeLibrary.detail.edit.certDate', 'Date')}</label>
                  <input type="text" value={cert.date || ''} onChange={e => updateCertification(i, 'date', e.target.value)} className={inputClass} />
                </div>
              </div>
            </div>
          ))}
          <button onClick={addCertification} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            {t('resumeLibrary.detail.edit.addCertification', 'Add Certification')}
          </button>
        </div>
      </Section>

      {/* Projects */}
      <Section title={t('resumeLibrary.detail.overview.projects', 'Projects')}>
        <div className="space-y-4">
          {(form.projects || []).map((proj: any, i: number) => (
            <div key={i} className="relative border border-gray-100 rounded-lg p-4 bg-gray-50/50">
              <button onClick={() => removeProject(i)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className={labelClass}>{t('resumeLibrary.detail.edit.projectName', 'Project Name')}</label>
                  <input type="text" value={proj.name || ''} onChange={e => updateProject(i, 'name', e.target.value)} className={inputClass} />
                </div>
              </div>
              <div className="mt-3">
                <label className={labelClass}>{t('resumeLibrary.detail.edit.projectDescription', 'Description')}</label>
                <textarea value={proj.description || ''} onChange={e => updateProject(i, 'description', e.target.value)} rows={3} className={inputClass + ' resize-y'} />
              </div>
              <div className="mt-3">
                <label className={labelClass}>{t('resumeLibrary.detail.edit.technologies', 'Technologies (comma-separated)')}</label>
                <input type="text" value={proj.technologies || ''} onChange={e => updateProject(i, 'technologies', e.target.value)} placeholder={t('resumeLibrary.detail.edit.technologiesPlaceholder', 'React, Node.js, PostgreSQL...')} className={inputClass} />
              </div>
            </div>
          ))}
          <button onClick={addProject} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            {t('resumeLibrary.detail.edit.addProject', 'Add Project')}
          </button>
        </div>
      </Section>

      {/* Bottom save bar */}
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
          {t('resumeLibrary.detail.edit.cancel', 'Cancel')}
        </button>
        <button onClick={onSave} disabled={saving} className="px-5 py-2 text-sm font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 inline-flex items-center gap-2">
          {saving && <div className="h-3.5 w-3.5 animate-spin rounded-full border-b-2 border-white" />}
          {saving ? t('resumeLibrary.detail.edit.saving', 'Saving...') : t('resumeLibrary.detail.edit.save', 'Save Changes')}
        </button>
      </div>
    </div>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function OverviewTab({ parsed, t, onReparse, reparseLoading }: { parsed: Record<string, unknown> | null; t: (k: string, f?: any) => string; onReparse?: () => void; reparseLoading?: boolean }) {
  if (!parsed) return <div className="text-center py-12 text-gray-500">No parsed data available</div>;

  const parseWarning = hasResumeParseWarning(parsed);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markdownContent = parsedDataToMarkdown(parsed as Record<string, any>);

  return (
    <div className="space-y-6">
      {parseWarning && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008v.008H12v-.008zm9-3.758a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-amber-900">
                {t('resumeLibrary.detail.parseWarningTitle', 'Resume parsing needs review')}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-amber-800">
                {t('resumeLibrary.detail.parseWarningDesc', 'Structured fields for this resume may be incomplete or incorrect. Review the original resume text before using it for matching or interview decisions.')}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {onReparse && (
          <div className="flex justify-end mb-3">
            <button
              onClick={onReparse}
              disabled={reparseLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              {reparseLoading ? (
                <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-slate-500" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              {t('resumeLibrary.detail.reparse', 'Re-parse Resume')}
            </button>
          </div>
        )}
        <ResumeRenderer content={markdownContent} />
      </div>
    </div>
  );
}

// ─── Insights Tab ────────────────────────────────────────────────────────

function InsightsTab({ data, loading, onGenerate, t }: { data: Record<string, unknown> | null; loading: boolean; onGenerate: () => void; t: (k: string, f: string) => string }) {
  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4" />
        <p className="text-sm text-gray-500">{t('resumeLibrary.insights.generating', 'Analyzing resume...')}</p>
        <p className="text-xs text-gray-500 mt-1">{t('resumeLibrary.insights.generatingDesc', 'This may take 10-15 seconds')}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16">
        <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <button onClick={onGenerate} className="px-6 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">
          {t('resumeLibrary.insights.generate', 'Generate AI Insights')}
        </button>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insight = data as Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trajectory = insight.careerTrajectory as Record<string, any> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const salary = insight.salaryEstimate as Record<string, any> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const market = insight.marketCompetitiveness as Record<string, any> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sd = insight.strengthsAndDevelopment as Record<string, any> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const culture = insight.cultureFitIndicators as Record<string, any> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const redFlags = (insight.redFlags || []) as Array<Record<string, any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roles = (insight.recommendedRoles || []) as Array<Record<string, any>>;

  const directionColor = (d: string) => {
    if (d === 'Upward') return 'bg-emerald-100 text-emerald-700';
    if (d === 'Career Change') return 'bg-blue-100 text-blue-700';
    if (d === 'Declining') return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-700';
  };

  const scoreColor = (s: number) => {
    if (s >= 80) return 'text-emerald-600';
    if (s >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Executive Summary */}
      {insight.executiveSummary && (
        <Section title={t('resumeLibrary.insights.executiveSummary', 'Executive Summary')}>
          <p className="text-sm text-gray-700 leading-relaxed">{insight.executiveSummary as string}</p>
        </Section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Career Trajectory */}
        {trajectory && (
          <Section title={t('resumeLibrary.insights.careerTrajectory', 'Career Trajectory')}>
            <span className={`inline-block text-xs font-medium px-3 py-1 rounded-full mb-3 ${directionColor(trajectory.direction as string)}`}>
              {trajectory.direction as string}
            </span>
            <p className="text-sm text-gray-700 mb-2">{trajectory.analysis as string}</p>
            {trajectory.progressionRate && (
              <p className="text-xs text-gray-500"><strong>Rate:</strong> {trajectory.progressionRate as string}</p>
            )}
            {Array.isArray(trajectory.keyTransitions) && trajectory.keyTransitions.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-gray-500 mb-1">Key Transitions:</p>
                <ul className="space-y-1">
                  {(trajectory.keyTransitions as string[]).map((tr, i) => (
                    <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5"><span className="text-indigo-400">•</span>{tr}</li>
                  ))}
                </ul>
              </div>
            )}
          </Section>
        )}

        {/* Salary Estimate */}
        {salary && (
          <Section title={t('resumeLibrary.insights.salaryEstimate', 'Salary Estimate')}>
            <div className="text-center mb-3">
              <span className="text-2xl font-bold text-gray-900">{salary.rangeLow as string}</span>
              <span className="text-gray-400 mx-2">—</span>
              <span className="text-2xl font-bold text-gray-900">{salary.rangeHigh as string}</span>
              <span className="text-xs text-gray-500 ml-2">{salary.currency as string}</span>
            </div>
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full mb-2 ${
              salary.confidence === 'High' ? 'bg-emerald-100 text-emerald-700' : salary.confidence === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {salary.confidence as string} confidence
            </span>
            {salary.marketContext && <p className="text-xs text-gray-500 mt-2">{salary.marketContext as string}</p>}
          </Section>
        )}

        {/* Market Competitiveness */}
        {market && (
          <Section title={t('resumeLibrary.insights.marketCompetitiveness', 'Market Competitiveness')}>
            <div className="flex items-center gap-3 mb-3">
              <span className={`text-3xl font-bold ${scoreColor(market.score as number)}`}>{market.score as number}</span>
              <span className="text-sm text-gray-600">/100 — {market.level as string}</span>
            </div>
            {Array.isArray(market.inDemandSkills) && market.inDemandSkills.length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-medium text-emerald-600 mb-1">In-Demand Skills:</p>
                <div className="flex flex-wrap gap-1">
                  {(market.inDemandSkills as string[]).map((s, i) => <span key={i} className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">{s}</span>)}
                </div>
              </div>
            )}
            {Array.isArray(market.rareSkills) && market.rareSkills.length > 0 && (
              <div>
                <p className="text-xs font-medium text-indigo-600 mb-1">Rare Skills:</p>
                <div className="flex flex-wrap gap-1">
                  {(market.rareSkills as string[]).map((s, i) => <span key={i} className="text-[11px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{s}</span>)}
                </div>
              </div>
            )}
          </Section>
        )}

        {/* Culture Fit */}
        {culture && (
          <Section title={t('resumeLibrary.insights.cultureFit', 'Culture Fit Indicators')}>
            {Array.isArray(culture.workStyle) && culture.workStyle.length > 0 && (
              <div className="mb-2"><span className="text-xs font-medium text-gray-500">Work Style: </span>{(culture.workStyle as string[]).join(', ')}</div>
            )}
            {Array.isArray(culture.values) && culture.values.length > 0 && (
              <div className="mb-2"><span className="text-xs font-medium text-gray-500">Values: </span>{(culture.values as string[]).join(', ')}</div>
            )}
            {culture.managementStyle && (
              <div><span className="text-xs font-medium text-gray-500">Management: </span>{culture.managementStyle as string}</div>
            )}
          </Section>
        )}
      </div>

      {/* Strengths & Development */}
      {sd && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Section title={t('resumeLibrary.insights.strengths', 'Core Strengths')}>
            {Array.isArray(sd.coreStrengths) && (sd.coreStrengths as Array<Record<string, string>>).map((s, i) => (
              <div key={i} className="mb-3 last:mb-0">
                <h4 className="text-sm font-semibold text-emerald-700">{s.strength}</h4>
                <p className="text-xs text-gray-600 mt-0.5">{s.evidence}</p>
                <p className="text-xs text-gray-500 mt-0.5">Impact: {s.impact}</p>
              </div>
            ))}
          </Section>
          <Section title={t('resumeLibrary.insights.development', 'Development Areas')}>
            {Array.isArray(sd.developmentAreas) && (sd.developmentAreas as Array<Record<string, string>>).map((d, i) => (
              <div key={i} className="mb-3 last:mb-0">
                <h4 className="text-sm font-semibold text-amber-700">{d.area}</h4>
                <p className="text-xs text-gray-600 mt-0.5">Current: {d.currentLevel}</p>
                <p className="text-xs text-gray-500 mt-0.5">{d.recommendation}</p>
              </div>
            ))}
          </Section>
        </div>
      )}

      {/* Red Flags */}
      {redFlags.length > 0 && (
        <Section title={t('resumeLibrary.insights.redFlags', 'Red Flags')}>
          <div className="space-y-3">
            {redFlags.map((f, i) => (
              <div key={i} className={`rounded-lg p-3 ${f.severity === 'High' ? 'bg-red-50' : f.severity === 'Medium' ? 'bg-amber-50' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    f.severity === 'High' ? 'bg-red-100 text-red-700' : f.severity === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-600'
                  }`}>{f.severity as string}</span>
                  <span className="text-sm font-medium text-gray-800">{f.flag as string}</span>
                </div>
                <p className="text-xs text-gray-600">{f.details as string}</p>
                {f.mitigatingFactors && <p className="text-xs text-gray-500 mt-1">Mitigating: {f.mitigatingFactors as string}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}
      {redFlags.length === 0 && data && (
        <Section title={t('resumeLibrary.insights.redFlags', 'Red Flags')}>
          <p className="text-sm text-emerald-600">{t('resumeLibrary.insights.noRedFlags', 'No red flags identified')}</p>
        </Section>
      )}

      {/* Recommended Roles */}
      {roles.length > 0 && (
        <Section title={t('resumeLibrary.insights.recommendedRoles', 'Recommended Roles')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {roles.map((r, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-3">
                <h4 className="text-sm font-semibold text-gray-900">{r.roleType as string}</h4>
                <p className="text-xs text-indigo-600">{r.industry as string} · {r.seniorityLevel as string}</p>
                <p className="text-xs text-gray-500 mt-1">{r.fitReason as string}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Re-generate */}
      {data && (
        <div className="text-center pt-2">
          <button onClick={onGenerate} className="text-xs text-gray-400 hover:text-indigo-600 transition-colors">
            {t('resumeLibrary.insights.regenerate', 'Regenerate insights')}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Job Fit Tab ─────────────────────────────────────────────────────────

function JobFitTab({ data, loading, onAnalyze, onInvite, invitationsMap, t }: { data: Record<string, unknown> | null; loading: boolean; onAnalyze: () => void; onInvite: (hiringRequestId: string, title: string) => void; invitationsMap: Record<string, InvitationRecord>; t: (k: string, f: string, opts?: Record<string, unknown>) => string }) {
  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4" />
        <p className="text-sm text-gray-500">{t('resumeLibrary.jobFit.analyzing', 'Matching against your hiring requests...')}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16">
        <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
        <button onClick={onAnalyze} className="px-6 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">
          {t('resumeLibrary.jobFit.analyze', 'Analyze Job Fit')}
        </button>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fitData = data as { fits?: Array<Record<string, any>>; bestFit?: Record<string, any> | null; candidateSummary?: string };
  const fits = fitData.fits || [];

  if (fits.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-gray-500 mb-2">{t('resumeLibrary.jobFit.noActiveRequests', 'No active hiring requests found')}</p>
        <p className="text-xs text-gray-500">{t('resumeLibrary.jobFit.noActiveRequestsDesc', 'Create a hiring request first to see job fit analysis')}</p>
      </div>
    );
  }

  const verdictColor = (v: string) => {
    if (v === 'Strong Fit') return 'bg-emerald-100 text-emerald-700';
    if (v === 'Good Fit') return 'bg-blue-100 text-blue-700';
    if (v === 'Moderate Fit') return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      {fitData.candidateSummary && (
        <div className="bg-indigo-50 rounded-xl p-4">
          <p className="text-sm text-indigo-800">{fitData.candidateSummary}</p>
        </div>
      )}

      {/* Best Fit */}
      {fitData.bestFit && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span className="text-sm font-semibold text-emerald-800">{t('resumeLibrary.jobFit.bestFit', 'Best Fit')}: {fitData.bestFit.hiringRequestTitle as string}</span>
          </div>
          <p className="text-xs text-emerald-700 ml-7">{fitData.bestFit.reason as string}</p>
        </div>
      )}

      {/* Fit List */}
      <div className="space-y-4">
        {fits.map((fit, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{fit.hiringRequestTitle as string}</h3>
                <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-1 ${verdictColor(fit.verdict as string)}`}>
                  {fit.verdict as string}
                </span>
              </div>
              <div className="text-right">
                <span className={`text-2xl font-bold ${(fit.fitScore as number) >= 80 ? 'text-emerald-600' : (fit.fitScore as number) >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                  {fit.fitScore as number}
                </span>
                <span className="text-sm text-gray-500">/100</span>
                {fit.fitGrade && <p className="text-xs text-gray-500">{fit.fitGrade as string}</p>}
              </div>
            </div>

            {/* Matched / Missing */}
            <div className="grid grid-cols-2 gap-4 mb-3">
              {Array.isArray(fit.matchedSkills) && (fit.matchedSkills as string[]).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-emerald-600 mb-1">{t('resumeLibrary.jobFit.matchedSkills', 'Matched Skills')}</p>
                  <div className="flex flex-wrap gap-1">
                    {(fit.matchedSkills as string[]).slice(0, 6).map((s, j) => <span key={j} className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">{s}</span>)}
                  </div>
                </div>
              )}
              {Array.isArray(fit.missingCriticalSkills) && (fit.missingCriticalSkills as string[]).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-600 mb-1">{t('resumeLibrary.jobFit.missingSkills', 'Missing Critical')}</p>
                  <div className="flex flex-wrap gap-1">
                    {(fit.missingCriticalSkills as string[]).map((s, j) => <span key={j} className="text-[11px] bg-red-50 text-red-700 px-2 py-0.5 rounded-full">{s}</span>)}
                  </div>
                </div>
              )}
            </div>

            {fit.experienceAlignment && <p className="text-xs text-gray-600 mb-2">{fit.experienceAlignment as string}</p>}

            {/* Experience Breakdown */}
            {(fit.fullTimeExperience || fit.internshipExperience) && (
              <div className="flex gap-3 mb-3">
                {fit.fullTimeExperience && (
                  <span className="text-[11px] bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">
                    {t('resumeLibrary.jobFit.fullTime', 'Full-time')}: {fit.fullTimeExperience as string}
                  </span>
                )}
                {fit.internshipExperience && (
                  <span className="text-[11px] bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full">
                    {t('resumeLibrary.jobFit.internship', 'Internship')}: {fit.internshipExperience as string}
                  </span>
                )}
              </div>
            )}

            {/* Hard Requirement Gaps */}
            {Array.isArray(fit.hardRequirementGaps) && (fit.hardRequirementGaps as Array<Record<string, string>>).length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-red-600 mb-1.5">{t('resumeLibrary.jobFit.hardGaps', 'Hard Requirement Gaps')}</p>
                <div className="space-y-1.5">
                  {(fit.hardRequirementGaps as Array<Record<string, string>>).map((gap, j) => (
                    <div key={j} className={`text-xs rounded-lg p-2 ${
                      gap.severity === 'dealbreaker' ? 'bg-red-50 text-red-700' :
                      gap.severity === 'significant' ? 'bg-orange-50 text-orange-700' :
                      'bg-yellow-50 text-yellow-700'
                    }`}>
                      <span className="font-medium">{gap.requirement}</span>
                      <span className="text-gray-500"> — </span>
                      <span>{gap.candidateStatus}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Transferable Skills */}
            {Array.isArray(fit.transferableSkills) && (fit.transferableSkills as Array<Record<string, string>>).length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-blue-600 mb-1.5">{t('resumeLibrary.jobFit.transferable', 'Transferable Skills')}</p>
                <div className="space-y-1.5">
                  {(fit.transferableSkills as Array<Record<string, string>>).map((ts, j) => (
                    <div key={j} className="text-xs bg-blue-50 text-blue-700 rounded-lg p-2">
                      <span className="font-medium">{ts.candidateHas}</span>
                      <span className="text-gray-400 mx-1">→</span>
                      <span>{ts.required}</span>
                      {ts.relevance && <p className="text-blue-500 mt-0.5">{ts.relevance}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top Reasons */}
            {Array.isArray(fit.topReasons) && (fit.topReasons as string[]).length > 0 && (
              <ul className="space-y-1 mb-2">
                {(fit.topReasons as string[]).map((r, j) => (
                  <li key={j} className="text-xs text-gray-600 flex items-start gap-1.5"><span className="text-indigo-400">•</span>{r}</li>
                ))}
              </ul>
            )}

            {fit.recommendation && (
              <div className="bg-gray-50 rounded-lg px-3 py-2 mt-2">
                <p className="text-xs text-gray-700"><strong>{t('resumeLibrary.jobFit.recommendation', 'Recommendation')}:</strong> {fit.recommendation as string}</p>
              </div>
            )}

            {fit.hiringRequestId && (() => {
              const inv = invitationsMap[fit.hiringRequestId as string];
              if (inv) {
                const statusColors: Record<string, string> = {
                  scheduled: 'bg-blue-100 text-blue-700',
                  in_progress: 'bg-amber-100 text-amber-700',
                  completed: 'bg-emerald-100 text-emerald-700',
                  cancelled: 'bg-red-100 text-red-700',
                  expired: 'bg-gray-100 text-gray-500',
                };
                return (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {t('resumeLibrary.jobFit.alreadyInvited', 'Invited on {{date}}', { date: inv.invitedAt ? new Date(inv.invitedAt).toLocaleDateString() : '-' })}
                    </span>
                    {inv.interview && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[inv.interview.status] || 'bg-gray-100 text-gray-600'}`}>
                        {inv.interview.status}
                      </span>
                    )}
                  </div>
                );
              }
              if ((fit.fitScore as number) > 70) {
                return (
                  <button
                    onClick={() => onInvite(fit.hiringRequestId as string, fit.hiringRequestTitle as string)}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                    {t('resumeLibrary.jobFit.inviteInterview', 'Invite to Interview')}
                  </button>
                );
              }
              return null;
            })()}
          </div>
        ))}
      </div>

      {/* Re-analyze */}
      <div className="text-center pt-2">
        <button onClick={onAnalyze} className="text-xs text-gray-400 hover:text-indigo-600 transition-colors">
          {t('resumeLibrary.jobFit.reanalyze', 'Re-analyze job fit')}
        </button>
      </div>
    </div>
  );
}

// ─── Applied Jobs Tab ─────────────────────────────────────────────────

function AppliedJobsTab({ data, loading, onRefresh, resumeId, t }: {
  data: AppliedJobsData | null;
  loading: boolean;
  onRefresh: () => void;
  resumeId: string;
  t: (k: string, f: string, opts?: Record<string, unknown>) => string;
}) {
  const navigate = useNavigate();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  const jobMatches = data?.jobMatches || [];
  // Only show HR fits that have been invited or have an interview
  const hrFits = (data?.hiringRequestFits || []).filter(f => f.pipelineStatus === 'invited' || f.interview);
  const totalCount = jobMatches.length + hrFits.length;

  if (totalCount === 0) {
    return (
      <div className="text-center py-16">
        <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
        <p className="text-sm text-gray-500">{t('resumeLibrary.appliedJobs.empty', 'No job applications yet')}</p>
        <p className="text-xs text-gray-400 mt-1">{t('resumeLibrary.appliedJobs.emptyHint', 'Upload resumes with a job selected, or match this candidate against jobs')}</p>
      </div>
    );
  }

  // Stats
  const appliedCount = jobMatches.filter(m => m.status === 'applied').length;
  const shortlistedCount = jobMatches.filter(m => m.status === 'shortlisted').length;
  const interviewingCount = jobMatches.filter(m => m.status === 'invited' || m.interview).length
    + hrFits.filter(f => f.pipelineStatus === 'invited' || f.interview).length;
  const rejectedCount = jobMatches.filter(m => m.status === 'rejected').length
    + hrFits.filter(f => f.pipelineStatus === 'rejected').length;

  const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
    new: { color: 'text-gray-600', bg: 'bg-gray-100', label: t('resumeLibrary.appliedJobs.status.new', 'New') },
    applied: { color: 'text-blue-700', bg: 'bg-blue-100', label: t('resumeLibrary.appliedJobs.status.applied', 'Applied') },
    reviewed: { color: 'text-indigo-700', bg: 'bg-indigo-100', label: t('resumeLibrary.appliedJobs.status.reviewed', 'Reviewed') },
    shortlisted: { color: 'text-amber-700', bg: 'bg-amber-100', label: t('resumeLibrary.appliedJobs.status.shortlisted', 'Shortlisted') },
    invited: { color: 'text-emerald-700', bg: 'bg-emerald-100', label: t('resumeLibrary.appliedJobs.status.invited', 'Invited') },
    matched: { color: 'text-purple-700', bg: 'bg-purple-100', label: t('resumeLibrary.appliedJobs.status.matched', 'Matched') },
    rejected: { color: 'text-red-700', bg: 'bg-red-100', label: t('resumeLibrary.appliedJobs.status.rejected', 'Rejected') },
  };

  const interviewStatusConfig: Record<string, { color: string; bg: string; label: string }> = {
    scheduled: { color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', label: t('resumeLibrary.appliedJobs.interview.scheduled', 'Scheduled') },
    in_progress: { color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', label: t('resumeLibrary.appliedJobs.interview.inProgress', 'In Progress') },
    completed: { color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', label: t('resumeLibrary.appliedJobs.interview.completed', 'Completed') },
    cancelled: { color: 'text-red-700', bg: 'bg-red-50 border-red-200', label: t('resumeLibrary.appliedJobs.interview.cancelled', 'Cancelled') },
    expired: { color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200', label: t('resumeLibrary.appliedJobs.interview.expired', 'Expired') },
  };

  const handleStatusChange = async (matchId: string, newStatus: string) => {
    setUpdatingId(matchId);
    try {
      await axios.patch(`/api/v1/resumes/${resumeId}/job-matches/${matchId}`, { status: newStatus });
      onRefresh();
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (matchId: string) => {
    setUpdatingId(matchId);
    try {
      await axios.delete(`/api/v1/resumes/${resumeId}/job-matches/${matchId}`);
      onRefresh();
    } catch (err) {
      console.error('Failed to delete match:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const gradeColor = (grade: string | null) => {
    if (!grade) return 'text-gray-400';
    if (grade.startsWith('A')) return 'text-emerald-600';
    if (grade.startsWith('B')) return 'text-blue-600';
    if (grade.startsWith('C')) return 'text-amber-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t('resumeLibrary.appliedJobs.stats.total', 'Total'), value: totalCount, color: 'text-gray-900', bg: 'bg-gray-50 border-gray-200' },
          { label: t('resumeLibrary.appliedJobs.stats.shortlisted', 'Shortlisted'), value: shortlistedCount + appliedCount, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
          { label: t('resumeLibrary.appliedJobs.stats.interviewing', 'Interviewing'), value: interviewingCount, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
          { label: t('resumeLibrary.appliedJobs.stats.rejected', 'Rejected'), value: rejectedCount, color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border px-4 py-3 ${s.bg}`}>
            <p className="text-xs font-medium text-gray-500">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Job Matches */}
      {jobMatches.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
            {t('resumeLibrary.appliedJobs.jobApplications', 'Job Applications')}
          </h4>
          <div className="space-y-2">
            {jobMatches.map(m => {
              const sc = statusConfig[m.status] || statusConfig.new;
              const isc = m.interview ? (interviewStatusConfig[m.interview.status] || interviewStatusConfig.scheduled) : null;
              return (
                <div key={m.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4
                          className="text-sm font-semibold text-gray-900 hover:text-indigo-600 cursor-pointer truncate"
                          onClick={() => navigate(`/product/jobs?id=${m.jobId}`)}
                        >
                          {m.jobTitle}
                        </h4>
                        {m.jobStatus && m.jobStatus !== 'open' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">{m.jobStatus}</span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                        {m.department && <span>{m.department}</span>}
                        {m.location && <span>{m.location}</span>}
                        {m.workType && <span>{m.workType}</span>}
                        {m.employmentType && <span>{m.employmentType}</span>}
                        {m.salaryText ? (
                          <span className="text-gray-600">{m.salaryText}</span>
                        ) : m.salaryMin || m.salaryMax ? (
                          <span className="text-gray-600">
                            {m.salaryCurrency || 'USD'} {m.salaryMin?.toLocaleString() || '—'}–{m.salaryMax?.toLocaleString() || '—'}
                            {m.salaryPeriod === 'yearly' ? '/yr' : '/mo'}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {m.score != null && (
                        <span className={`text-xs font-bold ${gradeColor(m.grade)}`}>
                          {m.grade || m.score}
                        </span>
                      )}
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${sc.bg} ${sc.color}`}>
                        {sc.label}
                      </span>
                    </div>
                  </div>

                  {/* Interview status */}
                  {m.interview && isc && (
                    <div className={`mt-2 rounded-lg border px-3 py-2 flex items-center justify-between ${isc.bg}`}>
                      <div className="flex items-center gap-2 text-xs">
                        <svg className={`w-3.5 h-3.5 ${isc.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                        <span className={`font-medium ${isc.color}`}>{isc.label}</span>
                      </div>
                      {m.interview.scheduledAt && (
                        <span className="text-[11px] text-gray-500">{new Date(m.interview.scheduledAt).toLocaleString()}</span>
                      )}
                    </div>
                  )}

                  {/* Timeline & actions */}
                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-3 text-[11px] text-gray-400">
                      {m.appliedAt && (
                        <span>{t('resumeLibrary.appliedJobs.appliedAt', 'Applied')}: {new Date(m.appliedAt).toLocaleDateString()}</span>
                      )}
                      {m.reviewedAt && (
                        <span>{t('resumeLibrary.appliedJobs.reviewedAt', 'Reviewed')}: {new Date(m.reviewedAt).toLocaleDateString()}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {m.status !== 'shortlisted' && m.status !== 'invited' && m.status !== 'rejected' && (
                        <button
                          onClick={() => handleStatusChange(m.id, 'shortlisted')}
                          disabled={updatingId === m.id}
                          className="text-[11px] font-medium text-amber-600 hover:bg-amber-50 px-2 py-1 rounded-md transition-colors disabled:opacity-50"
                        >
                          {t('resumeLibrary.appliedJobs.actions.shortlist', 'Shortlist')}
                        </button>
                      )}
                      {m.status !== 'rejected' && (
                        <button
                          onClick={() => handleStatusChange(m.id, 'rejected')}
                          disabled={updatingId === m.id}
                          className="text-[11px] font-medium text-red-500 hover:bg-red-50 px-2 py-1 rounded-md transition-colors disabled:opacity-50"
                        >
                          {t('resumeLibrary.appliedJobs.actions.reject', 'Reject')}
                        </button>
                      )}
                      {m.status === 'rejected' && (
                        <button
                          onClick={() => handleStatusChange(m.id, 'applied')}
                          disabled={updatingId === m.id}
                          className="text-[11px] font-medium text-gray-500 hover:bg-gray-50 px-2 py-1 rounded-md transition-colors disabled:opacity-50"
                        >
                          {t('resumeLibrary.appliedJobs.actions.restore', 'Restore')}
                        </button>
                      )}
                      {!['applied', 'shortlisted', 'invited'].includes(m.status) && (
                        <button
                          onClick={() => handleDelete(m.id)}
                          disabled={updatingId === m.id}
                          className="text-[11px] font-medium text-gray-400 hover:text-red-500 hover:bg-red-50 px-2 py-1 rounded-md transition-colors disabled:opacity-50"
                        >
                          {t('resumeLibrary.appliedJobs.actions.delete', 'Delete')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hiring Request Fits */}
      {hrFits.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
            {t('resumeLibrary.appliedJobs.hiringRequestMatches', 'Hiring Request Matches')}
          </h4>
          <div className="space-y-2">
            {hrFits.map(f => {
              const sc = statusConfig[f.pipelineStatus] || statusConfig.matched;
              const isc = f.interview ? (interviewStatusConfig[f.interview.status] || interviewStatusConfig.scheduled) : null;
              return (
                <div key={f.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-semibold text-gray-900 truncate">{f.hiringRequestTitle}</h4>
                      <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                        {f.hiringRequestStatus && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{f.hiringRequestStatus}</span>
                        )}
                        {f.invitedAt && (
                          <span>{t('resumeLibrary.appliedJobs.invitedAt', 'Invited')}: {new Date(f.invitedAt).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {f.fitScore != null && (
                        <span className={`text-xs font-bold ${gradeColor(f.fitGrade)}`}>
                          {f.fitGrade} {f.fitScore}
                        </span>
                      )}
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${sc.bg} ${sc.color}`}>
                        {sc.label}
                      </span>
                    </div>
                  </div>
                  {f.interview && isc && (
                    <div className={`mt-2 rounded-lg border px-3 py-2 flex items-center justify-between ${isc.bg}`}>
                      <div className="flex items-center gap-2 text-xs">
                        <svg className={`w-3.5 h-3.5 ${isc.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                        <span className={`font-medium ${isc.color}`}>{isc.label}</span>
                      </div>
                      {f.interview.scheduledAt && (
                        <span className="text-[11px] text-gray-500">{new Date(f.interview.scheduledAt).toLocaleString()}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Invitations Tab ──────────────────────────────────────────────────

function InvitationsTab({ invitations, resumeText, onRefresh, t }: { invitations: InvitationRecord[]; resumeText?: string; onRefresh?: () => void; t: (k: string, f: string, opts?: Record<string, unknown>) => string }) {
  const [viewingInvite, setViewingInvite] = useState<InvitationRecord | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendResult, setResendResult] = useState<{ id: string; success: boolean; message: string } | null>(null);

  const handleResend = async (inv: InvitationRecord) => {
    if (!resumeText) return;
    setResendingId(inv.id);
    setResendResult(null);
    try {
      const hrRes = await axios.get(`/api/v1/hiring-requests/${inv.hiringRequestId}`);
      const hr = hrRes.data.data;
      const jdText = hr.jobDescription || hr.requirements || inv.hiringRequestTitle;
      const candidateEmail = inv.inviteData?.email || undefined;
      const res = await axios.post('/api/v1/invite-candidate', {
        resume: resumeText,
        jd: jdText,
        recruiter_email: candidateEmail,
      });
      if (res.data.success) {
        setResendResult({ id: inv.id, success: true, message: t('resumeLibrary.detail.invitations.resendSuccess', 'Invitation resent successfully!') });
        onRefresh?.();
      } else {
        setResendResult({ id: inv.id, success: false, message: res.data.error || 'Failed' });
      }
    } catch (err: any) {
      setResendResult({ id: inv.id, success: false, message: err?.response?.data?.error || 'Failed to resend' });
    } finally {
      setResendingId(null);
    }
  };

  if (invitations.length === 0) {
    return (
      <div className="text-center py-16">
        <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
        <p className="text-sm text-gray-500">{t('resumeLibrary.detail.invitations.noInvitations', 'No invitations sent yet')}</p>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-amber-100 text-amber-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-700',
    expired: 'bg-gray-100 text-gray-500',
  };

  return (
    <>
      <div className="space-y-3">
        {invitations.map((inv) => (
          <div key={inv.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-semibold text-gray-900">{inv.hiringRequestTitle}</h4>
                <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                  <span>{t('resumeLibrary.detail.invitations.invitedAt', 'Invited')}: {inv.invitedAt ? new Date(inv.invitedAt).toLocaleString() : '-'}</span>
                  {inv.fitScore != null && (
                    <span className="text-indigo-600 font-medium">{t('resumeLibrary.jobFit.score', 'Score')}: {inv.fitScore}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {inv.interview ? (
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColors[inv.interview.status] || 'bg-gray-100 text-gray-600'}`}>
                    {t(`resumeLibrary.detail.invitations.status.${inv.interview.status}`, inv.interview.status)}
                  </span>
                ) : (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">
                    {t('resumeLibrary.detail.invitations.status.scheduled', 'Scheduled')}
                  </span>
                )}
              </div>
            </div>
            {inv.interview?.completedAt && (
              <p className="mt-2 text-xs text-gray-400">
                {t('resumeLibrary.detail.invitations.completedAt', 'Completed')}: {new Date(inv.interview.completedAt).toLocaleString()}
              </p>
            )}

            {/* Resend result toast */}
            {resendResult?.id === inv.id && (
              <div className={`mt-2 rounded-lg px-3 py-2 text-xs font-medium ${resendResult.success ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {resendResult.message}
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-3 flex items-center gap-2 pt-2 border-t border-gray-100">
              {inv.inviteData && (
                <button
                  onClick={() => setViewingInvite(inv)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {t('resumeLibrary.detail.invitations.viewResult', 'View Result')}
                </button>
              )}
              <button
                onClick={() => handleResend(inv)}
                disabled={resendingId === inv.id}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-800 px-3 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors disabled:opacity-50"
              >
                {resendingId === inv.id ? (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-b-2 border-emerald-600" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                )}
                {resendingId === inv.id
                  ? t('resumeLibrary.detail.invitations.resending', 'Sending...')
                  : t('resumeLibrary.detail.invitations.resendEmail', 'Resend Email')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* View Invitation Result Modal */}
      {viewingInvite && viewingInvite.inviteData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setViewingInvite(null)}>
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {t('resumeLibrary.detail.invitations.invitationResult', 'Invitation Result')}
              </h3>
              <button
                onClick={() => setViewingInvite(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Candidate info */}
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-sm font-medium text-gray-900">{viewingInvite.inviteData.name || viewingInvite.inviteData.display_name || '-'}</p>
                {viewingInvite.inviteData.email && <p className="text-xs text-gray-500 mt-0.5">{viewingInvite.inviteData.email}</p>}
                {viewingInvite.inviteData.company_name && <p className="text-xs text-gray-500">{viewingInvite.inviteData.company_name}</p>}
              </div>

              {/* Success badge */}
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span className="text-sm font-semibold text-emerald-800">{t('resumeLibrary.detail.invite.success', 'Invitation sent successfully!')}</span>
                </div>
                {viewingInvite.inviteData.job_title && (
                  <p className="text-xs text-emerald-700">{t('resumeLibrary.detail.invite.position', 'Position')}: {viewingInvite.inviteData.job_title}</p>
                )}
                {viewingInvite.invitedAt && (
                  <p className="text-xs text-emerald-600 mt-1">{t('resumeLibrary.detail.invitations.invitedAt', 'Invited')}: {new Date(viewingInvite.invitedAt).toLocaleString()}</p>
                )}
              </div>

              {/* Interview link */}
              {viewingInvite.inviteData.login_url && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('resumeLibrary.detail.invite.interviewLink', 'Interview Link')}</label>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={viewingInvite.inviteData.login_url}
                      className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 font-mono"
                    />
                    <button
                      onClick={() => { navigator.clipboard.writeText(viewingInvite.inviteData!.login_url); }}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      {t('actions.copy', 'Copy')}
                    </button>
                  </div>
                </div>
              )}

              {/* QR Code */}
              {viewingInvite.inviteData.qrcode_url && (
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-2">{t('resumeLibrary.detail.invite.qrCode', 'WeChat QR Code')}</p>
                  <img src={viewingInvite.inviteData.qrcode_url} alt="QR Code" className="w-32 h-32 mx-auto rounded-lg border border-gray-200" />
                </div>
              )}

              {/* Invitation message */}
              {viewingInvite.inviteData.message && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('resumeLibrary.detail.invitations.emailMessage', 'Email Message')}</label>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {viewingInvite.inviteData.message}
                  </div>
                </div>
              )}

              {/* Job summary */}
              {viewingInvite.inviteData.job_summary && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('resumeLibrary.detail.invitations.jobSummary', 'Job Summary')}</label>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {viewingInvite.inviteData.job_summary}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setViewingInvite(null)}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  {t('resumeLibrary.detail.invite.done', 'Done')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Shared Section component ─────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">{title}</h3>
      <div className="text-sm text-gray-700">{children}</div>
    </div>
  );
}
