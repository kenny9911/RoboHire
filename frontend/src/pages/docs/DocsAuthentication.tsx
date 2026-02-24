import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CodeBlock } from '../../components/docs';

export default function DocsAuthentication() {
  const { t } = useTranslation();

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-4">
        {t('docs.auth.title', 'Authentication')}
      </h1>
      <p className="text-lg text-gray-600 mb-8">
        {t('docs.auth.intro', 'Learn how to authenticate your API requests to RoboHire.')}
      </p>

      {/* API Keys */}
      <div className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          {t('docs.auth.apiKeys.title', 'API Keys')}
        </h2>
        <p className="text-gray-600 mb-4">
          {t('docs.auth.apiKeys.desc', 'API keys are the primary way to authenticate with the RoboHire API. Each key is prefixed with "rh_" and provides full access to the API on behalf of your account.')}
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-amber-800 font-medium">
                {t('docs.auth.apiKeys.warning.title', 'Keep your API keys secure')}
              </p>
              <p className="text-amber-700 text-sm mt-1">
                {t('docs.auth.apiKeys.warning.desc', 'Never expose your API keys in client-side code, public repositories, or anywhere they could be accessed by unauthorized parties.')}
              </p>
            </div>
          </div>
        </div>

        <h3 className="font-semibold text-gray-900 mb-3">
          {t('docs.auth.apiKeys.creating', 'Creating API Keys')}
        </h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-600 mb-4">
          <li>{t('docs.auth.apiKeys.step1', 'Log in to your RoboHire dashboard')}</li>
          <li>{t('docs.auth.apiKeys.step2', 'Navigate to API Keys section')}</li>
          <li>{t('docs.auth.apiKeys.step3', 'Click "Create Key" and provide a name')}</li>
          <li>{t('docs.auth.apiKeys.step4', 'Copy and securely store your key (shown only once)')}</li>
        </ol>
        <Link
          to="/dashboard/api-keys"
          className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium"
        >
          {t('docs.auth.apiKeys.manage', 'Manage your API keys')}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </Link>
      </div>

      {/* Using API Keys */}
      <div className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          {t('docs.auth.using.title', 'Using API Keys')}
        </h2>
        <p className="text-gray-600 mb-4">
          {t('docs.auth.using.desc', 'Include your API key in the Authorization header of each request:')}
        </p>

        <h3 className="font-semibold text-gray-900 mb-3">
          {t('docs.auth.using.bearer', 'Bearer Token (Recommended)')}
        </h3>
        <CodeBlock
          language="bash"
          code={`curl -H "Authorization: Bearer rh_your_api_key" \\
  https://api.robohire.io/v1/health`}
        />

        <h3 className="font-semibold text-gray-900 mb-3 mt-6">
          {t('docs.auth.using.xApiKey', 'X-API-Key Header')}
        </h3>
        <p className="text-gray-600 mb-3">
          {t('docs.auth.using.xApiKeyDesc', 'Alternatively, you can use the X-API-Key header:')}
        </p>
        <CodeBlock
          language="bash"
          code={`curl -H "X-API-Key: rh_your_api_key" \\
  https://api.robohire.io/v1/health`}
        />
      </div>

      {/* Key Scopes */}
      <div className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          {t('docs.auth.scopes.title', 'Key Scopes')}
        </h2>
        <p className="text-gray-600 mb-4">
          {t('docs.auth.scopes.desc', 'API keys can have different scopes to limit their permissions:')}
        </p>

        <div className="bg-gray-50 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-500">{t('docs.auth.scopes.scopeHeader', 'Scope')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">{t('docs.auth.scopes.descHeader', 'Description')}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-3">
                  <code className="text-indigo-600 font-mono">read</code>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {t('docs.auth.scopes.read', 'Access to read operations (GET endpoints)')}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3">
                  <code className="text-indigo-600 font-mono">write</code>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {t('docs.auth.scopes.write', 'Access to create and modify operations (POST, PUT, DELETE)')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Errors */}
      <div className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          {t('docs.auth.errors.title', 'Authentication Errors')}
        </h2>
        <p className="text-gray-600 mb-4">
          {t('docs.auth.errors.desc', 'If authentication fails, you will receive one of these error responses:')}
        </p>

        <div className="space-y-4">
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded">401</span>
              <span className="font-mono text-sm text-gray-800">AUTH_REQUIRED</span>
            </div>
            <p className="text-sm text-gray-600">
              {t('docs.auth.errors.authRequired', 'No authentication credentials were provided.')}
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded">401</span>
              <span className="font-mono text-sm text-gray-800">INVALID_TOKEN</span>
            </div>
            <p className="text-sm text-gray-600">
              {t('docs.auth.errors.invalidToken', 'The provided API key is invalid or has been revoked.')}
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded">403</span>
              <span className="font-mono text-sm text-gray-800">INSUFFICIENT_SCOPES</span>
            </div>
            <p className="text-sm text-gray-600">
              {t('docs.auth.errors.insufficientScopes', 'The API key does not have the required scopes for this operation.')}
            </p>
          </div>
        </div>
      </div>

      {/* Best Practices */}
      <div className="bg-blue-50 rounded-xl p-6">
        <h3 className="font-semibold text-blue-900 mb-4">
          {t('docs.auth.bestPractices.title', 'Best Practices')}
        </h3>
        <ul className="space-y-2 text-blue-800 text-sm">
          <li className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {t('docs.auth.bestPractices.envVars', 'Store API keys in environment variables, not in code')}
          </li>
          <li className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {t('docs.auth.bestPractices.rotate', 'Rotate keys periodically and after any potential exposure')}
          </li>
          <li className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {t('docs.auth.bestPractices.minScope', 'Use the minimum required scopes for each key')}
          </li>
          <li className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {t('docs.auth.bestPractices.expiration', 'Set expiration dates for keys when possible')}
          </li>
          <li className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {t('docs.auth.bestPractices.separate', 'Use separate keys for development and production')}
          </li>
        </ul>
      </div>
    </div>
  );
}
