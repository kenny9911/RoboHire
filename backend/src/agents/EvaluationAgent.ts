import { BaseAgent } from './BaseAgent.js';
import { InterviewEvaluation, EvaluateInterviewRequest, CheatingAnalysis } from '../types/index.js';
import { cheatingDetectorAgent } from './CheatingDetectorAgent.js';
import { logger } from '../services/LoggerService.js';

/**
 * Agent for evaluating interview transcripts
 * Analyzes candidate performance based on resume, JD, and interview content
 * Optionally includes cheating detection analysis
 */
export class EvaluationAgent extends BaseAgent<EvaluateInterviewRequest, InterviewEvaluation> {
  constructor() {
    super('EvaluationAgent');
  }

  protected getAgentPrompt(): string {
    return `You are an expert technical recruiter, 对技术深度理解有高要求的专家, and hiring manager with deep expertise in talent assessment.
Your task is to comprehensively evaluate a candidate based on the provided Job Description (JD) and Interview Transcript.

## 对与面试记录中英文转译不准确的部分，自动更正。

## CRITICAL: Must-Have Requirements Analysis (硬性要求分析)

This is the MOST IMPORTANT part of the evaluation. You MUST:

1. **Extract Must-Have Requirements from JD** (从JD中提取硬性要求)
   - Identify skills, experiences, and qualifications that are MANDATORY
   - Look for keywords: "必须", "Required", "Must have", "Essential", "Mandatory", "X years experience required"
   - Classify criticality: Dealbreaker (不满足直接淘汰) > Critical (核心要求) > Important (重要要求)

2. **Verify Must-Haves Through Interview Answers** (通过面试回答验证硬性要求)
   - Check if interview questions tested the must-have requirements
   - Did the candidate PROVE they have the skill/experience through their answers?
   - A wrong answer or "I don't know" to a must-have question = FAILED
   - Partial/vague answers = needs verification but NOT a pass

3. **Disqualification Rules** (淘汰规则)
   - If candidate FAILS any Dealbreaker must-have → **DISQUALIFIED** (score ≤ 25)
   - If candidate FAILS any Critical must-have → **No Hire** (score ≤ 45)
   - If must-have was NOT tested in interview → flag for next round, do NOT assume they have it

## Output Format
You must output a JSON object adhering to the following structure:
{
  "score": number, // 0-100 overall match score (capped based on must-have results)
  "summary": "string", // A persuasive candidate highlight intro. If disqualified, explain why.
  "strengths": ["string", ...], // 3-5 key strengths with evidence
  "weaknesses": ["string", ...], // 2-4 potential concerns or gaps
  "skillsAssessment": [
    {
      "skill": "string",
      "rating": "Excellent" | "Good" | "Adequate" | "Insufficient" | "Not Demonstrated",
      "evidence": "string"
    }
  ],
  "recommendation": "string", // Detailed hiring recommendation with reasoning
  "hiringDecision": "Strong Hire" | "Hire" | "Weak Hire" | "No Hire" | "Disqualified",

  // 1. MUST-HAVE ANALYSIS (硬性要求分析) - CRITICAL SECTION
  "mustHaveAnalysis": {
    "extractedMustHaves": {
      "skills": [
        {
          "skill": "string", // The must-have skill
          "reason": "string", // Why it's a must-have based on JD
          "criticality": "Dealbreaker" | "Critical" | "Important"
        }
      ],
      "experiences": [
        {
          "experience": "string", // Required experience
          "reason": "string",
          "minimumYears": "string", // If specified
          "criticality": "Dealbreaker" | "Critical" | "Important"
        }
      ],
      "qualifications": [
        {
          "qualification": "string", // Required degree/cert
          "reason": "string",
          "criticality": "Dealbreaker" | "Critical" | "Important"
        }
      ]
    },
    "interviewVerification": {
      "verified": [
        {
          "requirement": "string", // Which must-have was verified
          "verifiedBy": "string", // Which Q&A proved it (e.g., "Question 3 about system design")
          "evidence": "string", // Quote or summary proving competency
          "confidenceLevel": "High" | "Medium" | "Low"
        }
      ],
      "failed": [
        {
          "requirement": "string", // Which must-have they failed
          "failedAt": "string", // Which Q&A revealed the failure
          "reason": "string", // Specific reason (wrong answer, no knowledge, vague response)
          "severity": "Dealbreaker" | "Critical" | "Significant"
        }
      ],
      "notTested": [
        {
          "requirement": "string", // Must-have not tested in interview
          "recommendation": "string" // What to ask in next round
        }
      ]
    },
    "mustHaveScore": number, // 0-100 based on must-have pass rate
    "passRate": "string", // e.g., "3/5 must-haves verified"
    "disqualified": boolean, // true if ANY Dealbreaker failed
    "disqualificationReasons": ["string", ...], // List of failed Dealbreakers
    "assessment": "string" // Overall must-have assessment summary
  },
  
  // 2. Technical Capability Assessment
  "technicalAnalysis": {
    "summary": "string", // Deep dive into technical depth/breadth
    "depthRating": "Expert" | "Advanced" | "Intermediate" | "Novice",
    "details": ["string", ...], // Specific technical points/findings
    "provenSkills": ["string", ...], // Skills where candidate demonstrated real depth with evidence
    "claimedButUnverified": ["string", ...], // Skills claimed but not proven during interview
    "responseQuality": "High" | "Medium" | "Low" // Overall quality of technical responses
  },

  // 3. JD Match & Extra Skills
  "jdMatch": {
    "requirements": [
      {
        "requirement": "string", // Copy verbatim from JD Requirements
        "matchLevel": "High" | "Medium" | "Low" | "None",
        "score": number, // 0-10
        "explanation": "string" // Evidence-based justification
      }
    ],
    "hardRequirementsAnalysis": [
        {
            "requirement": "string", // The mandatory requirement
            "met": boolean,
            "analysis": "string" // Explanation of why it is met or not
        }
    ],
    "extraSkillsFound": ["string", ...], // Skills NOT in JD but demonstrated
    "summary": "string"
  },

  // 4. Behavioral Analysis
  "behavioralAnalysis": {
    "summary": "string", // Assessment of soft skills/culture
    "compatibility": "High" | "Medium" | "Low",
    "details": ["string", ...] // e.g. "Communication: Clear", "Adaptability: Strong"
  },

  // 5. Interviewer's Kit
  "interviewersKit": {
    "suggestedQuestions": ["string", ...], // Questions to probe gaps/verify skills
    "focusAreas": ["string", ...] // Areas needing more investigation
  },

  // 6. Level & Fit Assessment
  "levelAssessment": "Expert" | "Senior" | "Intermediate" | "Junior",
  "expertAdvice": "string", // Professional advice on their level, potential growth, or specific fit for the role
  "suitableWorkTypes": ["string", ...], // List of specific roles or work types they are best suited for

  // 7. Question-Answer Assessment
  "questionAnswerAssessment": [
    {
      "question": "string", // The question asked
      "answer": "string", // Summary of candidate's response
      "score": number, // 0-100 score for this specific answer
      "correctness": "Correct" | "Partially Correct" | "Incorrect",
      "thoughtProcess": "string", // Evaluation of their reasoning
      "logicalThinking": "string", // Evaluation of their logic
      "clarity": "High" | "Medium" | "Low",
      "completeness": "Complete" | "Partial" | "Incomplete",
      "relatedMustHave": "string", // If this Q tests a must-have, specify which one
      "mustHaveVerified": boolean, // If must-have, did they pass?
      "weight": "Must-Have" | "Important" | "Nice-to-Have" // Question importance
    }
  ]
}

## Evaluation Guidelines

### CRITICAL: Deep Analysis of Candidate Responses

You must carefully analyze each candidate response to determine:

1. **True Understanding vs. Superficial Knowledge (真懂 vs 浅说)**
   - Does the candidate explain the "why" behind concepts, not just the "what"?
   - Can they describe trade-offs, edge cases, or when NOT to use a technology?
   - Do they show depth by mentioning implementation details, pitfalls, or lessons learned?
   - RED FLAG: Generic textbook answers without personal insight = superficial knowledge

2. **Specific vs. Vague Answers (具体回答 vs 泛泛而谈)**
   - Does the answer directly address the specific question asked?
   - Are there concrete examples with numbers, timelines, or measurable outcomes?
   - Does the candidate use specific project names, technologies, or scenarios?
   - RED FLAG: Answers that could apply to any question = vague/evasive

3. **Proven Experience vs. Empty Claims (真会 vs 只说有经验)**
   - Can the candidate walk through actual implementation steps?
   - Do they mention specific challenges faced and how they solved them?
   - Can they explain their role vs. team's role in projects?
   - Do they know the "how" not just the "that"?
   - RED FLAG: "I have experience with X" without any proof of depth = unverified claim

4. **Response Quality Indicators**
   - HIGH QUALITY: Specific examples + technical depth + lessons learned + measurable impact
   - MEDIUM QUALITY: Correct concepts but lacking specific examples or depth
   - LOW QUALITY: Generic answers, buzzword-heavy, avoids specifics, redirects questions
   - CONCERNING: Contradictions, inability to elaborate when probed, overly rehearsed answers

### Technical Analysis
- 作为资深技术专家与AI专家，你先回答每一个问题的正确解答, 并将你的正确答案和候选人的回答做详细比较和分析
- Assess fundamental understanding vs rote memorization.
- Look for problem-solving approach and architectural thinking.
- Distinguish between "knows about" vs "has actually done".
- Check if technical explanations are coherent and logically sound.
- 计算总共有几个问题。
- 计算总得分。
- 得出平均分数。
- 计算答对的问题数除以总问题数，得出问题答对率。

### JD Match
- Evaluate EACH requirement listed in the JD.
- CRITICAL: Identify MANDATORY/HARD requirements (e.g. "Must have", "Required", "Experience in Finance/Insurance is necessary").
- If a candidate fails a MANDATORY requirement (like domain experience in Finance/Insurance when explicitly asked), they CANNOT be a "Strong Hire" or "Hire" unless they have exceptional compensating factors.
- Explicitly list hard requirement failures in the "hardRequirementsAnalysis" section.
- Identify "Extra Skills" that add value beyond the JD.
- For each requirement, note whether the candidate PROVED competency or just CLAIMED it.

### Behavioral Analysis
- Assess communication clarity, structure, and attitude.
- Look for signs of leadership, collaboration, and adaptability (STAR method implicitly).
- Note if answers are well-structured or rambling/unfocused.

### Question-Answer Assessment
- Evaluate key technical or behavioral questions individually.
- For each question, assess:
    - **Correctness**: Is the answer technically accurate?
    - **Thought Process**: Did they explain their reasoning?
    - **Logical Thinking**: Is the argument sound?
    - **Clarity**: Was the answer easy to understand?
    - **Completeness**: Did they miss any critical parts?
- Assign a score (0-100) for the quality of the answer.

### Interviewer's Kit
- Provide high-value, specific questions for the next round.
- Focus on verifying "Medium" matches or exploring "Extra Skills".
- Include probing questions for areas where candidate gave vague or unsubstantiated answers.
- Suggest technical deep-dive questions to verify claimed expertise.

## SCORING GUIDELINES (0-100)

### CRITICAL: Must-Have Scoring Rules (硬性要求评分规则) - THIS TAKES PRIORITY

1. **Disqualification (淘汰)**
   - If candidate FAILS ANY must-have with severity "Dealbreaker":
     - Set \`mustHaveAnalysis.disqualified = true\`
     - Set \`score ≤ 25\` (maximum)
     - Set \`hiringDecision = "Disqualified"\`
   - This is NON-NEGOTIABLE regardless of other performance

2. **No Hire**
   - If candidate FAILS ANY must-have with severity "Critical":
     - Set \`score ≤ 45\` (maximum)
     - Set \`hiringDecision = "No Hire"\`

3. **Score Calculation**
   - Must-have score = (verified must-haves / total must-haves) × 50 points
   - Non-must-have score = weighted average of other Q&A × 50 points
   - Total = Must-have score + Non-must-have score (capped by disqualification rules)

### Score Penalties (减分项)
- **Failed Dealbreaker Must-Have**: Score CAPPED at 25. Candidate is Disqualified.
- **Failed Critical Must-Have**: Score CAPPED at 45. Candidate is No Hire.
- **Failed Important Must-Have**: Deduct 10-15 points per failure.
- **Response Quality = Low**: Deduct 15-25 points. Generic or evasive answers indicate lack of real expertise.
- **Many "Claimed but Unverified" skills**: Deduct 5-10 points per critical unverified skill.
- **Vague/Superficial answers to core JD requirements**: Deduct 10-20 points.
- **Contradictions or inconsistencies**: Deduct 10-15 points.

### Score Bonuses (加分项)
- **All Must-Haves Verified**: Add 10 points. Shows strong alignment with role requirements.
- **Response Quality = High**: Add 5-10 points. Demonstrates genuine expertise.
- **Many "Proven Skills" with evidence**: Add 5-10 points. Verified competency is more valuable.
- **Specific metrics and outcomes mentioned**: Add 5-10 points. Shows impact awareness.
- **Demonstrates depth beyond surface level**: Add 5-10 points.

### Score Thresholds
- **85-100**: Strong Hire - All must-haves verified, proven expertise, high-quality responses
- **70-84**: Hire - Most must-haves verified, good match with mostly proven skills
- **50-69**: Weak Hire - Some must-haves unverified/failed, mixed signals
- **26-49**: No Hire - Failed Critical must-haves, major gaps, or low response quality
- **0-25**: Disqualified - Failed Dealbreaker must-have(s)

### Important Scoring Rules
1. **Must-haves are non-negotiable gates**. A perfect answer to all non-must-have questions cannot compensate for a failed Dealbreaker.
2. If interview did NOT test a must-have, flag it in \`notTested\` - do NOT assume the candidate has it.
3. The score should reflect what was DEMONSTRATED and VERIFIED in the interview.
4. "I have experience with X" is NOT verification - they must PROVE it by answering correctly.`;
  }

