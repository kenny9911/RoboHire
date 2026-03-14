import { voice, defineAgent, type JobContext, type JobProcess } from '@livekit/agents';
import { STT, TTS, LLM, type TTSVoices } from '@livekit/agents-plugin-openai';

type LLMMetricsEvent = {
  type: 'llm_metrics';
  requestId: string;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

type STTMetricsEvent = {
  type: 'stt_metrics';
  durationMs: number;
  audioDurationMs: number;
};

type TTSMetricsEvent = {
  type: 'tts_metrics';
  durationMs: number;
  audioDurationMs: number;
  charactersCount: number;
};

type SessionUsagePayload = {
  llm: {
    provider: string;
    model: string;
    calls: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    totalDurationMs: number;
  };
  stt: {
    provider: string;
    label: string;
    calls: number;
    totalAudioDurationMs: number;
    totalDurationMs: number;
  };
  tts: {
    provider: string;
    label: string;
    calls: number;
    totalCharacters: number;
    totalAudioDurationMs: number;
    totalDurationMs: number;
  };
  llmMetrics: Array<{
    requestId: string;
    durationMs: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }>;
  promptContext?: {
    instructions: string;
    greeting: string;
    language: string;
    candidateName: string;
    jobTitle: string;
  };
};

// Language-aware TTS voice selection
const LANGUAGE_VOICES: Record<string, TTSVoices> = {
  zh: 'nova',
  ja: 'nova',
  ko: 'nova',
  es: 'nova',
  fr: 'shimmer',
  de: 'onyx',
  pt: 'nova',
  ar: 'nova',
  hi: 'nova',
  ru: 'onyx',
};

function getVoiceForLanguage(lang: string): TTSVoices {
  if (!lang) return 'alloy';
  if (LANGUAGE_VOICES[lang]) return LANGUAGE_VOICES[lang];
  const prefix = lang.split('-')[0];
  return LANGUAGE_VOICES[prefix] || 'alloy';
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  zh: 'Chinese (Mandarin)',
  'zh-TW': 'Chinese (Traditional)',
  ja: 'Japanese',
  ko: 'Korean',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  ar: 'Arabic',
  hi: 'Hindi',
  ru: 'Russian',
};

function getLanguageName(code: string): string {
  if (LANGUAGE_NAMES[code]) return LANGUAGE_NAMES[code];
  const prefix = code.split('-')[0];
  return LANGUAGE_NAMES[prefix] || code;
}

const LANGUAGE_GREETINGS: Record<string, (name: string, job: string) => string> = {
  zh: (name, job) => job
    ? `你好，${name}！欢迎参加${job}岗位的面试。我是今天的AI面试官，让我们开始吧——请先简单做个自我介绍。`
    : `你好，${name}！欢迎参加面试。我是今天的AI面试官，让我们开始吧——请先简单做个自我介绍。`,
  ja: (name, job) => job
    ? `こんにちは、${name}さん！${job}ポジションの面接へようこそ。本日の面接を担当します。まずは簡単に自己紹介をお願いします。`
    : `こんにちは、${name}さん！面接へようこそ。本日の面接を担当します。まずは簡単に自己紹介をお願いします。`,
  ko: (name, job) => job
    ? `안녕하세요, ${name}님! ${job} 포지션 면접에 오신 것을 환영합니다. 오늘 면접을 진행하겠습니다. 먼저 간단히 자기소개를 부탁드립니다.`
    : `안녕하세요, ${name}님! 면접에 오신 것을 환영합니다. 오늘 면접을 진행하겠습니다. 먼저 간단히 자기소개를 부탁드립니다.`,
  es: (name, job) => job
    ? `¡Hola, ${name}! Bienvenido/a a la entrevista para el puesto de ${job}. Seré su entrevistador hoy. Comencemos — ¿podría presentarse brevemente?`
    : `¡Hola, ${name}! Bienvenido/a a la entrevista. Seré su entrevistador hoy. Comencemos — ¿podría presentarse brevemente?`,
  fr: (name, job) => job
    ? `Bonjour, ${name} ! Bienvenue à l'entretien pour le poste de ${job}. Je serai votre intervieweur aujourd'hui. Commençons — pourriez-vous vous présenter brièvement ?`
    : `Bonjour, ${name} ! Bienvenue à l'entretien. Je serai votre intervieweur aujourd'hui. Commençons — pourriez-vous vous présenter brièvement ?`,
  de: (name, job) => job
    ? `Hallo, ${name}! Willkommen zum Vorstellungsgespräch für die Position ${job}. Ich werde heute das Interview führen. Lassen Sie uns beginnen — könnten Sie sich kurz vorstellen?`
    : `Hallo, ${name}! Willkommen zum Vorstellungsgespräch. Ich werde heute das Interview führen. Lassen Sie uns beginnen — könnten Sie sich kurz vorstellen?`,
  pt: (name, job) => job
    ? `Olá, ${name}! Bem-vindo/a à entrevista para a posição de ${job}. Serei seu entrevistador hoje. Vamos começar — poderia se apresentar brevemente?`
    : `Olá, ${name}! Bem-vindo/a à entrevista. Serei seu entrevistador hoje. Vamos começar — poderia se apresentar brevemente?`,
};

function buildGreeting(candidateName: string, jobTitle: string, language: string): string {
  const prefix = language.split('-')[0];
  const greetFn = LANGUAGE_GREETINGS[language] || LANGUAGE_GREETINGS[prefix];
  if (greetFn) return greetFn(candidateName, jobTitle);
  // Default English
  return jobTitle
    ? `Hello ${candidateName}! Welcome to your interview for the ${jobTitle} position. I'll be conducting this interview today. Let's begin — could you start by briefly introducing yourself?`
    : `Hello ${candidateName}! Welcome to your interview. I'll be conducting this interview today. Let's begin — could you start by briefly introducing yourself?`;
}

/**
 * LiveKit Voice Agent for AI-driven interviews.
 * Reads room metadata for interview instructions and candidate context.
 *
 * This file is dynamically imported by the worker — it must export
 * a defineAgent({ entry, prewarm }) object as default.
 */

export default defineAgent({
  prewarm(_proc: JobProcess) {
    // no-op prewarm; could pre-load models here
  },
  entry: entryFn,
});

async function entryFn(ctx: JobContext) {
  try {
    await runInterview(ctx);
  } catch (err) {
    console.error('[interview-agent] Fatal error in entry:', err);
    throw err;
  }
}

async function runInterview(ctx: JobContext) {
  // Parse room metadata for interview config
  const metadata = JSON.parse(ctx.room.metadata || '{}');

  const language = (metadata.language as string) || 'en';
  const selectedVoice = getVoiceForLanguage(language);

  // Use generated prompt from InterviewPromptAgent if available, else fallback
  let instructions = metadata.instructions || getDefaultInstructions(metadata);

  // Prepend explicit language instruction if not English
  if (language !== 'en') {
    const langName = getLanguageName(language);
    const langDirective = `CRITICAL LANGUAGE REQUIREMENT: You MUST conduct this entire interview in ${langName}. All questions, responses, follow-ups, and greetings must be in ${langName}. Do NOT use English unless the candidate specifically requests it.\n\n`;
    if (!instructions.includes(langDirective.trim().slice(0, 40))) {
      instructions = langDirective + instructions;
    }
  }

  const stt = new STT({ model: 'whisper-1' });
  const llm = new LLM({ model: 'gpt-5.4' });
  const tts = new TTS({ model: 'tts-1', voice: selectedVoice });
  const usage: SessionUsagePayload = {
    llm: {
      provider: 'openai',
      model: llm.model,
      calls: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      totalDurationMs: 0,
    },
    stt: {
      provider: 'openai',
      label: stt.label,
      calls: 0,
      totalAudioDurationMs: 0,
      totalDurationMs: 0,
    },
    tts: {
      provider: 'openai',
      label: tts.label,
      calls: 0,
      totalCharacters: 0,
      totalAudioDurationMs: 0,
      totalDurationMs: 0,
    },
    llmMetrics: [],
    promptContext: undefined,
  };

  const agent = new voice.Agent({
    instructions,
    stt,
    llm,
    tts,
    allowInterruptions: true,
    turnDetection: 'stt',
  });

  const session = new voice.AgentSession({});

  // Collect transcript
  const transcript: Array<{ role: string; content: string; timestamp: number }> = [];

  session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev) => {
    if (ev.isFinal) {
      transcript.push({
        role: 'candidate',
        content: ev.transcript,
        timestamp: Date.now(),
      });
    }
  });

  session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev) => {
    const item = ev.item;
    if (item && item.role === 'assistant') {
      const text = item.textContent;
      if (text) {
        transcript.push({
          role: 'interviewer',
          content: text,
          timestamp: Date.now(),
        });
      }
    }
  });

  session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
    const metrics = ev.metrics;
    if (metrics.type === 'llm_metrics') {
      const llmMetrics = metrics as LLMMetricsEvent;
      usage.llm.calls += 1;
      usage.llm.promptTokens += llmMetrics.promptTokens;
      usage.llm.completionTokens += llmMetrics.completionTokens;
      usage.llm.totalTokens += llmMetrics.totalTokens;
      usage.llm.totalDurationMs += llmMetrics.durationMs;
      usage.llmMetrics.push({
        requestId: llmMetrics.requestId,
        durationMs: llmMetrics.durationMs,
        promptTokens: llmMetrics.promptTokens,
        completionTokens: llmMetrics.completionTokens,
        totalTokens: llmMetrics.totalTokens,
      });
      return;
    }

    if (metrics.type === 'stt_metrics') {
      const sttMetrics = metrics as STTMetricsEvent;
      usage.stt.calls += 1;
      usage.stt.totalAudioDurationMs += sttMetrics.audioDurationMs;
      usage.stt.totalDurationMs += sttMetrics.durationMs;
      return;
    }

    if (metrics.type === 'tts_metrics') {
      const ttsMetrics = metrics as TTSMetricsEvent;
      usage.tts.calls += 1;
      usage.tts.totalCharacters += ttsMetrics.charactersCount;
      usage.tts.totalAudioDurationMs += ttsMetrics.audioDurationMs;
      usage.tts.totalDurationMs += ttsMetrics.durationMs;
    }
  });

  // On shutdown, post transcript back to backend
  ctx.addShutdownCallback(async () => {
    const hasUsage =
      usage.llm.totalTokens > 0 ||
      usage.stt.calls > 0 ||
      usage.tts.calls > 0;

    if (metadata.interviewId && (transcript.length > 0 || hasUsage)) {
      try {
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:4607';
        const apiKey = process.env.LIVEKIT_API_KEY || '';
        await fetch(`${backendUrl}/api/v1/interviews/${metadata.interviewId}/transcript`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript, apiKey, usage }),
        });
      } catch (err) {
        console.error('Failed to post transcript:', err);
      }
    }
  });

  await ctx.connect();
  await session.start({ agent, room: ctx.room });

  // Greet the candidate in the appropriate language
  const candidateName = metadata.candidateName || 'candidate';
  const jobTitle = metadata.jobTitle || '';
  const greeting = buildGreeting(candidateName, jobTitle, language);

  usage.promptContext = {
    instructions,
    greeting,
    language,
    candidateName,
    jobTitle,
  };

  session.say(greeting);
}

