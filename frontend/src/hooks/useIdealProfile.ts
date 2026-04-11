import { useCallback, useEffect, useState } from 'react';
import axios from '../lib/axios';
import type { HardRequirement } from '../components/HardRequirementsEditor';

/**
 * Shape of a single AgentIdealProfile row returned by the backend.
 * Mirrors `IdealCandidateProfile` from `docs/icp-architecture.md` §2.
 */
export interface IdealCandidateProfile {
  seniorityRange?: { min: number; ideal: number; max?: number; unit: 'years' };
  preferredLocations?: string[];
  preferredIndustries?: string[];
  coreSkills: Array<{
    skill: string;
    importance: 'critical' | 'high' | 'medium';
    rationale: string;
  }>;
  bonusSkills: string[];
  antiSkills: string[];
  preferredCompanySizes?: Array<'startup' | 'midsize' | 'enterprise'>;
  preferredRoleProgression?: string;
  yearsOfExperience: { min: number; ideal: number; max?: number };
  signals: Array<{
    trait: string;
    weight: number;
    source: 'liked' | 'disliked' | 'jd';
    evidence?: string;
  }>;
  anchorCandidateIds: string[];
  antiAnchorCandidateIds: string[];
  generatedAt: string;
}

export interface IdealProfileVersion {
  id: string;
  agentId: string;
  version: number;
  profile: IdealCandidateProfile;
  suggestedHardRequirements: HardRequirement[];
  narrativeSummary: string;
  confidence: number;
  generatedFromLikes: number;
  generatedFromDislikes: number;
  generatedAt: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  llmModel?: string;
  llmProvider?: string;
}

export interface IdealProfileHookResult {
  profile: IdealProfileVersion | null;
  loading: boolean;
  error: string | null;
  /** `true` if the backend responded 404 (no profile yet). */
  missing: boolean;
  regenerate: (opts?: { force?: boolean }) => Promise<IdealProfileVersion | null>;
  regenerating: boolean;
  revert: (version: number) => Promise<void>;
  history: IdealProfileVersion[];
  historyLoading: boolean;
  fetchHistory: () => Promise<void>;
  promoteSuggestion: (ruleId: string) => Promise<void>;
  refetch: () => Promise<void>;
}

