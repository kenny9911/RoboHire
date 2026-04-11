import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import axios from '../../lib/axios';
import RecruiterTeamFilter, { type RecruiterTeamFilterValue } from '../../components/RecruiterTeamFilter';
import AutoGrowTextarea from '../../components/AutoGrowTextarea';
import AgentRunDrawer from '../../components/AgentRunDrawer';
import HardRequirementsEditor, { type HardRequirement } from '../../components/HardRequirementsEditor';

type SourceMode = 'instant_search' | 'internal_minio' | 'external_api';
type AutonomyMode = 'manual' | 'scheduled';
type SchedulePreset = 'off' | 'hourly' | 'daily' | 'weekly' | 'custom';

interface JobOption {
  id: string;
  title: string;
  userId: string;
  user?: { id: string; name: string | null; email: string } | null;
}

interface JobsAvailableResponse {
  data: JobOption[];
  meta: { isAdmin: boolean; scope: 'all' | 'own' };
}

const SCHEDULE_PRESETS: Record<Exclude<SchedulePreset, 'custom' | 'off'>, string> = {
  hourly: '0 * * * *',
  daily: '0 9 * * *',
  weekly: '0 9 * * 1',
};

interface Agent {
  id: string;
  name: string;
  description: string;
  status: string;
  jobId: string | null;
  totalSourced: number;
  totalApproved: number;
  totalRejected: number;
  totalContacted: number;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  job: { id: string; title: string } | null;
  user?: { id: string; name: string | null; email: string };
  _count: { candidates: number };
  accessLevel?: 'shared' | 'private';
  collaborators?: string[];
}

const AGENT_STATUSES = ['configuring', 'active', 'failed', 'closed', 'paused', 'out_of_leads'] as const;

