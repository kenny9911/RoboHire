/**
 * CustomHttpDriver — the generic external sourcing driver.
 *
 * Sends a POST to `{baseUrl}/search` with the agent's criteria and expects a
 * standard response envelope. This lets admins onboard arbitrary third-party
 * sourcing vendors without writing code.
 *
 * Expected vendor response shape:
 * {
 *   "candidates": [
 *     {
 *       "name": "Jane Doe",
 *       "headline": "Senior Backend Engineer at Acme",
 *       "location": "Remote, EU",
 *       "email": "jane@example.com",           // optional
 *       "profileUrl": "https://linkedin.com/…",
 *       "resumeText": "…",                       // optional — if provided, we can re-score
 *       "score": 87,                              // optional 0–100; if provided we use it
 *       "source": "linkedin",                     // optional label
 *       "metadata": { ... }                       // passthrough
 *     }
 *   ]
 * }
 *
 * Drivers like LinkedInDriver, GitHubDriver, SeekOutDriver will wrap this or
 * use provider-specific paths in Phase 3+; v1 ships the custom driver only.
 */

export interface ExternalCandidate {
  name: string;
  headline?: string | null;
  location?: string | null;
  email?: string | null;
  profileUrl?: string | null;
  resumeText?: string | null;
  score?: number | null;
  source?: string | null;
  metadata?: Record<string, unknown>;
}

export interface DriverConfig {
  baseUrl: string;
  authType: 'api_key' | 'oauth' | 'basic' | string;
  credentials: Record<string, unknown>; // decrypted
  config: Record<string, unknown> | null;
}

export interface SearchInput {
  criteria: string; // agent.description
  instructions?: string | null;
  limit?: number;
  jobTitle?: string | null;
}

export async function searchWithCustomHttpDriver(
  driver: DriverConfig,
  input: SearchInput,
  signal: AbortSignal,
): Promise<ExternalCandidate[]> {
  const url = joinUrl(driver.baseUrl, '/search');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (driver.authType === 'api_key' && typeof driver.credentials.apiKey === 'string') {
    const headerName =
      typeof driver.credentials.apiKeyHeader === 'string' ? driver.credentials.apiKeyHeader : 'X-API-Key';
    headers[headerName] = driver.credentials.apiKey;
  } else if (driver.authType === 'basic' && driver.credentials.username && driver.credentials.password) {
    headers.Authorization =
      'Basic ' +
      Buffer.from(`${driver.credentials.username}:${driver.credentials.password}`).toString('base64');
  } else if (driver.authType === 'oauth' && typeof driver.credentials.accessToken === 'string') {
    headers.Authorization = `Bearer ${driver.credentials.accessToken}`;
  }

  const body = JSON.stringify({
    criteria: input.criteria,
    instructions: input.instructions ?? null,
    jobTitle: input.jobTitle ?? null,
    limit: input.limit ?? 25,
  });

  const controller = new AbortController();
  const abortHandler = () => controller.abort();
  signal.addEventListener('abort', abortHandler);
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`CustomHttpDriver HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const payload = (await res.json()) as { candidates?: unknown };
    if (!payload || !Array.isArray(payload.candidates)) {
      throw new Error('CustomHttpDriver: response missing `candidates` array');
    }
    return payload.candidates.map(normalizeCandidate).filter((c): c is ExternalCandidate => c !== null);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abortHandler);
  }
}

function normalizeCandidate(raw: unknown): ExternalCandidate | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const name = typeof c.name === 'string' ? c.name : null;
  if (!name) return null;
  return {
    name,
    headline: typeof c.headline === 'string' ? c.headline : null,
    location: typeof c.location === 'string' ? c.location : null,
    email: typeof c.email === 'string' ? c.email : null,
    profileUrl: typeof c.profileUrl === 'string' ? c.profileUrl : null,
    resumeText: typeof c.resumeText === 'string' ? c.resumeText : null,
    score: typeof c.score === 'number' ? c.score : null,
    source: typeof c.source === 'string' ? c.source : null,
    metadata: typeof c.metadata === 'object' && c.metadata !== null ? (c.metadata as Record<string, unknown>) : undefined,
  };
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.replace(/^\/+/, '');
  return `${b}/${p}`;
}