  protected formatInput(input: EvaluateInterviewRequest): string {
    let prompt = `## CANDIDATE'S RESUME
${input.resume}

---

## JOB DESCRIPTION
${input.jd}

---

## INTERVIEW TRANSCRIPT
${input.interviewScript}`;

    // Add user instructions if provided
    if (input.userInstructions) {
      prompt += `

---

## SPECIAL EVALUATION INSTRUCTIONS (from hiring manager)

Please pay special attention to the following when generating this evaluation:

${input.userInstructions}

Make sure to address these specific points in your analysis while still following the standard evaluation framework.`;
    }

    prompt += `

---

Please provide a comprehensive evaluation including Technical Analysis, JD Match, Behavioral Analysis, and Interviewer's Kit as defined in the system prompt.`;

    return prompt;
  }

  protected parseOutput(response: string): InterviewEvaluation {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                      response.match(/```\s*([\s\S]*?)\s*```/) ||
                      response.match(/(\{[\s\S]*\})/);
    
    if (jsonMatch && jsonMatch[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        return this.normalizeResult(parsed);
      } catch {
        // Continue to try parsing the entire response
      }
    }
    
    try {
      const parsed = JSON.parse(response);
      return this.normalizeResult(parsed);
    } catch {
      // Return a default structure if parsing fails
      return this.getDefaultEvaluation(response);
    }
  }

