# BaseAgent Architecture

> The foundation of all AI capabilities in RoboHire.

---

## Overview

`BaseAgent<TInput, TOutput>` is an abstract generic class that provides the standard execution pipeline for every LLM-powered feature in RoboHire. It handles prompt construction, language detection, LLM routing, response parsing, logging, and error handling — so that each agent subclass only needs to define **what** it does, not **how** to talk to an LLM.

**Location**: `backend/src/agents/BaseAgent.ts` (210 lines)

---

## Class Signature

```typescript
abstract class BaseAgent<TInput, TOutput> {
  protected llm: LLMService;          // Multi-provider LLM client
  protected language: LanguageService; // Language detection
  protected name: string;              // Agent name (for logging)

  constructor(name: string);

  // ── Subclass must implement ──
  protected abstract getAgentPrompt(): string;
  protected abstract formatInput(input: TInput): string;
  protected abstract parseOutput(response: string): TOutput;

  // ── Subclass may override ──
  protected getTemperature(): number; // Default: 0.7

  // ── Execution methods ──
  async execute(input, jdContent?, requestId?, locale?, model?, signal?, provider?): Promise<TOutput>;
  async executeWithJsonResponse(input, jdContent?, requestId?, model?): Promise<TOutput>;
}
```

---

## The Three Methods Every Agent Must Implement

### 1. `getAgentPrompt(): string`

Returns the system prompt that defines the agent's behavior, expertise, and output format.

```typescript
// Example: ResumeMatchAgent
protected getAgentPrompt(): string {
  return `You are an expert HR analyst specializing in resume-to-JD matching...

  ## Analysis Framework:
  1. Extract and categorize all must-have requirements
  2. Evaluate candidate against each requirement
  3. Score skill alignment, experience depth, and potential
  ...

  Provide your analysis in JSON format:
  \`\`\`json
  { "overallMatchScore": { "score": 85, "grade": "A" }, ... }
  \`\`\``;
}
```

**Best practices:**
- Include detailed scoring rubrics and rules
- Specify exact JSON output schema with examples
- State constraints clearly (e.g., "internships do NOT count toward full-time years")
- Keep the prompt in TypeScript (co-located with logic, type-checked, IDE-supported)

### 2. `formatInput(input: TInput): string`

Transforms typed input into a formatted user message string.

```typescript
// Example: ResumeMatchAgent
protected formatInput(input: MatchResumeRequest): string {
  let text = `## Resume:\n${input.resume}\n\n## Job Description:\n${input.jd}`;
  if (input.candidatePreferences) {
    text += `\n\n## Candidate Preferences:\n${input.candidatePreferences}`;
  }
  text += '\n\nPlease analyze the match between this resume and job description.';
  return text;
}
```

### 3. `parseOutput(response: string): TOutput`

Parses the raw LLM string response into a typed object. **Must never throw** — always provide a safe fallback.

```typescript
// Example: ResumeMatchAgent
protected parseOutput(response: string): MatchResult {
  // Try extracting JSON from ```json...``` blocks
  const jsonMatch = response.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[1]) as MatchResult; } catch {}
  }

  // Try raw JSON object
  const rawMatch = response.match(/\{[\s\S]*\}/);
  if (rawMatch) {
    try { return JSON.parse(rawMatch[0]) as MatchResult; } catch {}
  }

  // Safe fallback — never throw
  return {
    overallMatchScore: { score: 0, grade: 'F' },
    overallFit: { verdict: 'Unable to analyze', hiringRecommendation: 'Do Not Recommend' },
    // ... all fields with default values
  };
}
```

---

## Optional Override: `getTemperature()`

Controls LLM output determinism. Default is `0.7` (creative/varied).

| Temperature | Use Case | Agents |
|---|---|---|
| `0.1` | Scoring, matching, evaluation — must be consistent | ResumeMatchAgent, SkillMatchSkill, ExperienceMatchSkill, PreferenceMatchSkill |
| `0.7` | Creative text, JD writing, strategy — variety is desired | CreateJDAgent, RecruitmentConsultant, SourcingStrategy, MarketIntelligence |

```typescript
protected getTemperature(): number {
  return 0.1; // Deterministic scoring
}
```

---

## Execution Pipeline

### `execute()` — Standard Execution

```
Input (TInput)
    │
    ▼
buildSystemPrompt(jdContent, requestId, locale)
    │
    ├── locale provided? → getLanguageInstructionFromLocale(locale)
    ├── jdContent provided? → detectLanguage(jdContent) → getLanguageInstruction()
    └── neither? → use raw getAgentPrompt()
    │
    ▼
