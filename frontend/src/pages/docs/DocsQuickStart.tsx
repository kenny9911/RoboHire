import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { CodeBlock } from '../../components/docs';
import SEO from '../../components/SEO';

export default function DocsQuickStart() {
  const { t } = useTranslation();

  const installCode = {
    curl: `# No installation needed - use curl directly`,
    javascript: `npm install node-fetch
# or
yarn add node-fetch`,
    python: `pip install requests`,
  };

  const matchResumeCode = {
    curl: `curl -X POST https://api.robohire.io/v1/match-resume \\
  -H "Authorization: Bearer rh_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "resumeText": "John Doe\\nSenior Frontend Developer\\n5+ years React, TypeScript...",
    "jdText": "Looking for Senior Frontend Developer with React experience..."
  }'`,
    javascript: `const response = await fetch('https://api.robohire.io/v1/match-resume', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer rh_your_api_key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    resumeText: 'John Doe\\nSenior Frontend Developer\\n5+ years React, TypeScript...',
    jdText: 'Looking for Senior Frontend Developer with React experience...'
  })
});

const result = await response.json();
console.log(result.data.matchScore); // e.g., 85`,
    python: `import requests

response = requests.post(
    'https://api.robohire.io/v1/match-resume',
    headers={
        'Authorization': 'Bearer rh_your_api_key',
        'Content-Type': 'application/json'
    },
    json={
        'resumeText': 'John Doe\\nSenior Frontend Developer\\n5+ years React, TypeScript...',
        'jdText': 'Looking for Senior Frontend Developer with React experience...'
    }
)

result = response.json()
print(result['data']['matchScore'])  # e.g., 85`,
  };

  const howToSchema = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'How to Integrate the RoboHire AI Hiring API',
    description: 'Get up and running with the RoboHire API in 5 minutes. Match resumes against job descriptions using AI.',
    totalTime: 'PT5M',
    step: [
      { '@type': 'HowToStep', position: 1, name: 'Get your API key', text: 'Sign up for a RoboHire account and generate an API key from your dashboard.' },
      { '@type': 'HowToStep', position: 2, name: 'Install dependencies', text: 'Install an HTTP client library for your programming language (e.g., node-fetch for JavaScript, requests for Python).' },
      { '@type': 'HowToStep', position: 3, name: 'Make your first API call', text: 'Send a POST request to /v1/match-resume with resumeText and jdText to match a resume against a job description.' },
      { '@type': 'HowToStep', position: 4, name: 'Handle the response', text: 'Parse the JSON response containing matchScore, recommendation, and detailed matchAnalysis with technical skills and experience scores.' },
    ],
  };

  return (
    <div>
      <SEO title={t('seo.docsQuickStart.title', 'Quick Start Guide')} description={t('seo.docsQuickStart.desc', 'Get up and running with the RoboHire API in 5 minutes. Step-by-step integration guide.')} url="https://robohire.io/docs/quick-start" keywords={t('seo.docsQuickStart.keywords', 'RoboHire API documentation, quick start guide, API integration')} />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(howToSchema)}</script>
      </Helmet>
      <h1 className="text-3xl font-bold text-gray-900 mb-4">
        {t('docs.quickStart.title', 'Quick Start')}
      </h1>
      <p className="text-lg text-gray-600 mb-8">
        {t('docs.quickStart.intro', 'Get up and running with the RoboHire in just a few minutes.')}
      </p>

      {/* Step 1 */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-sm">1</span>
          <h2 className="text-xl font-semibold text-gray-900">
            {t('docs.quickStart.step1.title', 'Get your API key')}
          </h2>
        </div>
        <p className="text-gray-600 mb-4 ml-11">
          {t('docs.quickStart.step1.desc', 'Sign up for a RoboHire account and generate an API key from your dashboard.')}
        </p>
        <div className="ml-11">
          <Link
            to="/dashboard/api-keys"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {t('docs.quickStart.step1.cta', 'Get API Key')}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Step 2 */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-sm">2</span>
          <h2 className="text-xl font-semibold text-gray-900">
            {t('docs.quickStart.step2.title', 'Install dependencies (optional)')}
          </h2>
        </div>
        <p className="text-gray-600 mb-4 ml-11">
          {t('docs.quickStart.step2.desc', 'Install any HTTP client library for your programming language.')}
        </p>
        <div className="ml-11">
          <CodeBlock
            tabs={[
              { label: 'cURL', code: installCode.curl, language: 'bash' },
              { label: 'JavaScript', code: installCode.javascript, language: 'bash' },
              { label: 'Python', code: installCode.python, language: 'bash' },
            ]}
          />
        </div>
      </div>

      {/* Step 3 */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-sm">3</span>
          <h2 className="text-xl font-semibold text-gray-900">
            {t('docs.quickStart.step3.title', 'Make your first API call')}
          </h2>
        </div>
        <p className="text-gray-600 mb-4 ml-11">
          {t('docs.quickStart.step3.desc', "Let's match a resume against a job description:")}
        </p>
        <div className="ml-11">
          <CodeBlock
            tabs={[
              { label: 'cURL', code: matchResumeCode.curl, language: 'bash' },
              { label: 'JavaScript', code: matchResumeCode.javascript, language: 'javascript' },
              { label: 'Python', code: matchResumeCode.python, language: 'python' },
            ]}
          />
        </div>
      </div>

      {/* Step 4 */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-sm">4</span>
          <h2 className="text-xl font-semibold text-gray-900">
            {t('docs.quickStart.step4.title', 'Handle the response')}
          </h2>
        </div>
        <p className="text-gray-600 mb-4 ml-11">
          {t('docs.quickStart.step4.desc', "You'll receive a JSON response with the match analysis:")}
        </p>
        <div className="ml-11">
          <CodeBlock
            language="json"
            code={`{
  "success": true,
  "data": {
    "matchScore": 85,
    "recommendation": "STRONG_MATCH",
    "summary": "The candidate has excellent relevant experience...",
    "matchAnalysis": {
      "technicalSkills": {
        "score": 90,
        "matched": ["React", "TypeScript", "Node.js"],
        "missing": ["GraphQL"]
      },
      "experienceLevel": {
        "score": 85,
        "yearsRequired": "5+",
        "yearsCandidate": "6"
      }
    }
  }
}`}
          />
        </div>
      </div>

      {/* Next Steps */}
      <div className="bg-gray-50 rounded-xl p-6">
        <h3 className="font-semibold text-gray-900 mb-4">
          {t('docs.quickStart.nextSteps.title', 'Next steps')}
        </h3>
        <ul className="space-y-3">
          <li>
            <Link to="/docs/authentication" className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {t('docs.quickStart.nextSteps.auth', 'Learn about authentication methods')}
            </Link>
          </li>
          <li>
            <Link to="/docs/api/match-resume" className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {t('docs.quickStart.nextSteps.matchResume', 'Explore the Match Resume API')}
            </Link>
          </li>
          <li>
            <Link to="/api-playground" className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {t('docs.quickStart.nextSteps.playground', 'Try the interactive Playground')}
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
