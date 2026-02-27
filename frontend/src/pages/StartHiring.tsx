import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';
import type { HiringTemplate } from '../data/hiringTemplates';
import { getLocalizedTemplates } from '../data/hiringTemplates';
import SEO from '../components/SEO';

interface Message {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  timestamp: string;
}

interface ChatSession {
  id: string;
  title: string | null;
  status: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export default function StartHiring() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [step, setStep] = useState<'initial' | 'requirements' | 'confirm' | 'complete'>('initial');
  const [hiringData, setHiringData] = useState({
    title: '',
    requirements: '',
    jobDescription: '',
  });
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [isTitleGenerating, setIsTitleGenerating] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [jdDraft, setJdDraft] = useState('');
  const [isJdGenerating, setIsJdGenerating] = useState(false);
  const [jdError, setJdError] = useState<string | null>(null);
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [jdView, setJdView] = useState<'markdown' | 'preview'>('markdown');
  const [splitPercent, setSplitPercent] = useState(50);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const skipLoadSessionId = useRef<string | null>(null);
  const MAX_CHAT_HISTORY = 12;
  const CHAT_ERROR_FALLBACK = t(
    'hiring.chatError',
    'Sorry, I ran into an issue while processing that. Please try again.'
  );

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, [input]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load sessions on mount (if authenticated)
  useEffect(() => {
    if (isAuthenticated) {
      loadSessions();
    }
  }, [isAuthenticated]);

