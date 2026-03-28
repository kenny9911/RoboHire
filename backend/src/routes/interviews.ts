import { Router } from 'express';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { generateRequestId, logger } from '../services/LoggerService.js';
import { EvaluationAgent } from '../agents/EvaluationAgent.js';
import { liveKitService } from '../services/LiveKitService.js';
import { interviewPromptAgent } from '../agents/InterviewPromptAgent.js';
import { getVisibilityScope, buildUserIdFilter, buildAdminOverrideFilter } from '../lib/teamVisibility.js';
import { getPreferredResumeEmail } from '../utils/resumeContact.js';
import '../types/auth.js';

const router = Router();
const MIN_INTERVIEW_DURATION_SECONDS = 300; // 5 minutes — interviews shorter than this are not marked completed
const LIVEKIT_USAGE_ENDPOINT = '/api/v1/interviews/live-session';
const LIVEKIT_USAGE_MODULE = 'interview_livekit';
const LIVEKIT_USAGE_API_NAME = 'interviews_live_session';
const DEFAULT_PROMPT_GENERATION_TIMEOUT_MS = 60000;

type WorkerSessionUsagePayload = {
  sessionConfig?: {
    roomName?: string;
    language?: string;
    configVersionId?: string;
    configVersionNumber?: number;
    configVersionLabel?: string;
    sttLanguage?: string;
    ttsLanguage?: string;
    turnDetection?: string;
    allowInterruptions?: boolean;
    discardAudioIfUninterruptible?: boolean;
    preemptiveGeneration?: boolean;
    minInterruptionDurationMs?: number;
    minInterruptionWords?: number;
    minEndpointingDelayMs?: number;
    maxEndpointingDelayMs?: number;
    aecWarmupDurationMs?: number;
    useTtsAlignedTranscript?: boolean;
    logInterimTranscripts?: boolean;
    vad?: {
      provider?: string;
      model?: string;
    };
    llm?: {
      provider?: string;
      model?: string;
    };
    stt?: {
      provider?: string;
      model?: string;
      label?: string;
      language?: string;
    };
    tts?: {
      provider?: string;
      model?: string;
      label?: string;
      language?: string;
      voiceId?: string;
    };
  };
  operational?: {
    roomName?: string;
    participantIdentity?: string;
    participantTrackPublicationCount?: number;
    participantTracks?: Array<{
      sid?: string;
      name?: string;
      kind?: string;
      source?: string;
      subscribed?: boolean;
      muted?: boolean;
    }>;
    startedAt?: string;
    endedAt?: string;
    sessionDurationMs?: number;
    transcriptEntries?: number;
    candidateTurns?: number;
    interviewerTurns?: number;
    closeReason?: string;
    stateTransitions?: Array<{
      oldState?: string;
      newState?: string;
      at?: string;
    }>;
    userStateTransitions?: Array<{
      oldState?: string;
      newState?: string;
      at?: string;
    }>;
    errors?: Array<{
      message?: string;
      at?: string;
      source?: string;
    }>;
  };
  llm?: {
    provider?: string;
    model?: string;
    calls?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    totalDurationMs?: number;
    estimatedCostUsd?: number | null;
  };
  stt?: {
    provider?: string;
    model?: string;
    label?: string;
    language?: string;
    calls?: number;
    totalAudioDurationMs?: number;
    totalDurationMs?: number;
    estimatedCostUsd?: number | null;
  };
  tts?: {
    provider?: string;
    model?: string;
    label?: string;
    language?: string;
    voiceId?: string;
    calls?: number;
    totalCharacters?: number;
    totalAudioDurationMs?: number;
    totalDurationMs?: number;
    estimatedCostUsd?: number | null;
  };
  llmMetrics?: Array<{
    requestId?: string;
    label?: string;
    durationMs?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    ttftMs?: number;
    tokensPerSecond?: number;
    cancelled?: boolean;
    speechId?: string;
  }>;
  sttMetrics?: Array<{
    requestId?: string;
    label?: string;
    durationMs?: number;
    audioDurationMs?: number;
    streamed?: boolean;
  }>;
  ttsMetrics?: Array<{
    requestId?: string;
    label?: string;
    durationMs?: number;
    audioDurationMs?: number;
    charactersCount?: number;
    streamed?: boolean;
    speechId?: string;
    segmentId?: string;
  }>;
  vadMetrics?: Array<{
    label?: string;
    idleTimeMs?: number;
    inferenceDurationTotalMs?: number;
    inferenceCount?: number;
    timestamp?: number;
  }>;
  eouMetrics?: Array<{
    endOfUtteranceDelayMs?: number;
    transcriptionDelayMs?: number;
    onUserTurnCompletedDelayMs?: number;
    lastSpeakingTimeMs?: number;
    speechId?: string;
    timestamp?: number;
  }>;
  promptContext?: {
    instructions?: string;
    greeting?: string;
    language?: string;
    candidateName?: string;
    jobTitle?: string;
    interviewId?: string;
    companyName?: string;
    instructionsSource?: string;
    configVersionId?: string;
    configVersionNumber?: number;
    configVersionLabel?: string;
  };
  costs?: {
    llmEstimatedUsd?: number | null;
    sttEstimatedUsd?: number | null;
    ttsEstimatedUsd?: number | null;
    totalEstimatedUsd?: number | null;
    costSource?: string;
    notes?: string;
  };
  diagnostics?: Record<string, unknown>;
  trace?: Record<string, unknown>;
};

type InterviewTranscriptRole = 'candidate' | 'interviewer';

type NormalizedInterviewTranscriptEntry = {
  role: InterviewTranscriptRole;
  content: string;
  timestamp: number;
  sequence: number;
  speakerName: string;
  occurredAt: Date;
};

function toSafeInt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function toOptionalSafeInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.round(value));
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function toOptionalMoney(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Number(value.toFixed(6)));
}

