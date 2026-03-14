import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
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
import {
  DisconnectReason,
  Track,
  createLocalVideoTrack,
  createLocalAudioTrack,
  LocalVideoTrack,
  LocalAudioTrack,
} from 'livekit-client';
import type { AgentState } from '@livekit/components-react';
import { useTranslation } from 'react-i18next';
import { API_BASE } from '../config';
import SEO from '../components/SEO';
import { normalizeInterviewJoinCode } from '../utils/interviewJoinCode';

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
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const [state, setState] = useState<PageState>('loading');
  const [joinData, setJoinData] = useState<JoinData | null>(null);
  const [error, setError] = useState('');
  const resolvedAccessToken = normalizeInterviewJoinCode(accessToken || searchParams.get('token') || '');

  useEffect(() => {
    if (!resolvedAccessToken) {
      setError('Invalid interview link');
      setState('error');
      return;
    }

    fetch(`${API_BASE}/api/v1/interviews/join/${encodeURIComponent(resolvedAccessToken)}`)
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
  }, [resolvedAccessToken]);

  const handleJoin = useCallback(() => {
    setError('');
    setState('connected');
  }, []);

  const handleDisconnect = useCallback((reason?: DisconnectReason) => {
    const message =
      reason === DisconnectReason.CLIENT_INITIATED
        ? 'Interview connection was closed locally. You can rejoin to continue.'
        : 'Interview connection was lost. Please rejoin to continue.';

    setError(message);
    setState('error');
  }, []);

  const handleReconnect = useCallback(() => {
    if (!joinData) {
      return;
    }

    setError('');
    setState('connected');
  }, [joinData]);

  return (
    <>
      <SEO title={t('interview.title', 'AI Interview')} noIndex />
      <div className="min-h-screen bg-white text-gray-900">
        {state === 'loading' && <LoadingScreen />}
        {state === 'error' && (
          <ErrorScreen
            message={error}
            actionLabel={joinData ? t('interview.rejoin', 'Rejoin Interview') : undefined}
            onAction={joinData ? handleReconnect : undefined}
          />
        )}
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
          >
            <ActiveInterviewView candidateName={joinData.candidateName} jobTitle={joinData.jobTitle} />
            <RoomAudioRenderer />
          </LiveKitRoom>
        )}
        {state === 'ended' && <ThankYouScreen candidateName={joinData?.candidateName} />}
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Loading Screen
 * ─────────────────────────────────────────────────────────────────────────── */
function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-cyan-500" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Error Screen
 * ─────────────────────────────────────────────────────────────────────────── */