  /**
   * Normalize and ensure all required fields exist
   */
  private normalizeResult(parsed: Partial<InterviewEvaluation>): InterviewEvaluation {
    const mustHaveAnalysis = parsed.mustHaveAnalysis || this.getDefaultMustHaveAnalysis();
    
    // Enforce scoring rules based on must-have results
    let score = parsed.score || 0;
    let hiringDecision = this.validateHiringDecision(parsed.hiringDecision);
    
    if (mustHaveAnalysis.disqualified) {
      score = Math.min(score, 25);
      hiringDecision = 'Disqualified';
    } else if (mustHaveAnalysis.interviewVerification?.failed?.some(f => f.severity === 'Critical')) {
      score = Math.min(score, 45);
      if (hiringDecision === 'Strong Hire' || hiringDecision === 'Hire' || hiringDecision === 'Weak Hire') {
        hiringDecision = 'No Hire';
      }
    }
    
    return {
      score,
      summary: parsed.summary || 'Unable to generate summary',
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
      skillsAssessment: Array.isArray(parsed.skillsAssessment) ? parsed.skillsAssessment : [],
      recommendation: parsed.recommendation || 'Unable to provide recommendation',
      hiringDecision,
      mustHaveAnalysis,
      technicalAnalysis: parsed.technicalAnalysis || {
        summary: 'Analysis not available',
        depthRating: 'Intermediate',
        details: [],
        provenSkills: [],
        claimedButUnverified: [],
        responseQuality: 'Medium',
      },
      jdMatch: parsed.jdMatch || {
        requirements: [],
        hardRequirementsAnalysis: [],
        extraSkillsFound: [],
        summary: 'Analysis not available',
      },
      behavioralAnalysis: parsed.behavioralAnalysis || {
        summary: 'Analysis not available',
        compatibility: 'Medium',
        details: [],
      },
      interviewersKit: parsed.interviewersKit || {
        suggestedQuestions: [],
        focusAreas: [],
      },
      levelAssessment: this.validateLevelAssessment(parsed.levelAssessment),
      expertAdvice: parsed.expertAdvice || '',
      suitableWorkTypes: Array.isArray(parsed.suitableWorkTypes) ? parsed.suitableWorkTypes : [],
      questionAnswerAssessment: Array.isArray(parsed.questionAnswerAssessment) ? parsed.questionAnswerAssessment : [],
      cheatingAnalysis: parsed.cheatingAnalysis,
    };
  }

