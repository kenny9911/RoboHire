import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CodeBlock, EndpointCard, ParamTable } from '../../components/docs';

export default function DocsEvaluateInterview() {
  const { t } = useTranslation();

  const requestParams = [
    { name: 'transcript', type: 'string', required: true, description: 'The interview transcript text' },
    { name: 'position', type: 'string', description: 'Job position for context' },
    { name: 'questions', type: 'array', description: 'List of interview questions asked' },
    { name: 'evaluationCriteria', type: 'array', description: 'Custom evaluation criteria' },
  ];

  const responseParams = [
    { name: 'overallScore', type: 'number', description: 'Overall interview score (0-100)' },
    { name: 'recommendation', type: 'string', description: 'Hiring recommendation' },
    { name: 'summary', type: 'string', description: 'Executive summary of the evaluation' },
    { name: 'categoryScores', type: 'object', description: 'Scores broken down by category' },
    { name: 'strengths', type: 'array', description: 'Key strengths identified' },
    { name: 'concerns', type: 'array', description: 'Areas of concern' },
    { name: 'cheatingAnalysis', type: 'object', description: 'Analysis for potential cheating indicators' },
    { name: 'followUpQuestions', type: 'array', description: 'Suggested follow-up questions' },
  ];

  const exampleRequest = {
    curl: `curl -X POST https://api.robohire.io/v1/evaluate-interview \\
  -H "Authorization: Bearer rh_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "transcript": "Interviewer: Tell me about your experience with React.\\nCandidate: I have been working with React for about 6 years now. I started using it back in 2018...\\n\\nInterviewer: Can you describe a challenging project?\\nCandidate: Sure, I led a complete rewrite of our frontend...",
    "position": "Senior Frontend Developer",
    "questions": [
      "Tell me about your experience with React",
      "Can you describe a challenging project?"
    ]
  }'`,
    javascript: `const response = await fetch('https://api.robohire.io/v1/evaluate-interview', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer rh_your_api_key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    transcript: \`Interviewer: Tell me about your experience with React.
Candidate: I have been working with React for about 6 years now...

Interviewer: Can you describe a challenging project?
Candidate: Sure, I led a complete rewrite of our frontend...\`,
    position: 'Senior Frontend Developer',
    questions: [
      'Tell me about your experience with React',
      'Can you describe a challenging project?'
    ]
  })
});

const result = await response.json();`,
    python: `import requests

response = requests.post(
    'https://api.robohire.io/v1/evaluate-interview',
    headers={
        'Authorization': 'Bearer rh_your_api_key',
        'Content-Type': 'application/json'
    },
    json={
        'transcript': '''Interviewer: Tell me about your experience with React.
Candidate: I have been working with React for about 6 years now...

Interviewer: Can you describe a challenging project?
Candidate: Sure, I led a complete rewrite of our frontend...''',
        'position': 'Senior Frontend Developer',
        'questions': [
            'Tell me about your experience with React',
            'Can you describe a challenging project?'
        ]
    }
)

result = response.json()`,
  };

  const exampleResponse = `{
  "success": true,
  "data": {
    "overallScore": 85,
    "recommendation": "STRONG_HIRE",
    "summary": "Strong candidate with demonstrated technical expertise and leadership experience. Shows clear communication skills and problem-solving ability.",
    "categoryScores": {
      "technicalKnowledge": {
        "score": 90,
        "feedback": "Demonstrated deep understanding of React ecosystem"
      },
      "communication": {
        "score": 85,
        "feedback": "Clear and articulate responses with good examples"
      },
      "problemSolving": {
        "score": 80,
        "feedback": "Showed structured approach to problem-solving"
      },
      "culturalFit": {
        "score": 85,
        "feedback": "Values align well with team culture"
      }
    },
    "strengths": [
      "Extensive React experience with real-world examples",
      "Leadership experience managing frontend teams",
      "Clear communication and explanation of technical concepts",
      "Growth mindset and continuous learning attitude"
    ],
    "concerns": [
      "Limited experience with GraphQL (mentioned as nice-to-have)",
      "Could benefit from more exposure to testing frameworks"
    ],
    "cheatingAnalysis": {
      "suspicionLevel": "LOW",
      "indicators": [],
      "notes": "Responses appear authentic with natural variations and personal anecdotes"
    },
    "followUpQuestions": [
      "How would you approach implementing GraphQL in an existing REST-based architecture?",
      "Can you describe your testing philosophy and preferred tools?"
    ]
  }
}`;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-4">
        {t('docs.evaluateInterview.title', 'Evaluate Interview')}
      </h1>
      <p className="text-lg text-gray-600 mb-8">
        {t('docs.evaluateInterview.intro', 'Analyze interview transcripts to generate comprehensive evaluation reports with scoring, recommendations, and cheating detection.')}
      </p>

      <EndpointCard
        method="POST"
        path="/v1/evaluate-interview"
        description={t('docs.evaluateInterview.endpointDesc', 'Evaluate an interview transcript')}
      />

      {/* Request */}
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
        {t('docs.evaluateInterview.request', 'Request')}
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
        {t('docs.evaluateInterview.response', 'Response')}
      </h2>
      <ParamTable title={t('docs.common.responseFields', 'Response Fields')} params={responseParams} />

      <CodeBlock code={exampleResponse} language="json" title={t('docs.common.exampleResponse', 'Example Response')} />

      {/* Recommendation Values */}
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
        {t('docs.evaluateInterview.recommendations.title', 'Recommendation Values')}
      </h2>
      <div className="bg-gray-50 rounded-xl overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-500">{t('docs.evaluateInterview.recommendations.value', 'Value')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">{t('docs.evaluateInterview.recommendations.scoreRange', 'Score Range')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">{t('docs.evaluateInterview.recommendations.meaning', 'Meaning')}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="px-4 py-3"><code className="text-emerald-600">STRONG_HIRE</code></td>
              <td className="px-4 py-3 text-emerald-600">80-100</td>
              <td className="px-4 py-3 text-gray-600">{t('docs.evaluateInterview.recommendations.strongHire', 'Excellent candidate, highly recommend')}</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="px-4 py-3"><code className="text-blue-600">HIRE</code></td>
              <td className="px-4 py-3 text-blue-600">65-79</td>
              <td className="px-4 py-3 text-gray-600">{t('docs.evaluateInterview.recommendations.hire', 'Good candidate, recommend hiring')}</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="px-4 py-3"><code className="text-amber-600">MAYBE</code></td>
              <td className="px-4 py-3 text-amber-600">50-64</td>
              <td className="px-4 py-3 text-gray-600">{t('docs.evaluateInterview.recommendations.maybe', 'Some concerns, needs further evaluation')}</td>
            </tr>
            <tr>
              <td className="px-4 py-3"><code className="text-red-600">NO_HIRE</code></td>
              <td className="px-4 py-3 text-red-600">0-49</td>
              <td className="px-4 py-3 text-gray-600">{t('docs.evaluateInterview.recommendations.noHire', 'Does not meet requirements')}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Cheating Detection */}
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
        {t('docs.evaluateInterview.cheating.title', 'Cheating Detection')}
      </h2>
      <p className="text-gray-600 mb-4">
        {t('docs.evaluateInterview.cheating.desc', 'The API analyzes transcripts for potential cheating indicators:')}
      </p>
      <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
        <li>{t('docs.evaluateInterview.cheating.rehearsed', 'Unusually perfect or rehearsed-sounding responses')}</li>
        <li>{t('docs.evaluateInterview.cheating.inconsistencies', 'Inconsistencies between different answers')}</li>
        <li>{t('docs.evaluateInterview.cheating.verbatim', 'Responses that seem to be read verbatim')}</li>
        <li>{t('docs.evaluateInterview.cheating.pauses', 'Unusual pauses or typing sounds')}</li>
        <li>{t('docs.evaluateInterview.cheating.copyPaste', 'Copy-paste patterns in technical questions')}</li>
      </ul>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
        <p className="text-sm text-amber-800">
          <strong>{t('docs.evaluateInterview.note', 'Note')}:</strong> {t('docs.evaluateInterview.noteDesc', 'Cheating analysis is advisory and should be used alongside human judgment. A high suspicion level does not definitively indicate cheating.')}
        </p>
      </div>

      {/* Try It */}
      <div className="bg-indigo-50 rounded-xl p-6">
        <h3 className="font-semibold text-indigo-900 mb-2">
          {t('docs.evaluateInterview.tryIt.title', 'Try it out')}
        </h3>
        <p className="text-indigo-700 text-sm mb-3">
          {t('docs.evaluateInterview.tryIt.desc', 'Test this endpoint interactively in the API Playground.')}
        </p>
        <Link
          to="/api-playground/evaluate"
          className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          {t('docs.evaluateInterview.tryIt.cta', 'Open in Playground')}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
