import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CodeBlock, EndpointCard, ParamTable } from '../../components/docs';

export default function DocsMatchResume() {
  const { t } = useTranslation();

  const requestParams = [
    { name: 'resumeText', type: 'string', required: true, description: 'The resume content as plain text' },
    { name: 'jdText', type: 'string', required: true, description: 'The job description content as plain text' },
    { name: 'resumeFile', type: 'string (base64)', description: 'Base64-encoded PDF file of the resume (alternative to resumeText)' },
    { name: 'jdFile', type: 'string (base64)', description: 'Base64-encoded PDF file of the JD (alternative to jdText)' },
  ];

  const responseParams = [
    { name: 'matchScore', type: 'number', description: 'Overall match score from 0-100' },
    { name: 'recommendation', type: 'string', description: 'STRONG_MATCH, GOOD_MATCH, PARTIAL_MATCH, or WEAK_MATCH' },
    { name: 'summary', type: 'string', description: 'Brief summary of the match analysis' },
    { name: 'matchAnalysis', type: 'object', description: 'Detailed breakdown of the match by category' },
    { name: 'mustHaveAnalysis', type: 'object', description: 'Analysis of required skills and qualifications' },
    { name: 'niceToHaveAnalysis', type: 'object', description: 'Analysis of preferred skills and qualifications' },
  ];

  const exampleRequest = {
    curl: `curl -X POST https://api.robohire.io/v1/match-resume \\
  -H "Authorization: Bearer rh_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "resumeText": "John Doe\\nSenior Frontend Developer\\n\\nExperience:\\n- 6 years of React development\\n- TypeScript, Node.js, GraphQL\\n- Led team of 5 developers\\n\\nEducation:\\nBS Computer Science, MIT",
    "jdText": "We are looking for a Senior Frontend Developer with:\\n- 5+ years React experience\\n- Strong TypeScript skills\\n- Experience with GraphQL\\n- Leadership experience preferred"
  }'`,
    javascript: `const response = await fetch('https://api.robohire.io/v1/match-resume', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer rh_your_api_key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    resumeText: \`John Doe
Senior Frontend Developer

Experience:
- 6 years of React development
- TypeScript, Node.js, GraphQL
- Led team of 5 developers

Education:
BS Computer Science, MIT\`,
    jdText: \`We are looking for a Senior Frontend Developer with:
- 5+ years React experience
- Strong TypeScript skills
- Experience with GraphQL
- Leadership experience preferred\`
  })
});

const result = await response.json();`,
    python: `import requests

response = requests.post(
    'https://api.robohire.io/v1/match-resume',
    headers={
        'Authorization': 'Bearer rh_your_api_key',
        'Content-Type': 'application/json'
    },
    json={
        'resumeText': '''John Doe
Senior Frontend Developer

Experience:
- 6 years of React development
- TypeScript, Node.js, GraphQL
- Led team of 5 developers

Education:
BS Computer Science, MIT''',
        'jdText': '''We are looking for a Senior Frontend Developer with:
- 5+ years React experience
- Strong TypeScript skills
- Experience with GraphQL
- Leadership experience preferred'''
    }
)

result = response.json()`,
  };

  const exampleResponse = `{
  "success": true,
  "data": {
    "matchScore": 92,
    "recommendation": "STRONG_MATCH",
    "summary": "Excellent match. Candidate exceeds requirements with 6 years React experience and demonstrated leadership skills.",
    "matchAnalysis": {
      "technicalSkills": {
        "score": 95,
        "matchedSkills": ["React", "TypeScript", "GraphQL", "Node.js"],
        "missingSkills": []
      },
      "experienceLevel": {
        "score": 90,
        "required": "5+ years",
        "candidate": "6 years",
        "assessment": "Exceeds requirement"
      },
      "leadership": {
        "score": 85,
        "hasLeadership": true,
        "details": "Led team of 5 developers"
      }
    },
    "mustHaveAnalysis": {
      "extractedMustHaves": {
        "skills": ["React", "TypeScript", "GraphQL"],
        "experience": ["5+ years frontend"]
      },
      "candidateMustHaves": {
        "skills": ["React", "TypeScript", "GraphQL", "Node.js"],
        "experience": ["6 years frontend development"]
      },
      "matchedMustHaves": ["React - 6 years experience", "TypeScript - proficient", "GraphQL - experienced"]
    },
    "niceToHaveAnalysis": {
      "extractedNiceToHaves": {
        "skills": ["Leadership"],
        "certifications": []
      },
      "matchedNiceToHaves": ["Leadership - led team of 5"]
    }
  }
}`;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-4">
        {t('docs.matchResume.title', 'Match Resume')}
      </h1>
      <p className="text-lg text-gray-600 mb-8">
        {t('docs.matchResume.intro', 'Match a resume against a job description to get an AI-powered compatibility score and detailed analysis.')}
      </p>

      <EndpointCard
        method="POST"
        path="/v1/match-resume"
        description={t('docs.matchResume.endpointDesc', 'Match a resume against a job description')}
      />

      {/* Request */}
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
        {t('docs.matchResume.request', 'Request')}
      </h2>
      <ParamTable title={t('docs.common.bodyParams', 'Body Parameters')} params={requestParams} />

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
        <p className="text-sm text-blue-800">
          <strong>{t('docs.matchResume.note', 'Note')}:</strong> {t('docs.matchResume.noteDesc', 'You can provide either text content (resumeText/jdText) or base64-encoded PDF files (resumeFile/jdFile). If both are provided, the file takes precedence.')}
        </p>
      </div>

      <CodeBlock
        tabs={[
          { label: 'cURL', code: exampleRequest.curl, language: 'bash' },
          { label: 'JavaScript', code: exampleRequest.javascript, language: 'javascript' },
          { label: 'Python', code: exampleRequest.python, language: 'python' },
        ]}
      />

      {/* Response */}
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
        {t('docs.matchResume.response', 'Response')}
      </h2>
      <ParamTable title={t('docs.common.responseFields', 'Response Fields')} params={responseParams} />

      <CodeBlock code={exampleResponse} language="json" title={t('docs.common.exampleResponse', 'Example Response')} />

      {/* Match Scores */}
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
        {t('docs.matchResume.scoring.title', 'Match Scoring')}
      </h2>
      <p className="text-gray-600 mb-4">
        {t('docs.matchResume.scoring.desc', 'The match score is calculated based on multiple factors:')}
      </p>
      <div className="bg-gray-50 rounded-xl overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-500">{t('docs.matchResume.scoring.scoreRange', 'Score Range')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">{t('docs.matchResume.scoring.recommendation', 'Recommendation')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">{t('docs.matchResume.scoring.meaning', 'Meaning')}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="px-4 py-3 text-emerald-600 font-medium">80-100</td>
              <td className="px-4 py-3"><code>STRONG_MATCH</code></td>
              <td className="px-4 py-3 text-gray-600">{t('docs.matchResume.scoring.strong', 'Excellent fit, meets or exceeds requirements')}</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="px-4 py-3 text-blue-600 font-medium">60-79</td>
              <td className="px-4 py-3"><code>GOOD_MATCH</code></td>
              <td className="px-4 py-3 text-gray-600">{t('docs.matchResume.scoring.good', 'Good fit, meets most requirements')}</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="px-4 py-3 text-amber-600 font-medium">40-59</td>
              <td className="px-4 py-3"><code>PARTIAL_MATCH</code></td>
              <td className="px-4 py-3 text-gray-600">{t('docs.matchResume.scoring.partial', 'Some alignment, missing key requirements')}</td>
            </tr>
            <tr>
              <td className="px-4 py-3 text-red-600 font-medium">0-39</td>
              <td className="px-4 py-3"><code>WEAK_MATCH</code></td>
              <td className="px-4 py-3 text-gray-600">{t('docs.matchResume.scoring.weak', 'Poor fit, significant gaps')}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Try It */}
      <div className="bg-indigo-50 rounded-xl p-6">
        <h3 className="font-semibold text-indigo-900 mb-2">
          {t('docs.matchResume.tryIt.title', 'Try it out')}
        </h3>
        <p className="text-indigo-700 text-sm mb-3">
          {t('docs.matchResume.tryIt.desc', 'Test this endpoint interactively in the API Playground.')}
        </p>
        <Link
          to="/api-playground/match-resume"
          className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          {t('docs.matchResume.tryIt.cta', 'Open in Playground')}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
