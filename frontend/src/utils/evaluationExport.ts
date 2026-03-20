/**
 * Evaluation export utilities — Markdown, Word (HTML), and download helpers.
 */

interface ExportMeta {
  candidateName: string;
  jobTitle?: string | null;
  interviewDate?: string | null;
  score?: number | null;
  verdict?: string | null;
}

/* -------------------------------------------------------------------------- */
/*  Download helper                                                           */
/* -------------------------------------------------------------------------- */

export function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* -------------------------------------------------------------------------- */
/*  Verdict formatting                                                        */
/* -------------------------------------------------------------------------- */

function formatVerdict(v?: string | null): string {
  if (!v) return '-';
  return v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/* -------------------------------------------------------------------------- */
/*  Section renderers (shared between MD and HTML)                            */
/* -------------------------------------------------------------------------- */

function renderArraySection(items: string[] | undefined, fallback = 'N/A'): string[] {
  if (!items || items.length === 0) return [fallback];
  return items.map((item) => `- ${item}`);
}

/* -------------------------------------------------------------------------- */
/*  Markdown export                                                           */
/* -------------------------------------------------------------------------- */

export function generateEvaluationMarkdown(data: any, meta: ExportMeta): string {
  const lines: string[] = [];
  const push = (...l: string[]) => lines.push(...l, '');

  push(`# Interview Evaluation Report`);
  push(`**Candidate:** ${meta.candidateName}`);
  if (meta.jobTitle) push(`**Position:** ${meta.jobTitle}`);
  if (meta.interviewDate) push(`**Date:** ${new Date(meta.interviewDate).toLocaleDateString()}`);
  if (meta.score != null) push(`**Score:** ${meta.score}/100`);
  if (meta.verdict) push(`**Verdict:** ${formatVerdict(meta.verdict)}`);
  push('---');

  if (data.summary) {
    push(`## Summary`, data.summary);
  }

  if (data.strengths?.length) {
    push(`## Strengths`, ...renderArraySection(data.strengths));
  }

  if (data.weaknesses?.length) {
    push(`## Weaknesses`, ...renderArraySection(data.weaknesses));
  }

  if (data.recommendation) {
    push(`## Recommendation`, data.recommendation);
  }

  // Must-Have Analysis
  if (data.mustHaveAnalysis) {
    const mha = data.mustHaveAnalysis;
    push(`## Must-Have Requirements Analysis`);
    push(`**Pass Rate:** ${mha.passRate || '-'}  |  **Must-Have Score:** ${mha.mustHaveScore ?? '-'}/100`);
    if (mha.disqualified) push(`**DISQUALIFIED** — ${(mha.disqualificationReasons || []).join('; ')}`);
    if (mha.assessment) push(mha.assessment);

    if (mha.interviewVerification?.verified?.length) {
      push(`### Verified Requirements`);
      for (const v of mha.interviewVerification.verified) {
        push(`- **${v.requirement}** — ${v.evidence} (confidence: ${v.confidenceLevel})`);
      }
    }
    if (mha.interviewVerification?.failed?.length) {
      push(`### Failed Requirements`);
      for (const f of mha.interviewVerification.failed) {
        push(`- **${f.requirement}** — ${f.reason} (severity: ${f.severity})`);
      }
    }
  }

  // Technical Analysis
  if (data.technicalAnalysis) {
    const ta = data.technicalAnalysis;
    push(`## Technical Analysis`);
    push(`**Depth Rating:** ${ta.depthRating || '-'}`);
    if (ta.summary) push(ta.summary);
    if (ta.details?.length) push(...renderArraySection(ta.details));
    if (ta.provenSkills?.length) push(`**Proven Skills:** ${ta.provenSkills.join(', ')}`);
    if (ta.claimedButUnverified?.length) push(`**Claimed but Unverified:** ${ta.claimedButUnverified.join(', ')}`);
  }

  // JD Match
  if (data.jdMatch) {
    const jd = data.jdMatch;
    push(`## Job Description Match`);
    if (jd.summary) push(jd.summary);
    if (jd.requirements?.length) {
      push(`### Requirements`);
      for (const r of jd.requirements) {
        push(`- **${r.requirement}** — ${r.matchLevel} (${r.score}/100): ${r.explanation}`);
      }
    }
    if (jd.extraSkillsFound?.length) push(`**Extra Skills Found:** ${jd.extraSkillsFound.join(', ')}`);
  }

  // Behavioral Analysis
  if (data.behavioralAnalysis) {
    const ba = data.behavioralAnalysis;
    push(`## Behavioral Analysis`);
    push(`**Compatibility:** ${ba.compatibility || '-'}`);
    if (ba.summary) push(ba.summary);
    if (ba.details?.length) push(...renderArraySection(ba.details));
  }

  // Q&A Assessment
  if (data.questionAnswerAssessment?.length) {
    push(`## Question & Answer Assessment`);
    for (const qa of data.questionAnswerAssessment) {
      push(`### Q: ${qa.question}`);
      push(`**Answer:** ${qa.answer}`);
      push(`**Score:** ${qa.score}/100  |  **Correctness:** ${qa.correctness}`);
      if (qa.thoughtProcess) push(`**Thought Process:** ${qa.thoughtProcess}`);
      if (qa.clarity) push(`**Clarity:** ${qa.clarity}`);
    }
  }

  // Level Assessment
  if (data.levelAssessment) {
    push(`## Level Assessment`, data.levelAssessment);
  }

  // Interviewer's Kit
  if (data.interviewersKit) {
    const kit = data.interviewersKit;
    push(`## Interviewer's Kit`);
    if (kit.suggestedQuestions?.length) {
      push(`### Suggested Follow-up Questions`, ...renderArraySection(kit.suggestedQuestions));
    }
    if (kit.focusAreas?.length) {
      push(`### Focus Areas`, ...renderArraySection(kit.focusAreas));
    }
  }

  // Cheating Analysis
  if (data.cheatingAnalysis) {
    const ca = data.cheatingAnalysis;
    push(`## Integrity / Cheating Analysis`);
    push(`**Risk Level:** ${ca.riskLevel}  |  **Suspicion Score:** ${ca.suspicionScore}/100`);
    if (ca.summary) push(ca.summary);
    if (ca.indicators?.length) {
      for (const ind of ca.indicators) {
        push(`- **${ind.type}** (${ind.severity}): ${ind.description}`);
      }
    }
    if (ca.authenticitySignals?.length) push(`**Authenticity Signals:** ${ca.authenticitySignals.join(', ')}`);
  }

  // Skills Assessment
  if (data.skillsAssessment?.length) {
    push(`## Skills Assessment`);
    for (const s of data.skillsAssessment) {
      push(`- **${s.skill}** — ${s.rating}: ${s.evidence}`);
    }
  }

  // Personality Assessment
  if (data.personalityAssessment) {
    const pa = data.personalityAssessment;
    push(`## Personality Assessment (性格测试)`);
    push(`**MBTI Estimate:** ${pa.mbtiEstimate} (${pa.mbtiConfidence} confidence)`);
    if (pa.mbtiExplanation) push(pa.mbtiExplanation);
    if (pa.bigFiveTraits?.length) {
      push(`### Big Five Traits (OCEAN)`);
      for (const t of pa.bigFiveTraits) {
        push(`- **${t.trait}** — ${t.level}: ${t.evidence}`);
      }
    }
    if (pa.communicationStyle) push(`**Communication Style:** ${pa.communicationStyle}`);
    if (pa.workStylePreferences?.length) push(`**Work Style:** ${pa.workStylePreferences.join(', ')}`);
    if (pa.motivators?.length) push(`**Motivators:** ${pa.motivators.join(', ')}`);
    if (pa.potentialChallenges?.length) push(`**Potential Challenges:** ${pa.potentialChallenges.join(', ')}`);
    if (pa.teamDynamicsAdvice) push(`**Team Dynamics:** ${pa.teamDynamicsAdvice}`);
    if (pa.summary) push(pa.summary);
  }

  // Expert Advice
  if (data.expertAdvice) {
    push(`## Expert Advice`, data.expertAdvice);
  }

  push('---', `*Report generated by RoboHire AI — ${new Date().toLocaleDateString()}*`);

  return lines.join('\n');
}

/* -------------------------------------------------------------------------- */
/*  Word (HTML) export                                                        */
/* -------------------------------------------------------------------------- */

export function generateEvaluationWordHTML(data: any, meta: ExportMeta): string {
  // Converts the markdown to minimal HTML that Word can read
  const md = generateEvaluationMarkdown(data, meta);

  // Simple markdown → HTML converter (headings, bold, lists, hr)
  const htmlBody = md
    .split('\n')
    .map((line) => {
      if (line.startsWith('### ')) return `<h3>${line.slice(4)}</h3>`;
      if (line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`;
      if (line.startsWith('# ')) return `<h1>${line.slice(2)}</h1>`;
      if (line === '---') return '<hr/>';
      if (line.startsWith('- ')) return `<li>${line.slice(2)}</li>`;
      if (line.trim() === '') return '<br/>';
      // Bold
      const withBold = line.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      // Italic
      const withItalic = withBold.replace(/\*(.+?)\*/g, '<i>$1</i>');
      return `<p>${withItalic}</p>`;
    })
    .join('\n');

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"/>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 2cm; color: #1e293b; line-height: 1.6; }
  h1 { font-size: 24pt; color: #0f172a; border-bottom: 2px solid #3b82f6; padding-bottom: 4px; }
  h2 { font-size: 16pt; color: #1e40af; margin-top: 20px; }
  h3 { font-size: 13pt; color: #334155; }
  p { margin: 4px 0; }
  li { margin-left: 20px; }
  hr { border: 1px solid #e2e8f0; margin: 20px 0; }
  b { color: #0f172a; }
</style></head>
<body>${htmlBody}</body></html>`;
}
