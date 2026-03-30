import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import { ChatInterface } from '../components/agent-alex/ChatInterface';
import { LiveVoiceInterface } from '../components/agent-alex/LiveVoiceInterface';
import { SpecificationPanel } from '../components/agent-alex/SpecificationPanel';
import type { AppConfigStatus, HiringRequirements, Session, ChatMessage } from '../components/agent-alex/types';
import { Bot, MessageSquare, Download, FileText, Sparkles, Plus, History, Edit2, Check, Trash2, ChevronDown, Loader2, ExternalLink, RefreshCw, Link2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import {
  fetchAppConfig, createJobFromSpec, updateJobFromSpec,
  fetchSessions, createSession as apiCreateSession, updateSession as apiUpdateSession, deleteSession as apiDeleteSession,
  type DbSession,
} from '../components/agent-alex/api';
import SEO from '../components/SEO';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

// --- helpers ---

function buildJobDescription(req: HiringRequirements): string {
  const lines: string[] = [];
  if (req.primaryResponsibilities?.length) {
    lines.push('## Responsibilities', ...req.primaryResponsibilities.map(r => `- ${r}`), '');
  }
  if (req.secondaryResponsibilities?.length) {
    lines.push('## Additional Responsibilities', ...req.secondaryResponsibilities.map(r => `- ${r}`), '');
  }
  if (req.teamCulture) lines.push('## Team Culture', req.teamCulture, '');
  if (req.reasonForOpening) lines.push('## Reason for Opening', req.reasonForOpening, '');
  return lines.join('\n');
}

function buildQualifications(req: HiringRequirements): string {
  const lines: string[] = [];
  if (req.hardSkills?.length) lines.push('**Hard Skills:**', ...req.hardSkills.map(s => `- ${s}`), '');
  if (req.softSkills?.length) lines.push('**Soft Skills:**', ...req.softSkills.map(s => `- ${s}`), '');
  if (req.yearsOfExperience) lines.push(`**Experience:** ${req.yearsOfExperience}`);
  if (req.industryExperience) lines.push(`**Industry:** ${req.industryExperience}`);
  return lines.join('\n');
}

function buildJobPayload(req: HiringRequirements) {
  return {
    title: req.jobTitle!,
    department: req.department,
    location: req.workLocation,
    education: req.education,
    headcount: req.headcount ? parseInt(req.headcount, 10) || 1 : 1,
    salaryText: req.salaryRange,
    description: buildJobDescription(req),
    qualifications: buildQualifications(req),
    hardRequirements: req.dealBreakers?.join('\n'),
    niceToHave: req.preferredQualifications?.join('\n'),
  };
}

function dbToSession(db: DbSession): Session {
  return {
    id: db.id,
    title: db.title,
    messages: db.messages as ChatMessage[],
    requirements: db.requirements as HiringRequirements,
    linkedJobId: db.linkedJobId,
    updatedAt: new Date(db.updatedAt).getTime(),
  };
}

function isAuthenticated(): boolean {
  return Boolean(localStorage.getItem('auth_token'));
}

export default function AgentAlex() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [mode, setMode] = useState<'chat' | 'live'>('chat');
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'interaction' | 'spec'>('interaction');
  const [appConfig, setAppConfig] = useState<AppConfigStatus | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const welcomeText = t('agentAlex.chat.welcome', 'Hello! I am your Recruitment Agent Alex. What role are you looking to fill today?');

  // --- initial load ---

  useEffect(() => {
    const loadSessions = async () => {
      if (isAuthenticated()) {
        try {
          const dbSessions = await fetchSessions();
          if (dbSessions.length > 0) {
            const mapped = dbSessions.map(dbToSession);
            setSessions(mapped);
            setActiveSessionId(mapped[0].id);
            setIsLoading(false);
            return;
          }
        } catch { /* fall through */ }
      }
      // No DB sessions or not authenticated — create a fresh one
      const fresh = await createNewSession(welcomeText);
      setSessions([fresh]);
      setActiveSessionId(fresh.id);
      setIsLoading(false);
    };
    loadSessions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchAppConfig()
      .then(config => { setAppConfig(config); setConfigError(null); })
      .catch(error => { setAppConfig({ configured: false }); setConfigError(error instanceof Error ? error.message : 'Unable to verify Gemini server configuration.'); });
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsHistoryOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0];

  // --- debounced DB save ---

  const scheduleSave = useCallback((session: Session) => {
    if (!isAuthenticated()) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      apiUpdateSession(session.id, {
        title: session.title,
        messages: session.messages as unknown[],
        requirements: session.requirements as Record<string, unknown>,
      }).catch(() => { /* silent */ });
    }, 1500);
  }, []);

  // --- session CRUD ---

  async function createNewSession(welcome: string): Promise<Session> {
    const msgs: ChatMessage[] = [{ id: 'welcome', role: 'model', text: welcome }];
    if (isAuthenticated()) {
      try {
        const db = await apiCreateSession({ title: 'New Chat', messages: msgs, requirements: {} });
        return dbToSession(db);
      } catch { /* fall through */ }
    }
    return {
      id: Math.random().toString(36).substring(2, 9),
      title: 'New Chat',
      messages: msgs,
      requirements: {},
      updatedAt: Date.now(),
    };
  }

  const handleNewChat = async () => {
    const newSession = await createNewSession(welcomeText);
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setMode('chat');
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const session = sessions.find(s => s.id === id);
    if (session?.linkedJobId) return; // blocked in UI, safety check

    if (isAuthenticated()) {
      const result = await apiDeleteSession(id);
      if (!result.success) return; // backend rejected (e.g. linked job)
    }

    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== id);
      if (filtered.length === 0) {
        // will create async, for now keep empty — the useEffect will handle
        createNewSession(welcomeText).then(s => {
          setSessions([s]);
          setActiveSessionId(s.id);
        });
        return [];
      }
      if (activeSessionId === id) setActiveSessionId(filtered[0].id);
      return filtered;
    });
  };

  // --- session updates ---

  const handleUpdateRequirements = (newData: Partial<HiringRequirements>) => {
    setSessions(prev => prev.map(session => {
      if (session.id !== activeSessionId) return session;

      const updatedReqs = { ...session.requirements };
      for (const key in newData) {
        const k = key as keyof HiringRequirements;
        if (newData[k] !== undefined) (updatedReqs as any)[k] = newData[k];
      }

      let newTitle = session.title;
      if (updatedReqs.jobTitle && session.title === 'New Chat') newTitle = updatedReqs.jobTitle;

      const updated = { ...session, title: newTitle, requirements: updatedReqs, updatedAt: Date.now() };
      scheduleSave(updated);
      return updated;
    }));
  };

  const handleUpdateMessages = (newMessagesOrUpdater: React.SetStateAction<ChatMessage[]>) => {
    setSessions(prev => prev.map(session => {
      if (session.id !== activeSessionId) return session;
      const nextMessages = typeof newMessagesOrUpdater === 'function' ? newMessagesOrUpdater(session.messages) : newMessagesOrUpdater;
      const updated = { ...session, messages: nextMessages, updatedAt: Date.now() };
      scheduleSave(updated);
      return updated;
    }));
  };

  // --- title editing ---

  const startEditingTitle = (session: Session, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTitleId(session.id);
    setEditTitleValue(session.title);
  };

  const saveTitle = (id: string) => {
    if (editTitleValue.trim()) {
      setSessions(prev => prev.map(s => {
        if (s.id !== id) return s;
        const updated = { ...s, title: editTitleValue.trim(), updatedAt: Date.now() };
        scheduleSave(updated);
        return updated;
      }));
    }
    setEditingTitleId(null);
  };

  // --- export ---

  const exportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activeSession.requirements, null, 2));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", `hiring_requirements_${activeSession.title.replace(/\s+/g, '_')}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // --- job create / update ---

  const handleCreateOrUpdateJob = async () => {
    const req = activeSession.requirements;
    if (!req.jobTitle) return;
    setIsCreatingJob(true);
    try {
      const payload = buildJobPayload(req);
      if (activeSession.linkedJobId) {
        // Update existing linked job
        await updateJobFromSpec(activeSession.linkedJobId, payload);
      } else {
        // Create new job and link to session
        const result = await createJobFromSpec({ ...payload, status: 'draft' });
        if (result.data) {
          const jobId = result.data.id;
          // Link job to session in DB
          if (isAuthenticated()) {
            await apiUpdateSession(activeSession.id, { linkedJobId: jobId });
          }
          setSessions(prev => prev.map(s =>
            s.id === activeSession.id ? { ...s, linkedJobId: jobId } : s
          ));
        }
      }
    } catch (error) {
      console.error('Failed to create/update job:', error);
    } finally {
      setIsCreatingJob(false);
    }
  };

  const canCreateJob = Boolean(activeSession?.requirements?.jobTitle);
  const hasLinkedJob = Boolean(activeSession?.linkedJobId);

  // --- config banner ---

  const getDisabledMessage = () => {
    if (configError) return configError;
    if (!appConfig) return t('agentAlex.config.checking', 'Checking Gemini server configuration...');
    if (appConfig.configured) return undefined;
    if (appConfig.reason === 'placeholder_api_key')
      return t('agentAlex.config.placeholder', 'Gemini is disabled because GEMINI_API_KEY is still a placeholder. Copy .env.example to .env.local, add a real key, and restart the server.');
    return t('agentAlex.config.missing', 'Gemini is disabled because GEMINI_API_KEY is missing. Copy .env.example to .env.local, add your key, and restart the server.');
  };

  const disabledMessage = getDisabledMessage();
  const isAiEnabled = appConfig?.configured === true && !configError;
  const showConfigBanner = Boolean(disabledMessage && !isAiEnabled && appConfig);

  if (isLoading || !activeSession) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  // --- job button component (shared desktop/mobile) ---

  const JobButton = ({ compact }: { compact?: boolean }) => {
    if (hasLinkedJob) {
      return (
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCreateOrUpdateJob}
            disabled={!canCreateJob || isCreatingJob}
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors",
              compact ? "px-2.5 py-1.5" : "px-3 py-1.5"
            )}
          >
            {isCreatingJob ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {t('agentAlex.spec.updateJob', 'Update Job')}
          </button>
          <button
            onClick={() => navigate(`/product/jobs/${activeSession.linkedJobId}`)}
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors",
              compact ? "px-2.5 py-1.5" : "px-3 py-1.5"
            )}
          >
            <ExternalLink className="w-3 h-3" />
            {t('agentAlex.spec.viewJob', 'View Job')}
          </button>
        </div>
      );
    }

    return (
      <button
        onClick={handleCreateOrUpdateJob}
        disabled={!canCreateJob || isCreatingJob}
        className={cn(
          "flex items-center gap-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors",
          compact ? "px-2.5 py-1.5" : "px-3 py-1.5"
        )}
      >
        {isCreatingJob ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        {t('agentAlex.spec.createJob', 'Create Job')}
      </button>
    );
  };

  return (
    <>
    <SEO
      title="Agent Alex — AI 招聘需求分析"
      description="通过 AI 对话式交互，快速梳理和结构化你的招聘需求。支持文字聊天和实时语音对话。"
      url="https://robohire.io/agent-alex"
    />
    <div className="h-screen bg-slate-50 flex flex-col font-sans text-slate-900 overflow-hidden">
      {/* Compact header */}
      <header className="bg-white border-b border-slate-200 px-3 py-2.5 sm:px-6 sm:py-3 flex items-center justify-between sticky top-0 z-50 shrink-0">
        <div className="flex items-center gap-3 sm:gap-4">
          <Link to="/" className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity">
            <img src="/logo2.png" alt="RoboHire" className="h-7 sm:h-8" />
          </Link>
          <div className="w-px h-6 bg-slate-200" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-indigo-600 rounded-xl flex items-center justify-center shadow-inner shadow-indigo-400/20 shrink-0">
              <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-slate-900 leading-tight">{t('agentAlex.title', 'Agent Alex')}</h1>
              <p className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider hidden sm:block">{t('agentAlex.subtitle', 'Recruitment Requirements Analyst')}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-4">
          {/* Session history dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              className={cn(
                "flex items-center gap-1.5 sm:gap-2 px-2.5 py-2 sm:px-4 rounded-md text-sm font-medium transition-all border",
                isHistoryOpen ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              )}
            >
              <History className="w-4 h-4" />
              <span className="max-w-[80px] sm:max-w-[150px] truncate hidden sm:inline">{activeSession.title}</span>
              <ChevronDown className={cn("w-4 h-4 transition-transform", isHistoryOpen && "rotate-180")} />
            </button>

            <AnimatePresence>
              {isHistoryOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full mt-2 right-0 w-[calc(100vw-2rem)] sm:w-80 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50 flex flex-col max-h-[60vh]"
                >
                  <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('agentAlex.sessions.recent', 'Recent Sessions')}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleNewChat(); setIsHistoryOpen(false); }}
                      className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {t('agentAlex.sessions.newChat', 'New Chat')}
                    </button>
                  </div>
                  <div className="overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {sessions.sort((a, b) => b.updatedAt - a.updatedAt).map(session => (
                      <div
                        key={session.id}
                        onClick={() => { setActiveSessionId(session.id); setIsHistoryOpen(false); }}
                        className={cn(
                          "p-3 rounded-lg cursor-pointer transition-all group border",
                          activeSessionId === session.id ? "bg-indigo-50/50 border-indigo-100" : "bg-transparent border-transparent hover:bg-slate-50"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          {editingTitleId === session.id ? (
                            <div className="flex items-center gap-1 w-full" onClick={e => e.stopPropagation()}>
                              <input
                                autoFocus
                                value={editTitleValue}
                                onChange={e => setEditTitleValue(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && saveTitle(session.id)}
                                className="flex-1 bg-white border border-indigo-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                              <button onClick={() => saveTitle(session.id)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-1.5 flex-1 min-w-0 pr-2">
                                {session.linkedJobId && <Link2 className="w-3 h-3 text-indigo-400 shrink-0" />}
                                <span className={cn(
                                  "truncate text-sm",
                                  activeSessionId === session.id ? "font-semibold text-indigo-900" : "font-medium text-slate-700"
                                )}>
                                  {session.title}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={(e) => startEditingTitle(session, e)} className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                {session.linkedJobId ? (
                                  <span className="p-1 text-slate-300 cursor-not-allowed" title={t('agentAlex.sessions.cannotDelete', 'Cannot delete — linked to a job')}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </span>
                                ) : (
                                  <button onClick={(e) => handleDeleteSession(session.id, e)} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {new Date(session.updatedAt).toLocaleDateString()} {new Date(session.updatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="hidden sm:block w-px h-8 bg-slate-200 mx-1" />

          <div className="flex bg-slate-100 p-0.5 sm:p-1 rounded-lg border border-slate-200 shadow-inner">
            <button
              onClick={() => setMode('chat')}
              className={cn(
                "flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-md text-sm font-medium transition-all",
                mode === 'chat' ? "bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
              )}
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">{t('agentAlex.modes.textChat', 'Text Chat')}</span>
            </button>
          </div>

          <button onClick={exportJSON} className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm">
            <Download className="w-4 h-4" />
            {t('agentAlex.actions.exportSpec', 'Export Spec')}
          </button>
          <button onClick={exportJSON} className="sm:hidden p-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors shadow-sm" title={t('agentAlex.actions.exportSpec', 'Export Spec')}>
            <Download className="w-4 h-4" />
          </button>
        </div>
      </header>

      {showConfigBanner && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 sm:px-6 sm:py-3 text-xs sm:text-sm text-amber-900">
          <span className="font-semibold">{t('agentAlex.config.setupRequired', 'Gemini setup required.')}</span> {disabledMessage}
        </div>
      )}

      {/* Mobile panel toggle */}
      <div className="md:hidden flex bg-slate-100 border-b border-slate-200 shrink-0">
        <button
          onClick={() => setMobilePanel('interaction')}
          className={cn("flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-all", mobilePanel === 'interaction' ? "bg-white text-indigo-600 border-b-2 border-indigo-600" : "text-slate-600 hover:text-slate-900")}
        >
          <Sparkles className="w-4 h-4" />
          {t('agentAlex.mobile.agent', 'Agent')}
        </button>
        <button
          onClick={() => setMobilePanel('spec')}
          className={cn("flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-all", mobilePanel === 'spec' ? "bg-white text-indigo-600 border-b-2 border-indigo-600" : "text-slate-600 hover:text-slate-900")}
        >
          <FileText className="w-4 h-4" />
          {t('agentAlex.mobile.specification', 'Specification')}
        </button>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {/* Desktop layout */}
        <div className="hidden md:block h-full w-full">
          <PanelGroup orientation="horizontal" className="h-full w-full">
            <Panel defaultSize={50} minSize={30} className="flex flex-col bg-slate-50 p-6">
              <div className="mb-4 flex items-center gap-2 text-slate-700 shrink-0">
                <Sparkles className="w-5 h-5 text-indigo-500" />
                <h2 className="text-lg font-semibold">{t('agentAlex.panels.agentInteraction', 'Agent Interaction')}</h2>
              </div>
              <div className="flex-1 relative min-h-0">
                <AnimatePresence mode="wait">
                  {mode === 'chat' ? (
                    <motion.div key={`chat-${activeSession.id}`} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="absolute inset-0">
                      <ChatInterface messages={activeSession.messages} setMessages={handleUpdateMessages} onUpdateRequirements={handleUpdateRequirements} isAiEnabled={isAiEnabled} disabledMessage={disabledMessage} />
                    </motion.div>
                  ) : (
                    <motion.div key={`live-${activeSession.id}`} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="absolute inset-0">
                      <LiveVoiceInterface messages={activeSession.messages} onUpdateRequirements={handleUpdateRequirements} isAiEnabled={isAiEnabled} disabledMessage={disabledMessage} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Panel>

            <PanelResizeHandle className="w-1.5 bg-slate-200 hover:bg-indigo-400 active:bg-indigo-500 transition-colors cursor-col-resize" />

            <Panel defaultSize={50} minSize={30} className="flex flex-col bg-slate-50 p-6">
              <div className="mb-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 text-slate-700">
                  <FileText className="w-5 h-5 text-indigo-500" />
                  <h2 className="text-lg font-semibold">{t('agentAlex.spec.title', 'Live Specification')}</h2>
                </div>
                <JobButton />
              </div>
              <div className="flex-1 bg-slate-100/50 rounded-2xl border border-slate-200 p-6 overflow-hidden relative shadow-inner min-h-0">
                <SpecificationPanel data={activeSession.requirements} />
                <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-slate-100/50 to-transparent pointer-events-none" />
              </div>
            </Panel>
          </PanelGroup>
        </div>

        {/* Mobile layout */}
        <div className="md:hidden h-full flex flex-col">
          {mobilePanel === 'interaction' ? (
            <div className="flex-1 flex flex-col bg-slate-50 p-3 sm:p-4 min-h-0">
              <div className="flex-1 relative min-h-0">
                <AnimatePresence mode="wait">
                  {mode === 'chat' ? (
                    <motion.div key={`chat-m-${activeSession.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0">
                      <ChatInterface messages={activeSession.messages} setMessages={handleUpdateMessages} onUpdateRequirements={handleUpdateRequirements} isAiEnabled={isAiEnabled} disabledMessage={disabledMessage} />
                    </motion.div>
                  ) : (
                    <motion.div key={`live-m-${activeSession.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0">
                      <LiveVoiceInterface messages={activeSession.messages} onUpdateRequirements={handleUpdateRequirements} isAiEnabled={isAiEnabled} disabledMessage={disabledMessage} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col bg-slate-50 p-3 sm:p-4 min-h-0">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">{t('agentAlex.spec.title', 'Live Specification')}</span>
                <JobButton compact />
              </div>
              <div className="flex-1 bg-slate-100/50 rounded-2xl border border-slate-200 p-4 overflow-hidden relative shadow-inner min-h-0">
                <SpecificationPanel data={activeSession.requirements} />
                <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-slate-100/50 to-transparent pointer-events-none" />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
    </>
  );
}
