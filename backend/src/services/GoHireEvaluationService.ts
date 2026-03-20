/**
 * GoHire Evaluation Service
 *
 * Ports the evaluation generation logic from evaluateInterviewAgent to RoboHire,
 * using RoboHire's existing LLM service abstraction instead of direct OpenAI clients.
 *
 * Provides:
 *  - generateEvaluation: comprehensive interview evaluation
 *  - detectCheating: AI/LLM-assisted cheating detection
 *  - evaluateInterview: high-level method combining both
 */

import { llmService } from './llm/LLMService.js';
import { logger } from './LoggerService.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EvaluationParams {
  jobTitle: string;
  jobDescription: string;
  jobRequirements: string;
  transcript: string;
  language?: string;   // defaults to 'zh-CN'
  requestId?: string;
}

export interface CheatingDetectionParams {
  transcript: string;
  language?: string;   // defaults to 'zh-CN'
  requestId?: string;
}

export interface SkillAssessment {
  skill: string;
  rating: 'Excellent' | 'Good' | 'Adequate' | 'Insufficient' | 'Not Demonstrated';
  evidence: string;
}

export interface JdRequirementAnalysis {
  requirement: string;
  matchLevel: 'High' | 'Medium' | 'Low' | 'None';
  score: number;
  explanation: string;
}

export interface HardRequirementAnalysis {
  requirement: string;
  met: boolean;
  analysis: string;
}

export interface TechnicalAnalysis {
  summary: string;
  depthRating: 'Expert' | 'Advanced' | 'Intermediate' | 'Novice';
  details: string[];
  provenSkills?: string[];
  claimedButUnverified?: string[];
  responseQuality?: 'High' | 'Medium' | 'Low';
}

export interface JdMatchAnalysis {
  requirements: JdRequirementAnalysis[];
  hardRequirementsAnalysis?: HardRequirementAnalysis[];
  extraSkillsFound: string[];
  summary: string;
}

export interface BehavioralAnalysis {
  summary: string;
  compatibility: 'High' | 'Medium' | 'Low';
  details: string[];
}

export interface InterviewersKit {
  suggestedQuestions: string[];
  focusAreas: string[];
}

export interface QuestionAnswerAssessment {
  question: string;
  answer: string;
  score: number;
  correctness: 'Correct' | 'Partially Correct' | 'Incorrect';
  thoughtProcess: string;
  logicalThinking: string;
  clarity: 'High' | 'Medium' | 'Low';
  completeness: 'Complete' | 'Partial' | 'Incomplete';
}

export interface CheatingIndicator {
  type: string;
  description: string;
  severity: 'Low' | 'Medium' | 'High';
  evidence: string;
}

export interface CheatingAnalysis {
  suspicionScore: number;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  summary: string;
  indicators: CheatingIndicator[];
  authenticitySignals: string[];
  recommendation: string;
}

export interface EvaluationReport {
  score: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  skillsAssessment?: SkillAssessment[];
  recommendation: string;
  hiringDecision: 'Strong Hire' | 'Hire' | 'Weak Hire' | 'No Hire';
  technicalAnalysis?: TechnicalAnalysis;
  jdMatch?: JdMatchAnalysis;
  behavioralAnalysis?: BehavioralAnalysis;
  interviewersKit?: InterviewersKit;
  questionAnswerAssessment?: QuestionAnswerAssessment[];
  levelAssessment?: 'Expert' | 'Senior' | 'Intermediate' | 'Junior';
  expertAdvice?: string;
  suitableWorkTypes?: string[];
  cheatingAnalysis?: CheatingAnalysis;
  personalityAssessment?: {
    mbtiEstimate: string;
    mbtiConfidence: 'High' | 'Medium' | 'Low';
    mbtiExplanation: string;
    bigFiveTraits: Array<{
      trait: string;
      level: 'High' | 'Medium-High' | 'Medium' | 'Medium-Low' | 'Low';
      evidence: string;
    }>;
    communicationStyle: string;
    workStylePreferences: string[];
    motivators: string[];
    potentialChallenges: string[];
    teamDynamicsAdvice: string;
    summary: string;
  };
}

