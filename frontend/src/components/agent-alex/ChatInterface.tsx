import React, { useRef, useState } from "react";
import { Send, Mic, Square, Play, Loader2, BrainCircuit, Lightbulb, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../../lib/utils";
import { useTranslation } from "react-i18next";
import type { ChatMessage, HiringRequirements } from "./types";
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

/** Extract suggested answers from the agent's last response by analyzing the questions asked */
function extractAnswerSuggestions(lastAgentText: string): string[] {
  const suggestions: string[] = [];

  // Detect question topics and suggest concise answers
  const questionPatterns: Array<{ pattern: RegExp; answers: string[] }> = [
    // Tech stack / skills
    { pattern: /技术栈|技术方向|编程语言|框架|工具|tech stack|programming|framework/i,
      answers: ['Python, PyTorch, TensorFlow', 'Java, Spring Boot, Kubernetes', 'TypeScript, React, Node.js', 'Go, Rust, 分布式系统'] },
    // Work location / remote
    { pattern: /办公模式|工作地点|远程|混合|坐班|remote|hybrid|on-?site|location/i,
      answers: ['坐班，北京', '混合办公，每周到岗 3 天', '支持全远程', '上海，Hybrid'] },
    // Responsibilities / business goals
    { pattern: /核心职责|业务目标|业务挑战|负责什么|主要工作|responsibilit|goal|challenge/i,
      answers: ['从 0 到 1 搭建', '优化现有系统性能和稳定性', '带团队，管理 5-10 人', '负责核心算法研发'] },
    // Must-have vs nice-to-have
    { pattern: /硬性要求|必须|must.?have|加分项|优先条件|nice.?to.?have|preferred/i,
      answers: ['以上都是必须的', '框架是加分项，语言是必须的', '学历是加分项，经验更重要'] },
    // Salary / compensation
    { pattern: /薪资|薪酬|salary|compensation|待遇|offer/i,
      answers: ['40-60 万/年', '月薪 30-50K', '有竞争力即可，可谈', '参考市场中位数'] },
    // Timeline / urgency
    { pattern: /紧急|时间|尽快|timeline|urgency|着急|start date|开始/i,
      answers: ['越快越好，ASAP', '1-2 个月内到岗', '不急，慢慢筛选最优人选', '下个季度开始'] },
    // Headcount
    { pattern: /人数|headcount|几个|多少人|how many/i,
      answers: ['1 人', '2-3 人', '5 人以上'] },
    // Education
    { pattern: /学历|教育|学位|education|degree|本科|硕士|博士/i,
      answers: ['本科及以上', '硕士优先', '不限学历，看能力', '985/211 优先'] },
    // Industry experience
    { pattern: /行业经验|行业背景|industry|领域/i,
      answers: ['电商/零售', '金融/支付', '不限行业', '互联网/SaaS'] },
    // Interview process
    { pattern: /面试流程|面试安排|interview process|interview stage/i,
      answers: ['电话初筛 → 技术面 → 终面', '2 轮技术 + 1 轮 HR', '先做题再面试'] },
    // Team culture
    { pattern: /团队文化|团队氛围|team culture|团队规模/i,
      answers: ['扁平管理，注重自驱', '技术氛围浓，鼓励开源', '结果导向，弹性工作'] },
  ];

  for (const { pattern, answers } of questionPatterns) {
    if (pattern.test(lastAgentText)) {
      suggestions.push(...pickRandom(answers, 1));
      if (suggestions.length >= 3) break;
    }
  }

  return suggestions.slice(0, 3);
}

/** Generate contextual suggestion chips based on conversation history */
function generateSuggestions(messages: ChatMessage[], t: (key: string, fallback: string) => string): string[] {
  const msgCount = messages.filter((m) => m.role === "user").length;

  // Before first message: show example job prompts
  if (msgCount === 0) {
    const keys = pickRandom([...EXAMPLE_KEYS], 3);
    return keys.map(k => t(`agentAlex.examples.${k}`, ''));
  }

  // After conversation starts: suggest answers to the agent's last questions
  const lastAgentMsg = [...messages].reverse().find((m) => m.role === "model" && !m.isThinking);
  if (lastAgentMsg?.text) {
    const answerSuggestions = extractAnswerSuggestions(lastAgentMsg.text);
    if (answerSuggestions.length > 0) return answerSuggestions;
  }

  // Fallback: offer to finalize
  if (msgCount >= 3) {
    return [t('agentAlex.suggestions.finalize', "I'm done — finalize the specification")];
  }

  return [];
}

function SuggestionChips({ messages, isProcessing, isAiEnabled, exampleSeed, onSend, onRefresh }: {
  messages: ChatMessage[];
  isProcessing: boolean;
  isAiEnabled: boolean;
  exampleSeed: number;
  onSend: (text: string) => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const lastMsg = messages[messages.length - 1];
  const showChips = !isProcessing && isAiEnabled && lastMsg?.role === "model" && !lastMsg.isThinking;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const chips = React.useMemo(() => generateSuggestions(messages, t), [messages.length, exampleSeed, t]);

  if (!showChips || chips.length === 0) return null;

  const isInitial = messages.filter(m => m.role === "user").length === 0;

  return (
    <div className="px-3 sm:px-4 pt-2 pb-1 flex flex-wrap items-center gap-1.5 sm:gap-2 border-t border-slate-100 bg-slate-50/50">
      <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" />
      {chips.map((chip) => (
        <button
          key={chip}
          onClick={() => onSend(chip)}
          className="px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-full transition-colors"
        >
          {chip}
        </button>
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

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", text: trimmedText },
      { id: modelMsgId, role: "model", text: "", isThinking: true },
    ]);
    setInput("");
    setIsProcessing(true);

    try {
      let fullText = "";
      await streamChat(
        {
          history: buildHistoryFromMessages(messages),
          message: trimmedText,
        },
        (event) => {
          if (event.type === "requirements-update") {
            onUpdateRequirements(event.data);
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
      );

      setMessages((prev) =>
        prev.map((message) =>
          message.id === modelMsgId ? { ...message, isThinking: false } : message,
        ),
      );
    } catch (error) {
      const message = errorMessageFromUnknown(error);
      setMessages((prev) =>
        prev.map((item) =>
          item.id === modelMsgId
            ? { ...item, text: message, isThinking: false, isError: true }
            : item,
        ),
      );
    } finally {
      setIsProcessing(false);
    }
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
                {message.isThinking ? (
                  <div className="flex items-center gap-2 text-slate-500">
                    <BrainCircuit className="w-4 h-4 animate-pulse" />
                    <span className="text-sm font-medium">{t('agentAlex.chat.thinking', 'Thinking...')}</span>
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
        onRefresh={() => setExampleSeed(s => s + 1)}
      />

      <div className="p-2.5 sm:p-4 bg-white border-t border-slate-100">
        <div className="relative flex items-end gap-1.5 sm:gap-2 bg-slate-50 p-1.5 sm:p-2 rounded-2xl border border-slate-200 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400 transition-all">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSend(input);
              }
            }}
            placeholder={isAiEnabled ? t('agentAlex.chat.placeholder', 'Type your response...') : t('agentAlex.chat.disabled', 'AI disabled until Gemini is configured.')}
            className="flex-1 max-h-32 min-h-[40px] sm:min-h-[44px] bg-transparent border-none focus:ring-0 resize-none py-2 px-2.5 sm:py-2.5 sm:px-3 text-sm text-slate-800 placeholder:text-slate-400 custom-scrollbar disabled:cursor-not-allowed"
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

            <button
              onClick={() => void handleSend(input)}
              disabled={!input.trim() || isProcessing || !isAiEnabled}
              className="p-2 sm:p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-all flex-shrink-0 shadow-sm"
              title={t('agentAlex.chat.send', 'Send message')}
            >
              {isProcessing && !isRecording ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
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