function ErrorScreen({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-50">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
        <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <h1 className="text-xl font-semibold text-gray-900">{t('interview.error', 'Unable to Join')}</h1>
      <p className="text-gray-500">{message}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition-all hover:shadow-xl hover:shadow-cyan-500/30"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Pre-Join Screen — device preview + readiness checklist
 * ─────────────────────────────────────────────────────────────────────────── */
function PreJoinScreen({ joinData: _joinData, onJoin }: { joinData: JoinData; onJoin: () => void }) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [agreed, setAgreed] = useState(true);
  const [mediaError, setMediaError] = useState('');

  // Device lists
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioInput, setSelectedAudioInput] = useState('');
  const [selectedVideoInput, setSelectedVideoInput] = useState('');
  const [selectedAudioOutput, setSelectedAudioOutput] = useState('');

  // Local tracks
  const videoTrackRef = useRef<LocalVideoTrack | null>(null);
  const audioTrackRef = useRef<LocalAudioTrack | null>(null);

  // Enumerate devices and start preview
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Request permissions first
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach((t) => t.stop());

        if (cancelled) return;

        const devices = await navigator.mediaDevices.enumerateDevices();
        const ai = devices.filter((d) => d.kind === 'audioinput' && d.deviceId);
        const vi = devices.filter((d) => d.kind === 'videoinput' && d.deviceId);
        const ao = devices.filter((d) => d.kind === 'audiooutput' && d.deviceId);
        setAudioInputs(ai);
        setVideoInputs(vi);
        setAudioOutputs(ao);
        if (ai.length > 0) setSelectedAudioInput(ai[0].deviceId);
        if (vi.length > 0) setSelectedVideoInput(vi[0].deviceId);
        if (ao.length > 0) setSelectedAudioOutput(ao[0].deviceId);

        // Start video preview
        await startVideoPreview(vi[0]?.deviceId);
        // Start audio level meter
        await startAudioMeter(ai[0]?.deviceId);
      } catch (err: any) {
        if (!cancelled) {
          setMediaError(t('videoInterview.permissionDenied', 'Camera/microphone access denied. Please allow access and reload.'));
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      stopTracks();
      cancelAnimationFrame(animFrameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startVideoPreview(deviceId?: string) {
    try {
      if (videoTrackRef.current) {
        videoTrackRef.current.stop();
      }
      const track = await createLocalVideoTrack({
        deviceId: deviceId ? { exact: deviceId } : undefined,
        resolution: { width: 1280, height: 720, frameRate: 30 },
      });
      videoTrackRef.current = track;
      if (videoRef.current) {
        track.attach(videoRef.current);
      }
      setCameraReady(true);
    } catch {
      setCameraReady(false);
    }
  }

  async function startAudioMeter(deviceId?: string) {
    try {
      if (audioTrackRef.current) {
        audioTrackRef.current.stop();
      }
      const track = await createLocalAudioTrack({
        deviceId: deviceId ? { exact: deviceId } : undefined,
      });
      audioTrackRef.current = track;
      setMicReady(true);

      // Set up audio analyser for level visualization
      const audioCtx = new AudioContext();
      const mediaStream = new MediaStream([track.mediaStreamTrack]);
      const source = audioCtx.createMediaStreamSource(mediaStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioAnalyserRef.current = analyser;

      drawAudioLevel();
    } catch {
      setMicReady(false);
    }
  }

  function drawAudioLevel() {
    const analyser = audioAnalyserRef.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser!.getByteFrequencyData(dataArray);

      const avg = dataArray.reduce((sum, v) => sum + v, 0) / bufferLength;
      const level = Math.min(avg / 128, 1);

      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);

      const barCount = 20;
      const barWidth = (canvas!.width - (barCount - 1) * 2) / barCount;
      const maxHeight = canvas!.height;

      for (let i = 0; i < barCount; i++) {
        const barLevel = Math.max(0, level - i * 0.02) * (1 + Math.random() * 0.3);
        const barHeight = Math.max(2, barLevel * maxHeight);
        const x = i * (barWidth + 2);
        const y = maxHeight - barHeight;

        const activeBar = i / barCount < level;
        ctx!.fillStyle = activeBar ? '#06b6d4' : '#e5e7eb';
        ctx!.beginPath();
        ctx!.roundRect(x, y, barWidth, barHeight, 1);
        ctx!.fill();
      }
    }

    draw();
  }

  function stopTracks() {
    if (videoTrackRef.current) {
      videoTrackRef.current.stop();
      videoTrackRef.current = null;
    }
    if (audioTrackRef.current) {
      audioTrackRef.current.stop();
      audioTrackRef.current = null;
    }
  }

  async function handleVideoDeviceChange(deviceId: string) {
    setSelectedVideoInput(deviceId);
    await startVideoPreview(deviceId);
  }

  async function handleAudioInputChange(deviceId: string) {
    setSelectedAudioInput(deviceId);
    await startAudioMeter(deviceId);
  }

  function handleJoinClick() {
    if (fullscreen) {
      document.documentElement.requestFullscreen?.();
    }
    stopTracks();
    onJoin();
  }

  const canJoin = cameraReady && micReady && agreed;

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-cyan-500 sm:text-4xl">
            {t('videoInterview.prejoinTitle', 'Accept RoboHire Interview')}
          </h1>
          <p className="mt-2 text-base text-gray-500">
            {t('videoInterview.prejoinSubtitle', 'You will have an interview, discussing your previous work experience. Relax, this is not something unfamiliar to you.')}
          </p>
        </div>

        {mediaError && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {mediaError}
          </div>
        )}

        {/* Main grid: video preview + checklist */}
        <div className="flex flex-col gap-8 lg:flex-row">

          {/* Left: Video Preview */}
          <div className="flex-1">
            <div className="relative overflow-hidden rounded-2xl bg-gray-900 shadow-lg" style={{ aspectRatio: '4/3' }}>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
              {!cameraReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                  <div className="text-center text-gray-400">
                    <svg className="mx-auto mb-2 h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                    <p className="text-sm">{t('videoInterview.camera', 'Camera')}</p>
                  </div>
                </div>
              )}
              {/* Audio level indicator in top-right */}
              <div className="absolute right-3 top-3">
                <canvas ref={canvasRef} width={60} height={30} className="rounded" />
              </div>
            </div>

            {/* Device selectors */}
            <div className="mt-4 flex flex-wrap gap-3">
              <DeviceSelector
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                  </svg>
                }
                devices={audioInputs}
                selectedId={selectedAudioInput}
                onChange={handleAudioInputChange}
              />
              <DeviceSelector
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                }
                devices={videoInputs}
                selectedId={selectedVideoInput}
                onChange={handleVideoDeviceChange}
              />
              <DeviceSelector
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                  </svg>
                }
                devices={audioOutputs}
                selectedId={selectedAudioOutput}
                onChange={(id) => setSelectedAudioOutput(id)}
              />
            </div>
          </div>

          {/* Right: Readiness Checklist */}
          <div className="w-full lg:w-96">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900">
                {t('videoInterview.readyToJoin', 'Ready to join?')}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {t('videoInterview.deviceCheckDesc', 'Please make sure your device is configured correctly.')}
              </p>

              <div className="mt-6 space-y-3">
                {/* Camera check */}
                <ChecklistItem
                  icon={
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  }
                  label={t('videoInterview.enableCamera', 'Enable Camera')}
                  checked={cameraReady}
                  onChange={() => {}}
                  readOnly
                />

                {/* Microphone check */}
                <ChecklistItem
                  icon={
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                    </svg>
                  }
                  label={t('videoInterview.enableMic', 'Enable Microphone')}
                  checked={micReady}
                  onChange={() => {}}
                  readOnly
                  showInfo
                />

                {/* Fullscreen toggle */}
                <ChecklistItem
                  icon={
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                    </svg>
                  }
                  label={t('videoInterview.enableFullscreen', 'Enable Fullscreen')}
                  checked={fullscreen}
                  onChange={() => setFullscreen(!fullscreen)}
                />
              </div>

              {/* Terms agreement */}
              <div className="mt-6 flex items-start gap-2.5">
                <button
                  onClick={() => setAgreed(!agreed)}
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    agreed ? 'border-cyan-500 bg-cyan-500' : 'border-gray-300 bg-white'
                  }`}
                >
                  {agreed && (
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </button>
                <span className="text-sm text-gray-600">
                  {t('videoInterview.agreeTerms', 'I have read and agree to the')}{' '}
                  <a href="/terms" target="_blank" className="font-medium text-cyan-500 hover:underline">
                    {t('videoInterview.termsOfService', 'Terms of Service')}
                  </a>{' '}
                  {t('videoInterview.and', 'and')}{' '}
                  <a href="/privacy" target="_blank" className="font-medium text-cyan-500 hover:underline">
                    {t('videoInterview.privacyPolicy', 'Privacy Policy')}
                  </a>
                </span>
              </div>

              {/* Join button */}
              <button
                onClick={handleJoinClick}
                disabled={!canJoin}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-cyan-500/25 transition-all hover:shadow-xl hover:shadow-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {t('videoInterview.joinNow', 'Join Now')}
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Checklist Item
 * ─────────────────────────────────────────────────────────────────────────── */
function ChecklistItem({
  icon,
  label,
  checked,
  onChange,
  readOnly,
  showInfo,
}: {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onChange: () => void;
  readOnly?: boolean;
  showInfo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={readOnly ? undefined : onChange}
      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors ${
        checked
          ? 'border-cyan-200 bg-cyan-50/50'
          : 'border-gray-200 bg-white hover:bg-gray-50'
      } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
    >
      <span className={`${checked ? 'text-cyan-600' : 'text-gray-400'}`}>{icon}</span>
      <span className="flex-1 text-sm font-medium text-gray-700">{label}</span>
      {showInfo && (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-100 text-xs font-bold text-cyan-600">
          i
        </span>
      )}
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-md border-2 transition-colors ${
          checked ? 'border-cyan-500 bg-cyan-500' : 'border-gray-300 bg-white'
        }`}
      >
        {checked && (
          <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        )}
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Device Selector Dropdown
 * ─────────────────────────────────────────────────────────────────────────── */
