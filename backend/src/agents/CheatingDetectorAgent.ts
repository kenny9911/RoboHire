import { BaseAgent } from './BaseAgent.js';
import { CheatingAnalysis } from '../types/index.js';

interface CheatingDetectionInput {
  interviewScript: string;
}

/**
 * Agent for detecting potential AI/LLM-assisted responses in interview transcripts
 * Analyzes candidate responses for signs of cheating using LLM-generated answers
 */
export class CheatingDetectorAgent extends BaseAgent<CheatingDetectionInput, CheatingAnalysis> {
  constructor() {
    super('CheatingDetectorAgent');
  }

  protected getAgentPrompt(): string {
    return `You are an expert interview integrity analyst specializing in detecting AI-assisted responses.
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
\`\`\`json
{
  "suspicionScore": <number 0-100>,
  "riskLevel": "<Low | Medium | High | Critical>",
  "summary": "<2-3 sentence assessment>",
  "indicators": [
    {
      "type": "<category name>",
      "description": "<what was detected>",
      "severity": "<Low | Medium | High>",
      "evidence": "<direct quote or example>"
    }
  ],
  "authenticitySignals": ["<list of genuine behavior signs found>"],
  "recommendation": "<action recommendation>"
}
\`\`\`

## Scoring Guidelines
- 0-25: Low risk - Natural, authentic responses with clear human characteristics
- 26-50: Medium risk - Some concerning patterns but could be coincidental
- 51-75: High risk - Multiple strong indicators of AI assistance
- 76-100: Critical - Clear evidence of AI-generated responses

## Important Notes
- Be fair and balanced - some structured responses may just indicate good preparation
- Consider cultural differences in communication styles
- Focus on patterns across multiple responses, not isolated instances
- If insufficient data, return low suspicion with explanation`;
  }

  protected formatInput(input: CheatingDetectionInput): string {
    // Extract candidate responses from the transcript
    // The transcript may contain speaker labels or be a raw conversation
    return `Analyze the following interview transcript for signs of AI/LLM assistance:

## INTERVIEW TRANSCRIPT
${input.interviewScript}

---

Please provide a comprehensive cheating detection analysis focusing on the candidate's responses.`;
  }

  protected parseOutput(response: string): CheatingAnalysis {
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
      // Return a default low-risk analysis if parsing fails
      return this.getDefaultAnalysis();
    }
  }

  /**
   * Normalize and validate the parsed result
   */
  private normalizeResult(parsed: Partial<CheatingAnalysis>): CheatingAnalysis {
    return {
      suspicionScore: Math.min(100, Math.max(0, parsed.suspicionScore || 0)),
      riskLevel: this.validateRiskLevel(parsed.riskLevel),
      summary: parsed.summary || 'Unable to perform comprehensive analysis.',
      indicators: Array.isArray(parsed.indicators) ? parsed.indicators : [],
      authenticitySignals: Array.isArray(parsed.authenticitySignals) ? parsed.authenticitySignals : [],
      recommendation: parsed.recommendation || 'Continue with standard evaluation process.',
    };
  }

  /**
   * Validate risk level value
   */
  private validateRiskLevel(level: string | undefined): 'Low' | 'Medium' | 'High' | 'Critical' {
    const validLevels = ['Low', 'Medium', 'High', 'Critical'];
    return validLevels.includes(level || '') ? (level as 'Low' | 'Medium' | 'High' | 'Critical') : 'Low';
  }

  /**
   * Get default analysis when parsing fails or insufficient data
   */
  private getDefaultAnalysis(): CheatingAnalysis {
    return {
      suspicionScore: 0,
      riskLevel: 'Low',
      summary: 'Unable to perform cheating analysis due to insufficient data or processing error.',
      indicators: [],
      authenticitySignals: [],
      recommendation: 'Proceed with standard evaluation. Consider additional verification if concerns arise.',
    };
  }

  /**
   * Analyze interview transcript for potential cheating
   */
  async analyze(interviewScript: string, jdContent?: string, requestId?: string): Promise<CheatingAnalysis> {
    return this.executeWithJsonResponse({ interviewScript }, jdContent, requestId);
  }
}

export const cheatingDetectorAgent = new CheatingDetectorAgent();
