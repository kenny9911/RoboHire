import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  LiveKitRoom,
  VideoTrack,
  useLocalParticipant,
  useRemoteParticipants,
  useTracks,
  RoomAudioRenderer,
  ControlBar,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track } from 'livekit-client';
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
            onDisconnected={handleDisconnect}
            className="h-screen"
            data-lk-theme="default"
          >
            <InterviewView candidateName={joinData.candidateName} jobTitle={joinData.jobTitle} />
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

function InterviewView({ candidateName, jobTitle }: { candidateName: string; jobTitle: string }) {
  const { t } = useTranslation();
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: true });

  const localVideoTrack = tracks.find(
    (tr) => tr.participant.sid === localParticipant.sid && tr.source === Track.Source.Camera,
  );

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-6 py-3">
        <div>
          <h2 className="font-semibold">{t('interview.inProgress', 'Interview in Progress')}</h2>
          {jobTitle && <p className="text-sm text-gray-400">{jobTitle}</p>}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          {t('interview.recording', 'Recording')}
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 items-center justify-center gap-8 p-8">
        {/* AI Interviewer indicator */}
        <div className="flex h-64 w-64 flex-col items-center justify-center rounded-2xl bg-gray-800/50 border border-gray-700">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-3xl">
            🤖
          </div>
          <p className="font-medium">{t('interview.aiInterviewer', 'AI Interviewer')}</p>
          <p className="mt-1 text-xs text-gray-400">
            {remoteParticipants.length > 0
              ? t('interview.connected', 'Connected')
              : t('interview.connecting', 'Connecting...')}
          </p>
        </div>

        {/* Candidate video */}
        <div className="relative h-64 w-80 overflow-hidden rounded-2xl bg-gray-800 border border-gray-700">
          {localVideoTrack ? (
            <VideoTrack trackRef={localVideoTrack} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-500">
              <div className="text-center">
                <div className="mb-2 text-4xl">📷</div>
                <p className="text-sm">{t('interview.cameraOff', 'Camera Off')}</p>
              </div>
            </div>
          )}
          <div className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs">
            {candidateName}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="border-t border-gray-800 bg-gray-900 p-4">
        <ControlBar variation="minimal" />
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
