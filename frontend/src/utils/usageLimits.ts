export type UsageLimitValue = number | null | undefined;

export interface UsageLimitUserLike {
  planMaxInterviews?: UsageLimitValue;
  planMaxMatches?: UsageLimitValue;
  effectiveMaxInterviews?: UsageLimitValue;
  effectiveMaxMatches?: UsageLimitValue;
}

export function getEffectiveInterviewLimit(user?: UsageLimitUserLike | null): number | null {
  return user?.effectiveMaxInterviews ?? user?.planMaxInterviews ?? null;
}

export function getEffectiveMatchLimit(user?: UsageLimitUserLike | null): number | null {
  return user?.effectiveMaxMatches ?? user?.planMaxMatches ?? null;
}

export function getPlanInterviewLimit(user?: UsageLimitUserLike | null): number | null {
  return user?.planMaxInterviews ?? null;
}

export function getPlanMatchLimit(user?: UsageLimitUserLike | null): number | null {
  return user?.planMaxMatches ?? null;
}

export function formatUsageLimit(limit: UsageLimitValue): string {
  return limit == null ? '∞' : String(limit);
}

export function getRemainingUsage(limit: UsageLimitValue, used: number): string {
  if (limit == null) return '∞';
  return String(Math.max(0, limit - used));
}

export function getUsagePercentage(limit: UsageLimitValue, used: number): number {
  if (limit == null || limit <= 0) {
    return 0;
  }
  return Math.min(100, (used / limit) * 100);
}

export function isUsageExceeded(limit: UsageLimitValue, used: number): boolean {
  return limit != null && used >= limit;
}
