import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function DocsOverview() {
  const { t } = useTranslation();

  const endpoints = [
    {
      name: t('docs.overview.ep.matchResume', 'Match Resume'),
      href: '/docs/api/match-resume',
      description: t('docs.overview.ep.matchResumeDesc', 'Match resumes against job descriptions with AI scoring.'),
    },
    {
      name: t('docs.overview.ep.parseResume', 'Parse Resume'),
      href: '/docs/api/parse-resume',
      description: t('docs.overview.ep.parseResumeDesc', 'Extract structured data from resume PDFs.'),
    },
    {
      name: t('docs.overview.ep.parseJd', 'Parse JD'),
      href: '/docs/api/parse-jd',
      description: t('docs.overview.ep.parseJdDesc', 'Extract structured data from job description PDFs.'),
    },
    {
      name: t('docs.overview.ep.inviteCandidate', 'Invite Candidate'),
      href: '/docs/api/invite-candidate',
      description: t('docs.overview.ep.inviteCandidateDesc', 'Generate professional interview invitation emails.'),
    },
    {
      name: t('docs.overview.ep.evaluateInterview', 'Evaluate Interview'),
      href: '/docs/api/evaluate-interview',
      description: t('docs.overview.ep.evaluateInterviewDesc', 'Analyze interview transcripts with comprehensive scoring.'),
    },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-4">
        {t('docs.overview.title', 'RoboHire API Documentation')}
      </h1>
      <p className="text-lg text-gray-600 mb-8">
        {t('docs.overview.intro', 'Welcome to the RoboHire API documentation. Learn how to integrate AI-powered recruitment features into your application.')}
      </p>

      {/* Quick Start Card */}
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-6 mb-8 text-white">
        <h2 className="text-xl font-semibold mb-2">
          {t('docs.overview.quickStartTitle', 'Get started in minutes')}
        </h2>
        <p className="text-indigo-100 mb-4">
          {t('docs.overview.quickStartDesc', 'Follow our quick start guide to make your first API call.')}
        </p>
        <Link
          to="/docs/quick-start"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white text-indigo-600 font-medium rounded-lg hover:bg-gray-100 transition-colors"
        >
          {t('docs.overview.quickStartCta', 'Quick Start Guide')}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </Link>
      </div>

      {/* Base URL */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-3">
          {t('docs.overview.baseUrl', 'Base URL')}
        </h2>
        <div className="bg-gray-100 rounded-lg px-4 py-3">
          <code className="text-sm font-mono text-gray-800">https://api.robohire.io/v1</code>
        </div>
      </div>

      {/* Authentication */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-3">
          {t('docs.overview.authentication', 'Authentication')}
        </h2>
        <p className="text-gray-600 mb-4">
          {t('docs.overview.authDesc', 'All API requests require authentication using an API key. Include your key in the request headers:')}
        </p>
        <div className="bg-gray-900 rounded-lg px-4 py-3">
          <code className="text-sm font-mono text-gray-300">
            Authorization: Bearer rh_your_api_key
          </code>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          <Link to="/docs/authentication" className="text-indigo-600 hover:underline">
            {t('docs.overview.learnMoreAuth', 'Learn more about authentication')}
          </Link>
        </p>
      </div>

      {/* Available Endpoints */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          {t('docs.overview.endpoints', 'Available Endpoints')}
        </h2>
        <div className="grid gap-4">
          {endpoints.map((endpoint) => (
            <Link
              key={endpoint.href}
              to={endpoint.href}
              className="block p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">{endpoint.name}</h3>
                  <p className="text-sm text-gray-600">{endpoint.description}</p>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Support Section */}
      <div className="mt-12 p-6 bg-blue-50 rounded-xl">
        <h3 className="font-semibold text-blue-900 mb-2">
          {t('docs.overview.needHelp', 'Need help?')}
        </h3>
        <p className="text-blue-700 text-sm mb-3">
          {t('docs.overview.helpDesc', 'If you have questions or need assistance, check out our resources or reach out to support.')}
        </p>
        <div className="flex gap-4">
          <Link
            to="/api-playground"
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            {t('docs.overview.tryPlayground', 'Try the Playground')}
          </Link>
          <a
            href="mailto:support@robohire.io"
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            {t('docs.overview.contactSupport', 'Contact Support')}
          </a>
        </div>
      </div>
    </div>
  );
}
