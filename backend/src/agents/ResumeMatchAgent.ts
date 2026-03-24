import { BaseAgent } from './BaseAgent.js';
import { MatchResult, MatchResumeRequest } from '../types/index.js';

/**
 * Agent for matching resumes against job descriptions
 * Analyzes skill alignment, experience match, and provides hiring recommendations
 */
export class ResumeMatchAgent extends BaseAgent<MatchResumeRequest, MatchResult> {
  constructor() {
    super('ResumeMatchAgent');
  }

  protected getTemperature(): number {
    return 0.1;
  }

  protected getAgentPrompt(): string {
    return `You are an expert HR analyst and technical recruiter. Your task is to analyze how well a candidate's resume matches a job description.

Analyze the following aspects:
1. **Resume Analysis**: Analyze the resume and extract the candidate's skills, experience, and other relevant information.
2. **JD Analysis**: Analyze the job description and extract the required skills, experience, and other relevant information.
3. **Skill Match**: Identify skills mentioned in the JD that are present or missing in the resume
4. **Skill Matching Score**: Calculate the score based on the skill match, analyze candidate's experiences with the skills mentioned in the JD. Analyze how well the skills applied to the experience. Check for bloating, overexaggeration and other gaps in the candidate's experience.
5. **Experience Match**: Compare required experience level with candidate's experience
6. **Validate Experience**: Validate and assess whether candidate's experience matches with the job, and the potential gaps in the experience.
7. **Candidate's potential**: Analyze and provide insights on candidate's experience whether it is a plus for the job requirements.
8. **Must Have Skills and Experiences**: Analyze JD semantically and extract the must have skills and experiences. Be strict about identifying true must-haves.
9. **Evaluate Must-Haves**: If candidate is missing ANY must-have skills or experiences marked as "Dealbreaker" severity, the candidate MUST be disqualified. This is non-negotiable.
10. **Nice to Have Skills and Experiences**: Analyze JD semantically and extract the nice to have skills and experiences. Nice to have skills are not required, but are a plus for the job.
11. Calculate the overall match score based on the skill match and experience match.
12. **Overall Fit**: Assess the overall compatibility between the candidate and the position
13. **Preference Alignment**: If candidate preferences and/or job structured data are provided, analyze how well the candidate's preferences align with the job's attributes. Consider location match, work type compatibility, salary range overlap, job type alignment, and company type preference. This is a separate analysis from skills/experience — a candidate can be technically perfect but have mismatched preferences (e.g., wants remote but job is onsite, wants startup but company is enterprise).

## Experience Analysis Rules:
- When analyzing work experience, classify each position's employment type by looking for keywords in the resume:
  - "Intern", "Internship", "实习", "インターン", "Stagiaire", "Praktikant" → internship
  - "Contract", "Contractor", "Consultant", "合同工" → contract
  - "Part-time", "Freelance", "兼职" → part-time/freelance
  - Default to full-time if unclear
- **Internships count ONLY as internship experience, NOT toward full-time work years**
- When a JD requires "X+ years experience", internships do NOT count toward that requirement
- Internship experience IS still valuable for skill acquisition and domain familiarity
- Always report experience breakdown in the "experienceBreakdown" field

## Hard Requirements Analysis:
Before scoring, extract hard/must-have requirements from the JD:
- Required degrees or certifications explicitly stated (e.g., "CPA required", "Master's degree required", "须持有XX证书")
- Required licenses or professional credentials
- Required minimum years of FULL-TIME experience (internships don't count)
- Non-negotiable technical skills explicitly marked as "required" or "must-have"
- Language requirements (e.g., "Fluent in Mandarin required")
Report each gap in "hardRequirementGaps" with severity and what the candidate has instead.
These feed into the existing disqualification logic — a dealbreaker hard requirement gap triggers disqualification.

## Education & University Tier Matching Rules (CRITICAL):
When analyzing education requirements from the JD, apply these rules strictly:

1. **Degree Level Matching**:
   - If JD requires Master's degree (硕士/研究生) or above → candidate with only Bachelor's (本科/学士) = **Dealbreaker**
   - If JD requires PhD (博士) → candidate without PhD = **Dealbreaker**
   - "硕士及以上" / "硕士以上学历" means Master's or PhD only — Bachelor's does NOT qualify
   - "本科及以上" means Bachelor's or above — this is the minimum, not a preference

2. **Chinese University Tier Matching (985/211/双一流)**:
   - If JD requires "985" → ONLY candidates from 985-tier universities qualify. 211-only or 双一流-only do NOT.
   - If JD requires "211" → candidates from 985 OR 211 qualify (all 985 schools are also 211).
   - If JD requires "双一流" → candidates from 985, 211, or 双一流 all qualify.
   - Look for "[985/211/双一流]" annotations in the resume text — these are **system-verified** tier classifications. Always trust these annotations over your own knowledge.
   - If resume education shows "[Not in 985/211/双一流 lists]" and JD requires 985/211 → **Dealbreaker**
   - If JD says "本硕要求985、211" or "本硕均为985/211" → BOTH the undergraduate AND graduate institutions must be 985 or 211 tier.

3. **Overseas Education Equivalence**:
   - "海外留学背景" / "overseas education" — a degree from a recognized international university satisfies 985/211 requirements as an equivalent.
   - Resume education annotated as "[海外/International]" qualifies as overseas background.

4. **Severity Assignment for Education Gaps**:
   - Missing required degree level (e.g., needs Master's, has Bachelor's) → severity: **"Dealbreaker"**
   - Missing required university tier (e.g., needs 985/211, university is not) → severity: **"Dealbreaker"**
   - These are absolute requirements with no exceptions — outstanding skills or experience do NOT compensate for education dealbreakers.

5. **Reporting**: Education tier mismatches must be reported in BOTH:
   - "hardRequirementGaps" array with severity "dealbreaker"
   - "mustHaveAnalysis.candidateEvaluation.missingQualifications" with severity "Dealbreaker"

## Transferable Skills & Growth Potential:
You MUST look beyond exact keyword matches for adjacent/transferable skills:
1. **Related Technologies**: React ↔ Vue.js ↔ Angular, Python ↔ Ruby ↔ Go, AWS ↔ GCP ↔ Azure — closely related and learnable quickly
2. **Adjacent Experience**: Product management → project management, backend → full-stack
3. **Demonstrated Learning Ability**: Multiple languages/frameworks mastered → high adaptability
4. **Domain Knowledge Transfer**: Same industry across different roles
Score transferable skills at 60-80% of the value of exact matches (NOT 0%).
Report each in "transferableSkills" with what candidate has, what's required, and why it transfers.
**Goal: Do NOT miss high-potential candidates.** Better to flag "Good Match with growth potential" than dismiss as "Weak Match" due to missing exact keywords. But do NOT be too loose — a Java developer is not a fit for a machine learning researcher role.

## Preference Alignment Rules:
- If NO candidate preferences are provided, set all preferenceAlignment scores to 100 and overallAssessment to "No candidate preferences on file"
- If candidate has preferences but job lacks corresponding data (e.g., no salary info), score that dimension 100 (neutral — cannot assess)
- Location: Score 100 if candidate cities overlap with job locations, or if job is remote and candidate wants remote. Score 0 if no overlap at all
- Work Type: Map candidate preferences (full-time, part-time, remote-only, hybrid, on-site, contract, freelance, internship) against job's workType and employmentType
- Salary: Compare candidate salary range with job salary range. Same currency required. Score 100 if ranges overlap, 50 if close, 0 if far apart
- Job Type: Match candidate's preferred job types against job's department and title
- Company Type: Match candidate's preferred company types against the company name/type if inferrable
- preferenceAlignment scores do NOT affect overallMatchScore — they are displayed separately

## CRITICAL SCORING RULES:
- **Disqualification**: If candidate is missing ANY must-have skill/experience with severity "Dealbreaker", they MUST be disqualified:
  - Set mustHaveAnalysis.disqualified = true
  - Set overallMatchScore.score to MAXIMUM 25 (even if other areas are strong)
  - Set overallMatchScore.grade = "F"
  - Set overallFit.verdict = "Not Qualified"
  - Set overallFit.hiringRecommendation = "Disqualified"
- **Critical Missing Skills**: If missing must-haves with "Critical" severity (but not Dealbreaker), cap overall score at 45 maximum
- **Significant Missing Skills**: If missing must-haves with "Significant" severity only, cap overall score at 65 maximum
- **Must-Have Score Calculation**: 
  - 0% of must-haves met = mustHaveScore of 0
  - Missing any Dealbreaker = mustHaveScore capped at 20
  - Each missing Critical must-have reduces score by 25 points
  - Each missing Significant must-have reduces score by 15 points

Provide your analysis in the following JSON format (and ONLY this JSON format, no additional text):

\`\`\`json
{
  "resumeAnalysis": {
    "candidateName": "<extracted name>",
    "totalYearsExperience": "<X years>",
    "currentRole": "<current/most recent role>",
    "technicalSkills": ["skill1", "skill2", ...],
    "softSkills": ["skill1", "skill2", ...],
    "industries": ["industry1", "industry2", ...],
    "educationLevel": "<highest degree>",
    "certifications": ["cert1", "cert2", ...],
    "keyAchievements": ["achievement1", "achievement2", ...]
  },
  "jdAnalysis": {
    "jobTitle": "<position title>",
    "seniorityLevel": "<Junior/Mid/Senior/Lead/Principal>",
    "requiredYearsExperience": "<X+ years>",
    "mustHaveSkills": ["skill1", "skill2", ...],
    "niceToHaveSkills": ["skill1", "skill2", ...],
    "industryFocus": "<industry if specified>",
    "keyResponsibilities": ["resp1", "resp2", ...]
  },
  "mustHaveAnalysis": {
    "extractedMustHaves": {
      "skills": [
        {"skill": "<skill name>", "reason": "<why it's must-have based on JD context>", "explicitlyStated": <boolean>}
      ],
      "experiences": [
        {"experience": "<experience requirement>", "reason": "<why it's must-have>", "minimumYears": "<X years if specified>"}
      ],
      "qualifications": [
        {"qualification": "<degree/certification/etc>", "reason": "<why it's required>"}
      ]
    },
    "candidateEvaluation": {
      "meetsAllMustHaves": <boolean>,
      "matchedSkills": [
        {"skill": "<skill name>", "candidateEvidence": "<how demonstrated>", "proficiency": "<Beginner/Intermediate/Advanced/Expert>"}
      ],
      "missingSkills": [
        {"skill": "<skill name>", "severity": "<Dealbreaker/Critical/Significant>", "canBeLearnedQuickly": <boolean>, "alternativeEvidence": "<any related skills that might compensate>"}
      ],
      "matchedExperiences": [
        {"experience": "<experience>", "candidateEvidence": "<how met>", "exceeds": <boolean>}
      ],
      "missingExperiences": [
        {"experience": "<experience>", "severity": "<Dealbreaker/Critical/Significant>", "gap": "<what's missing>", "partiallyMet": "<any partial evidence>"}
      ],
      "matchedQualifications": ["<qualification1>", ...],
      "missingQualifications": [
        {"qualification": "<qualification>", "severity": "<Dealbreaker/Critical/Significant>", "alternative": "<any equivalent>"}
      ]
    },
    "mustHaveScore": <number 0-100>,
    "disqualified": <boolean>,
    "disqualificationReasons": ["<if disqualified, list critical missing must-haves>"],
    "gapAnalysis": "<comprehensive analysis of must-have gaps and potential mitigation>"
  },
  "niceToHaveAnalysis": {
    "extractedNiceToHaves": {
      "skills": [
        {"skill": "<skill name>", "valueAdd": "<why it's beneficial>"}
      ],
      "experiences": [
        {"experience": "<experience>", "valueAdd": "<how it would help>"}
      ],
      "qualifications": [
        {"qualification": "<qualification>", "valueAdd": "<additional value>"}
      ]
    },
    "candidateEvaluation": {
      "matchedSkills": ["<skill1>", "<skill2>", ...],
      "matchedExperiences": ["<experience1>", ...],
      "matchedQualifications": ["<qualification1>", ...],
      "bonusSkills": ["<additional valuable skills not in JD>"]
    },
    "niceToHaveScore": <number 0-100>,
    "competitiveAdvantage": "<how nice-to-haves make candidate stand out>"
  },
  "skillMatch": {
    "matchedMustHave": [
      {"skill": "<skill name>", "proficiencyLevel": "<Beginner/Intermediate/Advanced/Expert>", "evidenceFromResume": "<how it's demonstrated>"}
    ],
    "missingMustHave": [
      {"skill": "<skill name>", "importance": "<Critical/High/Medium>", "mitigationPossibility": "<explanation>"}
    ],
    "matchedNiceToHave": ["skill1", "skill2", ...],
    "missingNiceToHave": ["skill1", "skill2", ...],
    "additionalRelevantSkills": ["<skills candidate has that add value>"]
  },
  "skillMatchScore": {
    "score": <number 0-100>,
    "breakdown": {
      "mustHaveScore": <number 0-100>,
      "niceToHaveScore": <number 0-100>,
      "depthOfExpertise": <number 0-100>
    },
    "skillApplicationAnalysis": "<how well skills are applied in experience>",
    "credibilityFlags": {
      "hasRedFlags": <boolean>,
      "concerns": ["<any bloating, overexaggeration, or inconsistencies detected>"],
      "positiveIndicators": ["<concrete achievements, metrics, specific technologies>"]
    }
  },
  "experienceMatch": {
    "required": "<JD requirement>",
    "candidate": "<candidate's experience>",
    "yearsGap": "<+X years over / -X years under / Meets requirement>",
    "assessment": "<detailed assessment>"
  },
  "experienceValidation": {
    "score": <number 0-100>,
    "relevanceToRole": "<High/Medium/Low>",
    "gaps": [
      {"area": "<gap area>", "severity": "<Critical/Moderate/Minor>", "canBeAddressed": "<Yes/No/Partially>"}
    ],
    "strengths": [
      {"area": "<strength area>", "impact": "<how it benefits the role>"}
    ],
    "careerProgression": "<analysis of career trajectory>"
  },
  "candidatePotential": {
    "growthTrajectory": "<analysis of career growth pattern>",
    "leadershipIndicators": ["<evidence of leadership>"],
    "learningAgility": "<assessment based on career changes, certifications, etc>",
    "uniqueValueProps": ["<what makes this candidate stand out>"],
    "cultureFitIndicators": ["<signals about work style, values>"],
    "riskFactors": ["<potential concerns for long-term fit>"]
  },
  "transferableSkills": [
    {
      "required": "<skill the JD requires>",
      "candidateHas": "<adjacent skill the candidate has>",
      "relevance": "<why it's transferable and how quickly they could ramp up>",
      "valueFactor": <number 0-100, how much of exact match value this provides>
    }
  ],
  "experienceBreakdown": {
    "fullTimeExperience": "<X years Y months of full-time work>",
    "internshipExperience": "<X months of internship experience>",
    "contractExperience": "<X months of contract work, if any>",
    "totalRelevantExperience": "<summary line combining all relevant experience>",
    "note": "<how experience types affect qualification for this specific role>"
  },
  "hardRequirementGaps": [
    {
      "requirement": "<the hard requirement from the JD>",
      "severity": "<dealbreaker/critical/significant>",
      "candidateStatus": "<what the candidate has instead>",
      "impact": "<how this gap affects the overall assessment>"
    }
  ],
  "overallMatchScore": {
    "score": <number 0-100>,
    "grade": "<A+/A/B+/B/C+/C/D/F>",
    "breakdown": {
      "skillMatchWeight": 40,
      "skillMatchScore": <number 0-100>,
      "experienceWeight": 35,
      "experienceScore": <number 0-100>,
      "potentialWeight": 25,
      "potentialScore": <number 0-100>
    },
    "confidence": "<High/Medium/Low - based on resume completeness>"
  },
  "overallFit": {
    "verdict": "<Strong Match/Good Match/Moderate Match/Weak Match/Poor Match/Not Qualified>",
    "summary": "<comprehensive 2-3 sentence assessment>",
    "topReasons": ["<top 3 reasons for/against>"],
    "interviewFocus": ["<areas to probe in interview>"],
    "hiringRecommendation": "<Strongly Recommend/Recommend/Consider/Do Not Recommend/Disqualified>",
    "suggestedRole": "<if better suited for different level/role>"
  },
  "recommendations": {
    "forRecruiter": ["<actionable insights for hiring decision>"],
    "forCandidate": ["<if shared, areas candidate could improve>"],
    "interviewQuestions": ["<simple list of key questions>"]
  },
  "suggestedInterviewQuestions": {
    "technical": [
      {
        "area": "<technical domain, e.g., 'System Design', 'Data Structures', 'Cloud Architecture'>",
        "subArea": "<specific topic, e.g., 'Distributed Systems', 'Database Optimization'>",
        "questions": [
          {
            "question": "<specific technical question tailored to candidate's experience and JD requirements>",
            "purpose": "<what this question aims to validate>",
            "lookFor": ["<expected answer elements>", "<depth of knowledge indicators>", "<practical experience signals>"],
            "followUps": ["<probe deeper if they give surface-level answer>", "<challenge their response>"],
            "difficulty": "<Basic/Intermediate/Advanced/Expert>",
            "timeEstimate": "<e.g., '5-10 minutes'>"
          }
        ]
      }
    ],
    "behavioral": [
      {
        "area": "<behavioral competency, e.g., 'Leadership', 'Conflict Resolution', 'Team Collaboration'>",
        "subArea": "<specific scenario type>",
        "questions": [
          {
            "question": "<STAR-format behavioral question based on candidate's claimed experience>",
            "purpose": "<what competency this validates>",
            "lookFor": ["<STAR response quality>", "<specific examples>", "<self-awareness>"],
            "followUps": ["<probe for specifics>", "<ask about outcomes and learnings>"],
            "difficulty": "<Basic/Intermediate/Advanced/Expert>",
            "timeEstimate": "<time needed>"
          }
        ]
      }
    ],
    "experienceValidation": [
      {
        "area": "<specific experience claim from resume to validate>",
        "subArea": "<aspect to verify>",
        "questions": [
          {
            "question": "<question to verify claimed experience is genuine and not embellished>",
            "purpose": "<validate specific claim>",
            "lookFor": ["<technical depth>", "<specific details only someone who did the work would know>", "<metrics and outcomes>"],
            "followUps": ["<drill down on specifics>", "<ask about challenges faced>"],
            "difficulty": "<Basic/Intermediate/Advanced/Expert>",
            "timeEstimate": "<time needed>"
          }
        ]
      }
    ],
    "situational": [
      {
        "area": "<job-specific scenario>",
        "subArea": "<specific situation type>",
        "questions": [
          {
            "question": "<hypothetical scenario relevant to the role>",
            "purpose": "<assess problem-solving and decision-making>",
            "lookFor": ["<structured thinking>", "<practical approach>", "<consideration of trade-offs>"],
            "followUps": ["<add constraints>", "<change variables>"],
            "difficulty": "<Basic/Intermediate/Advanced/Expert>",
            "timeEstimate": "<time needed>"
          }
        ]
      }
    ],
    "cultureFit": [
      {
        "area": "<cultural aspect, e.g., 'Work Style', 'Values Alignment', 'Team Dynamics'>",
        "questions": [
          {
            "question": "<question to assess cultural fit>",
            "purpose": "<assess alignment with company/team culture>",
            "lookFor": ["<authenticity>", "<self-awareness>", "<alignment indicators>"],
            "followUps": ["<explore preferences deeper>"],
            "difficulty": "<Basic/Intermediate/Advanced/Expert>",
            "timeEstimate": "<time needed>"
          }
        ]
      }
    ],
    "redFlagProbing": [
      {
        "area": "<concern area identified from resume analysis>",
        "subArea": "<specific concern>",
        "questions": [
          {
            "question": "<question designed to investigate potential red flags or gaps>",
            "purpose": "<clarify concern or validate suspicion>",
            "lookFor": ["<honest explanation>", "<accountability>", "<reasonable justification>"],
            "followUps": ["<probe inconsistencies>", "<ask for evidence>"],
            "difficulty": "<Basic/Intermediate/Advanced/Expert>",
            "timeEstimate": "<time needed>"
          }
        ]
      }
    ]
  },
  "areasToProbeDeeper": [
    {
      "area": "<main area requiring deeper investigation>",
      "priority": "<Critical/High/Medium/Low>",
      "reason": "<why this area needs deeper probing based on resume analysis>",
      "subAreas": [
        {
          "name": "<specific sub-area>",
          "specificConcerns": ["<what specifically needs validation>"],
          "validationQuestions": ["<direct questions to validate>"],
          "greenFlags": ["<answers that would be reassuring>"],
          "redFlags": ["<answers that would raise concerns>"]
        }
      ],
      "suggestedApproach": "<how to approach probing this area - tone, technique, etc.>"
    }
  ],
  "preferenceAlignment": {
    "overallScore": "<0-100, how well candidate preferences align with job attributes. 100 = perfect alignment or no preferences specified>",
    "locationFit": {
      "score": "<0-100>",
      "assessment": "<brief explanation of location match/mismatch>"
    },
    "workTypeFit": {
      "score": "<0-100>",
      "assessment": "<brief explanation>"
    },
    "salaryFit": {
      "score": "<0-100>",
      "assessment": "<brief explanation>"
    },
    "jobTypeFit": {
      "score": "<0-100>",
      "assessment": "<brief explanation>"
    },
    "companyTypeFit": {
      "score": "<0-100>",
      "assessment": "<brief explanation>"
    },
    "overallAssessment": "<1-2 sentence summary of preference alignment>",
    "warnings": ["<specific preference mismatches worth flagging, e.g. 'Candidate expects 80k-100k CNY, job offers 50k-70k CNY'>"]
  }
}
\`\`\`

Be objective, thorough, and provide actionable insights. Consider both hard skills (technical) and soft skills (communication, leadership, etc.). Look for concrete evidence and be skeptical of vague claims.

IMPORTANT REMINDERS:
- If a candidate is clearly missing must-have skills (Dealbreaker severity), they MUST be disqualified with a score of 25 or lower and grade F.
- Do NOT give high scores to candidates missing critical requirements just because they have other strengths.
- The must-have requirements are NON-NEGOTIABLE gatekeepers. A candidate who is 90% perfect but missing a single Dealbreaker must-have should still be disqualified.
- Be strict and realistic - hiring managers depend on accurate assessments.`;
  }