formatInput(input) → user message string
    │
    ▼
messages = [
  { role: 'system', content: systemPrompt },
  { role: 'user', content: userMessage }
]
    │
    ▼
llmService.chat(messages, { temperature, requestId, model?, signal?, provider? })
    │
    ▼
parseOutput(response) → TOutput
    │
    ▼
Return TOutput
```

### Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `input` | `TInput` | Yes | Typed input for this agent |
| `jdContent` | `string` | No | JD text for automatic language detection |
| `requestId` | `string` | No | Request ID for logging/tracing |
| `locale` | `string` | No | User locale override (e.g., `'zh'`, `'ja'`, `'fr'`) — takes priority over auto-detection |
| `model` | `string` | No | LLM model override (e.g., `'google/gemini-3.1-pro-preview'`) |
| `signal` | `AbortSignal` | No | Abort signal for cancellation |
| `provider` | `string` | No | LLM provider override (e.g., `'openrouter'`) |

### `executeWithJsonResponse()` — JSON-Optimized

Same pipeline as `execute()` but designed for JSON output. Uses `chat()` + `parseOutput()` (not `chatWithJsonResponse()`) so the agent's fallback logic always applies.

---

## LLM Multi-Provider Support

BaseAgent uses `LLMService` which routes to the configured provider:

```
LLM_PROVIDER=openrouter      → OpenRouterProvider
LLM_PROVIDER=openai          → OpenAIProvider
LLM_PROVIDER=google          → GoogleProvider
LLM_PROVIDER=kimi            → KimiProvider
```

**Model override hierarchy** (highest priority first):
1. `model` parameter passed to `execute()`
2. Agent-specific env var (e.g., `LLM_MATCH_RESUME` for matching)
3. `LLM_MODEL` env var (global default)

Example `.env`:
```bash
LLM_PROVIDER=openrouter
LLM_MODEL=google/gemini-3-flash-preview          # Default for all agents
LLM_MATCH_RESUME=google/gemini-3.1-pro-preview   # Override for matching only
```

---

## Language Detection

BaseAgent automatically handles multi-language responses:

**Priority order:**
1. **Explicit locale** (`locale` parameter) — e.g., user's UI language is Chinese
2. **Auto-detection** from JD content — detects Chinese, Japanese, Spanish, etc.
3. **No detection** — prompt used as-is (defaults to English)

Detected language is prepended as an instruction:
```
Please respond in 简体中文 (Simplified Chinese).

[Original agent prompt follows...]
```

**Supported languages**: English, Chinese (Simplified/Traditional), Japanese, Spanish, French, Portuguese, German.

---

## Logging & Observability

Every execution is automatically logged:

```
┌─ logger.logAgentStart(requestId, agentName, metadata)
│
├─ logger.startStep(requestId, "AgentName: Execute")
│
├─ logger.debug("AGENT", "Prepared messages", { lengths, model })
│
├─ llmService.chat() → automatically logs via logger.logLLMCall()
│     └─ tokens, cost, duration, model, provider
│
├─ logger.debug("AGENT", "Parsing response", { responseLength })
│
├─ logger.logAgentEnd(requestId, agentName, success, outputSize)
│
└─ logger.endStep(requestId, stepNum, "completed" | "failed")
```

**Persisted to database** via `requestAudit` middleware:
- `ApiRequestLog` — per-request aggregate (total tokens, cost, duration)
- `LLMCallLog` — per-LLM-call detail (model, provider, prompt/completion tokens)

---

## All Agent Subclasses (20)

### Core Agents

| Agent | Input | Output | Temp | Purpose |
|---|---|---|---|---|
| `ResumeMatchAgent` | resume + JD | MatchResult (30+ fields) | 0.1 | Full resume-to-JD matching with scoring |
| `EvaluationAgent` | transcript + JD | InterviewEvaluation | 0.7 | Post-interview evaluation with personality assessment |
| `ResumeParseAgent` | resume text | ParsedResume | 0.7 | Extract structured data from resumes |
| `JDParseAgent` | JD text | ParsedJD | 0.7 | Extract structured data from job descriptions |
| `CheatingDetectorAgent` | transcript | CheatingAnalysis | 0.7 | Detect AI-assisted answers in interviews |
| `ScreeningAgent` | resume batch + JD | ScreeningResult | 0.7 | Fast pre-screening for batch operations |
| `PreMatchFilterAgent` | resume + criteria | PreMatchFilterOutput | 0.7 | Pre-filter before full matching |

### Content Generation Agents

| Agent | Purpose |
|---|---|
| `JobContentAgent` | Generate job posting content |
| `JDFormatAgent` | Format JD into structured sections |
| `ResumeFormatAgent` | Format resume into standardized markdown |
| `ResumeInsightAgent` | Generate AI insights about a candidate |
| `InterviewPromptAgent` | Generate interview questions |

### Intelligence Agents

| Agent | Purpose |
|---|---|
| `JobFitAgent` | Quick job-fit assessment |
| `CandidateProfileAgent` | Build candidate intelligence profile |
| `MarketIntelligenceAgent` | Analyze market salary/demand data |
| `SourcingStrategyAgent` | Recommend candidate sourcing strategies |

### Decomposed Skills (Composable)

| Skill | Temp | Purpose |
|---|---|---|
| `SkillMatchSkill` | 0.1 | Isolated skill alignment analysis |
| `ExperienceMatchSkill` | 0.1 | Isolated experience validation |
| `PreferenceMatchSkill` | 0.1 | Isolated preference alignment |
| `BatchScreenSkill` | 0.7 | Batch resume screening (low-cost pre-filter) |

Skills in `agents/skills/` are composed by `MatchOrchestratorService` into a multi-stage pipeline for batch matching.

---

## Creating a New Agent

### Minimal Example

```typescript
import { BaseAgent } from './BaseAgent.js';

