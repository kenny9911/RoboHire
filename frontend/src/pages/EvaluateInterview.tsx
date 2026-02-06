import { useState } from 'react';
import axios from '../lib/axios';
import TextArea from '../components/TextArea';
import Button from '../components/Button';
import ResultViewer from '../components/ResultViewer';
import JsonViewer from '../components/JsonViewer';
import EvaluationResultDisplay from '../components/EvaluationResultDisplay';
import ApiInfoPanel from '../components/ApiInfoPanel';
import { useFormData } from '../context/FormDataContext';
import { useTranslation } from 'react-i18next';

interface EvaluationData {
  score: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendation: string;
  hiringDecision: string;
  skillsAssessment?: Array<{ skill: string; rating: string; evidence: string }>;
  mustHaveAnalysis?: {
    extractedMustHaves: {
      skills: Array<{ skill: string; reason: string; criticality: string }>;
      experiences: Array<{ experience: string; reason: string; minimumYears?: string; criticality: string }>;
      qualifications: Array<{ qualification: string; reason: string; criticality: string }>;
    };
    interviewVerification: {
      verified: Array<{ requirement: string; verifiedBy: string; evidence: string; confidenceLevel: string }>;
      failed: Array<{ requirement: string; failedAt: string; reason: string; severity: string }>;
      notTested: Array<{ requirement: string; recommendation: string }>;
    };
    mustHaveScore: number;
    passRate: string;
    disqualified: boolean;
    disqualificationReasons: string[];
    assessment: string;
  };
  technicalAnalysis?: {
    summary: string;
    depthRating: string;
    details: string[];
    provenSkills: string[];
    claimedButUnverified: string[];
    responseQuality: string;
  };
  jdMatch?: {
    requirements: Array<{
      requirement: string;
      matchLevel: string;
      score: number;
      explanation: string;
    }>;
    hardRequirementsAnalysis: Array<{
      requirement: string;
      met: boolean;
      analysis: string;
    }>;
    extraSkillsFound: string[];
    summary: string;
  };
  behavioralAnalysis?: {
    summary: string;
    compatibility: string;
    details: string[];
  };
  interviewersKit?: {
    suggestedQuestions: string[];
    focusAreas: string[];
  };
  levelAssessment?: string;
  expertAdvice?: string;
  suitableWorkTypes?: string[];
  questionAnswerAssessment?: Array<{
    question: string;
    answer: string;
    score: number;
    correctness: string;
    thoughtProcess: string;
    logicalThinking: string;
    clarity: string;
    completeness: string;
    relatedMustHave?: string;
    mustHaveVerified?: boolean;
    weight?: string;
  }>;
  cheatingAnalysis?: {
    suspicionScore: number;
    riskLevel: string;
    summary: string;
    indicators: Array<{
      type: string;
      description: string;
      severity: string;
      evidence: string;
    }>;
    authenticitySignals: string[];
    recommendation: string;
  };
}

interface ApiResponse {
  requestId?: string;
  cheatingDetectionIncluded?: boolean;
  data?: EvaluationData;
}

