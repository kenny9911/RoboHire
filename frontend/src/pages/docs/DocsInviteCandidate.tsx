import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CodeBlock, EndpointCard, ParamTable } from '../../components/docs';

export default function DocsInviteCandidate() {
  const { t } = useTranslation();

  const requestParams = [
    { name: 'candidateName', type: 'string', required: true, description: "Candidate's full name" },
    { name: 'candidateEmail', type: 'string', required: true, description: "Candidate's email address" },
    { name: 'position', type: 'string', required: true, description: 'Job position title' },
    { name: 'companyName', type: 'string', required: true, description: 'Company name' },
    { name: 'interviewDate', type: 'string', description: 'Proposed interview date (ISO format)' },
    { name: 'interviewTime', type: 'string', description: 'Proposed interview time' },
    { name: 'interviewType', type: 'string', description: 'Type of interview (video, phone, in-person)', default: 'video' },
    { name: 'interviewerName', type: 'string', description: 'Name of the interviewer' },
    { name: 'additionalInfo', type: 'string', description: 'Any additional information for the candidate' },
    { name: 'tone', type: 'string', description: 'Email tone (formal, friendly, professional)', default: 'professional' },
  ];

  const responseParams = [
    { name: 'subject', type: 'string', description: 'Generated email subject line' },
    { name: 'body', type: 'string', description: 'Generated email body (HTML format)' },
    { name: 'plainText', type: 'string', description: 'Plain text version of the email' },
  ];

  const exampleRequest = {
    curl: `curl -X POST https://api.robohire.io/v1/invite-candidate \\
  -H "Authorization: Bearer rh_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "candidateName": "John Doe",
    "candidateEmail": "john.doe@email.com",
    "position": "Senior Frontend Developer",
    "companyName": "Tech Corp",
    "interviewDate": "2024-02-15",
    "interviewTime": "2:00 PM PST",
    "interviewType": "video",
    "interviewerName": "Sarah Smith",
    "tone": "friendly"
  }'`,
    javascript: `const response = await fetch('https://api.robohire.io/v1/invite-candidate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer rh_your_api_key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    candidateName: 'John Doe',
    candidateEmail: 'john.doe@email.com',
    position: 'Senior Frontend Developer',
    companyName: 'Tech Corp',
    interviewDate: '2024-02-15',
    interviewTime: '2:00 PM PST',
    interviewType: 'video',
    interviewerName: 'Sarah Smith',
    tone: 'friendly'
  })
});

const result = await response.json();`,
    python: `import requests

response = requests.post(
    'https://api.robohire.io/v1/invite-candidate',
    headers={
        'Authorization': 'Bearer rh_your_api_key',
        'Content-Type': 'application/json'
    },
    json={
        'candidateName': 'John Doe',
        'candidateEmail': 'john.doe@email.com',
        'position': 'Senior Frontend Developer',
        'companyName': 'Tech Corp',
        'interviewDate': '2024-02-15',
        'interviewTime': '2:00 PM PST',
        'interviewType': 'video',
        'interviewerName': 'Sarah Smith',
        'tone': 'friendly'
    }
)

result = response.json()`,
  };

  const exampleResponse = `{
  "success": true,
  "data": {
    "subject": "Interview Invitation - Senior Frontend Developer at Tech Corp",
    "body": "<html>...<p>Dear John,</p><p>We were impressed by your application for the Senior Frontend Developer position at Tech Corp, and we would love to invite you for an interview!</p><p><strong>Interview Details:</strong></p><ul><li>Date: February 15, 2024</li><li>Time: 2:00 PM PST</li><li>Type: Video Call</li><li>Interviewer: Sarah Smith</li></ul><p>Please confirm your availability by replying to this email.</p><p>We look forward to speaking with you!</p><p>Best regards,<br/>The Tech Corp Team</p>...</html>",
    "plainText": "Dear John,\\n\\nWe were impressed by your application for the Senior Frontend Developer position at Tech Corp, and we would love to invite you for an interview!\\n\\nInterview Details:\\n- Date: February 15, 2024\\n- Time: 2:00 PM PST\\n- Type: Video Call\\n- Interviewer: Sarah Smith\\n\\nPlease confirm your availability by replying to this email.\\n\\nWe look forward to speaking with you!\\n\\nBest regards,\\nThe Tech Corp Team"
  }
}`;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-4">
        {t('docs.inviteCandidate.title', 'Invite Candidate')}
      </h1>
      <p className="text-lg text-gray-600 mb-8">
        {t('docs.inviteCandidate.intro', 'Generate professional interview invitation emails for candidates. The AI crafts personalized messages based on the provided details.')}
      </p>

      <EndpointCard
        method="POST"
        path="/v1/invite-candidate"
        description={t('docs.inviteCandidate.endpointDesc', 'Generate an interview invitation email')}
      />

      {/* Request */}
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
        {t('docs.inviteCandidate.request', 'Request')}
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
        {t('docs.inviteCandidate.response', 'Response')}
      </h2>
      <ParamTable title={t('docs.common.responseFields', 'Response Fields')} params={responseParams} />

      <CodeBlock code={exampleResponse} language="json" title={t('docs.common.exampleResponse', 'Example Response')} />

      {/* Email Tones */}
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
        {t('docs.inviteCandidate.tones.title', 'Available Tones')}
      </h2>
      <div className="bg-gray-50 rounded-xl overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-500">{t('docs.inviteCandidate.tones.toneHeader', 'Tone')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">{t('docs.inviteCandidate.tones.descHeader', 'Description')}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="px-4 py-3"><code className="text-indigo-600">formal</code></td>
              <td className="px-4 py-3 text-gray-600">{t('docs.inviteCandidate.tones.formal', 'Traditional, corporate-style communication')}</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="px-4 py-3"><code className="text-indigo-600">professional</code></td>
              <td className="px-4 py-3 text-gray-600">{t('docs.inviteCandidate.tones.professional', 'Balanced, business-appropriate (default)')}</td>
            </tr>
            <tr>
              <td className="px-4 py-3"><code className="text-indigo-600">friendly</code></td>
              <td className="px-4 py-3 text-gray-600">{t('docs.inviteCandidate.tones.friendly', 'Warm, approachable, startup-friendly')}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Try It */}
      <div className="bg-indigo-50 rounded-xl p-6">
        <h3 className="font-semibold text-indigo-900 mb-2">
          {t('docs.inviteCandidate.tryIt.title', 'Try it out')}
        </h3>
        <p className="text-indigo-700 text-sm mb-3">
          {t('docs.inviteCandidate.tryIt.desc', 'Test this endpoint interactively in the API Playground.')}
        </p>
        <Link
          to="/api-playground/invite"
          className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          {t('docs.inviteCandidate.tryIt.cta', 'Open in Playground')}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
