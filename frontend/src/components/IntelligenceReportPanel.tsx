import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from '../lib/axios';

interface IntelligenceReportPanelProps {
  hiringRequestId: string;
}

interface SalaryRange {
  region: string;
  level: string;
  rangeLow: string;
  rangeHigh: string;
  currency: string;
  notes: string;
}

interface Platform {
  platform: string;
  effectiveness: 'High' | 'Medium' | 'Low';
  strategy: string;
  searchKeywords?: string[];
}

interface IntelligenceReport {
  candidateProfile: {
    candidatePersonaSummary: string;
    idealBackground: {
      typicalDegrees: string[];
      typicalCareerPath: string[];
      yearsOfExperience: string;
      industryBackground: string[];
    };
    skillMapping: {
      mustHave: Array<{ skill: string; seniorityExpectation: string; reason: string }>;
      niceToHave: Array<{ skill: string; valueAdd: string }>;
    };
    personalityTraits: {
      traits: Array<{ trait: string; importance: string; reason: string }>;
      cultureFitIndicators: string[];
    };
    dayInTheLife: string;
  };
  sourcingStrategy: {
    sourcingSummary: string;
    platforms: Platform[];
    booleanSearchStrings: string[];
    targetCompanies: Array<{ company: string; reason: string }>;
    targetIndustries: string[];
    passiveVsActive: {
      recommendation: string;
      passiveStrategy: string;
      activeStrategy: string;
    };
    networkingStrategies: Array<{ strategy: string; expectedYield: string; details: string }>;
  };
  marketIntelligence: {
    marketSummary: string;
    salaryRanges: SalaryRange[];
    supplyDemand: { assessment: string; details: string; talentPoolSize: string };
    recruitmentDifficulty: { score: number; level: string; factors: string[] };
    timeToHire: { estimateDays: string; factors: string[] };
    competition: Array<{ competitor: string; hiringActivity: string; relevance: string }>;
    marketTrends: Array<{ trend: string; impact: string; details: string }>;
  };
  generatedAt: string;
}

type SectionName = 'candidateProfile' | 'sourcingStrategy' | 'marketIntelligence';

