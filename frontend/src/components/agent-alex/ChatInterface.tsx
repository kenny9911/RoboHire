import React, { useRef, useState } from "react";
import { Send, Mic, Square, Play, Loader2, Lightbulb, RefreshCw, Plus, Globe } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../../lib/utils";
import { useTranslation } from "react-i18next";
import type { ChatMessage, HiringRequirements, SearchState, SearchCandidate } from "./types";
import { Link } from "react-router-dom";
import {
  buildHistoryFromMessages,
  generateSpeech,
  streamChat,
  transcribeAudio,
} from "./api";

interface Props {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  onUpdateRequirements: (data: Partial<HiringRequirements>) => void;
  isAiEnabled: boolean;
  disabledMessage?: string;
}

function errorMessageFromUnknown(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Sorry, I encountered an error processing your request.";
}

/** Ensure single newlines become paragraph breaks so markdown renders spacing */
function ensureMarkdownParagraphs(text: string): string {
  return text.replace(/(?<!\n)\n(?!\n)/g, "\n\n");
}

const EXAMPLE_KEYS = [
  'ex1', 'ex2', 'ex3', 'ex4', 'ex5', 'ex6', 'ex7', 'ex8', 'ex9', 'ex10', 'ex11', 'ex12',
] as const;

/** Pick n random unique items from an array */
function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}


function SearchProgressCard({ searchState }: { searchState: SearchState }) {
  const { t } = useTranslation();
  const progress = searchState.filteredCount > 0
    ? Math.round((searchState.completed / searchState.filteredCount) * 100)
    : 0;
  const isRunning = searchState.status === 'running';

  return (
    <div className="space-y-3 w-full max-w-md">
      {/* Header */}
      <div className="flex items-center gap-2">
        {isRunning ? (
          <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
        ) : (
          <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        )}
        <span className="text-sm font-semibold text-slate-800">
          {isRunning
            ? t('agentAlex.search.running', '正在匹配候选人...')
            : t('agentAlex.search.completed', '匹配完成')}
        </span>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-slate-500">
          <span>{t('agentAlex.search.pool', '人才库')}: {searchState.totalResumes} → {t('agentAlex.search.filtered', '预筛')}: {searchState.filteredCount}</span>
          <span>{searchState.completed}/{searchState.filteredCount}</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Candidate results */}
      {searchState.candidates.length > 0 && (
        <div className="space-y-2 mt-3">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {t('agentAlex.search.qualifiedCandidates', '合格候选人')} ({searchState.candidates.length})
          </span>
          {searchState.candidates.slice(0, 8).map((c, i) => (
            <CandidateCard key={c.resumeId} candidate={c} rank={i + 1} />
          ))}
          {searchState.candidates.length > 8 && (
            <p className="text-xs text-slate-400 text-center">
              +{searchState.candidates.length - 8} {t('agentAlex.search.more', 'more')}
            </p>
          )}
        </div>
      )}

      {/* Summary */}
      {searchState.status === 'completed' && (
        <div className="text-xs text-slate-500 pt-2 border-t border-slate-100">
          {t('agentAlex.search.summary', '共筛选 {{screened}} 份简历，找到 {{matched}} 位合格候选人', {
            screened: searchState.totalScreened || searchState.filteredCount,
            matched: searchState.totalMatched || searchState.candidates.length,
          })}
        </div>
      )}
    </div>
  );
}

function CandidateCard({ candidate, rank }: { candidate: SearchCandidate; rank: number }) {
  const medals = ['🏆', '🥈', '🥉'];
  const medal = rank <= 3 ? medals[rank - 1] : `#${rank}`;

  return (
    <Link
      to={`/product/talent/${candidate.resumeId}`}
      className="flex items-start gap-3 p-2.5 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-indigo-50/50 hover:border-indigo-200 transition-colors group"
    >
      <span className="text-lg leading-none mt-0.5 shrink-0 w-6 text-center">{medal}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800 truncate group-hover:text-indigo-700">{candidate.name}</span>
          <span className={cn(
            "px-1.5 py-0.5 rounded text-[10px] font-bold",
            candidate.score >= 80 ? "bg-emerald-100 text-emerald-700" :
            candidate.score >= 65 ? "bg-blue-100 text-blue-700" :
            "bg-amber-100 text-amber-700"
          )}>
            {candidate.score} ({candidate.grade})
          </span>
        </div>
        {candidate.highlights.length > 0 && (
          <p className="text-xs text-slate-500 mt-0.5 truncate">{candidate.highlights.join(' · ')}</p>
        )}
      </div>
    </Link>
  );
}

