import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from '../../lib/axios';

interface Job {
  id: string;
  title: string;
  status: string;
  department?: string;
  location?: string;
}

interface MatchResult {
  id: string;
  resumeId: string;
  score: number | null;
  grade: string | null;
  status: string;
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
  invited: 'bg-purple-100 text-purple-700',
};

export default function SmartMatching() {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [running, setRunning] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Fetch user's jobs
  useEffect(() => {
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
  }, []);

  // Fetch match results when job is selected
  const fetchMatches = useCallback(async (jobId: string) => {
    if (!jobId) {
      setMatches([]);
      return;
    }
    try {
      setLoadingMatches(true);
      const params: any = { sort: 'score', order: 'desc' };
      if (statusFilter) params.status = statusFilter;
      const res = await axios.get(`/api/v1/matching/results/${jobId}`, { params });
      setMatches(res.data.data || []);
    } catch {
      setMatches([]);
    } finally {
      setLoadingMatches(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (selectedJobId) fetchMatches(selectedJobId);
  }, [selectedJobId, fetchMatches]);

  // Run AI matching
  const handleRunMatching = async () => {
    if (!selectedJobId) return;
    try {
      setRunning(true);
      await axios.post('/api/v1/matching/run', { jobId: selectedJobId });
      await fetchMatches(selectedJobId);
    } catch {
      // handle error
    } finally {
      setRunning(false);
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

  const statuses = ['', 'new', 'reviewed', 'shortlisted', 'rejected', 'invited'];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('product.matching.title', 'Smart Matching')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('product.matching.subtitle', 'AI-powered candidate-job matching with detailed analysis.')}</p>
        </div>
        <button
          onClick={handleRunMatching}
          disabled={!selectedJobId || running}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {running ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
              {t('product.matching.running', 'Matching...')}
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {t('product.matching.runMatch', 'Run AI Matching')}
            </>
          )}
        </button>
      </div>

      {/* Job Selector */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          {t('product.matching.selectJob', 'Select a Job')}
        </label>
        {loadingJobs ? (
          <div className="flex justify-center py-4">
            <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-blue-600" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-slate-500">{t('product.matching.noJobs', 'No jobs found. Create a job first.')}</p>
            <Link
              to="/product/jobs"
              className="mt-2 inline-flex text-sm font-semibold text-blue-600 hover:text-blue-700"
            >
              {t('product.matching.goToJobs', 'Go to Jobs')}
            </Link>
          </div>
        ) : (
          <select
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="">{t('product.matching.choosePlaceholder', '-- Choose a job --')}</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title} {job.department ? `(${job.department})` : ''} — {job.status}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Status filter */}
      {selectedJobId && (
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

      {/* Match Results */}
      {selectedJobId && (
        <>
          {loadingMatches ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
            </div>
          ) : matches.length === 0 ? (
            <div className="text-center py-16 rounded-2xl border border-slate-200 bg-white">
              <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <h3 className="text-lg font-semibold text-slate-900">{t('product.matching.noResults', 'No match results yet')}</h3>
              <p className="mt-1 text-sm text-slate-500">{t('product.matching.noResultsDesc', 'Click "Run AI Matching" to match candidates against this job.')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {matches.map((match) => (
                <div
                  key={match.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-blue-200 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar */}
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
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                          {match.resume.currentRole && <span>{match.resume.currentRole}</span>}
                          {match.resume.experienceYears && <span>{match.resume.experienceYears} {t('product.talent.yearsExp', 'years experience')}</span>}
                          {match.resume.email && <span>{match.resume.email}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Score */}
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

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        {match.status !== 'shortlisted' && (
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
                        {match.status !== 'rejected' && (
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

                  {/* Tags */}
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

                  {/* Key highlights from matchData */}
                  {match.matchData?.highlights && Array.isArray(match.matchData.highlights) && match.matchData.highlights.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <p className="text-xs text-slate-500">
                        {match.matchData.highlights.slice(0, 3).join(' · ')}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
