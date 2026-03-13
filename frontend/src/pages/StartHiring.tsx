import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';
import type { HiringTemplate } from '../data/hiringTemplates';
import { getLocalizedTemplates } from '../data/hiringTemplates';
import SEO from '../components/SEO';
import PostCreationPanel from '../components/PostCreationPanel';

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
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [step, setStep] = useState<'initial' | 'requirements' | 'confirm' | 'complete'>('initial');
  const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);
  const [hiringData, setHiringData] = useState({
    title: '',
    requirements: '',
    jobDescription: '',
  });
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [assistantSuggestions, setAssistantSuggestions] = useState<string[]>([]);
  const [thinkingStepIndex, setThinkingStepIndex] = useState(0);
  const [isTitleGenerating, setIsTitleGenerating] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [jdDraft, setJdDraft] = useState('');
  const [isJdGenerating, setIsJdGenerating] = useState(false);
  const [jdError, setJdError] = useState<string | null>(null);
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [jdView, setJdView] = useState<'markdown' | 'preview'>('preview');
  const [splitPercent, setSplitPercent] = useState(50);
  const [duplicateHR, setDuplicateHR] = useState<{ id: string; title: string } | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const skipLoadSessionId = useRef<string | null>(null);
  const restoredFromCache = useRef(false);
  const MAX_CHAT_HISTORY = 12;

  // ─── Session-scoped state persistence (survives back/forward navigation) ───
  const STATE_KEY = 'startHiring_state';

  const saveStateToSession = useCallback(() => {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify({
        step,
        hiringData,
        jdDraft,
        messages,
        activeSessionId,
        createdRequestId,
      }));
    } catch { /* quota exceeded — ignore */ }
  }, [step, hiringData, jdDraft, messages, activeSessionId, createdRequestId]);

  // Auto-save on every meaningful state change
  useEffect(() => {
    if (restoredFromCache.current || step !== 'initial' || messages.length > 0) {
      saveStateToSession();
    }
  }, [step, hiringData, jdDraft, messages, activeSessionId, createdRequestId, saveStateToSession]);

  // Restore state on mount (before async session load)
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(STATE_KEY);
      if (!cached) return;
      const saved = JSON.parse(cached);
      if (saved.step && saved.step !== 'initial') {
        setStep(saved.step);
        restoredFromCache.current = true;
      }
      if (saved.hiringData) setHiringData(saved.hiringData);
      if (saved.jdDraft) setJdDraft(saved.jdDraft);
      if (saved.messages?.length) setMessages(saved.messages);
      if (saved.activeSessionId) setActiveSessionId(saved.activeSessionId);
      if (saved.createdRequestId) setCreatedRequestId(saved.createdRequestId);
    } catch { /* corrupt data — ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const CHAT_ERROR_FALLBACK = t(
    'hiring.chatError',
    'Sorry, I ran into an issue while processing that. Please try again.'
  );
  const thinkingSteps = useMemo(
    () => [
      {
        title: t('hiring.thinking.analyzeTitle', 'Analyzing your request'),
        thought: t(
          'hiring.thinking.analyzeThought',
          'Extracting role context, requirements, and missing details.'
        ),
      },
      {
        title: t('hiring.thinking.benchmarkTitle', 'Benchmarking role expectations'),
        thought: t(
          'hiring.thinking.benchmarkThought',
          'Comparing your needs with proven hiring patterns for this role.'
        ),
      },
      {
        title: t('hiring.thinking.draftTitle', 'Drafting recommendations'),
        thought: t(
          'hiring.thinking.draftThought',
          'Preparing actionable guidance, clarifying questions, and next steps.'
        ),
      },
    ],
    [t]
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

  useEffect(() => {
    if (!isProcessing) {
      setThinkingStepIndex(0);
      return;
    }

    setThinkingStepIndex(0);
    const timer = window.setInterval(() => {
      setThinkingStepIndex((prev) => Math.min(prev + 1, thinkingSteps.length - 1));
    }, 1400);

    return () => window.clearInterval(timer);
  }, [isProcessing, thinkingSteps.length]);

  // Load sessions on mount (if authenticated)
  useEffect(() => {
    if (isAuthenticated) {
      loadSessions();
    }
  }, [isAuthenticated]);

  // Load session from URL param (skip freshly created local sessions and cache-restored ones)
  useEffect(() => {
    const sessionId = searchParams.get('session');
    if (!sessionId || !isAuthenticated) return;
    if (skipLoadSessionId.current === sessionId) return;
    if (restoredFromCache.current && activeSessionId === sessionId && messages.length > 0) return;
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

  const buildFollowUpSuggestions = useCallback(
    (action?: string): string[] => {
      if (action === 'create_request') {
        return [
          t('hiring.suggestions.confirm1', 'Shorten the JD into 8 bullet points.'),
          t('hiring.suggestions.confirm2', 'Add compensation range and target start date.'),
          t('hiring.suggestions.confirm3', 'Tailor this JD for remote-first candidates.'),
        ];
      }

      const role = hiringData.title.trim() || t('hiring.defaultRoleLabel', 'this role');
      return [
        t('hiring.suggestions.general1', 'Refine must-have vs nice-to-have skills for {{role}}.', {
          role,
        }),
        t('hiring.suggestions.general2', 'Suggest an interview plan and scorecard for this role.'),
        t('hiring.suggestions.general3', 'Draft the final job description now.'),
      ];
    },
    [hiringData.title, t]
  );

  const lastAssistantMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'assistant') {
        return messages[i].id;
      }
    }
    return null;
  }, [messages]);

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

  const fetchTitleSuggestion = useCallback(async (jobDescriptionOverride?: string) => {
    const role = hiringData.title.trim();
    const requirements = hiringData.requirements.trim();
    const jobDescription =
      typeof jobDescriptionOverride === 'string'
        ? jobDescriptionOverride.trim()
        : hiringData.jobDescription.trim();

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

  const requireAuth = () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: location } });
      return false;
    }
    return true;
  };

  const handleJdAiAction = useCallback(async () => {
    if (!isAuthenticated) { navigate('/login', { state: { from: location } }); return; }
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
  }, [fetchJdDraft, isJdGenerating, jdDraft, t, isAuthenticated, navigate, location]);

  const handleChatAction = useCallback(
    async (action?: string, jobDescriptionOverride?: string) => {
      if (action !== 'create_request') return;

      if (!isAuthenticated) {
        setStep('complete');
        return;
      }

      setStep('confirm');
      setJdView('preview');
      setTitleError(null);
      setJdError(null);
      setIsTitleGenerating(true);
      setIsJdGenerating(true);
      const effectiveJobDescription =
        typeof jobDescriptionOverride === 'string'
          ? jobDescriptionOverride.trim()
          : hiringData.jobDescription.trim();
      setJdDraft(effectiveJobDescription);

      const [titleResult, jdResult] = await Promise.allSettled([
        fetchTitleSuggestion(effectiveJobDescription),
        fetchJdDraft(effectiveJobDescription),
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

  const handleTemplateSelect = async (template: HiringTemplate) => {
    if (!requireAuth()) return;
    if (!activeSessionId && isAuthenticated) {
      await createSession();
    }

    setStep('requirements');
    setHiringData({
      title: template.title,
      requirements: template.requirements,
      jobDescription: '',
    });

    // Pre-fill the chat input with requirements so user can review/edit before sending
    setInput(template.requirements);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const handleQuickStart = async (role: string) => {
    if (!requireAuth()) return;
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
        setAssistantSuggestions(buildFollowUpSuggestions(result?.action));
      }
      await handleChatAction(result?.action);
    } catch (error) {
      console.error('Failed to process chat message:', error);
      await addMessage('assistant', CHAT_ERROR_FALLBACK);
      setAssistantSuggestions(buildFollowUpSuggestions());
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmitHiringInput = useCallback(async (
    messageTextOverride?: string,
    fileOverride?: File | null,
  ) => {
    if (!requireAuth()) return;
    const messageText = typeof messageTextOverride === 'string' ? messageTextOverride.trim() : input.trim();
    const fileToUse = fileOverride ?? attachedFile;
    if (!messageText && !fileToUse) return;

    let sessionId = activeSessionId;
    if (!sessionId && isAuthenticated && step === 'initial') {
      sessionId = await createSession();
    }

    if (step === 'initial' || step === 'confirm') {
      setStep('requirements');
    }

    let jobDescriptionText: string | undefined;
    let jdSnippet: string | undefined;

    if (fileToUse) {
      const isPlainText = fileToUse.type === 'text/plain' || fileToUse.name.endsWith('.txt');

      // Show processing indicator during extraction (LLM extraction can take 10-30s)
      setIsProcessing(true);

      // Send file to backend for parsing (uses LLM for PDFs with CJK content)
      try {
        const formData = new FormData();
        formData.append('file', fileToUse);
        const token = localStorage.getItem('auth_token');
        const uploadHeaders: HeadersInit = {};
        if (token) uploadHeaders.Authorization = `Bearer ${token}`;

        console.log(`[StartHiring] Uploading file for extraction: ${fileToUse.name} (${fileToUse.type}, ${Math.round(fileToUse.size / 1024)}KB)`);

        const extractRes = await fetch(`${API_BASE}/api/v1/extract-document`, {
          method: 'POST',
          headers: uploadHeaders,
          credentials: 'include',
          body: formData,
        });

        console.log(`[StartHiring] extract-document response: HTTP ${extractRes.status}`);

        if (!extractRes.ok) {
          const errorBody = await extractRes.text();
          console.error(`[StartHiring] extract-document HTTP ${extractRes.status}: ${errorBody}`);
          if (isPlainText) {
            jobDescriptionText = await fileToUse.text();
          }
        } else {
          const extractData = await extractRes.json();
          console.log(`[StartHiring] extract-document result:`, {
            success: extractData.success,
            format: extractData.data?.format,
            chars: extractData.data?.text?.length,
            error: extractData.error,
          });
          if (extractData.success && extractData.data?.text) {
            jobDescriptionText = extractData.data.text;
          } else {
            console.error('[StartHiring] extract-document returned success=false:', extractData.error);
            if (isPlainText) {
              jobDescriptionText = await fileToUse.text();
            }
          }
        }
      } catch (err) {
        console.error('[StartHiring] extract-document network error:', err);
        if (isPlainText) {
          jobDescriptionText = await fileToUse.text();
        }
      } finally {
        setIsProcessing(false);
      }

      if (jobDescriptionText) {
        jdSnippet = `From JD:\n${jobDescriptionText.substring(0, 500)}...`;
        console.log(`[StartHiring] JD extracted successfully: ${jobDescriptionText.length} chars`);
      } else {
        console.error(`[StartHiring] FAILED to extract text from ${fileToUse.name}`);
      }
    }

    const normalizeSignal = (value: string) =>
      value
        .trim()
        .toLowerCase()
        .replace(/^[`"'“”‘’\s]+|[`"'“”‘’\s]+$/g, '')
        .replace(/[.!?。！？]+$/g, '');
    const completionSignals = new Set([
      'done',
      'yes',
      'y',
      'ok',
      'okay',
      'confirm',
      'confirmed',
      'proceed',
      'continue',
      'finish',
      'finished',
      'complete',
      'completed',
      'all set',
      "that's all",
      'thats all',
      'no more',
      '好了',
      '完成',
      '完成了',
      '就这样',
      '可以了',
      '是',
      '是的',
      '确认',
    ]);
    const shouldSkipRequirementsAppend = completionSignals.has(normalizeSignal(messageText));
    const messageForRequirements = shouldSkipRequirementsAppend ? '' : messageText;

    setHiringData((prev) => {
      let nextRequirements = prev.requirements;

      if (messageForRequirements) {
        nextRequirements = nextRequirements
          ? `${nextRequirements}\n${messageForRequirements}`
          : messageForRequirements;
      }

      if (jdSnippet) {
        nextRequirements = nextRequirements
          ? `${nextRequirements}\n\n${jdSnippet}`
          : jobDescriptionText || jdSnippet;
      }

      const inferredTitle = prev.title || inferTitle(`${messageForRequirements} ${nextRequirements ?? ''}`);

      return {
        ...prev,
        title: inferredTitle || prev.title,
        jobDescription: jobDescriptionText ?? prev.jobDescription,
        requirements: nextRequirements,
      };
    });

    const userContent = fileToUse
      ? messageText
        ? `${messageText}\n\n[Attached: ${fileToUse.name}]`
        : `[Attached: ${fileToUse.name}]`
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
        setAssistantSuggestions(buildFollowUpSuggestions(result?.action));
      }
      await handleChatAction(result?.action, jobDescriptionText);
    } catch (error) {
      console.error('Failed to process chat message:', error);
      await addMessage('assistant', CHAT_ERROR_FALLBACK);
      setAssistantSuggestions(buildFollowUpSuggestions());
    } finally {
      setIsProcessing(false);
    }
  }, [
    CHAT_ERROR_FALLBACK,
    activeSessionId,
    addMessage,
    attachedFile,
    buildFollowUpSuggestions,
    createSession,
    handleChatAction,
    input,
    isAuthenticated,
    requireAuth,
    sendChatMessage,
    step,
  ]);

  const handleSubmit = useCallback(async () => {
    await handleSubmitHiringInput();
  }, [handleSubmitHiringInput]);

  const doCreateOrUpdateHR = async (overwriteId?: string) => {
    try {
      const finalJobDescription = jdDraft.trim();
      const titleValue = hiringData.title.trim() || t('hiring.defaultTitle', 'New Hiring Request');

      let response: Response;
      if (overwriteId) {
        response = await fetch(`${API_BASE}/api/v1/hiring-requests/${overwriteId}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          credentials: 'include',
          body: JSON.stringify({
            title: titleValue,
            requirements: hiringData.requirements,
            jobDescription: finalJobDescription || undefined,
          }),
        });
      } else {
        response = await fetch(`${API_BASE}/api/v1/hiring-requests`, {
          method: 'POST',
          headers: getAuthHeaders(),
          credentials: 'include',
          body: JSON.stringify({
            title: titleValue,
            requirements: hiringData.requirements,
            jobDescription: finalJobDescription || undefined,
          }),
        });
      }

      const data = await response.json();

      if (data.success) {
        if (data.data?.id) {
          setCreatedRequestId(data.data.id);
        }
        await addMessage(
          'assistant',
          t('hiring.success', 'Your hiring request has been created! 🎉\n\n') +
            t('hiring.nextSteps', '**What happens next:**\n') +
            `1. ${t('hiring.step1', 'Our AI will start screening incoming candidates')}\n` +
            `2. ${t('hiring.step2', 'Matched candidates will be interviewed automatically')}\n` +
            `3. ${t('hiring.step3', "You'll receive evaluation reports for top matches")}\n\n` +
            t('hiring.visitDashboard', 'Visit your dashboard to track progress and manage candidates.')
        );
        setAssistantSuggestions([]);
        setStep('complete');
      } else {
        await addMessage(
          'assistant',
          t('hiring.errorCreating', 'There was an issue creating your request: ') +
            data.error +
            '\n\n' +
            t('hiring.tryAgain', 'Please try again or contact support if the issue persists.')
        );
        setAssistantSuggestions(buildFollowUpSuggestions());
      }
    } catch (error) {
      await addMessage(
        'assistant',
        t('hiring.errorGeneric', 'There was an issue creating your request. Please try again.')
      );
      setAssistantSuggestions(buildFollowUpSuggestions());
    }
  };

  const createHiringRequest = async () => {
    const titleValue = hiringData.title.trim() || t('hiring.defaultTitle', 'New Hiring Request');
    try {
      const checkRes = await fetch(`${API_BASE}/api/v1/hiring-requests?title=${encodeURIComponent(titleValue)}&limit=1`, {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      const checkData = await checkRes.json();
      if (checkData.success && checkData.data?.length > 0) {
        setDuplicateHR({ id: checkData.data[0].id, title: titleValue });
        setShowDuplicateModal(true);
        return;
      }
    } catch {
      // If check fails, proceed with creation
    }
    await doCreateOrUpdateHR();
  };

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
            <Link to="/" className="flex items-center gap-1 transition-opacity hover:opacity-80">
              <img src="/logo2.png" alt="RoboHire" className="h-8" />
            </Link>
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => {
                  setMessages([]);
                  setStep('initial');
                  setHiringData({ title: '', requirements: '', jobDescription: '' });
                  setAssistantSuggestions([]);
                  setIsTitleGenerating(false);
                  setTitleError(null);
                  setJdDraft('');
                  setJdView('preview');
                  setIsJdGenerating(false);
                  setJdError(null);
                  setSearchParams({});
                  setActiveSessionId(null);
                  setCreatedRequestId(null);
                  sessionStorage.removeItem(STATE_KEY);
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
                        {message.role === 'assistant' ? (
                          <div className="text-sm leading-relaxed">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={markdownComponents}
                            >
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <div className="text-sm leading-relaxed whitespace-pre-wrap">
                            {message.content}
                          </div>
                        )}
                      </div>

                      {message.role === 'assistant' &&
                        message.id === lastAssistantMessageId &&
                        assistantSuggestions.length > 0 &&
                        !isProcessing &&
                        step !== 'complete' && (
                          <div className="mt-3 space-y-2">
                            <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
                              {t('hiring.suggestions.title', 'Try asking')}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {assistantSuggestions.map((suggestion) => (
                                <button
                                  key={suggestion}
                                  type="button"
                                  onClick={() => {
                                    setInput(suggestion);
                                    textareaRef.current?.focus();
                                  }}
                                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                                >
                                  {suggestion}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                ))}

                {isProcessing && (
                  <div className="flex justify-start">
                    <div className="max-w-[88%] sm:max-w-[80%]">
                      <div className="mb-2 flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-cyan-500">
                          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </div>
                        <span className="text-sm font-medium text-slate-700">RoboHire</span>
                      </div>
                      <div className="ml-8 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_20px_32px_-28px_rgba(15,23,42,0.58)]">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                          {t('hiring.thinking.title', 'Thinking...')}
                        </p>
                        <div className="mt-2 space-y-2">
                          {thinkingSteps.map((thinkingStep, index) => {
                            const isDone = index < thinkingStepIndex;
                            const isActive = index === thinkingStepIndex;

                            return (
                              <div
                                key={thinkingStep.title}
                                className={`rounded-lg border px-2.5 py-2 transition-colors ${
                                  isActive
                                    ? 'border-blue-200 bg-blue-50/70'
                                    : isDone
                                      ? 'border-emerald-200 bg-emerald-50/70'
                                      : 'border-slate-200 bg-slate-50'
                                }`}
                              >
                                <div className="flex items-start gap-2">
                                  <span
                                    className={`mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold ${
                                      isActive
                                        ? 'bg-blue-600 text-white'
                                        : isDone
                                          ? 'bg-emerald-600 text-white'
                                          : 'bg-slate-300 text-white'
                                    }`}
                                  >
                                    {isDone ? '✓' : index + 1}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium text-slate-800">{thinkingStep.title}</p>
                                    {(isActive || isDone) && (
                                      <p className="mt-1 text-xs text-slate-600">{thinkingStep.thought}</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
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
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 animate-pulse">
                            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
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
                        className={`w-full rounded-xl border px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 ${isTitleGenerating ? 'border-blue-300 bg-blue-50/50 animate-pulse' : 'border-slate-200 bg-white disabled:bg-slate-100 disabled:text-slate-400'}`}
                      />
                      {titleError && (
                        <p className="mt-2 text-xs text-rose-600">{titleError}</p>
                      )}
                      <div className="mt-4 flex flex-col md:flex-row" ref={splitContainerRef}>
                        {/* Left: Requirements summary */}
                        {hiringData.requirements.trim() && (
                          <div style={{ width: `${splitPercent}%` }} className="max-md:!w-full flex-shrink-0 md:pr-0">
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
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 animate-pulse">
                                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
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

                {step === 'complete' && isAuthenticated && createdRequestId && (
                  <PostCreationPanel hiringRequestId={createdRequestId} />
                )}

                {step === 'complete' && isAuthenticated && !createdRequestId && (
                  <div className="flex justify-center pt-4">
                    <Link
                      to="/product/hiring"
                      className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-3 font-medium text-white transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_24px_-16px_rgba(37,99,235,0.85)]"
                    >
                      {t('hiring.goToHiringRequests', 'View Hiring Requests')}
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
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-[0_20px_36px_-30px_rgba(15,23,42,0.55)]">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.docx,.txt,.md,.markdown"
                    onChange={(e) => setAttachedFile(e.target.files?.[0] || null)}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-[44px] w-[44px] self-center flex-shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
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
                    className="flex h-[44px] w-[44px] self-center flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
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
          <Link to="/" className="flex items-center gap-1 transition-opacity hover:opacity-80">
            <img src="/logo2.png" alt="RoboHire" className="h-8" />
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
          <h1 className="mb-6 text-4xl font-bold tracking-tight text-slate-900 landing-display sm:text-5xl">
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
            <div className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-slate-50/70 p-1.5">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="self-center rounded-xl p-3 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
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
                accept=".pdf,.docx,.txt,.md,.markdown"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setAttachedFile(file);
                    const initialPrompt = input.trim() || t('hiring.quickStartFromJd', 'candidate based on job description');
                    void handleSubmitHiringInput(initialPrompt, file);
                  }
                  e.target.value = '';
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
                className="self-center rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 p-3 text-white transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
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
        <div className="mx-auto max-w-5xl landing-gradient-stroke rounded-[28px] bg-white/80 px-5 py-10 shadow-[0_30px_62px_-44px_rgba(15,23,42,0.65)] backdrop-blur sm:px-8">
          <div className="mb-10 text-center">
            <h2 className="mb-2 text-2xl font-semibold text-slate-900 landing-display">
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
                className="group landing-gradient-stroke rounded-2xl bg-white p-5 text-left transition-all hover:-translate-y-1 hover:shadow-[0_28px_52px_-36px_rgba(15,23,42,0.6)]"
              >
                <h3 className="mb-1 font-medium text-slate-900 group-hover:text-blue-600">
                  {template.title}
                </h3>
                <p className="mb-3 line-clamp-2 text-sm text-slate-500">
                  {template.requirements.substring(0, 80)}...
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {template.skills.slice(0, 3).map((skill) => (
                    <span key={skill} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
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
            <h2 className="mb-2 text-2xl font-semibold text-slate-900 landing-display">
              {t('hiring.howItWorksTitle', 'How it works')}
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="landing-gradient-stroke rounded-3xl bg-white/80 p-6 text-center shadow-[0_28px_52px_-40px_rgba(15,23,42,0.62)] backdrop-blur">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900">
                <span className="text-lg font-semibold text-white">1</span>
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
            <div className="landing-gradient-stroke rounded-3xl bg-white/80 p-6 text-center shadow-[0_28px_52px_-40px_rgba(15,23,42,0.62)] backdrop-blur">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900">
                <span className="text-lg font-semibold text-white">2</span>
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
            <div className="landing-gradient-stroke rounded-3xl bg-white/80 p-6 text-center shadow-[0_28px_52px_-40px_rgba(15,23,42,0.62)] backdrop-blur">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900">
                <span className="text-lg font-semibold text-white">3</span>
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
          <h2 className="mb-4 text-2xl font-semibold text-white landing-display">
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

      {/* Duplicate Hiring Request Modal */}
      {showDuplicateModal && duplicateHR && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">{t('hiring.duplicate.title', 'Duplicate Title Found')}</h3>
            </div>
            <p className="mb-6 text-sm text-gray-600">
              {t('hiring.duplicate.message', 'A hiring request with the title "{{title}}" already exists. Would you like to overwrite it or use a different name?', { title: duplicateHR.title })}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={async () => {
                  setShowDuplicateModal(false);
                  await doCreateOrUpdateHR(duplicateHR.id);
                  setDuplicateHR(null);
                }}
                className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
              >
                {t('hiring.duplicate.overwrite', 'Overwrite Existing')}
              </button>
              <button
                onClick={() => {
                  setShowDuplicateModal(false);
                  setDuplicateHR(null);
                }}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {t('hiring.duplicate.rename', 'Use a Different Name')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
