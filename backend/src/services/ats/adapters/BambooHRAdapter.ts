import type { ATSAdapter, ATSCredentials, ATSJob, ATSCandidate, ATSWebhookEvent } from '../ATSAdapter.js';

function baseUrl(credentials: ATSCredentials): string {
  const subdomain = credentials.subdomain || '';
  return `https://api.bamboohr.com/api/gateway.php/${subdomain}/v1`;
}

function authHeaders(credentials: ATSCredentials): Record<string, string> {
  const token = Buffer.from(`${credentials.apiKey}:x`).toString('base64');
  return {
    'Authorization': `Basic ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
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
    throw new Error(`BambooHR API ${method} ${path} failed (${res.status}): ${text}`);
  }

  if (res.status === 204 || res.headers.get('content-length') === '0') return null;
  return res.json();
}

export class BambooHRAdapter implements ATSAdapter {
  readonly provider = 'bamboohr' as const;

  async testConnection(credentials: ATSCredentials): Promise<boolean> {
    try {
      await request('GET', '/applicant_tracking/jobs?statusGroups=ALL&sortBy=count', credentials);
      return true;
    } catch {
      return false;
    }
  }

  async listJobs(credentials: ATSCredentials): Promise<ATSJob[]> {
    const data = await request('GET', '/applicant_tracking/jobs?statusGroups=Open&sortBy=count', credentials) as Record<string, unknown>;
    const jobs = (data as Record<string, unknown>).jobs as Array<Record<string, unknown>> || [];
    return jobs.map((j) => ({
      id: String(j.id),
      title: (j.title as Record<string, string>)?.label || '',
      status: (j.status as Record<string, string>)?.label || 'Open',
      department: (j.department as Record<string, string>)?.label || undefined,
      location: (j.location as Record<string, string>)?.label || undefined,
    }));
  }

  async getJob(credentials: ATSCredentials, jobId: string): Promise<ATSJob> {
    const j = await request('GET', `/applicant_tracking/jobs/${jobId}`, credentials) as Record<string, unknown>;
    return {
      id: String(j.id),
      title: (j.title as Record<string, string>)?.label || String(j.title || ''),
      status: (j.status as Record<string, string>)?.label || 'Open',
      department: (j.department as Record<string, string>)?.label || undefined,
      location: (j.location as Record<string, string>)?.label || undefined,
    };
  }

  async pushCandidate(credentials: ATSCredentials, jobId: string, candidate: ATSCandidate): Promise<string> {
    const nameParts = candidate.name.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const result = await request('POST', '/applicant_tracking/applications', credentials, {
      jobId: Number(jobId),
      firstName,
      lastName,
      email: candidate.email,
      phoneNumber: candidate.phone,
      source: 'RoboHire',
    }) as Record<string, unknown>;

    return String(result.id || result.applicationId || '');
  }

  async updateCandidateStage(credentials: ATSCredentials, applicationId: string, stage: string): Promise<void> {
    await request('PUT', `/applicant_tracking/applications/${applicationId}/status`, credentials, {
      status: stage,
    });
  }

  mapStageToRoboHire(atsStage: string): string {
    const lower = atsStage.toLowerCase();
    if (lower.includes('reject') || lower.includes('not hired')) return 'rejected';
    if (lower.includes('offer') || lower.includes('hired')) return 'shortlisted';
    if (lower.includes('interview') || lower.includes('phone screen')) return 'invited';
    return 'matched';
  }

  parseWebhookPayload(payload: unknown, _signature?: string, _secret?: string): ATSWebhookEvent | null {
    // BambooHR has limited webhook support
    const data = payload as Record<string, unknown>;
    if (!data) return null;

    return {
      type: (data.type as string) || 'unknown',
      candidateId: data.employeeId ? String(data.employeeId) : undefined,
      data: data as Record<string, unknown>,
    };
  }
}
