import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API_BASE } from '../config';
import SEO from '../components/SEO';

interface HiringRequest {
  id: string;
  title: string;
  status: 'active' | 'paused' | 'closed';
  createdAt: string;
  _count?: {
    candidates: number;
  };
}

interface StatsSummary {
  totalRequests: number;
  activeRequests: number;
  pausedRequests: number;
  closedRequests: number;
  totalCandidates: number;
  invitationsSent: number;
  interviewsCompleted: number;
  avgMatchScore: number | null;
  candidateStatusCounts: Record<string, number>;
}

export default function DashboardStats() {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<HiringRequest[]>([]);
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_BASE}/api/v1/hiring-requests/stats?includeRecent=true`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          credentials: 'include',
        });
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || 'Failed to load stats');
        }

        setStats({
          totalRequests: data.data.totalRequests || 0,
          activeRequests: data.data.activeRequests || 0,
          pausedRequests: data.data.pausedRequests || 0,
          closedRequests: data.data.closedRequests || 0,
          totalCandidates: data.data.totalCandidates || 0,
          invitationsSent: data.data.invitationsSent || 0,
          interviewsCompleted: data.data.interviewsCompleted || 0,
          avgMatchScore: data.data.avgMatchScore ?? null,
          candidateStatusCounts: data.data.candidateStatusCounts || {},
        });
        setRequests(data.data.recentRequests || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load stats');
      } finally {
        setIsLoading(false);
      }
    };

    void fetchStats();
  }, []);

  const recentRequests = useMemo(() => requests.slice(0, 5), [requests]);

  const candidateStatusRows = useMemo(() => {
    if (!stats) return [];
    const statuses = ['pending', 'screening', 'interviewed', 'shortlisted', 'rejected'];
    return statuses.map((status) => ({
      status,
      label: t(`stats.status.${status}`, status),
      value: stats.candidateStatusCounts[status] || 0,
    }));
  }, [stats, t]);

  return (
    <div className="max-w-7xl mx-auto">
        <SEO title="Statistics" noIndex />
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-slate-900 mb-2 landing-display">
            {t('stats.title', 'Statistics')}
          </h1>
          <p className="text-sm text-slate-600">
            {t('stats.subtitle', 'Overview of your hiring pipeline')}
          </p>
        </div>

        {isLoading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-slate-500 mt-4">{t('dashboard.loading', 'Loading...')}</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-rose-500">{error}</div>
        ) : stats ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white/80 rounded-2xl border border-slate-200/80 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.75)] backdrop-blur p-5">
                <p className="text-xs text-slate-500">{t('stats.cards.totalRequests', 'Total requests')}</p>
                <p className="text-2xl font-semibold text-slate-900 landing-display">{stats.totalRequests}</p>
                <p className="text-xs text-slate-400 mt-2">
                  {t('stats.cards.activeRequests', '{{count}} active', { count: stats.activeRequests })}
                </p>
              </div>
              <div className="bg-white/80 rounded-2xl border border-slate-200/80 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.75)] backdrop-blur p-5">
                <p className="text-xs text-slate-500">{t('stats.cards.totalCandidates', 'Total candidates')}</p>
                <p className="text-2xl font-semibold text-slate-900 landing-display">{stats.totalCandidates}</p>
                <p className="text-xs text-slate-400 mt-2">
                  {t('stats.cards.invitationsSent', '{{count}} invitations sent', { count: stats.invitationsSent })}
                </p>
              </div>
              <div className="bg-white/80 rounded-2xl border border-slate-200/80 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.75)] backdrop-blur p-5">
                <p className="text-xs text-slate-500">{t('stats.cards.interviewsCompleted', 'Interviews completed')}</p>
                <p className="text-2xl font-semibold text-slate-900 landing-display">{stats.interviewsCompleted}</p>
                <p className="text-xs text-slate-400 mt-2">
                  {stats.avgMatchScore !== null
                    ? t('stats.cards.avgMatchScore', 'Avg match score {{score}}', { score: stats.avgMatchScore })
                    : t('stats.cards.avgMatchScoreEmpty', 'Avg match score --')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="landing-gradient-stroke bg-white rounded-[28px] shadow-[0_18px_34px_-28px_rgba(15,23,42,0.75)] p-6">
                <h2 className="text-sm font-semibold text-slate-900 mb-4">
                  {t('stats.sections.requestStatus', 'Request status')}
                </h2>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">{t('stats.status.active', 'Active')}</span>
                    <span className="font-medium text-slate-900">{stats.activeRequests}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">{t('stats.status.paused', 'Paused')}</span>
                    <span className="font-medium text-slate-900">{stats.pausedRequests}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">{t('stats.status.closed', 'Closed')}</span>
                    <span className="font-medium text-slate-900">{stats.closedRequests}</span>
                  </div>
                </div>
              </div>

              <div className="landing-gradient-stroke bg-white rounded-[28px] shadow-[0_18px_34px_-28px_rgba(15,23,42,0.75)] p-6">
                <h2 className="text-sm font-semibold text-slate-900 mb-4">
                  {t('stats.sections.candidateStatus', 'Candidate status')}
                </h2>
                <div className="space-y-3 text-sm">
                  {candidateStatusRows.map((row) => (
                    <div key={row.status} className="flex items-center justify-between">
                      <span className="text-slate-500">{row.label}</span>
                      <span className="font-medium text-slate-900">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="landing-gradient-stroke bg-white rounded-[28px] shadow-[0_18px_34px_-28px_rgba(15,23,42,0.75)] p-6">
                <h2 className="text-sm font-semibold text-slate-900 mb-4">
                  {t('stats.sections.recentRequests', 'Recent requests')}
                </h2>
                {recentRequests.length === 0 ? (
                  <p className="text-sm text-slate-500">{t('stats.empty', 'No requests yet')}</p>
                ) : (
                  <div className="space-y-3">
                    {recentRequests.map((request) => (
                      <div key={request.id} className="flex items-center justify-between text-sm">
                        <div>
                          <p className="font-medium text-slate-900">{request.title}</p>
                          <p className="text-xs text-slate-500">
                            {t('stats.requestCandidates', '{{count}} candidates', {
                              count: request._count?.candidates || 0,
                            })}
                          </p>
                        </div>
                        <span className="text-xs text-slate-400">
                          {new Date(request.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
    </div>
  );
}
