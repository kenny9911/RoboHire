# Agent Alex Orchestrator — PRD & Architecture

> **Version**: 1.0 | **Author**: RoboHire Engineering | **Date**: 2026-04-01
> **Status**: Design Complete, Implementation In Progress

---

## 1. Vision

Agent Alex evolves from a **requirements analysis assistant** into an **autonomous recruitment orchestrator**. Today, Alex helps you define what you're looking for. Tomorrow, Alex **finds the people** — running a fleet of specialized agents in parallel, each one screening a candidate against your requirements, reporting results in real-time.

The core product insight: **hiring managers don't want to "use a tool" — they want someone to handle it.** Agent Alex becomes that someone.

---

## 2. Problem Statement

### What exists today
1. User talks to Agent Alex → gets a structured hiring specification (Live Specification)
2. User manually goes to Smart Matching page → uploads resumes → runs matching → reviews results
3. Matching is disconnected from the conversational flow

### What should exist
1. User talks to Agent Alex → gets a structured hiring specification
2. User says "帮我从人才库匹配候选人" or "start matching"
3. **Alex autonomously**:
   - Creates a Search Agent task
   - Queries the talent pool
   - Runs parallel matching agents
   - Streams results back into the conversation
   - User sees candidates appearing in real-time
4. User can immediately take next steps: "邀请前3名面试" → Alex sends interview invitations

**The gap is the orchestration layer between conversation and action.**

---

## 3. User Flows

### Flow A: "Match from Talent Pool"

```
User: "帮我匹配候选人"
Alex: "好的！您希望从哪里匹配？
       1. RoboHire 人才库（目前有 XX 份简历）
       2. 上传新的简历"
User: "人才库"
Alex: [calls start_candidate_search function]
      "正在启动匹配引擎...
       📊 人才库共 150 份简历
       🔍 关键词预筛选中..."
      [search-started event]
      "通过预筛选：42 份简历进入 AI 深度匹配"
      [search-progress events streaming]
      "✅ 已完成 10/42 ... 20/42 ... 42/42"
      [search-result events with candidate cards]
      [search-completed event]
      "匹配完成！找到 8 位合格候选人：
       🏆 张明 — 92分 (A+) — 5年Python/ML经验
       🥈 李华 — 87分 (A)  — 4年全栈经验
       🥉 王芳 — 81分 (B+) — 3年数据工程经验
       ...
       要我帮您邀请面试吗？"
```

### Flow B: "Upload and Match"

```
User: "我有一批新简历要匹配"
Alex: "好的，请上传简历文件（支持PDF，可多选）"
User: [uploads 20 PDFs]
Alex: "收到 20 份简历，正在解析...
       解析完成，开始匹配..."
      [same matching flow as Flow A]
```

### Flow C: Intent Detection

Alex detects matching intent from natural language:
- "有没有匹配的候选人" → trigger search
- "帮我找人" → trigger search
- "开始筛选" → trigger search
- "show me candidates" → trigger search
- "run the search" → trigger search

---

## 4. Architecture

### 4.1 System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Agent Alex (Gemini)                    │
│                    ─── Orchestrator ───                   │
│                                                          │
│  Understands intent → Calls functions → Reports results  │
│                                                          │
│  Functions:                                              │
│    update_hiring_requirements  (existing)                 │
│    suggest_next_steps          (existing)                 │
│    start_candidate_search      (NEW)                     │
│    invite_candidates           (FUTURE)                  │
│    create_interview            (FUTURE)                  │
└──────────────────────┬──────────────────────────────────┘
                       │ function call
                       ▼
┌─────────────────────────────────────────────────────────┐
│              InstantSearchMatchService                    │
│              ─── Parallel Agent Runner ───                │
│                                                          │
│  1. Pre-filter: keyword/tag matching (fast, no LLM)     │
│  2. Parallel match: N × ResumeMatchAgent (LLM)          │
│  3. Rank & aggregate results                             │
│  4. Create Agent record + AgentCandidate records         │
│  5. Stream events back to chat                           │
└──────────────────────┬──────────────────────────────────┘
                       │ concurrent
                       ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│ Match  │ │ Match  │ │ Match  │ │ Match  │  ... × N
