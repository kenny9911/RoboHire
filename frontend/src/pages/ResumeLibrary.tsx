import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from '../lib/axios';
import ResumeCard from '../components/ResumeCard';
import ResumeUploadModal from '../components/ResumeUploadModal';
import SEO from '../components/SEO';

interface ResumeListItem {
  id: string;
  name: string;
  email: string | null;
  currentRole: string | null;
  experienceYears: string | null;
  fileName: string | null;
  fileType: string | null;
  status: string;
  source: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  parsedData: Record<string, unknown> | null;
  resumeJobFits: Array<{
    fitScore: number | null;
    fitGrade: string | null;
    hiringRequest: { title: string };
  }>;
}

interface Stats {
  total: number;
  thisWeek: number;
  analyzed: number;
}

export default function ResumeLibrary() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);

  const fetchResumes = useCallback(async (p: number, q?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: '20' });
      if (q) params.set('search', q);
      const res = await axios.get(`/api/v1/resumes?${params}`);
      if (res.data.success) {
        setResumes(res.data.data);
        setTotalPages(res.data.pagination.totalPages);
        setTotal(res.data.pagination.total);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get('/api/v1/resumes/stats');
      if (res.data.success) setStats(res.data.data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchResumes(page, search);
  }, [page, fetchResumes]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleSearch = () => {
    setPage(1);
    fetchResumes(1, search);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleUploadComplete = () => {
    fetchResumes(1, search);
    fetchStats();
    setPage(1);
  };

  const openUpload = (batch: boolean) => {
    setBatchMode(batch);
    setUploadOpen(true);
  };

  return (
    <div className="max-w-7xl mx-auto">
      <SEO title="Resume Library" noIndex />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('resumeLibrary.title', 'Resume Library')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('resumeLibrary.subtitle', 'Manage and analyze your candidate resumes')}</p>
        </div>
        <div className="flex gap-2 mt-4 sm:mt-0">
          <button
            onClick={() => openUpload(false)}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('resumeLibrary.upload', 'Upload Resume')}
          </button>
          <button
            onClick={() => openUpload(true)}
            className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
          >
            {t('resumeLibrary.uploadBatch', 'Batch Upload')}
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('resumeLibrary.stats.total', 'Total Resumes')}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('resumeLibrary.stats.thisWeek', 'This Week')}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats.thisWeek}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('resumeLibrary.stats.analyzed', 'AI Analyzed')}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats.analyzed}</p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="flex gap-2 mb-6">
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('resumeLibrary.search.placeholder', 'Search by name, skills, or role...')}
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-4 py-2.5 text-sm font-medium text-white bg-gray-800 rounded-lg hover:bg-gray-900 transition-colors"
        >
          {t('actions.search', 'Search')}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : resumes.length === 0 ? (
        <div className="text-center py-24">
          <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-700 mb-2">{t('resumeLibrary.empty.title', 'No resumes yet')}</h3>
          <p className="text-sm text-gray-500 mb-6">{t('resumeLibrary.empty.description', 'Upload resumes to build your candidate library')}</p>
          <button
            onClick={() => openUpload(false)}
            className="px-6 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {t('resumeLibrary.empty.cta', 'Upload Your First Resume')}
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-500 mb-4">
            {total} {t('resumeLibrary.stats.total', 'resumes')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
            {resumes.map((r) => (
              <ResumeCard
                key={r.id}
                resume={r}
                onClick={() => navigate(`/dashboard/resumes/${r.id}`)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="text-sm text-gray-600 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('usage.callHistory.prev', 'Previous')}
              </button>
              <span className="text-xs text-gray-500">
                {t('usage.callHistory.pageInfo', 'Page {{page}} of {{total}}', { page, total: totalPages })}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="text-sm text-gray-600 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('usage.callHistory.next', 'Next')}
              </button>
            </div>
          )}
        </>
      )}

      {/* Upload Modal */}
      <ResumeUploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={handleUploadComplete}
        batch={batchMode}
      />
    </div>
  );
}
