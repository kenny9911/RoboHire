export interface DiffSegment {
  type: 'equal' | 'added' | 'removed';
  text: string;
}

/**
 * Word-level diff using LCS. Splits on whitespace boundaries,
 * preserving whitespace tokens for natural rendering.
 * Falls back to full replacement if combined word count > 500.
 */
export function wordDiff(original: string, revised: string): DiffSegment[] {
  if (original === revised) return [{ type: 'equal', text: original }];
  if (!original) return [{ type: 'added', text: revised }];
  if (!revised) return [{ type: 'removed', text: original }];

  const oldWords = original.split(/(\s+)/);
  const newWords = revised.split(/(\s+)/);

  // Safety cap — skip LCS for very long texts
  if (oldWords.length + newWords.length > 1000) {
    return [
      { type: 'removed', text: original },
      { type: 'added', text: revised },
    ];
  }

  const m = oldWords.length;
  const n = newWords.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        oldWords[i - 1] === newWords[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  const raw: DiffSegment[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      raw.push({ type: 'equal', text: oldWords[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.push({ type: 'added', text: newWords[j - 1] });
      j--;
    } else {
      raw.push({ type: 'removed', text: oldWords[i - 1] });
      i--;
    }
  }
  raw.reverse();

  // Merge consecutive segments of the same type
  const segments: DiffSegment[] = [];
  for (const seg of raw) {
    if (segments.length > 0 && segments[segments.length - 1].type === seg.type) {
      segments[segments.length - 1].text += seg.text;
    } else {
      segments.push({ ...seg });
    }
  }
  return segments;
}

/**
 * Diff two string arrays. Returns items categorised as kept, added, or removed.
 * Comparison is case-insensitive; original casing is preserved in output.
 */
export function arrayDiff(
  original: string[],
  revised: string[],
): { kept: string[]; added: string[]; removed: string[] } {
  const revisedLower = new Set(revised.map((s) => s.toLowerCase()));
  const originalLower = new Set(original.map((s) => s.toLowerCase()));
  return {
    kept: revised.filter((s) => originalLower.has(s.toLowerCase())),
    added: revised.filter((s) => !originalLower.has(s.toLowerCase())),
    removed: original.filter((s) => !revisedLower.has(s.toLowerCase())),
  };
}