  /**
   * Get default must-have analysis when not provided
   */
  private getDefaultMustHaveAnalysis() {
    return {
      extractedMustHaves: {
        skills: [],
        experiences: [],
        qualifications: [],
      },
      interviewVerification: {
        verified: [],
        failed: [],
        notTested: [],
      },
      mustHaveScore: 0,
      passRate: '0/0',
      disqualified: false,
      disqualificationReasons: [],
      assessment: 'Must-have analysis not available',
    };
  }

  /**
   * Validate hiring decision value
   */
  private validateHiringDecision(decision: string | undefined): 'Strong Hire' | 'Hire' | 'Weak Hire' | 'No Hire' | 'Disqualified' {
    const validDecisions = ['Strong Hire', 'Hire', 'Weak Hire', 'No Hire', 'Disqualified'];
    return validDecisions.includes(decision || '') ? (decision as 'Strong Hire' | 'Hire' | 'Weak Hire' | 'No Hire' | 'Disqualified') : 'No Hire';
  }

  /**
   * Validate level assessment value
   */
  private validateLevelAssessment(level: string | undefined): 'Expert' | 'Senior' | 'Intermediate' | 'Junior' {
    const validLevels = ['Expert', 'Senior', 'Intermediate', 'Junior'];
    return validLevels.includes(level || '') ? (level as 'Expert' | 'Senior' | 'Intermediate' | 'Junior') : 'Intermediate';
  }

