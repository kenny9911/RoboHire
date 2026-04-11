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
      const next = (res.data?.data ?? res.data ?? null) as IdealProfileVersion | null;
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
        const next = (res.data?.data ?? res.data) as IdealProfileVersion;
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
        const next = (res.data?.data ?? res.data) as IdealProfileVersion;
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
