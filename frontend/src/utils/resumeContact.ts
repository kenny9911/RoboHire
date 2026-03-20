type ResumeContactSource = {
  email?: string | null;
  preferences?: {
    email?: string | null;
  } | null;
} | null | undefined;

function normalizeContactValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getPreferredResumeEmail(resume: ResumeContactSource): string | null {
  return normalizeContactValue(resume?.preferences?.email) || normalizeContactValue(resume?.email);
}
