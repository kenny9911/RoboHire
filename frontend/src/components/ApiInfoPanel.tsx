import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ApiInfoPanelProps {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  requestBody?: object;
  responseStatus?: number;
  responseTime?: number;
  requestId?: string;
  isLoading?: boolean;
}

type CodeTab = 'curl' | 'javascript' | 'python';

export default function ApiInfoPanel({
  endpoint,
  method,
  requestBody,
  responseStatus,
  responseTime,
  requestId,
  isLoading,
}: ApiInfoPanelProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [showPanel, setShowPanel] = useState(true);
  const [activeTab, setActiveTab] = useState<CodeTab>('curl');

  const baseUrl = window.location.origin;
  const fullUrl = `${baseUrl}${endpoint}`;

  // Generate cURL command
  const generateCurl = () => {
    let curl = `curl -X ${method} '${fullUrl}'`;
    
    if (method === 'POST' || method === 'PUT') {
      curl += ` \\\n  -H 'Content-Type: application/json'`;
      if (requestBody) {
        const bodyJson = JSON.stringify(requestBody, null, 2)
          .split('\n')
          .map((line, i) => i === 0 ? line : '  ' + line)
          .join('\n');
        curl += ` \\\n  -d '${bodyJson}'`;
      }
    }
    
    return curl;
  };

  // Generate JavaScript fetch code
  const generateJavaScript = () => {
    const bodyJson = requestBody ? JSON.stringify(requestBody, null, 2) : null;
    
    if (method === 'GET') {
      return `const response = await fetch('${fullUrl}');
const data = await response.json();
console.log(data);`;
    }
    
    return `const response = await fetch('${fullUrl}', {
  method: '${method}',
  headers: {
    'Content-Type': 'application/json',
  },${bodyJson ? `
  body: JSON.stringify(${bodyJson}),` : ''}
});
const data = await response.json();
console.log(data);`;
  };

  // Generate Python requests code
  const generatePython = () => {
    const bodyJson = requestBody ? JSON.stringify(requestBody, null, 2) : null;
    
    if (method === 'GET') {
      return `import requests

response = requests.get('${fullUrl}')
data = response.json()
print(data)`;
    }
    
    // Format Python dict from JSON
    const pythonBody = bodyJson 
      ? bodyJson
          .replace(/"/g, "'")
          .replace(/: true/g, ': True')
          .replace(/: false/g, ': False')
          .replace(/: null/g, ': None')
      : null;
    
    return `import requests

payload = ${pythonBody || '{}'}

response = requests.${method.toLowerCase()}(
    '${fullUrl}',
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

  const getStatusColor = (status?: number) => {
    if (!status) return 'bg-gray-100 text-gray-600';
    if (status >= 200 && status < 300) return 'bg-green-100 text-green-700';
    if (status >= 400 && status < 500) return 'bg-yellow-100 text-yellow-700';
    if (status >= 500) return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-600';
  };

  const getStatusText = (status?: number) => {
    if (!status) return '';
    const statusTexts: Record<number, string> = {
      200: 'OK',
      201: 'Created',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      422: 'Unprocessable Entity',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
    };
    return statusTexts[status] || '';
  };

  const tabs: { id: CodeTab; label: string; icon: string }[] = [
    { id: 'curl', label: 'cURL', icon: '>' },
    { id: 'javascript', label: 'JavaScript', icon: 'JS' },
    { id: 'python', label: 'Python', icon: 'Py' },
  ];

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden shadow-md mb-4 text-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPanel(!showPanel)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-3 w-3 transition-transform ${showPanel ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
            method === 'GET' ? 'bg-blue-600 text-white' :
            method === 'POST' ? 'bg-green-600 text-white' :
            method === 'PUT' ? 'bg-yellow-600 text-white' :
            'bg-red-600 text-white'
          }`}>
            {method}
          </span>
          <code className="text-gray-400 font-mono text-[11px]">{endpoint}</code>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Response Status */}
          {isLoading ? (
            <span className="flex items-center gap-1 text-gray-400">
              <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-[10px]">{t('status.sending')}</span>
            </span>
          ) : responseStatus ? (
            <div className="flex items-center gap-1.5">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${getStatusColor(responseStatus)}`}>
                {responseStatus} {getStatusText(responseStatus)}
              </span>
              {responseTime && (
                <span className="text-gray-500 text-[10px]">
                  {responseTime < 1000 ? `${responseTime}ms` : `${(responseTime / 1000).toFixed(1)}s`}
                </span>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Tabs and Code */}
      {showPanel && (
        <div>
          {/* Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-gray-850 border-b border-gray-700 px-2 py-1 sm:py-0">
            <div className="flex flex-wrap">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 text-[10px] font-medium transition-colors border-b-2 ${
                    activeTab === tab.id
                      ? 'text-white border-blue-500 bg-gray-800'
                      : 'text-gray-400 border-transparent hover:text-gray-300 hover:bg-gray-800/50'
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
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors flex items-center gap-1
                ${copied 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              {copied ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {t('actions.copied')}
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  {t('actions.copy')}
                </>
              )}
            </button>
          </div>

          {/* Code Content */}
          <div className="p-2 max-h-36 overflow-auto bg-gray-900">
            <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap leading-relaxed">
              {activeTab === 'curl' && <span className="text-green-400">$ </span>}
              {getCodeForTab(activeTab)}
            </pre>
          </div>
          
          {/* Footer */}
          <div className="flex items-center justify-between px-2 py-1 bg-gray-800 border-t border-gray-700">
            {/* Request ID */}
            {requestId ? (
              <div className="text-[9px]">
                <span className="text-gray-500">{t('status.requestId')}: </span>
                <code className="text-gray-400 font-mono">{requestId}</code>
              </div>
            ) : <div />}
            
            {/* HTTP Status Codes */}
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-gray-500 mr-1">{t('status.status')}:</span>
              <span className="px-1 py-0.5 rounded text-[8px] bg-green-900/50 text-green-400">2xx</span>
              <span className="px-1 py-0.5 rounded text-[8px] bg-yellow-900/50 text-yellow-400">4xx</span>
              <span className="px-1 py-0.5 rounded text-[8px] bg-red-900/50 text-red-400">5xx</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
