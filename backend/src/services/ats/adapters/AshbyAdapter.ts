import type { ATSAdapter, ATSCredentials, ATSJob, ATSCandidate, ATSWebhookEvent } from '../ATSAdapter.js';

const BASE_URL = 'https://api.ashbyhq.com';

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
    throw new Error(`Ashby API ${method} ${path} failed (${res.status}): ${text}`);
  }

  const json = await res.json() as Record<string, unknown>;
  return json.results ?? json;
}

export class AshbyAdapter implements ATSAdapter {
  readonly provider = 'ashby' as const;

  async testConnection(credentials: ATSCredentials): Promise<boolean> {
    try {
      await request('POST', '/job.list', credentials, { limit: 1 });
      return true;
    } catch {
      return false;
    }
  }

  async listJobs(credentials: ATSCredentials): Promise<ATSJob[]> {
    const data = await request('POST', '/job.list', credentials, {
      limit: 100,
      status: 'Open',
    }) as Array<Record<string, unknown>>;
    return data.map((j) => ({
      id: String(j.id),
      title: (j.title as string) || '',
      status: (j.status as string) || 'Open',
      department: (j.departmentName as string) || undefined,
      location: (j.locationName as string) || undefined,
    }));
  }

  async getJob(credentials: ATSCredentials, jobId: string): Promise<ATSJob> {
    const j = await request('POST', '/job.info', credentials, { jobId }) as Record<string, unknown>;
    return {
      id: String(j.id),
      title: (j.title as string) || '',
      status: (j.status as string) || 'Open',
      department: (j.departmentName as string) || undefined,
      location: (j.locationName as string) || undefined,
    };
  }

  async pushCandidate(credentials: ATSCredentials, jobId: string, candidate: ATSCandidate): Promise<string> {
    const nameParts = candidate.name.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Create candidate
    const created = await request('POST', '/candidate.create', credentials, {
      firstName,
      lastName,
      email: candidate.email,
      phoneNumber: candidate.phone,
      source: 'RoboHire',
    }) as Record<string, unknown>;
    const candidateId = String(created.id);

    // Create application
    await request('POST', '/application.create', credentials, {
      candidateId,
      jobId,
      source: 'RoboHire',
    });

    return candidateId;
  }

  async updateCandidateStage(credentials: ATSCredentials, applicationId: string, stage: string): Promise<void> {
    await request('POST', '/application.changeStage', credentials, {
      applicationId,
      interviewStageId: stage,
    });
  }

  mapStageToRoboHire(atsStage: string): string {
    const lower = atsStage.toLowerCase();
    if (lower.includes('reject') || lower.includes('archived')) return 'rejected';
    if (lower.includes('offer') || lower.includes('hired')) return 'shortlisted';
    if (lower.includes('interview') || lower.includes('screen')) return 'invited';
    return 'matched';
  }

  parseWebhookPayload(payload: unknown, _signature?: string, _secret?: string): ATSWebhookEvent | null {
    const data = payload as Record<string, unknown>;
    if (!data || !data.action) return null;

    const obj = data.data as Record<string, unknown> | undefined;
    return {
      type: data.action as string,
      candidateId: obj ? String(obj.candidateId || '') : undefined,
      applicationId: obj ? String(obj.applicationId || obj.id || '') : undefined,
      jobId: obj ? String(obj.jobId || '') : undefined,
      data: data as Record<string, unknown>,
    };
  }
}
