export function normalizeInterviewJoinCode(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return '';

  const queryMatch = trimmed.match(/[?&](?:token|code)=([^&#]+)/i);
  if (queryMatch?.[1]) {
    return decodeURIComponent(queryMatch[1]);
  }

  try {
    const url = new URL(trimmed);
    const token = url.searchParams.get('token') || url.searchParams.get('code');
    if (token) {
      return token.trim();
    }

    const pathParts = url.pathname.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1];
    if (lastPart && (url.pathname.startsWith('/interview/') || url.pathname.startsWith('/interview-room/'))) {
      return decodeURIComponent(lastPart).trim();
    }
  } catch {
    // Ignore invalid URLs and use the raw input value.
  }

  return trimmed;
}
