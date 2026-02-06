import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API_BASE } from '../config';
import DashboardHeader from '../components/dashboard/DashboardHeader';

interface HiringRequest {
  id: string;
  title: string;
  status: 'active' | 'paused' | 'closed';
  createdAt: string;
  _count?: {
    candidates: number;
  };
}

interface Candidate {
  id: string;
  status?: 'pending' | 'screening' | 'interviewed' | 'shortlisted' | 'rejected';
  matchScore?: number | null;
}

interface HiringRequestDetail extends HiringRequest {
  candidates: Candidate[];
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

const REQUEST_LIMIT = 50;

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
        const response = await fetch(`${API_BASE}/api/v1/hiring-requests?limit=${REQUEST_LIMIT}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          credentials: 'include',
        });
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || 'Failed to load stats');
        }

        const requestList: HiringRequest[] = data.data || [];
        setRequests(requestList);

        if (requestList.length === 0) {
          setStats({
            totalRequests: 0,
            activeRequests: 0,
            pausedRequests: 0,
            closedRequests: 0,
            totalCandidates: 0,
            invitationsSent: 0,
            interviewsCompleted: 0,
            avgMatchScore: null,
            candidateStatusCounts: {},
          });
          return;
        }

        const detailResponses = await Promise.all(
          requestList.map((request) =>
            fetch(`${API_BASE}/api/v1/hiring-requests/${request.id}`, {
              headers: token ? { Authorization: `Bearer ${token}` } : undefined,
              credentials: 'include',
            })
          )
        );
        const detailData = await Promise.all(detailResponses.map((res) => res.json()));

        const candidates: Candidate[] = detailData.flatMap((detail: { success: boolean; data?: HiringRequestDetail }) => {
          if (!detail?.success || !detail.data) {
            return [];
          }
          return detail.data.candidates || [];
        });

        const requestStatusCounts = requestList.reduce(
          (acc, request) => {
            acc[request.status] = (acc[request.status] || 0) + 1;
            return acc;
          },
          { active: 0, paused: 0, closed: 0 } as Record<string, number>
        );

        const candidateStatusCounts = candidates.reduce(
          (acc, candidate) => {
            const status = candidate.status || 'pending';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );

        const scores = candidates
          .map((candidate) => candidate.matchScore)
          .filter((score): score is number => typeof score === 'number');
        const avgMatchScore = scores.length
          ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10
          : null;

        setStats({
          totalRequests: requestList.length,
          activeRequests: requestStatusCounts.active || 0,
          pausedRequests: requestStatusCounts.paused || 0,
          closedRequests: requestStatusCounts.closed || 0,
          totalCandidates: candidates.length,
          invitationsSent: candidateStatusCounts.screening || 0,
          interviewsCompleted: candidateStatusCounts.interviewed || 0,
          avgMatchScore,
          candidateStatusCounts,
        });
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
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            {t('stats.title', 'Statistics')}
          </h1>
          <p className="text-sm text-gray-600">
            {t('stats.subtitle', 'Overview of your hiring pipeline')}
          </p>
        </div>

        {isLoading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="text-gray-500 mt-4">{t('dashboard.loading', 'Loading...')}</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-rose-500">{error}</div>
        ) : stats ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white border border-gray-100 rounded-2xl p-5">
                <p className="text-xs text-gray-500">{t('stats.cards.totalRequests', 'Total requests')}</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.totalRequests}</p>
                <p className="text-xs text-gray-400 mt-2">
                  {t('stats.cards.activeRequests', '{{count}} active', { count: stats.activeRequests })}
                </p>
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-5">
                <p className="text-xs text-gray-500">{t('stats.cards.totalCandidates', 'Total candidates')}</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.totalCandidates}</p>
                <p className="text-xs text-gray-400 mt-2">
                  {t('stats.cards.invitationsSent', '{{count}} invitations sent', { count: stats.invitationsSent })}
                </p>
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-5">
                <p className="text-xs text-gray-500">{t('stats.cards.interviewsCompleted', 'Interviews completed')}</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.interviewsCompleted}</p>
                <p className="text-xs text-gray-400 mt-2">
                  {stats.avgMatchScore !== null
                    ? t('stats.cards.avgMatchScore', 'Avg match score {{score}}', { score: stats.avgMatchScore })
                    : t('stats.cards.avgMatchScoreEmpty', 'Avg match score --')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white border border-gray-100 rounded-2xl p-6">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">
                  {t('stats.sections.requestStatus', 'Request status')}
                </h2>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">{t('stats.status.active', 'Active')}</span>
                    <span className="font-medium text-gray-900">{stats.activeRequests}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">{t('stats.status.paused', 'Paused')}</span>
                    <span className="font-medium text-gray-900">{stats.pausedRequests}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">{t('stats.status.closed', 'Closed')}</span>
                    <span className="font-medium text-gray-900">{stats.closedRequests}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl p-6">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">
                  {t('stats.sections.candidateStatus', 'Candidate status')}
                </h2>
                <div className="space-y-3 text-sm">
                  {candidateStatusRows.map((row) => (
                    <div key={row.status} className="flex items-center justify-between">
                      <span className="text-gray-500">{row.label}</span>
                      <span className="font-medium text-gray-900">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl p-6">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">
                  {t('stats.sections.recentRequests', 'Recent requests')}
                </h2>
                {recentRequests.length === 0 ? (
                  <p className="text-sm text-gray-500">{t('stats.empty', 'No requests yet')}</p>
                ) : (
                  <div className="space-y-3">
                    {recentRequests.map((request) => (
                      <div key={request.id} className="flex items-center justify-between text-sm">
                        <div>
                          <p className="font-medium text-gray-900">{request.title}</p>
                          <p className="text-xs text-gray-500">
                            {t('stats.requestCandidates', '{{count}} candidates', {
                              count: request._count?.candidates || 0,
                            })}
                          </p>
                        </div>
                        <span className="text-xs text-gray-400">
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
      </main>
    </div>
  );
}
