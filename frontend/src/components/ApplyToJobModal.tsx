import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import axios from '../lib/axios';

interface Job {
  id: string;
  title: string;
  companyName: string | null;
  status: string;
  department: string | null;
  location: string | null;
}

interface ApplyToJobModalProps {
  open: boolean;
  onClose: () => void;
  resumeId: string;
  resumeName: string;
  onApplied?: () => void;
}

const JOB_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  open: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-amber-100 text-amber-700',
  closed: 'bg-red-100 text-red-600',
  filled: 'bg-blue-100 text-blue-700',
};

export default function ApplyToJobModal({ open, onClose, resumeId, resumeName, onApplied }: ApplyToJobModalProps) {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<'success' | 'error' | null>(null);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setSelectedJobId(null);
    setResult(null);
    setLoading(true);
    axios.get('/api/v1/jobs', { params: { limit: 200 } })
      .then((res) => {
        setJobs(res.data.data || []);
      })
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return jobs;
    const q = search.toLowerCase();
    return jobs.filter(j =>
      j.title.toLowerCase().includes(q) ||
      (j.companyName || '').toLowerCase().includes(q) ||
      (j.department || '').toLowerCase().includes(q)
    );
  }, [jobs, search]);

  const handleRun = async () => {
    if (!selectedJobId) return;
    setRunning(true);
    setResult(null);
    try {
      await axios.post('/api/v1/matching/run', {
        jobId: selectedJobId,
        resumeIds: [resumeId],
      });
      setResult('success');
      onApplied?.();
    } catch {
      setResult('error');
    } finally {
      setRunning(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-900">
            {t('product.talent.applyModal.title', 'Apply to Job')}
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {t('product.talent.applyModal.subtitle', 'Select a job to match {{name}} against.', { name: resumeName })}
          </p>
        </div>

        {/* Search */}
        <div className="px-5 pt-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('product.talent.applyModal.searchJobs', 'Search jobs...')}
              className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Job list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1 min-h-0">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-blue-600" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-8 text-sm text-slate-400">
              {t('product.talent.applyModal.noJobs', 'No jobs found')}
            </p>
          ) : (
            filtered.map((job) => (
              <button
                key={job.id}
                onClick={() => setSelectedJobId(job.id === selectedJobId ? null : job.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                  job.id === selectedJobId
                    ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900 truncate">{job.title}</span>
                  <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${JOB_STATUS_COLORS[job.status] || 'bg-slate-100 text-slate-600'}`}>
                    {job.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                  {job.companyName && <span>{job.companyName}</span>}
                  {job.department && <span>· {job.department}</span>}
                  {job.location && <span>· {job.location}</span>}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Result banner */}
        {result === 'success' && (
          <div className="mx-5 mb-2 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-medium flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {t('product.talent.applyModal.success', 'Matching completed successfully!')}
          </div>
        )}
        {result === 'error' && (
          <div className="mx-5 mb-2 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-sm font-medium">
            {t('product.talent.applyModal.error', 'Failed to run matching. Please try again.')}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            {result === 'success'
              ? t('common.close', 'Close')
              : t('common.cancel', 'Cancel')}
          </button>
          {result !== 'success' && (
            <button
              onClick={handleRun}
              disabled={!selectedJobId || running}
              className="px-4 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {running && <div className="h-3.5 w-3.5 animate-spin rounded-full border-b-2 border-white" />}
              {t('product.talent.applyModal.runMatching', 'Run Matching')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
