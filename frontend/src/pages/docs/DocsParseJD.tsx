import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CodeBlock, EndpointCard, ParamTable } from '../../components/docs';
import SEO from '../../components/SEO';

export default function DocsParseJD() {
  const { t } = useTranslation();

  const requestParams = [
    { name: 'file', type: 'string (base64)', required: true, description: 'Base64-encoded PDF file of the job description' },
    { name: 'fileName', type: 'string', description: 'Original filename of the PDF' },
  ];

  const responseParams = [
    { name: 'title', type: 'string', description: 'Job title' },
    { name: 'company', type: 'string', description: 'Company name' },
    { name: 'location', type: 'string', description: 'Job location' },
    { name: 'type', type: 'string', description: 'Employment type (full-time, part-time, contract)' },
    { name: 'summary', type: 'string', description: 'Job summary/overview' },
    { name: 'responsibilities', type: 'array', description: 'List of key responsibilities' },
    { name: 'requirements', type: 'object', description: 'Required and preferred qualifications' },
    { name: 'benefits', type: 'array', description: 'List of benefits offered' },
    { name: 'salary', type: 'object', description: 'Salary range information if provided' },
  ];

  const exampleRequest = {
    curl: `curl -X POST https://api.robohire.io/v1/parse-jd \\
  -H "Authorization: Bearer rh_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "file": "JVBERi0xLjQKJeLjz9...", 
    "fileName": "senior_frontend_developer.pdf"
  }'`,
    javascript: `// Read PDF file and convert to base64
const fileBuffer = await fs.readFile('job_description.pdf');
const base64File = fileBuffer.toString('base64');

const response = await fetch('https://api.robohire.io/v1/parse-jd', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer rh_your_api_key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    file: base64File,
    fileName: 'job_description.pdf'
  })
});

const result = await response.json();`,
    python: `import requests
import base64

# Read PDF file and convert to base64
with open('job_description.pdf', 'rb') as f:
    file_content = base64.b64encode(f.read()).decode('utf-8')

response = requests.post(
    'https://api.robohire.io/v1/parse-jd',
    headers={
        'Authorization': 'Bearer rh_your_api_key',
        'Content-Type': 'application/json'
    },
    json={
        'file': file_content,
        'fileName': 'job_description.pdf'
    }
)

result = response.json()`,
  };

  const exampleResponse = `{
  "success": true,
  "data": {
    "title": "Senior Frontend Developer",
    "company": "Tech Corp",
    "location": "San Francisco, CA (Hybrid)",
    "type": "Full-time",
    "summary": "We are seeking a talented Senior Frontend Developer to join our growing engineering team and help build the next generation of our product platform.",
    "responsibilities": [
      "Lead frontend architecture decisions",
      "Mentor junior developers",
      "Collaborate with design and product teams",
      "Implement responsive, accessible UI components",
      "Optimize application performance"
    ],
    "requirements": {
      "mustHave": [
        "5+ years of frontend development experience",
        "Expert-level React and TypeScript skills",
        "Experience with state management (Redux, MobX, or similar)",
        "Strong understanding of web performance optimization"
      ],
      "niceToHave": [
        "Experience with GraphQL",
        "Knowledge of CI/CD pipelines",
        "Previous leadership or mentoring experience",
        "Contributions to open source projects"
      ],
      "education": "Bachelor's degree in Computer Science or equivalent experience"
    },
    "benefits": [
      "Competitive salary",
      "Health, dental, and vision insurance",
      "401(k) with company match",
      "Unlimited PTO",
      "Remote work flexibility"
    ],
    "salary": {
      "min": 150000,
      "max": 200000,
      "currency": "USD",
      "period": "yearly"
    }
  }
}`;

  return (
    <div>
      <SEO title={t('seo.docsParseJD.title', 'Parse Job Description API')} description={t('seo.docsParseJD.desc', 'API reference for job description parsing. Extract structured requirements from JDs.')} url="https://robohire.io/docs/api/parse-jd" keywords={t('seo.docsParseJD.keywords', 'RoboHire API documentation, job description parsing API, JD parser, AI recruitment')} />
      <h1 className="text-3xl font-bold text-gray-900 mb-4">
        {t('docs.parseJD.title', 'Parse Job Description')}
      </h1>
      <p className="text-lg text-gray-600 mb-8">
        {t('docs.parseJD.intro', 'Extract structured data from a job description PDF, including requirements, responsibilities, and benefits.')}
      </p>

      <EndpointCard
        method="POST"
        path="/v1/parse-jd"
        description={t('docs.parseJD.endpointDesc', 'Parse a job description PDF into structured data')}
      />

      {/* Request */}
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
        {t('docs.parseJD.request', 'Request')}
      </h2>
      <ParamTable title={t('docs.common.bodyParams', 'Body Parameters')} params={requestParams} />

      <CodeBlock
        tabs={[
          { label: 'cURL', code: exampleRequest.curl, language: 'bash' },
          { label: 'JavaScript', code: exampleRequest.javascript, language: 'javascript' },
          { label: 'Python', code: exampleRequest.python, language: 'python' },
        ]}
      />

      {/* Response */}
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
        {t('docs.parseJD.response', 'Response')}
      </h2>
      <ParamTable title={t('docs.common.responseFields', 'Response Fields')} params={responseParams} />

      <CodeBlock code={exampleResponse} language="json" title={t('docs.common.exampleResponse', 'Example Response')} />

      {/* Requirements Structure */}
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
        {t('docs.parseJD.requirements.title', 'Requirements Structure')}
      </h2>
      <p className="text-gray-600 mb-4">
        {t('docs.parseJD.requirements.desc', 'The requirements object contains categorized qualifications:')}
      </p>
      <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
        <li><code className="text-indigo-600">mustHave</code> - {t('docs.parseJD.requirements.mustHave', 'Required qualifications the candidate must possess')}</li>
        <li><code className="text-indigo-600">niceToHave</code> - {t('docs.parseJD.requirements.niceToHave', 'Preferred qualifications that are beneficial but not mandatory')}</li>
        <li><code className="text-indigo-600">education</code> - {t('docs.parseJD.requirements.education', 'Educational requirements')}</li>
      </ul>

      {/* Try It */}
      <div className="bg-indigo-50 rounded-xl p-6">
        <h3 className="font-semibold text-indigo-900 mb-2">
          {t('docs.parseJD.tryIt.title', 'Try it out')}
        </h3>
        <p className="text-indigo-700 text-sm mb-3">
          {t('docs.parseJD.tryIt.desc', 'Test this endpoint interactively in the API Playground.')}
        </p>
        <Link
          to="/api-playground/parse-jd"
          className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          {t('docs.parseJD.tryIt.cta', 'Open in Playground')}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
