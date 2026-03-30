import React, { useRef, useState } from "react";
import { Send, Mic, Square, Play, Loader2, BrainCircuit, Lightbulb } from "lucide-react";
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

/** Generate contextual suggestion chips based on conversation history */
function generateSuggestions(messages: ChatMessage[], t: (key: string, fallback: string) => string): string[] {
  const allText = messages.map((m) => m.text).join(" ").toLowerCase();
  const msgCount = messages.filter((m) => m.role === "user").length;

  if (msgCount <= 1) {
    return [
      t('agentAlex.suggestions.frontendEngineer', 'We need a Senior Frontend Engineer'),
      t('agentAlex.suggestions.productManager', 'Help me hire a Product Manager'),
      t('agentAlex.suggestions.dataScientist', "I'm looking for a Data Scientist"),
    ];
  }

  const suggestions: string[] = [];

  if (!allText.includes("salary") && !allText.includes("薪") && !allText.includes("compensation")) {
    suggestions.push(t('agentAlex.suggestions.salary', "Let's discuss salary range"));
  }
  if (!allText.includes("remote") && !allText.includes("hybrid") && !allText.includes("onsite") && !allText.includes("办公")) {
    suggestions.push(t('agentAlex.suggestions.location', 'Set work location / remote policy'));
  }
  if (!allText.includes("must-have") && !allText.includes("必要") && !allText.includes("hard requirement")) {
    suggestions.push(t('agentAlex.suggestions.mustHave', 'Define must-have requirements'));
  }
  if (!allText.includes("nice-to-have") && !allText.includes("优先") && !allText.includes("preferred")) {
    suggestions.push(t('agentAlex.suggestions.niceToHave', 'Add nice-to-have qualifications'));
  }
  if (!allText.includes("interview") && !allText.includes("面试") && !allText.includes("hiring process")) {
    suggestions.push(t('agentAlex.suggestions.interview', 'Outline the interview process'));
  }
  if (!allText.includes("headcount") && !allText.includes("人数") && !allText.includes("how many")) {
    suggestions.push(t('agentAlex.suggestions.headcount', 'Specify headcount needed'));
  }
  if (!allText.includes("timeline") && !allText.includes("urgency") && !allText.includes("紧急") && !allText.includes("start date")) {
    suggestions.push(t('agentAlex.suggestions.timeline', 'Set hiring timeline / urgency'));
  }
  if (!allText.includes("benefit") && !allText.includes("福利") && !allText.includes("perk")) {
    suggestions.push(t('agentAlex.suggestions.benefits', 'Describe benefits & perks'));
  }

  if (suggestions.length <= 2 && msgCount >= 3) {
    suggestions.push(t('agentAlex.suggestions.finalize', "I'm done — finalize the specification"));
  }

  return suggestions.slice(0, 3);
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
      {!isProcessing && isAiEnabled && messages.length > 1 && (() => {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg?.role !== "model" || lastMsg.isThinking) return null;
        const chips = generateSuggestions(messages, t);
        if (chips.length === 0) return null;
        return (
          <div className="px-3 sm:px-4 pt-2 pb-1 flex flex-wrap gap-1.5 sm:gap-2 border-t border-slate-100 bg-slate-50/50">
            <Lightbulb className="w-3.5 h-3.5 text-amber-500 mt-1.5 shrink-0" />
            {chips.map((chip) => (
              <button
                key={chip}
                onClick={() => void handleSend(chip)}
                className="px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-full transition-colors whitespace-nowrap"
              >
                {chip}
              </button>
            ))}
          </div>
        );
      })()}

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
