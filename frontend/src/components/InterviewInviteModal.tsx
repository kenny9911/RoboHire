import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { IconX, IconCircleCheck } from '@tabler/icons-react';
import axios from '../lib/axios';
import { useAuth } from '../context/AuthContext';

interface InterviewInviteModalProps {
  resumeId: string;
  candidateName: string;
  candidateEmail?: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function InterviewInviteModal({ resumeId, candidateName, candidateEmail, onClose, onSuccess }: InterviewInviteModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [jobs, setJobs] = useState<Array<{ id: string; title: string; description: string | null }>>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [jobsLoading, setJobsLoading] = useState(true);
  const [resumeText, setResumeText] = useState<string | null>(null);
  const [resumeLoading, setResumeLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  // Fetch jobs and resume text on mount
  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const res = await axios.get('/api/v1/jobs', { params: { status: 'open', limit: 50 } });
        const list = (res.data.data || []).map((j: any) => ({ id: j.id, title: j.title, description: j.description }));
        setJobs(list);
        if (list.length > 0) setSelectedJobId(list[0].id);
      } catch {
        setJobs([]);
      } finally {
        setJobsLoading(false);
      }
    };

    const fetchResume = async () => {
      try {
        const res = await axios.get(`/api/v1/resumes/${resumeId}`);
        setResumeText(res.data.data?.resumeText || null);
      } catch {
        setResumeText(null);
      } finally {
        setResumeLoading(false);
      }
    };

    fetchJobs();
    fetchResume();
  }, [resumeId]);

  const handleSend = async () => {
    if (!selectedJobId || !resumeText) return;
    const selectedJob = jobs.find(j => j.id === selectedJobId);
    if (!selectedJob) return;
    setSending(true);
    setError('');
    try {
      const res = await axios.post('/api/v1/invite-candidate', {
        resume: resumeText,
        jd: selectedJob.description || selectedJob.title,
        candidate_email: candidateEmail || undefined,
        recruiter_email: user?.email || undefined,
        resume_id: resumeId,
      });
      if (res.data.success) {
        setResult(res.data.data);
        onSuccess?.();
      } else {
        setError(res.data.error || 'Failed to send invitation');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to send invitation');
    } finally {
      setSending(false);
    }
  };

  const loading = jobsLoading || resumeLoading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {t('resumeLibrary.detail.invite.title', 'Invite to Interview')}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <IconX size={20} stroke={2} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Candidate info */}
          <div className="rounded-xl bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-900">{candidateName}</p>
            {candidateEmail && <p className="text-xs text-gray-500 mt-0.5">{candidateEmail}</p>}
          </div>

          {!result ? (
            <>
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
                  <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-indigo-600" />
                  {t('common.loading', 'Loading...')}
                </div>
              ) : !resumeText ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {t('resumeLibrary.detail.invite.noResumeText', 'Could not load resume text. Please try from the candidate detail page.')}
                </div>
              ) : (
                <>
                  {/* Job selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {t('resumeLibrary.detail.invite.selectJob', 'Select a job position')}
                    </label>
                    {jobs.length === 0 ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                        {t('resumeLibrary.detail.invite.noJobs', 'No open jobs found. Please create and publish a job first.')}
                      </div>
                    ) : (
                      <select
                        value={selectedJobId}
                        onChange={e => setSelectedJobId(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      >
                        {jobs.map(j => (
                          <option key={j.id} value={j.id}>{j.title}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {error && (
                    <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
                  )}

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      onClick={onClose}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {t('resumeLibrary.detail.invite.cancel', 'Cancel')}
                    </button>
                    <button
                      onClick={handleSend}
                      disabled={sending || !selectedJobId || jobs.length === 0}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
                    >
                      {sending && <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />}
                      {sending
                        ? t('resumeLibrary.detail.invite.sending', 'Sending...')
                        : t('resumeLibrary.detail.invite.send', 'Send Invitation')}
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            /* Success result */
            <div className="space-y-4">
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <IconCircleCheck size={20} stroke={2} className="text-emerald-600" />
                  <span className="text-sm font-semibold text-emerald-800">{t('resumeLibrary.detail.invite.success', 'Invitation sent successfully!')}</span>
                </div>
                {(result as any).job_title && (
                  <p className="text-xs text-emerald-700">{t('resumeLibrary.detail.invite.position', 'Position')}: {(result as any).job_title}</p>
                )}
              </div>

              {(result as any).login_url && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('resumeLibrary.detail.invite.interviewLink', 'Interview Link')}</label>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={(result as any).login_url}
                      className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 font-mono"
                    />
                    <button
                      onClick={() => { navigator.clipboard.writeText((result as any).login_url); }}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      {t('actions.copy', 'Copy')}
                    </button>
                  </div>
                </div>
              )}

              {(result as any).qrcode_url && (
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-2">{t('resumeLibrary.detail.invite.qrCode', 'WeChat QR Code')}</p>
                  <img src={(result as any).qrcode_url} alt="QR Code" className="w-32 h-32 mx-auto rounded-lg border border-gray-200" />
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  onClick={onClose}
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
  );
}
