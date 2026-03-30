import React, { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2, Radio, Volume2 } from "lucide-react";
import { motion } from "motion/react";
import type {
  ChatMessage,
  HiringRequirements,
  LiveClientMessage,
  LiveServerMessage as LiveSocketEvent,
} from "./types";
import { buildHistoryFromMessages, getLiveWebSocketUrl } from "./api";

interface Props {
  messages: ChatMessage[];
  onUpdateRequirements: (data: Partial<HiringRequirements>) => void;
  isAiEnabled: boolean;
  disabledMessage?: string;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function LiveVoiceInterface({
  messages,
  onUpdateRequirements,
  isAiEnabled,
  disabledMessage,
}: Props) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const errorRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);
  const intentionalCloseRef = useRef(false);

  useEffect(() => {
    errorRef.current = error;
  }, [error]);

  const stopAudioIO = React.useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.port.close();
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    audioQueueRef.current = [];
    isPlayingRef.current = false;
    nextPlayTimeRef.current = 0;
  }, []);

  const resetUiState = React.useCallback(() => {
    setIsConnected(false);
    setIsConnecting(false);
    setIsSpeaking(false);
  }, []);

  const disconnect = React.useCallback(
    (options?: { closeSocket?: boolean }) => {
      const shouldCloseSocket = options?.closeSocket ?? true;

      stopAudioIO();
      resetUiState();

      const socket = socketRef.current;
      socketRef.current = null;

      if (shouldCloseSocket && socket) {
        intentionalCloseRef.current = true;
        if (socket.readyState === WebSocket.OPEN) {
          const closeMessage: LiveClientMessage = { type: "close" };
          socket.send(JSON.stringify(closeMessage));
        }
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      }
    },
    [resetUiState, stopAudioIO],
  );

  useEffect(() => () => disconnect(), [disconnect]);

  const playNextAudio = React.useCallback(() => {
    if (!audioContextRef.current || audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setIsSpeaking(false);
      return;
    }

    isPlayingRef.current = true;
    setIsSpeaking(true);
    const audioData = audioQueueRef.current.shift()!;
    const audioBuffer = audioContextRef.current.createBuffer(1, audioData.length, 24000);
    audioBuffer.getChannelData(0).set(audioData);

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);

    const currentTime = audioContextRef.current.currentTime;
    const startTime = Math.max(currentTime, nextPlayTimeRef.current);
    source.start(startTime);
    nextPlayTimeRef.current = startTime + audioBuffer.duration;
    source.onended = () => {
      playNextAudio();
    };
  }, []);

  const base64ToFloat32Array = (base64: string) => {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let index = 0; index < binaryString.length; index += 1) {
      bytes[index] = binaryString.charCodeAt(index);
    }

    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let index = 0; index < int16Array.length; index += 1) {
      float32Array[index] = int16Array[index] / 32768.0;
    }

    return float32Array;
  };

  const float32ArrayToBase64 = (float32Array: Float32Array) => {
    const int16Array = new Int16Array(float32Array.length);
    for (let index = 0; index < float32Array.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, float32Array[index]));
      int16Array[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    const bytes = new Uint8Array(int16Array.buffer);
    let binary = "";
    for (let index = 0; index < bytes.byteLength; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }

    return window.btoa(binary);
  };

  const startAudioCapture = async (socket: WebSocket) => {
    const AudioContextConstructor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextConstructor) {
      throw new Error("AudioContext is not supported in this browser.");
    }

    audioContextRef.current = new AudioContextConstructor({ sampleRate: 16000 });
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
      },
    });
    mediaStreamRef.current = stream;

    const source = audioContextRef.current.createMediaStreamSource(stream);
    sourceRef.current = source;

    await audioContextRef.current.audioWorklet.addModule("/audio-capture-processor.js");
    const workletNode = new AudioWorkletNode(audioContextRef.current, "audio-capture-processor");
    workletNodeRef.current = workletNode;

    workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }
      const message: LiveClientMessage = {
        type: "audio",
        data: float32ArrayToBase64(event.data),
      };
      socket.send(JSON.stringify(message));
    };

    source.connect(workletNode);
    workletNode.connect(audioContextRef.current.destination);
    nextPlayTimeRef.current = audioContextRef.current.currentTime;
  };

  const startLiveSession = async () => {
    if (!isAiEnabled || isConnecting || isConnected) {
      return;
    }

    disconnect();
    intentionalCloseRef.current = false;
    errorRef.current = null;
    setError(null);
    setIsConnecting(true);

    const socket = new WebSocket(getLiveWebSocketUrl());
    socketRef.current = socket;

    socket.onopen = () => {
      const initMessage: LiveClientMessage = {
        type: "init",
        history: buildHistoryFromMessages(messages),
      };
      socket.send(JSON.stringify(initMessage));
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as LiveSocketEvent;

        if (data.type === "connected") {
          void startAudioCapture(socket)
            .then(() => {
              setIsConnected(true);
              setIsConnecting(false);
            })
            .catch((audioError) => {
              const message = getErrorMessage(audioError, "Failed to access microphone.");
              errorRef.current = message;
              setError(message);
              disconnect();
            });
          return;
        }

        if (data.type === "audio") {
          audioQueueRef.current.push(base64ToFloat32Array(data.data));
          if (!isPlayingRef.current) {
            if (audioContextRef.current) {
              nextPlayTimeRef.current = audioContextRef.current.currentTime;
            }
            playNextAudio();
          }
          return;
        }

        if (data.type === "interrupted") {
          audioQueueRef.current = [];
          isPlayingRef.current = false;
          setIsSpeaking(false);
          return;
        }

        if (data.type === "requirements-update") {
          onUpdateRequirements(data.data);
          return;
        }

        if (data.type === "error") {
          errorRef.current = data.message;
          setError(data.message);
          disconnect();
        }
      } catch (messageError) {
        console.error("Failed to process live message:", messageError);
      }
    };

    socket.onerror = () => {
      errorRef.current = "Connection error occurred.";
      setError("Connection error occurred.");
      disconnect({ closeSocket: false });
    };

    socket.onclose = () => {
      const wasIntentional = intentionalCloseRef.current;
      intentionalCloseRef.current = false;
      disconnect({ closeSocket: false });

      if (!wasIntentional && !errorRef.current) {
        errorRef.current = "Live voice connection closed unexpectedly.";
        setError("Live voice connection closed unexpectedly.");
      }
    };
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden text-white relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 sm:w-96 sm:h-96 bg-indigo-500/20 rounded-full blur-3xl opacity-50"></div>
        {isConnected && (
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 sm:w-64 sm:h-64 bg-indigo-400/30 rounded-full blur-2xl"
          ></motion.div>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 relative z-10">
        <div className="text-center mb-8 sm:mb-12">
          <h2 className="text-xl sm:text-2xl font-light tracking-tight mb-2">Live Voice Agent</h2>
          <p className="text-slate-400 text-sm max-w-xs mx-auto">
            Have a real-time conversation to define your hiring requirements.
          </p>
        </div>

        <div className="relative mb-8 sm:mb-12">
          <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center relative z-10 shadow-2xl">
            {isConnecting ? (
              <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 text-indigo-400 animate-spin" />
            ) : isConnected ? (
              isSpeaking ? (
                <Volume2 className="w-9 h-9 sm:w-12 sm:h-12 text-indigo-400" />
              ) : (
                <Radio className="w-9 h-9 sm:w-12 sm:h-12 text-emerald-400 animate-pulse" />
              )
            ) : (
              <Mic className="w-8 h-8 sm:w-10 sm:h-10 text-slate-500" />
            )}
          </div>

          {isConnected && isSpeaking && (
            <>
              <motion.div
                animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute inset-0 rounded-full border-2 border-indigo-500"
              ></motion.div>
              <motion.div
                animate={{ scale: [1, 2], opacity: [0.3, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
                className="absolute inset-0 rounded-full border-2 border-indigo-400"
              ></motion.div>
            </>
          )}
        </div>

        <div className="text-center h-12">
          {error ? (
            <p className="text-red-400 text-sm">{error}</p>
          ) : isConnecting ? (
            <p className="text-indigo-300 animate-pulse">Connecting to agent...</p>
          ) : isConnected ? (
            <p className="text-emerald-400">{isSpeaking ? "Agent is speaking..." : "Listening... Speak now"}</p>
          ) : (
            <p className="text-slate-500">Ready to connect</p>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-6 bg-slate-900/80 backdrop-blur-md border-t border-slate-800 flex flex-col items-center gap-3 relative z-10">
        {!isConnected && !isConnecting ? (
          <button
            onClick={() => void startLiveSession()}
            disabled={!isAiEnabled}
            className="flex items-center gap-2 px-6 py-3 sm:px-8 sm:py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full font-medium text-sm sm:text-base transition-all shadow-lg shadow-indigo-900/50 hover:shadow-indigo-900/80 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:bg-indigo-600 disabled:hover:translate-y-0"
          >
            <Mic className="w-5 h-5" />
            Start Conversation
          </button>
        ) : (
          <button
            onClick={() => disconnect()}
            className="flex items-center gap-2 px-6 py-3 sm:px-8 sm:py-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 rounded-full font-medium text-sm sm:text-base transition-all"
          >
            <Square className="w-5 h-5 fill-current" />
            End Call
          </button>
        )}

        {!isAiEnabled && disabledMessage && <p className="text-xs text-amber-300 text-center max-w-sm">{disabledMessage}</p>}
      </div>
    </div>
  );
}