function SuggestionChips({ messages, isProcessing, isAiEnabled, exampleSeed, onSend, onInsert, onRefresh }: {
  messages: ChatMessage[];
  isProcessing: boolean;
  isAiEnabled: boolean;
  exampleSeed: number;
  onSend: (text: string) => void;
  onInsert: (text: string) => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const lastMsg = messages[messages.length - 1];
  const showChips = !isProcessing && isAiEnabled && lastMsg?.role === "model" && !lastMsg.isThinking;
  const msgCount = messages.filter((m) => m.role === "user").length;

  const chips = React.useMemo(() => {
    // Before first user message: show example job prompts
    if (msgCount === 0) {
      const keys = pickRandom([...EXAMPLE_KEYS], 3);
      return keys.map(k => t(`agentAlex.examples.${k}`, ''));
    }
    // After conversation: use LLM-generated suggestions from the last model message
    if (lastMsg?.suggestions?.length) {
      return lastMsg.suggestions.slice(0, 3);
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, exampleSeed, t, lastMsg?.suggestions]);

  if (!showChips || chips.length === 0) return null;

  const isInitial = messages.filter(m => m.role === "user").length === 0;

  return (
    <div className="px-3 sm:px-4 pt-2 pb-1 flex flex-wrap items-center gap-1.5 sm:gap-2 border-t border-slate-100 bg-slate-50/50">
      <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" />
      {chips.map((chip) => (
        <div
          key={chip}
          className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 shadow-[0_6px_16px_-12px_rgba(79,70,229,0.4)]"
        >
          <button
            onClick={() => onSend(chip)}
            className="px-2.5 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100 rounded-l-full"
            title={t('agentAlex.suggestions.sendDirectly', 'Send this suggestion now')}
          >
            {chip}
          </button>
          <button
            onClick={() => onInsert(chip)}
            className="mr-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-indigo-200/80 bg-white/85 text-indigo-500 transition-colors hover:bg-white hover:text-indigo-700"
            title={t('agentAlex.suggestions.insertToInput', 'Add to input without sending')}
            aria-label={t('agentAlex.suggestions.insert', 'Add to input')}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {isInitial && (
        <button
          onClick={onRefresh}
          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors shrink-0"
          title={t('agentAlex.suggestions.refresh', 'Show different examples')}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

export function ChatInterface({
  messages,
  setMessages,
  onUpdateRequirements,
  isAiEnabled,
  disabledMessage,
}: Props) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [exampleSeed, setExampleSeed] = useState(0); // bump to re-roll examples
  const [isProcessing, setIsProcessing] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (text: string) => {
    const trimmedText = text.trim();
    if (!trimmedText || isProcessing || !isAiEnabled) {
      return;
    }

    const userMsgId = Date.now().toString();
    const modelMsgId = (Date.now() + 1).toString();

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", text: trimmedText },
      { id: modelMsgId, role: "model", text: "", isThinking: true, thinkingStatus: t('agentAlex.chat.thinking', 'Thinking...') },
    ]);
    setInput("");
    setIsProcessing(true);

    // Helper to update the thinking status line
    const setThinkingStatus = (status: string) => {
      setMessages((prev) => prev.map((msg) =>
        msg.id === modelMsgId && msg.isThinking ? { ...msg, thinkingStatus: status } : msg,
      ));
    };

    try {
      let fullText = "";
      await streamChat(
        {
          history: buildHistoryFromMessages(messages),
          message: trimmedText,
        },
        (event) => {
          if (event.type === "requirements-update") {
            setThinkingStatus(t('agentAlex.chat.updatingSpec', 'Updating specification...'));
            onUpdateRequirements(event.data);
            return;
          }

          if (event.type === "suggestions") {
            setThinkingStatus(t('agentAlex.chat.preparingSuggestions', 'Preparing suggestions...'));
            setMessages((prev) =>
              prev.map((message) =>
                message.id === modelMsgId
                  ? { ...message, suggestions: event.data }
                  : message,
              ),
            );
            return;
          }

          // ── Search events ──
          if (event.type === "search-started") {
            setThinkingStatus(t('agentAlex.chat.matchingCandidates', 'Matching candidates...'));
            setMessages((prev) => [...prev, {
              id: `search-${event.data.searchId}`,
              role: "model" as const,
              text: '',
              searchState: {
                status: 'running',
                searchId: event.data.searchId,
                agentId: event.data.agentId,
                totalResumes: event.data.totalResumes,
                filteredCount: event.data.filteredCount,
                completed: 0,
                candidates: [],
              },
            }]);
            return;
          }

          if (event.type === "search-progress") {
            setMessages((prev) => prev.map((msg) =>
              (msg as any).searchState?.searchId === event.data.searchId
                ? { ...msg, searchState: { ...(msg as any).searchState, completed: event.data.completed } }
                : msg,
            ));
            return;
          }

          if (event.type === "search-result") {
            setMessages((prev) => prev.map((msg) =>
              (msg as any).searchState?.searchId === event.data.searchId
                ? {
                    ...msg,
                    searchState: {
                      ...(msg as any).searchState,
                      candidates: [...((msg as any).searchState?.candidates || []), event.data.candidate],
                    },
                  }
                : msg,
            ));
            return;
          }

          if (event.type === "search-completed") {
            setMessages((prev) => prev.map((msg) =>
              (msg as any).searchState?.searchId === event.data.searchId
                ? {
                    ...msg,
                    searchState: {
                      ...(msg as any).searchState,
                      status: 'completed',
                      totalMatched: event.data.totalMatched,
                      totalScreened: event.data.totalScreened,
                    },
                  }
                : msg,
            ));
            return;
          }

          if (event.type === "web-search-started") {
            setThinkingStatus(`${t('agentAlex.chat.webSearching', 'Searching the web')}: ${event.data.query}`);
            setMessages((prev) => prev.map((msg) =>
              msg.id === modelMsgId
                ? { ...msg, webSearchState: { isSearching: true, query: event.data.query } }
                : msg,
            ));
            return;
          }

          if (event.type === "web-search-completed") {
            setMessages((prev) => prev.map((msg) =>
              msg.id === modelMsgId
                ? { ...msg, webSearchState: { isSearching: false, query: event.data.query, resultCount: event.data.resultCount } }
                : msg,
            ));
            return;
          }

          if (event.type === "text-delta") {
            fullText += event.text;
            setMessages((prev) =>
              prev.map((message) =>
                message.id === modelMsgId
                  ? { ...message, text: fullText, isThinking: false }
                  : message,
              ),
            );
          }
        },
        abortController.signal,
      );

      setMessages((prev) =>
        prev.map((message) =>
          message.id === modelMsgId ? { ...message, isThinking: false, thinkingStatus: undefined } : message,
        ),
      );
    } catch (error) {
      if (abortController.signal.aborted) {
        // User stopped the request — keep whatever text was accumulated
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === modelMsgId ? { ...msg, isThinking: false, thinkingStatus: undefined } : msg,
          ),
        );
      } else {
        const message = errorMessageFromUnknown(error);
        setMessages((prev) =>
          prev.map((item) =>
            item.id === modelMsgId
              ? { ...item, text: message, isThinking: false, isError: true, thinkingStatus: undefined }
              : item,
          ),
        );
      }
    } finally {
      abortControllerRef.current = null;
      setIsProcessing(false);
    }
  };

  const insertSuggestion = (text: string) => {
    setInput((prev) => {
      const trimmedPrev = prev.trimEnd();
      return trimmedPrev ? `${trimmedPrev}\n${text}` : text;
    });

    window.setTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const cursor = textarea.value.length;
      textarea.setSelectionRange(cursor, cursor);
    }, 0);
  };

  const startRecording = async () => {
    if (!isAiEnabled) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64data = (reader.result as string).split(",")[1];
          try {
            setIsProcessing(true);
            const transcribedText = await transcribeAudio(base64data, "audio/webm");
            if (transcribedText) {
              setInput((prev) => `${prev}${prev ? " " : ""}${transcribedText.trim()}`);
            }
          } catch (error) {
            console.error("Transcription failed", error);
          } finally {
            setIsProcessing(false);
          }
        };
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const playTTS = async (messageId: string, text: string) => {
    if (playingId === messageId || !isAiEnabled) {
      return;
    }

    try {
      setPlayingId(messageId);
      const audioBase64 = await generateSpeech(text);
      if (!audioBase64) {
        setPlayingId(null);
        return;
      }

      const audioContext = new (window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)!({
        sampleRate: 24000,
      });

      const binaryString = window.atob(audioBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let index = 0; index < binaryString.length; index += 1) {
        bytes[index] = binaryString.charCodeAt(index);
      }

      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let index = 0; index < int16Array.length; index += 1) {
        float32Array[index] = int16Array[index] / 32768.0;
      }

      const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.onended = () => {
        setPlayingId(null);
        audioContext.close();
      };
      source.start(0);
    } catch (error) {
      console.error("TTS failed", error);
      setPlayingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 sm:space-y-6 custom-scrollbar">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex max-w-[92%] sm:max-w-[85%]",
                message.role === "user" ? "ml-auto justify-end" : "mr-auto justify-start",
              )}
            >
              <div
                className={cn(
                  "rounded-2xl shadow-sm relative group",
                  message.role === "user"
                    ? "px-3.5 py-2.5 sm:px-5 sm:py-3.5 bg-indigo-600 text-white rounded-br-sm"
                    : "px-4 py-3.5 sm:px-6 sm:py-5 bg-white border border-slate-200 text-slate-800 rounded-bl-sm",
                )}
              >
                {/* Web search indicator */}
                {message.webSearchState?.isSearching && (
                  <div className="flex items-center gap-2 px-3 py-2 mb-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                    <Globe className="w-3.5 h-3.5 animate-pulse" />
                    <span>{t('agentAlex.chat.webSearching', 'Searching the web...')}{message.webSearchState.query ? `: ${message.webSearchState.query}` : ''}</span>
                  </div>
                )}

                {(message as any).searchState ? (
                  <SearchProgressCard searchState={(message as any).searchState} />
                ) : message.isThinking ? (
                  <div className="flex items-center gap-2 text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                    <span className="text-sm text-slate-500 truncate max-w-[280px] sm:max-w-[400px]">{message.thinkingStatus || t('agentAlex.chat.thinking', 'Thinking...')}</span>
                  </div>
                ) : (
                  <div className={cn(
                    "prose max-w-none text-sm",
                    message.role === "user"
                      ? "prose-invert"
                      : [
                          "text-slate-700",
                          "leading-[1.85] prose-p:my-3.5",
                          "prose-strong:text-slate-900 prose-strong:font-semibold",
                          "prose-ul:my-3 prose-ol:my-3 prose-li:my-1",
                          "prose-headings:text-slate-900 prose-headings:font-bold prose-headings:mt-5 prose-headings:mb-2",
                          "prose-h2:text-base prose-h2:border-b prose-h2:border-slate-200 prose-h2:pb-1.5",
                          "prose-h3:text-sm",
                          "prose-hr:my-4 prose-hr:border-slate-200",
                          "prose-blockquote:border-indigo-300 prose-blockquote:bg-indigo-50/50 prose-blockquote:rounded-r-lg prose-blockquote:px-3 prose-blockquote:py-2 prose-blockquote:not-italic prose-blockquote:text-slate-600",
                          "prose-code:text-indigo-600 prose-code:bg-indigo-50 prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:before:content-none prose-code:after:content-none",
                          "[&>*:first-child]:mt-0",
                        ].join(" "),
                  )}>
                    <Markdown remarkPlugins={[remarkGfm]}>
                      {message.role === "model" ? ensureMarkdownParagraphs(message.text) : message.text}
                    </Markdown>
                  </div>
                )}

                {message.role === "model" && !message.isThinking && message.text && (
                  <button
                    onClick={() => playTTS(message.id, message.text)}
                    disabled={!isAiEnabled}
                    className="absolute -right-9 sm:-right-10 top-2 p-1.5 sm:p-2 text-slate-400 hover:text-indigo-600 transition-colors opacity-0 group-hover:opacity-100 rounded-full hover:bg-slate-100 disabled:opacity-30"
                    title={t('agentAlex.chat.readAloud', 'Read aloud')}
                  >
                    {playingId === message.id ? (
                      <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    )}
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion chips */}
      <SuggestionChips
        messages={messages}
        isProcessing={isProcessing}
        isAiEnabled={isAiEnabled}
        exampleSeed={exampleSeed}
        onSend={handleSend}
        onInsert={insertSuggestion}
        onRefresh={() => setExampleSeed(s => s + 1)}
      />

      <div className="p-2.5 sm:p-4 bg-white border-t border-slate-100">
        <div className="relative flex items-end gap-1.5 sm:gap-2 bg-slate-50 p-1.5 sm:p-2 rounded-2xl border border-slate-200 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400 transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              // Auto-resize textarea to fit content
              const el = textareaRef.current;
              if (el) {
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 256)}px`;
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSend(input);
              }
            }}
            placeholder={isAiEnabled ? t('agentAlex.chat.placeholder', 'Type your response...') : t('agentAlex.chat.disabled', 'AI disabled until Gemini is configured.')}
            className="flex-1 max-h-64 min-h-[40px] sm:min-h-[44px] bg-transparent border-none focus:ring-0 resize-none py-2 px-2.5 sm:py-2.5 sm:px-3 text-sm text-slate-800 placeholder:text-slate-400 custom-scrollbar disabled:cursor-not-allowed"
            rows={1}
            disabled={isProcessing || !isAiEnabled}
          />

          <div className="flex items-center gap-1 pb-0.5 sm:pb-1 pr-0.5 sm:pr-1">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={(isProcessing && !isRecording) || !isAiEnabled}
              className={cn(
                "p-2 sm:p-2.5 rounded-xl transition-all flex-shrink-0",
                isRecording
                  ? "bg-red-100 text-red-600 hover:bg-red-200 animate-pulse"
                  : "bg-slate-200 text-slate-600 hover:bg-slate-300 disabled:opacity-50",
              )}
              title={isRecording ? t('agentAlex.chat.stopRecording', 'Stop recording') : t('agentAlex.chat.dictate', 'Dictate (Speech to Text)')}
            >
              {isRecording ? <Square className="w-4 h-4 fill-current" /> : <Mic className="w-4 h-4" />}
            </button>

            {isProcessing && !isRecording ? (
              <button
                onClick={() => abortControllerRef.current?.abort()}
                className="p-2 sm:p-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all flex-shrink-0 shadow-sm"
                title={t('agentAlex.chat.stop', 'Stop generating')}
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                onClick={() => void handleSend(input)}
                disabled={!input.trim() || !isAiEnabled}
                className="p-2 sm:p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-all flex-shrink-0 shadow-sm"
                title={t('agentAlex.chat.send', 'Send message')}
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        {isRecording && (
          <div className="text-xs text-red-500 font-medium mt-2 text-center animate-pulse">
            {t('agentAlex.chat.recording', 'Recording audio... Click stop when finished.')}
          </div>
        )}
        {!isAiEnabled && disabledMessage && (
          <div className="text-xs text-amber-700 mt-2 text-center">{disabledMessage}</div>
        )}
      </div>
    </div>
  );
}