export interface EvaluateInterviewResult {
  evaluationData: EvaluationReport;
  evaluationScore: number;
  evaluationVerdict: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SupportedLanguage = 'en' | 'zh-CN' | 'zh-TW' | 'ja';

const LANGUAGE_DISPLAY_NAMES: Record<SupportedLanguage, string> = {
  'en': 'English',
  'zh-CN': 'Chinese (简体中文)',
  'zh-TW': 'Chinese (繁體中文)',
  'ja': 'Japanese (日本語)',
};

function getOutputLanguage(language?: string): string {
  const lang = (language || 'zh-CN') as SupportedLanguage;
  return LANGUAGE_DISPLAY_NAMES[lang] || 'Chinese (简体中文)';
}

function extractJsonObjectFromText(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function createFallbackEvaluationReport(
  language: string,
  jobTitle: string,
  reason?: string,
): EvaluationReport {
  const fallbackMessages: Record<string, { summary: string; recommendation: string; advice: string }> = {
    'en': {
      summary: `Evaluation for "${jobTitle}" is temporarily unavailable due to upstream model response issues. Please retry in a moment.`,
      recommendation: 'Unable to provide a reliable hiring recommendation right now. Please retry generation.',
      advice: `Retry with a stable model and verify transcript quality. ${reason ? `Error: ${reason}` : ''}`.trim(),
    },
    'zh-CN': {
      summary: `当前无法稳定生成"${jobTitle}"的完整评估（模型返回异常）。请稍后重试。`,
      recommendation: '暂时无法给出可靠的录用建议，请重试生成。',
      advice: `建议稍后重试，或切换更稳定模型并检查面试文本质量。${reason ? `错误信息：${reason}` : ''}`.trim(),
    },
    'zh-TW': {
      summary: `目前無法穩定生成「${jobTitle}」的完整評估（模型回應異常）。請稍後重試。`,
      recommendation: '暫時無法給出可靠的錄用建議，請重試生成。',
      advice: `建議稍後重試，或切換更穩定模型並檢查面試文本品質。${reason ? `錯誤訊息：${reason}` : ''}`.trim(),
    },
    'ja': {
      summary: `モデル応答の異常により、「${jobTitle}」の評価を安定して生成できませんでした。しばらくして再試行してください。`,
      recommendation: '現在は信頼できる採用判断を提示できません。再生成を実行してください。',
      advice: `時間を置いて再試行するか、安定したモデルに切り替えてください。${reason ? `エラー: ${reason}` : ''}`.trim(),
    },
  };

  const text = fallbackMessages[language || 'zh-CN'] || fallbackMessages['zh-CN'];
  return {
    score: 0,
    summary: text.summary,
    strengths: [],
    weaknesses: [],
    skillsAssessment: [],
    recommendation: text.recommendation,
    hiringDecision: 'Weak Hire',
    technicalAnalysis: {
      summary: text.summary,
      depthRating: 'Intermediate',
      details: [],
      provenSkills: [],
      claimedButUnverified: [],
      responseQuality: 'Low',
    },
    jdMatch: {
      requirements: [],
      hardRequirementsAnalysis: [],
      extraSkillsFound: [],
      summary: text.summary,
    },
    behavioralAnalysis: {
      summary: text.summary,
      compatibility: 'Medium',
      details: [],
    },
    interviewersKit: {
      suggestedQuestions: [],
      focusAreas: [],
    },
    questionAnswerAssessment: [],
    levelAssessment: 'Intermediate',
    expertAdvice: text.advice,
    suitableWorkTypes: [],
  };
}

function getDefaultCheatingAnalysis(language: string): CheatingAnalysis {
  const messages: Record<string, { summary: string; recommendation: string }> = {
    'en': {
      summary: 'Unable to perform cheating analysis due to insufficient data or processing error.',
      recommendation: 'Proceed with standard evaluation. Consider additional verification if concerns arise.',
    },
    'zh-CN': {
      summary: '由于数据不足或处理错误，无法进行作弊分析。',
      recommendation: '继续进行标准评估。如有疑虑，可考虑额外验证。',
    },
    'zh-TW': {
      summary: '由於資料不足或處理錯誤，無法進行作弊分析。',
      recommendation: '繼續進行標準評估。如有疑慮，可考慮額外驗證。',
    },
    'ja': {
      summary: 'データ不足または処理エラーにより、不正分析を実行できませんでした。',
      recommendation: '標準評価を続行してください。懸念がある場合は、追加の確認を検討してください。',
    },
  };

  const msg = messages[language || 'zh-CN'] || messages['zh-CN'];
  return {
    suspicionScore: 0,
    riskLevel: 'Low',
    summary: msg.summary,
    indicators: [],
    authenticitySignals: [],
    recommendation: msg.recommendation,
  };
}

function validateRiskLevel(level: string | undefined): 'Low' | 'Medium' | 'High' | 'Critical' {
  const validLevels = ['Low', 'Medium', 'High', 'Critical'];
  return validLevels.includes(level || '') ? (level as 'Low' | 'Medium' | 'High' | 'Critical') : 'Low';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class GoHireEvaluationService {
  // -----------------------------------------------------------------------
  // generateEvaluation
  // -----------------------------------------------------------------------

  async generateEvaluation(params: EvaluationParams): Promise<EvaluationReport> {
    const {
      jobTitle,
      jobDescription,
      jobRequirements,
      transcript,
      language = 'zh-CN',
      requestId,
    } = params;

    const outputLanguage = getOutputLanguage(language);

    logger.info('GOHIRE_EVAL', `Generating evaluation for "${jobTitle}"`, {
      language,
      outputLanguage,
      transcriptLength: transcript.length,
    }, requestId);

    const systemPrompt = `
You are an expert technical recruiter,对技术深度理解有高要求的专家, and hiring manager with deep expertise in talent assessment.
Your task is to comprehensively evaluate a candidate based on the provided Job Description (JD) and Interview Transcript.

## 对与面试记录中英文转译不准确的部分，自动更正。

## Output Format
You must output a JSON object adhering to the following structure:
{
  "score": number, // 0-100 overall match score
  "summary": "string", // A persuasive candidate highlight intro (pitch). Focus on why they are a great fit based on JD requirements. Use **bold** for key achievements/skills.
  "strengths": ["string", ...], // 3-5 key strengths with evidence
  "weaknesses": ["string", ...], // 2-4 potential concerns or gaps
  "skillsAssessment": [ // Deprecated but required for compatibility
    {
      "skill": "string", // Name of the skill/qualification from JD
      "rating": "Excellent" | "Good" | "Adequate" | "Insufficient" | "Not Demonstrated",
      "evidence": "string"
    }
  ],
  "recommendation": "string", // Detailed hiring recommendation with reasoning
  "hiringDecision": "Strong Hire" | "Hire" | "Weak Hire" | "No Hire",

  // 1. Technical Capability Assessment
  "technicalAnalysis": {
    "summary": "string", // Deep dive into technical depth/breadth
    "depthRating": "Expert" | "Advanced" | "Intermediate" | "Novice",
    "details": ["string", ...], // Specific technical points/findings
    "provenSkills": ["string", ...], // Skills where candidate demonstrated real depth with evidence
    "claimedButUnverified": ["string", ...], // Skills claimed but not proven during interview
    "responseQuality": "High" | "Medium" | "Low" // Overall quality of technical responses
  },

  // 2. JD Match & Extra Skills
  "jdMatch": {
    "requirements": [
      {
        "requirement": "string", // Copy verbatim from JD Requirements
        "matchLevel": "High" | "Medium" | "Low" | "None",
        "score": number, // 0-10
        "explanation": "string" // Evidence-based justification
      }
    ],
    "hardRequirementsAnalysis": [ // New field for hard/mandatory requirements
        {
            "requirement": "string", // The mandatory requirement (e.g. "5+ years finance experience")
            "met": boolean,
            "analysis": "string" // Explanation of why it is met or not
        }
    ],
    "extraSkillsFound": ["string", ...], // Skills NOT in JD but demonstrated
    "summary": "string"
  },

  // 3. Behavioral Analysis
  "behavioralAnalysis": {
    "summary": "string", // Assessment of soft skills/culture
    "compatibility": "High" | "Medium" | "Low",
    "details": ["string", ...] // e.g. "Communication: Clear", "Adaptability: Strong"
  },

  // 4. Interviewer's Kit
  "interviewersKit": {
    "suggestedQuestions": ["string", ...], // Questions to probe gaps/verify skills
    "focusAreas": ["string", ...] // Areas needing more investigation
  },

  // 5. Level & Fit Assessment
  "levelAssessment": "Expert" | "Senior" | "Intermediate" | "Junior",
  "expertAdvice": "string", // Professional advice on their level, potential growth, or specific fit for the role
  "suitableWorkTypes": ["string", ...], // List of specific roles or work types they are best suited for (e.g. "Backend Systems", "R&D", "Technical Lead")

  // 6. Question-Answer Assessment
  "questionAnswerAssessment": [
    {
      "question": "string", // The question asked
      "answer": "string", // Summary of candidate's response
      "score": number, // 0-100 score for this specific answer
      "correctness": "Correct" | "Partially Correct" | "Incorrect",
      "thoughtProcess": "string", // Evaluation of their reasoning
      "logicalThinking": "string", // Evaluation of their logic
      "clarity": "High" | "Medium" | "Low",
      "completeness": "Complete" | "Partial" | "Incomplete"
    }
  ],

  // 7. Personality Assessment (性格测试) — Inferred from interview behavior
  "personalityAssessment": {
    "mbtiEstimate": "string", // Best-fit MBTI type (e.g. "INTJ", "ENFP")
    "mbtiConfidence": "High" | "Medium" | "Low",
    "mbtiExplanation": "string", // Evidence-based reasoning for the MBTI estimate
    "bigFiveTraits": [
      {
        "trait": "string", // One of: Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism
        "level": "High" | "Medium-High" | "Medium" | "Medium-Low" | "Low",
        "evidence": "string" // Specific behavioral evidence from the transcript
      }
    ], // Must include all 5 traits
    "communicationStyle": "string", // e.g. "Direct and structured"
    "workStylePreferences": ["string", ...], // e.g. "Independent deep work"
    "motivators": ["string", ...], // What drives this person
    "potentialChallenges": ["string", ...], // Personality-based workplace challenges
    "teamDynamicsAdvice": "string", // Team fit and management recommendations
    "summary": "string" // 2-3 sentence overall personality characterization
  }
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

### Personality Assessment (性格测试)
As an experienced recruiter, personality expert, and psychologist, infer the candidate's personality profile from HOW they communicate — not just WHAT they say. Be objective and evidence-based.

**MBTI Estimation:**
- Analyze I vs E: response style, social energy, processing approach
- Analyze S vs N: concrete details vs abstract concepts
- Analyze T vs F: logic-based vs values-based reasoning
- Analyze J vs P: structured vs flexible answers

**Big Five (OCEAN) — assess all 5 traits:**
- Openness: curiosity, creativity, willingness to explore
- Conscientiousness: organization, thoroughness, reliability
- Extraversion: enthusiasm, talkativeness, social energy
- Agreeableness: cooperation, empathy, team orientation
- Neuroticism: stress handling, emotional stability

**Rules:** Base on observable evidence from transcript. Be honest and objective. State confidence level honestly. Focus on workplace-relevant traits.

## SCORING GUIDELINES (0-100)

The overall score MUST factor in the quality of candidate responses, not just claimed experience:

### Score Penalties (减分项)
- **Response Quality = Low**: Deduct 15-25 points. Generic or evasive answers indicate lack of real expertise.
- **Many "Claimed but Unverified" skills**: Deduct 5-10 points per critical unverified skill. Claims without proof are unreliable.
- **Vague/Superficial answers to core JD requirements**: Deduct 10-20 points. Candidate may not truly meet requirements.
- **Contradictions or inconsistencies**: Deduct 10-15 points. Raises credibility concerns.
- **Unable to provide specific examples**: Deduct 5-10 points per key area. Experience may be exaggerated.

### Score Bonuses (加分项)
- **Response Quality = High**: Add 5-10 points. Demonstrates genuine expertise and communication skills.
- **Many "Proven Skills" with evidence**: Add 5-10 points. Verified competency is more valuable.
- **Specific metrics and outcomes mentioned**: Add 5-10 points. Shows impact awareness.
- **Demonstrates depth beyond surface level**: Add 5-10 points. True expert vs. superficial knowledge.

### Score Thresholds
- **85-100**: Strong Hire - Proven expertise, high-quality responses, meets all requirements with evidence
- **70-84**: Hire - Good match with mostly proven skills, some areas may need verification
- **50-69**: Weak Hire - Mixed signals, many unverified claims, or significant gaps
- **0-49**: No Hire - Major gaps, low response quality, or failed mandatory requirements

### Important Scoring Rules
1. A candidate with many "claimed but unverified" skills should NOT score above 75 unless they have strong proof elsewhere.
2. A candidate with "Low" response quality should NOT be rated as "Strong Hire" regardless of claimed experience.
3. The score should reflect what was DEMONSTRATED in the interview, not what is claimed on resume.

## CRITICAL LANGUAGE REQUIREMENT
The entire report content (summary, strengths, weaknesses, technicalAnalysis, jdMatch, behavioralAnalysis, interviewersKit, personalityAssessment, recommendation) MUST be written in **${outputLanguage}**.
Do NOT translate the output to any other language. If the user selected Chinese, output MUST be in Chinese. Do NOT output in English unless explicitly selected.
`;

    const userPrompt = `
## JOB DESCRIPTION

**Position:** ${jobTitle}

**Overview:**
${jobDescription}

**Requirements/Qualifications:**
${jobRequirements}

---

## INTERVIEW TRANSCRIPT

${transcript}

---

Please provide a comprehensive evaluation including Technical Analysis, JD Match, Behavioral Analysis, Interviewer's Kit, and Personality Assessment (性格测试) as defined in the system prompt.
`;

    try {
      const content = await llmService.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        {
          temperature: 0.5,
          requestId,
        },
      );

      if (!content || content.trim().length === 0) {
        logger.warn('GOHIRE_EVAL', 'Empty response from LLM', undefined, requestId);
        return createFallbackEvaluationReport(language, jobTitle, 'Empty LLM response');
      }

      let result: EvaluationReport;
      try {
        result = JSON.parse(content) as EvaluationReport;
      } catch {
        const extracted = extractJsonObjectFromText(content);
        if (!extracted) {
          logger.warn('GOHIRE_EVAL', 'Failed to parse model JSON output', {
            contentPreview: content.substring(0, 200),
          }, requestId);
          return createFallbackEvaluationReport(language, jobTitle, 'Model output is not valid JSON');
        }
        try {
          result = JSON.parse(extracted) as EvaluationReport;
        } catch {
          logger.warn('GOHIRE_EVAL', 'Failed to parse extracted JSON', {
            contentPreview: extracted.substring(0, 200),
          }, requestId);
          return createFallbackEvaluationReport(language, jobTitle, 'Extracted model output is not valid JSON');
        }
      }

      // Ensure required fields exist (fallback for LLM glitches)
      if (!result.skillsAssessment) result.skillsAssessment = [];
      if (!result.technicalAnalysis) {
        result.technicalAnalysis = { summary: 'Analysis failed', depthRating: 'Intermediate', details: [] };
      }
      if (!result.jdMatch) {
        result.jdMatch = { requirements: [], extraSkillsFound: [], summary: 'Analysis failed' };
      }
      if (!result.behavioralAnalysis) {
        result.behavioralAnalysis = { summary: 'Analysis failed', compatibility: 'Medium', details: [] };
      }
      if (!result.interviewersKit) {
        result.interviewersKit = { suggestedQuestions: [], focusAreas: [] };
      }
      if (!result.levelAssessment) result.levelAssessment = 'Intermediate';
      if (!result.expertAdvice) result.expertAdvice = '';
      if (!result.suitableWorkTypes) result.suitableWorkTypes = [];
      if (!result.questionAnswerAssessment) result.questionAnswerAssessment = [];

      logger.info('GOHIRE_EVAL', `Evaluation generated — score=${result.score}, decision=${result.hiringDecision}`, {
        score: result.score,
        hiringDecision: result.hiringDecision,
      }, requestId);

      return result;
    } catch (error) {
      logger.error('GOHIRE_EVAL', 'LLM generation error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, requestId);
      return createFallbackEvaluationReport(
        language,
        jobTitle,
        error instanceof Error ? error.message : 'Unknown LLM error',
      );
    }
  }

  // -----------------------------------------------------------------------
  // detectCheating
  // -----------------------------------------------------------------------

  async detectCheating(params: CheatingDetectionParams): Promise<CheatingAnalysis> {
    const {
      transcript,
      language = 'zh-CN',
      requestId,
    } = params;

    const outputLanguage = getOutputLanguage(language);

    if (!transcript || transcript.trim().length === 0) {
      return getDefaultCheatingAnalysis(language);
    }

    logger.info('GOHIRE_EVAL', 'Running cheating detection analysis', {
      transcriptLength: transcript.length,
    }, requestId);

    const systemPrompt = `You are an expert interview integrity analyst specializing in detecting AI-assisted responses.
Your task is to analyze a candidate's interview responses for signs that they may be using LLM (like ChatGPT) to generate answers during the interview.

## Analysis Categories

### 1. LLM Fingerprints (High Priority)
- Phrases commonly used by AI: "It's important to note...", "In summary...", "There are several key aspects...", "Let me break this down..."
- Disclaimer-like language or excessive hedging
- Overly balanced "on one hand... on the other hand" structures
- Perfect enumeration ("First... Second... Third...") in spoken conversation
- Unnaturally comprehensive answers covering all possible angles

### 2. Unnatural Response Patterns
- Written-style language in a spoken interview (bullet points, numbered lists)
- Perfect grammar and sentence structure throughout (unrealistic for live speech)
- Sudden vocabulary level jumps (simple casual → complex technical language)
- Responses that sound "read" rather than "thought through"
- Consistent response length regardless of question complexity

### 3. Content Red Flags
- Generic/template-like answers lacking personal experience
- Absence of natural speech patterns (filler words, self-corrections, pauses)
- Technical explanations that are too textbook-perfect
- Answers that perfectly mirror common online/AI-generated content
- Lack of specific examples, anecdotes, or personal stories

### 4. Authenticity Signals (Positive indicators - genuine responses)
- Natural speech patterns (self-corrections, "um", "let me think")
- Personal anecdotes with specific details
- Emotional expressions and personality
- Logical follow-up on previous answers
- Admitting uncertainty or knowledge gaps naturally
- Asking clarifying questions

## Output Format
Return a JSON object with this structure:
{
  "suspicionScore": number,  // 0-100 (0=definitely genuine, 100=definitely AI-assisted)
  "riskLevel": "Low" | "Medium" | "High" | "Critical",
  "summary": "string",  // 2-3 sentence assessment
  "indicators": [
    {
      "type": "string",  // Category name
      "description": "string",  // What was detected
      "severity": "Low" | "Medium" | "High",
      "evidence": "string"  // Direct quote or example
    }
  ],
  "authenticitySignals": ["string", ...],  // List of genuine behavior signs found
  "recommendation": "string"  // Action recommendation
}

## Scoring Guidelines
- 0-25: Low risk - Natural, authentic responses with clear human characteristics
- 26-50: Medium risk - Some concerning patterns but could be coincidental
- 51-75: High risk - Multiple strong indicators of AI assistance
- 76-100: Critical - Clear evidence of AI-generated responses

## Important Notes
- Be fair and balanced - some structured responses may just indicate good preparation
- Consider cultural differences in communication styles
- Focus on patterns across multiple responses, not isolated instances
- If insufficient data, return low suspicion with explanation

## CRITICAL LANGUAGE REQUIREMENT
ALL output text (summary, descriptions, evidence, recommendations) MUST be in **${outputLanguage}**.
Do NOT output in any other language.
`;

    const userPrompt = `Analyze the following candidate responses from an interview for signs of AI/LLM assistance:

## CANDIDATE RESPONSES
${transcript}

---

Please provide a comprehensive cheating detection analysis.`;

    try {
      const content = await llmService.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        {
          temperature: 0.3,
          requestId,
        },
      );

      if (!content || content.trim().length === 0) {
        return getDefaultCheatingAnalysis(language);
      }

      let parsed: CheatingAnalysis;
      try {
        parsed = JSON.parse(content) as CheatingAnalysis;
      } catch {
        const extracted = extractJsonObjectFromText(content);
        if (!extracted) {
          logger.warn('GOHIRE_EVAL', 'Failed to parse cheating analysis JSON', {
            contentPreview: content.substring(0, 200),
          }, requestId);
          return getDefaultCheatingAnalysis(language);
        }
        try {
          parsed = JSON.parse(extracted) as CheatingAnalysis;
        } catch {
          logger.warn('GOHIRE_EVAL', 'Failed to parse extracted cheating JSON', {
            contentPreview: extracted.substring(0, 200),
          }, requestId);
          return getDefaultCheatingAnalysis(language);
        }
      }

      // Validate and normalize
      const result: CheatingAnalysis = {
        suspicionScore: Math.min(100, Math.max(0, parsed.suspicionScore || 0)),
        riskLevel: validateRiskLevel(parsed.riskLevel),
        summary: parsed.summary || getDefaultCheatingAnalysis(language).summary,
        indicators: Array.isArray(parsed.indicators) ? parsed.indicators : [],
        authenticitySignals: Array.isArray(parsed.authenticitySignals) ? parsed.authenticitySignals : [],
        recommendation: parsed.recommendation || getDefaultCheatingAnalysis(language).recommendation,
      };

      logger.info('GOHIRE_EVAL', `Cheating analysis complete — riskLevel=${result.riskLevel}, score=${result.suspicionScore}`, {
        riskLevel: result.riskLevel,
        suspicionScore: result.suspicionScore,
      }, requestId);

      return result;
    } catch (error) {
      logger.error('GOHIRE_EVAL', 'Cheating detection error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, requestId);
      return getDefaultCheatingAnalysis(language);
    }
  }

  // -----------------------------------------------------------------------
  // evaluateInterview — high-level method combining both
  // -----------------------------------------------------------------------

  async evaluateInterview(params: EvaluationParams): Promise<EvaluateInterviewResult> {
    // Run evaluation and cheating detection in parallel
    const [evaluationData, cheatingAnalysis] = await Promise.all([
      this.generateEvaluation(params),
      this.detectCheating({
        transcript: params.transcript,
        language: params.language,
        requestId: params.requestId,
      }),
    ]);

    // Attach cheating analysis to the evaluation report
    evaluationData.cheatingAnalysis = cheatingAnalysis;

    // Derive verdict from hiringDecision
    const verdictMap: Record<string, string> = {
      'Strong Hire': 'Strong Hire',
      'Hire': 'Hire',
      'Weak Hire': 'Weak Hire',
      'No Hire': 'No Hire',
    };

    return {
      evaluationData,
      evaluationScore: evaluationData.score,
      evaluationVerdict: verdictMap[evaluationData.hiringDecision] || evaluationData.hiringDecision,
    };
  }
}

// Singleton export
export const goHireEvaluationService = new GoHireEvaluationService();
