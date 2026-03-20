type ResumeContactSource = {
  email?: string | null;
  preferences?: unknown;
} | null | undefined;

function normalizeContactValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractPreferenceEmail(preferences: unknown): string | null {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
    return null;
  }

  return normalizeContactValue((preferences as Record<string, unknown>).email);
}

export function getPreferredResumeEmail(resume: ResumeContactSource): string | null {
  return extractPreferenceEmail(resume?.preferences) || normalizeContactValue(resume?.email);
}