  // Load session from URL param (skip freshly created local sessions)
  useEffect(() => {
    const sessionId = searchParams.get('session');
    if (!sessionId || !isAuthenticated) return;
    if (skipLoadSessionId.current === sessionId) return;
    if (sessionId !== activeSessionId || messages.length === 0) {
      loadSession(sessionId);
    }
  }, [searchParams, isAuthenticated, activeSessionId, messages.length]);

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('auth_token');
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) {
      (headers as Record<string, string>).Authorization = `Bearer ${token}`;
    }
    return headers;
  }, []);

  const loadSessions = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/v1/hiring-sessions`, {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setSessions(data.data);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const loadSession = async (sessionId: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/v1/hiring-sessions/${sessionId}`, {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setActiveSessionId(sessionId);
        setMessages(data.data.messages || []);
        setStep('requirements');
      }
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  };

  const createSession = async (): Promise<string | null> => {
    if (!isAuthenticated) return null;
    
    try {
      const response = await fetch(`${API_BASE}/api/v1/hiring-sessions`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ messages: [] }),
      });
      const data = await response.json();
      if (data.success) {
        skipLoadSessionId.current = data.data.id;
        setActiveSessionId(data.data.id);
        setSessions((prev) => [data.data, ...prev]);
        setSearchParams({ session: data.data.id });
        return data.data.id;
      }
    } catch (error) {
      console.error('Failed to create session:', error);
    }
    return null;
  };

  const addMessage = useCallback(
    async (role: 'assistant' | 'user', content: string) => {
      const message: Message = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        role,
        content,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, message]);
      if (skipLoadSessionId.current) {
        skipLoadSessionId.current = null;
      }

      return message;
    },
    []
  );

  const buildChatContext = useCallback(() => {
    const context: {
      role?: string;
      jobDescription?: string;
      language?: string;
    } = {};

    if (hiringData.title) {
      context.role = hiringData.title;
    }

    if (hiringData.jobDescription) {
      context.jobDescription = hiringData.jobDescription;
    }

    if (i18n.language) {
      context.language = i18n.language;
    }

    return context;
  }, [hiringData.title, hiringData.jobDescription, i18n.language]);

  const buildHistoryForChat = useCallback(
    (userMessage: string) => {
      const compactHistory = [
        ...messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        { role: 'user' as const, content: userMessage },
      ];

      return compactHistory.slice(-MAX_CHAT_HISTORY);
    },
    [messages, MAX_CHAT_HISTORY]
  );

  const sendChatMessage = useCallback(
    async (
      userMessage: string,
      sessionId?: string | null,
      contextOverride?: { role?: string; jobDescription?: string }
    ) => {
      const context = {
        ...buildChatContext(),
        ...(contextOverride || {}),
      };

      const payload = {
        message: userMessage,
        sessionId: sessionId || undefined,
        history: isAuthenticated ? undefined : buildHistoryForChat(userMessage),
        context,
      };

      const response = await fetch(`${API_BASE}/api/v1/hiring-chat`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to get assistant response');
      }

      if (data.data?.sessionId && !activeSessionId) {
        setActiveSessionId(data.data.sessionId);
      }

      return data.data as { message?: Message; action?: string; sessionId?: string };
    },
    [
      activeSessionId,
      buildChatContext,
      buildHistoryForChat,
      getAuthHeaders,
      isAuthenticated,
    ]
  );

  const fetchTitleSuggestion = useCallback(async () => {
    const role = hiringData.title.trim();
    const requirements = hiringData.requirements.trim();
    const jobDescription = hiringData.jobDescription.trim();

    if (!role && !requirements && !jobDescription) {
      return '';
    }

    const response = await fetch(`${API_BASE}/api/v1/hiring-requests/title-suggestion`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        role: role || undefined,
        requirements: requirements || undefined,
        jobDescription: jobDescription || undefined,
        language: i18n.language || undefined,
      }),
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to generate title');
    }

    return (data.data?.title || '').trim();
  }, [getAuthHeaders, hiringData.title, hiringData.requirements, hiringData.jobDescription, i18n.language]);

  const fetchJdDraft = useCallback(async (jobDescriptionOverride?: string) => {
    const title = hiringData.title.trim();
    const requirements = hiringData.requirements.trim();
    const jobDescription =
      typeof jobDescriptionOverride === 'string'
        ? jobDescriptionOverride.trim()
        : hiringData.jobDescription.trim();

    if (!title && !requirements && !jobDescription) {
      return '';
    }

    const response = await fetch(`${API_BASE}/api/v1/hiring-requests/jd-draft`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        title: title || undefined,
        requirements: requirements || undefined,
        jobDescription: jobDescription || undefined,
        language: i18n.language || undefined,
      }),
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to generate job description');
    }

    return (data.data?.jobDescriptionDraft || '').trim();
  }, [getAuthHeaders, hiringData.title, hiringData.requirements, hiringData.jobDescription, i18n.language]);

  const handleJdAiAction = useCallback(async () => {
    if (isJdGenerating) return;

    setIsJdGenerating(true);
    setJdError(null);

    try {
      const baseDraft = jdDraft.trim();
      const generatedDraft = await fetchJdDraft(baseDraft ? baseDraft : undefined);
      if (generatedDraft) {
        setJdDraft(generatedDraft);
      } else {
        setJdError(
          t('hiring.jdError', "We couldn't generate a job description. Please edit it manually.")
        );
      }
    } catch (error) {
      console.error('Failed to generate JD draft:', error);
      setJdError(
        t('hiring.jdError', "We couldn't generate a job description. Please edit it manually.")
      );
    } finally {
      setIsJdGenerating(false);
    }
  }, [fetchJdDraft, isJdGenerating, jdDraft, t]);

  const handleTemplateSelect = async (template: HiringTemplate) => {
    let sessionId = activeSessionId;
    if (!sessionId && isAuthenticated) {
      sessionId = await createSession();
    }

    setStep('requirements');
    const userPrompt = t('hiring.templateSelected', 'I want to hire: {{title}}', {
      title: template.title,
    });
    await addMessage('user', userPrompt);

    setHiringData({
      title: template.title,
      requirements: template.requirements,
      jobDescription: '',
    });

    setIsProcessing(true);
    try {
      const result = await sendChatMessage(userPrompt, sessionId, { role: template.title });
      if (result?.message?.content) {
        await addMessage('assistant', result.message.content);
      }
      await handleChatAction(result?.action);
    } catch (error) {
      console.error('Failed to process chat message:', error);
      await addMessage('assistant', CHAT_ERROR_FALLBACK);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuickStart = async (role: string) => {
    let sessionId = activeSessionId;
    if (!sessionId && isAuthenticated) {
      sessionId = await createSession();
    }

    setStep('requirements');
    setHiringData((prev) => ({ ...prev, title: role }));
    const userPrompt = t('hiring.quickStartSelected', 'I want to hire a {{role}}', { role });
    await addMessage('user', userPrompt);

    setIsProcessing(true);
    try {
      const result = await sendChatMessage(userPrompt, sessionId, { role });
      if (result?.message?.content) {
        await addMessage('assistant', result.message.content);
      }
      await handleChatAction(result?.action);
    } catch (error) {
      console.error('Failed to process chat message:', error);
      await addMessage('assistant', CHAT_ERROR_FALLBACK);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = async () => {
    const messageText = input.trim();
    if (!messageText && !attachedFile) return;

    let sessionId = activeSessionId;
    if (!sessionId && isAuthenticated && step === 'initial') {
      sessionId = await createSession();
    }

    if (step === 'initial' || step === 'confirm') {
      setStep('requirements');
    }

    let jobDescriptionText: string | undefined;
    let jdSnippet: string | undefined;

    if (attachedFile) {
      const text = await attachedFile.text();
      jobDescriptionText = text;
      jdSnippet = `From JD:\n${text.substring(0, 500)}...`;
    }

    setHiringData((prev) => {
      let nextRequirements = prev.requirements;

      if (messageText) {
        nextRequirements = nextRequirements ? `${nextRequirements}\n${messageText}` : messageText;
      }

      if (jdSnippet) {
        nextRequirements = nextRequirements
          ? `${nextRequirements}\n\n${jdSnippet}`
          : jobDescriptionText || jdSnippet;
      }

      const inferredTitle = prev.title || inferTitle(`${messageText} ${nextRequirements ?? ''}`);

      return {
        ...prev,
        title: inferredTitle || prev.title,
        jobDescription: jobDescriptionText ?? prev.jobDescription,
        requirements: nextRequirements,
      };
    });

    const userContent = attachedFile
      ? messageText
        ? `${messageText}\n\n[Attached: ${attachedFile.name}]`
        : `[Attached: ${attachedFile.name}]`
      : messageText;

    await addMessage('user', userContent);
    setInput('');
    setAttachedFile(null);
    setIsProcessing(true);
    try {
      const result = await sendChatMessage(
        userContent,
        sessionId,
        jobDescriptionText ? { jobDescription: jobDescriptionText } : undefined
      );
      if (result?.message?.content) {
        await addMessage('assistant', result.message.content);
      }
      await handleChatAction(result?.action);
    } catch (error) {
      console.error('Failed to process chat message:', error);
      await addMessage('assistant', CHAT_ERROR_FALLBACK);
    } finally {
      setIsProcessing(false);
    }
  };

  const createHiringRequest = async () => {
    try {
      const finalJobDescription = jdDraft.trim();
      const response = await fetch(`${API_BASE}/api/v1/hiring-requests`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          title: hiringData.title.trim() || t('hiring.defaultTitle', 'New Hiring Request'),
          requirements: hiringData.requirements,
          jobDescription: finalJobDescription || undefined,
        }),
      });

      const data = await response.json();

      if (data.success) {
        await addMessage(
          'assistant',
          t('hiring.success', 'Your hiring request has been created! 🎉\n\n') +
            t('hiring.nextSteps', '**What happens next:**\n') +
            `1. ${t('hiring.step1', 'Our AI will start screening incoming candidates')}\n` +
            `2. ${t('hiring.step2', 'Matched candidates will be interviewed automatically')}\n` +
            `3. ${t('hiring.step3', "You'll receive evaluation reports for top matches")}\n\n` +
            t('hiring.visitDashboard', 'Visit your dashboard to track progress and manage candidates.')
        );
        setStep('complete');
      } else {
        await addMessage(
          'assistant',
          t('hiring.errorCreating', 'There was an issue creating your request: ') +
            data.error +
            '\n\n' +
            t('hiring.tryAgain', 'Please try again or contact support if the issue persists.')
        );
      }
    } catch (error) {
      await addMessage(
        'assistant',
        t('hiring.errorGeneric', 'There was an issue creating your request. Please try again.')
      );
    }
  };

  const handleChatAction = useCallback(
    async (action?: string) => {
      if (action !== 'create_request') return;

      if (!isAuthenticated) {
        setStep('complete');
        return;
      }

      setStep('confirm');
      setTitleError(null);
      setJdError(null);
      setIsTitleGenerating(true);
      setIsJdGenerating(true);
      setJdDraft(hiringData.jobDescription);

      const [titleResult, jdResult] = await Promise.allSettled([
        fetchTitleSuggestion(),
        fetchJdDraft(),
      ]);

      if (titleResult.status === 'fulfilled') {
        const suggestedTitle = titleResult.value;
        if (suggestedTitle) {
          setHiringData((prev) => ({
            ...prev,
            title: suggestedTitle,
          }));
        }
      } else {
        console.error('Failed to generate title suggestion:', titleResult.reason);
        setTitleError(
          t('hiring.titleError', "We couldn't generate a title. Please edit it manually.")
        );
      }

      if (jdResult.status === 'fulfilled') {
        const generatedDraft = jdResult.value;
        if (generatedDraft) {
          setJdDraft(generatedDraft);
        }
      } else {
        console.error('Failed to generate JD draft:', jdResult.reason);
        setJdError(
          t('hiring.jdError', "We couldn't generate a job description. Please edit it manually.")
        );
      }

      setIsTitleGenerating(false);
      setIsJdGenerating(false);
    },
    [fetchJdDraft, fetchTitleSuggestion, hiringData.jobDescription, isAuthenticated, t]
  );

  const inferTitle = (text: string): string => {
    const combined = text.toLowerCase();
    const titles = [
      'Senior Software Engineer', 'Software Engineer', 'Frontend Developer',
      'Backend Developer', 'Full Stack Developer', 'Product Manager',
      'Data Scientist', 'DevOps Engineer', 'UI/UX Designer', 'UX Designer',
      'Engineering Manager', 'Technical Lead', 'QA Engineer', 'Account Executive',
    ];

    for (const title of titles) {
      if (combined.includes(title.toLowerCase())) {
        return title;
      }
    }

    return '';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Quick start roles
  const quickRoles = [
    { id: 'engineer', label: t('hiring.quickRoles.engineer', 'Software Engineer') },
    { id: 'pm', label: t('hiring.quickRoles.pm', 'Product Manager') },
    { id: 'designer', label: t('hiring.quickRoles.designer', 'UX Designer') },
    { id: 'data', label: t('hiring.quickRoles.data', 'Data Scientist') },
  ];

  const localizedTemplates = getLocalizedTemplates(t);
  // Featured templates (just show 6)
  const featuredTemplates = localizedTemplates.slice(0, 6);
  const templatesToShow = showAllTemplates ? localizedTemplates : featuredTemplates;
  const markdownComponents: Components = {
    h1: ({ children }) => (
      <h2 className="mt-2 mb-2 text-base font-semibold text-slate-900">{children}</h2>
    ),
    h2: ({ children }) => (
      <h3 className="mt-3 mb-1 text-sm font-semibold text-slate-900">{children}</h3>
    ),
    h3: ({ children }) => (
      <h4 className="mt-2 mb-1 text-sm font-medium text-slate-900">{children}</h4>
    ),
    p: ({ children }) => (
      <p className="mb-2 text-sm leading-6 text-slate-700">{children}</p>
    ),
    ul: ({ children }) => (
      <ul className="mb-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="mb-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">{children}</ol>
    ),
    li: ({ children }) => <li className="leading-6">{children}</li>,
    a: ({ href, children }) => (
      <a
        href={href}
        className="text-blue-600 underline hover:text-blue-700"
        target="_blank"
        rel="noreferrer"
      >
        {children}
      </a>
    ),
    strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
    em: ({ children }) => <em className="italic text-slate-700">{children}</em>,
    code: ({ children }) => (
      <code className="rounded bg-slate-100 px-1 py-0.5 text-xs text-slate-800">
        {children}
      </code>
    ),
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/40">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  // Chat view (when conversation started)
  if (step !== 'initial' || messages.length > 0) {
    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/35 to-cyan-50/45">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -left-20 top-[-12%] h-80 w-80 rounded-full bg-blue-200/35 blur-3xl" />
          <div className="absolute -right-24 top-[12%] h-80 w-80 rounded-full bg-cyan-200/35 blur-3xl" />
        </div>
        {/* Header */}
        <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
          <div className="landing-glass mx-auto flex h-16 w-full max-w-7xl items-center justify-between rounded-2xl border border-slate-200/80 px-4 shadow-[0_24px_48px_-36px_rgba(15,23,42,0.5)] sm:h-[74px] sm:px-6 lg:px-8">
            <Link to="/" className="flex items-center gap-2 text-xl font-bold text-blue-700 transition-colors hover:text-blue-600">
              <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="landing-display">RoboHire</span>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => {
                  setMessages([]);
                  setStep('initial');
                  setHiringData({ title: '', requirements: '', jobDescription: '' });
                  setIsTitleGenerating(false);
                  setTitleError(null);
                  setJdDraft('');
                  setIsJdGenerating(false);
                  setJdError(null);
                  setSearchParams({});
                  setActiveSessionId(null);
                }}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
              >
                {t('hiring.newRequest', 'New Request')}
              </button>
              {isAuthenticated ? (
                <Link to="/dashboard" className="rounded-full px-3 py-1.5 text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700">
                  {t('landing.nav.dashboard', 'Dashboard')}
                </Link>
              ) : (
                <Link to="/login" className="rounded-full px-3 py-1.5 text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700">
                  {t('landing.nav.signIn', 'Sign In')}
                </Link>
              )}
            </div>
          </div>
        </header>

        {/* Chat */}
        <main className="flex flex-1 flex-col overflow-hidden pt-[88px] sm:pt-[104px]">
          <div className="flex-1 overflow-y-auto">
            <div className={`mx-auto px-5 py-8 sm:px-6 ${step === 'confirm' ? 'max-w-5xl' : 'max-w-3xl'}`}>
              <div className="space-y-7">
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[88%] sm:max-w-[80%] ${message.role === 'user' ? 'order-2' : ''}`}>
                      {message.role === 'assistant' && (
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-cyan-500">
                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          </div>
                          <span className="text-sm font-medium text-slate-700">RoboHire</span>
                        </div>
                      )}
                      <div className={`rounded-2xl px-4 py-3 shadow-[0_20px_32px_-28px_rgba(15,23,42,0.58)] ${
                        message.role === 'user'
                          ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white'
                          : 'border border-slate-200 bg-white/95 text-slate-800 backdrop-blur'
                      }`}>
                        <div className="text-sm leading-relaxed whitespace-pre-wrap">
                          {message.content.split('\n').map((line, i) => {
                            const parts = line.split(/\*\*(.+?)\*\*/g);
                            return (
                              <p key={i} className={i > 0 ? 'mt-2' : ''}>
                                {parts.map((part, j) =>
                                  j % 2 === 1 ? <strong key={j}>{part}</strong> : part
                                )}
                              </p>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {isProcessing && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-cyan-500">
                        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                    </div>
                    <div className="ml-8 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_20px_32px_-28px_rgba(15,23,42,0.58)]">
                      <div className="flex gap-1">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0ms' }} />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '150ms' }} />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}

                {step === 'confirm' && (
                  <div className="flex justify-start">
                    <div className="w-full rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/85 via-white to-cyan-50/45 px-4 py-4 shadow-[0_24px_40px_-28px_rgba(37,99,235,0.52)]">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {t('hiring.confirmTitle', 'Confirm hiring request')}
                          </p>
                          <p className="text-xs text-slate-600">
                            {t(
                              'hiring.confirmSubtitle',
                              'Review and edit the position title before creating the request.'
                            )}
                          </p>
                        </div>
                        {isTitleGenerating && (
                          <span className="text-xs text-blue-600">
                            {t('hiring.titleGenerating', 'Generating a title...')}
                          </span>
                        )}
                      </div>
                      <label className="mb-2 block text-xs font-medium uppercase tracking-[0.08em] text-slate-600">
                        {t('hiring.titleLabel', 'Position title')}
                      </label>
                      <input
                        value={hiringData.title}
                        onChange={(e) => {
                          setHiringData((prev) => ({
                            ...prev,
                            title: e.target.value,
                          }));
                          if (titleError) {
                            setTitleError(null);
                          }
                        }}
                        disabled={isTitleGenerating}
                        placeholder={t('hiring.titlePlaceholder', 'e.g., Senior Full Stack Engineer')}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400"
                      />
                      {titleError && (
                        <p className="mt-2 text-xs text-rose-600">{titleError}</p>
                      )}
                      <div className="mt-4 flex flex-col md:flex-row" ref={splitContainerRef}>
                        {/* Left: Requirements summary */}
                        {hiringData.requirements.trim() && (
                          <div style={{ width: `${splitPercent}%` }} className="flex-shrink-0 md:pr-0">
                            <div className="mb-2 flex min-h-[40px] items-end">
                              <label className="block text-xs font-medium uppercase tracking-[0.08em] text-slate-600">
                                {t('hiring.requirementsLabel', 'Requirements')}
                              </label>
                            </div>
                            <div className="h-[360px] w-full overflow-auto rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-inner shadow-slate-100/70 lg:h-[420px]">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={markdownComponents}
                              >
                                {hiringData.requirements}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )}
                        {/* Draggable divider */}
                        {hiringData.requirements.trim() && (
                          <div
                            className="group hidden w-3 flex-shrink-0 cursor-col-resize select-none items-center justify-center md:flex"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              const container = splitContainerRef.current;
                              if (!container) return;
                              const startX = e.clientX;
                              const startPercent = splitPercent;
                              const containerWidth = container.getBoundingClientRect().width;
                              const onMouseMove = (ev: MouseEvent) => {
                                const delta = ev.clientX - startX;
                                const newPercent = startPercent + (delta / containerWidth) * 100;
                                setSplitPercent(Math.min(70, Math.max(30, newPercent)));
                              };
                              const onMouseUp = () => {
                                document.removeEventListener('mousemove', onMouseMove);
                                document.removeEventListener('mouseup', onMouseUp);
                                document.body.style.cursor = '';
                                document.body.style.userSelect = '';
                              };
                              document.body.style.cursor = 'col-resize';
                              document.body.style.userSelect = 'none';
                              document.addEventListener('mousemove', onMouseMove);
                              document.addEventListener('mouseup', onMouseUp);
                            }}
                          >
                            <div className="h-8 w-1 rounded-full bg-slate-300 transition-colors group-hover:bg-blue-400" />
                          </div>
                        )}
                        {/* Right: JD editor */}
                        <div className="flex-1 min-w-0">
                          <div className="mb-2 flex min-h-[40px] items-end justify-between">
                            <label className="block text-xs font-medium uppercase tracking-[0.08em] text-slate-600">
                              {t('hiring.jdLabel', 'Job description')}
                            </label>
                            <div className="flex items-center gap-2">
                              <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
                                <button
                                  type="button"
                                  onClick={() => setJdView('markdown')}
                                  className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                                    jdView === 'markdown'
                                      ? 'bg-blue-600 text-white'
                                      : 'text-slate-600 hover:text-slate-800'
                                  }`}
                                >
                                  {t('hiring.jdMarkdownLabel', 'Markdown')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setJdView('preview')}
                                  className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                                    jdView === 'preview'
                                      ? 'bg-blue-600 text-white'
                                      : 'text-slate-600 hover:text-slate-800'
                                  }`}
                                >
                                  {t('hiring.jdPreview', 'Preview')}
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={handleJdAiAction}
                                disabled={isJdGenerating}
                                title={
                                  jdDraft.trim()
                                    ? t('hiring.jdAiRefine', 'Refine with AI')
                                    : t('hiring.jdAiGenerate', 'Generate with AI')
                                }
                                aria-label={
                                  jdDraft.trim()
                                    ? t('hiring.jdAiRefine', 'Refine with AI')
                                    : t('hiring.jdAiGenerate', 'Generate with AI')
                                }
                                className="flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <svg
                                  className="w-3.5 h-3.5"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                                  />
                                </svg>
                                <span>
                                  {jdDraft.trim()
                                    ? t('hiring.jdAiRefine', 'Refine with AI')
                                    : t('hiring.jdAiGenerate', 'Generate with AI')}
                                </span>
                              </button>
                              {isJdGenerating && (
                                <span className="text-xs text-blue-600">
                                  {t('hiring.jdGenerating', 'Generating job description...')}
                                </span>
                              )}
                            </div>
                          </div>
                          {jdView === 'markdown' ? (
                            <textarea
                              value={jdDraft}
                              onChange={(e) => {
                                setJdDraft(e.target.value);
                                if (jdError) {
                                  setJdError(null);
                                }
                              }}
                              placeholder={t('hiring.jdPlaceholder', 'Draft will appear here...')}
                              rows={10}
                              className="h-[360px] w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 lg:h-[420px]"
                            />
                          ) : (
                            <div className="h-[360px] w-full overflow-auto rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-inner shadow-slate-100/70 lg:h-[420px]">
                              {jdDraft.trim() ? (
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={markdownComponents}
                                >
                                  {jdDraft}
                                </ReactMarkdown>
                              ) : (
                                <p className="text-sm text-slate-400">
                                  {t('hiring.jdPreviewEmpty', 'Preview will appear here...')}
                                </p>
                              )}
                            </div>
                          )}
                          {jdError && (
                            <p className="mt-2 text-xs text-rose-600">{jdError}</p>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-end">
                        <button
                          onClick={createHiringRequest}
                          disabled={isTitleGenerating || isJdGenerating || !hiringData.title.trim()}
                          className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2 text-sm font-medium text-white transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_24px_-16px_rgba(37,99,235,0.85)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {t('hiring.createRequest', 'Create hiring request')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {step === 'complete' && !isAuthenticated && (
                  <div className="flex justify-center pt-4">
                    <Link
                      to="/login"
                      state={{ from: { pathname: '/start-hiring' } }}
                      className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-3 font-medium text-white transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_24px_-16px_rgba(37,99,235,0.85)]"
                    >
                      {t('hiring.signInToContinue', 'Sign In to Continue')}
                    </Link>
                  </div>
                )}

                {step === 'complete' && isAuthenticated && (
                  <div className="flex justify-center pt-4">
                    <Link
                      to="/dashboard"
                      className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-3 font-medium text-white transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_24px_-16px_rgba(37,99,235,0.85)]"
                    >
                      {t('hiring.goToDashboard', 'Go to Dashboard')}
                    </Link>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>
          </div>

          {/* Input */}
          {step !== 'complete' && (
            <div className="border-t border-slate-200/80 bg-white/80 px-5 py-4 backdrop-blur sm:px-6">
              <div className="mx-auto max-w-3xl">
                {attachedFile && (
                  <div className="mb-3 flex items-center gap-2 text-sm text-slate-600">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    <span>{attachedFile.name}</span>
                    <button onClick={() => setAttachedFile(null)} className="text-slate-400 transition-colors hover:text-slate-600">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-[0_20px_36px_-30px_rgba(15,23,42,0.55)]">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={(e) => setAttachedFile(e.target.files?.[0] || null)}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-[44px] w-[44px] flex-shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  </button>
                  <div className="flex-1 min-w-0">
                    <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={t('hiring.inputPlaceholder', 'Describe your ideal candidate...')}
                      rows={1}
                      className="w-full resize-none rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{ minHeight: '44px', maxHeight: '150px' }}
                    />
                  </div>
                  <button
                    onClick={handleSubmit}
                    disabled={!input.trim() && !attachedFile}
                    className="flex h-[44px] w-[44px] flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  // Initial landing view
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/35 to-cyan-50/45">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-20 top-[-10%] h-96 w-96 rounded-full bg-blue-200/30 blur-3xl" />
        <div className="absolute -right-20 top-[20%] h-80 w-80 rounded-full bg-cyan-200/30 blur-3xl" />
      </div>
      <SEO title={t('seo.startHiring.title', 'AI Hiring Agent')} description={t('seo.startHiring.desc', 'Let AI handle the heavy lifting. Our hiring agent screens resumes, conducts interviews, and delivers evaluation reports automatically.')} url="https://robohire.io/start-hiring" keywords={t('seo.startHiring.keywords', 'AI hiring agent, automated recruitment, resume screening, AI interview, hiring automation')} />
      {/* Header */}
      <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
        <div className="landing-glass mx-auto flex h-16 w-full max-w-7xl items-center justify-between rounded-2xl border border-slate-200/80 px-4 shadow-[0_24px_48px_-36px_rgba(15,23,42,0.5)] sm:h-[74px] sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold text-blue-700 transition-colors hover:text-blue-600">
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="landing-display">RoboHire</span>
          </Link>
          <div className="flex items-center gap-3 sm:gap-4">
            <Link to="/developers" className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900">
              {t('landing.nav.api', 'API')}
            </Link>
            <Link to="/docs" className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900">
              {t('landing.nav.docs', 'Docs')}
            </Link>
            {isAuthenticated ? (
              <Link to="/dashboard" className="rounded-full px-3 py-1.5 text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700">
                {t('landing.nav.dashboard', 'Dashboard')}
              </Link>
            ) : (
              <Link to="/login" className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2 text-sm font-medium text-white transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-18px_rgba(37,99,235,0.9)]">
                {t('landing.nav.signIn', 'Sign In')}
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="pt-[88px] sm:pt-[104px]">
      {/* Hero Section */}
      <section className="px-5 pb-16 pt-16 sm:px-6">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="mb-6 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            {t('hiring.heroTitle', 'Start hiring with AI')}
          </h1>
          <p className="mx-auto mb-12 max-w-2xl text-xl text-slate-600">
            {t(
              'hiring.heroSubtitle',
              "Tell us who you're looking for. Our AI will help you find, screen, and evaluate candidates automatically."
            )}
          </p>

          {/* Main Input */}
          <div className="mb-8 rounded-3xl border border-slate-200 bg-white/95 p-2 shadow-[0_32px_64px_-42px_rgba(15,23,42,0.65)]">
            <div className="flex items-end gap-2 rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-slate-50/70 p-1.5">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl p-3 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                title={t('hiring.uploadJd', 'Upload Job Description')}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.txt"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setAttachedFile(file);
                    handleQuickStart(t('hiring.quickStartFromJd', 'candidate based on job description'));
                  }
                }}
              />
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('hiring.inputPlaceholder', 'Describe your ideal candidate...')}
                rows={1}
                className="flex-1 resize-none bg-transparent px-2 py-3 text-slate-900 placeholder-slate-400 focus:outline-none"
                style={{ minHeight: '48px', maxHeight: '120px' }}
              />
              <button
                onClick={handleSubmit}
                disabled={!input.trim()}
                className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 p-3 text-white transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          </div>

          {/* Quick Start Pills */}
          <div className="flex flex-wrap justify-center gap-2">
            {quickRoles.map((role) => (
              <button
                key={role.id}
                onClick={() => handleQuickStart(role.label)}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              >
                {role.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Templates Section */}
      <section className="px-5 py-16 sm:px-6">
        <div className="mx-auto max-w-5xl rounded-[28px] border border-slate-200 bg-white/80 px-5 py-10 shadow-[0_30px_62px_-44px_rgba(15,23,42,0.65)] backdrop-blur sm:px-8">
          <div className="mb-10 text-center">
            <h2 className="mb-2 text-2xl font-semibold text-slate-900">
              {t('hiring.templatesTitle', 'Popular role templates')}
            </h2>
            <p className="text-slate-600">
              {t('hiring.templatesSubtitle', 'Start with a pre-built template or describe your own requirements')}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templatesToShow.map((template) => (
              <button
                key={template.id}
                onClick={() => handleTemplateSelect(template)}
                className="group rounded-2xl border border-slate-200 bg-white p-5 text-left transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_18px_34px_-24px_rgba(37,99,235,0.55)]"
              >
                <h3 className="mb-1 font-medium text-slate-900 group-hover:text-blue-600">
                  {template.title}
                </h3>
                <p className="mb-3 line-clamp-2 text-sm text-slate-500">
                  {template.requirements.substring(0, 80)}...
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {template.skills.slice(0, 3).map((skill) => (
                    <span key={skill} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {skill}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>

          {!showAllTemplates && (
            <div className="mt-8 text-center">
              <button
                type="button"
                onClick={() => setShowAllTemplates(true)}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                {t('hiring.viewAllTemplates', 'View all templates')}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* How it Works */}
      <section className="px-5 py-20 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <h2 className="mb-2 text-2xl font-semibold text-slate-900">
              {t('hiring.howItWorksTitle', 'How it works')}
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 text-center shadow-[0_22px_40px_-32px_rgba(15,23,42,0.52)] backdrop-blur">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                <span className="text-lg font-semibold text-blue-600">1</span>
              </div>
              <h3 className="mb-2 font-medium text-slate-900">
                {t('hiring.howItWorks.step1.title', 'Describe your role')}
              </h3>
              <p className="text-sm text-slate-600">
                {t(
                  'hiring.howItWorks.step1.desc',
                  "Tell us about the skills, experience, and qualities you're looking for."
                )}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 text-center shadow-[0_22px_40px_-32px_rgba(15,23,42,0.52)] backdrop-blur">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                <span className="text-lg font-semibold text-blue-600">2</span>
              </div>
              <h3 className="mb-2 font-medium text-slate-900">
                {t('hiring.howItWorks.step2.title', 'AI screens candidates')}
              </h3>
              <p className="text-sm text-slate-600">
                {t(
                  'hiring.howItWorks.step2.desc',
                  'Our AI reviews resumes, conducts initial interviews, and evaluates fit.'
                )}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 text-center shadow-[0_22px_40px_-32px_rgba(15,23,42,0.52)] backdrop-blur">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                <span className="text-lg font-semibold text-blue-600">3</span>
              </div>
              <h3 className="mb-2 font-medium text-slate-900">
                {t('hiring.howItWorks.step3.title', 'Review top matches')}
              </h3>
              <p className="text-sm text-slate-600">
                {t(
                  'hiring.howItWorks.step3.desc',
                  'Get detailed reports on your best candidates and make faster hiring decisions.'
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-5 py-16 sm:px-6">
        <div className="mx-auto max-w-4xl rounded-[28px] bg-slate-950 px-6 py-14 text-center shadow-[0_40px_70px_-44px_rgba(2,6,23,0.92)] sm:px-10">
          <h2 className="mb-4 text-2xl font-semibold text-white">
            {t('hiring.ctaTitle', 'Ready to streamline your hiring?')}
          </h2>
          <p className="mb-8 text-slate-300">
            {t('hiring.ctaSubtitle', 'Join thousands of companies using AI to hire faster and smarter.')}
          </p>
          <button
            onClick={() => textareaRef.current?.focus()}
            className="rounded-full bg-white px-6 py-3 font-medium text-slate-900 transition-colors hover:bg-slate-100"
          >
            {t('hiring.ctaButton', 'Start hiring now')}
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 px-5 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-slate-500">
            © 2026 RoboHire. All rights reserved.
          </p>
          <div className="flex gap-6">
            <Link to="/developers" className="text-sm text-slate-500 hover:text-slate-700">
              {t('landing.nav.api', 'API')}
            </Link>
            <Link to="/docs" className="text-sm text-slate-500 hover:text-slate-700">
              {t('landing.nav.docs', 'Docs')}
            </Link>
            <Link to="/privacy" className="text-sm text-slate-500 hover:text-slate-700">
              {t('landing.footer.privacy', 'Privacy')}
            </Link>
            <Link to="/terms" className="text-sm text-slate-500 hover:text-slate-700">
              {t('landing.footer.terms', 'Terms')}
            </Link>
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
}
