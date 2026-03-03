import type { MatchResultData, InterviewQuestionCategory } from '../components/MatchResultDisplay';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function scoreColor(score: number): string {
  if (score >= 80) return '#059669';
  if (score >= 60) return '#d97706';
  return '#dc2626';
}

function scoreBg(score: number): string {
  if (score >= 80) return '#d1fae5';
  if (score >= 60) return '#fef3c7';
  return '#fee2e2';
}

function renderTags(items: string[]): string {
  if (!items || items.length === 0) return '<span style="color:#9ca3af">—</span>';
  return items.map(s => `<span style="display:inline-block;background:#eef2ff;color:#4338ca;padding:2px 10px;border-radius:12px;margin:2px 4px 2px 0;font-size:13px">${escapeHtml(s)}</span>`).join('');
}

function renderScoreBar(label: string, score: number, maxLabel?: string): string {
  const pct = Math.min(100, Math.max(0, score));
  return `
    <div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px">
        <span style="color:#374151">${escapeHtml(label)}</span>
        <span style="font-weight:600;color:${scoreColor(score)}">${score}${maxLabel ? ` / ${maxLabel}` : ''}</span>
      </div>
      <div style="background:#e5e7eb;border-radius:6px;height:8px;overflow:hidden">
        <div style="background:${scoreColor(score)};width:${pct}%;height:100%;border-radius:6px;transition:width 0.3s"></div>
      </div>
    </div>`;
}

function section(title: string, content: string): string {
  return `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:20px">
      <h2 style="font-size:16px;font-weight:700;color:#111827;margin:0 0 16px 0;padding-bottom:10px;border-bottom:2px solid #eef2ff">${escapeHtml(title)}</h2>
      ${content}
    </div>`;
}

function renderInterviewQuestions(categories: InterviewQuestionCategory[], categoryTitle: string): string {
  if (!categories || categories.length === 0) return '';
  let html = `<h3 style="font-size:14px;font-weight:600;color:#4338ca;margin:16px 0 8px 0">${escapeHtml(categoryTitle)}</h3>`;
  for (const cat of categories) {
    html += `<div style="margin-bottom:12px">`;
    html += `<div style="font-weight:600;font-size:13px;color:#374151;margin-bottom:6px">${escapeHtml(cat.area)}${cat.subArea ? ` — ${escapeHtml(cat.subArea)}` : ''}</div>`;
    for (const q of cat.questions) {
      html += `<div style="background:#f9fafb;border-radius:8px;padding:12px;margin-bottom:8px">`;
      html += `<div style="font-weight:600;font-size:13px;color:#111827;margin-bottom:4px">${escapeHtml(q.question)}</div>`;
      html += `<div style="font-size:12px;color:#6b7280;margin-bottom:4px"><strong>Purpose:</strong> ${escapeHtml(q.purpose)}</div>`;
      if (q.lookFor.length > 0) {
        html += `<div style="font-size:12px;color:#6b7280"><strong>Look for:</strong> ${q.lookFor.map(l => escapeHtml(l)).join(', ')}</div>`;
      }
      if (q.followUps.length > 0) {
        html += `<div style="font-size:12px;color:#6b7280;margin-top:4px"><strong>Follow-ups:</strong> ${q.followUps.map(f => escapeHtml(f)).join('; ')}</div>`;
      }
      html += `<div style="display:flex;gap:12px;margin-top:4px">`;
      html += `<span style="font-size:11px;color:#9ca3af">Difficulty: ${escapeHtml(q.difficulty)}</span>`;
      html += `<span style="font-size:11px;color:#9ca3af">Time: ${escapeHtml(q.timeEstimate)}</span>`;
      html += `</div></div>`;
    }
    html += `</div>`;
  }
  return html;
}