export default function IntelligenceReportPanel({ hiringRequestId }: IntelligenceReportPanelProps) {
  const { t } = useTranslation();
  const [report, setReport] = useState<IntelligenceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [fetchingCache, setFetchingCache] = useState(true);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<SectionName, boolean>>({
    candidateProfile: true,
    sourcingStrategy: true,
    marketIntelligence: true,
  });
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const fetchCachedReport = useCallback(async () => {
    try {
      const res = await axios.get(`/api/v1/hiring-requests/${hiringRequestId}/intelligence`);
      if (res.data.success && res.data.data) {
        setReport(res.data.data);
        setGeneratedAt(res.data.generatedAt);
      }
    } catch {
      // No cached report
    } finally {
      setFetchingCache(false);
    }
  }, [hiringRequestId]);

  useEffect(() => {
    fetchCachedReport();
  }, [fetchCachedReport]);

  const generateReport = async (force = false) => {
    setLoading(true);
    setLoadingStep(1);

    const stepTimer1 = setTimeout(() => setLoadingStep(2), 4000);
    const stepTimer2 = setTimeout(() => setLoadingStep(3), 10000);

    try {
      const res = await axios.post(`/api/v1/hiring-requests/${hiringRequestId}/intelligence`, { force });
      if (res.data.success) {
        setReport(res.data.data);
        setGeneratedAt(new Date().toISOString());
      }
    } catch {
      // Error handled silently
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setLoading(false);
      setLoadingStep(0);
    }
  };

  const toggleSection = (section: SectionName) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const getEffectivenessColor = (level: string) => {
    switch (level) {
      case 'High': return 'bg-emerald-100 text-emerald-700';
      case 'Medium': return 'bg-amber-100 text-amber-700';
      case 'Low': return 'bg-gray-100 text-gray-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getImportanceColor = (level: string) => {
    switch (level) {
      case 'Critical': return 'bg-rose-100 text-rose-700';
      case 'High': return 'bg-orange-100 text-orange-700';
      case 'Medium': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'Positive': return 'text-emerald-600';
      case 'Negative': return 'text-rose-600';
      case 'Neutral': return 'text-gray-500';
      default: return 'text-gray-500';
    }
  };

  const getDifficultyColor = (score: number) => {
    if (score <= 3) return 'text-emerald-600';
    if (score <= 5) return 'text-amber-600';
    if (score <= 7) return 'text-orange-600';
    return 'text-rose-600';
  };

  const getDifficultyBarColor = (score: number) => {
    if (score <= 3) return 'bg-emerald-500';
    if (score <= 5) return 'bg-amber-500';
    if (score <= 7) return 'bg-orange-500';
    return 'bg-rose-500';
  };

  if (fetchingCache) return null;

  // Loading state
  if (loading) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            {t('dashboard.intelligence.title')}
          </h2>
        </div>
        <div className="p-8 flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-200 border-t-indigo-600" />
          <div className="text-center space-y-2">
            <p className="text-sm font-medium text-gray-700">
              {t('dashboard.intelligence.generating')}
            </p>
            <div className="space-y-1.5 text-xs text-gray-500">
              <p className={loadingStep >= 1 ? 'text-indigo-600 font-medium' : ''}>
                {loadingStep > 1 ? '✓ ' : loadingStep === 1 ? '→ ' : ''}
                {t('dashboard.intelligence.generatingStep1')}
              </p>
              <p className={loadingStep >= 2 ? 'text-indigo-600 font-medium' : ''}>
                {loadingStep > 2 ? '✓ ' : loadingStep === 2 ? '→ ' : ''}
                {t('dashboard.intelligence.generatingStep2')}
              </p>
              <p className={loadingStep >= 3 ? 'text-indigo-600 font-medium' : ''}>
                {loadingStep === 3 ? '→ ' : ''}
                {t('dashboard.intelligence.generatingStep3')}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!report) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            {t('dashboard.intelligence.title')}
          </h2>
        </div>
        <div className="p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700 mb-1">
            {t('dashboard.intelligence.noReport')}
          </p>
          <p className="text-xs text-gray-500 mb-4">
            {t('dashboard.intelligence.noReportDesc')}
          </p>
          <button
            onClick={() => generateReport()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            {t('dashboard.intelligence.generate')}
          </button>
        </div>
      </div>
    );
  }

  // Report display
  const { candidateProfile, sourcingStrategy, marketIntelligence } = report;

  const SectionHeader = ({ section, title }: { section: SectionName; title: string }) => (
    <button
      onClick={() => toggleSection(section)}
      className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
    >
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      <svg
        className={`w-4 h-4 text-gray-400 transition-transform ${expandedSections[section] ? 'rotate-180' : ''}`}
        fill="none" viewBox="0 0 24 24" stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            {t('dashboard.intelligence.title')}
          </h2>
          {generatedAt && (
            <p className="text-xs text-gray-400 mt-0.5">
              {t('dashboard.intelligence.generatedAt')}: {new Date(generatedAt).toLocaleDateString()}
            </p>
          )}
        </div>
        <button
          onClick={() => generateReport(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {t('dashboard.intelligence.regenerate')}
        </button>
      </div>

      {/* Section 1: Candidate Profile */}
      <SectionHeader section="candidateProfile" title={t('dashboard.intelligence.candidateProfile')} />
      {expandedSections.candidateProfile && (
        <div className="px-5 py-4 space-y-4 border-b border-gray-100">
          {/* Persona Summary */}
          <div className="bg-indigo-50 rounded-xl p-4">
            <p className="text-xs font-medium text-indigo-600 mb-1">{t('dashboard.intelligence.persona')}</p>
            <p className="text-sm text-gray-700">{candidateProfile.candidatePersonaSummary}</p>
          </div>

          {/* Ideal Background */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-500 mb-1.5">{t('dashboard.intelligence.degrees')}</p>
              <div className="flex flex-wrap gap-1.5">
                {candidateProfile.idealBackground.typicalDegrees.map((d, i) => (
                  <span key={i} className="text-xs bg-white border border-gray-200 rounded-full px-2.5 py-0.5 text-gray-700">{d}</span>
                ))}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-500 mb-1.5">{t('dashboard.intelligence.experience')}</p>
              <p className="text-sm text-gray-700">{candidateProfile.idealBackground.yearsOfExperience}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-500 mb-1.5">{t('dashboard.intelligence.careerPath')}</p>
              <div className="space-y-1">
                {candidateProfile.idealBackground.typicalCareerPath.map((p, i) => (
                  <p key={i} className="text-xs text-gray-600">{p}</p>
                ))}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-500 mb-1.5">{t('dashboard.intelligence.industryBackground')}</p>
              <div className="flex flex-wrap gap-1.5">
                {candidateProfile.idealBackground.industryBackground.map((ind, i) => (
                  <span key={i} className="text-xs bg-white border border-gray-200 rounded-full px-2.5 py-0.5 text-gray-700">{ind}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Skills Mapping */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">{t('dashboard.intelligence.skillMapping')}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium text-rose-600 mb-1.5">{t('dashboard.intelligence.mustHave')}</p>
                <div className="space-y-1.5">
                  {candidateProfile.skillMapping.mustHave.map((s, i) => (
                    <div key={i} className="bg-rose-50 rounded-lg p-2.5">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-gray-800">{s.skill}</span>
                        <span className="text-[10px] bg-rose-100 text-rose-600 rounded px-1.5 py-0.5">{s.seniorityExpectation}</span>
                      </div>
                      <p className="text-[11px] text-gray-500">{s.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-emerald-600 mb-1.5">{t('dashboard.intelligence.niceToHave')}</p>
                <div className="space-y-1.5">
                  {candidateProfile.skillMapping.niceToHave.map((s, i) => (
                    <div key={i} className="bg-emerald-50 rounded-lg p-2.5">
                      <span className="text-xs font-medium text-gray-800">{s.skill}</span>
                      <p className="text-[11px] text-gray-500">{s.valueAdd}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Personality Traits */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">{t('dashboard.intelligence.personalityTraits')}</p>
            <div className="space-y-1.5">
              {candidateProfile.personalityTraits.traits.map((tr, i) => (
                <div key={i} className="flex items-start gap-2 bg-gray-50 rounded-lg p-2.5">
                  <span className={`text-[10px] rounded px-1.5 py-0.5 font-medium flex-shrink-0 ${getImportanceColor(tr.importance)}`}>
                    {tr.importance}
                  </span>
                  <div>
                    <span className="text-xs font-medium text-gray-800">{tr.trait}</span>
                    <p className="text-[11px] text-gray-500">{tr.reason}</p>
                  </div>
                </div>
              ))}
            </div>
            {candidateProfile.personalityTraits.cultureFitIndicators.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-gray-500 mb-1">{t('dashboard.intelligence.cultureFit')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {candidateProfile.personalityTraits.cultureFitIndicators.map((c, i) => (
                    <span key={i} className="text-xs bg-violet-50 text-violet-700 rounded-full px-2.5 py-0.5">{c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Day in the Life */}
          {candidateProfile.dayInTheLife && (
            <div className="bg-amber-50 rounded-xl p-4">
              <p className="text-xs font-medium text-amber-600 mb-1">{t('dashboard.intelligence.dayInTheLife')}</p>
              <p className="text-sm text-gray-700">{candidateProfile.dayInTheLife}</p>
            </div>
          )}
        </div>
      )}

      {/* Section 2: Sourcing Strategy */}
      <SectionHeader section="sourcingStrategy" title={t('dashboard.intelligence.sourcingStrategy')} />
      {expandedSections.sourcingStrategy && (
        <div className="px-5 py-4 space-y-4 border-b border-gray-100">
          {/* Summary */}
          <div className="bg-blue-50 rounded-xl p-4">
            <p className="text-xs font-medium text-blue-600 mb-1">{t('dashboard.intelligence.sourcingSummary')}</p>
            <p className="text-sm text-gray-700">{sourcingStrategy.sourcingSummary}</p>
          </div>

          {/* Platforms */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">{t('dashboard.intelligence.platforms')}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {sourcingStrategy.platforms.map((p, i) => (
                <div key={i} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-gray-800">{p.platform}</span>
                    <span className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${getEffectivenessColor(p.effectiveness)}`}>
                      {p.effectiveness}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500">{p.strategy}</p>
                  {p.searchKeywords && p.searchKeywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {p.searchKeywords.map((kw, ki) => (
                        <span key={ki} className="text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{kw}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Boolean Search Strings */}
          {sourcingStrategy.booleanSearchStrings.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">{t('dashboard.intelligence.booleanSearch')}</p>
              <div className="space-y-1.5">
                {sourcingStrategy.booleanSearchStrings.map((bs, i) => (
                  <div key={i} className="flex items-start gap-2 bg-gray-50 rounded-lg p-2.5">
                    <code className="text-[11px] text-gray-700 flex-1 break-all">{bs}</code>
                    <button
                      onClick={() => copyToClipboard(bs, i)}
                      className="text-[10px] text-gray-400 hover:text-indigo-600 flex-shrink-0 transition-colors"
                    >
                      {copiedIndex === i ? t('dashboard.intelligence.copied') : t('dashboard.intelligence.copy')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Target Companies */}
          {sourcingStrategy.targetCompanies.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">{t('dashboard.intelligence.targetCompanies')}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {sourcingStrategy.targetCompanies.map((tc, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-2.5">
                    <span className="text-xs font-medium text-gray-800">{tc.company}</span>
                    <p className="text-[11px] text-gray-500">{tc.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Passive vs Active */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <p className="text-xs font-medium text-gray-500">{t('dashboard.intelligence.passiveStrategy')}</p>
                {sourcingStrategy.passiveVsActive.recommendation !== 'Active' && (
                  <span className="text-[10px] bg-indigo-100 text-indigo-600 rounded px-1.5 py-0.5">
                    {t('dashboard.intelligence.passive')}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-600">{sourcingStrategy.passiveVsActive.passiveStrategy}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <p className="text-xs font-medium text-gray-500">{t('dashboard.intelligence.activeStrategy')}</p>
                {sourcingStrategy.passiveVsActive.recommendation !== 'Passive' && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-600 rounded px-1.5 py-0.5">
                    {t('dashboard.intelligence.active')}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-600">{sourcingStrategy.passiveVsActive.activeStrategy}</p>
            </div>
          </div>

          {/* Networking */}
          {sourcingStrategy.networkingStrategies.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">{t('dashboard.intelligence.networking')}</p>
              <div className="space-y-1.5">
                {sourcingStrategy.networkingStrategies.map((ns, i) => (
                  <div key={i} className="flex items-start gap-2 bg-gray-50 rounded-lg p-2.5">
                    <span className={`text-[10px] rounded px-1.5 py-0.5 font-medium flex-shrink-0 ${getEffectivenessColor(ns.expectedYield)}`}>
                      {ns.expectedYield}
                    </span>
                    <div>
                      <span className="text-xs font-medium text-gray-800">{ns.strategy}</span>
                      <p className="text-[11px] text-gray-500">{ns.details}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Section 3: Market Intelligence */}
      <SectionHeader section="marketIntelligence" title={t('dashboard.intelligence.marketIntelligence')} />
      {expandedSections.marketIntelligence && (
        <div className="px-5 py-4 space-y-4">
          {/* Summary */}
          <div className="bg-teal-50 rounded-xl p-4">
            <p className="text-xs font-medium text-teal-600 mb-1">{t('dashboard.intelligence.marketSummary')}</p>
            <p className="text-sm text-gray-700">{marketIntelligence.marketSummary}</p>
          </div>

          {/* Difficulty Score + Supply/Demand */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Difficulty Gauge */}
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs font-medium text-gray-500 mb-2">{t('dashboard.intelligence.difficultyScore')}</p>
              <div className={`text-3xl font-bold ${getDifficultyColor(marketIntelligence.recruitmentDifficulty.score)}`}>
                {marketIntelligence.recruitmentDifficulty.score}<span className="text-sm text-gray-400">/10</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                <div
                  className={`h-1.5 rounded-full transition-all ${getDifficultyBarColor(marketIntelligence.recruitmentDifficulty.score)}`}
                  style={{ width: `${marketIntelligence.recruitmentDifficulty.score * 10}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">{marketIntelligence.recruitmentDifficulty.level}</p>
            </div>

            {/* Supply/Demand */}
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs font-medium text-gray-500 mb-2">{t('dashboard.intelligence.supplyDemand')}</p>
              <p className="text-sm font-semibold text-gray-800">{marketIntelligence.supplyDemand.assessment}</p>
              <p className="text-[11px] text-gray-500 mt-1">{t('dashboard.intelligence.talentPoolSize')}: {marketIntelligence.supplyDemand.talentPoolSize}</p>
            </div>

            {/* Time to Hire */}
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs font-medium text-gray-500 mb-2">{t('dashboard.intelligence.timeToHire')}</p>
              <p className="text-2xl font-bold text-gray-800">{marketIntelligence.timeToHire.estimateDays}</p>
              <p className="text-xs text-gray-400">{t('dashboard.intelligence.estimateDays')}</p>
            </div>
          </div>

          {/* Difficulty Factors */}
          {marketIntelligence.recruitmentDifficulty.factors.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">{t('dashboard.intelligence.factors')}</p>
              <div className="flex flex-wrap gap-1.5">
                {marketIntelligence.recruitmentDifficulty.factors.map((f, i) => (
                  <span key={i} className="text-xs bg-gray-100 text-gray-600 rounded-full px-2.5 py-0.5">{f}</span>
                ))}
              </div>
            </div>
          )}

          {/* Salary Ranges */}
          {marketIntelligence.salaryRanges.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">{t('dashboard.intelligence.salaryRanges')}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 px-2 font-medium text-gray-500">{t('dashboard.intelligence.region')}</th>
                      <th className="text-left py-2 px-2 font-medium text-gray-500">{t('dashboard.intelligence.level')}</th>
                      <th className="text-left py-2 px-2 font-medium text-gray-500">{t('dashboard.intelligence.range')}</th>
                      <th className="text-left py-2 px-2 font-medium text-gray-500">{t('dashboard.intelligence.notes')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketIntelligence.salaryRanges.map((sr, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2 px-2 text-gray-700">{sr.region}</td>
                        <td className="py-2 px-2 text-gray-700">{sr.level}</td>
                        <td className="py-2 px-2 font-medium text-gray-800">{sr.rangeLow} – {sr.rangeHigh} {sr.currency}</td>
                        <td className="py-2 px-2 text-gray-500">{sr.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Competition */}
          {marketIntelligence.competition.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">{t('dashboard.intelligence.competition')}</p>
              <div className="space-y-1.5">
                {marketIntelligence.competition.map((c, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-2.5">
                    <span className="text-xs font-medium text-gray-800">{c.competitor}</span>
                    <p className="text-[11px] text-gray-500">{c.hiringActivity} — {c.relevance}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Market Trends */}
          {marketIntelligence.marketTrends.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">{t('dashboard.intelligence.marketTrends')}</p>
              <div className="space-y-1.5">
                {marketIntelligence.marketTrends.map((mt, i) => (
                  <div key={i} className="flex items-start gap-2 bg-gray-50 rounded-lg p-2.5">
                    <span className={`text-xs font-medium flex-shrink-0 ${getImpactColor(mt.impact)}`}>
                      {mt.impact === 'Positive' ? '↑' : mt.impact === 'Negative' ? '↓' : '→'}
                    </span>
                    <div>
                      <span className="text-xs font-medium text-gray-800">{mt.trend}</span>
                      <p className="text-[11px] text-gray-500">{mt.details}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