  /**
   * Get default evaluation when parsing fails
   */
  private getDefaultEvaluation(rawResponse: string): InterviewEvaluation {
    return {
      score: 0,
      summary: 'Unable to parse evaluation response',
      strengths: [],
      weaknesses: [],
      skillsAssessment: [],
      recommendation: rawResponse.substring(0, 500),
      hiringDecision: 'No Hire',
      mustHaveAnalysis: this.getDefaultMustHaveAnalysis(),
      technicalAnalysis: {
        summary: 'Analysis failed',
        depthRating: 'Intermediate',
        details: [],
        provenSkills: [],
        claimedButUnverified: [],
        responseQuality: 'Medium',
      },
      jdMatch: {
        requirements: [],
        hardRequirementsAnalysis: [],
        extraSkillsFound: [],
        summary: 'Analysis failed',
      },
      behavioralAnalysis: {
        summary: 'Analysis failed',
        compatibility: 'Medium',
        details: [],
      },
      interviewersKit: {
        suggestedQuestions: [],
        focusAreas: [],
      },
      levelAssessment: 'Intermediate',
      expertAdvice: '',
      suitableWorkTypes: [],
      questionAnswerAssessment: [],
    };
  }

  /**
   * Evaluate an interview with optional cheating detection
   */
  async evaluate(
    resume: string,
    jd: string,
    interviewScript: string,
    options?: {
      includeCheatingDetection?: boolean;
      userInstructions?: string;
    },
    requestId?: string
  ): Promise<InterviewEvaluation> {
    const input: EvaluateInterviewRequest = {
      resume,
      jd,
      interviewScript,
      userInstructions: options?.userInstructions,
    };

    // Run main evaluation
    const evaluation = await this.executeWithJsonResponse(input, jd, requestId);

    // Optionally run cheating detection in parallel
    if (options?.includeCheatingDetection) {
      try {
        logger.info('AGENT', `${this.name}: Running cheating detection analysis`, {}, requestId);
        const cheatingAnalysis = await cheatingDetectorAgent.analyze(interviewScript, jd, requestId);
        evaluation.cheatingAnalysis = cheatingAnalysis;
        logger.info('AGENT', `${this.name}: Cheating analysis complete`, {
          riskLevel: cheatingAnalysis.riskLevel,
          suspicionScore: cheatingAnalysis.suspicionScore,
        }, requestId);
      } catch (error) {
        logger.error('AGENT', `${this.name}: Cheating detection failed`, {
          error: error instanceof Error ? error.message : 'Unknown error',
        }, requestId);
        // Don't fail the entire evaluation if cheating detection fails
      }
    }

    return evaluation;
  }
}

export const evaluationAgent = new EvaluationAgent();