export function generateMatchReport(data: MatchResultData): string {
  const d = data;
  const score = d.overallMatchScore?.score ?? 0;
  const grade = d.overallMatchScore?.grade ?? '—';
  const candidateName = d.resumeAnalysis?.candidateName || 'Unknown Candidate';
  const jobTitle = d.jdAnalysis?.jobTitle || 'Unknown Position';
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // --- Build sections ---

  // Header
  const header = `
    <div style="text-align:center;margin-bottom:24px">
      <h1 style="font-size:24px;font-weight:800;color:#111827;margin:0">${escapeHtml(candidateName)}</h1>
      <p style="font-size:14px;color:#6b7280;margin:4px 0 0 0">${escapeHtml(d.resumeAnalysis?.currentRole || '')} &mdash; Matching for: ${escapeHtml(jobTitle)}</p>
    </div>
    <div style="text-align:center;margin-bottom:32px">
      <div style="display:inline-block;background:${scoreBg(score)};border-radius:16px;padding:16px 40px">
        <div style="font-size:40px;font-weight:800;color:${scoreColor(score)}">${score}<span style="font-size:20px;font-weight:400">/100</span></div>
        <div style="font-size:14px;font-weight:600;color:${scoreColor(score)};letter-spacing:1px">${escapeHtml(grade)}</div>
      </div>
    </div>`;

  // Overall Fit
  let overallFit = '';
  if (d.overallFit) {
    const o = d.overallFit;
    let rows = '';
    rows += `<div style="margin-bottom:12px"><strong style="color:#374151">Verdict:</strong> <span style="font-weight:600;color:#4338ca">${escapeHtml(o.verdict)}</span></div>`;
    rows += `<div style="margin-bottom:12px"><strong style="color:#374151">Summary:</strong> ${escapeHtml(o.summary)}</div>`;
    if (o.topReasons.length > 0) {
      rows += `<div style="margin-bottom:12px"><strong style="color:#374151">Top Reasons:</strong><ul style="margin:4px 0 0 20px;padding:0">${o.topReasons.map(r => `<li style="margin-bottom:4px;font-size:13px">${escapeHtml(r)}</li>`).join('')}</ul></div>`;
    }
    rows += `<div style="margin-bottom:12px"><strong style="color:#374151">Hiring Recommendation:</strong> ${escapeHtml(o.hiringRecommendation)}</div>`;
    if (o.suggestedRole) rows += `<div style="margin-bottom:12px"><strong style="color:#374151">Suggested Role:</strong> ${escapeHtml(o.suggestedRole)}</div>`;
    if (o.interviewFocus.length > 0) {
      rows += `<div><strong style="color:#374151">Interview Focus Areas:</strong> ${renderTags(o.interviewFocus)}</div>`;
    }
    overallFit = section('Overall Fit', rows);
  }

  // Score Breakdown
  let scoreBreakdown = '';
  if (d.overallMatchScore?.breakdown) {
    const b = d.overallMatchScore.breakdown;
    let content = '';
    content += renderScoreBar(`Skill Match (weight ${b.skillMatchWeight}%)`, b.skillMatchScore, '100');
    content += renderScoreBar(`Experience (weight ${b.experienceWeight}%)`, b.experienceScore, '100');
    content += renderScoreBar(`Potential (weight ${b.potentialWeight}%)`, b.potentialScore, '100');
    if (d.overallMatchScore.confidence) {
      content += `<div style="font-size:13px;color:#6b7280;margin-top:12px"><strong>Confidence:</strong> ${escapeHtml(d.overallMatchScore.confidence)}</div>`;
    }
    scoreBreakdown = section('Score Breakdown', content);
  }

  // Resume Analysis
  let resumeAnalysis = '';
  if (d.resumeAnalysis) {
    const r = d.resumeAnalysis;
    let content = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div><strong style="font-size:13px;color:#6b7280">Experience:</strong> <span style="font-size:13px">${escapeHtml(r.totalYearsExperience)} years</span></div>
        <div><strong style="font-size:13px;color:#6b7280">Education:</strong> <span style="font-size:13px">${escapeHtml(r.educationLevel)}</span></div>
      </div>`;
    if (r.technicalSkills.length > 0) content += `<div style="margin-bottom:10px"><strong style="font-size:13px;color:#6b7280">Technical Skills:</strong><br/>${renderTags(r.technicalSkills)}</div>`;
    if (r.softSkills.length > 0) content += `<div style="margin-bottom:10px"><strong style="font-size:13px;color:#6b7280">Soft Skills:</strong><br/>${renderTags(r.softSkills)}</div>`;
    if (r.industries.length > 0) content += `<div style="margin-bottom:10px"><strong style="font-size:13px;color:#6b7280">Industries:</strong><br/>${renderTags(r.industries)}</div>`;
    if (r.certifications.length > 0) content += `<div style="margin-bottom:10px"><strong style="font-size:13px;color:#6b7280">Certifications:</strong><br/>${renderTags(r.certifications)}</div>`;
    if (r.keyAchievements.length > 0) {
      content += `<div><strong style="font-size:13px;color:#6b7280">Key Achievements:</strong><ul style="margin:4px 0 0 20px;padding:0">${r.keyAchievements.map(a => `<li style="font-size:13px;margin-bottom:4px">${escapeHtml(a)}</li>`).join('')}</ul></div>`;
    }
    resumeAnalysis = section('Resume Analysis', content);
  }

  // Must-Have Analysis
  let mustHaveSection = '';
  if (d.mustHaveAnalysis) {
    const m = d.mustHaveAnalysis;
    let content = '';
    content += renderScoreBar('Must-Have Score', m.mustHaveScore, '100');
    if (m.disqualified) {
      content += `<div style="background:#fee2e2;color:#dc2626;padding:10px 16px;border-radius:8px;margin:12px 0;font-size:13px;font-weight:600">Disqualified: ${m.disqualificationReasons.map(r => escapeHtml(r)).join('; ')}</div>`;
    }

    // Matched skills
    if (m.candidateEvaluation.matchedSkills.length > 0) {
      content += `<h3 style="font-size:14px;font-weight:600;color:#059669;margin:16px 0 8px 0">Matched Skills (${m.candidateEvaluation.matchedSkills.length})</h3>`;
      content += `<table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr style="background:#f0fdf4"><th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e5e7eb">Skill</th><th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e5e7eb">Evidence</th><th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e5e7eb">Proficiency</th></tr>`;
      for (const s of m.candidateEvaluation.matchedSkills) {
        content += `<tr><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6">${escapeHtml(s.skill)}</td><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6">${escapeHtml(s.candidateEvidence)}</td><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6">${escapeHtml(s.proficiency)}</td></tr>`;
      }
      content += `</table>`;
    }

    // Missing skills
    if (m.candidateEvaluation.missingSkills.length > 0) {
      content += `<h3 style="font-size:14px;font-weight:600;color:#dc2626;margin:16px 0 8px 0">Missing Skills (${m.candidateEvaluation.missingSkills.length})</h3>`;
      content += `<table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr style="background:#fef2f2"><th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e5e7eb">Skill</th><th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e5e7eb">Severity</th><th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e5e7eb">Can Learn Quickly</th><th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e5e7eb">Alternative Evidence</th></tr>`;
      for (const s of m.candidateEvaluation.missingSkills) {
        content += `<tr><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6">${escapeHtml(s.skill)}</td><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6">${escapeHtml(s.severity)}</td><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6">${s.canBeLearnedQuickly ? 'Yes' : 'No'}</td><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6">${escapeHtml(s.alternativeEvidence)}</td></tr>`;
      }
      content += `</table>`;
    }

    if (m.gapAnalysis) {
      content += `<div style="margin-top:16px;font-size:13px;color:#374151"><strong>Gap Analysis:</strong> ${escapeHtml(m.gapAnalysis)}</div>`;
    }
    mustHaveSection = section('Must-Have Analysis', content);
  }

  // Hard Requirement Gaps
  let hardReqGapsSection = '';
  if (d.hardRequirementGaps && d.hardRequirementGaps.length > 0) {
    let content = '';
    for (const gap of d.hardRequirementGaps) {
      const borderColor = gap.severity === 'dealbreaker' ? '#ef4444' : gap.severity === 'critical' ? '#f97316' : '#eab308';
      const bgColor = gap.severity === 'dealbreaker' ? '#fef2f2' : gap.severity === 'critical' ? '#fff7ed' : '#fefce8';
      content += `<div style="background:${bgColor};border-left:4px solid ${borderColor};border-radius:8px;padding:12px;margin-bottom:8px">`;
      content += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">`;
      content += `<strong style="font-size:13px;color:#111827">${escapeHtml(gap.requirement)}</strong>`;
      content += `<span style="font-size:11px;font-weight:600;color:${borderColor};text-transform:uppercase">${escapeHtml(gap.severity)}</span>`;
      content += `</div>`;
      content += `<div style="font-size:13px;color:#374151;margin-bottom:2px">Candidate: ${escapeHtml(gap.candidateStatus)}</div>`;
      content += `<div style="font-size:12px;color:#6b7280">${escapeHtml(gap.impact)}</div>`;
      content += `</div>`;
    }
    hardReqGapsSection = section('Hard Requirement Gaps', content);
  }

  // Nice-to-Have Analysis
  let niceToHaveSection = '';
  if (d.niceToHaveAnalysis) {
    const n = d.niceToHaveAnalysis;
    let content = '';
    content += renderScoreBar('Nice-to-Have Score', n.niceToHaveScore, '100');
    const e = n.candidateEvaluation;
    if (e.matchedSkills.length > 0) content += `<div style="margin-bottom:8px"><strong style="font-size:13px;color:#059669">Matched Skills:</strong> ${renderTags(e.matchedSkills)}</div>`;
    if (e.matchedExperiences.length > 0) content += `<div style="margin-bottom:8px"><strong style="font-size:13px;color:#059669">Matched Experiences:</strong> ${renderTags(e.matchedExperiences)}</div>`;
    if (e.matchedQualifications.length > 0) content += `<div style="margin-bottom:8px"><strong style="font-size:13px;color:#059669">Matched Qualifications:</strong> ${renderTags(e.matchedQualifications)}</div>`;
    if (e.bonusSkills.length > 0) content += `<div style="margin-bottom:8px"><strong style="font-size:13px;color:#4338ca">Bonus Skills:</strong> ${renderTags(e.bonusSkills)}</div>`;
    if (n.competitiveAdvantage) {
      content += `<div style="margin-top:12px;font-size:13px;color:#374151"><strong>Competitive Advantage:</strong> ${escapeHtml(n.competitiveAdvantage)}</div>`;
    }
    niceToHaveSection = section('Nice-to-Have Analysis', content);
  }

  // Skill Match
  let skillMatchSection = '';
  if (d.skillMatch) {
    const s = d.skillMatch;
    let content = '';
    if (d.skillMatchScore) {
      content += renderScoreBar('Skill Match Score', d.skillMatchScore.score, '100');
      if (d.skillMatchScore.skillApplicationAnalysis) {
        content += `<div style="font-size:13px;color:#374151;margin-bottom:12px">${escapeHtml(d.skillMatchScore.skillApplicationAnalysis)}</div>`;
      }
      if (d.skillMatchScore.credibilityFlags?.hasRedFlags) {
        content += `<div style="background:#fef2f2;border-radius:8px;padding:10px 16px;margin-bottom:12px">`;
        content += `<strong style="font-size:13px;color:#dc2626">Credibility Concerns:</strong>`;
        content += `<ul style="margin:4px 0 0 20px;padding:0">${d.skillMatchScore.credibilityFlags.concerns.map(c => `<li style="font-size:13px;color:#dc2626">${escapeHtml(c)}</li>`).join('')}</ul></div>`;
      }
      if (d.skillMatchScore.credibilityFlags?.positiveIndicators?.length > 0) {
        content += `<div style="font-size:13px;color:#059669;margin-bottom:12px"><strong>Positive Indicators:</strong> ${d.skillMatchScore.credibilityFlags.positiveIndicators.map(p => escapeHtml(p)).join(', ')}</div>`;
      }
    }
    if (s.matchedMustHave.length > 0) {
      content += `<div style="margin-bottom:8px"><strong style="font-size:13px;color:#059669">Must-Have (Matched):</strong> ${renderTags(s.matchedMustHave.map(m => `${m.skill} (${m.proficiencyLevel})`))}</div>`;
    }
    if (s.missingMustHave.length > 0) {
      content += `<div style="margin-bottom:8px"><strong style="font-size:13px;color:#dc2626">Must-Have (Missing):</strong> ${renderTags(s.missingMustHave.map(m => m.skill))}</div>`;
    }
    if (s.matchedNiceToHave.length > 0) content += `<div style="margin-bottom:8px"><strong style="font-size:13px;color:#6b7280">Nice-to-Have (Matched):</strong> ${renderTags(s.matchedNiceToHave)}</div>`;
    if (s.additionalRelevantSkills.length > 0) content += `<div><strong style="font-size:13px;color:#6b7280">Additional Relevant Skills:</strong> ${renderTags(s.additionalRelevantSkills)}</div>`;
    skillMatchSection = section('Skill Match', content);
  }

  // Transferable Skills
  let transferableSection = '';
  if (d.transferableSkills && d.transferableSkills.length > 0) {
    let content = `<p style="font-size:13px;color:#6b7280;margin-bottom:12px">Adjacent skills that transfer to the required competencies</p>`;
    for (const ts of d.transferableSkills) {
      content += `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;margin-bottom:8px">`;
      content += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">`;
      content += `<span style="font-size:13px"><strong style="color:#1d4ed8">${escapeHtml(ts.candidateHas)}</strong> <span style="color:#9ca3af">→</span> <strong style="color:#374151">${escapeHtml(ts.required)}</strong></span>`;
      content += `<span style="font-size:12px;font-weight:600;color:#1d4ed8">${ts.valueFactor}% value</span>`;
      content += `</div>`;
      content += `<div style="font-size:12px;color:#1d4ed8">${escapeHtml(ts.relevance)}</div>`;
      content += `</div>`;
    }
    transferableSection = section('Transferable Skills', content);
  }

  // Experience
  let experienceSection = '';
  if (d.experienceMatch || d.experienceValidation) {
    let content = '';
    if (d.experienceBreakdown) {
      content += `<div style="display:grid;grid-template-columns:1fr 1fr${d.experienceBreakdown.contractExperience ? ' 1fr' : ''};gap:12px;margin-bottom:16px">`;
      content += `<div style="text-align:center;padding:10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px"><div style="font-size:11px;color:#2563eb">Full-Time</div><div style="font-size:18px;font-weight:700;color:#1e40af">${escapeHtml(d.experienceBreakdown.fullTimeExperience)}</div></div>`;
      content += `<div style="text-align:center;padding:10px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px"><div style="font-size:11px;color:#d97706">Internship</div><div style="font-size:18px;font-weight:700;color:#92400e">${escapeHtml(d.experienceBreakdown.internshipExperience)}</div></div>`;
      if (d.experienceBreakdown.contractExperience) {
        content += `<div style="text-align:center;padding:10px;background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px"><div style="font-size:11px;color:#7c3aed">Contract</div><div style="font-size:18px;font-weight:700;color:#5b21b6">${escapeHtml(d.experienceBreakdown.contractExperience)}</div></div>`;
      }
      content += `</div>`;
      if (d.experienceBreakdown.note) {
        content += `<div style="font-size:13px;color:#374151;background:#f9fafb;border-radius:8px;padding:10px;margin-bottom:12px">${escapeHtml(d.experienceBreakdown.note)}</div>`;
      }
    }
    if (d.experienceValidation) {
      content += renderScoreBar('Experience Score', d.experienceValidation.score, '100');
      content += `<div style="font-size:13px;color:#374151;margin-bottom:12px"><strong>Relevance:</strong> ${escapeHtml(d.experienceValidation.relevanceToRole)}</div>`;
      content += `<div style="font-size:13px;color:#374151;margin-bottom:12px"><strong>Career Progression:</strong> ${escapeHtml(d.experienceValidation.careerProgression)}</div>`;
      if (d.experienceValidation.strengths.length > 0) {
        content += `<h3 style="font-size:14px;font-weight:600;color:#059669;margin:12px 0 8px 0">Strengths</h3>`;
        for (const s of d.experienceValidation.strengths) {
          content += `<div style="font-size:13px;margin-bottom:6px"><strong>${escapeHtml(s.area)}:</strong> ${escapeHtml(s.impact)}</div>`;
        }
      }
      if (d.experienceValidation.gaps.length > 0) {
        content += `<h3 style="font-size:14px;font-weight:600;color:#d97706;margin:12px 0 8px 0">Gaps</h3>`;
        for (const g of d.experienceValidation.gaps) {
          content += `<div style="font-size:13px;margin-bottom:6px"><strong>${escapeHtml(g.area)}</strong> (${escapeHtml(g.severity)}): ${escapeHtml(g.canBeAddressed)}</div>`;
        }
      }
    }
    if (d.experienceMatch) {
      const e = d.experienceMatch;
      content += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
        <div style="font-size:13px"><strong style="color:#6b7280">Required:</strong> ${escapeHtml(e.required)}</div>
        <div style="font-size:13px"><strong style="color:#6b7280">Candidate:</strong> ${escapeHtml(e.candidate)}</div>
      </div>`;
      content += `<div style="font-size:13px;margin-top:8px"><strong>Assessment:</strong> ${escapeHtml(e.assessment)}</div>`;
    }
    experienceSection = section('Experience Match', content);
  }

  // Candidate Potential
  let potentialSection = '';
  if (d.candidatePotential) {
    const p = d.candidatePotential;
    let content = '';
    content += `<div style="font-size:13px;margin-bottom:10px"><strong style="color:#6b7280">Growth Trajectory:</strong> ${escapeHtml(p.growthTrajectory)}</div>`;
    content += `<div style="font-size:13px;margin-bottom:10px"><strong style="color:#6b7280">Learning Agility:</strong> ${escapeHtml(p.learningAgility)}</div>`;
    if (p.leadershipIndicators.length > 0) content += `<div style="margin-bottom:8px"><strong style="font-size:13px;color:#6b7280">Leadership Indicators:</strong><br/>${renderTags(p.leadershipIndicators)}</div>`;
    if (p.uniqueValueProps.length > 0) content += `<div style="margin-bottom:8px"><strong style="font-size:13px;color:#6b7280">Unique Value:</strong><br/>${renderTags(p.uniqueValueProps)}</div>`;
    if (p.cultureFitIndicators.length > 0) content += `<div style="margin-bottom:8px"><strong style="font-size:13px;color:#6b7280">Culture Fit:</strong><br/>${renderTags(p.cultureFitIndicators)}</div>`;
    if (p.riskFactors.length > 0) content += `<div><strong style="font-size:13px;color:#d97706">Risk Factors:</strong><br/>${renderTags(p.riskFactors)}</div>`;
    potentialSection = section('Candidate Potential', content);
  }

  // Recommendations
  let recsSection = '';
  if (d.recommendations) {
    const r = d.recommendations;
    let content = '';
    if (r.forRecruiter.length > 0) {
      content += `<h3 style="font-size:14px;font-weight:600;color:#374151;margin:0 0 8px 0">For Recruiter</h3>`;
      content += `<ul style="margin:0 0 16px 20px;padding:0">${r.forRecruiter.map(rec => `<li style="font-size:13px;margin-bottom:4px">${escapeHtml(rec)}</li>`).join('')}</ul>`;
    }
    if (r.forCandidate.length > 0) {
      content += `<h3 style="font-size:14px;font-weight:600;color:#374151;margin:0 0 8px 0">For Candidate</h3>`;
      content += `<ul style="margin:0 0 16px 20px;padding:0">${r.forCandidate.map(rec => `<li style="font-size:13px;margin-bottom:4px">${escapeHtml(rec)}</li>`).join('')}</ul>`;
    }
    if (r.interviewQuestions.length > 0) {
      content += `<h3 style="font-size:14px;font-weight:600;color:#374151;margin:0 0 8px 0">Suggested Interview Questions</h3>`;
      content += `<ol style="margin:0 0 0 20px;padding:0">${r.interviewQuestions.map(q => `<li style="font-size:13px;margin-bottom:4px">${escapeHtml(q)}</li>`).join('')}</ol>`;
    }
    recsSection = section('Recommendations', content);
  }

  // Detailed Interview Questions
  let interviewSection = '';
  if (d.suggestedInterviewQuestions) {
    const q = d.suggestedInterviewQuestions;
    let content = '';
    content += renderInterviewQuestions(q.technical || [], 'Technical');
    content += renderInterviewQuestions(q.behavioral || [], 'Behavioral');
    content += renderInterviewQuestions(q.experienceValidation || [], 'Experience Validation');
    content += renderInterviewQuestions(q.situational || [], 'Situational');
    content += renderInterviewQuestions(q.cultureFit || [], 'Culture Fit');
    content += renderInterviewQuestions(q.redFlagProbing || [], 'Red Flag Probing');
    if (content.trim()) {
      interviewSection = section('Detailed Interview Questions', content);
    }
  }

  // Areas to Probe Deeper
  let probingSection = '';
  if (d.areasToProbeDeeper && d.areasToProbeDeeper.length > 0) {
    let content = '';
    for (const area of d.areasToProbeDeeper) {
      content += `<div style="background:#f9fafb;border-radius:8px;padding:14px;margin-bottom:10px">`;
      content += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">`;
      content += `<strong style="font-size:14px;color:#111827">${escapeHtml(area.area)}</strong>`;
      content += `<span style="font-size:12px;font-weight:600;color:#d97706;background:#fef3c7;padding:2px 8px;border-radius:10px">${escapeHtml(area.priority)}</span>`;
      content += `</div>`;
      content += `<div style="font-size:13px;color:#6b7280;margin-bottom:6px">${escapeHtml(area.reason)}</div>`;
      content += `<div style="font-size:13px;color:#374151"><strong>Approach:</strong> ${escapeHtml(area.suggestedApproach)}</div>`;
      if (area.subAreas.length > 0) {
        for (const sub of area.subAreas) {
          content += `<div style="margin-top:8px;padding-left:16px;border-left:3px solid #e0e7ff">`;
          content += `<div style="font-size:13px;font-weight:600;color:#374151">${escapeHtml(sub.name)}</div>`;
          if (sub.specificConcerns.length > 0) content += `<div style="font-size:12px;color:#dc2626;margin-top:2px">Concerns: ${sub.specificConcerns.map(c => escapeHtml(c)).join(', ')}</div>`;
          if (sub.greenFlags.length > 0) content += `<div style="font-size:12px;color:#059669;margin-top:2px">Green flags: ${sub.greenFlags.map(f => escapeHtml(f)).join(', ')}</div>`;
          if (sub.redFlags.length > 0) content += `<div style="font-size:12px;color:#dc2626;margin-top:2px">Red flags: ${sub.redFlags.map(f => escapeHtml(f)).join(', ')}</div>`;
          content += `</div>`;
        }
      }
      content += `</div>`;
    }
    probingSection = section('Areas to Probe Deeper', content);
  }

  // Assemble full HTML
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Match Report — ${escapeHtml(candidateName)} for ${escapeHtml(jobTitle)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    margin: 0; padding: 40px 20px; background: #f3f4f6; color: #374151;
    line-height: 1.6; font-size: 14px;
  }
  .container { max-width: 800px; margin: 0 auto; }
  @media print {
    body { background: #fff; padding: 20px; }
    .container { max-width: 100%; }
  }
</style>
</head>
<body>
<div class="container">
  <div style="text-align:right;font-size:12px;color:#9ca3af;margin-bottom:8px">Generated on ${escapeHtml(now)} by RoboHire</div>
  ${header}
  ${overallFit}
  ${scoreBreakdown}
  ${resumeAnalysis}
  ${mustHaveSection}
  ${hardReqGapsSection}
  ${niceToHaveSection}
  ${skillMatchSection}
  ${transferableSection}
  ${experienceSection}
  ${potentialSection}
  ${recsSection}
  ${interviewSection}
  ${probingSection}
  <div style="text-align:center;font-size:11px;color:#9ca3af;margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb">
    This report was generated by RoboHire AI. The analysis is based on automated matching and should be reviewed by a hiring professional.
  </div>
</div>
</body>
</html>`;
}
