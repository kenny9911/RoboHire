# Agent Alex — Architecture & Prompt Engineering Analysis

**Date**: 2026-04-09
**Purpose**: Deep review for redesign toward a world-class AI recruitment consultant

---

## Current Architecture

### Stack
- **LLM**: Google Gemini (via `@google/genai` SDK)
- **Function Calling**: 3 tools — `update_hiring_requirements`, `suggest_next_steps`, `start_candidate_search`
- **Streaming**: NDJSON server-sent events for real-time UI updates
- **Session Persistence**: PostgreSQL via Prisma (`AgentAlexSession` model)
- **Frontend**: React split-panel — chat left, live specification right

### Conversation Flow
1. User sends message → frontend builds history + detects locale
2. POST `/api/v1/agent-alex/chat/stream` → backend appends locale instruction to system prompt
3. Gemini processes with function calling loop (may call tools multiple times per turn)
4. Events streamed back: `text-delta`, `requirements-update`, `suggestions`, `search-*`
5. Frontend updates chat, spec panel, and suggestion chips in real-time

### Tools
| Tool | Purpose | When Called |
|------|---------|------------|
| `update_hiring_requirements` | Updates 25-field spec document | Whenever new info gathered |
| `suggest_next_steps` | Provides 2-3 quick-reply chips | After EVERY response (required) |
| `start_candidate_search` | Searches talent pool | When user wants to find candidates |

### Language Handling
- Locale detected from: `document.documentElement.lang` → `localStorage i18nextLng` → `navigator.language` → `"en"`
- Dynamic injection: appends "Language Requirement (CRITICAL)" paragraph to system prompt
- Forces model to write everything in that language, keeping English for technical terms

---

## Prompt Critique — What's Wrong Today

### 1. Tone is Procedural, Not Human

The prompt defines an "Interaction Protocol" with numbered steps (Role identification → Requirement hypothesis → Guided inquiry → ...). This creates a rigid, form-filling experience:

> "Ask questions in thematic clusters of 2–3 per turn (never more than 4). Briefly acknowledge what you learned."

**Real recruiter behavior**: A good recruiter doesn't follow a checklist — they read the room, match energy, and weave questions naturally into conversation. They tell stories, share market insights, and sometimes challenge the hiring manager.

**Example of current stiff output** (typical Gemini response):
> "好的，我了解了，您需要一名 AI 应用开发工程师。接下来我想了解几个方面：
> 1. 这个岗位的核心职责有哪些？
> 2. 对候选人的技术栈有什么具体要求？
> 3. 薪资预算范围是多少？"

**What a great recruiter would say**:
> "AI 应用开发工程师——这个方向现在确实很火。不过这个头衔覆盖面挺广的，从做 RAG 的到搞 Agent 的都有。您这边具体是什么业务场景在用？是做内部工具还是面向客户的产品？这样我能帮您精准定位需要什么样的人。"

### 2. Language Injection is Blunt

Current approach: "You MUST write ALL responses in 简体中文"

This produces **translationese** — Chinese that reads like translated English. The model structures thoughts in English then translates, producing stiff, formal Chinese like:

- "请问您对候选人的教育背景有什么要求？" (too formal)
- vs natural: "学历这块儿您有要求吗？名校还是普通本科都行？" (natural recruiter talk)

### 3. No Domain Knowledge Injection

The prompt says "draw on knowledge of market norms" but gives the model ZERO concrete data:
- No salary benchmark data for any market
- No industry trend context
- No common org structure patterns
- No interview process best practices
- No competitive landscape for talent

A human recruiter with 10 years of experience carries all of this in their head. The prompt expects Gemini to magically know it from pre-training.

### 4. No Proactive Challenging

The prompt never instructs the model to push back or advise. A great recruiter:
- "这个薪资在北京市场可能偏低了，同级别岗位普遍在30-50K。要不要调整一下？"
- "您列了12项必须技能——坦率说，同时满足这些条件的人非常少。我建议把其中3-4项挪到优先项。"
- "这个岗位描述看起来像是两个角色混在一起了——一个偏研发，一个偏工程化。拆成两个岗位可能更容易招到人。"

### 5. Hardcoded Chinese in System Prompt

Multiple Chinese strings baked into the English system prompt:
- "必要条件", "优先条件" in tool descriptions
- Suggestion examples: "开发客服 Agent 方向", "薪资预算 40-60 万"
- Search prompts: "从 RoboHire 人才库中搜索..."

This creates a bias toward Chinese even when the user is in English mode. The examples should be language-neutral or dynamically injected per locale.

### 6. Duplicate Text in System Prompt

Line 210 has a duplicated phrase: "...AND at autonomously finding matching candidates. You combine deep knowledge... — an expert at eliciting, structuring, and finalizing hiring requirements through conversational inquiry..."

This is copy-paste debris that wastes tokens and confuses the model.

---

## Questions for Kenny

Before I proceed with the redesign, I need clarity on:

### Architecture
1. **Gemini vs Claude**: Is switching the LLM from Gemini to Claude an option? The "Claude SKILL" mention suggests you're considering it. Claude Sonnet/Opus may produce more natural Chinese than Gemini.
2. **Multi-agent budget**: Running parallel agents costs more tokens. What's the acceptable latency and cost per conversation turn?
3. **"Claude SKILL"**: Do you mean the Claude Code skill system (for this development environment), or a general concept of specialized agent skills?

### Product Direction
4. **Primary user persona**: Is the typical user an HR recruiter (familiar with hiring jargon) or a hiring manager/founder (technical but not HR-savvy)?
5. **Primary market**: China-focused? Or truly international with equal priority on all 8 languages?
6. **Level of autonomy**: Should Alex proactively challenge unrealistic requirements and offer strong opinions? Or stay advisory/passive?
7. **Domain data**: Do you have access to salary benchmark data (e.g., from recruitment platforms) that we could inject as context? Or should Alex rely purely on LLM pre-training knowledge?

### Tone
8. **Formality spectrum**: Where should Alex sit? Casual friend ("哥们儿，这岗位...") → Professional peer ("这个岗位我建议...") → Formal consultant ("关于此岗位的建议如下...")
9. **Should Alex have a personality?** (e.g., occasionally uses humor, shares anecdotes, has opinions) or stay neutral?
