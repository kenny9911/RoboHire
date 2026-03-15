import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from '../../lib/axios';

interface Agent {
  id: string;
  name: string;
  description: string;
  status: string;
  jobId: string | null;
  config: Record<string, unknown> | null;
  totalSourced: number;
  totalApproved: number;
  totalRejected: number;
  totalContacted: number;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  job: { id: string; title: string } | null;
  _count: { candidates: number };
}

interface Candidate {
  id: string;
  name: string;
  email: string | null;
  profileUrl: string | null;
  headline: string | null;
  matchScore: number | null;
  status: string;
  notes: string | null;
  createdAt: string;
  resume: { id: string; name: string; currentRole: string | null; email: string | null } | null;
}

export default function AgentDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected' | 'contacted' | 'all'>('pending');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const fetchAgent = useCallback(async () => {
    if (!id) return;
    try {
      const res = await axios.get(`/api/v1/agents/${id}`);
      setAgent(res.data.data);
    } catch {
      // ignore
    }
  }, [id]);

  const fetchCandidates = useCallback(async (statusFilter?: string) => {
    if (!id) return;
    try {
      const params: any = { limit: 100 };
      if (statusFilter && statusFilter !== 'all') params.status = statusFilter;
      const res = await axios.get(`/api/v1/agents/${id}/candidates`, { params });
      setCandidates(res.data.data || []);
    } catch {
      // ignore
    }
  }, [id]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchAgent(), fetchCandidates('pending')]);
      setLoading(false);
    };
    load();
  }, [fetchAgent, fetchCandidates]);

  useEffect(() => {
    fetchCandidates(tab);
  }, [tab, fetchCandidates]);

  const handleStatusChange = async (candidateId: string, newStatus: string) => {
    if (!id) return;
    setUpdatingId(candidateId);
    try {
      const res = await axios.patch(`/api/v1/agents/${id}/candidates/${candidateId}`, { status: newStatus });
      setCandidates((prev) => prev.map((c) => (c.id === candidateId ? res.data.data : c)));
      fetchAgent(); // refresh stats
    } catch {
      // ignore
    } finally {
      setUpdatingId(null);
    }
  };

  const handleToggleStatus = async () => {
    if (!agent || !id) return;
    const newStatus = agent.status === 'active' ? 'paused' : 'active';
    try {
      const res = await axios.patch(`/api/v1/agents/${id}`, { status: newStatus });
      setAgent(res.data.data);
    } catch {
      // ignore
    }
  };

  const handleSaveEdit = async () => {
    if (!id) return;
    try {
      const res = await axios.patch(`/api/v1/agents/${id}`, { name: editName, description: editDesc });
      setAgent(res.data.data);
      setEditing(false);
    } catch {
      // ignore
    }
  };

  const tabs = [
    { key: 'pending', label: t('agents.tab.pending', 'Pending Review') },
    { key: 'approved', label: t('agents.tab.approved', 'Approved') },
    { key: 'rejected', label: t('agents.tab.rejected', 'Rejected') },
    { key: 'contacted', label: t('agents.tab.contacted', 'Contacted') },
    { key: 'all', label: t('agents.tab.all', 'All') },
  ];

  if (loading || !agent) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-600" />
      </div>
    );
  }

  const statusColor: Record<string, string> = {
    active: 'bg-green-50 text-green-700 border-green-200',
    paused: 'bg-amber-50 text-amber-700 border-amber-200',
    completed: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  const statusDot: Record<string, string> = {
    active: 'bg-green-500',
    paused: 'bg-amber-500',
    completed: 'bg-slate-400',
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-slate-500">
        <Link to="/product/agents" className="hover:text-slate-700">{t('agents.title', 'Agents')}</Link>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-slate-900 font-medium">{agent.name}</span>
      </nav>

      {/* Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50">
              <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <div className="min-w-0">
              {editing ? (
                <div className="space-y-2">
                  <input
                    type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-base font-semibold text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  <textarea
                    value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleSaveEdit} className="px-3 py-1 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">{t('common.save', 'Save')}</button>
                    <button onClick={() => setEditing(false)} className="px-3 py-1 text-xs text-slate-600 hover:text-slate-800">{t('common.cancel', 'Cancel')}</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold text-slate-900">{agent.name}</h1>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColor[agent.status] || statusColor.active}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusDot[agent.status] || statusDot.active}`} />
                      {t(`agents.status.${agent.status}`, agent.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{agent.description}</p>
                  {agent.job && (
                    <Link to={`/product/jobs/${agent.job.id}`} className="mt-1 inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                      {agent.job.title}
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => { setEditName(agent.name); setEditDesc(agent.description); setEditing(true); }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {t('agents.edit', 'Edit')}
            </button>
            <button
              onClick={handleToggleStatus}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                agent.status === 'active'
                  ? 'border border-amber-200 text-amber-700 hover:bg-amber-50'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {agent.status === 'active' ? t('agents.pause', 'Pause') : t('agents.resume', 'Resume')}
            </button>
          </div>
        </div>

        {/* Stats cards */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-lg bg-slate-50 p-3 text-center">
            <div className="text-2xl font-bold text-slate-900">{agent._count.candidates}</div>
            <div className="text-xs text-slate-500">{t('agents.stat.sourced', 'Sourced')}</div>
          </div>
          <div className="rounded-lg bg-green-50 p-3 text-center">
            <div className="text-2xl font-bold text-green-700">{agent.totalApproved}</div>
            <div className="text-xs text-green-600">{t('agents.stat.approved', 'Approved')}</div>
          </div>
          <div className="rounded-lg bg-red-50 p-3 text-center">
            <div className="text-2xl font-bold text-red-700">{agent.totalRejected}</div>
            <div className="text-xs text-red-600">{t('agents.stat.rejected', 'Rejected')}</div>
          </div>
          <div className="rounded-lg bg-blue-50 p-3 text-center">
            <div className="text-2xl font-bold text-blue-700">{agent.totalContacted}</div>
            <div className="text-xs text-blue-600">{t('agents.stat.contacted', 'Contacted')}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-slate-200">
        {tabs.map((t_) => (
          <button
            key={t_.key}
            onClick={() => setTab(t_.key as typeof tab)}
            className={`relative pb-2.5 text-sm font-medium transition-colors ${
              tab === t_.key ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {t_.label}
            {tab === t_.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Candidates list */}
      {candidates.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-400">
          {t('agents.noCandidates', 'No candidates in this category yet. The agent will source candidates automatically.')}
        </div>
      ) : (
        <div className="space-y-3">
          {candidates.map((candidate) => (
            <div key={candidate.id} className="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-4">
              {/* Avatar placeholder */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                {candidate.name.charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{candidate.name}</span>
                  {candidate.matchScore != null && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      candidate.matchScore >= 80 ? 'bg-green-50 text-green-700' :
                      candidate.matchScore >= 60 ? 'bg-amber-50 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {Math.round(candidate.matchScore)}%
                    </span>
                  )}
                </div>
                {candidate.headline && (
                  <p className="text-sm text-slate-500 truncate">{candidate.headline}</p>
                )}
                <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                  {candidate.email && <span>{candidate.email}</span>}
                  {candidate.resume && (
                    <Link to={`/product/talent/${candidate.resume.id}`} className="text-indigo-600 hover:text-indigo-700">
                      {t('agents.viewResume', 'View Resume')}
                    </Link>
                  )}
                  {candidate.profileUrl && (
                    <a href={candidate.profileUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-700">
                      {t('agents.viewProfile', 'Profile')}
                    </a>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {candidate.status === 'pending' && (
                  <>
                    <button
                      onClick={() => handleStatusChange(candidate.id, 'approved')}
                      disabled={updatingId === candidate.id}
                      className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      {t('agents.approve', 'Approve')}
                    </button>
                    <button
                      onClick={() => handleStatusChange(candidate.id, 'rejected')}
                      disabled={updatingId === candidate.id}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                      {t('agents.reject', 'Reject')}
                    </button>
                  </>
                )}
                {candidate.status === 'approved' && (
                  <button
                    onClick={() => handleStatusChange(candidate.id, 'contacted')}
                    disabled={updatingId === candidate.id}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {t('agents.contact', 'Contact')}
                  </button>
                )}
                {(candidate.status === 'contacted' || candidate.status === 'rejected') && (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    candidate.status === 'contacted' ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-600'
                  }`}>
                    {t(`agents.candidateStatus.${candidate.status}`, candidate.status)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
