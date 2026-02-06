import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';
import DashboardHeader from '../components/dashboard/DashboardHeader';

interface HiringRequest {
  id: string;
  title: string;
  requirements: string;
  jobDescription?: string;
  status: 'active' | 'paused' | 'closed';
  createdAt: string;
  updatedAt: string;
  _count?: {
    candidates: number;
  };
}

interface Candidate {
  id: string;
  name?: string | null;
  email?: string | null;
  status?: 'pending' | 'screening' | 'interviewed' | 'shortlisted' | 'rejected';
  matchScore?: number | null;
  createdAt: string;
  updatedAt: string;
}

interface HiringRequestDetail extends HiringRequest {
  candidates: Candidate[];
}

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: requestId } = useParams();
  
  const [hiringRequests, setHiringRequests] = useState<HiringRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<HiringRequestDetail | null>(null);

  useEffect(() => {
    fetchHiringRequests();
  }, []);

  useEffect(() => {
    if (!requestId) {
      setSelectedRequest(null);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }
    fetchRequestDetail(requestId);
  }, [requestId]);

  const fetchHiringRequests = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/api/v1/hiring-requests`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'include',
      });
      const data = await response.json();
      
      if (data.success) {
        setHiringRequests(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to load hiring requests');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRequestDetail = async (id: string) => {
    try {
      setDetailLoading(true);
      setDetailError(null);
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/api/v1/hiring-requests/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setSelectedRequest(data.data);
      } else {
        setDetailError(data.error || t('dashboard.detail.notFound', 'Request not found'));
      }
    } catch (err) {
      setDetailError(t('dashboard.detail.loadError', 'Failed to load request details'));
    } finally {
      setDetailLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
      case 'paused':
        return 'bg-amber-50 text-amber-700 border border-amber-100';
      case 'closed':
        return 'bg-gray-100 text-gray-600 border border-gray-200';
      default:
        return 'bg-gray-100 text-gray-600 border border-gray-200';
    }
  };

  const getCandidateStatusColor = (status?: string) => {
    switch (status) {
      case 'screening':
        return 'bg-amber-50 text-amber-700 border border-amber-100';
      case 'interviewed':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
      case 'shortlisted':
        return 'bg-indigo-50 text-indigo-700 border border-indigo-100';
      case 'rejected':
        return 'bg-rose-50 text-rose-700 border border-rose-100';
      default:
        return 'bg-gray-50 text-gray-600 border border-gray-200';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const activeRequests = useMemo(
    () => hiringRequests.filter((request) => request.status === 'active').length,
    [hiringRequests]
  );

  const candidateStats = useMemo(() => {
    const candidates = selectedRequest?.candidates || [];
    return {
      matches: candidates.length,
      invited: candidates.filter((candidate) => candidate.status === 'screening').length,
      interviewed: candidates.filter((candidate) => candidate.status === 'interviewed').length,
    };
  }, [selectedRequest]);

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {requestId ? (
          <div>
            <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-6">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {t('dashboard.detail.back', 'Back to requests')}
            </Link>

            {detailLoading ? (
              <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                <p className="text-gray-500 mt-4">{t('dashboard.loading', 'Loading...')}</p>
              </div>
            ) : detailError ? (
              <div className="p-12 text-center text-rose-500">{detailError}</div>
            ) : selectedRequest ? (
              <div className="space-y-6">
                <div className="bg-white/90 border border-gray-100 shadow-sm rounded-2xl p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-xl font-semibold text-gray-900">
                          {selectedRequest.title}
                        </h1>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedRequest.status)}`}>
                          {selectedRequest.status.charAt(0).toUpperCase() + selectedRequest.status.slice(1)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">
                        {t('dashboard.detail.updated', 'Updated')} {formatDateTime(selectedRequest.updatedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>
                        {t('dashboard.detail.created', 'Created')} {formatDate(selectedRequest.createdAt)}
                      </span>
                      <span>
                        {t('dashboard.detail.candidatesCount', '{{count}} candidates', {
                          count: selectedRequest.candidates.length,
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white border border-gray-100 rounded-2xl p-4">
                    <p className="text-xs text-gray-500">{t('dashboard.detail.matches', 'Matches')}</p>
                    <p className="text-2xl font-semibold text-gray-900">{candidateStats.matches}</p>
                  </div>
                  <div className="bg-white border border-gray-100 rounded-2xl p-4">
                    <p className="text-xs text-gray-500">{t('dashboard.detail.invited', 'Invitations sent')}</p>
                    <p className="text-2xl font-semibold text-gray-900">{candidateStats.invited}</p>
                  </div>
                  <div className="bg-white border border-gray-100 rounded-2xl p-4">
                    <p className="text-xs text-gray-500">{t('dashboard.detail.interviewsCompleted', 'Interviews completed')}</p>
                    <p className="text-2xl font-semibold text-gray-900">{candidateStats.interviewed}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 bg-white border border-gray-100 rounded-2xl p-6">
                    <h2 className="text-sm font-semibold text-gray-900 mb-3">
                      {t('dashboard.detail.requirements', 'Requirements')}
                    </h2>
                    <p className="text-sm text-gray-600 whitespace-pre-line">
                      {selectedRequest.requirements}
                    </p>
                  </div>
                  <div className="bg-white border border-gray-100 rounded-2xl p-6">
                    <h2 className="text-sm font-semibold text-gray-900 mb-3">
                      {t('dashboard.detail.jobDescription', 'Job description')}
                    </h2>
                    <p className="text-sm text-gray-600 whitespace-pre-line">
                      {selectedRequest.jobDescription || t('dashboard.detail.noJobDescription', 'No job description yet.')}
                    </p>
                  </div>
                </div>

                <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-gray-900">
                      {t('dashboard.detail.candidates', 'Candidates')}
                    </h2>
                    <span className="text-xs text-gray-500">
                      {selectedRequest.candidates.length} {t('dashboard.requests.candidates', 'candidates')}
                    </span>
                  </div>
                  {selectedRequest.candidates.length === 0 ? (
                    <div className="p-6 text-sm text-gray-500">
                      {t('dashboard.detail.noCandidates', 'No candidates yet.')}
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 text-xs uppercase tracking-wide text-gray-400">
                        <span className="col-span-4">{t('dashboard.detail.candidate', 'Candidate')}</span>
                        <span className="col-span-2">{t('dashboard.detail.matchScore', 'Match score')}</span>
                        <span className="col-span-3">{t('dashboard.detail.status', 'Status')}</span>
                        <span className="col-span-3">{t('dashboard.detail.lastUpdated', 'Last updated')}</span>
                      </div>
                      {selectedRequest.candidates.map((candidate) => (
                        <div key={candidate.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-4">
                          <div className="md:col-span-4">
                            <p className="text-sm font-medium text-gray-900">
                              {candidate.name || candidate.email || t('dashboard.detail.candidate', 'Candidate')}
                            </p>
                            {candidate.email && (
                              <p className="text-xs text-gray-500">{candidate.email}</p>
                            )}
                          </div>
                          <div className="md:col-span-2 text-sm text-gray-600">
                            {candidate.matchScore !== null && candidate.matchScore !== undefined
                              ? candidate.matchScore
                              : '--'}
                          </div>
                          <div className="md:col-span-3">
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${getCandidateStatusColor(candidate.status)}`}>
                              {candidate.status ? t(`dashboard.candidateStatus.${candidate.status}`, candidate.status) : t('dashboard.candidateStatus.pending', 'Pending')}
                            </span>
                          </div>
                          <div className="md:col-span-3 text-xs text-gray-500">
                            {formatDateTime(candidate.updatedAt)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-gray-500">
                {t('dashboard.detail.notFound', 'Request not found')}
              </div>
            )}
          </div>
        ) : (
          <div>
            {/* Welcome Section */}
            <div className="mb-8">
              <h1 className="text-xl font-semibold text-gray-900 mb-2">
                {t('dashboard.welcome', 'Welcome back')}, {user?.name?.split(' ')[0] || t('dashboard.user', 'there')}!
              </h1>
              <p className="text-sm text-gray-600">
                {t('dashboard.subtitle', 'Manage your hiring requests and track candidates.')}
              </p>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <Link
                to="/start-hiring"
                className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-5 text-white hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{t('dashboard.actions.newHiring', 'Start New Hiring')}</h3>
                    <p className="text-xs text-indigo-100">{t('dashboard.actions.newHiringDesc', 'Create a new job opening')}</p>
                  </div>
                </div>
              </Link>

              <Link
                to="/dashboard/api-keys"
                className="bg-white border border-gray-100 rounded-2xl p-5 hover:border-indigo-200 hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-amber-50 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{t('dashboard.actions.apiKeys', 'API Keys')}</h3>
                    <p className="text-xs text-gray-500">{t('dashboard.actions.apiKeysDesc', 'Manage API access')}</p>
                  </div>
                </div>
              </Link>

              <Link
                to="/api-playground"
                className="bg-white border border-gray-100 rounded-2xl p-5 hover:border-indigo-200 hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{t('dashboard.actions.api', 'API Playground')}</h3>
                    <p className="text-xs text-gray-500">{t('dashboard.actions.apiDesc', 'Test API endpoints')}</p>
                  </div>
                </div>
              </Link>

              <Link
                to="/dashboard/stats"
                className="bg-white border border-gray-100 rounded-2xl p-5 hover:border-indigo-200 hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{t('dashboard.actions.stats', 'Statistics')}</h3>
                    <p className="text-xs text-gray-500">
                      {activeRequests} {t('dashboard.actions.activeRequests', 'active requests')}
                    </p>
                  </div>
                </div>
              </Link>
            </div>

            {/* Hiring Requests */}
            <div className="bg-white/90 rounded-2xl border border-gray-100 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900">
                  {t('dashboard.requests.title', 'Your Hiring Requests')}
                </h2>
                <Link
                  to="/start-hiring"
                  className="text-indigo-600 hover:text-indigo-700 font-medium text-xs flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  {t('dashboard.requests.new', 'New Request')}
                </Link>
              </div>

              {isLoading ? (
                <div className="p-12 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                  <p className="text-gray-500 mt-4">{t('dashboard.loading', 'Loading...')}</p>
                </div>
              ) : error ? (
                <div className="p-12 text-center">
                  <p className="text-rose-500">{error}</p>
                </div>
              ) : hiringRequests.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                  </div>
                  <h3 className="text-base font-medium text-gray-900 mb-2">
                    {t('dashboard.requests.empty', 'No hiring requests yet')}
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    {t('dashboard.requests.emptyDesc', 'Create your first hiring request to start finding candidates.')}
                  </p>
                  <Link
                    to="/start-hiring"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    {t('dashboard.requests.create', 'Create Hiring Request')}
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {hiringRequests.map((request) => (
                    <div
                      key={request.id}
                      className="p-5 hover:bg-gray-50/80 transition-colors cursor-pointer"
                      onClick={() => navigate(`/dashboard/requests/${request.id}`)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-base font-semibold text-gray-900 truncate">
                              {request.title}
                            </h3>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                              {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                            {request.requirements}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                              </svg>
                              {request._count?.candidates || 0} {t('dashboard.requests.candidates', 'candidates')}
                            </span>
                            <span className="flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {t('dashboard.requests.created', 'Created')} {formatDate(request.createdAt)}
                            </span>
                          </div>
                        </div>
                        <div className="text-xs text-indigo-600 font-medium flex items-center gap-1">
                          {t('dashboard.requests.viewDetail', 'View details')}
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
