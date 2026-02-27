import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/landing/Navbar';
import Footer from '../components/landing/Footer';
import SEO from '../components/SEO';

export default function APILanding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const codeExample = `// Match a resume against a job description
const response = await fetch('https://api.robohire.io/v1/match-resume', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer rh_your_api_key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    resume: "John Doe, 5 years React experience...",
    jobDescription: "Looking for Senior Frontend Developer..."
  })
});

const result = await response.json();
console.log(result.data.matchScore); // 85`;

  const features = [
    {
      title: t('apiLanding.features.matching.title', 'AI Resume Matching'),
      description: t('apiLanding.features.matching.desc', 'Match resumes against job descriptions with AI-powered scoring and detailed analysis.'),
    },
    {
      title: t('apiLanding.features.parsing.title', 'Document Parsing'),
      description: t('apiLanding.features.parsing.desc', 'Extract structured data from resumes and job descriptions in PDF format.'),
    },
    {
      title: t('apiLanding.features.evaluation.title', 'Interview Evaluation'),
      description: t('apiLanding.features.evaluation.desc', 'Analyze interview transcripts with comprehensive scoring and cheating detection.'),
    },
    {
      title: t('apiLanding.features.invitation.title', 'Candidate Invitations'),
      description: t('apiLanding.features.invitation.desc', 'Generate professional interview invitation emails automatically.'),
    },
    {
      title: t('apiLanding.features.multilingual.title', 'Multilingual Support'),
      description: t('apiLanding.features.multilingual.desc', 'Support for 7 languages including English, Chinese, Japanese, and more.'),
    },
    {
      title: t('apiLanding.features.webhooks.title', 'Webhook Integration'),
      description: t('apiLanding.features.webhooks.desc', 'Receive real-time updates via webhooks when candidates are processed.'),
    },
  ];

  const steps = [
    {
      number: '01',
      title: t('apiLanding.steps.signup.title', 'Sign up or log in'),
      description: t('apiLanding.steps.signup.desc', 'Create a free account or log in to access your RoboHire dashboard.'),
    },
    {
      number: '02',
      title: t('apiLanding.steps.apikey.title', 'Get your API key'),
      description: t('apiLanding.steps.apikey.desc', 'Generate an API key from your dashboard to start making API calls.'),
    },
    {
      number: '03',
      title: t('apiLanding.steps.develop.title', 'Start building'),
      description: t('apiLanding.steps.develop.desc', 'Integrate RoboHire into your application with our comprehensive documentation.'),
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      <SEO title={t('seo.developers.title', 'Developer API')} description={t('seo.developers.desc', 'Integrate powerful AI recruitment capabilities into your existing systems. Parse resumes, match candidates, and evaluate interviews via RESTful API.')} url="https://robohire.io/developers" keywords={t('seo.developers.keywords', 'recruitment API, AI hiring API, resume parsing API, candidate matching API, interview evaluation API, developer tools')} />
      <Navbar />

      {/* Hero Section */}
      <section className="pt-32 pb-20 lg:pt-40 lg:pb-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-indigo-900" />
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-10 w-72 h-72 bg-indigo-500 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-500 rounded-full blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <div>
              <p className="text-indigo-400 font-medium mb-4 uppercase tracking-wide text-sm">
                {t('apiLanding.hero.badge', 'RoboHire')}
              </p>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
                {t('apiLanding.hero.headline', 'Build AI-powered hiring in minutes')}
              </h1>
              <p className="text-xl text-gray-300 mb-8 leading-relaxed">
                {t('apiLanding.hero.subheadline', 'Integrate intelligent resume matching, interview evaluation, and candidate screening into your application with just a few lines of code.')}
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => navigate(isAuthenticated ? '/dashboard/api-keys' : '/login')}
                  className="px-8 py-4 bg-white text-gray-900 font-semibold rounded-xl hover:bg-gray-100 transition-colors"
                >
                  {t('apiLanding.hero.getKey', 'Get your API key')}
                </button>
                <Link
                  to="/docs"
                  className="px-8 py-4 border border-gray-600 text-white font-semibold rounded-xl hover:bg-white/10 transition-colors text-center"
                >
                  {t('apiLanding.hero.readDocs', 'Read the docs')}
                </Link>
                <Link
                  to="/api-playground"
                  className="px-8 py-4 border border-gray-600 text-white font-semibold rounded-xl hover:bg-white/10 transition-colors text-center"
                >
                  {t('apiLanding.hero.playground', 'API Playground')}
                </Link>
              </div>
            </div>

            {/* Right Code Preview */}
            <div className="relative">
              <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-700">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="ml-2 text-sm text-gray-400">example.js</span>
                </div>
                <pre className="p-4 text-sm overflow-x-auto">
                  <code className="text-gray-300">
                    {codeExample.split('\n').map((line, i) => (
                      <div key={i} className="leading-relaxed">
                        {line.includes('//') ? (
                          <span className="text-gray-500">{line}</span>
                        ) : line.includes("'") || line.includes('"') ? (
                          <span>
                            {line.split(/('[^']*'|"[^"]*")/g).map((part, j) =>
                              part.startsWith("'") || part.startsWith('"') ? (
                                <span key={j} className="text-emerald-400">{part}</span>
                              ) : (
                                <span key={j}>{part}</span>
                              )
                            )}
                          </span>
                        ) : (
                          line
                        )}
                      </div>
                    ))}
                  </code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What is it Section */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-sm font-medium text-indigo-600 uppercase tracking-wide mb-3">
              {t('apiLanding.what.badge', 'What is it?')}
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
              {t('apiLanding.what.title', 'Powerful AI recruitment APIs')}
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              {t('apiLanding.what.description', 'RoboHire provides a complete suite of AI-powered recruitment tools. Match resumes to job descriptions, parse documents, evaluate interviews, and automate candidate communication - all through simple REST API endpoints.')}
            </p>
          </div>

          <div className="flex justify-center gap-4">
            <Link
              to="/docs"
              className="inline-flex items-center gap-2 text-indigo-600 font-medium hover:text-indigo-700"
            >
              {t('apiLanding.what.exploreDocs', 'Explore documentation')}
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-medium text-indigo-600 uppercase tracking-wide mb-3">
              {t('apiLanding.howItWorks.badge', 'Getting Started')}
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              {t('apiLanding.howItWorks.title', 'How it works')}
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            {steps.map((step, index) => (
              <div key={index} className="relative">
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-full w-full h-px bg-gray-200 -translate-x-1/2" />
                )}
                <div className="text-5xl font-bold text-gray-200 mb-4">{step.number}</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-gray-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-medium text-indigo-600 uppercase tracking-wide mb-3">
              {t('apiLanding.features.badge', 'Key Features')}
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              {t('apiLanding.features.title', 'Everything you need to automate hiring')}
            </h2>
            <p className="text-lg text-gray-600">
              {t('apiLanding.features.subtitle', 'Powerful APIs that handle the complex AI work behind the scenes.')}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="bg-white rounded-xl p-6 hover:shadow-lg transition-shadow">
                <div className="w-2 h-2 rounded-full bg-indigo-500 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Playground CTA */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            {t('apiLanding.playground.title', 'Try it in the Playground')}
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            {t('apiLanding.playground.description', 'Test our APIs interactively before integrating them into your application.')}
          </p>
          <button
            onClick={() => navigate('/api-playground')}
            className="inline-flex items-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {t('apiLanding.playground.cta', 'Open Playground')}
          </button>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-24 bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            {t('apiLanding.cta.title', 'Get your API key')}
          </h2>
          <p className="text-lg text-gray-400 mb-8">
            {t('apiLanding.cta.description', 'Start building AI-powered hiring features today. Free to start, no credit card required.')}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => navigate(isAuthenticated ? '/dashboard/api-keys' : '/login')}
              className="px-8 py-4 bg-white text-gray-900 font-semibold rounded-xl hover:bg-gray-100 transition-colors"
            >
              {t('apiLanding.cta.getStarted', 'Get started')}
            </button>
            <Link
              to="/docs"
              className="px-8 py-4 border border-gray-600 text-white font-semibold rounded-xl hover:bg-white/10 transition-colors"
            >
              {t('apiLanding.cta.viewDocs', 'View documentation')}
            </Link>
            <Link
              to="/api-playground"
              className="px-8 py-4 border border-gray-600 text-white font-semibold rounded-xl hover:bg-white/10 transition-colors"
            >
              {t('apiLanding.hero.playground', 'API Playground')}
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
