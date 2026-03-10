import type { ATSAdapter, ATSCredentials, ATSJob, ATSCandidate, ATSWebhookEvent } from '../ATSAdapter.js';
import crypto from 'crypto';

function baseUrl(credentials: ATSCredentials): string {
  const subdomain = credentials.subdomain || '';
  return `https://${subdomain}.workable.com/spi/v3`;
}

function authHeaders(credentials: ATSCredentials): Record<string, string> {
  return {
    'Authorization': `Bearer ${credentials.apiKey}`,
    'Content-Type': 'application/json',
  };
}

async function request(method: string, path: string, credentials: ATSCredentials, body?: unknown): Promise<unknown> {
  const res = await fetch(`${baseUrl(credentials)}${path}`, {
    method,
    headers: authHeaders(credentials),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Workable API ${method} ${path} failed (${res.status}): ${text}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

export class WorkableAdapter implements ATSAdapter {
  readonly provider = 'workable' as const;

  async testConnection(credentials: ATSCredentials): Promise<boolean> {
    try {
      await request('GET', '/jobs?limit=1', credentials);
      return true;
    } catch {
      return false;
    }
  }

  async listJobs(credentials: ATSCredentials): Promise<ATSJob[]> {
    const data = await request('GET', '/jobs?state=published&limit=100', credentials) as Record<string, unknown>;
    const jobs = (data.jobs as Array<Record<string, unknown>>) || [];
    return jobs.map((j) => ({
      id: String(j.shortcode || j.id),
      title: (j.title as string) || '',
      status: (j.state as string) || 'published',
      department: (j.department as string) || undefined,
      location: j.location ? (j.location as Record<string, string>).city || '' : undefined,
    }));
  }

  async getJob(credentials: ATSCredentials, jobId: string): Promise<ATSJob> {
    const j = await request('GET', `/jobs/${jobId}`, credentials) as Record<string, unknown>;
    return {
      id: String(j.shortcode || j.id),
      title: (j.title as string) || '',
      status: (j.state as string) || 'published',
      department: (j.department as string) || undefined,
      location: j.location ? (j.location as Record<string, string>).city || '' : undefined,
    };
  }

  async pushCandidate(credentials: ATSCredentials, jobId: string, candidate: ATSCandidate): Promise<string> {
    const nameParts = candidate.name.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const result = await request('POST', `/jobs/${jobId}/candidates`, credentials, {
      sourced: true,
      candidate: {
        name: candidate.name,
        firstname: firstName,
        lastname: lastName,
        email: candidate.email,
        phone: candidate.phone,
        summary: candidate.resumeText?.substring(0, 2000),
      },
    }) as Record<string, unknown>;

    return String(result.id || (result.candidate as Record<string, unknown>)?.id || '');
  }

  async updateCandidateStage(credentials: ATSCredentials, applicationId: string, stage: string): Promise<void> {
    await request('POST', `/candidates/${applicationId}/move`, credentials, {
      stage,
    });
  }

  mapStageToRoboHire(atsStage: string): string {
    const lower = atsStage.toLowerCase();
    if (lower.includes('reject') || lower.includes('disqualified')) return 'rejected';
    if (lower.includes('offer') || lower.includes('hired')) return 'shortlisted';
    if (lower.includes('interview') || lower.includes('assessment') || lower.includes('screen')) return 'invited';
    return 'matched';
  }

  parseWebhookPayload(payload: unknown, signature?: string, secret?: string): ATSWebhookEvent | null {
    const data = payload as Record<string, unknown>;
    if (!data || !data.event) return null;

    // Verify signature if secret is provided
    if (secret && signature) {
      const expected = crypto.createHmac('sha256', secret).update(JSON.stringify(data)).digest('hex');
      if (signature !== expected) return null;
    }

    const eventData = data.data as Record<string, unknown> | undefined;
    return {
      type: data.event as string,
      candidateId: eventData ? String(eventData.id || '') : undefined,
      jobId: eventData ? String(eventData.shortcode || eventData.job_shortcode || '') : undefined,
      data: data as Record<string, unknown>,
    };
  }
}