export const EMPTY_IDEAL_CANDIDATE_PROFILE: IdealCandidateProfile = {
  coreSkills: [],
  bonusSkills: [],
  antiSkills: [],
  yearsOfExperience: { min: 0, ideal: 0 },
  signals: [],
  anchorCandidateIds: [],
  antiAnchorCandidateIds: [],
  generatedAt: '',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function normalizeIdealCandidateProfile(value: unknown): IdealCandidateProfile {
  const candidate = isRecord(value) ? value : {};
  const years = isRecord(candidate.yearsOfExperience) ? candidate.yearsOfExperience : {};
  const seniorityRange = isRecord(candidate.seniorityRange) ? candidate.seniorityRange : null;

  return {
    ...EMPTY_IDEAL_CANDIDATE_PROFILE,
    ...(Array.isArray(candidate.preferredLocations)
      ? {
          preferredLocations: candidate.preferredLocations.filter(
            (item): item is string => typeof item === 'string',
          ),
        }
      : {}),
    ...(Array.isArray(candidate.preferredIndustries)
      ? {
          preferredIndustries: candidate.preferredIndustries.filter(
            (item): item is string => typeof item === 'string',
          ),
        }
      : {}),
    ...(Array.isArray(candidate.preferredCompanySizes)
      ? {
          preferredCompanySizes: candidate.preferredCompanySizes.filter(
            (
              item,
            ): item is 'startup' | 'midsize' | 'enterprise' =>
              item === 'startup' || item === 'midsize' || item === 'enterprise',
          ),
        }
      : {}),
    ...(typeof candidate.preferredRoleProgression === 'string'
      ? { preferredRoleProgression: candidate.preferredRoleProgression }
      : {}),
    ...(seniorityRange
      ? {
          seniorityRange: {
            min: typeof seniorityRange.min === 'number' ? seniorityRange.min : 0,
            ideal:
              typeof seniorityRange.ideal === 'number'
                ? seniorityRange.ideal
                : typeof seniorityRange.min === 'number'
                ? seniorityRange.min
                : 0,
            ...(typeof seniorityRange.max === 'number' ? { max: seniorityRange.max } : {}),
            unit: 'years' as const,
          },
        }
      : {}),
    coreSkills: Array.isArray(candidate.coreSkills)
      ? candidate.coreSkills
          .filter(
            (
              item,
            ): item is { skill: string; importance?: unknown; rationale?: unknown } =>
              isRecord(item) && typeof item.skill === 'string',
          )
          .map((item) => ({
            skill: item.skill,
            importance:
              item.importance === 'critical' || item.importance === 'high'
                ? item.importance
                : 'medium',
            rationale: typeof item.rationale === 'string' ? item.rationale : '',
          }))
      : [],
    bonusSkills: Array.isArray(candidate.bonusSkills)
      ? candidate.bonusSkills.filter((item): item is string => typeof item === 'string')
      : [],
    antiSkills: Array.isArray(candidate.antiSkills)
      ? candidate.antiSkills.filter((item): item is string => typeof item === 'string')
      : [],
    yearsOfExperience: {
      min: typeof years.min === 'number' ? years.min : 0,
      ideal:
        typeof years.ideal === 'number'
          ? years.ideal
          : typeof years.min === 'number'
          ? years.min
          : 0,
      ...(typeof years.max === 'number' ? { max: years.max } : {}),
    },
    signals: Array.isArray(candidate.signals)
      ? candidate.signals
          .filter(
            (
              item,
            ): item is {
              trait: string;
              weight?: unknown;
              source?: unknown;
              evidence?: unknown;
            } => isRecord(item) && typeof item.trait === 'string',
          )
          .map((item) => ({
            trait: item.trait,
            weight: typeof item.weight === 'number' ? item.weight : 0,
            source:
              item.source === 'liked' || item.source === 'disliked' ? item.source : 'jd',
            ...(typeof item.evidence === 'string' ? { evidence: item.evidence } : {}),
          }))
      : [],
    anchorCandidateIds: Array.isArray(candidate.anchorCandidateIds)
      ? candidate.anchorCandidateIds.filter((item): item is string => typeof item === 'string')
      : [],
    antiAnchorCandidateIds: Array.isArray(candidate.antiAnchorCandidateIds)
      ? candidate.antiAnchorCandidateIds.filter((item): item is string => typeof item === 'string')
      : [],
    generatedAt:
      typeof candidate.generatedAt === 'string'
        ? candidate.generatedAt
        : EMPTY_IDEAL_CANDIDATE_PROFILE.generatedAt,
  };
}

function normalizeIdealProfileVersion(value: unknown): IdealProfileVersion | null {
  if (!isRecord(value)) return null;

  const unwrapped =
    typeof value.version === 'number'
      ? value
      : isRecord(value.profile) && typeof value.profile.version === 'number'
      ? value.profile
      : null;

  if (!isRecord(unwrapped) || typeof unwrapped.version !== 'number') return null;

  return {
    id: typeof unwrapped.id === 'string' ? unwrapped.id : '',
    agentId: typeof unwrapped.agentId === 'string' ? unwrapped.agentId : '',
    version: unwrapped.version,
    profile: normalizeIdealCandidateProfile(unwrapped.profile),
    suggestedHardRequirements: Array.isArray(unwrapped.suggestedHardRequirements)
      ? (unwrapped.suggestedHardRequirements as HardRequirement[])
      : [],
    narrativeSummary:
      typeof unwrapped.narrativeSummary === 'string' ? unwrapped.narrativeSummary : '',
    confidence: typeof unwrapped.confidence === 'number' ? unwrapped.confidence : 0,
    generatedFromLikes:
      typeof unwrapped.generatedFromLikes === 'number' ? unwrapped.generatedFromLikes : 0,
    generatedFromDislikes:
      typeof unwrapped.generatedFromDislikes === 'number'
        ? unwrapped.generatedFromDislikes
        : 0,
    generatedAt: typeof unwrapped.generatedAt === 'string' ? unwrapped.generatedAt : '',
    tokensIn: typeof unwrapped.tokensIn === 'number' ? unwrapped.tokensIn : undefined,
    tokensOut: typeof unwrapped.tokensOut === 'number' ? unwrapped.tokensOut : undefined,
    costUsd: typeof unwrapped.costUsd === 'number' ? unwrapped.costUsd : undefined,
    llmModel: typeof unwrapped.llmModel === 'string' ? unwrapped.llmModel : undefined,
    llmProvider:
      typeof unwrapped.llmProvider === 'string' ? unwrapped.llmProvider : undefined,
  };
}

/**
 * Encapsulates all 4 ICP endpoints for a given agent. Components that need the
 * profile data can pull from this hook instead of hand-rolling fetch logic.
 *
 * Fails gracefully if the backend hasn't deployed the endpoints yet — empty /
 * missing states are returned rather than throwing so consuming components can
 * render an empty-state prompt.
 */
export function useIdealProfile(agentId: string | null): IdealProfileHookResult {
  const [profile, setProfile] = useState<IdealProfileVersion | null>(null);
  const [loading, setLoading] = useState<boolean>(!!agentId);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<boolean>(false);
  const [regenerating, setRegenerating] = useState<boolean>(false);
  const [history, setHistory] = useState<IdealProfileVersion[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);

  const fetchProfile = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/v1/agents/${agentId}/ideal-profile`);
      const next = normalizeIdealProfileVersion(res.data?.data ?? res.data ?? null);
      setProfile(next);
      setMissing(next === null);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setMissing(true);
        setProfile(null);
      } else {
        const msg =
          (err as { response?: { data?: { error?: { message?: string } | string } } })?.response?.data?.error;
        setError(typeof msg === 'string' ? msg : msg?.message || 'Failed to load ideal profile');
      }
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    if (!agentId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    void fetchProfile();
  }, [agentId, fetchProfile]);

  const regenerate = useCallback(
    async (opts?: { force?: boolean }): Promise<IdealProfileVersion | null> => {
      if (!agentId) return null;
      setRegenerating(true);
      setError(null);
      try {
        const res = await axios.post(`/api/v1/agents/${agentId}/ideal-profile/regenerate`, {
          force: opts?.force ?? false,
        });
        const next = normalizeIdealProfileVersion(res.data?.data ?? res.data);
        if (!next) throw new Error('Invalid ideal profile response');
        setProfile(next);
        setMissing(false);
        return next;
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { error?: { message?: string } | string } } })?.response?.data?.error;
        setError(typeof msg === 'string' ? msg : msg?.message || 'Failed to regenerate');
        return null;
      } finally {
        setRegenerating(false);
      }
    },
    [agentId],
  );

  const revert = useCallback(
    async (version: number) => {
      if (!agentId) return;
      try {
        const res = await axios.post(`/api/v1/agents/${agentId}/ideal-profile/revert`, { version });
        const next = normalizeIdealProfileVersion(res.data?.data ?? res.data);
        if (!next) throw new Error('Invalid ideal profile response');
        setProfile(next);
        setMissing(false);
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { error?: { message?: string } | string } } })?.response?.data?.error;
        setError(typeof msg === 'string' ? msg : msg?.message || 'Failed to revert');
      }
    },
    [agentId],
  );

  const fetchHistory = useCallback(async () => {
    if (!agentId) return;
    setHistoryLoading(true);
    try {
      const res = await axios.get(`/api/v1/agents/${agentId}/ideal-profile/history`);
      const payload = res.data?.data ?? res.data;
      setHistory((payload?.versions ?? payload ?? []) as IdealProfileVersion[]);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [agentId]);

  const promoteSuggestion = useCallback(
    async (ruleId: string) => {
      if (!agentId) return;
      try {
        await axios.post(`/api/v1/agents/${agentId}/ideal-profile/promote-suggestion`, { ruleId });
        await fetchProfile();
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { error?: { message?: string } | string } } })?.response?.data?.error;
        setError(typeof msg === 'string' ? msg : msg?.message || 'Failed to promote suggestion');
      }
    },
    [agentId, fetchProfile],
  );

  return {
    profile,
    loading,
    error,
    missing,
    regenerate,
    regenerating,
    revert,
    history,
    historyLoading,
    fetchHistory,
    promoteSuggestion,
    refetch: fetchProfile,
  };
}