function parseConfigString(config: Record<string, string>, key: string): string | undefined {
  const value = config[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function parseConfigBoolean(config: Record<string, string>, key: string): boolean | undefined {
  const value = config[key];
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

function parseConfigInt(config: Record<string, string>, key: string): number | undefined {
  const value = config[key];
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildAgentRuntimeConfig(config: Record<string, string>): Record<string, unknown> | undefined {
  const agentConfig = Object.fromEntries(
    Object.entries({
      sttProvider: parseConfigString(config, 'interview.sttProvider'),
      sttModel: parseConfigString(config, 'interview.sttModel'),
      llmProvider: parseConfigString(config, 'interview.llmProvider'),
      llmModel: parseConfigString(config, 'interview.llmModel'),
      ttsProvider: parseConfigString(config, 'interview.ttsProvider'),
      ttsModel: parseConfigString(config, 'interview.ttsModel'),
      ttsVoice: parseConfigString(config, 'interview.ttsVoice'),
      turnDetection: parseConfigString(config, 'interview.turnDetection'),
      allowInterruptions: parseConfigBoolean(config, 'interview.allowInterruptions'),
      discardAudioIfUninterruptible: parseConfigBoolean(
        config,
        'interview.discardAudioIfUninterruptible',
      ),
      preemptiveGeneration: parseConfigBoolean(config, 'interview.preemptiveGeneration'),
      minInterruptionDurationMs: parseConfigInt(config, 'interview.minInterruptionDurationMs'),
      minInterruptionWords: parseConfigInt(config, 'interview.minInterruptionWords'),
      minEndpointingDelayMs: parseConfigInt(config, 'interview.minEndpointingDelayMs'),
      maxEndpointingDelayMs: parseConfigInt(config, 'interview.maxEndpointingDelayMs'),
      aecWarmupDurationMs: parseConfigInt(config, 'interview.aecWarmupDurationMs'),
      useTtsAlignedTranscript: parseConfigBoolean(config, 'interview.useTtsAlignedTranscript'),
      logInterimTranscripts: parseConfigBoolean(config, 'interview.logInterimTranscripts'),
    }).filter(([, value]) => value !== undefined),
  );

  return Object.keys(agentConfig).length > 0 ? agentConfig : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeInterviewMetadata(metadata: unknown, isAdmin: boolean): unknown {
  if (isAdmin || !isRecord(metadata) || !('gohireInviteLog' in metadata)) {
    return metadata;
  }

  const { gohireInviteLog: _hidden, ...rest } = metadata;
  return rest;
}

function extractGoHireInviteLog(metadata: unknown): Record<string, unknown> | null {
  if (!isRecord(metadata) || !isRecord(metadata.gohireInviteLog)) {
    return null;
  }

  return metadata.gohireInviteLog;
}

function buildInterviewRecordingViewUrl(interviewId: string, recordingUrl?: string | null): string | null {
  return recordingUrl ? `/api/v1/interviews/${interviewId}/recording-file` : null;
}

function serializeInterviewForResponse<T extends { metadata?: unknown }>(
  interview: T,
  isAdmin: boolean,
): T & { gohireInviteLog?: Record<string, unknown> | null; recordingViewUrl?: string | null } {
  const base = {
    ...interview,
    metadata: sanitizeInterviewMetadata(interview.metadata, isAdmin),
    recordingViewUrl: 'id' in interview && typeof interview.id === 'string'
      ? buildInterviewRecordingViewUrl(
          interview.id,
          'recordingUrl' in interview && typeof interview.recordingUrl === 'string'
            ? interview.recordingUrl
            : null,
        )
      : null,
  };

  if (!isAdmin) {
    return base;
  }

  return {
    ...base,
    gohireInviteLog: extractGoHireInviteLog(interview.metadata),
  };
}

function resolveRecordingContentType(recordingUrl: string, headerContentType?: string | null): string {
  const header = headerContentType?.split(';')[0].trim();
  if (header && header !== 'application/octet-stream') {
    return header;
  }

  try {
    const pathname = new URL(recordingUrl).pathname.toLowerCase();
    if (pathname.endsWith('.webm')) return 'video/webm';
    if (pathname.endsWith('.mov')) return 'video/quicktime';
    if (pathname.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
  } catch {
    // Fall through to the default type below.
  }

  return 'video/mp4';
}

function buildRecordingFileName(interview: {
  candidateName?: string | null;
  jobTitle?: string | null;
  recordingUrl?: string | null;
}): string {
  try {
    if (interview.recordingUrl) {
      const parsedUrl = new URL(interview.recordingUrl);
      const fromUrl = decodeURIComponent(parsedUrl.pathname.split('/').pop() || '').trim();
      if (fromUrl) {
        return fromUrl.replace(/[\r\n"]/g, '');
      }
    }
  } catch {
    // Fall back to a generated file name.
  }

  const safeBase = `${interview.candidateName || 'candidate'}-${interview.jobTitle || 'interview-recording'}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return `${safeBase || 'interview-recording'}.mp4`;
}

function normalizeWorkerUsagePayload(raw: unknown): WorkerSessionUsagePayload | null {
  if (!isRecord(raw)) return null;

  const sessionConfig = isRecord(raw.sessionConfig)
    ? {
        roomName: toOptionalString(raw.sessionConfig.roomName),
        language: toOptionalString(raw.sessionConfig.language),
        configVersionId: toOptionalString(raw.sessionConfig.configVersionId),
        configVersionNumber: toOptionalSafeInt(raw.sessionConfig.configVersionNumber),
        configVersionLabel: toOptionalString(raw.sessionConfig.configVersionLabel),
        sttLanguage: toOptionalString(raw.sessionConfig.sttLanguage),
        ttsLanguage: toOptionalString(raw.sessionConfig.ttsLanguage),
        turnDetection: toOptionalString(raw.sessionConfig.turnDetection),
        allowInterruptions: toOptionalBoolean(raw.sessionConfig.allowInterruptions),
        discardAudioIfUninterruptible: toOptionalBoolean(
          raw.sessionConfig.discardAudioIfUninterruptible,
        ),
        preemptiveGeneration: toOptionalBoolean(raw.sessionConfig.preemptiveGeneration),
        minInterruptionDurationMs: toSafeInt(raw.sessionConfig.minInterruptionDurationMs),
        minInterruptionWords: toSafeInt(raw.sessionConfig.minInterruptionWords),
        minEndpointingDelayMs: toSafeInt(raw.sessionConfig.minEndpointingDelayMs),
        maxEndpointingDelayMs: toSafeInt(raw.sessionConfig.maxEndpointingDelayMs),
        aecWarmupDurationMs: toSafeInt(raw.sessionConfig.aecWarmupDurationMs),
        useTtsAlignedTranscript: toOptionalBoolean(raw.sessionConfig.useTtsAlignedTranscript),
        logInterimTranscripts: toOptionalBoolean(raw.sessionConfig.logInterimTranscripts),
        vad: isRecord(raw.sessionConfig.vad)
          ? {
              provider: toOptionalString(raw.sessionConfig.vad.provider),
              model: toOptionalString(raw.sessionConfig.vad.model),
            }
          : undefined,
        llm: isRecord(raw.sessionConfig.llm)
          ? {
              provider: toOptionalString(raw.sessionConfig.llm.provider),
              model: toOptionalString(raw.sessionConfig.llm.model),
            }
          : undefined,
        stt: isRecord(raw.sessionConfig.stt)
          ? {
              provider: toOptionalString(raw.sessionConfig.stt.provider),
              model: toOptionalString(raw.sessionConfig.stt.model),
              label: toOptionalString(raw.sessionConfig.stt.label),
              language: toOptionalString(raw.sessionConfig.stt.language),
            }
          : undefined,
        tts: isRecord(raw.sessionConfig.tts)
          ? {
              provider: toOptionalString(raw.sessionConfig.tts.provider),
              model: toOptionalString(raw.sessionConfig.tts.model),
              label: toOptionalString(raw.sessionConfig.tts.label),
              language: toOptionalString(raw.sessionConfig.tts.language),
              voiceId: toOptionalString(raw.sessionConfig.tts.voiceId),
            }
          : undefined,
      }
    : undefined;

  const operational = isRecord(raw.operational)
    ? {
        roomName: toOptionalString(raw.operational.roomName),
        participantIdentity: toOptionalString(raw.operational.participantIdentity),
        participantTrackPublicationCount: toSafeInt(raw.operational.participantTrackPublicationCount),
        participantTracks: Array.isArray(raw.operational.participantTracks)
          ? raw.operational.participantTracks
              .filter(isRecord)
              .map((track) => ({
                sid: toOptionalString(track.sid),
                name: toOptionalString(track.name),
                kind: toOptionalString(track.kind),
                source: toOptionalString(track.source),
                subscribed: toOptionalBoolean(track.subscribed),
                muted: toOptionalBoolean(track.muted),
              }))
          : [],
        startedAt: toOptionalString(raw.operational.startedAt),
        endedAt: toOptionalString(raw.operational.endedAt),
        sessionDurationMs: toSafeInt(raw.operational.sessionDurationMs),
        transcriptEntries: toSafeInt(raw.operational.transcriptEntries),
        candidateTurns: toSafeInt(raw.operational.candidateTurns),
        interviewerTurns: toSafeInt(raw.operational.interviewerTurns),
        closeReason: toOptionalString(raw.operational.closeReason),
        stateTransitions: Array.isArray(raw.operational.stateTransitions)
          ? raw.operational.stateTransitions
              .filter(isRecord)
              .map((transition) => ({
                oldState: toOptionalString(transition.oldState),
                newState: toOptionalString(transition.newState),
                at: toOptionalString(transition.at),
              }))
          : [],
        userStateTransitions: Array.isArray(raw.operational.userStateTransitions)
          ? raw.operational.userStateTransitions
              .filter(isRecord)
              .map((transition) => ({
                oldState: toOptionalString(transition.oldState),
                newState: toOptionalString(transition.newState),
                at: toOptionalString(transition.at),
              }))
          : [],
        errors: Array.isArray(raw.operational.errors)
          ? raw.operational.errors
              .filter(isRecord)
              .map((error) => ({
                message: toOptionalString(error.message),
                at: toOptionalString(error.at),
                source: toOptionalString(error.source),
              }))
          : [],
      }
    : undefined;

  const llm = isRecord(raw.llm)
    ? {
        provider: typeof raw.llm.provider === 'string' ? raw.llm.provider : 'openai',
        model: typeof raw.llm.model === 'string' ? raw.llm.model : 'unknown',
        calls: toSafeInt(raw.llm.calls),
        promptTokens: toSafeInt(raw.llm.promptTokens),
        completionTokens: toSafeInt(raw.llm.completionTokens),
        totalTokens: toSafeInt(raw.llm.totalTokens),
        totalDurationMs: toSafeInt(raw.llm.totalDurationMs),
        estimatedCostUsd: toOptionalMoney(raw.llm.estimatedCostUsd),
      }
    : undefined;

  const stt = isRecord(raw.stt)
    ? {
        provider: typeof raw.stt.provider === 'string' ? raw.stt.provider : 'openai',
        model: toOptionalString(raw.stt.model),
        label: typeof raw.stt.label === 'string' ? raw.stt.label : 'STT',
        language: toOptionalString(raw.stt.language),
        calls: toSafeInt(raw.stt.calls),
        totalAudioDurationMs: toSafeInt(raw.stt.totalAudioDurationMs),
        totalDurationMs: toSafeInt(raw.stt.totalDurationMs),
        estimatedCostUsd: toOptionalMoney(raw.stt.estimatedCostUsd),
      }
    : undefined;

  const tts = isRecord(raw.tts)
    ? {
        provider: typeof raw.tts.provider === 'string' ? raw.tts.provider : 'openai',
        model: toOptionalString(raw.tts.model),
        label: typeof raw.tts.label === 'string' ? raw.tts.label : 'TTS',
        language: toOptionalString(raw.tts.language),
        voiceId: toOptionalString(raw.tts.voiceId),
        calls: toSafeInt(raw.tts.calls),
        totalCharacters: toSafeInt(raw.tts.totalCharacters),
        totalAudioDurationMs: toSafeInt(raw.tts.totalAudioDurationMs),
        totalDurationMs: toSafeInt(raw.tts.totalDurationMs),
        estimatedCostUsd: toOptionalMoney(raw.tts.estimatedCostUsd),
      }
    : undefined;

  const llmMetrics = Array.isArray(raw.llmMetrics)
    ? raw.llmMetrics
        .filter(isRecord)
        .map((metric) => ({
          requestId: typeof metric.requestId === 'string' ? metric.requestId : undefined,
          label: toOptionalString(metric.label),
          durationMs: toSafeInt(metric.durationMs),
          promptTokens: toSafeInt(metric.promptTokens),
          completionTokens: toSafeInt(metric.completionTokens),
          totalTokens: toSafeInt(metric.totalTokens),
          ttftMs: toSafeInt(metric.ttftMs),
          tokensPerSecond: toSafeInt(metric.tokensPerSecond),
          cancelled: toOptionalBoolean(metric.cancelled),
          speechId: toOptionalString(metric.speechId),
        }))
    : [];

  const sttMetrics = Array.isArray(raw.sttMetrics)
    ? raw.sttMetrics
        .filter(isRecord)
        .map((metric) => ({
          requestId: toOptionalString(metric.requestId),
          label: toOptionalString(metric.label),
          durationMs: toSafeInt(metric.durationMs),
          audioDurationMs: toSafeInt(metric.audioDurationMs),
          streamed: toOptionalBoolean(metric.streamed),
        }))
    : [];

  const ttsMetrics = Array.isArray(raw.ttsMetrics)
    ? raw.ttsMetrics
        .filter(isRecord)
        .map((metric) => ({
          requestId: toOptionalString(metric.requestId),
          label: toOptionalString(metric.label),
          durationMs: toSafeInt(metric.durationMs),
          audioDurationMs: toSafeInt(metric.audioDurationMs),
          charactersCount: toSafeInt(metric.charactersCount),
          streamed: toOptionalBoolean(metric.streamed),
          speechId: toOptionalString(metric.speechId),
          segmentId: toOptionalString(metric.segmentId),
        }))
    : [];

  const vadMetrics = Array.isArray(raw.vadMetrics)
    ? raw.vadMetrics
        .filter(isRecord)
        .map((metric) => ({
          label: toOptionalString(metric.label),
          idleTimeMs: toSafeInt(metric.idleTimeMs),
          inferenceDurationTotalMs: toSafeInt(metric.inferenceDurationTotalMs),
          inferenceCount: toSafeInt(metric.inferenceCount),
          timestamp: toSafeInt(metric.timestamp),
        }))
    : [];

  const eouMetrics = Array.isArray(raw.eouMetrics)
    ? raw.eouMetrics
        .filter(isRecord)
        .map((metric) => ({
          endOfUtteranceDelayMs: toSafeInt(metric.endOfUtteranceDelayMs),
          transcriptionDelayMs: toSafeInt(metric.transcriptionDelayMs),
          onUserTurnCompletedDelayMs: toSafeInt(metric.onUserTurnCompletedDelayMs),
          lastSpeakingTimeMs: toSafeInt(metric.lastSpeakingTimeMs),
          speechId: toOptionalString(metric.speechId),
          timestamp: toSafeInt(metric.timestamp),
        }))
    : [];

  const promptContext = isRecord(raw.promptContext)
    ? {
        instructions: typeof raw.promptContext.instructions === 'string' ? raw.promptContext.instructions : undefined,
        greeting: typeof raw.promptContext.greeting === 'string' ? raw.promptContext.greeting : undefined,
        language: typeof raw.promptContext.language === 'string' ? raw.promptContext.language : undefined,
        candidateName: typeof raw.promptContext.candidateName === 'string' ? raw.promptContext.candidateName : undefined,
        jobTitle: typeof raw.promptContext.jobTitle === 'string' ? raw.promptContext.jobTitle : undefined,
        interviewId: typeof raw.promptContext.interviewId === 'string' ? raw.promptContext.interviewId : undefined,
        companyName: typeof raw.promptContext.companyName === 'string' ? raw.promptContext.companyName : undefined,
        instructionsSource: typeof raw.promptContext.instructionsSource === 'string' ? raw.promptContext.instructionsSource : undefined,
        configVersionId:
          typeof raw.promptContext.configVersionId === 'string'
            ? raw.promptContext.configVersionId
            : undefined,
        configVersionNumber: toOptionalSafeInt(raw.promptContext.configVersionNumber),
        configVersionLabel:
          typeof raw.promptContext.configVersionLabel === 'string'
            ? raw.promptContext.configVersionLabel
            : undefined,
      }
    : undefined;

  const costs = isRecord(raw.costs)
    ? {
        llmEstimatedUsd: toOptionalMoney(raw.costs.llmEstimatedUsd),
        sttEstimatedUsd: toOptionalMoney(raw.costs.sttEstimatedUsd),
        ttsEstimatedUsd: toOptionalMoney(raw.costs.ttsEstimatedUsd),
        totalEstimatedUsd: toOptionalMoney(raw.costs.totalEstimatedUsd),
        costSource: toOptionalString(raw.costs.costSource),
        notes: toOptionalString(raw.costs.notes),
      }
    : undefined;

  const diagnostics = isRecord(raw.diagnostics) ? raw.diagnostics : undefined;
  const trace = isRecord(raw.trace) ? raw.trace : undefined;

  if (
    !sessionConfig &&
    !operational &&
    !llm &&
    !stt &&
    !tts &&
    llmMetrics.length === 0 &&
    sttMetrics.length === 0 &&
    ttsMetrics.length === 0 &&
    vadMetrics.length === 0 &&
    eouMetrics.length === 0 &&
    !promptContext &&
    !costs &&
    !diagnostics &&
    !trace
  ) {
    return null;
  }

  return {
    sessionConfig,
    operational,
    llm,
    stt,
    tts,
    llmMetrics,
    sttMetrics,
    ttsMetrics,
    vadMetrics,
    eouMetrics,
    promptContext,
    costs,
    diagnostics,
    trace,
  };
}

function normalizeTranscriptRole(value: unknown): InterviewTranscriptRole | null {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (['candidate', 'user', 'human'].includes(normalized)) return 'candidate';
  if (['interviewer', 'assistant', 'agent', 'ai'].includes(normalized)) return 'interviewer';
  return null;
}

function parseTranscriptTimestamp(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value === 'string') {
    const numeric = Number.parseInt(value, 10);
    if (Number.isFinite(numeric)) {
      return Math.max(0, numeric);
    }

    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return Math.max(0, fallback);
}

function getTranscriptSpeakerName(role: InterviewTranscriptRole, candidateName: string): string {
  const trimmedCandidateName = candidateName.trim();
  return role === 'candidate'
    ? trimmedCandidateName || 'Candidate'
    : 'Interviewer';
}

function normalizeInterviewTranscript(
  rawTranscript: unknown,
  candidateName: string,
): NormalizedInterviewTranscriptEntry[] | null {
  if (!Array.isArray(rawTranscript)) return null;

  const normalized: NormalizedInterviewTranscriptEntry[] = [];
  let fallbackTimestamp = Date.now();

  for (const entry of rawTranscript) {
    if (!isRecord(entry)) continue;

    const role = normalizeTranscriptRole(entry.role);
    const content = toOptionalString(entry.content);
    if (!role || !content) continue;

    const timestamp = parseTranscriptTimestamp(entry.timestamp, fallbackTimestamp);
    fallbackTimestamp = Math.max(fallbackTimestamp + 1, timestamp + 1);

    normalized.push({
      role,
      content,
      timestamp,
      sequence: normalized.length,
      speakerName: getTranscriptSpeakerName(role, candidateName),
      occurredAt: new Date(timestamp),
    });
  }

  return normalized;
}

function buildInterviewTranscriptJson(
  transcript: NormalizedInterviewTranscriptEntry[],
): Prisma.InputJsonValue {
  return transcript.map((entry) => ({
    role: entry.role,
    content: entry.content,
    timestamp: entry.timestamp,
  })) as Prisma.InputJsonValue;
}

function buildInterviewDialogTurnRows(
  interviewId: string,
  userId: string,
  candidateId: string | null,
  transcript: NormalizedInterviewTranscriptEntry[],
): Prisma.InterviewDialogTurnCreateManyInput[] {
  return transcript.map((entry) => ({
    interviewId,
    userId,
    candidateId,
    role: entry.role,
    speakerName: entry.speakerName,
    content: entry.content,
    timestamp: entry.occurredAt,
    sequence: entry.sequence,
  }));
}

type InterviewCandidateLookup = {
  id: string;
  userId: string;
  candidateId?: string | null;
  hiringRequestId?: string | null;
  candidateEmail?: string | null;
  candidateName: string;
};

async function resolveCandidateIdForInterview(
  tx: Prisma.TransactionClient,
  interview: InterviewCandidateLookup,
): Promise<string | null> {
  if (interview.candidateId) return interview.candidateId;

  const candidateEmail = interview.candidateEmail?.trim();
  const candidateName = interview.candidateName.trim();

  if (interview.hiringRequestId) {
    if (candidateEmail) {
      const byEmail = await tx.candidate.findFirst({
        where: {
          hiringRequestId: interview.hiringRequestId,
          email: { equals: candidateEmail, mode: 'insensitive' },
        },
        select: { id: true },
        orderBy: { updatedAt: 'desc' },
      });
      if (byEmail) return byEmail.id;
    }

    if (candidateName) {
      const byName = await tx.candidate.findFirst({
        where: {
          hiringRequestId: interview.hiringRequestId,
          name: { equals: candidateName, mode: 'insensitive' },
        },
        select: { id: true },
        orderBy: { updatedAt: 'desc' },
      });
      if (byName) return byName.id;
    }
  }

  if (candidateEmail) {
    const byEmail = await tx.candidate.findFirst({
      where: {
        email: { equals: candidateEmail, mode: 'insensitive' },
        hiringRequest: { userId: interview.userId },
      },
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (byEmail) return byEmail.id;
  }

  if (candidateName) {
    const byName = await tx.candidate.findFirst({
      where: {
        name: { equals: candidateName, mode: 'insensitive' },
        hiringRequest: { userId: interview.userId },
      },
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (byName) return byName.id;
  }

  return null;
}

async function syncInterviewTranscriptArtifacts(
  tx: Prisma.TransactionClient,
  interview: InterviewCandidateLookup,
  transcript: unknown,
): Promise<Record<string, unknown>> {
  const interviewUpdate: Record<string, unknown> = {};
  const candidateId = await resolveCandidateIdForInterview(tx, interview);

  if (candidateId && candidateId !== interview.candidateId) {
    interviewUpdate.candidateId = candidateId;
  }

  if (transcript === undefined) {
    return interviewUpdate;
  }

  if (transcript === null) {
    await tx.interviewDialogTurn.deleteMany({ where: { interviewId: interview.id } });
    interviewUpdate.transcript = null;
    return interviewUpdate;
  }

  const normalizedTranscript = normalizeInterviewTranscript(transcript, interview.candidateName);
  if (!normalizedTranscript) {
    interviewUpdate.transcript = transcript as Prisma.InputJsonValue;
    return interviewUpdate;
  }

  await tx.interviewDialogTurn.deleteMany({ where: { interviewId: interview.id } });
  if (normalizedTranscript.length > 0) {
    await tx.interviewDialogTurn.createMany({
      data: buildInterviewDialogTurnRows(
        interview.id,
        interview.userId,
        candidateId,
        normalizedTranscript,
      ),
    });
  }

  interviewUpdate.transcript = buildInterviewTranscriptJson(normalizedTranscript);
  return interviewUpdate;
}

/**
 * Build room metadata for the LiveKit agent, incorporating per-job language,
 * job context fields, and an AI-generated interview prompt when available.
 */
async function buildRoomMetadata(
  interview: {
    id: string;
    userId: string;
    jobId?: string | null;
    candidateName: string;
    jobTitle?: string | null;
    jobDescription?: string | null;
    resumeText?: string | null;
  },
  config: Record<string, string>,
) {
  const metadata: Record<string, unknown> = {
    interviewId: interview.id,
    jobTitle: interview.jobTitle || '',
    jobDescription: interview.jobDescription || '',
    candidateName: interview.candidateName,
    resumeText: interview.resumeText || '',
    language: config['interview.language'] || 'en',
  };

  // If job is linked, pull per-job fields including language
  let job: any = null;
  if (interview.jobId) {
    job = await prisma.job.findFirst({
      where: { id: interview.jobId, userId: interview.userId },
      select: {
        interviewLanguage: true,
        interviewDuration: true,
        passingScore: true,
        companyName: true,
        qualifications: true,
        hardRequirements: true,
        requirements: true,
        interviewRequirements: true,
        evaluationRules: true,
        description: true,
        title: true,
      },
    });
    if (job) {
      if (job.interviewLanguage) metadata.language = job.interviewLanguage;
      if (job.companyName) metadata.companyName = job.companyName;
      if (!metadata.jobTitle && job.title) metadata.jobTitle = job.title;
      if (!metadata.jobDescription && job.description) metadata.jobDescription = job.description;
    }
  }

  // Generate tailored interview prompt via InterviewPromptAgent
  if (!config['interview.instructions']) {
    try {
      const promptModel = getInterviewPromptModel();
      const promptProvider = getInterviewPromptProvider();
      const promptTimeoutMs = getInterviewPromptTimeoutMs();

      logger.info('INTERVIEWS', 'Generating interview prompt via agent', {
        interviewId: interview.id,
        model: promptModel || process.env.LLM_MODEL || 'default',
        provider: promptProvider || process.env.LLM_PROVIDER || 'default',
        timeoutMs: promptTimeoutMs,
      });

      const promptResult = await withTimeout(
        (signal) =>
          interviewPromptAgent.execute(
            {
              jobTitle: (metadata.jobTitle as string) || 'the position',
              language: (metadata.language as string) || 'en',
              jobDescription: (metadata.jobDescription as string) || undefined,
              requirements: job?.requirements as any || undefined,
              hardRequirements: job?.hardRequirements || undefined,
              qualifications: job?.qualifications || undefined,
              companyName: (metadata.companyName as string) || undefined,
              interviewRequirements: job?.interviewRequirements || undefined,
              evaluationRules: job?.evaluationRules || undefined,
              resumeText: (metadata.resumeText as string) || undefined,
              interviewDuration: job?.interviewDuration || undefined,
              passingScore: job?.passingScore || undefined,
            },
            undefined,
            `prompt-gen-${interview.id}`,
            undefined,
            promptModel,
            signal,
            promptProvider,
          ),
        promptTimeoutMs,
      );
      if (promptResult?.systemPrompt) {
        metadata.instructions = promptResult.systemPrompt;
        logger.info('INTERVIEWS', 'Generated interview prompt via agent', {
          interviewId: interview.id,
          model: promptModel || process.env.LLM_MODEL || 'default',
          questionAreas: promptResult.questionAreas?.length ?? 0,
        });
      }
    } catch (err: any) {
      logger.warn('INTERVIEWS', `Prompt generation failed (using fallback): ${err.message}`, {
        interviewId: interview.id,
        model: getInterviewPromptModel() || process.env.LLM_MODEL || 'default',
      });
    }
  } else {
    metadata.instructions = config['interview.instructions'];
  }

  const agentConfig = buildAgentRuntimeConfig(config);
  if (agentConfig) {
    metadata.agentConfig = agentConfig;
  }

  const activeConfigVersion = await prisma.interviewRoomConfigVersion.findFirst({
    where: { isActive: true },
    orderBy: { versionNumber: 'desc' },
    select: {
      id: true,
      versionNumber: true,
      versionLabel: true,
      activatedAt: true,
      createdAt: true,
    },
  });
  if (activeConfigVersion) {
    metadata.configVersion = {
      id: activeConfigVersion.id,
      versionNumber: activeConfigVersion.versionNumber,
      versionLabel: activeConfigVersion.versionLabel,
      activatedAt: (activeConfigVersion.activatedAt || activeConfigVersion.createdAt).toISOString(),
    };
  }

  return metadata;
}

/**
 * Parse LLM_LIVEKIT env var (format: "provider/model" e.g. "openai/gpt-5.4" or "google/gemini-3.1-pro-preview")
 * Returns { provider, model } to bypass OpenRouter and call the provider directly.
 */
function parseLivekitLLM(): { provider: string; model: string } | null {
  const raw = (process.env.LLM_LIVEKIT || '').trim();
  if (!raw) return null;
  const slashIdx = raw.indexOf('/');
  if (slashIdx <= 0) return null;
  return {
    provider: raw.substring(0, slashIdx),
    model: raw.substring(slashIdx + 1),
  };
}

function getInterviewPromptModel(): string | undefined {
  const livekit = parseLivekitLLM();
  if (livekit) return livekit.model;

  const explicit = (process.env.INTERVIEW_PROMPT_MODEL || '').trim();
  if (explicit) return explicit;

  const fast = (process.env.LLM_FAST || '').trim();
  if (fast) return fast;

  const primary = (process.env.LLM_MODEL || '').trim();
  if (/gemini-3(?:\.1)?-pro-preview/i.test(primary)) {
    return primary.replace(/gemini-3(?:\.1)?-pro-preview/i, 'gemini-3-flash-preview');
  }

  return undefined;
}

function getInterviewPromptProvider(): string | undefined {
  const livekit = parseLivekitLLM();
  return livekit?.provider;
}

function getInterviewPromptTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.INTERVIEW_PROMPT_TIMEOUT_MS || '', 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_PROMPT_GENERATION_TIMEOUT_MS;
}

async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    operation(controller.signal).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function findInterviewForJoin(joinCode: string) {
  return prisma.interview.findFirst({
    where: {
      OR: [
        { accessToken: joinCode },
        { id: joinCode },
        {
          metadata: {
            path: ['inviteData', 'request_introduction_id'],
            equals: joinCode,
          },
        },
      ],
    },
  });
}

/**
 * GET /api/v1/interviews
 * List user's interviews with optional filters
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, page = '1', limit = '20', filterUserId, filterTeamId, sort, sortDir, search } = req.query;

    const scope = await getVisibilityScope(req.user!);
    const userFilter = await buildAdminOverrideFilter(
      scope,
      typeof filterUserId === 'string' ? filterUserId : undefined,
      typeof filterTeamId === 'string' ? filterTeamId : undefined,
    );
    const where: any = { ...userFilter };
    if (status && typeof status === 'string') {
      where.status = status;
    }
    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim();
      where.OR = [
        { candidateName: { contains: term, mode: 'insensitive' } },
        { candidateEmail: { contains: term, mode: 'insensitive' } },
        { jobTitle: { contains: term, mode: 'insensitive' } },
      ];
    }

    const ALLOWED_SORT_FIELDS: Record<string, string> = {
      scheduledAt: 'scheduledAt',
      completedAt: 'completedAt',
      candidateName: 'candidateName',
      createdAt: 'createdAt',
    };
    const sortField = ALLOWED_SORT_FIELDS[typeof sort === 'string' ? sort : ''] || 'createdAt';
    const direction = sortDir === 'asc' ? 'asc' : 'desc';

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit as string, 10)));

    const [interviews, total] = await Promise.all([
      prisma.interview.findMany({
        where,
        orderBy: { [sortField]: direction },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        include: {
          evaluation: {
            select: { id: true, overallScore: true, grade: true, verdict: true, summary: true, strengths: true, weaknesses: true, createdAt: true },
          },
        },
      }),
      prisma.interview.count({ where }),
    ]);

    const resumeIds = interviews
      .map((interview) => interview.resumeId)
      .filter((resumeId): resumeId is string => Boolean(resumeId));
    const resumes = resumeIds.length > 0
      ? await prisma.resume.findMany({
          where: { id: { in: resumeIds } },
          select: { id: true, email: true, preferences: true },
        })
      : [];
    const resumeById = new Map(resumes.map((resume) => [resume.id, resume]));

    res.json({
      success: true,
      data: interviews.map((interview) =>
        serializeInterviewForResponse(
          {
            ...interview,
            candidateEmail:
              getPreferredResumeEmail(
                interview.resumeId ? resumeById.get(interview.resumeId) : null,
              ) || interview.candidateEmail || null,
          },
          scope.isAdmin,
        ),
      ),
      meta: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err: any) {
    logger.error('INTERVIEWS', 'Failed to list interviews', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to list interviews' });
  }
});

/**
 * GET /api/v1/interviews/:id/recording-file
 * Proxy the recording through the RoboHire origin to avoid third-party browser warnings.
 */
router.get('/:id/recording-file', requireAuth, async (req, res) => {
  try {
    const scope = await getVisibilityScope(req.user!);
    const interview = await prisma.interview.findFirst({
      where: { id: req.params.id, ...buildUserIdFilter(scope) },
      select: {
        id: true,
        recordingUrl: true,
        candidateName: true,
        jobTitle: true,
      },
    });

    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    if (!interview.recordingUrl) {
      return res.status(400).json({ success: false, error: 'No recording available' });
    }

    const response = await fetch(interview.recordingUrl);
    if (!response.ok) {
      return res.status(502).json({
        success: false,
        error: `Failed to fetch recording: HTTP ${response.status}`,
      });
    }

    const contentType = resolveRecordingContentType(
      interview.recordingUrl,
      response.headers.get('content-type'),
    );
    const contentLength = response.headers.get('content-length');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${buildRecordingFileName(interview)}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    const arrayBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    logger.error('INTERVIEWS', 'Failed to proxy recording', {
      interviewId: req.params.id,
      error: err.message,
    });
    return res.status(500).json({ success: false, error: 'Failed to fetch recording' });
  }
});

/**
 * GET /api/v1/interviews/:id
 * Get interview detail
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const scope = await getVisibilityScope(req.user!);
    const interview = await prisma.interview.findFirst({
      where: { id: req.params.id, ...buildUserIdFilter(scope) },
      include: {
        evaluation: true,
        candidate: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
            hiringRequestId: true,
          },
        },
        dialogTurns: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    const resume = interview.resumeId
      ? await prisma.resume.findUnique({
          where: { id: interview.resumeId },
          select: { email: true, preferences: true },
        })
      : null;
    res.json({
      success: true,
      data: serializeInterviewForResponse(
        {
          ...interview,
          candidateEmail: getPreferredResumeEmail(resume) || interview.candidateEmail || null,
        },
        scope.isAdmin,
      ),
    });
  } catch (err: any) {
    logger.error('INTERVIEWS', 'Failed to get interview', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to get interview' });
  }
});

/**
 * POST /api/v1/interviews
 * Create/schedule a new interview
 */
router.post('/', requireAuth, async (req, res) => {
  const requestId = generateRequestId();
  try {
    const userId = req.user!.id;
    const {
      candidateName,
      candidateEmail,
      jobId,
      resumeId,
      jobTitle,
      jobDescription,
      resumeText,
      type = 'ai_video',
      scheduledAt,
    } = req.body;

    if (!candidateName) {
      return res.status(400).json({ success: false, error: 'candidateName is required' });
    }

    // If jobId provided, fetch job details
    let jd = jobDescription;
    let jt = jobTitle;
    if (jobId) {
      const job = await prisma.job.findFirst({ where: { id: jobId, userId } });
      if (job) {
        jd = jd || job.description;
        jt = jt || job.title;
      }
    }

    // If resumeId provided, fetch resume text
    let rt = resumeText;
    let resolvedCandidateEmail = candidateEmail?.trim() || null;
    if (resumeId) {
      const resume = await prisma.resume.findFirst({
        where: { id: resumeId, userId },
        select: {
          resumeText: true,
          email: true,
          preferences: true,
        },
      });
      if (resume) {
        rt = rt || resume.resumeText;
        resolvedCandidateEmail = resolvedCandidateEmail || getPreferredResumeEmail(resume);
      }
    }

    const accessToken = crypto.randomBytes(32).toString('hex');

    const interview = await prisma.interview.create({
      data: {
        userId,
        jobId: jobId || null,
        resumeId: resumeId || null,
        candidateName,
        candidateEmail: resolvedCandidateEmail,
        jobTitle: jt || null,
        jobDescription: jd || null,
        resumeText: rt || null,
        type,
        status: 'scheduled',
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        accessToken,
      },
    });

    logger.info('INTERVIEWS', `Interview created for ${candidateName}`, { requestId, interviewId: interview.id });

    res.status(201).json({ success: true, data: interview });
  } catch (err: any) {
    logger.error('INTERVIEWS', 'Failed to create interview', { requestId, error: err.message });
    res.status(500).json({ success: false, error: 'Failed to create interview' });
  }
});

/**
 * PATCH /api/v1/interviews/:id
 * Update interview status or details
 */
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { status, transcript, duration, recordingUrl } = req.body;

    const existing = await prisma.interview.findFirst({ where: { id, userId } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    const data: any = {};
    if (status) {
      data.status = status;
      if (status === 'in_progress' && !existing.startedAt) data.startedAt = new Date();
      if (status === 'completed' && !existing.completedAt) data.completedAt = new Date();
    }
    if (duration !== undefined) data.duration = duration;
    if (recordingUrl !== undefined) data.recordingUrl = recordingUrl;

    const updated = await prisma.$transaction(async (tx) => {
      const transcriptUpdate = await syncInterviewTranscriptArtifacts(tx, existing, transcript);

      return tx.interview.update({
        where: { id },
        data: {
          ...data,
          ...transcriptUpdate,
        },
        include: {
          evaluation: { select: { overallScore: true, grade: true, verdict: true } },
          candidate: {
            select: {
              id: true,
              name: true,
              email: true,
              status: true,
              hiringRequestId: true,
            },
          },
          dialogTurns: {
            orderBy: { sequence: 'asc' },
          },
        },
      });
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    logger.error('INTERVIEWS', 'Failed to update interview', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to update interview' });
  }
});

/**
 * POST /api/v1/interviews/:id/evaluate
 * Run AI evaluation on a completed interview transcript
 */
router.post('/:id/evaluate', requireAuth, async (req, res) => {
  const requestId = req.requestId || generateRequestId();
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const interview = await prisma.interview.findFirst({ where: { id, userId } });
    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    if (!interview.transcript) {
      return res.status(400).json({ success: false, error: 'No transcript to evaluate' });
    }

    const transcriptText = Array.isArray(interview.transcript)
      ? (interview.transcript as any[]).map((t: any) => `${t.role}: ${t.content}`).join('\n')
      : JSON.stringify(interview.transcript);

    const evaluationAgent = new EvaluationAgent();
    const evalResult = await evaluationAgent.execute(
      {
        interviewScript: transcriptText,
        jd: interview.jobDescription || '',
        resume: interview.resumeText || '',
      },
      undefined,
      requestId
    );

    const overallScore = (evalResult as any)?.overallScore ?? null;
    const grade = (evalResult as any)?.grade ?? null;
    const verdict = (evalResult as any)?.verdict ?? null;
    const summary = (evalResult as any)?.summary ?? null;
    const strengths = (evalResult as any)?.strengths ?? null;
    const weaknesses = (evalResult as any)?.weaknesses ?? null;

    const evaluation = await prisma.interviewEvaluation.upsert({
      where: { interviewId: id },
      update: {
        overallScore,
        grade,
        verdict,
        evaluationData: evalResult as any,
        summary,
        strengths,
        weaknesses,
      },
      create: {
        interviewId: id,
        overallScore,
        grade,
        verdict,
        evaluationData: evalResult as any,
        summary,
        strengths,
        weaknesses,
      },
    });

    logger.info('INTERVIEWS', `Evaluation completed for interview ${id}`, { requestId });

    res.json({ success: true, data: evaluation });
  } catch (err: any) {
    logger.error('INTERVIEWS', 'Failed to evaluate interview', { requestId, error: err.message });
    res.status(500).json({ success: false, error: 'Failed to evaluate interview' });
  }
});

/**
 * POST /api/v1/interviews/:id/fetch-gohire-data
 * Fetch video URL, resume URL, and transcript from GoHire API using stored request_introduction_id
 */
router.post('/:id/fetch-gohire-data', requireAuth, async (req, res) => {
  const requestId = req.requestId || generateRequestId();
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const interview = await prisma.interview.findFirst({ where: { id, userId } });
    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    // Extract request_introduction_id from metadata
    const metadata = interview.metadata as any;
    const requestIntroductionId =
      metadata?.inviteData?.request_introduction_id ||
      metadata?.request_introduction_id;

    if (!requestIntroductionId || requestIntroductionId.startsWith('local_')) {
      return res.status(400).json({
        success: false,
        error: 'No valid GoHire request_introduction_id found for this interview',
      });
    }

    const gohireBaseUrl = 'https://report-agent.gohire.top/gohire-data/gohireApi';

    // Fetch video/resume URLs and dialog transcript in parallel
    const [chatLogsRes, chatDialogRes] = await Promise.all([
      fetch(`${gohireBaseUrl}/chat_logs?request_introduction_id=${requestIntroductionId}`).then(r => r.json()) as Promise<any>,
      fetch(`${gohireBaseUrl}/chat_dialog?request_introduction_id=${requestIntroductionId}`).then(r => r.json()) as Promise<any>,
    ]);

    const videoUrl = chatLogsRes?.data?.[0]?.video_url || null;
    const resumeUrl = chatLogsRes?.data?.[0]?.resume_url || null;
    const logId = chatLogsRes?.data?.[0]?.log_id || chatDialogRes?.log_id || null;

    // Transform dialog into transcript format
    const dialog = chatDialogRes?.dialog || [];
    const transcript = dialog.map((turn: any) => ([
      { role: 'interviewer', content: turn.question, timestamp: turn.created_at },
      { role: 'candidate', content: turn.answer, timestamp: turn.created_at, userTime: turn.user_time },
    ])).flat().filter((t: any) => t.content);

    // Update interview record
    const updated = await prisma.interview.update({
      where: { id },
      data: {
        recordingUrl: videoUrl,
        transcript: transcript.length > 0 ? transcript : undefined,
        status: transcript.length > 0 ? 'completed' : interview.status,
        completedAt: transcript.length > 0 && !interview.completedAt ? new Date() : undefined,
        metadata: {
          ...metadata,
          gohireLogId: logId,
          resumeDownloadUrl: resumeUrl,
          gohireDataFetchedAt: new Date().toISOString(),
        },
      },
      include: {
        evaluation: true,
      },
    });

    logger.info('INTERVIEWS', `GoHire data fetched for interview ${id}`, {
      requestId,
      videoUrl: !!videoUrl,
      transcriptTurns: transcript.length,
      logId,
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (err: any) {
    logger.error('INTERVIEWS', 'Failed to fetch GoHire data', { requestId, error: err.message });
    res.status(500).json({ success: false, error: 'Failed to fetch GoHire data' });
  }
});

/**
 * POST /api/v1/interviews/:id/start
 * Start LiveKit room + recording for an interview
 */
router.post('/:id/start', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const interview = await prisma.interview.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }
    if (!liveKitService.isConfigured()) {
      return res.status(503).json({ success: false, error: 'LiveKit not configured' });
    }
    if (interview.status === 'in_progress') {
      return res.status(400).json({ success: false, error: 'Interview already in progress' });
    }

    // Load interview config from AppConfig
    const configRows = await prisma.appConfig.findMany({
      where: { key: { startsWith: 'interview.' } },
    });
    const config: Record<string, string> = {};
    for (const row of configRows) {
      config[row.key] = row.value;
    }

    const roomName = `interview-${interview.id}`;
    const metadata = await buildRoomMetadata(interview, config);

    // Create room with agent dispatch
    const agentName = config['interview.agentName'] || 'RoboHire-1';
    await liveKitService.createRoom(interview.id, metadata, agentName);

    // Start recording
    let egressId: string | undefined;
    try {
      const egress = await liveKitService.startRecording(roomName);
      egressId = egress.egressId;
    } catch (err: any) {
      logger.warn('INTERVIEWS', `Recording start failed (non-fatal): ${err.message}`);
    }

    // Update interview record
    const updated = await prisma.interview.update({
      where: { id: interview.id },
      data: {
        status: 'in_progress',
        roomId: roomName,
        startedAt: new Date(),
        metadata: { ...(interview.metadata as any || {}), egressId, generatedPrompt: metadata.instructions || null },
      },
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    logger.error('INTERVIEWS', 'Failed to start interview', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to start interview' });
  }
});

/**
 * POST /api/v1/interviews/:id/end
 * Stop recording + close LiveKit room
 */
router.post('/:id/end', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const interview = await prisma.interview.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    const meta = (interview.metadata as any) || {};

    // Stop recording if active
    let recordingUrl: string | undefined;
    if (meta.egressId) {
      try {
        const egress = await liveKitService.stopRecording(meta.egressId);
        const fileResults = (egress as any).fileResults;
        if (fileResults && fileResults.length > 0) {
          recordingUrl = fileResults[0].filename || fileResults[0].location;
        }
      } catch (err: any) {
        logger.warn('INTERVIEWS', `Recording stop failed: ${err.message}`);
      }
    }

    // Delete room
    if (interview.roomId) {
      await liveKitService.deleteRoom(interview.roomId);
    }

    const startedAt = interview.startedAt || interview.createdAt;
    const duration = Math.round((Date.now() - startedAt.getTime()) / 1000);
    const tooShort = duration < MIN_INTERVIEW_DURATION_SECONDS;

    const updated = await prisma.interview.update({
      where: { id: interview.id },
      data: {
        status: tooShort ? 'in_progress' : 'completed',
        completedAt: tooShort ? undefined : new Date(),
        duration,
        recordingUrl: recordingUrl || interview.recordingUrl,
      },
    });

    if (tooShort) {
      logger.warn('INTERVIEWS', `Interview too short to complete (${duration}s < ${MIN_INTERVIEW_DURATION_SECONDS}s)`, { interviewId: interview.id });
    }

    res.json({ success: true, data: updated });
  } catch (err: any) {
    logger.error('INTERVIEWS', 'Failed to end interview', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to end interview' });
  }
});

/**
 * GET /api/v1/interviews/join/:accessToken
 * Public endpoint — candidate uses accessToken or a legacy invite code to get LiveKit connection info
 */
router.get('/join/:accessToken', async (req, res) => {
  try {
    const interview = await findInterviewForJoin(req.params.accessToken);
    if (!interview) {
      return res.status(404).json({ success: false, error: 'Invalid interview link' });
    }
    if (interview.status === 'cancelled') {
      return res.status(410).json({ success: false, error: 'Interview has been cancelled' });
    }
    if (!liveKitService.isConfigured()) {
      return res.status(503).json({ success: false, error: 'LiveKit not configured' });
    }

    let roomName = interview.roomId || `interview-${interview.id}`;

    // Allow retaking completed / in_progress interviews — clean up old session and reset
    if (interview.status === 'completed' || interview.status === 'in_progress') {
      const oldMeta = (interview.metadata as any) || {};

      // Stop old recording if still active
      if (oldMeta.egressId) {
        try { await liveKitService.stopRecording(oldMeta.egressId); } catch { /* already stopped */ }
      }

      // Delete old room if it exists
      if (interview.roomId) {
        try { await liveKitService.deleteRoom(interview.roomId); } catch { /* already gone */ }
      }

      // Preserve non-session metadata (e.g. livekitUsage history) but clear session-specific fields
      const { egressId: _e, generatedPrompt: _g, ...preservedMeta } = oldMeta;

      await prisma.interview.update({
        where: { id: interview.id },
        data: {
          status: 'scheduled',
          roomId: null,
          startedAt: null,
          completedAt: null,
          duration: null,
          metadata: preservedMeta,
        },
      });
      (interview as any).status = 'scheduled';
      (interview as any).roomId = null;
      logger.info('INTERVIEWS', `Interview reset for retake`, { interviewId: interview.id });
    }

    // Auto-start: create room and dispatch agent if interview hasn't been started yet
    if (interview.status === 'scheduled') {
      const configRows = await prisma.appConfig.findMany({
        where: { key: { startsWith: 'interview.' } },
      });
      const config: Record<string, string> = {};
      for (const row of configRows) {
        config[row.key] = row.value;
      }

      roomName = `interview-${interview.id}`;
      const metadata = await buildRoomMetadata(interview, config);

      const agentName = config['interview.agentName'] || 'RoboHire-1';
      await liveKitService.createRoom(interview.id, metadata, agentName);

      // Start recording (non-fatal)
      let egressId: string | undefined;
      try {
        const egress = await liveKitService.startRecording(roomName);
        egressId = egress.egressId;
      } catch (err: any) {
        logger.warn('INTERVIEWS', `Recording start failed (non-fatal): ${err.message}`);
      }

      await prisma.interview.update({
        where: { id: interview.id },
        data: {
          status: 'in_progress',
          roomId: roomName,
          startedAt: new Date(),
          metadata: { ...(interview.metadata as any || {}), egressId, generatedPrompt: metadata.instructions || null },
        },
      });

      logger.info('INTERVIEWS', `Auto-started interview on candidate join`, { interviewId: interview.id, roomName });
    }

    // Generate participant token for the candidate
    const participantToken = await liveKitService.generateToken(
      roomName,
      `candidate-${interview.id}`,
      interview.candidateName,
    );

    res.json({
      success: true,
      data: {
        token: participantToken,
        wsUrl: liveKitService.wsUrl,
        roomName,
        candidateName: interview.candidateName,
        jobTitle: interview.jobTitle,
        interviewId: interview.id,
        status: 'in_progress',
      },
    });
  } catch (err: any) {
    logger.error('INTERVIEWS', 'Failed to join interview', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to join interview' });
  }
});

/**
 * POST /api/v1/interviews/finalize/:accessToken
 * Public endpoint — candidate signals interview ended; stops recording + marks completed.
 */
router.post('/finalize/:accessToken', async (req, res) => {
  try {
    const interview = await findInterviewForJoin(req.params.accessToken);
    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }
    if (interview.status === 'completed' || interview.status === 'cancelled') {
      return res.json({ success: true, data: { alreadyFinalized: true } });
    }

    const meta = (interview.metadata as any) || {};

    // Stop recording if active
    let recordingUrl: string | undefined;
    if (meta.egressId && liveKitService.isConfigured()) {
      try {
        const egress = await liveKitService.stopRecording(meta.egressId);
        const fileResults = (egress as any).fileResults;
        if (fileResults && fileResults.length > 0) {
          recordingUrl = fileResults[0].filename || fileResults[0].location;
        }
      } catch (err: any) {
        logger.warn('INTERVIEWS', `Recording stop failed: ${err.message}`);
      }
    }

    // Delete room
    if (interview.roomId && liveKitService.isConfigured()) {
      await liveKitService.deleteRoom(interview.roomId);
    }

    const startedAt = interview.startedAt || interview.createdAt;
    const duration = Math.round((Date.now() - startedAt.getTime()) / 1000);
    const tooShort = duration < MIN_INTERVIEW_DURATION_SECONDS;

    const updated = await prisma.interview.update({
      where: { id: interview.id },
      data: {
        status: tooShort ? 'in_progress' : 'completed',
        completedAt: tooShort ? undefined : new Date(),
        duration,
        recordingUrl: recordingUrl || interview.recordingUrl || null,
      },
    });

    logger.info('INTERVIEWS', `Interview finalized via candidate disconnect${tooShort ? ' (too short, kept in_progress)' : ''}`, {
      interviewId: interview.id,
      duration,
      hasRecording: !!recordingUrl,
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    logger.error('INTERVIEWS', 'Failed to finalize interview', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to finalize interview' });
  }
});

/**
 * POST /api/v1/interviews/:id/transcript
 * Agent posts transcript data back to the server
 */
router.post('/:id/transcript', async (req, res) => {
  try {
    const { transcript, apiKey, usage } = req.body;

    // Simple API key check for agent → backend communication
    const expectedKey = process.env.LIVEKIT_API_KEY;
    if (!apiKey || apiKey !== expectedKey) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const interview = await prisma.interview.findUnique({
      where: { id: req.params.id },
    });
    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    const normalizedUsage = normalizeWorkerUsagePayload(usage);
    const existingMetadata = isRecord(interview.metadata) ? interview.metadata : {};
    const nextMetadata: Record<string, unknown> = { ...existingMetadata };
    const llmEstimatedUsd = normalizedUsage?.llm
      ? logger.calculateCost(
          normalizedUsage.llm.model || 'default',
          normalizedUsage.llm.promptTokens ?? 0,
          normalizedUsage.llm.completionTokens ?? 0,
        )
      : 0;
    const enrichedUsage = normalizedUsage
      ? {
          ...normalizedUsage,
          llm: normalizedUsage.llm
            ? {
                ...normalizedUsage.llm,
                estimatedCostUsd: llmEstimatedUsd,
              }
            : undefined,
          costs: {
            llmEstimatedUsd,
            sttEstimatedUsd: normalizedUsage.costs?.sttEstimatedUsd ?? null,
            ttsEstimatedUsd: normalizedUsage.costs?.ttsEstimatedUsd ?? null,
            totalEstimatedUsd: Number(
              (
                llmEstimatedUsd +
                (normalizedUsage.costs?.sttEstimatedUsd ?? 0) +
                (normalizedUsage.costs?.ttsEstimatedUsd ?? 0)
              ).toFixed(6),
            ),
            costSource: normalizedUsage.costs?.costSource || 'llm_estimated_only',
            notes:
              normalizedUsage.costs?.notes ||
              'LLM cost is estimated from token usage. STT/TTS pricing is not configured in the app yet.',
          },
        }
      : null;

    if (enrichedUsage) {
      nextMetadata.livekitUsage = {
        ...enrichedUsage,
        llmCalls: enrichedUsage.llmMetrics?.length ?? 0,
        receivedAt: new Date().toISOString(),
      };

      logger.info('INTERVIEWS', 'Saved LiveKit interview session record', {
        interviewId: interview.id,
        transcriptEntries: Array.isArray(transcript) ? transcript.length : 0,
        usageRecord: nextMetadata.livekitUsage as Record<string, unknown>,
      });
    }

    let livekitUsageRequestLogId: string | null = null;
    const hasLoggedUsage = typeof existingMetadata.livekitUsageLoggedAt === 'string';
    const llmTotals = enrichedUsage?.llm;
    const llmMetrics = enrichedUsage?.llmMetrics ?? [];
    const shouldLogUsage = !hasLoggedUsage && (!!enrichedUsage || Array.isArray(transcript));

    if (shouldLogUsage) {
      const usageRequestId = `livekit-${interview.id}`;
      const llmCallCount = Math.max(llmTotals?.calls ?? 0, llmMetrics.length);
      const usageCost = enrichedUsage?.costs?.totalEstimatedUsd ?? 0;
      const usageDurationMs = Math.max(
        enrichedUsage?.operational?.sessionDurationMs ?? 0,
        llmTotals?.totalDurationMs ?? 0,
        enrichedUsage?.stt?.totalDurationMs ?? 0,
        enrichedUsage?.tts?.totalDurationMs ?? 0,
        0,
      );
      const llmProvider = llmTotals?.provider || enrichedUsage?.sessionConfig?.llm?.provider || null;
      const llmModel = llmTotals?.model || enrichedUsage?.sessionConfig?.llm?.model || null;

      const requestLog = await prisma.apiRequestLog.create({
        data: {
          requestId: usageRequestId,
          userId: interview.userId,
          endpoint: LIVEKIT_USAGE_ENDPOINT,
          method: 'POST',
          module: LIVEKIT_USAGE_MODULE,
          apiName: LIVEKIT_USAGE_API_NAME,
          statusCode: 200,
          durationMs: usageDurationMs,
          promptTokens: llmTotals?.promptTokens ?? 0,
          completionTokens: llmTotals?.completionTokens ?? 0,
          totalTokens: llmTotals?.totalTokens ?? 0,
          llmCalls: llmCallCount,
          cost: usageCost,
          provider: llmProvider,
          model: llmModel,
          userAgent: 'livekit-agent',
          requestPayload: {
            interviewId: interview.id,
            candidateName: interview.candidateName,
            jobTitle: interview.jobTitle,
            usage: enrichedUsage,
          } as Prisma.InputJsonValue,
          responsePayload: {
            transcriptEntries: Array.isArray(transcript) ? transcript.length : null,
            candidateTurns: enrichedUsage?.operational?.candidateTurns ?? null,
            interviewerTurns: enrichedUsage?.operational?.interviewerTurns ?? null,
            closeReason: enrichedUsage?.operational?.closeReason ?? null,
            source: 'livekit-worker',
            savedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });

      livekitUsageRequestLogId = requestLog.id;

      if (llmMetrics.length > 0) {
        const promptMessages = enrichedUsage?.promptContext?.instructions
          ? [
              {
                role: 'system',
                content: [
                  {
                    type: 'text',
                    text: enrichedUsage.promptContext.instructions,
                  },
                ],
              },
              ...(enrichedUsage.promptContext.greeting
                ? [
                    {
                      role: 'assistant',
                      content: [
                        {
                          type: 'text',
                          text: enrichedUsage.promptContext.greeting,
                        },
                      ],
                    },
                  ]
                : []),
            ]
          : undefined;

        await prisma.lLMCallLog.createMany({
          data: llmMetrics.map((metric) => ({
            requestId: usageRequestId,
            apiRequestLogId: requestLog.id,
            userId: interview.userId,
            endpoint: LIVEKIT_USAGE_ENDPOINT,
            module: LIVEKIT_USAGE_MODULE,
            status: 'success',
            provider: llmProvider || 'unknown',
            model: llmModel || 'unknown',
            promptTokens: metric.promptTokens ?? 0,
            completionTokens: metric.completionTokens ?? 0,
            totalTokens: metric.totalTokens ?? 0,
            cost: logger.calculateCost(
              llmModel || 'default',
              metric.promptTokens ?? 0,
              metric.completionTokens ?? 0,
            ),
            durationMs: metric.durationMs ?? 0,
            requestMessages: promptMessages,
            requestOptions: enrichedUsage?.promptContext
              ? Object.fromEntries(
                  Object.entries({
                    source: 'livekit-agent',
                    language: enrichedUsage.promptContext.language,
                    candidateName: enrichedUsage.promptContext.candidateName,
                    jobTitle: enrichedUsage.promptContext.jobTitle,
                    llmProvider,
                    llmModel,
                    sttModel: enrichedUsage.sessionConfig?.stt?.model,
                    ttsModel: enrichedUsage.sessionConfig?.tts?.model,
                    ttsVoiceId: enrichedUsage.sessionConfig?.tts?.voiceId,
                    turnDetection: enrichedUsage.sessionConfig?.turnDetection,
                    configVersionId: enrichedUsage.sessionConfig?.configVersionId,
                    configVersionNumber: enrichedUsage.sessionConfig?.configVersionNumber,
                    configVersionLabel: enrichedUsage.sessionConfig?.configVersionLabel,
                    allowInterruptions: enrichedUsage.sessionConfig?.allowInterruptions,
                    preemptiveGeneration: enrichedUsage.sessionConfig?.preemptiveGeneration,
                    minInterruptionDurationMs:
                      enrichedUsage.sessionConfig?.minInterruptionDurationMs,
                    minInterruptionWords: enrichedUsage.sessionConfig?.minInterruptionWords,
                    minEndpointingDelayMs: enrichedUsage.sessionConfig?.minEndpointingDelayMs,
                    maxEndpointingDelayMs: enrichedUsage.sessionConfig?.maxEndpointingDelayMs,
                    aecWarmupDurationMs: enrichedUsage.sessionConfig?.aecWarmupDurationMs,
                    useTtsAlignedTranscript:
                      enrichedUsage.sessionConfig?.useTtsAlignedTranscript,
                    logInterimTranscripts:
                      enrichedUsage.sessionConfig?.logInterimTranscripts,
                  }).filter(([, value]) => value !== undefined)
                )
              : undefined,
          })),
        });
      }

      nextMetadata.livekitUsageLoggedAt = new Date().toISOString();
      nextMetadata.livekitUsageRequestLogId = requestLog.id;

      logger.info('INTERVIEWS', 'Logged LiveKit interview usage', {
        interviewId: interview.id,
        requestLogId: requestLog.id,
        totalTokens: llmTotals?.totalTokens ?? 0,
        llmCalls: llmCallCount,
        totalEstimatedUsd: usageCost,
      });
    }

    const updateData: Record<string, unknown> = {};
    if (Object.keys(nextMetadata).length > 0 || livekitUsageRequestLogId) {
      updateData.metadata = nextMetadata;
    }

    // Mark interview as completed when transcript arrives (if not already completed/cancelled).
    // Receiving transcript data from the LiveKit agent is strong evidence the interview concluded.
    const statusNeedsUpdate =
      interview.status === 'scheduled' || interview.status === 'in_progress';
    if (statusNeedsUpdate) {
      updateData.status = 'completed';
      updateData.completedAt = interview.completedAt || new Date();
      if (interview.startedAt) {
        updateData.duration = Math.round(
          (Date.now() - interview.startedAt.getTime()) / 1000,
        );
      }
      logger.info('INTERVIEWS', 'Marking interview completed via transcript receipt', {
        interviewId: interview.id,
        previousStatus: interview.status,
      });
    }

    await prisma.$transaction(async (tx) => {
      const transcriptUpdate = await syncInterviewTranscriptArtifacts(tx, interview, transcript);
      const nextUpdateData = {
        ...updateData,
        ...transcriptUpdate,
      };

      if (Object.keys(nextUpdateData).length > 0) {
        await tx.interview.update({
          where: { id: interview.id },
          data: nextUpdateData,
        });
      }
    });

    if (transcript !== undefined) {
      logger.info('INTERVIEWS', 'Saved interview dialog turns', {
        interviewId: interview.id,
        transcriptEntries: Array.isArray(transcript) ? transcript.length : null,
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    logger.error('INTERVIEWS', 'Failed to save transcript', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to save transcript' });
  }
});

/**
 * DELETE /api/v1/interviews/:id
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const existing = await prisma.interview.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }
    await prisma.interview.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) {
    logger.error('INTERVIEWS', 'Failed to delete interview', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to delete interview' });
  }
});

export default router;