function DeviceSelector({
  icon,
  devices,
  selectedId,
  onChange,
}: {
  icon: React.ReactNode;
  devices: MediaDeviceInfo[];
  selectedId: string;
  onChange: (deviceId: string) => void;
}) {
  return (
    <div className="relative flex-1">
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-600 shadow-sm">
        <span className="text-gray-400">{icon}</span>
        <select
          value={selectedId}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 cursor-pointer appearance-none border-none bg-transparent text-sm text-gray-700 outline-none"
          title={devices.find((d) => d.deviceId === selectedId)?.label || 'Default'}
        >
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || 'Unknown Device'}
            </option>
          ))}
        </select>
        <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Active Interview View (inside LiveKitRoom)
 * ─────────────────────────────────────────────────────────────────────────── */
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
  listening: 'text-green-500',
  thinking: 'text-amber-500',
  speaking: 'text-cyan-500',
  connecting: 'text-gray-400',
  'pre-connect-buffering': 'text-gray-400',
  initializing: 'text-gray-400',
  idle: 'text-green-500',
  disconnected: 'text-red-500',
  failed: 'text-red-500',
};

function ActiveInterviewView({ candidateName, jobTitle }: { candidateName: string; jobTitle: string }) {
  const { t } = useTranslation();
  const { localParticipant } = useLocalParticipant();
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: true });
  const { state, audioTrack, agentTranscriptions } = useVoiceAssistant();
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef(Date.now());

  const localVideoTrack = tracks.find(
    (tr) => tr.participant.sid === localParticipant.sid && tr.source === Track.Source.Camera,
  );

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentTranscriptions]);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex h-screen flex-col bg-gray-950 text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10">
            <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold">{t('interview.inProgress', 'Interview in Progress')}</h2>
            {jobTitle && <p className="text-xs text-gray-400">{jobTitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-sm text-gray-400">{formatTime(elapsed)}</span>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span className="text-xs text-red-400">{t('interview.recording', 'Recording')}</span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Left: Agent + self video */}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 sm:p-6">
          {/* AI Agent visualizer */}
          <div className="flex w-full max-w-lg flex-col items-center gap-3">
            <div className="relative flex h-40 w-full items-center justify-center rounded-2xl border border-gray-800 bg-gray-900 sm:h-52">
              <BarVisualizer
                state={state}
                track={audioTrack}
                barCount={7}
                className="h-24 w-48 sm:h-32 sm:w-64"
                style={{
                  gap: '6px',
                  '--lk-fg': state === 'speaking' ? '#06b6d4' : state === 'listening' ? '#22c55e' : '#6b7280',
                } as React.CSSProperties}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${
                state === 'speaking' ? 'animate-pulse bg-cyan-400' :
                state === 'listening' ? 'bg-green-400' :
                state === 'thinking' ? 'animate-pulse bg-amber-400' :
                'bg-gray-500'
              }`} />
              <span className={`text-sm font-medium ${AGENT_STATE_COLORS[state] || 'text-gray-400'}`}>
                {t(AGENT_STATE_LABELS[state], state)}
              </span>
            </div>
          </div>

          {/* Self video */}
          <div className="relative h-[200px] w-full max-w-lg overflow-hidden rounded-2xl border border-gray-800 bg-gray-900 sm:h-[260px]">
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
          <div className="flex items-center gap-2 border-b border-gray-800 bg-gray-900/50 px-4 py-2.5">
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
            <span className="text-sm font-medium text-gray-300">
              {t('videoInterview.transcript', 'Transcript')}
            </span>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3 sm:p-4 max-h-48 lg:max-h-none">
            {agentTranscriptions.length === 0 && (
              <p className="py-8 text-center text-xs text-gray-500">
                {t('videoInterview.transcriptEmpty', 'Transcript will appear here as the interview progresses...')}
              </p>
            )}
            {agentTranscriptions.map((seg, i) => (
              <div key={`${seg.id}-${i}`} className="flex gap-2 text-sm">
                <span className="shrink-0 font-medium text-cyan-400">
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

/* ─────────────────────────────────────────────────────────────────────────────
 *  Thank You Screen
 * ─────────────────────────────────────────────────────────────────────────── */
function ThankYouScreen({ candidateName }: { candidateName?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-gray-50 px-4">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
        <svg className="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h1 className="text-3xl font-bold text-gray-900">{t('interview.thankYou', 'Thank You!')}</h1>
      <p className="max-w-md text-center text-gray-500">
        {t(
          'interview.thankYouMessage',
          'Thank you{{name}} for completing the interview. Our team will review your responses and get back to you soon.',
          { name: candidateName ? `, ${candidateName},` : '' },
        )}
      </p>
      <a
        href="/"
        className="mt-4 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 px-8 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-xl"
      >
        {t('interview.backToHome', 'Back to Home')}
      </a>
    </div>
  );
}
