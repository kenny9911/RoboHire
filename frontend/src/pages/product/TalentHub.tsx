import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from '../../lib/axios';
import ResumeUploadModal from '../../components/ResumeUploadModal';

interface Resume {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  currentRole: string | null;
  experienceYears: string | null;
  fileName: string | null;
  status: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export default function TalentHub() {
  const { t } = useTranslation();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  const fetchResumes = useCallback(async (query?: string) => {
    try {
      setLoading(true);
      const params: any = { limit: 50 };
      if (query) params.search = query;
      const res = await axios.get('/api/v1/resumes', { params });
      setResumes(res.data.data || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResumes();
  }, [fetchResumes]);

  const handleSearch = (value: string) => {
    setSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchResumes(value);
    }, 300);
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/v1/resumes/${id}`);
      setResumes((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // handle error
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('product.talent.title', 'Talent Hub')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('product.talent.subtitle', 'Your candidate repository with AI-powered insights.')}</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          {t('product.talent.upload', 'Upload Resumes')}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={t('product.talent.searchPlaceholder', 'Search by name, role, skills...')}
          className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Resume Upload Modal */}
      <ResumeUploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onUploaded={() => {
          setShowUpload(false);
          fetchResumes(search || undefined);
        }}
        batch
      />

      {/* Candidates Grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
        </div>
      ) : resumes.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-slate-200 bg-white">
          <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h3 className="text-lg font-semibold text-slate-900">{t('product.talent.empty', 'No candidates yet')}</h3>
          <p className="mt-1 text-sm text-slate-500">{t('product.talent.emptyDesc', 'Upload resumes to build your talent pool.')}</p>
          <button
            onClick={() => setShowUpload(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {t('product.talent.upload', 'Upload Resumes')}
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {resumes.map((resume) => (
            <div
              key={resume.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-blue-200 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 shrink-0">
                    <span className="text-sm font-bold text-blue-600">
                      {resume.name?.[0]?.toUpperCase() || '?'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <Link
                      to={`/product/talent/${resume.id}`}
                      className="text-sm font-semibold text-slate-900 hover:text-blue-700 transition-colors truncate block"
                    >
                      {resume.name}
                    </Link>
                    {resume.currentRole && (
                      <p className="text-xs text-slate-500 truncate">{resume.currentRole}</p>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(resume.id)}
                  className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mt-3 space-y-1.5">
                {resume.email && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="truncate">{resume.email}</span>
                  </div>
                )}
                {resume.experienceYears && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{resume.experienceYears} {t('product.talent.yearsExp', 'years experience')}</span>
                  </div>
                )}
              </div>

              {resume.tags && resume.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {resume.tags.slice(0, 4).map((tag) => (
                    <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {tag}
                    </span>
                  ))}
                  {resume.tags.length > 4 && (
                    <span className="text-xs text-slate-400">+{resume.tags.length - 4}</span>
                  )}
                </div>
              )}

              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {new Date(resume.createdAt).toLocaleDateString()}
                </span>
                <Link
                  to={`/product/talent/${resume.id}`}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  {t('product.talent.viewProfile', 'View Profile')}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
