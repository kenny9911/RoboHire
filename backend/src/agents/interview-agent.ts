import { voice, defineAgent, type JobContext, type JobProcess } from '@livekit/agents';
import { STT, TTS, LLM } from '@livekit/agents-plugin-openai';

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

  const instructions = metadata.instructions || getDefaultInstructions(metadata);

  const agent = new voice.Agent({
    instructions,
    stt: new STT({ model: 'whisper-1' }),
    llm: new LLM({ model: 'gpt-4o' }),
    tts: new TTS({ model: 'tts-1', voice: 'alloy' }),
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

  // On shutdown, post transcript back to backend
  ctx.addShutdownCallback(async () => {
    if (transcript.length > 0 && metadata.interviewId) {
      try {
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:4607';
        const apiKey = process.env.LIVEKIT_API_KEY || '';
        await fetch(`${backendUrl}/api/v1/interviews/${metadata.interviewId}/transcript`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript, apiKey }),
        });
      } catch (err) {
        console.error('Failed to post transcript:', err);
      }
    }
  });

  await ctx.connect();
  await session.start({ agent, room: ctx.room });

  // Greet the candidate
  const candidateName = metadata.candidateName || 'candidate';
  const jobTitle = metadata.jobTitle || '';
  const greeting = jobTitle
    ? `Hello ${candidateName}! Welcome to your interview for the ${jobTitle} position. I'll be conducting this interview today. Let's begin — could you start by briefly introducing yourself?`
    : `Hello ${candidateName}! Welcome to your interview. I'll be conducting this interview today. Let's begin — could you start by briefly introducing yourself?`;

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