export default function EvaluateInterview() {
  const { t } = useTranslation();
  const { formData, setEvaluateInterviewData } = useFormData();
  const { resume, jd, interviewScript } = formData.evaluateInterview;

  const setResume = (value: string) => setEvaluateInterviewData({ resume: value });
  const setJd = (value: string) => setEvaluateInterviewData({ jd: value });
  const setInterviewScript = (value: string) => setEvaluateInterviewData({ interviewScript: value });

  // New fields
  const [includeCheatingDetection, setIncludeCheatingDetection] = useState(false);
  const [userInstructions, setUserInstructions] = useState('');
  
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseStatus, setResponseStatus] = useState<number | undefined>();
  const [responseTime, setResponseTime] = useState<number | undefined>();
  
  // View mode toggle
  const [viewMode, setViewMode] = useState<'formatted' | 'json'>('formatted');

  const handleSubmit = async () => {
    if (!resume.trim() || !jd.trim() || !interviewScript.trim()) {
      setError(t('pages.evaluateInterview.errorMissingFields'));
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setResponseStatus(undefined);
    setResponseTime(undefined);

    const startTime = Date.now();

    try {
      const response = await axios.post('/api/v1/evaluate-interview', {
        resume,
        jd,
        interviewScript,
        includeCheatingDetection,
        userInstructions: userInstructions.trim() || undefined,
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
        <h2 className="text-2xl font-bold text-gray-800">{t('pages.evaluateInterview.title')}</h2>
        <p className="text-gray-500 mt-1">{t('pages.evaluateInterview.subtitle')}</p>
      </div>

      <ApiInfoPanel
        endpoint="/api/v1/evaluate-interview"
        method="POST"
        requestBody={{
          resume: resume.substring(0, 50) + '...',
          jd: jd.substring(0, 50) + '...',
          interviewScript: interviewScript.substring(0, 50) + '...',
          includeCheatingDetection,
          ...(userInstructions.trim() ? { userInstructions: userInstructions.substring(0, 30) + '...' } : {})
        }}
        responseStatus={responseStatus}
        responseTime={responseTime}
        requestId={result?.requestId}
        isLoading={loading}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <TextArea
          label={t('pages.evaluateInterview.resumeLabel')}
          value={resume}
          onChange={setResume}
          placeholder={t('pages.evaluateInterview.resumePlaceholder')}
          rows={8}
        />
        <TextArea
          label={t('pages.evaluateInterview.jdLabel')}
          value={jd}
          onChange={setJd}
          placeholder={t('pages.evaluateInterview.jdPlaceholder')}
          rows={8}
        />
      </div>

      <div className="mb-6">
        <TextArea
          label={t('pages.evaluateInterview.interviewLabel')}
          value={interviewScript}
          onChange={setInterviewScript}
          placeholder={t('pages.evaluateInterview.interviewPlaceholder')}
          rows={10}
        />
      </div>

      {/* Options Section */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('pages.evaluateInterview.optionsTitle')}</h3>
        
        {/* Cheating Detection Toggle */}
        <div className="flex items-center mb-4">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={includeCheatingDetection}
              onChange={(e) => setIncludeCheatingDetection(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            <span className="ml-3 text-sm font-medium text-gray-700">
              {t('pages.evaluateInterview.includeCheating')}
            </span>
          </label>
          <span className="ml-2 text-xs text-gray-500">
            {t('pages.evaluateInterview.cheatingHint')}
          </span>
        </div>

        {/* User Instructions */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('pages.evaluateInterview.specialInstructions')}
          </label>
          <textarea
            value={userInstructions}
            onChange={(e) => setUserInstructions(e.target.value)}
            placeholder={t('pages.evaluateInterview.specialInstructionsPlaceholder')}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
        </div>
      </div>

      <div className="mb-6">
        <Button onClick={handleSubmit} loading={loading}>
          {includeCheatingDetection ? t('pages.evaluateInterview.buttonWithCheating') : t('pages.evaluateInterview.buttonDefault')}
        </Button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-700">{t('pages.evaluateInterview.resultTitle')}</h3>
          {result?.data && (
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('formatted')}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  viewMode === 'formatted'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {t('actions.formattedView')}
              </button>
              <button
                onClick={() => setViewMode('json')}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  viewMode === 'json'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {t('actions.jsonView')}
              </button>
            </div>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="text-gray-600">
                {includeCheatingDetection 
                  ? t('pages.evaluateInterview.loadingWithCheating') 
                  : t('pages.evaluateInterview.loadingDefault')}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            <span className="font-medium">{t('messages.error')}:</span> {error}
          </div>
        )}

        {result?.data && !loading && (
          <>
            {result.cheatingDetectionIncluded && (
              <div className="mb-4 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                {t('pages.evaluateInterview.cheatingIncluded')}
              </div>
            )}
            
            {viewMode === 'formatted' ? (
              <EvaluationResultDisplay data={result.data} />
            ) : (
              <JsonViewer data={result.data} title={t('pages.evaluateInterview.jsonTitle')} />
            )}
          </>
        )}

        {!result?.data && !loading && !error && (
          <ResultViewer data={null} loading={false} error={null} />
        )}
      </div>
    </div>
  );
}