│Agent 1 │ │Agent 2 │ │Agent 3 │ │Agent N │
│        │ │        │ │        │ │        │
│Resume→ │ │Resume→ │ │Resume→ │ │Resume→ │
│ Score  │ │ Score  │ │ Score  │ │ Score  │
└────────┘ └────────┘ └────────┘ └────────┘
```

### 4.2 Parallel Agent Design

**Concurrency Model**: Promise pool with configurable concurrency limit.

```typescript
// NOT Promise.all (unbounded) — use controlled concurrency
async function runParallelMatching(
  resumes: Resume[],
  jd: string,
  concurrency: number = 5,
  onProgress: (result: MatchTaskResult) => void
): Promise<MatchTaskResult[]> {
  const results: MatchTaskResult[] = [];
  let completed = 0;

  // Process in batches of `concurrency`
  for (let i = 0; i < resumes.length; i += concurrency) {
    const batch = resumes.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(resume => matchSingleResume(resume, jd))
    );

    for (const result of batchResults) {
      completed++;
      const taskResult = result.status === 'fulfilled'
        ? result.value
        : { error: result.reason };
      results.push(taskResult);
      onProgress({ completed, total: resumes.length, result: taskResult });
    }
  }

  return results.sort((a, b) => (b.score || 0) - (a.score || 0));
}
```

**Why not fully parallel?**
- LLM API rate limits (tokens per minute)
- Cost control (each match = 1 LLM call ≈ $0.01-0.05)
- Memory pressure (large JSON responses)
- Configurable via `MATCH_CONCURRENCY` env var (default: 5)

**Why not sequential?**
- 100 resumes × 15s/match = 25 minutes sequential
- 100 resumes ÷ 5 concurrency × 15s = 5 minutes parallel
- **5x speedup** is the difference between usable and unusable

### 4.3 Pre-Filter Strategy (No LLM Cost)

Before expensive LLM matching, apply fast keyword pre-filtering:

```typescript
function preFilterResumes(
  resumes: Resume[],
  requirements: HiringRequirements
): { passed: Resume[]; excluded: { resume: Resume; reason: string }[] } {
  // Extract search signals from Live Specification
  const mustHaveSkills = requirements.hardSkills || [];
  const preferredSkills = requirements.preferredQualifications || [];
  const title = requirements.jobTitle || '';
  const minYears = parseExperienceYears(requirements.yearsOfExperience);

  // Score each resume on keyword presence (no LLM)
  return resumes.reduce((acc, resume) => {
    const text = (resume.resumeText + ' ' + (resume.tags || []).join(' ')).toLowerCase();

    // Must-have skill keyword check (at least 1 must match)
    const mustHaveHits = mustHaveSkills.filter(skill =>
      text.includes(skill.toLowerCase())
    );

    if (mustHaveSkills.length > 0 && mustHaveHits.length === 0) {
      acc.excluded.push({ resume, reason: `No must-have skill keywords found` });
      return acc;
    }

    acc.passed.push(resume);
    return acc;
  }, { passed: [], excluded: [] });
}
```

**Philosophy**: Pre-filter is intentionally **loose** — it only eliminates obvious non-matches. The LLM matching handles nuance (transferable skills, semantic similarity). Better to send a few extra resumes to LLM than miss a great candidate.

### 4.4 Deduplication

Each search creates an `Agent` record. The service checks existing `AgentCandidate` records for this agent to avoid re-matching resumes that were already processed. This matters when:
- User runs search again after uploading more resumes
- User refines requirements and re-searches
- Multiple sessions reference the same job

### 4.5 Event Streaming Design

Events flow through the existing NDJSON stream:

```
Backend                          Frontend
───────                          ────────
start_candidate_search called
  │
  ├─ search-started ─────────→  Show "🔍 Searching..." status
  │   { searchId, agentId,       Create progress bar
  │     totalResumes,
  │     filteredCount }
  │
  ├─ search-progress ────────→  Update progress bar
  │   { completed, total }       "Matching 15/42..."
  │   (every N completions)
  │
  ├─ search-result ──────────→  Add candidate card to chat
  │   { name, score, grade,      Only for score >= threshold
  │     resumeId, highlights }   Clickable link to resume
  │   (one per qualified match)
  │
  ├─ search-completed ───────→  Show summary card
  │   { totalMatched,            Score distribution
  │     totalScreened,           "8 qualified out of 42"
  │     agentId, topCandidates } Suggest next actions
  │
  └─ text-delta ─────────────→  Alex's commentary
      "Great news! I found..."   Natural language summary
```

**Key**: Results stream as they complete — user sees candidates appearing one by one, not waiting for all 42 to finish.

---

## 5. Data Model

### New: `taskType = 'instantSearchMatch'`

Uses existing `Agent` model with:
```
Agent {
  taskType: 'instantSearchMatch'
  name: auto-generated (e.g., "AI工程师匹配 - 2026-04-01 14:30")
  description: serialized search criteria
  jobId: linked job (if created from Live Spec)
  config: {
    searchCriteria: HiringRequirements,  // Live Specification snapshot
    preFilterStats: { total, passed, excluded },
    matchConfig: { concurrency, threshold, model }
  }
  status: 'active' → 'completed' | 'failed'
  totalSourced: count of resumes matched
  totalApproved: count above threshold
}
```

### AgentCandidate records

Each matched resume creates:
```
AgentCandidate {
  agentId: the search agent
  resumeId: linked resume
  name: candidate name
  matchScore: overall match score (0-100)
  status: 'pending'  // user hasn't acted yet
  notes: JSON string of { grade, verdict, topSkills, gaps }
}
```

---

## 6. Prompt Architecture & Management

### 6.1 Current State

All prompts are inline TypeScript strings in `getAgentPrompt()` methods. This works well for:
- Type safety (prompts are compile-checked)
- Co-location (prompt lives with the agent logic)
- Refactoring (rename/move tracked by TypeScript)

### 6.2 Flexible Prompt Refinement Strategy

For the orchestrator, we need a **layered prompt approach**:

```
Layer 1: Base System Instruction (SYSTEM_INSTRUCTION)
  └── Static. Defines Alex's persona, methodology, constraints.