interface SummaryInput {
  text: string;
  maxLength?: number;
}

interface SummaryOutput {
  summary: string;
  keyPoints: string[];
}

export class SummaryAgent extends BaseAgent<SummaryInput, SummaryOutput> {
  constructor() {
    super('SummaryAgent');
  }

  protected getAgentPrompt(): string {
    return `You are an expert summarizer. Given text, produce a concise summary
and extract key points. Return JSON: { "summary": "...", "keyPoints": ["..."] }`;
  }

  protected formatInput(input: SummaryInput): string {
    const maxNote = input.maxLength ? `\nMax length: ${input.maxLength} words.` : '';
    return `Summarize this text:${maxNote}\n\n${input.text}`;
  }

  protected parseOutput(response: string): SummaryOutput {
    try {
      const match = response.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    } catch {}
    return { summary: 'Unable to summarize', keyPoints: [] };
  }
}
```

### Usage

```typescript
const agent = new SummaryAgent();

// Basic execution
const result = await agent.execute(
  { text: 'Long document...' },
);

// With all options
const result = await agent.execute(
  { text: 'Long document...', maxLength: 100 },
  undefined,                    // jdContent (not applicable)
  'req_abc123',                 // requestId for logging
  'zh',                         // locale — respond in Chinese
  'google/gemini-3.1-pro-preview',  // model override
);
```

### Checklist

- [ ] Extend `BaseAgent<TInput, TOutput>` with specific types
- [ ] Implement `getAgentPrompt()` — define behavior + output format
- [ ] Implement `formatInput()` — structure the user message
- [ ] Implement `parseOutput()` — extract typed output, **always provide fallback**
- [ ] Override `getTemperature()` if scoring/deterministic (use `0.1`)
- [ ] Add env var for model override if needed (e.g., `LLM_MY_AGENT`)
- [ ] Test with different providers/models to ensure prompt compatibility

---

## Composing Agents

For complex pipelines, compose multiple agents:

```typescript
// MatchOrchestratorService pattern
const screenResults = await batchScreenSkill.execute(batchInput);   // Fast pre-filter
const skillResults = await skillMatchSkill.execute(skillInput);      // Detailed skill match
const expResults = await experienceMatchSkill.execute(expInput);     // Experience validation
const prefResults = await preferenceMatchSkill.execute(prefInput);   // Preference alignment
const merged = mergeSkillResults(skillResults, expResults, prefResults); // Combine
```

For parallel execution, use concurrency-controlled Promise pools:

```typescript
const concurrency = parseInt(process.env.MATCH_CONCURRENCY || '5');
for (let i = 0; i < resumes.length; i += concurrency) {
  const batch = resumes.slice(i, i + concurrency);
  await Promise.allSettled(batch.map(r => matchAgent.execute(r)));
}
```

---

## Error Handling Philosophy

1. **`parseOutput()` never throws** — always returns a valid (possibly zeroed) output
2. **`execute()` throws on LLM failure** — caller decides how to handle
3. **Logging is automatic** — every execution logged with timing, tokens, cost
4. **AbortSignal supported** — long-running matches can be cancelled
