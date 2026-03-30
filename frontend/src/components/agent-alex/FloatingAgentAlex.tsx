import { useState, useEffect, useRef } from 'react';
import { Bot, X, Send, Loader2, Plus, History, Link2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';
import type { ChatMessage } from './types';
import {
  buildHistoryFromMessages, streamChat,
  fetchSessions, createSession as apiCreateSession, updateSession as apiUpdateSession, deleteSession as apiDeleteSession,
  type DbSession,
} from './api';

function ensureMarkdownParagraphs(text: string): string {
  return text.replace(/(?<!\n)\n(?!\n)/g, '\n\n');
}

interface MiniSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  linkedJobId?: string | null;
  updatedAt: number;
}

function dbToMini(db: DbSession): MiniSession {
  return {
    id: db.id,
    title: db.title,
    messages: db.messages as ChatMessage[],
    linkedJobId: db.linkedJobId,
    updatedAt: new Date(db.updatedAt).getTime(),
  };
}

export function FloatingAgentAlex() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [sessions, setSessions] = useState<MiniSession[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  const welcomeText = t('agentAlex.chat.welcome', 'Hello! I am your Recruitment Agent Alex. What role are you looking to fill today?');

  const activeSession = sessions.find(s => s.id === activeId);
  const messages = activeSession?.messages ?? [];

  // scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // close history dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) setShowHistory(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // load sessions from DB when widget opens
  const loadSessions = async () => {
    try {
      const dbSessions = await fetchSessions();
      if (dbSessions.length > 0) {
        const mapped = dbSessions.map(dbToMini);
        setSessions(mapped);
        setActiveId(mapped[0].id);
        return;
      }
    } catch { /* fall through */ }
    // No sessions — create one
    await handleNewChat();
  };

  const handleOpen = () => {
    if (sessions.length === 0) loadSessions();
    setIsOpen(true);
  };

  // debounced save
  const scheduleSave = (session: MiniSession) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      apiUpdateSession(session.id, {
        title: session.title,
        messages: session.messages as unknown[],
      }).catch(() => {});
    }, 1500);
  };

  const handleNewChat = async () => {
    const msgs: ChatMessage[] = [{ id: 'welcome', role: 'model', text: welcomeText }];
    try {
      const db = await apiCreateSession({ title: 'New Chat', messages: msgs, requirements: {} });
      const session = dbToMini(db);
      setSessions(prev => [session, ...prev]);
      setActiveId(session.id);
      setShowHistory(false);
    } catch {
      const local: MiniSession = {
        id: Math.random().toString(36).substring(2, 9),
        title: 'New Chat',
        messages: msgs,
        updatedAt: Date.now(),
      };
      setSessions(prev => [local, ...prev]);
      setActiveId(local.id);
      setShowHistory(false);
    }
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const session = sessions.find(s => s.id === id);
    if (session?.linkedJobId) return;

    const result = await apiDeleteSession(id);
    if (!result.success) return;

    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== id);
      if (filtered.length === 0) {
        handleNewChat();
        return [];
      }
      if (activeId === id) setActiveId(filtered[0].id);
      return filtered;
    });
  };

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isProcessing || !activeSession) return;

    const userMsgId = Date.now().toString();
    const modelMsgId = (Date.now() + 1).toString();

    const updatedMsgs: ChatMessage[] = [
      ...messages,
      { id: userMsgId, role: 'user', text: trimmed },
      { id: modelMsgId, role: 'model', text: '', isThinking: true },
    ];

    setSessions(prev => prev.map(s => s.id === activeId ? { ...s, messages: updatedMsgs, updatedAt: Date.now() } : s));
    setInput('');
    setIsProcessing(true);

    try {
      let fullText = '';
      await streamChat(
        { history: buildHistoryFromMessages(messages), message: trimmed },
        (event) => {
          if (event.type === 'text-delta') {
            fullText += event.text;
            setSessions(prev => prev.map(s => {
              if (s.id !== activeId) return s;
              return { ...s, messages: s.messages.map(m => m.id === modelMsgId ? { ...m, text: fullText, isThinking: false } : m) };
            }));
          }
        },
      );
      setSessions(prev => prev.map(s => {
        if (s.id !== activeId) return s;
        const updated = { ...s, messages: s.messages.map(m => m.id === modelMsgId ? { ...m, isThinking: false } : m), updatedAt: Date.now() };
        // auto-title from first user message
        if (updated.title === 'New Chat' && trimmed.length > 3) {
          updated.title = trimmed.slice(0, 50);
        }
        scheduleSave(updated);
        return updated;
      }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Something went wrong.';
      setSessions(prev => prev.map(s => {
        if (s.id !== activeId) return s;
        return { ...s, messages: s.messages.map(m => m.id === modelMsgId ? { ...m, text: msg, isThinking: false, isError: true } : m) };
      }));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={handleOpen}
            className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg hover:shadow-xl flex items-center justify-center transition-colors group"
            title={t('agentAlex.floatingLabel', 'AI Hiring Assistant')}
          >
            <Bot className="w-6 h-6" />
            <span className="absolute right-full mr-3 px-2.5 py-1 bg-slate-900 text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {t('agentAlex.floatingLabel', 'AI Hiring Assistant')}
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-40 w-[380px] h-[520px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 text-white shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold leading-tight">{t('agentAlex.title', 'Agent Alex')}</h3>
                  <p className="text-[10px] text-indigo-200 font-medium">{t('agentAlex.subtitle', 'Recruitment Requirements Analyst')}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* New Chat */}
                <button
                  onClick={handleNewChat}
                  className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                  title={t('agentAlex.sessions.newChat', 'New Chat')}
                >
                  <Plus className="w-4 h-4" />
                </button>
                {/* History */}
                <div className="relative" ref={historyRef}>
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className={cn("p-1.5 rounded-lg transition-colors", showHistory ? "bg-white/30" : "hover:bg-white/20")}
                    title={t('agentAlex.sessions.recent', 'Recent Sessions')}
                  >
                    <History className="w-4 h-4" />
                  </button>
                  <AnimatePresence>
                    {showHistory && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="absolute top-full mt-1 right-0 w-64 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50 max-h-60"
                      >
                        <div className="overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar">
                          {sessions.sort((a, b) => b.updatedAt - a.updatedAt).map(s => (
                            <div
                              key={s.id}
                              onClick={() => { setActiveId(s.id); setShowHistory(false); }}
                              className={cn(
                                "px-2.5 py-2 rounded-lg cursor-pointer transition-all group flex items-center justify-between",
                                activeId === s.id ? "bg-indigo-50 text-indigo-900" : "hover:bg-slate-50 text-slate-700"
                              )}
                            >
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                {s.linkedJobId && <Link2 className="w-3 h-3 text-indigo-400 shrink-0" />}
                                <span className="text-xs font-medium truncate">{s.title}</span>
                              </div>
                              {!s.linkedJobId && (
                                <button
                                  onClick={(e) => handleDeleteSession(s.id, e)}
                                  className="p-0.5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                {/* Expand → new session on full page */}
                <button
                  onClick={() => { setIsOpen(false); navigate('/agent-alex'); }}
                  className="px-2 py-1 text-[10px] font-semibold bg-white/20 hover:bg-white/30 rounded-md transition-colors"
                >
                  {t('actions.expand', 'Expand')}
                </button>
                {/* Close */}
                <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex max-w-[90%]',
                    message.role === 'user' ? 'ml-auto justify-end' : 'mr-auto justify-start',
                  )}
                >
                  <div
                    className={cn(
                      'rounded-2xl text-sm',
                      message.role === 'user'
                        ? 'px-3 py-2 bg-indigo-600 text-white rounded-br-sm'
                        : 'px-3.5 py-2.5 bg-slate-100 text-slate-700 rounded-bl-sm',
                    )}
                  >
                    {message.isThinking ? (
                      <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {t('agentAlex.chat.thinking', 'Thinking...')}
                      </div>
                    ) : message.role === 'model' ? (
                      <div className="prose prose-sm max-w-none text-slate-700 leading-[1.7] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 prose-p:my-2 prose-ul:my-2 prose-li:my-0.5 prose-strong:text-slate-900">
                        <Markdown remarkPlugins={[remarkGfm]}>
                          {ensureMarkdownParagraphs(message.text)}
                        </Markdown>
                      </div>
                    ) : (
                      message.text
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-2.5 border-t border-slate-100 shrink-0">
              <div className="flex items-end gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400 transition-all">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend(input);
                    }
                  }}
                  placeholder={t('agentAlex.chat.placeholder', 'Type your response...')}
                  className="flex-1 max-h-20 min-h-[36px] bg-transparent border-none focus:ring-0 resize-none py-1.5 px-2.5 text-sm text-slate-800 placeholder:text-slate-400"
                  rows={1}
                  disabled={isProcessing}
                />
                <button
                  onClick={() => void handleSend(input)}
                  disabled={!input.trim() || isProcessing}
                  className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-all shrink-0"
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
