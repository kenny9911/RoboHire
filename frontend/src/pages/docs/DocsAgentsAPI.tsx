import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { CodeBlock } from '../../components/docs';
import SEO from '../../components/SEO';

export default function DocsAgentsAPI() {
  const { t } = useTranslation();

  const listExample = {
    curl: `curl -X GET "https://api.robohire.io/api/v1/agents?status=active&taskType=search&createdAfter=2026-03-01T00:00:00Z&limit=20" \\
  -H "Authorization: Bearer YOUR_TOKEN"`,
    javascript: `const response = await fetch(
  'https://api.robohire.io/api/v1/agents?status=active&taskType=search',
  { headers: { 'Authorization': 'Bearer YOUR_TOKEN' } }
);
const { data, pagination } = await response.json();
console.log(\`Found \${pagination.total} agents\`);`,
    python: `import requests

response = requests.get(
    'https://api.robohire.io/api/v1/agents',
    params={'status': 'active', 'taskType': 'search', 'limit': 50},
    headers={'Authorization': 'Bearer YOUR_TOKEN'}
)
agents = response.json()['data']`,
  };

  const createExample = {
    curl: `curl -X POST "https://api.robohire.io/api/v1/agents" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Backend Engineer Search",
    "description": "Find Go/Rust engineers in Shanghai",
    "taskType": "search",
    "config": {"skills": ["Go", "Rust"], "experienceMin": 3}
  }'`,
    javascript: `const response = await fetch('https://api.robohire.io/api/v1/agents', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Backend Engineer Search',
    description: 'Find Go/Rust engineers in Shanghai',
    taskType: 'search',
    config: { skills: ['Go', 'Rust'], experienceMin: 3 }
  })
});
const { data } = await response.json();`,
    python: `import requests

response = requests.post(
    'https://api.robohire.io/api/v1/agents',
    json={
        'name': 'Backend Engineer Search',
        'description': 'Find Go/Rust engineers in Shanghai',
        'taskType': 'search',
        'config': {'skills': ['Go', 'Rust'], 'experienceMin': 3}
    },
    headers={'Authorization': 'Bearer YOUR_TOKEN'}
)
agent = response.json()['data']`,
  };

  const techArticleSchema = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    name: 'RoboHire Agents API Reference',
    description: 'Complete API reference for managing recruitment agents — list, create, update, delete agents with filtering and pagination.',
    url: 'https://robohire.io/docs/api/agents',
    proficiencyLevel: 'Beginner',
  };

  return (
    <div>
      <SEO
        title={t('docs.agents.seo.title', 'Agents API Reference')}
        description={t('docs.agents.seo.desc', 'Complete API reference for managing recruitment agents — list, create, get, update, delete with filters.')}
        url="https://robohire.io/docs/api/agents"
        keywords="agents api,recruitment agents,RoboHire API,agent management"
      />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(techArticleSchema)}</script>
      </Helmet>

      <h1 className="text-2xl font-bold text-slate-900 mb-2">
        {t('docs.agents.title', 'Agents API')}
      </h1>
      <p className="text-slate-600 mb-8">
        {t('docs.agents.intro', 'Create, manage, and monitor AI-powered recruitment agents. Agents autonomously source, screen, and rank candidates based on your criteria.')}
      </p>

      {/* ── List Agents ── */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-700 text-xs font-bold uppercase">GET</span>
          <code className="text-sm font-mono text-slate-800">/api/v1/agents</code>
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-3">
          {t('docs.agents.list.title', 'List Agents')}
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          {t('docs.agents.list.desc', 'Retrieve a paginated list of agents with optional filters for status, type, date range, and creator.')}
        </p>

        <h3 className="text-sm font-semibold text-slate-700 mb-2">{t('docs.agents.queryParams', 'Query Parameters')}</h3>
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-slate-700">{t('docs.common.parameter', 'Parameter')}</th>
                <th className="px-4 py-2 text-left font-semibold text-slate-700">{t('docs.common.type', 'Type')}</th>
                <th className="px-4 py-2 text-left font-semibold text-slate-700">{t('docs.common.required', 'Required')}</th>
                <th className="px-4 py-2 text-left font-semibold text-slate-700">{t('docs.common.description', 'Description')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                ['status', 'string', 'No', 'Filter: active, paused, configuring, completed, failed, closed, out_of_leads'],
                ['taskType', 'string', 'No', 'Filter: search, match'],
                ['createdBefore', 'ISO 8601', 'No', 'Only agents created before this datetime (e.g. 2026-03-30T12:00:00Z)'],
                ['createdAfter', 'ISO 8601', 'No', 'Only agents created after this datetime'],
                ['filterUserId', 'string', 'No', 'Filter by creator user ID (admin only)'],
                ['page', 'integer', 'No', 'Page number (default: 1)'],
                ['limit', 'integer', 'No', 'Items per page (default: 20, max: 100)'],
              ].map(([param, type, req, desc]) => (
                <tr key={param}>
                  <td className="px-4 py-2 font-mono text-xs text-blue-700">{param}</td>
                  <td className="px-4 py-2 text-slate-600">{type}</td>
                  <td className="px-4 py-2 text-slate-500">{req}</td>
                  <td className="px-4 py-2 text-slate-600">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <CodeBlock tabs={[
          { label: 'curl', code: listExample.curl, language: 'bash' },
          { label: 'JavaScript', code: listExample.javascript, language: 'javascript' },
          { label: 'Python', code: listExample.python, language: 'python' },
        ]} />
      </section>

      {/* ── Get Agent ── */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-700 text-xs font-bold uppercase">GET</span>
          <code className="text-sm font-mono text-slate-800">/api/v1/agents/:id</code>
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-3">
          {t('docs.agents.get.title', 'Get Agent')}
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          {t('docs.agents.get.desc', 'Retrieve a single agent by ID with full details including linked job, creator info, and candidate count.')}
        </p>
        <CodeBlock tabs={[
          { label: 'curl', code: `curl -X GET "https://api.robohire.io/api/v1/agents/AGENT_ID" \\\n  -H "Authorization: Bearer YOUR_TOKEN"`, language: 'bash' },
          { label: 'JavaScript', code: `const res = await fetch('https://api.robohire.io/api/v1/agents/AGENT_ID', {\n  headers: { 'Authorization': 'Bearer YOUR_TOKEN' }\n});\nconst agent = (await res.json()).data;`, language: 'javascript' },
          { label: 'Python', code: `response = requests.get(\n    'https://api.robohire.io/api/v1/agents/AGENT_ID',\n    headers={'Authorization': 'Bearer YOUR_TOKEN'}\n)\nagent = response.json()['data']`, language: 'python' },
        ]} />
      </section>

      {/* ── Create Agent ── */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-2.5 py-1 rounded-md bg-blue-100 text-blue-700 text-xs font-bold uppercase">POST</span>
          <code className="text-sm font-mono text-slate-800">/api/v1/agents</code>
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-3">
          {t('docs.agents.create.title', 'Create Agent')}
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          {t('docs.agents.create.desc', 'Create a new recruitment agent with search criteria and configuration.')}
        </p>

        <h3 className="text-sm font-semibold text-slate-700 mb-2">{t('docs.agents.requestBody', 'Request Body')}</h3>
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-slate-700">{t('docs.common.field', 'Field')}</th>
                <th className="px-4 py-2 text-left font-semibold text-slate-700">{t('docs.common.type', 'Type')}</th>
                <th className="px-4 py-2 text-left font-semibold text-slate-700">{t('docs.common.required', 'Required')}</th>
                <th className="px-4 py-2 text-left font-semibold text-slate-700">{t('docs.common.description', 'Description')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                ['name', 'string', 'Yes', 'Agent display name'],
                ['description', 'string', 'Yes', 'Search criteria / description'],
                ['jobId', 'string', 'No', 'Linked job ID'],
                ['taskType', 'string', 'No', 'search (default) or match'],
                ['instructions', 'string', 'No', 'Custom instructions for the agent'],
                ['config', 'object', 'No', 'Search config: { location, skills[], experienceMin, experienceMax, keywords[] }'],
              ].map(([field, type, req, desc]) => (
                <tr key={field}>
                  <td className="px-4 py-2 font-mono text-xs text-blue-700">{field}</td>
                  <td className="px-4 py-2 text-slate-600">{type}</td>
                  <td className="px-4 py-2 text-slate-500">{req}</td>
                  <td className="px-4 py-2 text-slate-600">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <CodeBlock tabs={[
          { label: 'curl', code: createExample.curl, language: 'bash' },
          { label: 'JavaScript', code: createExample.javascript, language: 'javascript' },
          { label: 'Python', code: createExample.python, language: 'python' },
        ]} />
      </section>

      {/* ── Update Agent ── */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-2.5 py-1 rounded-md bg-amber-100 text-amber-700 text-xs font-bold uppercase">PATCH</span>
          <code className="text-sm font-mono text-slate-800">/api/v1/agents/:id</code>
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-3">
          {t('docs.agents.update.title', 'Update Agent')}
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          {t('docs.agents.update.desc', 'Update an agent\'s name, description, status, job link, or configuration. All fields are optional.')}
        </p>
        <CodeBlock tabs={[
          { label: 'curl', code: '# Pause an agent\ncurl -X PATCH "https://api.robohire.io/api/v1/agents/AGENT_ID" \\\n  -H "Authorization: Bearer YOUR_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"status": "paused"}\'', language: 'bash' },
          { label: 'JavaScript', code: '// Pause an agent\nawait fetch(\'https://api.robohire.io/api/v1/agents/AGENT_ID\', {\n  method: \'PATCH\',\n  headers: { \'Authorization\': \'Bearer YOUR_TOKEN\', \'Content-Type\': \'application/json\' },\n  body: JSON.stringify({ status: \'paused\' })\n});', language: 'javascript' },
          { label: 'Python', code: '# Pause an agent\nrequests.patch(\n    \'https://api.robohire.io/api/v1/agents/AGENT_ID\',\n    json={\'status\': \'paused\'},\n    headers={\'Authorization\': \'Bearer YOUR_TOKEN\'}\n)', language: 'python' },
        ]} />
      </section>

      {/* ── Delete Agent ── */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-2.5 py-1 rounded-md bg-red-100 text-red-700 text-xs font-bold uppercase">DELETE</span>
          <code className="text-sm font-mono text-slate-800">/api/v1/agents/:id</code>
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-3">
          {t('docs.agents.delete.title', 'Delete Agent')}
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          {t('docs.agents.delete.desc', 'Permanently delete an agent and all its sourced candidates.')}
        </p>
        <CodeBlock tabs={[
          { label: 'curl', code: 'curl -X DELETE "https://api.robohire.io/api/v1/agents/AGENT_ID" \\\n  -H "Authorization: Bearer YOUR_TOKEN"', language: 'bash' },
          { label: 'JavaScript', code: 'await fetch(\'https://api.robohire.io/api/v1/agents/AGENT_ID\', {\n  method: \'DELETE\',\n  headers: { \'Authorization\': \'Bearer YOUR_TOKEN\' }\n});', language: 'javascript' },
          { label: 'Python', code: 'requests.delete(\n    \'https://api.robohire.io/api/v1/agents/AGENT_ID\',\n    headers={\'Authorization\': \'Bearer YOUR_TOKEN\'}\n)', language: 'python' },
        ]} />
      </section>

      {/* ── Response Schema ── */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">
          {t('docs.agents.schema.title', 'Agent Object Schema')}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-slate-700">{t('docs.common.field', 'Field')}</th>
                <th className="px-4 py-2 text-left font-semibold text-slate-700">{t('docs.common.type', 'Type')}</th>
                <th className="px-4 py-2 text-left font-semibold text-slate-700">{t('docs.common.description', 'Description')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                ['id', 'string', 'Unique agent ID'],
                ['name', 'string', 'Agent display name'],
                ['description', 'string', 'Natural language search criteria'],
                ['taskType', 'string', 'search or match'],
                ['status', 'string', 'configuring, active, paused, completed, failed, closed, out_of_leads'],
                ['jobId', 'string | null', 'Linked job ID'],
                ['config', 'object | null', 'Search config (location, skills, experience range)'],
                ['totalSourced', 'integer', 'Total candidates sourced'],
                ['totalApproved', 'integer', 'Approved candidates'],
                ['totalRejected', 'integer', 'Rejected candidates'],
                ['totalContacted', 'integer', 'Contacted candidates'],
                ['lastRunAt', 'datetime | null', 'Last execution timestamp'],
                ['createdAt', 'datetime', 'Creation timestamp'],
                ['updatedAt', 'datetime', 'Last update timestamp'],
                ['user', 'object', 'Creator: {id, name, email}'],
                ['job', 'object | null', 'Linked job: {id, title}'],
                ['_count.candidates', 'integer', 'Total candidate count'],
              ].map(([field, type, desc]) => (
                <tr key={field}>
                  <td className="px-4 py-2 font-mono text-xs text-blue-700">{field}</td>
                  <td className="px-4 py-2 text-slate-600">{type}</td>
                  <td className="px-4 py-2 text-slate-600">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
