import { useTranslation } from 'react-i18next';
import { CodeBlock, EndpointCard, ParamTable } from '../../components/docs';
import SEO from '../../components/SEO';

export default function DocsATSIntegrations() {
  const { t } = useTranslation();

  // ── Param definitions ──

  const connectParams = [
    { name: 'provider', type: 'string', required: true, description: t('docs.ats.connect.params.provider', 'ATS provider identifier. One of: greenhouse, lever, ashby, bamboohr, workable') },
    { name: 'credentials', type: 'object', required: true, description: t('docs.ats.connect.params.credentials', 'Provider-specific credential object') },
    { name: 'credentials.apiKey', type: 'string', required: true, description: t('docs.ats.connect.params.apiKey', 'API key or access token for the ATS') },
    { name: 'credentials.subdomain', type: 'string', required: false, description: t('docs.ats.connect.params.subdomain', 'Company subdomain (required for BambooHR and Workable)') },
  ];

  const syncParams = [
    { name: 'candidateId', type: 'string', required: true, description: t('docs.ats.sync.params.candidateId', 'RoboHire candidate ID to push to the ATS') },
    { name: 'atsJobId', type: 'string', required: true, description: t('docs.ats.sync.params.atsJobId', 'Job ID in the connected ATS to attach the candidate to') },
  ];

  const integrationResponse = [
    { name: 'id', type: 'string', description: t('docs.ats.response.id', 'Unique integration ID') },
    { name: 'provider', type: 'string', description: t('docs.ats.response.provider', 'ATS provider name') },
    { name: 'isActive', type: 'boolean', description: t('docs.ats.response.isActive', 'Whether the integration is currently active') },
    { name: 'syncEnabled', type: 'boolean', description: t('docs.ats.response.syncEnabled', 'Whether automatic sync is enabled') },
    { name: 'lastSyncAt', type: 'string | null', description: t('docs.ats.response.lastSyncAt', 'ISO 8601 timestamp of last sync operation') },
  ];

  const syncLogFields = [
    { name: 'id', type: 'string', description: t('docs.ats.logs.fields.id', 'Unique log entry ID') },
    { name: 'direction', type: 'string', description: t('docs.ats.logs.fields.direction', '"inbound" or "outbound"') },
    { name: 'entityType', type: 'string', description: t('docs.ats.logs.fields.entityType', '"job", "candidate", or "application"') },
    { name: 'entityId', type: 'string | null', description: t('docs.ats.logs.fields.entityId', 'RoboHire entity ID') },
    { name: 'externalId', type: 'string | null', description: t('docs.ats.logs.fields.externalId', 'Entity ID in the connected ATS') },
    { name: 'status', type: 'string', description: t('docs.ats.logs.fields.status', '"success", "failed", or "skipped"') },
    { name: 'error', type: 'string | null', description: t('docs.ats.logs.fields.error', 'Error message if the sync failed') },
    { name: 'createdAt', type: 'string', description: t('docs.ats.logs.fields.createdAt', 'ISO 8601 timestamp') },
  ];

  const providerInfo = [
    { name: 'greenhouse', type: 'Basic Auth', description: t('docs.ats.providers.greenhouse', 'API key as username, empty password. Harvest API (harvest.greenhouse.io/v1). Requires: apiKey') },
    { name: 'lever', type: 'Basic Auth', description: t('docs.ats.providers.lever', 'API key as username. Opportunity-centric model with auto-dedup. Requires: apiKey') },
    { name: 'ashby', type: 'Basic Auth', description: t('docs.ats.providers.ashby', 'API key as username. RPC-style endpoints. Requires: apiKey') },
    { name: 'bamboohr', type: 'Basic Auth', description: t('docs.ats.providers.bamboohr', 'API key as username. Subdomain-based URLs. Requires: apiKey, subdomain') },
    { name: 'workable', type: 'Bearer Token', description: t('docs.ats.providers.workable', 'Bearer token authentication. Subdomain-based URLs. Requires: apiKey (access token), subdomain') },
  ];

  // ── Code examples ──

  const connectGreenhouseExample = `curl -X POST https://api.robohire.io/api/v1/ats/integrations \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider": "greenhouse",
    "credentials": {
      "apiKey": "your_greenhouse_harvest_api_key"
    }
  }'`;

  const connectBamboohrExample = `curl -X POST https://api.robohire.io/api/v1/ats/integrations \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider": "bamboohr",
    "credentials": {
      "apiKey": "your_bamboohr_api_key",
      "subdomain": "your-company"
    }
  }'`;

  const connectResponseExample = `{
  "success": true,
  "data": {
    "id": "clx1abc2def3ghi4",
    "provider": "greenhouse",
    "isActive": true
  }
}`;

  const listIntegrationsExample = `curl https://api.robohire.io/api/v1/ats/integrations \\
  -H "Authorization: Bearer YOUR_TOKEN"`;

  const listResponseExample = `{
  "success": true,
  "data": [
    {
      "id": "clx1abc2def3ghi4",
      "provider": "greenhouse",
      "isActive": true,
      "syncEnabled": true,
      "lastSyncAt": "2026-03-10T14:30:00Z",
      "createdAt": "2026-03-01T09:00:00Z",
      "updatedAt": "2026-03-10T14:30:00Z"
    }
  ]
}`;

  const testConnectionExample = `curl -X POST https://api.robohire.io/api/v1/ats/integrations/clx1abc2def3ghi4/test \\
  -H "Authorization: Bearer YOUR_TOKEN"`;

  const testResponseExample = `{
  "success": true,
  "data": { "connected": true }
}`;

  const disconnectExample = `curl -X DELETE https://api.robohire.io/api/v1/ats/integrations/clx1abc2def3ghi4 \\
  -H "Authorization: Bearer YOUR_TOKEN"`;

  const listJobsExample = `curl https://api.robohire.io/api/v1/ats/integrations/clx1abc2def3ghi4/jobs \\
  -H "Authorization: Bearer YOUR_TOKEN"`;

  const listJobsResponseExample = `{
  "success": true,
  "data": [
    {
      "id": "4567890",
      "title": "Senior Frontend Developer",
      "status": "open",
      "department": "Engineering",
      "location": "San Francisco, CA"
    },
    {
      "id": "4567891",
      "title": "Product Manager",
      "status": "open",
      "department": "Product",
      "location": "Remote"
    }
  ]
}`;

  const syncCandidateExample = `curl -X POST https://api.robohire.io/api/v1/ats/integrations/clx1abc2def3ghi4/sync \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "candidateId": "clx9candidate123",
    "atsJobId": "4567890"
  }'`;

  const syncResponseExample = `{
  "success": true,
  "data": {
    "externalId": "gh_candidate_78901234"
  }
}`;

  const syncLogsExample = `curl "https://api.robohire.io/api/v1/ats/integrations/clx1abc2def3ghi4/logs?limit=10" \\
  -H "Authorization: Bearer YOUR_TOKEN"`;

  const syncLogsResponseExample = `{
  "success": true,
  "data": [
    {
      "id": "clxlog123",
      "direction": "outbound",
      "entityType": "candidate",
      "entityId": "clx9candidate123",
      "externalId": "gh_candidate_78901234",
      "status": "success",
      "error": null,
      "createdAt": "2026-03-10T14:30:00Z"
    }
  ]
}`;

  const inboundWebhookExample = `// Greenhouse sends a webhook to your RoboHire integration:
// POST https://api.robohire.io/api/v1/ats/webhooks/greenhouse
//
// When a candidate's stage changes in Greenhouse,
// RoboHire automatically updates the matching local candidate record.`;

  const jsConnectExample = `import axios from 'axios';

const api = axios.create({
  baseURL: 'https://api.robohire.io/api/v1',
  headers: { Authorization: 'Bearer YOUR_TOKEN' },
});

// Connect Greenhouse
const { data } = await api.post('/ats/integrations', {
  provider: 'greenhouse',
  credentials: { apiKey: 'your_greenhouse_api_key' },
});
console.log('Connected:', data.data.id);

// List ATS jobs
const jobs = await api.get(\`/ats/integrations/\${data.data.id}/jobs\`);
console.log('Open jobs:', jobs.data.data);

// Sync a candidate to a specific job
const sync = await api.post(\`/ats/integrations/\${data.data.id}/sync\`, {
  candidateId: 'clx9candidate123',
  atsJobId: jobs.data.data[0].id,
});
console.log('External ID:', sync.data.data.externalId);`;

  const pyConnectExample = `import requests

BASE = "https://api.robohire.io/api/v1"
headers = {"Authorization": "Bearer YOUR_TOKEN"}

# Connect Lever
resp = requests.post(f"{BASE}/ats/integrations", json={
    "provider": "lever",
    "credentials": {"apiKey": "your_lever_api_key"}
}, headers=headers)
integration_id = resp.json()["data"]["id"]

# List ATS jobs
jobs = requests.get(
    f"{BASE}/ats/integrations/{integration_id}/jobs",
    headers=headers
).json()["data"]

# Sync a candidate
sync = requests.post(
    f"{BASE}/ats/integrations/{integration_id}/sync",
    json={"candidateId": "clx9candidate123", "atsJobId": jobs[0]["id"]},
    headers=headers
)
print("External ID:", sync.json()["data"]["externalId"])`;

  const checkIcon = (
    <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );

  return (
    <div>
      <SEO
        title={t('seo.docsATS.title', 'ATS Integrations - RoboHire API Documentation')}
        description={t('seo.docsATS.desc', 'Connect RoboHire with Greenhouse, Lever, Ashby, BambooHR, and Workable. Push candidates, sync stages, and automate your hiring pipeline.')}
        url="https://robohire.io/docs/ats-integrations"
        keywords={t('seo.docsATS.keywords', 'RoboHire ATS integration, Greenhouse API, Lever API, Ashby API, BambooHR API, Workable API, applicant tracking system, candidate sync')}
        structuredData={{
          '@type': 'TechArticle',
          headline: 'ATS Integrations Guide',
          description: 'Connect RoboHire with popular Applicant Tracking Systems to sync candidates automatically.',
          url: 'https://robohire.io/docs/ats-integrations',
          author: { '@type': 'Organization', name: 'RoboHire' },
          datePublished: '2026-03-10',
          proficiencyLevel: 'Advanced',
        }}
      />

      {/* ── Title ── */}
      <h1 className="text-3xl font-bold text-slate-900 landing-display mb-4">
        {t('docs.ats.title', 'ATS Integrations')}
      </h1>
      <p className="text-lg text-slate-600 mb-8">
        {t('docs.ats.intro', 'Connect RoboHire with your Applicant Tracking System to push matched candidates directly into your hiring pipeline. Supports Greenhouse, Lever, Ashby, BambooHR, and Workable.')}
      </p>

      {/* ── Supported Providers ── */}
      <h2 className="text-xl font-semibold text-slate-900 mt-8 mb-4">
        {t('docs.ats.providers.title', 'Supported Providers')}
      </h2>
      <p className="text-slate-600 mb-4">
        {t('docs.ats.providers.intro', 'Each provider uses its own authentication method and API structure. RoboHire normalizes them into a unified interface.')}
      </p>
      <ParamTable title={t('docs.ats.providers.tableTitle', 'Provider Reference')} params={providerInfo} />

      {/* ── Connect an ATS ── */}
      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
        {t('docs.ats.connect.title', 'Connecting an ATS')}
      </h2>
      <p className="text-slate-600 mb-4">
        {t('docs.ats.connect.intro', 'To connect an ATS, provide your API credentials. RoboHire will validate the connection before saving. Credentials are encrypted at rest using AES-256-GCM.')}
      </p>
      <EndpointCard method="POST" path="/api/v1/ats/integrations" description={t('docs.ats.connect.endpointDesc', 'Connect a new ATS integration. Validates credentials before saving.')} />
      <ParamTable title={t('docs.ats.connect.paramsTitle', 'Request Body')} params={connectParams} />

      <CodeBlock
        tabs={[
          { label: 'Greenhouse', code: connectGreenhouseExample, language: 'bash' },
          { label: 'BambooHR', code: connectBamboohrExample, language: 'bash' },
        ]}
      />
      <CodeBlock code={connectResponseExample} language="json" title={t('docs.ats.connect.responseTitle', 'Response')} />

      {/* ── Manage Integrations ── */}
      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
        {t('docs.ats.manage.title', 'Managing Integrations')}
      </h2>

      <h3 className="text-lg font-medium text-slate-800 mt-6 mb-3">
        {t('docs.ats.manage.list.title', 'List Integrations')}
      </h3>
      <EndpointCard method="GET" path="/api/v1/ats/integrations" description={t('docs.ats.manage.list.desc', 'List all ATS integrations for the authenticated user.')} />
      <CodeBlock code={listIntegrationsExample} language="bash" title={t('docs.ats.manage.list.exampleTitle', 'Request')} />
      <CodeBlock code={listResponseExample} language="json" title={t('docs.ats.manage.list.responseTitle', 'Response')} />
      <ParamTable title={t('docs.ats.manage.list.fieldsTitle', 'Integration Fields')} params={integrationResponse} />

      <h3 className="text-lg font-medium text-slate-800 mt-6 mb-3">
        {t('docs.ats.manage.test.title', 'Test Connection')}
      </h3>
      <EndpointCard method="POST" path="/api/v1/ats/integrations/:id/test" description={t('docs.ats.manage.test.desc', 'Test whether the stored credentials are still valid.')} />
      <CodeBlock code={testConnectionExample} language="bash" title={t('docs.ats.manage.test.exampleTitle', 'Request')} />
      <CodeBlock code={testResponseExample} language="json" title={t('docs.ats.manage.test.responseTitle', 'Response')} />

      <h3 className="text-lg font-medium text-slate-800 mt-6 mb-3">
        {t('docs.ats.manage.disconnect.title', 'Disconnect')}
      </h3>
      <EndpointCard method="DELETE" path="/api/v1/ats/integrations/:id" description={t('docs.ats.manage.disconnect.desc', 'Deactivate an ATS integration. Credentials are preserved but marked inactive.')} />
      <CodeBlock code={disconnectExample} language="bash" title={t('docs.ats.manage.disconnect.exampleTitle', 'Request')} />

      {/* ── Sync Candidates ── */}
      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
        {t('docs.ats.sync.title', 'Syncing Candidates')}
      </h2>
      <p className="text-slate-600 mb-4">
        {t('docs.ats.sync.intro', 'Push matched candidates from RoboHire directly into your ATS. First, list available jobs from the ATS, then sync candidates to specific job openings.')}
      </p>

      <h3 className="text-lg font-medium text-slate-800 mt-6 mb-3">
        {t('docs.ats.sync.listJobs.title', 'List ATS Jobs')}
      </h3>
      <EndpointCard method="GET" path="/api/v1/ats/integrations/:id/jobs" description={t('docs.ats.sync.listJobs.desc', 'List open jobs from the connected ATS. Use the job ID to sync candidates.')} />
      <CodeBlock code={listJobsExample} language="bash" title={t('docs.ats.sync.listJobs.exampleTitle', 'Request')} />
      <CodeBlock code={listJobsResponseExample} language="json" title={t('docs.ats.sync.listJobs.responseTitle', 'Response')} />

      <h3 className="text-lg font-medium text-slate-800 mt-6 mb-3">
        {t('docs.ats.sync.push.title', 'Push Candidate to ATS')}
      </h3>
      <EndpointCard method="POST" path="/api/v1/ats/integrations/:id/sync" description={t('docs.ats.sync.push.desc', 'Push a RoboHire candidate into the connected ATS for a specific job.')} />
      <ParamTable title={t('docs.ats.sync.push.paramsTitle', 'Request Body')} params={syncParams} />
      <CodeBlock code={syncCandidateExample} language="bash" title={t('docs.ats.sync.push.exampleTitle', 'Request')} />
      <CodeBlock code={syncResponseExample} language="json" title={t('docs.ats.sync.push.responseTitle', 'Response')} />

      {/* ── Full workflow examples ── */}
      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
        {t('docs.ats.workflow.title', 'Full Workflow Examples')}
      </h2>
      <p className="text-slate-600 mb-4">
        {t('docs.ats.workflow.intro', 'Connect, list jobs, and sync a candidate in a single workflow:')}
      </p>
      <CodeBlock
        tabs={[
          { label: 'JavaScript', code: jsConnectExample, language: 'javascript' },
          { label: 'Python', code: pyConnectExample, language: 'python' },
        ]}
      />

      {/* ── Sync Logs ── */}
      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
        {t('docs.ats.logs.title', 'Sync Logs')}
      </h2>
      <p className="text-slate-600 mb-4">
        {t('docs.ats.logs.intro', 'Every sync operation is logged for auditability. View logs to debug failures or confirm successful syncs.')}
      </p>
      <EndpointCard method="GET" path="/api/v1/ats/integrations/:id/logs" description={t('docs.ats.logs.endpointDesc', 'Retrieve sync logs for an integration. Supports ?limit= (max 200, default 50).')} />
      <CodeBlock code={syncLogsExample} language="bash" title={t('docs.ats.logs.exampleTitle', 'Request')} />
      <CodeBlock code={syncLogsResponseExample} language="json" title={t('docs.ats.logs.responseTitle', 'Response')} />
      <ParamTable title={t('docs.ats.logs.fieldsTitle', 'Log Entry Fields')} params={syncLogFields} />

      {/* ── Inbound Webhooks ── */}
      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
        {t('docs.ats.inbound.title', 'Inbound Webhooks from ATS')}
      </h2>
      <p className="text-slate-600 mb-4">
        {t('docs.ats.inbound.intro', 'RoboHire can receive webhooks from connected ATS providers to keep candidate status in sync. When a candidate\'s stage changes in your ATS, RoboHire automatically updates the local record.')}
      </p>
      <EndpointCard method="POST" path="/api/v1/ats/webhooks/:provider" description={t('docs.ats.inbound.endpointDesc', 'Public endpoint for ATS providers to send webhook events. No authentication required — validated by provider-specific signatures.')} />
      <CodeBlock code={inboundWebhookExample} language="javascript" title={t('docs.ats.inbound.exampleTitle', 'How It Works')} />
      <p className="text-sm text-slate-500 mt-2 mb-6">
        {t('docs.ats.inbound.note', 'Configure the webhook URL in your ATS settings. The :provider parameter must match one of: greenhouse, lever, ashby, bamboohr, workable.')}
      </p>

      {/* ── Best Practices ── */}
      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
        {t('docs.ats.bestPractices.title', 'Best Practices')}
      </h2>
      <div className="bg-blue-50 rounded-xl p-6">
        <ul className="space-y-3 text-blue-800 text-sm">
          <li className="flex items-start gap-2">
            {checkIcon}
            <span>{t('docs.ats.bestPractices.testFirst', 'Test first: Always use the test endpoint after connecting to verify your credentials work')}</span>
          </li>
          <li className="flex items-start gap-2">
            {checkIcon}
            <span>{t('docs.ats.bestPractices.rotateKeys', 'Rotate keys: If you rotate API keys in your ATS, reconnect the integration with the new key')}</span>
          </li>
          <li className="flex items-start gap-2">
            {checkIcon}
            <span>{t('docs.ats.bestPractices.checkLogs', 'Monitor logs: Check sync logs regularly to catch failed syncs early')}</span>
          </li>
          <li className="flex items-start gap-2">
            {checkIcon}
            <span>{t('docs.ats.bestPractices.onePerProvider', 'One per provider: Each user can connect one integration per ATS provider')}</span>
          </li>
          <li className="flex items-start gap-2">
            {checkIcon}
            <span>{t('docs.ats.bestPractices.permissions', 'Minimal permissions: Use ATS API keys scoped to only the permissions RoboHire needs (read jobs, create candidates)')}</span>
          </li>
          <li className="flex items-start gap-2">
            {checkIcon}
            <span>{t('docs.ats.bestPractices.encryption', 'Security: All credentials are encrypted at rest using AES-256-GCM. RoboHire never stores plaintext API keys')}</span>
          </li>
        </ul>
      </div>

      {/* ── Error Handling ── */}
      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
        {t('docs.ats.errors.title', 'Error Handling')}
      </h2>
      <p className="text-slate-600 mb-4">
        {t('docs.ats.errors.intro', 'All ATS endpoints return standard RoboHire error responses:')}
      </p>
      <div className="overflow-x-auto mb-6">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 pr-4 font-semibold text-slate-700">{t('docs.ats.errors.status', 'Status')}</th>
              <th className="text-left py-2 pr-4 font-semibold text-slate-700">{t('docs.ats.errors.meaning', 'Meaning')}</th>
            </tr>
          </thead>
          <tbody className="text-slate-600">
            <tr className="border-b border-slate-100">
              <td className="py-2 pr-4 font-mono">400</td>
              <td className="py-2">{t('docs.ats.errors.400', 'Invalid request — missing fields, invalid provider, or bad credentials')}</td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-2 pr-4 font-mono">401</td>
              <td className="py-2">{t('docs.ats.errors.401', 'Authentication required — include a valid JWT or API key')}</td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-2 pr-4 font-mono">404</td>
              <td className="py-2">{t('docs.ats.errors.404', 'Integration not found or does not belong to the authenticated user')}</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono">500</td>
              <td className="py-2">{t('docs.ats.errors.500', 'Server error — check sync logs for details')}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
