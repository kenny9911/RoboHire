import { useState, useEffect } from 'react';
import axios from '../lib/axios';
import TextArea from '../components/TextArea';
import Button from '../components/Button';
import ResultViewer from '../components/ResultViewer';
import ApiInfoPanel from '../components/ApiInfoPanel';
import { useFormData } from '../context/FormDataContext';
import { useTranslation } from 'react-i18next';

interface ApiResponse {
  requestId?: string;
  data?: {
    email: string;
    name: string;
    login_url: string;
    job_title: string;
    message: string;
    qrcode_url: string;
  };
}

// Default recruiter email from environment or fallback
const DEFAULT_RECRUITER_EMAIL = 'hr@lightark.ai';
const ROBOHIRE_API_URL = 'https://report-agent.robohire.io/instant/instant/v1/invitation';

export default function InviteCandidate() {
  const { t } = useTranslation();
  const { formData, setInviteCandidateData } = useFormData();
  const { resume, jd, recruiterEmail, interviewerRequirement } = formData.inviteCandidate;

  const setResume = (value: string) => setInviteCandidateData({ resume: value });
  const setJd = (value: string) => setInviteCandidateData({ jd: value });
  const setRecruiterEmail = (value: string) => setInviteCandidateData({ recruiterEmail: value });
  const setInterviewerRequirement = (value: string) => setInviteCandidateData({ interviewerRequirement: value });

  const [result, setResult] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseStatus, setResponseStatus] = useState<number | undefined>();
  const [responseTime, setResponseTime] = useState<number | undefined>();
  const [showExternalApi, setShowExternalApi] = useState(false);

  // Set default recruiter email on mount if not set
  useEffect(() => {
    if (!recruiterEmail) {
      setRecruiterEmail(DEFAULT_RECRUITER_EMAIL);
    }
  }, []);

  const handleSubmit = async () => {
    if (!resume.trim() || !jd.trim()) {
      setError(t('pages.inviteCandidate.errorMissingResumeJd'));
      return;
    }

    if (!recruiterEmail.trim()) {
      setError(t('pages.inviteCandidate.errorMissingRecruiter'));
      return;
    }

    setShowExternalApi(true);
    setLoading(true);
    setError(null);
    setResult(null);
    setResponseStatus(undefined);
    setResponseTime(undefined);

    const startTime = Date.now();

    try {
      const response = await axios.post('/api/v1/invite-candidate', {
        resume,
        jd,
        recruiter_email: recruiterEmail,
        interviewer_requirement: interviewerRequirement || undefined,
      });
      setResponseTime(Date.now() - startTime);
      setResponseStatus(response.status);
      setResult(response.data);
    } catch (err) {
      setResponseTime(Date.now() - startTime);
      if (axios.isAxiosError(err)) {
        setResponseStatus(err.response?.status);
        setError(err.response?.data?.error || err.message);
      } else {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800">{t('pages.inviteCandidate.title')}</h2>
        <p className="text-gray-500 mt-1">{t('pages.inviteCandidate.subtitle')}</p>
      </div>

      <ApiInfoPanel
        endpoint="/api/v1/invite-candidate"
        method="POST"
        requestBody={{
          recruiter_email: recruiterEmail || DEFAULT_RECRUITER_EMAIL,
          jd_content: jd.substring(0, 50) + '...',
          interviewer_requirement: interviewerRequirement || '(optional)',
          resume_text: resume.substring(0, 50) + '...',
        }}
        responseStatus={responseStatus}
        responseTime={responseTime}
        requestId={result?.requestId}
        isLoading={loading}
      />

      {/* Toggle to show external API request */}
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => setShowExternalApi(!showExternalApi)}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            showExternalApi
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          {showExternalApi ? '▼' : '▶'} {t('pages.inviteCandidate.toggleExternal')}
        </button>
        <span className="text-xs text-gray-500">
          {t('pages.inviteCandidate.externalHint')}
        </span>
      </div>

      {/* External API Request Code Panel */}
      {showExternalApi && (
        <ExternalApiCodePanel
          recruiterEmail={recruiterEmail || DEFAULT_RECRUITER_EMAIL}
          jdContent={jd}
          interviewerRequirement={interviewerRequirement}
          resumeText={resume}
        />
      )}

      {/* Recruiter Email and Interviewer Requirement */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('pages.inviteCandidate.recruiterEmail')} <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={recruiterEmail}
            onChange={(e) => setRecruiterEmail(e.target.value)}
            placeholder={t('pages.inviteCandidate.recruiterPlaceholder')}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
          />
          <p className="mt-1 text-xs text-gray-500">
            {t('pages.inviteCandidate.recruiterHelp')}
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('pages.inviteCandidate.interviewerRequirement')} <span className="text-gray-400">{t('pages.inviteCandidate.optional')}</span>
          </label>
          <input
            type="text"
            value={interviewerRequirement}
            onChange={(e) => setInterviewerRequirement(e.target.value)}
            placeholder={t('pages.inviteCandidate.interviewerPlaceholder')}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
          />
          <p className="mt-1 text-xs text-gray-500">
            {t('pages.inviteCandidate.interviewerHelp')}
          </p>
        </div>
      </div>

      {/* Resume and JD */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <TextArea
          label={t('pages.inviteCandidate.resumeLabel')}
          value={resume}
          onChange={setResume}
          placeholder={t('pages.inviteCandidate.resumePlaceholder')}
          rows={12}
        />
        <TextArea
          label={t('pages.inviteCandidate.jdLabel')}
          value={jd}
          onChange={setJd}
          placeholder={t('pages.inviteCandidate.jdPlaceholder')}
          rows={12}
        />
      </div>

      <div className="mb-6">
        <Button onClick={handleSubmit} loading={loading}>
          {t('pages.inviteCandidate.sendInvitation')}
        </Button>
      </div>

      {/* Success Result Display */}
      {result?.data && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="text-3xl">✅</div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-green-800 mb-2">{t('pages.inviteCandidate.successTitle')}</h3>
              <p className="text-green-700 mb-4">{result.data.message}</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-lg p-4 border border-green-200">
                  <h4 className="font-medium text-gray-700 mb-2">{t('pages.inviteCandidate.candidateInfo')}</h4>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-gray-500">{t('pages.inviteCandidate.name')}:</span> <span className="font-medium">{result.data.name}</span></p>
                    <p><span className="text-gray-500">{t('pages.inviteCandidate.email')}:</span> <span className="font-medium">{result.data.email}</span></p>
                    <p><span className="text-gray-500">{t('pages.inviteCandidate.position')}:</span> <span className="font-medium">{result.data.job_title}</span></p>
                  </div>
                </div>
                
                <div className="bg-white rounded-lg p-4 border border-green-200">
                  <h4 className="font-medium text-gray-700 mb-2">{t('pages.inviteCandidate.loginLink')}</h4>
                  <a
                    href={result.data.login_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-indigo-600 hover:text-indigo-800 break-all"
                  >
                    {result.data.login_url}
                  </a>
                </div>
              </div>

              {result.data.qrcode_url && (
                <div className="mt-4 flex items-center gap-4">
                  <div className="bg-white rounded-lg p-2 border border-green-200">
                    <img
                      src={result.data.qrcode_url}
                      alt="WeChat Mini Program QR Code"
                      className="w-24 h-24"
                    />
                  </div>
                  <div className="text-sm text-gray-600">
                    <p className="font-medium">{t('pages.inviteCandidate.scanQr')}</p>
                    <p>{t('pages.inviteCandidate.wechatHint')}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="text-3xl">❌</div>
            <div>
              <h3 className="text-lg font-bold text-red-800 mb-2">{t('pages.inviteCandidate.errorTitle')}</h3>
              <p className="text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Full Response */}
      <div>
        <h3 className="text-lg font-semibold text-gray-700 mb-3">{t('pages.inviteCandidate.apiResponse')}</h3>
        <ResultViewer data={result} loading={loading} error={null} title="invitation-response" />
      </div>
    </div>
  );
}

// External API Code Panel Component
interface ExternalApiCodePanelProps {
  recruiterEmail: string;
  jdContent: string;
  interviewerRequirement: string;
  resumeText: string;
}

type CodeTab = 'curl' | 'javascript' | 'python';

function ExternalApiCodePanel({ recruiterEmail, jdContent, interviewerRequirement, resumeText }: ExternalApiCodePanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<CodeTab>('curl');
  const [copied, setCopied] = useState(false);

  const requestBody = {
    recruiter_email: recruiterEmail,
    jd_content: jdContent,
    interviewer_requirement: interviewerRequirement || '',
    resume_text: resumeText,
  };

  const generateCurl = () => {
    const bodyJson = JSON.stringify(requestBody, null, 2);
    return `curl --location --request POST '${ROBOHIRE_API_URL}' \\
--header 'Content-Type: application/json' \\
--data-raw '${bodyJson}'`;
  };

  const generateJavaScript = () => {
    const bodyJson = JSON.stringify(requestBody, null, 2);
    return `const response = await fetch('${ROBOHIRE_API_URL}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(${bodyJson})
});

const data = await response.json();
console.log(data);`;
  };

  const generatePython = () => {
    const pythonBody = JSON.stringify(requestBody, null, 4)
      .replace(/"/g, "'")
      .replace(/: true/g, ': True')
      .replace(/: false/g, ': False')
      .replace(/: null/g, ': None');

    return `import requests

payload = ${pythonBody}

response = requests.post(
    '${ROBOHIRE_API_URL}',
    json=payload
)

data = response.json()
print(data)`;
  };

  const getCodeForTab = (tab: CodeTab): string => {
    switch (tab) {
      case 'curl': return generateCurl();
      case 'javascript': return generateJavaScript();
      case 'python': return generatePython();
    }
  };

  const handleCopy = async () => {
    const code = getCodeForTab(activeTab);
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const tabs: { id: CodeTab; label: string; icon: string }[] = [
    { id: 'curl', label: 'cURL', icon: '>' },
    { id: 'javascript', label: 'JavaScript', icon: 'JS' },
    { id: 'python', label: 'Python', icon: 'Py' },
  ];

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden shadow-md mb-6">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-indigo-900 border-b border-indigo-700">
        <div className="flex items-center gap-2">
          <span className="text-indigo-300 text-sm font-medium">🔗 {t('pages.inviteCandidate.externalApiTitle')}</span>
          <code className="text-indigo-400 text-xs font-mono">POST {ROBOHIRE_API_URL}</code>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between bg-gray-800 border-b border-gray-700 px-2">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'text-white border-indigo-500 bg-gray-700'
                  : 'text-gray-400 border-transparent hover:text-gray-300 hover:bg-gray-700/50'
              }`}
            >
              <span className={`mr-1 ${
                tab.id === 'javascript' ? 'text-yellow-400' :
                tab.id === 'python' ? 'text-blue-400' :
                'text-green-400'
              }`}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
        
        {/* Copy Button */}
        <button
          onClick={handleCopy}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5
            ${copied 
              ? 'bg-green-600 text-white' 
              : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
        >
          {copied ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {t('actions.copied')}
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {t('pages.inviteCandidate.copyCode')}
            </>
          )}
        </button>
      </div>

      {/* Code Content */}
      <div className="p-4 max-h-96 overflow-auto bg-gray-900">
        <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap leading-relaxed">
          {activeTab === 'curl' && <span className="text-green-400">$ </span>}
          {getCodeForTab(activeTab)}
        </pre>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-gray-800 border-t border-gray-700 text-xs text-gray-400">
        <span className="text-indigo-400">💡</span> {t('pages.inviteCandidate.tip')}
      </div>
    </div>
  );
}
