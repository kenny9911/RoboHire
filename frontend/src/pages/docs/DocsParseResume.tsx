import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CodeBlock, EndpointCard, ParamTable } from '../../components/docs';
import SEO from '../../components/SEO';

export default function DocsParseResume() {
  const { t } = useTranslation();

  const requestParams = [
    { name: 'file', type: 'string (base64)', required: true, description: 'Base64-encoded PDF file of the resume' },
    { name: 'fileName', type: 'string', description: 'Original filename of the PDF' },
  ];

  const responseParams = [
    { name: 'name', type: 'string', description: "Candidate's full name" },
    { name: 'email', type: 'string', description: "Candidate's email address" },
    { name: 'phone', type: 'string', description: "Candidate's phone number" },
    { name: 'location', type: 'string', description: "Candidate's location" },
    { name: 'summary', type: 'string', description: 'Professional summary or objective' },
    { name: 'experience', type: 'array', description: 'List of work experiences' },
    { name: 'education', type: 'array', description: 'List of educational qualifications' },
    { name: 'skills', type: 'array', description: 'List of skills' },
    { name: 'certifications', type: 'array', description: 'List of certifications' },
    { name: 'languages', type: 'array', description: 'List of languages spoken' },
  ];

  const exampleRequest = {
    curl: `curl -X POST https://api.robohire.io/v1/parse-resume \\
  -H "Authorization: Bearer rh_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "file": "JVBERi0xLjQKJeLjz9...", 
    "fileName": "john_doe_resume.pdf"
  }'`,
    javascript: `// Read PDF file and convert to base64
const fileBuffer = await fs.readFile('resume.pdf');
const base64File = fileBuffer.toString('base64');

const response = await fetch('https://api.robohire.io/v1/parse-resume', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer rh_your_api_key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    file: base64File,
    fileName: 'resume.pdf'
  })
});

const result = await response.json();`,
    python: `import requests
import base64

# Read PDF file and convert to base64
with open('resume.pdf', 'rb') as f:
    file_content = base64.b64encode(f.read()).decode('utf-8')

response = requests.post(
    'https://api.robohire.io/v1/parse-resume',
    headers={
        'Authorization': 'Bearer rh_your_api_key',
        'Content-Type': 'application/json'
    },
    json={
        'file': file_content,
        'fileName': 'resume.pdf'
    }
)

result = response.json()`,
  };

  const exampleResponse = `{
  "success": true,
  "data": {
    "name": "John Doe",
    "email": "john.doe@email.com",
    "phone": "+1 (555) 123-4567",
    "location": "San Francisco, CA",
    "summary": "Senior Frontend Developer with 6+ years of experience building scalable web applications using React and TypeScript.",
    "experience": [
      {
        "title": "Senior Frontend Developer",
        "company": "Tech Corp",
        "location": "San Francisco, CA",
        "startDate": "2020-03",
        "endDate": "present",
        "description": "Led frontend development for flagship product. Managed team of 5 developers.",
        "highlights": [
          "Increased page performance by 40%",
          "Implemented CI/CD pipeline"
        ]
      },
      {
        "title": "Frontend Developer",
        "company": "Startup Inc",
        "location": "New York, NY",
        "startDate": "2017-06",
        "endDate": "2020-02",
        "description": "Built responsive web applications using React."
      }
    ],
    "education": [
      {
        "degree": "Bachelor of Science",
        "field": "Computer Science",
        "institution": "MIT",
        "graduationYear": "2017"
      }
    ],
    "skills": [
      "React", "TypeScript", "JavaScript", "Node.js",
      "GraphQL", "REST APIs", "CSS/Sass", "Git"
    ],
    "certifications": [
      "AWS Certified Developer"
    ],
    "languages": [
      { "language": "English", "proficiency": "Native" },
      { "language": "Spanish", "proficiency": "Conversational" }
    ]
  }
}`;

  return (
    <div>
      <SEO title={t('seo.docsParseResume.title', 'Parse Resume API')} description={t('seo.docsParseResume.desc', 'API reference for resume parsing. Extract structured data from resumes using AI.')} url="https://robohire.io/docs/api/parse-resume" keywords={t('seo.docsParseResume.keywords', 'RoboHire API documentation, resume parsing API, resume data extraction, AI resume parser')} />
      <h1 className="text-3xl font-bold text-gray-900 mb-4">
        {t('docs.parseResume.title', 'Parse Resume')}
      </h1>
      <p className="text-lg text-gray-600 mb-8">
        {t('docs.parseResume.intro', 'Extract structured data from a resume PDF, including contact information, experience, education, and skills.')}
      </p>

      <EndpointCard
        method="POST"
        path="/v1/parse-resume"
        description={t('docs.parseResume.endpointDesc', 'Parse a resume PDF into structured data')}
      />

      {/* Request */}
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
        {t('docs.parseResume.request', 'Request')}
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
        {t('docs.parseResume.response', 'Response')}
      </h2>
      <ParamTable title={t('docs.common.responseFields', 'Response Fields')} params={responseParams} />

      <CodeBlock code={exampleResponse} language="json" title={t('docs.common.exampleResponse', 'Example Response')} />

      {/* Supported Formats */}
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
        {t('docs.parseResume.formats.title', 'Supported Formats')}
      </h2>
      <p className="text-gray-600 mb-4">
        {t('docs.parseResume.formats.desc', 'Currently supported document formats:')}
      </p>
      <ul className="list-disc list-inside text-gray-600 space-y-1 mb-6">
        <li>PDF (.pdf)</li>
      </ul>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
        <p className="text-sm text-blue-800">
          <strong>{t('docs.parseResume.tip', 'Tip')}:</strong> {t('docs.parseResume.tipDesc', 'For best results, ensure the PDF is text-based (not a scanned image). OCR-based parsing may have reduced accuracy.')}
        </p>
      </div>

      {/* Try It */}
      <div className="bg-indigo-50 rounded-xl p-6">
        <h3 className="font-semibold text-indigo-900 mb-2">
          {t('docs.parseResume.tryIt.title', 'Try it out')}
        </h3>
        <p className="text-indigo-700 text-sm mb-3">
          {t('docs.parseResume.tryIt.desc', 'Test this endpoint interactively in the API Playground.')}
        </p>
        <Link
          to="/api-playground/parse-resume"
          className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          {t('docs.parseResume.tryIt.cta', 'Open in Playground')}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