Layer 2: Capability Instructions (appended per-feature)
  └── Dynamic. Added when features are enabled.
  └── e.g., "You can now search candidates by calling start_candidate_search..."

Layer 3: Context Instructions (per-request)
  └── Dynamic. Based on current session state.
  └── e.g., "The user has a Live Specification with jobTitle='AI Engineer'..."

Layer 4: Locale Instructions (per-user)
  └── Dynamic. Language preference.
  └── e.g., "Respond in 简体中文..."
```

**Why not external prompt files?**
- Adds indirection without clear benefit at this scale
- TypeScript co-location gives IDE support, type checking, and refactoring
- Version control via git is already excellent
- The complexity is in the **logic**, not the prompt text

**When to externalize**: If we reach 50+ prompts or need A/B testing, consider a `prompts/` directory with `.txt` files loaded at startup.

### 6.3 Function Declaration as Prompt

A key insight: **Gemini function declarations ARE prompts**. The `description` field in each function declaration teaches the model when and how to call it. This is the most powerful lever for controlling agent behavior.

```typescript
// BAD: vague description
{ description: "Search for candidates" }

// GOOD: behavioral instruction
{ description: "When the user expresses intent to find, match, or screen
  candidates (e.g., '帮我匹配', '找候选人', 'start matching'), call this
  function. First ask which pool: RoboHire talent pool or upload new resumes.
  Include the current hiring requirements as searchCriteria." }
```

---

## 7. Claude SKILL Design

### Purpose

A Claude SKILL (`.claude/skills/`) teaches Claude Code how to work with the agent orchestration system. It's not runtime code — it's **developer documentation that Claude Code reads** when extending the system.

### Skill: `agent-orchestrator`

Location: `.claude/skills/agent-orchestrator/SKILL.md`

Contents:
- How to add new agent types (function declaration → handler → service → events)
- How to add new Gemini function calls
- How the streaming event system works
- How to create parallel agent runners
- Prompt layering architecture
- Testing patterns

This SKILL makes it trivial for future Claude Code sessions to add new agent capabilities (e.g., `invite_candidates`, `schedule_interviews`, `generate_outreach`).

---

## 8. Scoring & Threshold

### Match Quality Tiers

| Tier | Score | Grade | Action |
|---|---|---|---|
| Top Match | 80-100 | A+/A | Auto-surface in results |
| Strong Match | 65-79 | B+/B | Surface with note |
| Moderate Match | 50-64 | C+/C | Include if pool is small |
| Weak Match | 25-49 | D | Exclude by default |
| Not Qualified | 0-24 | F | Never show |

**Default threshold**: 50 (configurable). Only candidates scoring ≥ threshold appear in search results.

### Result Ordering

1. Sort by `overallMatchScore.score` descending
2. Break ties by `skillMatchScore.score`
3. Break further ties by `experienceValidation.score`

---

## 9. Cost & Performance

### Per-Search Cost Estimate

| Step | Cost | Time |
|---|---|---|
| Pre-filter 200 resumes | $0 | < 1s |
| Match 50 passed resumes (5 concurrent) | ~$2.50 | ~2.5 min |
| Total | ~$2.50 | ~2.5 min |

### Optimization Levers

1. **Pre-filter aggressiveness**: Stricter keywords = fewer LLM calls = faster + cheaper
2. **Concurrency**: Higher = faster but risks rate limits
3. **Model selection**: Use cheaper model for screening, expensive for full match
4. **Caching**: If resume was matched against same JD before, reuse result
5. **Batch screening**: Use `batchScreenSkill` for initial tier assignment before full match

---

## 10. Future Agent Types

The orchestrator pattern is designed to be extensible:

| Agent Type | Trigger | Action |
|---|---|---|
| `instantSearchMatch` | "帮我匹配候选人" | **Phase 1** — parallel resume matching |
| `outreachAgent` | "联系候选人" | Generate personalized outreach emails |
| `interviewScheduler` | "安排面试" | Create AI interview invitations |
| `marketIntelligence` | "这个岗位市场行情" | Analyze market salary/demand data |
| `jdOptimizer` | "优化JD" | Improve job description for attraction |
| `pipelineManager` | "候选人进展" | Track and report hiring pipeline status |

Each new type follows the same pattern:
1. Add Gemini function declaration
2. Create backend service
3. Add streaming events
4. Add frontend rendering
5. Document in Claude SKILL

---

## 11. Security & Access Control

- Search only queries resumes the user has access to (team visibility scope)
- Agent records belong to the creating user
- AgentCandidate records inherit agent's access control
- Resume links respect the same visibility rules
- No cross-tenant data leakage

---

## 12. Success Metrics

| Metric | Target |
|---|---|
| Time from "帮我匹配" to first result | < 30 seconds |
| Total search completion (50 resumes) | < 3 minutes |
| User satisfaction (continues to next step) | > 60% |
| False negative rate (good candidates missed by pre-filter) | < 5% |
| Cost per search | < $5 |
