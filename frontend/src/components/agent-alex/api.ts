import type {
  AppConfigStatus,
  ChatMessage,
  ChatStreamEvent,
  HistoryMessage,
} from "./types";
import { API_BASE } from "../../config";

interface JsonErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

function getErrorMessageFromBody(body: JsonErrorBody | null, fallback: string): string {
  return body?.error?.message || fallback;
}

async function parseJsonError(response: Response): Promise<never> {
  let body: JsonErrorBody | null = null;

  try {
    body = (await response.json()) as JsonErrorBody;
  } catch {
    body = null;
  }

  throw new Error(getErrorMessageFromBody(body, `Request failed with status ${response.status}.`));
}

export function buildHistoryFromMessages(messages: ChatMessage[]): HistoryMessage[] {
  return messages
    .filter((message) => !message.isError && !message.isThinking && message.id !== "welcome")
    .map((message) => ({
      role: message.role,
      text: message.text,
    }));
}

export async function fetchAppConfig(): Promise<AppConfigStatus> {
  const response = await fetch(`${API_BASE}/api/v1/agent-alex/config`, { credentials: 'include' });
  if (!response.ok) {
    await parseJsonError(response);
  }

  return (await response.json()) as AppConfigStatus;
}

export async function streamChat(
  payload: { history: HistoryMessage[]; message: string },
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  // Detect current i18n locale to pass to backend
  const htmlLang = document.documentElement.lang;
  const locale = htmlLang || localStorage.getItem("i18nextLng") || navigator.language || "en";

  const response = await fetch(`${API_BASE}/api/v1/agent-alex/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: 'include',
    body: JSON.stringify({ ...payload, locale }),
    signal,
  });

  if (!response.body) {
    if (!response.ok) {
      await parseJsonError(response);
    }
    throw new Error("Streaming response body was empty.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamError: Error | null = null;

  const flushBuffer = () => {
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      const event = JSON.parse(line) as ChatStreamEvent;
      onEvent(event);
      if (event.type === "error") {
        streamError = new Error(event.message);
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    flushBuffer();

    if (done) {
      break;
    }
  }

  if (buffer.trim()) {
    const event = JSON.parse(buffer) as ChatStreamEvent;
    onEvent(event);
    if (event.type === "error") {
      streamError = new Error(event.message);
    }
  }

  if (streamError) {
    throw streamError;
  }
}

export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  const response = await fetch(`${API_BASE}/api/v1/agent-alex/transcribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: 'include',
    body: JSON.stringify({ audioBase64, mimeType }),
  });

  if (!response.ok) {
    await parseJsonError(response);
  }

  const body = (await response.json()) as { text?: string };
  return body.text ?? "";
}

export async function generateSpeech(text: string): Promise<string | undefined> {
  const response = await fetch(`${API_BASE}/api/v1/agent-alex/tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: 'include',
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    await parseJsonError(response);
  }

  const body = (await response.json()) as { audioBase64?: string };
  return body.audioBase64;
}

export function getLiveWebSocketUrl(): string {
  if (API_BASE) {
    // Production: API_BASE is a full URL like https://api.robohire.io
    const url = new URL("/api/v1/agent-alex/live", API_BASE);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  }
  // Dev: same host, proxy handles it
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/v1/agent-alex/live`;
}

export interface CreateJobFromSpecPayload {
  title: string;
  department?: string;
  location?: string;
  workType?: string;
  employmentType?: string;
  experienceLevel?: string;
  education?: string;
  headcount?: number;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
  salaryText?: string;
  description?: string;
  qualifications?: string;
  hardRequirements?: string;
  niceToHave?: string;
  benefits?: string;
  requirements?: { mustHave: string[]; niceToHave: string[] };
  interviewRequirements?: string;
  notes?: string;
  status?: string;
}

export interface CreateJobResponse {
  success: boolean;
  data?: { id: string; title: string; status: string };
  error?: string;
}

export async function createJobFromSpec(payload: CreateJobFromSpecPayload): Promise<CreateJobResponse> {
  const response = await fetch(`${API_BASE}/api/v1/jobs`, {
    method: "POST",
    headers: authHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as CreateJobResponse;
  if (!response.ok) {
    throw new Error(body.error || `Failed to create job (${response.status})`);
  }
  return body;
}

// --- Session persistence API ---

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface DbSession {
  id: string;
  title: string;
  messages: unknown[];
  requirements: Record<string, unknown>;
  linkedJobId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchSessions(): Promise<DbSession[]> {
  const res = await fetch(`${API_BASE}/api/v1/agent-alex/sessions`, { headers: authHeaders(), credentials: 'include' });
  if (!res.ok) return [];
  const body = (await res.json()) as { data?: DbSession[] };
  return body.data ?? [];
}

export async function createSession(data: {
  title?: string;
  messages?: unknown[];
  requirements?: Record<string, unknown>;
}): Promise<DbSession> {
  const res = await fetch(`${API_BASE}/api/v1/agent-alex/sessions`, {
    method: "POST",
    headers: authHeaders(),
    credentials: 'include',
    body: JSON.stringify(data),
  });
  const body = (await res.json()) as { data: DbSession };
  return body.data;
}

export async function updateSession(
  id: string,
  data: Partial<{ title: string; messages: unknown[]; requirements: Record<string, unknown>; linkedJobId: string | null }>,
): Promise<void> {
  await fetch(`${API_BASE}/api/v1/agent-alex/sessions/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    credentials: 'include',
    body: JSON.stringify(data),
  });
}

export async function deleteSession(id: string): Promise<{ success: boolean; error?: string; linkedJob?: { id: string; title: string } }> {
  const res = await fetch(`${API_BASE}/api/v1/agent-alex/sessions/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
    credentials: 'include',
  });
  return (await res.json()) as { success: boolean; error?: string; linkedJob?: { id: string; title: string } };
}

export async function updateJobFromSpec(jobId: string, payload: Partial<CreateJobFromSpecPayload>): Promise<CreateJobResponse> {
  const res = await fetch(`${API_BASE}/api/v1/jobs/${jobId}`, {
    method: "PATCH",
    headers: authHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as CreateJobResponse;
  if (!res.ok) {
    throw new Error(body.error || `Failed to update job (${res.status})`);
  }
  return body;
}