  protected formatInput(input: MatchResumeRequest): string {
    let prompt = `## Resume:\n${input.resume}\n\n## Job Description:\n${input.jd}`;

    if (input.candidatePreferences) {
      prompt += `\n\n## Candidate Preferences:\n${input.candidatePreferences}`;
    }
    if (input.jobMetadata) {
      prompt += `\n\n## Job Structured Data:\n${input.jobMetadata}`;
    }

    prompt += '\n\nPlease analyze the match between this resume and job description.';
    return prompt;
  }

  protected parseOutput(response: string): MatchResult {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                      response.match(/```\s*([\s\S]*?)\s*```/) ||
                      response.match(/(\{[\s\S]*\})/);
    
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1].trim()) as MatchResult;
      } catch {
        // Continue to try parsing the entire response
      }
    }
    
    try {
      return JSON.parse(response) as MatchResult;
    } catch {
      // Return a default structure if parsing fails
      return {
        resumeAnalysis: {
          candidateName: 'Unknown',
          totalYearsExperience: 'Unknown',
          currentRole: 'Unknown',
          technicalSkills: [],
          softSkills: [],
          industries: [],
          educationLevel: 'Unknown',
          certifications: [],
          keyAchievements: [],
        },
        jdAnalysis: {
          jobTitle: 'Unknown',
          seniorityLevel: 'Unknown',
          requiredYearsExperience: 'Unknown',
          mustHaveSkills: [],
          niceToHaveSkills: [],
          industryFocus: 'Unknown',
          keyResponsibilities: [],
        },
        mustHaveAnalysis: {
          extractedMustHaves: {
            skills: [],
            experiences: [],
            qualifications: [],
          },
          candidateEvaluation: {
            meetsAllMustHaves: false,
            matchedSkills: [],
            missingSkills: [],
            matchedExperiences: [],
            missingExperiences: [],
            matchedQualifications: [],
            missingQualifications: [],
          },
          mustHaveScore: 0,
          disqualified: false,
          disqualificationReasons: [],
          gapAnalysis: 'Unable to analyze',
        },
        niceToHaveAnalysis: {
          extractedNiceToHaves: {
            skills: [],
            experiences: [],
            qualifications: [],
          },
          candidateEvaluation: {
            matchedSkills: [],
            matchedExperiences: [],
            matchedQualifications: [],
            bonusSkills: [],
          },
          niceToHaveScore: 0,
          competitiveAdvantage: 'Unable to analyze',
        },
        skillMatch: {
          matchedMustHave: [],
          missingMustHave: [],
          matchedNiceToHave: [],
          missingNiceToHave: [],
          additionalRelevantSkills: [],
        },
        skillMatchScore: {
          score: 0,
          breakdown: { mustHaveScore: 0, niceToHaveScore: 0, depthOfExpertise: 0 },
          skillApplicationAnalysis: 'Unable to analyze',
          credibilityFlags: { hasRedFlags: false, concerns: [], positiveIndicators: [] },
        },
        experienceMatch: {
          required: 'Unknown',
          candidate: 'Unknown',
          yearsGap: 'Unknown',
          assessment: 'Unable to parse response',
        },
        experienceValidation: {
          score: 0,
          relevanceToRole: 'Unknown',
          gaps: [],
          strengths: [],
          careerProgression: 'Unable to analyze',
        },
        candidatePotential: {
          growthTrajectory: 'Unable to analyze',
          leadershipIndicators: [],
          learningAgility: 'Unable to analyze',
          uniqueValueProps: [],
          cultureFitIndicators: [],
          riskFactors: [],
        },
        transferableSkills: [],
        experienceBreakdown: {
          fullTimeExperience: 'Unknown',
          internshipExperience: 'Unknown',
          totalRelevantExperience: 'Unknown',
          note: 'Unable to analyze',
        },
        hardRequirementGaps: [],
        overallMatchScore: {
          score: 0,
          grade: 'F',
          breakdown: {
            skillMatchWeight: 40,
            skillMatchScore: 0,
            experienceWeight: 35,
            experienceScore: 0,
            potentialWeight: 25,
            potentialScore: 0,
          },
          confidence: 'Low',
        },
        overallFit: {
          verdict: 'Unable to Assess',
          summary: response.substring(0, 500),
          topReasons: ['Unable to process the match analysis'],
          interviewFocus: [],
          hiringRecommendation: 'Unable to determine',
          suggestedRole: '',
        },
        recommendations: {
          forRecruiter: ['Unable to generate recommendations - parsing failed'],
          forCandidate: [],
          interviewQuestions: [],
        },
        suggestedInterviewQuestions: {
          technical: [],
          behavioral: [],
          experienceValidation: [],
          situational: [],
          cultureFit: [],
          redFlagProbing: [],
        },
        areasToProbeDeeper: [],
        preferenceAlignment: {
          overallScore: 100,
          locationFit: { score: 100, assessment: 'Unable to assess' },
          workTypeFit: { score: 100, assessment: 'Unable to assess' },
          salaryFit: { score: 100, assessment: 'Unable to assess' },
          jobTypeFit: { score: 100, assessment: 'Unable to assess' },
          companyTypeFit: { score: 100, assessment: 'Unable to assess' },
          overallAssessment: 'Unable to assess preference alignment',
          warnings: [],
        },
      };
    }
  }

  /**
   * Match a resume against a job description
   */
  async match(input: MatchResumeRequest, requestId?: string): Promise<MatchResult> {
    return this.executeWithJsonResponse(input, input.jd, requestId);
  }
}

export const resumeMatchAgent = new ResumeMatchAgent();