export default function Agents() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createTaskType, setCreateTaskType] = useState<'search_candidates' | 'match_resumes'>('search_candidates');
  const [createInstructions, setCreateInstructions] = useState('');
  const [creating, setCreating] = useState(false);
  const [availableJobs, setAvailableJobs] = useState<JobOption[]>([]);
  const [jobsMeta, setJobsMeta] = useState<{ isAdmin: boolean; scope: 'all' | 'own' }>({ isAdmin: false, scope: 'own' });
  const [jobQuery, setJobQuery] = useState('');
  const [createJobId, setCreateJobId] = useState('');
  const [createSourceModes, setCreateSourceModes] = useState<SourceMode[]>(['instant_search']);
  const [createAutonomy, setCreateAutonomy] = useState<AutonomyMode>('manual');
  const [createSchedulePreset, setCreateSchedulePreset] = useState<SchedulePreset>('off');
  const [createScheduleCron, setCreateScheduleCron] = useState('');
  const [createHardRequirements, setCreateHardRequirements] = useState<HardRequirement[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [recruiterFilter, setRecruiterFilter] = useState<RecruiterTeamFilterValue>({});
  const [showEdit, setShowEdit] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [editName, setEditName] = useState('');
  const [editAccessLevel, setEditAccessLevel] = useState<'shared' | 'private'>('shared');
  const [editCollaborators, setEditCollaborators] = useState<string[]>([]);
  const [drawerAgent, setDrawerAgent] = useState<{ id: string; name: string } | null>(null);

  const openDrawer = (agent: Agent) => {
    setDrawerAgent({ id: agent.id, name: agent.name });
    setMenuOpen(null);
  };

  const fetchAgents = useCallback(async () => {
    try {
      const params: Record<string, string | number> = { limit: 50 };
      if (recruiterFilter.filterUserId) params.filterUserId = recruiterFilter.filterUserId;
      if (recruiterFilter.filterTeamId) params.filterTeamId = recruiterFilter.filterTeamId;
      if (recruiterFilter.teamView) params.teamView = 'true';
      const res = await axios.get('/api/v1/agents', { params });
      setAgents(res.data.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [recruiterFilter]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Load jobs the caller can scope an agent to. Re-runs when the query changes or the modal opens.
  useEffect(() => {
    if (!showCreate) return;
    let cancelled = false;
    const params: Record<string, string | number> = { limit: 100 };
    if (jobQuery.trim()) params.q = jobQuery.trim();
    axios
      .get<JobsAvailableResponse>('/api/v1/agents/jobs-available', { params })
      .then((res) => {
        if (cancelled) return;
        setAvailableJobs(res.data.data || []);
        setJobsMeta(res.data.meta || { isAdmin: false, scope: 'own' });
      })
      .catch(() => {
        if (!cancelled) setAvailableJobs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [showCreate, jobQuery]);

  const resetCreateForm = () => {
    setCreateName('');
    setCreateDesc('');
    setCreateTaskType('search_candidates');
    setCreateInstructions('');
    setCreateJobId('');
    setJobQuery('');
    setCreateSourceModes(['instant_search']);
    setCreateAutonomy('manual');
    setCreateSchedulePreset('off');
    setCreateScheduleCron('');
    setCreateHardRequirements([]);
    setCreateError(null);
  };

  const handleCreate = async () => {
    setCreateError(null);
    if (!createName.trim() || !createDesc.trim() || !createJobId) return;
    if (createTaskType === 'search_candidates' && createSourceModes.length === 0) {
      setCreateError(t('agents.workbench.errors.sourceRequired', 'Pick at least one candidate source'));
      return;
    }
    let cron: string | undefined;
    if (createAutonomy === 'scheduled') {
      cron = createSchedulePreset === 'custom' ? createScheduleCron.trim() : SCHEDULE_PRESETS[createSchedulePreset as 'hourly' | 'daily' | 'weekly'];
      if (!cron || cron.split(/\s+/).filter(Boolean).length < 5) {
        setCreateError(t('agents.workbench.errors.invalidCron', 'Enter a valid cron expression (5 fields)'));
        return;
      }
    }
    setCreating(true);
    try {
      await axios.post('/api/v1/agents', {
        name: createName.trim(),
        description: createDesc.trim(),
        taskType: createTaskType,
        instructions: createInstructions.trim() || undefined,
        jobId: createJobId,
        source: createTaskType === 'search_candidates' ? { modes: createSourceModes } : undefined,
        autonomy: createAutonomy,
        schedule: cron ?? null,
        scheduleEnabled: createAutonomy === 'scheduled',
        config: createHardRequirements.length > 0 ? { hardRequirements: createHardRequirements } : undefined,
      });
      setShowCreate(false);
      resetCreateForm();
      fetchAgents();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setCreateError(msg || t('agents.workbench.errors.createFailed', 'Failed to create agent'));
    } finally {
      setCreating(false);
    }
  };

  const toggleSourceMode = (mode: SourceMode) => {
    setCreateSourceModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
    );
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/v1/agents/${id}`);
      setMenuOpen(null);
      fetchAgents();
    } catch {
      // ignore
    }
  };

  const handleToggleStatus = async (agent: Agent) => {
    const newStatus = agent.status === 'active' ? 'paused' : 'active';
    try {
      await axios.patch(`/api/v1/agents/${agent.id}`, { status: newStatus });
      setMenuOpen(null);
      fetchAgents();
    } catch {
      // ignore
    }
  };

  const openEditModal = useCallback((agent: Agent) => {
    setEditAgent(agent);
    setEditName(agent.name);
    setEditAccessLevel(agent.accessLevel || 'shared');
    setEditCollaborators(agent.collaborators || []);
    setMenuOpen(null);
    setShowEdit(true);
  }, []);

  const handleSaveEdit = async () => {
    if (!editAgent || !editName.trim()) return;
    try {
      await axios.patch(`/api/v1/agents/${editAgent.id}`, {
        name: editName.trim(),
        accessLevel: editAccessLevel,
        collaborators: editCollaborators,
      });
      setShowEdit(false);
      setEditAgent(null);
      fetchAgents();
    } catch {
      // ignore
    }
  };

  // Filtered agents
  const filteredAgents = useMemo(() => {
    let list = agents;
    if (statusFilter !== 'all') {
      list = list.filter((a) => a.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a) =>
        a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
      );
    }
    return list;
  }, [agents, statusFilter, search]);

  // Overview stats
  const overviewStats = useMemo(() => {
    const counts = { active: 0, paused: 0, configuring: 0, failed: 0, closed: 0, out_of_leads: 0 };
    let totalApproved = 0, totalPending = 0, totalRejected = 0;
    agents.forEach((a) => {
      if (a.status in counts) counts[a.status as keyof typeof counts]++;
      totalApproved += a.totalApproved;
      totalRejected += a.totalRejected;
      const pending = Math.max(0, a._count.candidates - a.totalApproved - a.totalRejected - a.totalContacted);
      totalPending += pending;
    });
    return { counts, totalApproved, totalPending, totalRejected };
  }, [agents]);

  // Per-agent leads for the "Leads by Agent" section
  const agentLeads = useMemo(() => {
    return agents
      .map((a) => ({
        name: a.name,
        approved: a.totalApproved,
        pending: Math.max(0, a._count.candidates - a.totalApproved - a.totalRejected - a.totalContacted),
        rejected: a.totalRejected,
      }))
      .filter((a) => a.approved + a.pending + a.rejected > 0)
      .sort((a, b) => b.pending - a.pending)
      .slice(0, 5);
  }, [agents]);

  const totalLeads = overviewStats.totalApproved + overviewStats.totalPending + overviewStats.totalRejected;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-violet-600" />
      </div>
    );
  }

  return (
    <div className="flex gap-6 min-h-[calc(100vh-120px)]">
      {/* ── Left Panel: Agent List ── */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('agents.title', 'Agents')}</h1>
            <p className="text-sm text-slate-500 mt-1">{t('agents.subtitle', 'RoboHire agents can source, review, and reach out to profiles autonomously.')}</p>
          </div>
          <div className="flex items-center gap-3">
            <RecruiterTeamFilter value={recruiterFilter} onChange={setRecruiterFilter} />
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 px-5 py-2 text-sm font-semibold text-white shadow-[0_14px_28px_-16px_rgba(37,99,235,0.9)] transition-all hover:-translate-y-0.5"
            >
              {t('agents.create', 'Create new agent')}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tab */}
        <div className="border-b border-slate-200 mb-5">
          <button className="pb-2.5 text-sm font-medium text-violet-600 border-b-2 border-violet-600">
            {t('agents.myAgents', 'My Agents')}
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-md">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('agents.searchPlaceholder', 'Search for any agent, owner name, or collaborator name')}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 placeholder:text-slate-400 focus:border-violet-400 focus:ring-1 focus:ring-violet-400 bg-white"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 bg-white min-w-[100px] focus:border-violet-400 focus:ring-1 focus:ring-violet-400"
          >
            <option value="all">{t('agents.filterStatus', 'Status')}</option>
            {AGENT_STATUSES.map((s) => (
              <option key={s} value={s}>{t(`agents.status.${s}`, s.replace(/_/g, ' '))}</option>
            ))}
          </select>
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 bg-white min-w-[100px] focus:border-violet-400 focus:ring-1 focus:ring-violet-400"
          >
            <option value="all">{t('agents.filterOwner', 'Owner')}</option>
            {user && (
              <option value={user.id}>{user.name || user.email}</option>
            )}
          </select>
          {/* View toggle */}
          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden ml-auto">
            <button
              onClick={() => setViewMode('card')}
              className={`p-2 transition-colors ${viewMode === 'card' ? 'bg-violet-50 text-violet-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
              title={t('agents.cardView', 'Card view')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-violet-50 text-violet-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
              title={t('agents.listView', 'List view')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
          </div>
        </div>

        {/* Section heading */}
        <h2 className="text-base font-semibold text-slate-900 mb-3">{t('agents.myAgents', 'My Agents')}</h2>

        {/* Agent Cards / List */}
        {filteredAgents.length === 0 ? (
          <div className="text-center py-16 rounded-xl border border-dashed border-slate-200 bg-white">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-violet-50">
              <svg className="w-6 h-6 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-900">{t('agents.empty', 'No agents yet')}</h3>
            <p className="mt-1 text-sm text-slate-500">{t('agents.emptyDesc', 'Create your first AI sourcing agent to start finding candidates automatically.')}</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 px-5 py-2 text-sm font-semibold text-white shadow-[0_14px_28px_-16px_rgba(37,99,235,0.9)] transition-all hover:-translate-y-0.5"
            >
              {t('agents.create', 'Create new agent')}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          </div>
        ) : viewMode === 'card' ? (
          /* ── Card View (grid) ── */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredAgents.map((agent) => {
              const pendingCount = Math.max(0, agent._count.candidates - agent.totalApproved - agent.totalRejected - agent.totalContacted);
              return (
                <div
                  key={agent.id}
                  className="relative rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300 transition-colors"
                >
                  {/* Three-dot menu */}
                  <div className="absolute top-3 right-3">
                    <button
                      onClick={(e) => { e.preventDefault(); setMenuOpen(menuOpen === agent.id ? null : agent.id); }}
                      className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>
                    {menuOpen === agent.id && (
                      <div className="absolute right-0 top-8 z-20 w-48 rounded-lg border border-slate-200 bg-white shadow-lg py-1">
                        <button
                          onClick={() => openDrawer(agent)}
                          className="w-full text-left px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50"
                        >
                          {t('agents.workbench.openWorkbench', 'Open workbench')}
                        </button>
                        <Link
                          to={`/product/agents/${agent.id}`}
                          className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          {t('agents.viewDetails', 'View Details')}
                        </Link>
                        <button
                          onClick={() => openEditModal(agent)}
                          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          {t('agents.edit', 'Edit')}
                        </button>
                        <button
                          onClick={() => handleToggleStatus(agent)}
                          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          {agent.status === 'active' ? t('agents.pause', 'Pause') : t('agents.resume', 'Resume')}
                        </button>
                        <button
                          onClick={() => handleDelete(agent.id)}
                          className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          {t('common.delete', 'Delete')}
                        </button>
                      </div>
                    )}
                  </div>

                  <div onClick={() => openDrawer(agent)} className="block cursor-pointer">
                    <h3 className="text-base font-semibold text-slate-900 pr-8 mb-1">{agent.name}</h3>
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        (agent as any).taskType === 'match'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-violet-100 text-violet-700'
                      }`}>
                        {(agent as any).taskType === 'match'
                          ? t('agents.taskTypeMatch', 'Match Candidate')
                          : t('agents.taskTypeSearch', 'Search Candidates')}
                      </span>
                      {agent.job && (
                        <span className="text-xs text-slate-500 truncate max-w-[140px]">{agent.job.title}</span>
                      )}
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{t('agents.contacted', 'Contacted')}</span>
                        <span className="ml-auto text-slate-400 font-medium">{agent.totalContacted || '-'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                        </svg>
                        <span>{t('agents.awaitingApproval', 'Awaiting approval')}</span>
                        <span className="ml-auto text-slate-400 font-medium">{pendingCount || '-'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center text-xs font-medium text-violet-600">
                          {(agent.user?.name || agent.user?.email || 'U').charAt(0).toUpperCase()}
                        </div>
                        <span className="truncate max-w-[100px]">{agent.user?.name || agent.user?.email || ''}</span>
                      </div>
                      <span className="text-sm text-slate-400" title={new Date(agent.createdAt).toLocaleString()}>
                        {new Date(agent.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                        {new Date(agent.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}
                      </span>
                      <span className="ml-auto flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${agent.status === 'active' ? 'bg-green-500' : agent.status === 'paused' ? 'bg-amber-400' : agent.status === 'configuring' ? 'bg-blue-400' : agent.status === 'failed' ? 'bg-red-500' : agent.status === 'closed' ? 'bg-slate-400' : agent.status === 'out_of_leads' ? 'bg-orange-400' : 'bg-slate-300'}`} />
                        <span className="text-xs text-slate-400">{t(`agents.status.${agent.status}`, agent.status)}</span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ── List View (table) ── */
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_90px_90px_140px_90px_80px_36px] gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <span>{t('agents.colName', 'Name')}</span>
              <span className="text-center">{t('agents.contacted', 'Contacted')}</span>
              <span className="text-center">{t('agents.colPending', 'Pending')}</span>
              <span>{t('agents.filterOwner', 'Owner')}</span>
              <span className="text-center">{t('agents.colDate', 'Created')}</span>
              <span className="text-center">{t('agents.filterStatus', 'Status')}</span>
              <span />
            </div>
            {filteredAgents.map((agent) => {
              const pendingCount = Math.max(0, agent._count.candidates - agent.totalApproved - agent.totalRejected - agent.totalContacted);
              return (
                <div
                  key={agent.id}
                  className="relative grid grid-cols-[1fr_90px_90px_140px_90px_80px_36px] gap-2 items-center px-4 py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors"
                >
                  <Link to={`/product/agents/${agent.id}`} className="text-sm font-medium text-slate-900 hover:text-violet-700 truncate transition-colors">
                    {agent.name}
                  </Link>
                  <span className="text-sm text-slate-500 text-center">{agent.totalContacted || '-'}</span>
                  <span className="text-sm text-slate-500 text-center">{pendingCount || '-'}</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center text-[10px] font-medium text-violet-600 shrink-0">
                      {(agent.user?.name || agent.user?.email || 'U').charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs text-slate-500 truncate">{agent.user?.name || agent.user?.email || ''}</span>
                  </div>
                  <span className="text-xs text-slate-400 text-center" title={new Date(agent.createdAt).toLocaleString()}>
                    {new Date(agent.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                    {new Date(agent.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}
                  </span>
                  <span className="flex items-center justify-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${agent.status === 'active' ? 'bg-green-500' : agent.status === 'paused' ? 'bg-amber-400' : agent.status === 'configuring' ? 'bg-blue-400' : agent.status === 'failed' ? 'bg-red-500' : agent.status === 'closed' ? 'bg-slate-400' : agent.status === 'out_of_leads' ? 'bg-orange-400' : 'bg-slate-300'}`} />
                    <span className="text-xs text-slate-400">{t(`agents.status.${agent.status}`, agent.status)}</span>
                  </span>
                  <div className="relative">
                    <button
                      onClick={(e) => { e.preventDefault(); setMenuOpen(menuOpen === agent.id ? null : agent.id); }}
                      className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>
                    {menuOpen === agent.id && (
                      <div className="absolute right-0 top-7 z-20 w-48 rounded-lg border border-slate-200 bg-white shadow-lg py-1">
                        <button
                          onClick={() => openDrawer(agent)}
                          className="w-full text-left px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50"
                        >
                          {t('agents.workbench.openWorkbench', 'Open workbench')}
                        </button>
                        <Link
                          to={`/product/agents/${agent.id}`}
                          className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          {t('agents.viewDetails', 'View Details')}
                        </Link>
                        <button
                          onClick={() => openEditModal(agent)}
                          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          {t('agents.edit', 'Edit')}
                        </button>
                        <button
                          onClick={() => handleToggleStatus(agent)}
                          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          {agent.status === 'active' ? t('agents.pause', 'Pause') : t('agents.resume', 'Resume')}
                        </button>
                        <button
                          onClick={() => handleDelete(agent.id)}
                          className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          {t('common.delete', 'Delete')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Right Panel: Overview ── */}
      <div className="w-80 shrink-0 hidden lg:block">
        {/* Overview header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">{t('agents.overview', 'Overview')}</h2>
          <div className="flex items-center gap-2">
            <select className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-500 bg-white">
              <option>{t('agents.allTime', 'All time')}</option>
            </select>
            <select className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-500 bg-white">
              <option>{t('agents.allUsers', 'All Users')}</option>
            </select>
          </div>
        </div>

        {/* Status count cards */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-center">
            <div className="text-2xl font-bold text-slate-900">{overviewStats.counts.active}</div>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">{t('agents.status.active', 'Active')}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-center">
            <div className="text-2xl font-bold text-slate-900">{overviewStats.counts.paused}</div>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">{t('agents.status.paused', 'Paused')}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-center">
            <div className="text-2xl font-bold text-slate-900">{overviewStats.counts.configuring}</div>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">{t('agents.status.configuring', 'Configuring')}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-center">
            <div className="text-2xl font-bold text-slate-900">{overviewStats.counts.failed}</div>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">{t('agents.status.failed', 'Failed')}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-center">
            <div className="text-2xl font-bold text-slate-900">{overviewStats.counts.closed}</div>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">{t('agents.status.closed', 'Closed')}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-center">
            <div className="text-2xl font-bold text-slate-900">{overviewStats.counts.out_of_leads}</div>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">{t('agents.status.out_of_leads', 'Out of leads')}</div>
          </div>
        </div>

        {/* Leads donut chart section */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 mb-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">{t('agents.leads', 'Leads')}</h3>
          {totalLeads === 0 ? (
            <div className="flex items-center justify-center h-28 bg-slate-50 rounded-lg mb-3">
              <span className="text-xs text-slate-400">{t('agents.noDataYet', 'No data yet')}</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-4 mb-3">
              {/* Simple donut visualization */}
              <div className="relative w-24 h-24">
                <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                  <circle cx="18" cy="18" r="14" fill="none" stroke="#e2e8f0" strokeWidth="5" />
                  {overviewStats.totalApproved > 0 && (
                    <circle
                      cx="18" cy="18" r="14" fill="none" stroke="#22c55e" strokeWidth="5"
                      strokeDasharray={`${(overviewStats.totalApproved / totalLeads) * 88} 88`}
                      strokeDashoffset="0"
                    />
                  )}
                  {overviewStats.totalPending > 0 && (
                    <circle
                      cx="18" cy="18" r="14" fill="none" stroke="#3b82f6" strokeWidth="5"
                      strokeDasharray={`${(overviewStats.totalPending / totalLeads) * 88} 88`}
                      strokeDashoffset={`${-((overviewStats.totalApproved / totalLeads) * 88)}`}
                    />
                  )}
                  {overviewStats.totalRejected > 0 && (
                    <circle
                      cx="18" cy="18" r="14" fill="none" stroke="#ef4444" strokeWidth="5"
                      strokeDasharray={`${(overviewStats.totalRejected / totalLeads) * 88} 88`}
                      strokeDashoffset={`${-(((overviewStats.totalApproved + overviewStats.totalPending) / totalLeads) * 88)}`}
                    />
                  )}
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold text-slate-900">{totalLeads}</span>
                </div>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-slate-600">{overviewStats.totalApproved} {t('agents.stat.approved', 'Approved')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-slate-600">{overviewStats.totalPending} {t('agents.pending', 'Pending')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-slate-600">{overviewStats.totalRejected} {t('agents.disapproved', 'Disapproved')}</span>
                </div>
              </div>
            </div>
          )}
          {/* Legend */}
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />{t('agents.stat.approved', 'Approved')}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />{t('agents.pending', 'Pending')}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />{t('agents.disapproved', 'Disapproved')}</span>
          </div>
        </div>

        {/* Leads by Agent */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-1">{t('agents.leadsByAgent', 'Leads by Agent')}</h3>
          <p className="text-[11px] text-slate-400 mb-3">
            {t('agents.leadsByAgentDesc', 'Top {{count}} agents by pending approval leads. For admins, this is across all agents in the organization.', { count: agentLeads.length })}
          </p>
          {agentLeads.length === 0 ? (
            <div className="flex items-center justify-center h-24 bg-slate-50 rounded-lg mb-3">
              <span className="text-xs text-slate-400">{t('agents.noDataYet', 'No data yet')}</span>
            </div>
          ) : (
            <div className="space-y-2 mb-3">
              {agentLeads.map((al) => {
                const total = al.approved + al.pending + al.rejected;
                return (
                  <div key={al.name}>
                    <div className="text-xs text-slate-600 mb-1 truncate">{al.name}</div>
                    <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                      {al.approved > 0 && (
                        <div className="bg-green-500" style={{ width: `${(al.approved / total) * 100}%` }} />
                      )}
                      {al.pending > 0 && (
                        <div className="bg-blue-500" style={{ width: `${(al.pending / total) * 100}%` }} />
                      )}
                      {al.rejected > 0 && (
                        <div className="bg-red-500" style={{ width: `${(al.rejected / total) * 100}%` }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* Legend */}
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />{t('agents.stat.approved', 'Approved')}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />{t('agents.pending', 'Pending')}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />{t('agents.disapproved', 'Disapproved')}</span>
          </div>
        </div>
      </div>

      {/* ── Create Modal ── */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 py-10"
          onClick={() => { setShowCreate(false); resetCreateForm(); }}
        >
          <div
            className="bg-white rounded-xl shadow-xl p-6 max-w-2xl w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900">{t('agents.createTitle', 'Create New Agent')}</h3>
            <p className="mt-1 mb-5 text-sm text-slate-500 leading-relaxed">
              {t('agents.createDesc', 'Automate your search with a smart agent. Set criteria once and let your agent keep working in the background—no need to repeat yourself.')}
            </p>

            <div className="space-y-5">
              {/* Agent Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('agents.agentName', 'Agent Name')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder={t('agents.namePlaceholder', 'e.g. Senior Full-stack Sourcer')}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                />
              </div>

              {/* Task Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('agents.taskType', 'Task Type')} <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateTaskType('search_candidates')}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                      createTaskType === 'search_candidates'
                        ? 'border-violet-500 bg-violet-50 text-violet-700 ring-1 ring-violet-500'
                        : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    {t('agents.taskTypeSearch', 'Search Candidates')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateTaskType('match_resumes')}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                      createTaskType === 'match_resumes'
                        ? 'border-violet-500 bg-violet-50 text-violet-700 ring-1 ring-violet-500'
                        : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {t('agents.workbench.taskTypeMatchResumes', 'Match Resumes')}
                  </button>
                </div>
              </div>

              {/* Linked Job — admin-aware */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('agents.linkedJob', 'Linked Job')} <span className="text-red-500">*</span>
                  {jobsMeta.isAdmin && (
                    <span className="ml-2 inline-flex items-center rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700">
                      {t('agents.workbench.adminScope', 'admin · all users')}
                    </span>
                  )}
                </label>
                {jobsMeta.isAdmin && (
                  <input
                    type="text"
                    value={jobQuery}
                    onChange={(e) => setJobQuery(e.target.value)}
                    placeholder={t('agents.workbench.jobSearchPlaceholder', 'Search jobs by title...')}
                    className="mb-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  />
                )}
                <select
                  value={createJobId}
                  onChange={(e) => setCreateJobId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                >
                  <option value="">{t('agents.selectJob', 'Select a job...')}</option>
                  {availableJobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title}
                      {jobsMeta.isAdmin && j.user ? ` — ${j.user.name || j.user.email}` : ''}
                    </option>
                  ))}
                </select>
                {availableJobs.length === 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    {t('agents.workbench.noJobsAvailable', 'No jobs available. Create a job first.')}
                  </p>
                )}
              </div>

              {/* Candidate Source (search_candidates only) */}
              {createTaskType === 'search_candidates' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('agents.workbench.candidateSource', 'Candidate Source')} <span className="text-red-500">*</span>
                  </label>
                  <p className="mb-2 text-xs text-slate-500">
                    {t('agents.workbench.candidateSourceDesc', 'Pick one or more places the agent should search.')}
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {(['instant_search', 'internal_minio', 'external_api'] as SourceMode[]).map((mode) => {
                      const selected = createSourceModes.includes(mode);
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => toggleSourceMode(mode)}
                          className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                            selected
                              ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-500'
                              : 'border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <span
                            className={`mt-0.5 flex h-4 w-4 items-center justify-center rounded border ${
                              selected ? 'border-violet-600 bg-violet-600' : 'border-slate-400 bg-white'
                            }`}
                          >
                            {selected && (
                              <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </span>
                          <span>
                            <span className="block text-sm font-medium text-slate-900">
                              {t(`agents.workbench.source.${mode}.name`, mode)}
                            </span>
                            <span className="block text-xs text-slate-500">
                              {t(`agents.workbench.source.${mode}.desc`, '')}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Hard Requirements — optional strict filter */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('agents.workbench.create.hardRequirementsStep.label', 'Hard Requirements')}{' '}
                  <span className="text-xs font-normal text-slate-500">
                    ({t('agents.workbench.create.hardRequirementsStep.optional', 'optional')})
                  </span>
                </label>
                <HardRequirementsEditor
                  value={createHardRequirements}
                  onChange={setCreateHardRequirements}
                  compact
                />
              </div>

              {/* Search Criteria — auto-grow */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('agents.searchCriteria', 'Search Criteria')} <span className="text-red-500">*</span>
                </label>
                <AutoGrowTextarea
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  placeholder={t('agents.criteriaPlaceholder', 'Describe your ideal candidate in detail...')}
                  minRows={3}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                />
              </div>

              {/* Instructions — auto-grow */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('agents.instructions', 'Instructions')}
                </label>
                <AutoGrowTextarea
                  value={createInstructions}
                  onChange={(e) => setCreateInstructions(e.target.value)}
                  placeholder={t('agents.instructionsPlaceholder', 'Tell the agent what you want it to do...')}
                  minRows={3}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                />
              </div>

              {/* Schedule */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('agents.workbench.schedule', 'Schedule')}
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {(['off', 'hourly', 'daily', 'weekly', 'custom'] as SchedulePreset[]).map((preset) => {
                    const selected = createSchedulePreset === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setCreateSchedulePreset(preset);
                          setCreateAutonomy(preset === 'off' ? 'manual' : 'scheduled');
                        }}
                        className={`rounded-xl border px-2 py-2 text-xs font-medium transition-colors ${
                          selected
                            ? 'border-violet-500 bg-violet-50 text-violet-700 ring-1 ring-violet-500'
                            : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {t(`agents.workbench.schedulePreset.${preset}`, preset)}
                      </button>
                    );
                  })}
                </div>
                {createSchedulePreset === 'custom' && (
                  <input
                    type="text"
                    value={createScheduleCron}
                    onChange={(e) => setCreateScheduleCron(e.target.value)}
                    placeholder="0 9 * * 1-5"
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  />
                )}
                {createSchedulePreset !== 'off' && createSchedulePreset !== 'custom' && (
                  <p className="mt-1 font-mono text-[11px] text-slate-500">
                    cron: {SCHEDULE_PRESETS[createSchedulePreset as 'hourly' | 'daily' | 'weekly']}
                  </p>
                )}
              </div>

              {createError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {createError}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => { setShowCreate(false); resetCreateForm(); }}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !createName.trim() || !createDesc.trim() || !createJobId}
                className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors disabled:opacity-50"
              >
                {creating ? t('agents.creating', 'Creating...') : t('agents.createBtn', 'Create Agent')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Agent Modal ── */}
      {showEdit && editAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowEdit(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">{t('agents.editAgent', 'Edit Agent')}</h3>
              <button
                onClick={() => setShowEdit(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <hr className="border-slate-200 mb-5" />

            <div className="space-y-5">
              {/* Agent Title */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  {t('agents.agentTitle', 'Agent Title')}
                  <span className="text-slate-400 font-normal ml-1">({t('agents.required', 'required')})</span>
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                />
              </div>

              {/* Access Level */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  {t('agents.accessLevel', 'Access Level')}
                  <span className="text-slate-400 font-normal ml-1">({t('agents.required', 'required')})</span>
                </label>
                <div className="space-y-2.5">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="accessLevel"
                      checked={editAccessLevel === 'shared'}
                      onChange={() => setEditAccessLevel('shared')}
                      className="text-violet-600 focus:ring-violet-500"
                    />
                    <span className="text-sm text-slate-700">
                      {t('agents.accessShared', 'Shared (visible to everyone in your organization)')}
                    </span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="accessLevel"
                      checked={editAccessLevel === 'private'}
                      onChange={() => setEditAccessLevel('private')}
                      className="text-violet-600 focus:ring-violet-500"
                    />
                    <span className="text-sm text-slate-700">
                      {t('agents.accessPrivate', 'Private (only visible to you, your collaborators, and admin)')}
                    </span>
                  </label>
                </div>
              </div>

              {/* Collaborators */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t('agents.collaborators', 'Collaborators')}
                  <span className="text-slate-400 font-normal ml-1">({t('product.matching.optional', 'optional')})</span>
                </label>
                <p className="text-xs text-slate-500 mb-2">
                  {t('agents.collaboratorsDesc', 'These team members will be assigned to this project with you')}
                </p>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  value=""
                  onChange={() => {}}
                >
                  <option value="">{t('agents.noCollaborators', 'No collaborators selected')}</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSaveEdit}
                disabled={!editName.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 transition-colors disabled:opacity-50"
              >
                {t('agents.saveChanges', 'Save Changes')}
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close menu on outside click */}
      {menuOpen && (
        <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
      )}

      {/* ── Run/Results Drawer ── */}
      {drawerAgent && (
        <AgentRunDrawer
          agentId={drawerAgent.id}
          agentName={drawerAgent.name}
          onClose={() => {
            setDrawerAgent(null);
            fetchAgents();
          }}
        />
      )}
    </div>
  );
}
