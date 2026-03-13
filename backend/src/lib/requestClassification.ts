export interface ApiClassification {
  module: string;
  apiName: string;
}

function sanitizePath(path: string): string {
  const [pathname] = path.split('?');
  return pathname || path;
}

function normalizeApiName(pathname: string): string {
  const normalizedPath = pathname
    .split('/')
    .map((segment) => {
      const s = segment.trim();
      if (!s) return s;
      // Normalize likely dynamic IDs to reduce cardinality in analytics
      if (/^[a-z0-9]{12,}$/i.test(s) || /^[a-z0-9_-]{16,}$/i.test(s)) return ':id';
      if (/^\d+$/.test(s)) return ':id';
      return s;
    })
    .join('/');

  const withoutPrefix = normalizedPath
    .replace(/^\/api\/v\d+\//, '')
    .replace(/^\/api\/auth\//, 'auth/')
    .replace(/^\/api\//, '');
  return withoutPrefix
    .replace(/\//g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'root';
}

export function classifyApiRequest(path: string): ApiClassification {
  const pathname = sanitizePath(path);

  // Auth
  if (pathname.startsWith('/api/auth')) {
    return { module: 'auth', apiName: normalizeApiName(pathname) };
  }

  // Admin
  if (pathname.startsWith('/api/v1/admin')) {
    return { module: 'admin', apiName: normalizeApiName(pathname) };
  }

  // Usage + API key management
  if (pathname.startsWith('/api/v1/usage')) {
    return { module: 'usage', apiName: normalizeApiName(pathname) };
  }
  if (pathname.startsWith('/api/v1/api-keys')) {
    return { module: 'api_keys', apiName: normalizeApiName(pathname) };
  }

  // Hiring workflows
  if (pathname.startsWith('/api/v1/hiring-chat')) {
    return { module: 'hiring_chat', apiName: normalizeApiName(pathname) };
  }
  if (pathname.startsWith('/api/v1/hiring-sessions')) {
    return { module: 'hiring_sessions', apiName: normalizeApiName(pathname) };
  }
  if (pathname.includes('/hiring-requests/title-suggestion')) {
    return { module: 'hiring_title_suggestion', apiName: normalizeApiName(pathname) };
  }
  if (pathname.includes('/hiring-requests/jd-draft')) {
    return { module: 'hiring_jd_draft', apiName: normalizeApiName(pathname) };
  }
  if (pathname.includes('/hiring-requests/generate-brief')) {
    return { module: 'hiring_brief', apiName: normalizeApiName(pathname) };
  }
  // Auto-match is the smart matching feature
  if (/\/hiring-requests\/[^/]+\/auto-match/.test(pathname)) {
    return { module: 'smart_matching', apiName: normalizeApiName(pathname) };
  }
  // Intelligence report generation
  if (/\/hiring-requests\/[^/]+\/intelligence/.test(pathname)) {
    return { module: 'hiring_intelligence', apiName: normalizeApiName(pathname) };
  }
  // Batch invite from library
  if (/\/hiring-requests\/[^/]+\/batch-invite-from-library/.test(pathname)) {
    return { module: 'interview_invite', apiName: normalizeApiName(pathname) };
  }
  if (pathname.startsWith('/api/v1/hiring-requests')) {
    return { module: 'hiring_requests', apiName: normalizeApiName(pathname) };
  }

  // Core AI APIs
  if (pathname.includes('/match-resume')) {
    return { module: 'resume_match', apiName: normalizeApiName(pathname) };
  }
  if (pathname.includes('/evaluate-interview')) {
    return { module: 'interview_evaluation', apiName: normalizeApiName(pathname) };
  }
  if (pathname.includes('/invite-candidate') || pathname.includes('/batch-invite')) {
    return { module: 'interview_invite', apiName: normalizeApiName(pathname) };
  }
  if (pathname.includes('/parse-resume') || pathname.includes('/parse-resume-pdf')) {
    return { module: 'resume_parse', apiName: normalizeApiName(pathname) };
  }
  if (pathname.includes('/parse-jd')) {
    return { module: 'jd_parse', apiName: normalizeApiName(pathname) };
  }
  if (pathname.includes('/extract-document')) {
    return { module: 'document_extract', apiName: normalizeApiName(pathname) };
  }
  if (pathname.includes('/format-resume')) {
    return { module: 'resume_format', apiName: normalizeApiName(pathname) };
  }
  if (pathname.includes('/format-jd')) {
    return { module: 'jd_format', apiName: normalizeApiName(pathname) };
  }

  // Billing/demo/system
  if (
    pathname.includes('/checkout') ||
    pathname.includes('/topup') ||
    pathname.includes('/billing') ||
    pathname.includes('/webhooks/stripe')
  ) {
    return { module: 'billing', apiName: normalizeApiName(pathname) };
  }
  if (pathname.includes('/request-demo')) {
    return { module: 'demo', apiName: normalizeApiName(pathname) };
  }
  if (pathname.includes('/health') || pathname.includes('/stats') || pathname.includes('/logs')) {
    return { module: 'system', apiName: normalizeApiName(pathname) };
  }

  // Smart matching
  if (pathname.startsWith('/api/v1/matching')) {
    return { module: 'smart_matching', apiName: normalizeApiName(pathname) };
  }

  // Resume upload/reupload triggers parsing — classify as resume_parse
  if (/\/resumes\/(upload|upload-batch|[^/]+\/reupload)/.test(pathname)) {
    return { module: 'resume_parse', apiName: normalizeApiName(pathname) };
  }
  // Resumes management (CRUD, list, etc.)
  if (pathname.startsWith('/api/v1/resumes')) {
    return { module: 'resumes', apiName: normalizeApiName(pathname) };
  }

  // Jobs management
  if (pathname.startsWith('/api/v1/jobs')) {
    return { module: 'jobs', apiName: normalizeApiName(pathname) };
  }

  // ATS integrations
  if (pathname.startsWith('/api/v1/ats')) {
    return { module: 'ats', apiName: normalizeApiName(pathname) };
  }

  return { module: 'other', apiName: normalizeApiName(pathname) };
}
