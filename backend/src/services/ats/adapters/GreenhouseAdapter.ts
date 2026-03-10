import type { ATSAdapter, ATSCredentials, ATSJob, ATSCandidate, ATSWebhookEvent } from '../ATSAdapter.js';

const BASE_URL = 'https://harvest.greenhouse.io/v1';

function authHeaders(credentials: ATSCredentials): Record<string, string> {
  const token = Buffer.from(`${credentials.apiKey}:`).toString('base64');
  return {
    'Authorization': `Basic ${token}`,
    'Content-Type': 'application/json',
    'On-Behalf-Of': credentials.onBehalfOf as string || '',
  };
}

async function request(method: string, path: string, credentials: ATSCredentials, body?: unknown): Promise<unknown> {
  const headers = authHeaders(credentials);
  if (!headers['On-Behalf-Of']) delete headers['On-Behalf-Of'];

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Greenhouse API ${method} ${path} failed (${res.status}): ${text}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

export class GreenhouseAdapter implements ATSAdapter {
  readonly provider = 'greenhouse' as const;

  async testConnection(credentials: ATSCredentials): Promise<boolean> {
    try {
      await request('GET', '/jobs?per_page=1', credentials);
      return true;
    } catch {
      return false;
    }
  }

  async listJobs(credentials: ATSCredentials): Promise<ATSJob[]> {
    const data = await request('GET', '/jobs?per_page=100&status=open', credentials) as Array<Record<string, unknown>>;
    return data.map((j) => ({
      id: String(j.id),
      title: j.name as string,
      status: j.status as string || 'open',
      department: (j.departments as Array<{ name: string }>)?.[0]?.name,
      location: (j.offices as Array<{ name: string }>)?.[0]?.name,
    }));
  }

  async getJob(credentials: ATSCredentials, jobId: string): Promise<ATSJob> {
    const j = await request('GET', `/jobs/${jobId}`, credentials) as Record<string, unknown>;
    return {
      id: String(j.id),
      title: j.name as string,
      status: j.status as string || 'open',
      department: (j.departments as Array<{ name: string }>)?.[0]?.name,
      location: (j.offices as Array<{ name: string }>)?.[0]?.name,
    };
  }

  async pushCandidate(credentials: ATSCredentials, jobId: string, candidate: ATSCandidate): Promise<string> {
    // Step 1: Create candidate
    const nameParts = candidate.name.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const candidateData: Record<string, unknown> = {
      first_name: firstName,
      last_name: lastName,
      email_addresses: [{ value: candidate.email, type: 'personal' }],
    };
    if (candidate.phone) {
      candidateData.phone_numbers = [{ value: candidate.phone, type: 'mobile' }];
    }

    const created = await request('POST', '/candidates', credentials, candidateData) as Record<string, unknown>;
    const candidateId = String(created.id);

    // Step 2: Create application for the job
    await request('POST', `/candidates/${candidateId}/applications`, credentials, {
      job_id: Number(jobId),
    });

    return candidateId;
  }

  async updateCandidateStage(credentials: ATSCredentials, applicationId: string, stage: string): Promise<void> {
    await request('PUT', `/applications/${applicationId}/move`, credentials, {
      from_stage_id: null,
      to_stage_id: stage,
    });
  }

  mapStageToRoboHire(atsStage: string): string {
    const lower = atsStage.toLowerCase();
    if (lower.includes('reject') || lower.includes('declined')) return 'rejected';
    if (lower.includes('offer') || lower.includes('hired')) return 'shortlisted';
    if (lower.includes('interview') || lower.includes('screen')) return 'invited';
    return 'matched';
  }

  parseWebhookPayload(payload: unknown, _signature?: string, _secret?: string): ATSWebhookEvent | null {
    const data = payload as Record<string, unknown>;
    if (!data || !data.action) return null;

    const action = data.action as string;
    const app = data.application as Record<string, unknown> | undefined;

    return {
      type: action,
      candidateId: app ? String((app.candidate as Record<string, unknown>)?.id || '') : undefined,
      applicationId: app ? String(app.id || '') : undefined,
      jobId: app ? String((app.jobs as Array<{ id: number }>)?.[0]?.id || '') : undefined,
      data: data as Record<string, unknown>,
    };
  }
}
