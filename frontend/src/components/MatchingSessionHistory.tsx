import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from '../lib/axios';

interface MatchingSession {
  id: string;
  title: string | null;
  status: string;
  totalResumes: number;
  totalFiltered: number;
  totalMatched: number;
  totalFailed: number;
  avgScore: number | null;
  topGrade: string | null;
  totalCost: number;
  totalTokens: number;
  totalLLMCalls: number;
  createdAt: string;
  completedAt: string | null;
  preFilterModel: string | null;
  preFilterResult: any;
  job: { id: string; title: string };
}

interface MatchingSessionHistoryProps {
  onSelectSession: (sessionId: string | null) => void;
  selectedSessionId: string | null;
  refreshTrigger?: number;
}

const STATUS_BADGES: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  running: 'bg-blue-100 text-blue-700',
  failed: 'bg-red-100 text-red-700',
};

export default function MatchingSessionHistory({
  onSelectSession,
  selectedSessionId,
  refreshTrigger,
}: MatchingSessionHistoryProps) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<MatchingSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/v1/matching/sessions', { params: { limit: 50 } });
      setSessions(res.data.data || []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions, refreshTrigger]);

  const handleDelete = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(t('product.matching.deleteSessionConfirm', 'Delete this matching session?'))) return;
    try {
      await axios.delete(`/api/v1/matching/sessions/${sessionId}`);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (selectedSessionId === sessionId) {
        onSelectSession(null);
      }
    } catch {
      // silent
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-semibold text-slate-700">
            {t('product.matching.sessionHistory', 'Session History')}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            {sessions.length}
          </span>
        </div>
        {loading && <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-blue-600" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-200 divide-y divide-slate-100 max-h-64 overflow-y-auto">
          {/* Current results option */}
          <button
            onClick={() => onSelectSession(null)}
            className={`w-full px-5 py-3 text-left hover:bg-slate-50 transition-colors ${
              selectedSessionId === null ? 'bg-blue-50 border-l-2 border-blue-600' : ''
            }`}
          >
            <span className="text-sm font-semibold text-slate-700">
              {t('product.matching.currentResults', 'Current Results')}
            </span>
          </button>

          {sessions.length === 0 && (
            <div className="px-5 py-6 text-center text-sm text-slate-400">
              {t('product.matching.noSessions', 'No matching history yet. Run AI Matching to create your first session.')}
            </div>
          )}

          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className={`w-full px-5 py-3 text-left hover:bg-slate-50 transition-colors ${
                selectedSessionId === session.id ? 'bg-blue-50 border-l-2 border-blue-600' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900 truncate">
                      {session.title || t('product.matching.untitledSession', 'Untitled Session')}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        STATUS_BADGES[session.status] || STATUS_BADGES.completed
                      }`}
                    >
                      {t(`product.matching.session${session.status.charAt(0).toUpperCase() + session.status.slice(1)}`, session.status)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span>
                      {t('product.matching.sessionStats', '{{matched}}/{{total}} matched', {
                        matched: session.totalMatched,
                        total: session.totalResumes,
                      })}
                    </span>
                    {session.avgScore !== null && (
                      <span>
                        {t('product.matching.avgScore', 'Avg: {{score}}', { score: session.avgScore })}
                      </span>
                    )}
                    {session.topGrade && (
                      <span>
                        {t('product.matching.topGrade', 'Top: {{grade}}', { grade: session.topGrade })}
                      </span>
                    )}
                    {session.job?.title && (
                      <span className="font-medium text-slate-600">{session.job.title}</span>
                    )}
                    <span>{new Date(session.createdAt).toLocaleString()}</span>
                  </div>
                  {session.preFilterModel && session.preFilterResult && (
                    <div className="mt-1 text-[10px] text-slate-400">
                      {t('product.matching.preFilterSummary', 'Pre-filter: {{passed}} passed, {{excluded}} excluded', {
                        passed: session.preFilterResult.passedIds?.length ?? 0,
                        excluded: session.preFilterResult.excluded?.length ?? 0,
                      })}
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => handleDelete(session.id, e)}
                  className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                  title={t('product.matching.deleteSession', 'Delete session')}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
