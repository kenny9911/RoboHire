import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  LiveKitRoom,
  VideoTrack,
  useLocalParticipant,
  useTracks,
  RoomAudioRenderer,
  BarVisualizer,
  useVoiceAssistant,
  VoiceAssistantControlBar,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track } from 'livekit-client';
import type { AgentState } from '@livekit/components-react';
import { useTranslation } from 'react-i18next';
import { API_BASE } from '../config';
import SEO from '../components/SEO';

interface JoinData {
  token: string;
  wsUrl: string;
  roomName: string;
  candidateName: string;
  jobTitle: string;
  interviewId: string;
  status: string;
}

type PageState = 'loading' | 'pre-join' | 'connected' | 'ended' | 'error';

export default function InterviewRoom() {
  const { accessToken } = useParams<{ accessToken: string }>();
  const { t } = useTranslation();
  const [state, setState] = useState<PageState>('loading');
  const [joinData, setJoinData] = useState<JoinData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!accessToken) {
      setError('Invalid interview link');
      setState('error');
      return;
    }

    fetch(`${API_BASE}/api/v1/interviews/join/${accessToken}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to load interview');
        }
        setJoinData(data.data);
        setState('pre-join');
      })
      .catch((err) => {
        setError(err.message);
        setState('error');
      });
  }, [accessToken]);

  const handleJoin = useCallback(() => {
    setState('connected');
  }, []);

  const handleDisconnect = useCallback(() => {
    setState('ended');
  }, []);

  return (
    <>
      <SEO title={t('interview.title', 'AI Interview')} noIndex />
      <div className="min-h-screen bg-gray-950 text-white">
        {state === 'loading' && <LoadingScreen />}
        {state === 'error' && <ErrorScreen message={error} />}
        {state === 'pre-join' && joinData && (
          <PreJoinScreen joinData={joinData} onJoin={handleJoin} />
        )}
        {state === 'connected' && joinData && (
          <LiveKitRoom
            serverUrl={joinData.wsUrl}
            token={joinData.token}
            connect={true}
            audio={true}
            video={true}
            onDisconnected={handleDisconnect}
            className="h-screen"
            data-lk-theme="default"
          >
            <AgentInterviewView candidateName={joinData.candidateName} jobTitle={joinData.jobTitle} />
            <RoomAudioRenderer />
          </LiveKitRoom>
        )}
        {state === 'ended' && <ThankYouScreen candidateName={joinData?.candidateName} />}
      </div>
    </>
  );
}

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-500" />
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <div className="text-6xl">⚠️</div>
      <h1 className="text-2xl font-bold">{t('interview.error', 'Unable to Join')}</h1>
      <p className="text-gray-400">{message}</p>
    </div>
  );
}

function PreJoinScreen({ joinData, onJoin }: { joinData: JoinData; onJoin: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-8 px-4">
      <div className="text-center">
        <h1 className="mb-2 text-3xl font-bold">{t('interview.title', 'AI Interview')}</h1>
        {joinData.jobTitle && (
          <p className="text-lg text-gray-300">{joinData.jobTitle}</p>
        )}
        <p className="mt-1 text-gray-400">
          {t('interview.welcome', 'Welcome, {{name}}', { name: joinData.candidateName })}
        </p>
      </div>

      <div className="w-full max-w-md rounded-xl bg-gray-800/50 p-6">
        <h2 className="mb-4 text-lg font-semibold">{t('interview.beforeYouStart', 'Before you start')}</h2>
        <ul className="space-y-3 text-sm text-gray-300">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-green-400">✓</span>
            {t('interview.checkMic', 'Make sure your microphone is working')}
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-green-400">✓</span>
            {t('interview.checkCamera', 'Ensure your camera is on and well-lit')}
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-green-400">✓</span>
            {t('interview.quietPlace', 'Find a quiet place with stable internet')}
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-green-400">✓</span>
            {t('interview.speakNaturally', 'Speak clearly and naturally')}
          </li>
        </ul>
      </div>

      <button
        onClick={onJoin}
        className="rounded-xl bg-blue-600 px-8 py-3 text-lg font-semibold transition-colors hover:bg-blue-500"
      >
        {t('interview.joinButton', 'Join Interview')}
      </button>
    </div>
  );
}

/* ─── Agent State Labels ─── */
const AGENT_STATE_LABELS: Record<AgentState, string> = {
  disconnected: 'videoInterview.agentDisconnected',
  connecting: 'videoInterview.agentConnecting',
  'pre-connect-buffering': 'videoInterview.agentConnecting',
  initializing: 'videoInterview.agentInitializing',
  idle: 'videoInterview.agentListening',
  listening: 'videoInterview.agentListening',
  thinking: 'videoInterview.agentThinking',
  speaking: 'videoInterview.agentSpeaking',
  failed: 'videoInterview.agentFailed',
};

const AGENT_STATE_COLORS: Record<string, string> = {
  listening: 'text-green-400',
  thinking: 'text-yellow-400',
  speaking: 'text-blue-400',
  connecting: 'text-gray-400',
  'pre-connect-buffering': 'text-gray-400',
  initializing: 'text-gray-400',
  idle: 'text-green-400',
  disconnected: 'text-red-400',
  failed: 'text-red-400',
};

function AgentInterviewView({ candidateName, jobTitle }: { candidateName: string; jobTitle: string }) {
  const { t } = useTranslation();
  const { localParticipant } = useLocalParticipant();
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: true });
  const { state, audioTrack, agentTranscriptions } = useVoiceAssistant();
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const localVideoTrack = tracks.find(
    (tr) => tr.participant.sid === localParticipant.sid && tr.source === Track.Source.Camera,
  );

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentTranscriptions]);

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-3 py-2 sm:px-6 sm:py-3">
        <div>
          <h2 className="truncate text-sm font-semibold sm:text-base">
            {t('interview.inProgress', 'Interview in Progress')}
          </h2>
          {jobTitle && <p className="text-xs text-gray-400 sm:text-sm">{jobTitle}</p>}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400 sm:text-sm">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          <span className="hidden sm:inline">{t('interview.recording', 'Recording')}</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Left: Agent visualizer + self video */}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 sm:p-6">
          <div className="flex w-full max-w-md flex-col items-center gap-3">
            <div className="relative flex h-40 w-full items-center justify-center rounded-2xl border border-gray-700 bg-gray-800/50 sm:h-56">
              <BarVisualizer
                state={state}
                track={audioTrack}
                barCount={7}
                className="h-24 w-48 sm:h-32 sm:w-64"
                style={{
                  gap: '6px',
                  '--lk-fg': state === 'speaking' ? '#3b82f6' : state === 'listening' ? '#22c55e' : '#6b7280',
                } as React.CSSProperties}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${
                state === 'speaking' ? 'bg-blue-400 animate-pulse' :
                state === 'listening' ? 'bg-green-400' :
                state === 'thinking' ? 'bg-yellow-400 animate-pulse' :
                'bg-gray-500'
              }`} />
              <span className={`text-sm font-medium ${AGENT_STATE_COLORS[state] || 'text-gray-400'}`}>
                {t(AGENT_STATE_LABELS[state], state)}
              </span>
            </div>
          </div>

          <div className="relative h-28 w-40 overflow-hidden rounded-xl border border-gray-700 bg-gray-800 sm:h-36 sm:w-48">
            {localVideoTrack ? (
              <VideoTrack trackRef={localVideoTrack} className="h-full w-full object-cover" style={{ transform: 'scaleX(-1)' }} />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-500">
                <div className="text-center">
                  <svg className="mx-auto mb-1 h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                  <p className="text-xs">{t('interview.cameraOff', 'Camera Off')}</p>
                </div>
              </div>
            )}
            <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-xs">
              {candidateName}
            </div>
          </div>
        </div>

        {/* Right: Live Transcript */}
        <div className="flex w-full flex-col border-t border-gray-800 lg:w-80 lg:border-l lg:border-t-0 xl:w-96">
          <div className="flex items-center gap-2 border-b border-gray-800 bg-gray-900/50 px-4 py-2">
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
            <span className="text-sm font-medium text-gray-300">
              {t('videoInterview.transcript', 'Transcript')}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 max-h-48 lg:max-h-none">
            {agentTranscriptions.length === 0 && (
              <p className="text-center text-xs text-gray-500 py-8">
                {t('videoInterview.transcriptEmpty', 'Transcript will appear here as the interview progresses...')}
              </p>
            )}
            {agentTranscriptions.map((seg, i) => (
              <div key={`${seg.id}-${i}`} className="flex gap-2 text-sm">
                <span className="shrink-0 font-medium text-blue-400">
                  {t('videoInterview.aiInterviewer', 'AI Interviewer')}:
                </span>
                <span className="text-gray-200">{seg.text}</span>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="border-t border-gray-800 bg-gray-900 p-2 sm:p-4">
        <VoiceAssistantControlBar />
      </div>
    </div>
  );
}

function ThankYouScreen({ candidateName }: { candidateName?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="text-6xl">🎉</div>
      <h1 className="text-3xl font-bold">{t('interview.thankYou', 'Thank You!')}</h1>
      <p className="max-w-md text-center text-gray-300">
        {t(
          'interview.thankYouMessage',
          'Thank you{{name}} for completing the interview. Our team will review your responses and get back to you soon.',
          { name: candidateName ? `, ${candidateName},` : '' },
        )}
      </p>
      <a
        href="/"
        className="mt-4 rounded-lg bg-gray-800 px-6 py-2 text-sm transition-colors hover:bg-gray-700"
      >
        {t('interview.backToHome', 'Back to Home')}
      </a>
    </div>
  );
}