function getDefaultInstructions(metadata: Record<string, unknown>): string {
  const jobTitle = (metadata.jobTitle as string) || 'the position';
  const jobDescription = (metadata.jobDescription as string) || '';
  const resumeText = (metadata.resumeText as string) || '';
  const language = (metadata.language as string) || 'en';

  let langInstruction = '';
  if (language.startsWith('zh')) {
    langInstruction = 'Conduct the interview in Chinese (Mandarin). ';
  } else if (language.startsWith('ja')) {
    langInstruction = 'Conduct the interview in Japanese. ';
  } else if (language.startsWith('es')) {
    langInstruction = 'Conduct the interview in Spanish. ';
  } else if (language.startsWith('fr')) {
    langInstruction = 'Conduct the interview in French. ';
  } else if (language.startsWith('de')) {
    langInstruction = 'Conduct the interview in German. ';
  } else if (language.startsWith('pt')) {
    langInstruction = 'Conduct the interview in Portuguese. ';
  }

  return `You are an AI interviewer conducting a professional job interview for ${jobTitle}. ${langInstruction}

Your role:
- Ask relevant technical and behavioral questions based on the job requirements
- Listen carefully to the candidate's responses
- Ask follow-up questions when answers are vague or incomplete
- Be professional, friendly, and encouraging
- Keep the interview focused and on-topic
- Evaluate the candidate's communication skills, technical knowledge, and cultural fit

${jobDescription ? `Job Description:\n${jobDescription}\n` : ''}
${resumeText ? `Candidate Resume Summary:\n${resumeText.slice(0, 2000)}\n` : ''}

Interview structure:
1. Brief introduction and ice-breaker
2. Technical questions related to the role
3. Behavioral/situational questions
4. Allow candidate to ask questions
5. Wrap up with next steps

Important guidelines:
- Ask one question at a time
- Wait for the candidate to finish before asking the next question
- Keep responses concise and natural
- If the candidate goes off-topic, gently redirect
- Do not reveal evaluation criteria during the interview`;
}
