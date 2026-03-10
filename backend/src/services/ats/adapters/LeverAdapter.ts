import type { ATSAdapter, ATSCredentials, ATSJob, ATSCandidate, ATSWebhookEvent } from '../ATSAdapter.js';

const BASE_URL = 'https://api.lever.co/v1';

function authHeaders(credentials: ATSCredentials): Record<string, string> {
  const token = Buffer.from(`${credentials.apiKey}:`).toString('base64');
  return {
    'Authorization': `Basic ${token}`,
    'Content-Type': 'application/json',
  };
}

async function request(method: string, path: string, credentials: ATSCredentials, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: authHeaders(credentials),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Lever API ${method} ${path} failed (${res.status}): ${text}`);
  }

  const json = await res.json() as Record<string, unknown>;
  return json.data ?? json;
}

export class LeverAdapter implements ATSAdapter {
  readonly provider = 'lever' as const;

  async testConnection(credentials: ATSCredentials): Promise<boolean> {
    try {
      await request('GET', '/postings?limit=1', credentials);
      return true;
    } catch {
      return false;
    }
  }

  async listJobs(credentials: ATSCredentials): Promise<ATSJob[]> {
    const data = await request('GET', '/postings?state=published&limit=100', credentials) as Array<Record<string, unknown>>;
    return data.map((p) => ({
      id: String(p.id),
      title: (p.text as string) || '',
      status: (p.state as string) || 'published',
      department: ((p.categories as Record<string, string>)?.department) || undefined,
      location: ((p.categories as Record<string, string>)?.location) || undefined,
    }));
  }

  async getJob(credentials: ATSCredentials, jobId: string): Promise<ATSJob> {
    const p = await request('GET', `/postings/${jobId}`, credentials) as Record<string, unknown>;
    return {
      id: String(p.id),
      title: (p.text as string) || '',
      status: (p.state as string) || 'published',
      department: ((p.categories as Record<string, string>)?.department) || undefined,
      location: ((p.categories as Record<string, string>)?.location) || undefined,
    };
  }

  async pushCandidate(credentials: ATSCredentials, jobId: string, candidate: ATSCandidate): Promise<string> {
    // Lever uses "Opportunities" as the unified candidate+application model
    const opportunityData = {
      name: candidate.name,
      emails: [candidate.email],
      phones: candidate.phone ? [{ value: candidate.phone }] : undefined,
      postings: [jobId],
      origin: 'sourced',
      sources: ['RoboHire'],
    };

    const result = await request('POST', '/opportunities', credentials, opportunityData) as Record<string, unknown>;
    return String(result.id);
  }

  async updateCandidateStage(credentials: ATSCredentials, applicationId: string, stage: string): Promise<void> {
    await request('PUT', `/opportunities/${applicationId}/stage`, credentials, {
      stage,
    });
  }

  mapStageToRoboHire(atsStage: string): string {
    const lower = atsStage.toLowerCase();
    if (lower.includes('reject') || lower.includes('archive')) return 'rejected';
    if (lower.includes('offer') || lower.includes('hired') || lower.includes('onboard')) return 'shortlisted';
    if (lower.includes('interview') || lower.includes('screen') || lower.includes('phone')) return 'invited';
    return 'matched';
  }

  parseWebhookPayload(payload: unknown, _signature?: string, _secret?: string): ATSWebhookEvent | null {
    const data = payload as Record<string, unknown>;
    if (!data || !data.event) return null;

    const eventData = data.data as Record<string, unknown> | undefined;
    return {
      type: data.event as string,
      candidateId: eventData ? String(eventData.candidateId || eventData.id || '') : undefined,
      applicationId: eventData ? String(eventData.opportunityId || eventData.id || '') : undefined,
      data: data as Record<string, unknown>,
    };
  }
}
