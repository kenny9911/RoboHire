import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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

type PageState = 'enter-code' | 'device-preview' | 'connected' | 'ended' | 'error';

function normalizeJoinCode(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return '';

  const queryMatch = trimmed.match(/[?&](?:token|code)=([^&#]+)/i);
  if (queryMatch?.[1]) {
    return decodeURIComponent(queryMatch[1]);
  }

  try {
    const url = new URL(trimmed);
    const token = url.searchParams.get('token') || url.searchParams.get('code');
    if (token) {
      return token.trim();
    }

    if (url.pathname.startsWith('/interview/')) {
      const parts = url.pathname.split('/').filter(Boolean);
      return decodeURIComponent(parts[parts.length - 1] || '').trim();
    }
  } catch {
    // Ignore invalid URL input and treat it as a raw join code.
  }

  return trimmed;
}

export default function VideoInterview() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<PageState>('enter-code');
  const [code, setCode] = useState('');
  const [joinData, setJoinData] = useState<JoinData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Auto-fill from ?token= query param
  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      setCode(token);
      handleJoinWithCode(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleJoinWithCode = async (accessCode: string) => {
    const joinCode = normalizeJoinCode(accessCode);
    if (!joinCode) return;

    setLoading(true);
    setError('');
    setCode(joinCode);

    try {
      const res = await fetch(`${API_BASE}/api/v1/interviews/join/${encodeURIComponent(joinCode)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        const msg =
          res.status === 410
            ? t('videoInterview.interviewEnded', 'This interview has ended')
            : data.error || t('videoInterview.invalidCode', 'Invalid interview code');
        throw new Error(msg);
      }
      setJoinData(data.data);
      setState('device-preview');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitCode = (e: React.FormEvent) => {
    e.preventDefault();
    handleJoinWithCode(code);
  };

  const handleStartInterview = useCallback(() => {
    setStartTime(Date.now());
    setState('connected');
  }, []);

  const handleDisconnect = useCallback(() => {
    setState('ended');
    // Notify backend to stop recording + mark completed
    if (joinData?.interviewId && code) {
      fetch(`${API_BASE}/api/v1/interviews/finalize/${encodeURIComponent(code)}`, {
        method: 'POST',
      }).catch(() => {});
    }
  }, [joinData, code]);

  // Elapsed timer
  useEffect(() => {
    if (state !== 'connected' || !startTime) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [state, startTime]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <>
      <SEO title={t('videoInterview.title', 'Video Interview')} noIndex />
      <div className="min-h-screen bg-gray-950 text-white">
        {state === 'enter-code' && (
          <EnterCodeScreen
            code={code}
            setCode={setCode}
            onSubmit={handleSubmitCode}
            error={error}
            loading={loading}
          />
        )}
        {state === 'device-preview' && joinData && (
          <DevicePreviewScreen joinData={joinData} onStart={handleStartInterview} />
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
            <AgentInterviewView
              candidateName={joinData.candidateName}
              jobTitle={joinData.jobTitle}
              elapsed={elapsed}
              formatTime={formatTime}
            />
            <RoomAudioRenderer />
          </LiveKitRoom>
        )}
        {state === 'ended' && (
          <EndedScreen candidateName={joinData?.candidateName} elapsed={elapsed} formatTime={formatTime} />
        )}
      </div>
    </>
  );
}

/* ─── State 1: Enter Code ─── */
function EnterCodeScreen({
  code,
  setCode,
  onSubmit,
  error,
  loading,
}: {
  code: string;
  setCode: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  error: string;
  loading: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-xl font-bold">
          R
        </div>
        <span className="text-2xl font-bold tracking-tight">RoboHire</span>
      </div>

      <div className="w-full max-w-md">
        <h1 className="mb-2 text-center text-3xl font-bold">
          {t('videoInterview.enterCode', 'Join Interview')}
        </h1>
        <p className="mb-8 text-center text-gray-400">
          {t('videoInterview.enterCodeDesc', 'Enter the interview code provided by your recruiter')}
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('videoInterview.codePlaceholder', 'Paste your interview code here')}
            className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-center text-lg tracking-wider placeholder:text-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
            disabled={loading}
          />

          {error && (
            <div className="rounded-lg bg-red-900/30 border border-red-800 px-4 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!code.trim() || loading}
            className="w-full rounded-xl bg-blue-600 py-3 text-lg font-semibold transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                {t('videoInterview.connecting', 'Connecting...')}
              </span>
            ) : (
              t('videoInterview.join', 'Join')
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─── State 2: Device Preview ─── */
function DevicePreviewScreen({
  joinData,
  onStart,
}: {
  joinData: JoinData;
  onStart: () => void;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [devices, setDevices] = useState<{ cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }>({
    cameras: [],
    mics: [],
  });
  const [selectedCamera, setSelectedCamera] = useState('');
  const [selectedMic, setSelectedMic] = useState('');
  const [permissionError, setPermissionError] = useState('');
  const animFrameRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Enumerate devices and start stream
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        setStream(s);

        // Enumerate after permission granted
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const cameras = allDevices.filter((d) => d.kind === 'videoinput');
        const mics = allDevices.filter((d) => d.kind === 'audioinput');
        setDevices({ cameras, mics });
        if (cameras.length > 0) setSelectedCamera(cameras[0].deviceId);
        if (mics.length > 0) setSelectedMic(mics[0].deviceId);

        // Mic level analyser
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(s);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        function updateLevel() {
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setMicLevel(Math.min(avg / 128, 1));
          animFrameRef.current = requestAnimationFrame(updateLevel);
        }
        updateLevel();
      } catch {
        if (!cancelled) {
          setPermissionError(
            t('videoInterview.permissionDenied', 'Camera/microphone access denied. Please allow access and reload.'),
          );
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animFrameRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attach stream to video element
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Switch camera/mic
  useEffect(() => {
    if (!selectedCamera && !selectedMic) return;
    if (!stream) return;

    let cancelled = false;

    async function switchDevices() {
      // Stop old tracks
      stream!.getTracks().forEach((tr) => tr.stop());
      cancelAnimationFrame(animFrameRef.current);
      audioCtxRef.current?.close();

      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: selectedCamera ? { deviceId: { exact: selectedCamera } } : true,
          audio: selectedMic ? { deviceId: { exact: selectedMic } } : true,
        });
        if (cancelled) {
          newStream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        setStream(newStream);

        // Re-create analyser
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(newStream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        function updateLevel() {
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setMicLevel(Math.min(avg / 128, 1));
          animFrameRef.current = requestAnimationFrame(updateLevel);
        }
        updateLevel();
      } catch {
        // ignore device switch errors
      }
    }

    switchDevices();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCamera, selectedMic]);

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((tr) => tr.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = () => {
    // Stop preview stream before LiveKit takes over
    stream?.getTracks().forEach((tr) => tr.stop());
    cancelAnimationFrame(animFrameRef.current);
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
    onStart();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="mb-1 text-2xl font-bold">{joinData.jobTitle || t('videoInterview.title', 'Video Interview')}</h1>
        <p className="text-gray-400">
          {t('interview.welcome', 'Welcome, {{name}}', { name: joinData.candidateName })}
        </p>
      </div>

      <div className="flex w-full max-w-4xl flex-col items-center gap-6 lg:flex-row lg:items-start">
        {/* Camera Preview */}
        <div className="w-full max-w-lg">
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-gray-700 bg-gray-900">
            {permissionError ? (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-red-400">
                {permissionError}
              </div>
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover mirror"
                style={{ transform: 'scaleX(-1)' }}
              />
            )}
          </div>

          {/* Mic Level */}
          <div className="mt-3 flex items-center gap-3">
            <span className="text-xs text-gray-400">{t('videoInterview.micLevel', 'Mic')}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-75"
                style={{ width: `${micLevel * 100}%` }}
              />
            </div>
          </div>

          {/* Device Selectors */}
          {devices.cameras.length > 1 && (
            <div className="mt-3">
              <label className="mb-1 block text-xs text-gray-400">{t('videoInterview.camera', 'Camera')}</label>
              <select
                value={selectedCamera}
                onChange={(e) => setSelectedCamera(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {devices.cameras.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${devices.cameras.indexOf(d) + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}
          {devices.mics.length > 1 && (
            <div className="mt-3">
              <label className="mb-1 block text-xs text-gray-400">{t('videoInterview.microphone', 'Microphone')}</label>
              <select
                value={selectedMic}
                onChange={(e) => setSelectedMic(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {devices.mics.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Microphone ${devices.mics.indexOf(d) + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Checklist + Start */}
        <div className="w-full max-w-sm">
          <div className="rounded-xl bg-gray-800/50 p-6">
            <h2 className="mb-4 text-lg font-semibold">
              {t('videoInterview.readyToStart', 'Ready to start?')}
            </h2>
            <ul className="space-y-3 text-sm text-gray-300">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-green-400">&#10003;</span>
                {t('interview.checkMic', 'Make sure your microphone is working')}
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-green-400">&#10003;</span>
                {t('interview.checkCamera', 'Ensure your camera is on and well-lit')}
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-green-400">&#10003;</span>
                {t('interview.quietPlace', 'Find a quiet place with stable internet')}
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-green-400">&#10003;</span>
                {t('interview.speakNaturally', 'Speak clearly and naturally')}
              </li>
            </ul>
          </div>

          <button
            onClick={handleStart}
            disabled={!!permissionError}
            className="mt-6 w-full rounded-xl bg-blue-600 py-3 text-lg font-semibold transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('videoInterview.startInterview', 'Start Interview')}
          </button>
        </div>
      </div>
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

/* ─── State 3: Live Interview (Agent UI) ─── */
function AgentInterviewView({
  candidateName,
  jobTitle,
  elapsed,
  formatTime,
}: {
  candidateName: string;
  jobTitle: string;
  elapsed: number;
  formatTime: (s: number) => string;
}) {
  const { t } = useTranslation();
  const { localParticipant } = useLocalParticipant();
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: true });
  const { state, audioTrack, agentTranscriptions } = useVoiceAssistant();
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const localVideoTrack = tracks.find(
    (tr) => tr.participant.sid === localParticipant.sid && tr.source === Track.Source.Camera,
  );

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentTranscriptions]);

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-3 py-2 sm:px-6 sm:py-3">
        <h2 className="truncate text-sm font-semibold sm:text-base">
          {jobTitle || t('videoInterview.title', 'Video Interview')}
        </h2>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <span className="font-mono text-xs sm:text-sm text-gray-300">{formatTime(elapsed)}</span>
          <div className="flex items-center gap-1 text-xs sm:text-sm text-gray-400">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span className="hidden sm:inline">{t('videoInterview.recording', 'Recording')}</span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Left: Agent visualizer + self video */}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 sm:p-6">
          {/* Agent Audio Visualizer */}
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

            {/* Agent State Label */}
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

          {/* Self Video (PiP) */}
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

/* ─── State 4: Ended ─── */
function EndedScreen({
  candidateName,
  elapsed,
  formatTime,
}: {
  candidateName?: string;
  elapsed: number;
  formatTime: (s: number) => string;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600 text-4xl">
        &#10003;
      </div>
      <h1 className="text-3xl font-bold">{t('videoInterview.thankYou', 'Thank You!')}</h1>
      <p className="max-w-md text-center text-gray-300">
        {t(
          'videoInterview.thankYouMessage',
          'Thank you{{name}} for completing the interview. Our team will review your responses and get back to you soon.',
          { name: candidateName ? `, ${candidateName},` : '' },
        )}
      </p>
      {elapsed > 0 && (
        <p className="text-sm text-gray-400">
          {t('videoInterview.duration', 'Duration')}: {formatTime(elapsed)}
        </p>
      )}
      <a
        href="/"
        className="mt-4 rounded-lg bg-gray-800 px-6 py-2 text-sm transition-colors hover:bg-gray-700"
      >
        {t('videoInterview.backToHome', 'Back to Home')}
      </a>
    </div>
  );
}
