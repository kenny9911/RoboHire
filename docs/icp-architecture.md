# Ideal Candidate Profile (ICP) + Hard Requirements — Technical Architecture

**Status**: Architecture spec, pre-implementation
**Owner**: Kenny
**Last updated**: 2026-04-12
**Related**: [agents-redesign-spec.md](./agents-redesign-spec.md) · [agents-changelog.md](./agents-changelog.md) · [base-agent-architecture.md](./base-agent-architecture.md)
**Driving prompt**: `agents-redesign-prompts.md` → 2026-04-12 entry

---

## 0. Why this exists

The Agents Workbench currently scores resumes against a JD plus an optional list of fine-tuned criteria (`AgentCriterion[]`). The recruiter then triages results with Like / Dislike. Today **none of that triage feedback flows back into the next run**. The agent does the same keyword-flavored match every time, ignoring the strongest signal in the entire system: the human's preferences on real candidates it just produced.

This document specifies two new capabilities that close that loop:

1. **Ideal Candidate Profile (ICP)** — an LLM-generated structured profile that summarizes what the recruiter actually wants based on their like/dislike history. Stored per agent, regenerated on demand, and injected into every subsequent matching call as anchored exemplars and weighted signals.
2. **Hard Requirements (硬性条件)** — an explicit user-defined filter set (location, years, languages, etc.) that runs **before** LLM scoring as a cheap pre-filter. The ICP agent may also *suggest* hard requirements when it detects extreme patterns, but only the user can promote a suggestion into an enforced rule.

The two are deliberately separate: ICP is **inferred and probabilistic** (LLM weights, soft signals), hard requirements are **declared and deterministic** (DB filter, cheap, auditable).

### Design north star (carry-over from §1 of agents-redesign-spec)

> Every capability is usable by a human through the UI **and** by another agent through a stable API, with the same permissions and audit trail.

This means: the ICP regen endpoint, the hard-requirement update endpoint, and the preview-filter endpoint all live under `/api/v1/agents/:id/...` with normal `requireAuth` semantics. An OpenClaw-side agent can call them. A human in the workbench can call them. Both produce the same `AgentActivityLog` rows.

---

## 1. Data model

### 1.1 New table: `AgentIdealProfile`

```prisma
model AgentIdealProfile {
  id                    String   @id @default(cuid())
  agentId               String
  userId                String   // owner — denormalized for cheap visibility checks
  version               Int      @default(1)

  // Structured ICP — see §2 for the JSON schema
  profile               Json

  // LLM-suggested hard requirements awaiting user approval — see §3
  // These are SUGGESTIONS, NOT enforced. Enforced rules live on Agent.config.hardRequirements.
  suggestedHardRequirements Json?

  // 1-2 sentence human-readable digest shown in the UI header
  narrativeSummary      String?  @db.Text

  // 0..1 self-reported by the LLM, derived from sample size + signal consistency
  confidence            Float    @default(0)

  // Provenance — how many examples the model saw when synthesizing
  generatedFromLikes    Int      @default(0)
  generatedFromDislikes Int      @default(0)

  // Trace — full reasoning the LLM produced. Stored for debugging + audit only;
  // not shown in the default UI. Truncated to ~8 KB on insert.
  reasoningTrace        String?  @db.Text

  // Cost accounting — sum of one LLM call's tokens/cost, mirrors AgentRun shape
  tokensIn              Int      @default(0)
  tokensOut             Int      @default(0)
  costUsd               Float    @default(0)
  llmModel              String?
  llmProvider           String?

  generatedAt           DateTime @default(now())
  updatedAt             DateTime @updatedAt

  agent                 Agent    @relation(fields: [agentId], references: [id], onDelete: Cascade)
  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([agentId, version])
  @@index([agentId, version])
  @@index([userId])
}
```

#### Decision: keep all versions (audit trail)

**Recommendation: keep ALL versions**. Reasons:

1. ICP regeneration is a real action — recruiters will want to see how the agent's understanding evolved as they triaged more candidates. "Why is the agent suddenly flagging Java devs as a fit when last week it wasn't?" → diff the v3 ICP against v4.
2. Cost accounting is per-version — analytics need historical token/cost tracking.
3. Disk cost is trivial (one row per regen, JSON ~5-10 KB).
4. The "current" ICP is `MAX(version) WHERE agentId = ?`. A `getLatest()` helper handles the lookup.

The unique index `@@unique([agentId, version])` enforces monotonic versioning. Inserts compute `version = (SELECT COALESCE(MAX(version), 0) + 1 FROM agent_ideal_profiles WHERE agent_id = ?)` inside a transaction.

Soft-deleting an agent cascades to all ICP versions via `onDelete: Cascade`. A recruiter cannot manually delete a single version — that would defeat the audit purpose. They CAN regenerate (which creates a new version) or revert (which copies an old version forward as a new version).

#### Decision: hard requirements live on `Agent.config.hardRequirements`, not on the ICP

The user prompt asks for hard requirements in the agent creation modal, the criteria editor, and as a separate filter — that's a **user-controlled, declarative** field that belongs on the Agent itself. Putting it on the ICP would conflate two things:

- **Enforced**: `Agent.config.hardRequirements` — the user-declared filter set. Mutable via `PATCH /api/v1/agents/:id/hard-requirements`. Consulted on every run pre-filter.
- **Suggested**: `AgentIdealProfile.suggestedHardRequirements` — the LLM's proposed additions. Read-only artifact of a regen. The UI shows them as "Apply this rule?" toggles; clicking accept copies the rule into `Agent.config.hardRequirements` (and emits an audit event). The original suggestion stays on the ICP version forever.

This split means: the user can regenerate the ICP without losing their hand-tuned rules, the LLM can propose without the model silently overriding the user's policy, and rules survive ICP version rollbacks.

### 1.2 Modified: `Agent`

Add one nested key under the existing `config Json?` field. **No schema change required** — `config` is already a free-form JSON column.

```typescript
interface AgentConfig {
  // existing
  criteria?: AgentCriterion[];
  resumeIds?: string[];
  // new
  hardRequirements?: HardRequirement[];   // see §3
  icpSettings?: {
    autoRegenAfterTriageActions?: number; // suggest regen after N like/dislike events; 0 = manual only
    autoApply?: boolean;                   // default false — user must opt in to auto-apply
  };
}
```

Add one new relation on the Agent model so cascade deletes clean up ICP versions:

```prisma
model Agent {
  // ... existing fields ...
  idealProfiles AgentIdealProfile[]
}
```

### 1.3 New `User` relation (back-link)

```prisma
model User {
  // ... existing fields ...
  agentIdealProfiles AgentIdealProfile[]
}
```

### 1.4 Indexing strategy

- `@@unique([agentId, version])` — enforces monotonic versioning, also covers the "load latest" lookup since Postgres scans the unique index in reverse.
- `@@index([userId])` — supports admin analytics ("how many ICPs did user X generate this month").
- No index on `costUsd` — analytics can scan via `AgentRun.costUsd` for run-level cost; ICP is a small fraction.

---

## 2. ICP profile JSON shape

The shape is stored verbatim in `AgentIdealProfile.profile`. Both the LLM (as output schema) and the matcher (as input context) use this same structure, so it's the contract.

```typescript
interface IdealCandidateProfile {
  // ── Demographics / context ────────────────────────────────────────────────
  /** Years of FULL-TIME experience (excluding internships, per ResumeMatchAgent rules) */
  seniorityRange?: { min: number; ideal: number; max?: number; unit: 'years' };

  /** City/region names that disproportionately appear in liked candidates */
  preferredLocations?: string[];

  /** Industries (e.g. "fintech", "ecommerce") inferred from liked candidates' resumes */
  preferredIndustries?: string[];

  // ── Skills ─────────────────────────────────────────────────────────────────
  /** Skills present in liked candidates that the LLM thinks are essential */
  coreSkills: Array<{
    skill: string;
    importance: 'critical' | 'high' | 'medium';
    /** Why this skill — provenance for the user (e.g. "5 of 5 liked candidates") */
    rationale: string;
  }>;

  /** Skills that are nice to have — present in some likes, often optional */
  bonusSkills: string[];

  /** Skills disproportionately present in DISLIKED candidates → red flags
   *  (e.g., user disliked everyone with React Native; flag it as anti-skill) */
  antiSkills: string[];

  // ── Experience patterns ────────────────────────────────────────────────────
  preferredCompanySizes?: Array<'startup' | 'midsize' | 'enterprise'>;

  /** Free-text career trajectory pattern, e.g. "IC → tech lead → staff" */
  preferredRoleProgression?: string;

  /** Min/ideal/max are independent of seniorityRange — this is the LLM's
   *  recommendation, seniorityRange is the descriptive observation. */
  yearsOfExperience: { min: number; ideal: number; max?: number };

  // ── Cultural / soft signals ────────────────────────────────────────────────
  /** Free-form trait observations with weights and provenance */
  signals: Array<{
    trait: string;                          // e.g. "self-directed, ships fast"
    weight: number;                          // 0..1, how strong the pattern is
    source: 'liked' | 'disliked' | 'jd';    // where it came from
    evidence?: string;                       // 1-line citation from a resume
  }>;

  // ── Anchors — exemplar candidates the matcher should treat as ground truth ─
  /** AgentCandidate IDs of liked candidates the matcher cites as positive
   *  examples. The matcher receives summaries of these in its prompt. */
  anchorCandidateIds: string[];

  /** AgentCandidate IDs of disliked candidates the matcher avoids matching */
  antiAnchorCandidateIds: string[];

  // ── Meta ───────────────────────────────────────────────────────────────────
  /** ISO timestamp the profile was synthesized; mirrors AgentIdealProfile.generatedAt */
  generatedAt: string;
}
```

### Field-by-field rationale

| Field | Optional? | Why |
|---|---|---|
| `seniorityRange` | yes | Only set when likes/dislikes show a clear seniority pattern. Cold start: undefined. |
| `preferredLocations` | yes | Many roles are remote — don't fabricate location preferences. |
| `preferredIndustries` | yes | Same as above; only set when ≥2 liked candidates share an industry. |
| `coreSkills` | **required** | Every ICP should have at least one core skill; if the LLM can't find one, the regen returns confidence ≤ 0.3 and the user is warned. |
| `bonusSkills` | required (can be `[]`) | Empty array is fine. |
| `antiSkills` | required (can be `[]`) | The whole point of dislikes is to learn what to avoid. |
| `preferredCompanySizes` | yes | Often unclear from a small sample. |
| `preferredRoleProgression` | yes | Free text, hard to compute, only fill on strong signal. |
| `yearsOfExperience` | **required** | Every match needs a target band; LLM falls back to JD-derived numbers if no examples. |
| `signals` | required (can be `[]`) | Soft signals are the secret sauce — most ICPs should have ≥2. |
| `anchorCandidateIds` | required (can be `[]`) | Empty in cold start; fills as likes accumulate. |
| `antiAnchorCandidateIds` | required (can be `[]`) | Same. |

### Why `signals` is a separate field from `coreSkills`

Skills are concrete, machine-extractable, and live in a finite vocabulary. Signals are everything else: tone, trajectory, cultural fit, "ships fast", "writes design docs", "owns ambiguity". The matcher prompt treats them differently: skills become structured comparisons against the resume's parsed skill list; signals become natural-language guidance ("the recruiter values candidates who…").

---

## 3. Hard requirements JSON shape + operators

```typescript
interface HardRequirement {
  /** Local UUID — generated client-side, used for diffs and edits */
  id: string;

  field: HRField;
  operator: HROperator;
  value: unknown;

  /** Human-readable description shown in the UI list */
  description: string;

  /** Can be disabled without deleting (lets user A/B-test the impact) */
  enabled: boolean;

  /** Optional source attribution */
  source?: 'user' | 'icp_suggestion';
  /** If sourced from an ICP suggestion, which version */
  sourceIcpVersion?: number;

  createdAt: string;  // ISO
  updatedAt: string;  // ISO
}

type HRField =
  // numeric
  | 'experienceYears'
  | 'salaryExpectation'
  // string (single value)
  | 'location'
  | 'currentRole'
  | 'education.degree'
  | 'education.field'
  // string array (from parsed resume metadata)
  | 'languages'
  | 'skills.technical'
  | 'tags'
  // catch-all
  | 'custom';

type HROperator =
  // numeric
  | 'eq' | 'neq' | 'gte' | 'lte' | 'gt' | 'lt'
  // arrays
  | 'contains' | 'contains_any' | 'contains_all' | 'not_contains'
  // string regex
  | 'matches' | 'not_matches'
  // set membership
  | 'in' | 'not_in';
```

### Field × operator type matrix

Compile-time validation lives in `lib/hardRequirementSchema.ts` (new file). Runtime validation runs in the `PATCH /hard-requirements` route.

| Field | Allowed operators | Value type |
|---|---|---|
| `experienceYears` | `eq`, `neq`, `gte`, `lte`, `gt`, `lt` | `number` |
| `salaryExpectation` | `gte`, `lte`, `gt`, `lt` | `number` (annualized in CNY) |
| `location` | `eq`, `neq`, `in`, `not_in`, `matches` | `string` or `string[]` for `in`/`not_in` |
| `currentRole` | `eq`, `contains`, `not_contains`, `matches`, `not_matches` | `string` |
| `education.degree` | `eq`, `in`, `not_in`, `gte` (ordered by hierarchy) | `string` (`'PhD' \| 'Master' \| 'Bachelor' \| 'Associate' \| 'HighSchool'`) |
| `education.field` | `eq`, `in`, `contains`, `not_contains` | `string` |
| `languages` | `contains`, `contains_any`, `contains_all`, `not_contains` | `string` or `string[]` |
| `skills.technical` | `contains`, `contains_any`, `contains_all`, `not_contains` | `string` or `string[]` |
| `tags` | `contains`, `contains_any`, `contains_all`, `not_contains` | `string` or `string[]` |
| `custom` | `matches`, `not_matches` | `{ field: 'resumeText' \| 'highlight' \| 'name'; pattern: string; flags?: string }` |

Anything outside this matrix is rejected with a 400 and an error code `HR_INVALID_OPERATOR`.

### Filtering algorithm

```
applyHardRequirements(resumes, hardRequirements) →
  { passed: Resume[], rejected: Array<{ resume: Resume, reasons: string[] }> }
```

Two-stage execution:

1. **DB pre-filter** (cheap, indexed). Convert as many predicates as possible into a single Prisma `where` clause:
   - `experienceYears gte/lte` → maps onto `Resume.experienceYears` (a denormalized numeric column from the parser; if the column doesn't exist yet, this is the trigger to add it).
   - `location eq/in` → `Resume.location IN (...)` (also denormalized).
   - `tags contains/contains_any` → `Resume.tags hasSome` (Prisma supports `hasSome`/`hasEvery` for `String[]` columns).
   - `education.degree in` — matches against `Resume.parsedData->'education'->>'highestDegree'` via Prisma's `path` filter.
2. **JS post-filter** (for anything the DB can't handle):
   - `custom regex` against `Resume.resumeText`.
   - `skills.technical contains_any` against `Resume.parsedData.skills` JSON array.
   - Anything where the resume column doesn't yet exist falls through to JS.

Both stages collect rejection reasons. The rejected list surfaces in:
- The run summary (`stats.filteredByHardRequirements: number`).
- A new activity event `match.filtered_by_hard_requirement` per rejected resume (logged at `severity: 'debug'` so the admin terminal shows it but the recruiter view aggregates them into a single "12 candidates filtered: location, experience").

### Why two stages instead of pure DB or pure JS

Pure DB is fastest but can't express regex over resume text or `contains_any` against parsed-resume JSON arrays without N round-trips. Pure JS is simplest but pulls the full pool into memory on every run, which kills the run for large MinIO archives. Two-stage gets the cheap predicates onto the index and only loads the survivors for JS evaluation.

### Order of operations vs existing dedup

The current flow inside `runInstantSearch` / `runMinIOSearch` is:

```
fetch resumes → exclude alreadyEvaluated → matchResumesWithLLM
```

The new flow:

```
fetch resumes → exclude alreadyEvaluated → applyHardRequirements → matchResumesWithLLM
```

Hard requirements run **after** the dedup so a candidate already matched in v1 doesn't waste a hard-req filter pass. They run **before** the LLM matcher so we don't pay a single dollar of token cost on a candidate the user has explicitly excluded.

---

## 4. `IdealCandidateProfileAgent` — LLM agent class

Pattern after `BaseAgent<TInput, TOutput>`. Lives at `backend/src/agents/IdealCandidateProfileAgent.ts`.

```typescript
import { BaseAgent } from './BaseAgent.js';

interface IdealProfileInput {
  jobTitle: string;
  jobDescription: string;
  agentInstructions: string | null;
  currentCriteria: AgentCriterion[];
  /** Previous ICP, if any — lets the LLM evolve rather than restart */
  currentICP: IdealCandidateProfile | null;
  /** Currently enforced hard requirements — context only, not modified by the agent */
  currentHardRequirements: HardRequirement[];
  likedCandidates: ExemplarCandidate[];
  dislikedCandidates: ExemplarCandidate[];
  language?: string;
}

interface ExemplarCandidate {
  id: string;          // AgentCandidate.id
  name: string;
  headline: string | null;
  matchScore: number | null;
  reason: string | null;
  /** Compact extract from parsedData — see §4.1 */
  resumeDigest: string;
  status: 'liked' | 'disliked';
}

interface IdealProfileOutput {
  profile: IdealCandidateProfile;
  suggestedHardRequirements: HardRequirement[];
  narrativeSummary: string;
  confidence: number;          // 0..1
  reasoningTrace: string;      // free-form chain of thought
}

export class IdealCandidateProfileAgent extends BaseAgent<IdealProfileInput, IdealProfileOutput> {
  constructor() {
    super('IdealCandidateProfileAgent');
  }

  protected getTemperature(): number {
    return 0.4;  // synthesis needs a little creativity, but mostly grounded
  }

  protected getAgentPrompt(): string { /* see §4.2 */ }
  protected formatInput(input: IdealProfileInput): string { /* see §4.3 */ }
  protected parseOutput(response: string): IdealProfileOutput { /* JSON extraction with fallback */ }

  async generate(input: IdealProfileInput, requestId?: string): Promise<IdealProfileOutput> {
    return this.executeWithJsonResponse(input, input.jobDescription, requestId);
  }
}
```

### 4.1 Resume digest format

The full parsed resume JSON is too large to fit 5 likes + 5 dislikes in one prompt. The digest is a compact ~400-token line-oriented summary built by a helper:

```
NAME: Wang Tao
HEADLINE: Senior Backend Engineer @ ByteDance, 6y full-time
LOCATION: Beijing
EDUCATION: Master CS, Tsinghua [985/211/双一流]
SKILLS: Go, Kafka, Kubernetes, Postgres, gRPC, Distributed Systems
INDUSTRIES: short video, ad tech
LANGUAGES: zh-native, en-fluent
NOTABLE: led migration of recommender service to Go, owns on-call rotation
RECRUITER REASON: matched on Go + distributed systems + 985 background
```

This digest is built once per `ExemplarCandidate` from `Resume.parsedData` + `AgentCandidate.metadata`. It deliberately strips dates, employers, project descriptions — those expand the prompt without helping the LLM see the *pattern*.

### 4.2 The full system prompt (verbatim)

This is the heart of the smart agent. The literal text below is what the coding agent should drop into `getAgentPrompt()`.

```
You are a senior technical recruiter and talent strategist analyzing a hiring manager's
preferences. You have been given:

  1. The job: title, description, and any recruiter instructions.
  2. The current evaluation criteria the recruiter has set up.
  3. The current Ideal Candidate Profile (ICP), if one already exists.
  4. The current hard requirements (硬性条件) the recruiter has declared. Treat these
     as facts, not as something to revise — your job is only to SUGGEST new ones.
  5. A list of candidates the recruiter LIKED.
  6. A list of candidates the recruiter DISLIKED.

Your job is to find the *patterns* in the recruiter's choices that go beyond the JD's
explicit requirements. The JD describes what the role formally needs; the like/dislike
history reveals what the recruiter actually wants but hasn't written down. You must
extract that hidden preference signal and encode it as a structured profile that the
matcher can use on every future run.

## How to think

For each pattern you propose, you MUST be able to point to evidence in the data. Do
not invent traits the data does not support. If only one liked candidate has a given
skill, that is NOT a pattern — call it out as a single observation, not a core skill.

Use the following analysis framework:

  Step 1 — Common thread in LIKES
    What do the liked candidates share that the disliked candidates lack? Look at:
    - Specific technical skills (Go, Kubernetes, etc.)
    - Years and shape of experience (full-time only? lots of internship? gaps?)
    - Education tier (985/211, overseas, specific schools)
    - Industry background (fintech, gaming, etc.)
    - Role progression (IC → lead, founder, switched companies frequently)
    - Soft signals from the headline / notable line (ships fast, owns on-call,
      cross-functional, etc.)

  Step 2 — Common thread in DISLIKES
    What do the disliked candidates share that liked candidates lack? These become
    ANTI-SIGNALS — explicit red flags that the matcher should penalize.

  Step 3 — Differential analysis
    For each candidate trait, ask: "Is this trait actually predictive, or is it just
    correlated by chance?" If the sample size is small (<3 candidates), down-weight
    your confidence. The user values you being honest about uncertainty more than
    confidently producing a wrong profile.

  Step 4 — Synthesis
    Build the structured ICP. Every coreSkill, bonusSkill, antiSkill, signal, and
    yearsOfExperience field must trace back to evidence in the data.

  Step 5 — Hard requirement suggestions
    Propose new hard requirements ONLY if a pattern is EXTREME — meaning ALL liked
    candidates have a trait AND no disliked candidate has it, OR vice versa. Examples:
      - "All 5 liked candidates are based in Beijing → suggest location = Beijing"
      - "All 4 liked candidates have a Master's degree → suggest education.degree
        gte Master"
      - "All 6 disliked candidates have <3 years experience → suggest
        experienceYears gte 3"
    If a pattern is merely strong but not absolute, encode it in the profile signals
    instead of as a hard requirement. Hard requirements are gatekeepers — proposing
    a borderline one will silently exclude good candidates and the recruiter will
    blame the agent.

  Step 6 — Confidence
    Compute self-reported confidence in [0, 1]:
      - 0.0–0.3: less than 3 likes OR less than 3 dislikes; patterns are speculative
      - 0.3–0.6: 3–5 examples per side, signal is moderate
      - 0.6–0.85: ≥6 examples per side with consistent signal
      - 0.85–1.0: large sample (≥10/side) with extremely consistent signal
    Be conservative. The product surfaces this number to the user, and a high number
    you cannot back up will erode trust.

  Step 7 — Narrative summary
    1–2 sentences in the recruiter's language. Plain, direct, no marketing. Example:
    "你偏好北京 985 背景的中级 Go 工程师，重视分布式系统经验和团队 ownership；
     避开转行型候选人和经验不足 3 年的应聘者。"

## Output format

Return ONLY a single JSON object inside a ```json code fence. No prose before or
after the fence. The shape:

```json
{
  "profile": {
    "seniorityRange": { "min": 3, "ideal": 5, "max": 8, "unit": "years" },
    "preferredLocations": ["Beijing"],
    "preferredIndustries": ["ad tech", "short video"],
    "coreSkills": [
      { "skill": "Go", "importance": "critical", "rationale": "5/5 liked candidates" },
      { "skill": "Distributed systems", "importance": "high", "rationale": "4/5 likes mention it" }
    ],
    "bonusSkills": ["Kafka", "Kubernetes"],
    "antiSkills": ["React Native"],
    "preferredCompanySizes": ["enterprise"],
    "preferredRoleProgression": "IC → tech lead at large internet company",
    "yearsOfExperience": { "min": 3, "ideal": 5, "max": 8 },
    "signals": [
      { "trait": "owns on-call rotations", "weight": 0.8, "source": "liked",
        "evidence": "Wang Tao notable line" },
      { "trait": "frequent job-hopping", "weight": 0.7, "source": "disliked",
        "evidence": "3 of 4 dislikes had >3 employers in 5 years" }
    ],
    "anchorCandidateIds": ["<liked candidate ids>"],
    "antiAnchorCandidateIds": ["<disliked candidate ids>"],
    "generatedAt": "<ISO timestamp>"
  },
  "suggestedHardRequirements": [
    {
      "id": "<uuid>",
      "field": "experienceYears",
      "operator": "gte",
      "value": 3,
      "description": "至少 3 年全职经验 (建议: 全部 6 位被拒候选人都低于 3 年)",
      "enabled": false,
      "source": "icp_suggestion"
    }
  ],
  "narrativeSummary": "<1-2 sentence digest in recruiter's language>",
  "confidence": 0.72,
  "reasoningTrace": "<chain of thought, 200-500 tokens>"
}
```

## Constraints

- NEVER invent traits the data does not support.
- NEVER output more than 8 coreSkills.
- NEVER output more than 5 antiSkills.
- NEVER suggest more than 3 hardRequirements per regen.
- ALWAYS preserve the existing currentHardRequirements verbatim — they are not in
  scope for you to modify. Your suggestedHardRequirements MUST NOT duplicate any
  rule already enforced.
- ALWAYS write narrativeSummary in the same language as the JD.
- If you have ZERO likes AND ZERO dislikes, do NOT generate a profile. Return:
  { "error": "insufficient_data", "minLikesOrDislikes": 3 }
```

### 4.3 The user message format

The `formatInput()` method assembles the prompt body. Layout:

```
## Job
Title: <jobTitle>
Description:
<jobDescription>

## Recruiter instructions
<agentInstructions or "(none)">

## Current evaluation criteria
1. [PINNED, MOST IMPORTANT] <text>
2. [LEAST IMPORTANT] <text>
...

## Current ICP (version N, generated 2026-04-10)
<JSON of currentICP, or "(none — first generation)">

## Current hard requirements (DO NOT MODIFY)
- experienceYears >= 3 (enabled)
- location in [Beijing, Shanghai] (disabled)
...

## LIKED candidates (count: 5)

### Like #1 — Wang Tao
NAME: Wang Tao
HEADLINE: Senior Backend Engineer @ ByteDance, 6y full-time
LOCATION: Beijing
EDUCATION: Master CS, Tsinghua [985/211/双一流]
SKILLS: Go, Kafka, Kubernetes, Postgres, gRPC
INDUSTRIES: short video, ad tech
LANGUAGES: zh-native, en-fluent
NOTABLE: led migration of recommender service to Go
RECRUITER REASON: <AgentCandidate.reason>

### Like #2 — ...

## DISLIKED candidates (count: 4)

### Dislike #1 — ...

---

Now produce the new ICP. Cite specific candidate names in your reasoningTrace
when explaining why you proposed each pattern.
```

The "(DO NOT MODIFY)" annotation on hard requirements is crucial — without it the LLM will sometimes "improve" the user's existing rules, which is exactly what we don't want.

### 4.4 Agent output validation

`parseOutput()` does:

1. Extract JSON from the first ```json fence (matches existing `ResumeMatchAgent` parser).
2. Validate the shape with a runtime guard (`isIdealProfileOutput`).
3. If validation fails, return a degraded fallback `{ profile: null, error: 'parse_failed' }` that the orchestrator detects and surfaces as an error to the user. **Do NOT** silently substitute defaults like ResumeMatchAgent does — a malformed ICP that gets persisted will pollute every future run.

---

## 5. Prompt optimization for `ResumeMatchAgent`

The matcher needs to *consume* the ICP without being rewritten from scratch. The strategy is **prepend + append**: keep the existing ResumeMatchAgent prompt body unchanged, but bracket it with new sections.

### 5.1 Before — current structure

```
[ system prompt: 450 lines of scoring rules + JSON schema ]
[ user: ## Resume\n... ## JD\n... ## Preferences ]
```

The augmented JD currently injects pinned/important/least-important criteria into the JD body inside `buildAugmentedJd()` in `llmMatcher.ts`.

### 5.2 After — with ICP context

```
[ system prompt: 450 lines of scoring rules + JSON schema ]                  ← unchanged
[ user:
    ## Job context
    <jdText with criteria injected, as today>

    ## Recruiter's Ideal Candidate Profile (v3)                              ← NEW
    Narrative: <narrativeSummary>
    Core skills: Go (critical), Distributed systems (high), Kafka (medium)
    Bonus skills: Kubernetes
    AVOID: React Native, frequent job-hopping
    Years: 3-8 (ideal 5)
    Soft signals to look for:
      - owns on-call rotations
      - ships fast / clear ownership
    Soft signals to penalize:
      - frequent job-hopping (>3 employers in 5 years)

    ## Anchor candidates (use as ground truth)                                ← NEW
    POSITIVE EXEMPLARS — score this resume HIGHER if it resembles these:
      1. Wang Tao — Senior Backend @ ByteDance, 6y, Go/distributed, Tsinghua
      2. Li Mei — Staff Engineer @ Meituan, 8y, Kafka/Postgres
    NEGATIVE EXEMPLARS — score this resume LOWER if it resembles these:
      1. Zhang Wei — Frontend dev with 1y experience, switched roles 3 times
      2. Chen Ling — React Native specialist, no backend depth

    ## Resume to evaluate
    <resume body>
  ]
```

### 5.3 Why this approach beats rewriting the system prompt

- **Backward compatible**: agents without an ICP fall through to the existing behavior automatically (the new sections are simply absent).
- **Cheap**: an ICP is ~500 tokens once loaded, and the anchor list is ~300 tokens. The matcher prompt grows by ~800 tokens per call. At today's prices that's ~$0.0008/call, well under the per-run budget.
- **No regression risk**: the 450-line scoring rules and the JSON schema are untouched. The existing dealbreaker logic, must-have analysis, education tier matching — all keeps working.
- **Naturally weighted**: the model already understands "anchor / exemplar" framing. We don't have to teach it new vocabulary.

### 5.4 Where the prepend happens

`buildAugmentedJd()` in `llmMatcher.ts` is the surgical point. New signature:

```typescript
function buildAugmentedJd(
  jdText: string,
  criteria: AgentCriterion[] | undefined,
  instructions: string | null | undefined,
  icp: IdealCandidateProfile | null,           // NEW
  anchors: AnchorCandidate[] | null,            // NEW — already-resolved exemplar digests
): string
```

Anchors are resolved once per run (not per resume) by `IdealProfileService.loadAnchorsForRun()`, which fetches the AgentCandidate rows referenced by `profile.anchorCandidateIds` + `antiAnchorCandidateIds` and builds digests using the same helper from §4.1.

### 5.5 Why anchors instead of "use this ICP to score"

LLMs are very good at imitation ("score this candidate the way the recruiter scored these 5") and mediocre at applying abstract weight vectors. By giving the model concrete exemplars alongside the structured ICP, we get the best of both: the structured fields steer the JSON output, the exemplars steer the verdict.

---

## 6. `IdealProfileService` — orchestrator

Lives at `backend/src/services/IdealProfileService.ts`. Singleton instance imported by routes and `AgentRunService`.

```typescript
class IdealProfileService {
  /**
   * Generate a new ICP version for an agent. Loads context, calls the LLM,
   * persists a new AgentIdealProfile row, returns it.
   *
   * Throws InsufficientDataError if likes + dislikes < MIN_THRESHOLD.
   * Throws AgentNotFoundError if the agent doesn't exist or the user can't see it.
   */
  async generateForAgent(
    agentId: string,
    requestingUserId: string,
    opts?: { force?: boolean; includeDisabledExamples?: boolean }
  ): Promise<AgentIdealProfile>;

  /** Latest version, or null if no ICP exists yet. Cached per request. */
  async loadCurrent(agentId: string): Promise<AgentIdealProfile | null>;

  /** All versions, newest first. For the version-history UI. */
  async getVersionHistory(agentId: string, limit?: number): Promise<AgentIdealProfile[]>;

  /**
   * Run hard requirements against a resume pool. Returns passed + rejected.
   * Pure function — no DB writes.
   */
  applyHardRequirements(
    resumes: ResumePoolItem[],
    hardRequirements: HardRequirement[]
  ): { passed: ResumePoolItem[]; rejected: Array<{ resume: ResumePoolItem; reasons: string[] }> };

  /**
   * Build the digest list for the matcher's anchor section. Resolves
   * AgentCandidate IDs into ExemplarCandidate digests.
   */
  async loadAnchorsForRun(icp: IdealCandidateProfile): Promise<{
    positive: ExemplarCandidate[];
    negative: ExemplarCandidate[];
  }>;

  /** Soft-revert: copies an old version's profile + suggestions forward as a new latest. */
  async revertToVersion(agentId: string, version: number, requestingUserId: string): Promise<AgentIdealProfile>;
}

export const idealProfileService = new IdealProfileService();
```

### 6.1 Per-request cache

`loadCurrent()` is called once per `executeRun` and once per matcher batch. Without a cache, that's N+1 DB reads per run. Use a `WeakMap<object, AgentIdealProfile | null>` keyed by the run object, or just pass the loaded ICP through to `matchResumesWithLLM()` as a new field on `MatchContext`. Recommend the latter — it's explicit and avoids a hidden state cache.

### 6.2 Sequence — regenerate flow

```
HTTP POST /api/v1/agents/:id/ideal-profile/regenerate
   │
   ▼
agents.ts route handler
   │  requireAuth + ownership check via getVisibilityScope()
   ▼
idealProfileService.generateForAgent(agentId, userId)
   │
   ├─► prisma.agent.findUnique(agentId, { include: job })
   │
   ├─► prisma.agentIdealProfile.findFirst({ agentId, orderBy: version desc })
   │     // currentICP context for the LLM
   │
   ├─► prisma.agentCandidate.findMany({ agentId, status: 'liked' })
   │     // exemplar pool — limit to 10 most recent
   │
   ├─► prisma.agentCandidate.findMany({ agentId, status: 'disliked' })
   │     // dislikes, limit 10 most recent
   │
   ├─► [for each exemplar] join Resume.parsedData → buildResumeDigest()
   │
   ├─► [check threshold] if likes + dislikes < MIN_TO_GENERATE → throw
   │
   ├─► agentActivityLogger.log({ eventType: 'icp.regeneration.started' })
   │
   ├─► idealCandidateProfileAgent.generate({
   │       jobTitle, jobDescription, agentInstructions,
   │       currentCriteria, currentICP, currentHardRequirements,
   │       likedCandidates, dislikedCandidates,
   │     }, requestId)
   │     │
   │     └─► LLM call (Gemini / OpenAI / etc.) ~5-15s
   │
   ├─► validateOutput(llmOutput)
   │
   ├─► prisma.$transaction([
   │       SELECT MAX(version) FROM agent_ideal_profiles WHERE agent_id = ?
   │       INSERT INTO agent_ideal_profiles ...version = max+1
   │     ])
   │
   ├─► agentActivityLogger.log({
   │       eventType: 'icp.regenerated',
   │       payload: { version, confidence, generatedFromLikes, generatedFromDislikes,
   │                  costUsd, tokensIn, tokensOut }
   │     })
   │
   └─► return AgentIdealProfile to route
        │
        ▼
   route → res.json(profile)
```

Total LLM cost per regen: 1 call, ~3-8K input tokens (depending on exemplar count), ~1-2K output tokens. At Gemini Flash pricing that's ~$0.001-0.005. We can regenerate cheaply.

### 6.3 Sequence — run with ICP applied

```
HTTP POST /api/v1/agents/:id/runs  ──►  startAgentRun()
   │
   ▼
executeRun(runId, agentId)
   │
   ├─► agent = prisma.agent.findUnique(...)
   │
   ├─► icp = idealProfileService.loadCurrent(agentId)             ◄── NEW
   │
   ├─► hardReqs = (agent.config?.hardRequirements ?? [])          ◄── NEW
   │     .filter(r => r.enabled)
   │
   ├─► anchors = icp ? idealProfileService.loadAnchorsForRun(icp.profile) : null ◄── NEW
   │
   ├─► [per source: instant_search | minio | external_api]
   │     │
   │     ├─► resumes = fetch pool, exclude alreadyEvaluated
   │     │
   │     ├─► { passed, rejected } = applyHardRequirements(resumes, hardReqs) ◄── NEW
   │     │
   │     ├─► agentActivityLogger.log({                                       ◄── NEW
   │     │     eventType: 'hard_requirements.applied',
   │     │     payload: { poolSize: resumes.length, passed: passed.length,
   │     │                rejected: rejected.length, ruleCount: hardReqs.length }
   │     │   })
   │     │
   │     ├─► [for each rejected] log match.filtered_by_hard_requirement      ◄── NEW
   │     │     (debug severity, batched)
   │     │
   │     └─► matchResumesWithLLM(passed, {
   │           ...existing context,
   │           icp: icp?.profile ?? null,                                    ◄── NEW
   │           anchors,                                                       ◄── NEW
   │         })
   │           │
   │           └─► buildAugmentedJd injects ICP + anchor sections (§5.4)
   │
   ├─► aggregate stats { sourced, matched, errors, filteredByHardRequirements }
   │
   ├─► run.completed event payload includes new field filteredByHardRequirements
   │
   └─► persist AgentRun
```

---

## 7. API endpoints

All routes are added to `backend/src/routes/agents.ts`. All require `requireAuth` and pass ownership through `getVisibilityScope()` + `buildUserIdFilter()` (admins see everything; regular users see only their own agents). Errors follow the existing `{ error: { code, message } }` shape.

### 7.1 `GET /api/v1/agents/:id/ideal-profile`

Load the current (latest version) ICP for an agent.

**Auth**: requireAuth + agent ownership.

**Response 200**:
```json
{
  "id": "clxxx",
  "agentId": "clyyy",
  "version": 4,
  "profile": { /* IdealCandidateProfile */ },
  "suggestedHardRequirements": [ /* HardRequirement[] */ ],
  "narrativeSummary": "...",
  "confidence": 0.72,
  "generatedFromLikes": 5,
  "generatedFromDislikes": 4,
  "generatedAt": "2026-04-12T03:14:00.000Z",
  "tokensIn": 2840,
  "tokensOut": 1120,
  "costUsd": 0.0034,
  "llmModel": "gemini-2.0-flash",
  "llmProvider": "google"
}
```

**Response 404**: `{ error: { code: 'ICP_NOT_FOUND', message: 'No ideal profile generated yet' } }`

### 7.2 `POST /api/v1/agents/:id/ideal-profile/regenerate`

Trigger a fresh LLM regen. Synchronous (the LLM call blocks the request) — typical latency 5-15s. The frontend shows a loading spinner; SSE streaming is overkill for one call.

**Auth**: requireAuth + agent ownership.

**Request body**:
```json
{
  "force": false,
  "includeDisabledExamples": false
}
```

- `force` — if true, regenerate even if likes + dislikes < threshold (returns a low-confidence ICP).
- `includeDisabledExamples` — if true, include archived AgentCandidate rows in the exemplar set.

**Response 200**: Same shape as `GET`.

**Response 400**: `{ error: { code: 'ICP_INSUFFICIENT_DATA', message: 'Need at least 3 likes or 3 dislikes', meta: { likes: 1, dislikes: 0, minRequired: 3 } } }`

**Response 502**: `{ error: { code: 'ICP_LLM_FAILED', message: 'LLM call failed' } }` — surface the error so the user can retry.

### 7.3 `GET /api/v1/agents/:id/ideal-profile/history`

All versions, newest first. Used by the version-history drawer.

**Query**: `?limit=20` (default 20, max 50).

**Response 200**:
```json
{
  "versions": [
    { /* same shape as GET, ordered version DESC */ }
  ],
  "total": 4
}
```

### 7.4 `POST /api/v1/agents/:id/ideal-profile/revert`

Soft-revert: copies an older version's profile forward as a new latest version. Audit-friendly.

**Request**: `{ "version": 2 }`

**Response 200**: The newly-created version (with `version = currentMax + 1`).

### 7.5 `PATCH /api/v1/agents/:id/hard-requirements`

Replace the agent's enforced hard requirements list. Full-replace semantics (not patch), simpler for the frontend to reason about.

**Auth**: requireAuth + agent ownership.

**Request body**:
```json
{
  "hardRequirements": [
    {
      "id": "uuid",
      "field": "experienceYears",
      "operator": "gte",
      "value": 3,
      "description": "至少 3 年经验",
      "enabled": true,
      "source": "user"
    }
  ]
}
```

**Validation**:
1. Each rule passes `validateHardRequirement()` (field × operator type matrix from §3).
2. At most 20 rules per agent (UX guard, prevents pathological configs).
3. `value` is type-checked against the field type.

**Response 200**: `{ hardRequirements: [...] }` (the persisted list).

**Response 400**: `{ error: { code: 'HR_VALIDATION_FAILED', message: '...', meta: { ruleId, problem } } }`

**Side effect**: Writes an `AgentActivityLog` event `hard_requirements.updated` with the diff (added / removed / changed rules) so the audit trail captures who changed what.

### 7.6 `POST /api/v1/agents/:id/ideal-profile/preview-filter`

Dry-run: show how many candidates a hard-requirements set would filter out **without** persisting them. Used by the UI to warn before saving (e.g. "this rule would filter out 47 of your 52 existing matches — are you sure?").

**Request body**:
```json
{
  "hardRequirements": [ /* candidate rule set */ ],
  "scope": "current_pool" | "all_existing_candidates" | "next_run_pool"
}
```

- `current_pool` — counts against the resumes that would be in the next run's pool (instant_search OR minio depending on agent.source).
- `all_existing_candidates` — counts against AgentCandidate rows already produced. Useful for "if I had this rule earlier, how many of my existing matches would have survived?"
- `next_run_pool` — alias for current_pool, kept for clarity.

**Response 200**:
```json
{
  "scope": "current_pool",
  "totalCandidates": 52,
  "passed": 5,
  "rejected": 47,
  "rejectionsByRule": {
    "rule_uuid_1": { "count": 30, "description": "experienceYears < 3" },
    "rule_uuid_2": { "count": 17, "description": "location not in [Beijing]" }
  },
  "sampleRejected": [
    { "id": "agentCandidate_id", "name": "Zhang Wei", "reasons": ["experienceYears < 3"] }
  ]
}
```

This endpoint does NOT touch the LLM and does NOT persist anything. It's purely a Prisma query + JS filter, so it's cheap.

### 7.7 Endpoint summary

| Method | Path | Auth | Cost | Notes |
|---|---|---|---|---|
| `GET` | `/api/v1/agents/:id/ideal-profile` | requireAuth + own | DB | Latest version |
| `POST` | `/api/v1/agents/:id/ideal-profile/regenerate` | requireAuth + own | LLM (~$0.005) | 5-15s blocking |
| `GET` | `/api/v1/agents/:id/ideal-profile/history` | requireAuth + own | DB | All versions |
| `POST` | `/api/v1/agents/:id/ideal-profile/revert` | requireAuth + own | DB | Copies old → new |
| `PATCH` | `/api/v1/agents/:id/hard-requirements` | requireAuth + own | DB | Validates schema |
| `POST` | `/api/v1/agents/:id/ideal-profile/preview-filter` | requireAuth + own | DB only | Dry-run |

---

## 8. AgentRunService integration

The minimum surgical change to `executeRun()` in `backend/src/services/AgentRunService.ts`:

### 8.1 Modified `executeRun()` outline

```typescript
async function executeRun(runId, agentId, signal) {
  await prisma.agentRun.update({ ... status: 'running' });
  await agentActivityLogger.log({ eventType: 'run.started' });

  try {
    const agent = await prisma.agent.findUniqueOrThrow({ ... });

    // ── NEW: Load ICP + hard requirements once per run ──
    const icp = await idealProfileService.loadCurrent(agentId);
    const hardRequirements = extractEnabledHardRequirements(agent.config);
    const anchors = icp ? await idealProfileService.loadAnchorsForRun(icp.profile) : null;

    if (icp) {
      await agentActivityLogger.log({
        agentId, runId, actor: 'system',
        eventType: 'icp.loaded',
        message: `Using ICP v${icp.version} (confidence ${icp.confidence.toFixed(2)})`,
        payload: {
          icpVersion: icp.version,
          confidence: icp.confidence,
          coreSkillCount: icp.profile.coreSkills.length,
          anchorCount: icp.profile.anchorCandidateIds.length,
        },
      });
    }
    // ── /NEW ──

    const stats = { sourced: 0, matched: 0, errors: 0, filteredByHardRequirements: 0 };

    // Each source branch now passes icp + anchors + hardRequirements
    if (agent.taskType === 'search_candidates') {
      // ... loops over modes, each calls runInstantSearch / runMinIOSearch / runExternalApiSearch
      // Each of those receives `{ icp, anchors, hardRequirements }` as new ctx fields
    }
    // ...
  }
}
```

### 8.2 Modified source-branch helpers

Each `runInstantSearch` / `runMinIOSearch` / `runMatchResumes` adds the hard-requirement pre-filter between fetching resumes and calling `matchResumesWithLLM`:

```typescript
async function runInstantSearch(agent, runId, signal, icp, anchors, hardRequirements) {
  const alreadyEvaluated = await alreadyEvaluatedResumeIds(agent.id);
  const resumes = await prisma.resume.findMany({ /* existing query, with potential
                                                     hardRequirement DB-stage where clauses
                                                     merged in via buildHardReqWhere() */ });

  // ── NEW: pre-filter ──
  const { passed, rejected } = idealProfileService.applyHardRequirements(resumes, hardRequirements);

  if (rejected.length > 0) {
    await agentActivityLogger.log({
      agentId: agent.id, runId, actor: 'system',
      eventType: 'hard_requirements.applied',
      message: `Filtered out ${rejected.length} of ${resumes.length} candidates`,
      payload: {
        poolSize: resumes.length,
        passed: passed.length,
        rejected: rejected.length,
        rulesApplied: hardRequirements.length,
        rejectionsByRule: groupReasonsByRule(rejected),
      },
    });

    // Per-candidate debug events (batched in chunks of 20 to avoid log spam)
    for (const chunk of chunked(rejected, 20)) {
      await Promise.all(chunk.map(({ resume, reasons }) =>
        agentActivityLogger.log({
          agentId: agent.id, runId, actor: 'system',
          eventType: 'match.filtered_by_hard_requirement',
          severity: 'debug',
          message: `${resume.name} excluded by ${reasons.length} rule(s)`,
          payload: { resumeId: resume.id, reasons },
        })
      ));
    }
  }
  // ── /NEW ──

  const stats = await matchResumesWithLLM(passed as MatchResumeInput[], {
    agentId: agent.id, runId, userId: agent.userId,
    sourceKey: 'instant_search',
    jdText: resolveJdText(agent),
    instructions: agent.instructions,
    criteria: extractCriteria(agent.config),
    icp: icp?.profile ?? null,            // NEW
    anchors,                                // NEW
    signal,
  });
  return {
    sourced: resumes.length,
    matched: stats.matched,
    errors: stats.errors,
    filteredByHardRequirements: rejected.length,  // NEW
  };
}
```

### 8.3 New activity event types

Append to the existing taxonomy in `agents-redesign-spec.md` §5.3 → §6:

| Category | eventType | severity | Notes |
|---|---|---|---|
| ICP | `icp.regeneration.started` | info | Emitted before LLM call |
| ICP | `icp.regenerated` | info | After successful generation, with version + cost |
| ICP | `icp.regeneration.failed` | error | LLM or validation failure |
| ICP | `icp.loaded` | info | Once per run when ICP is found and applied |
| ICP | `icp.reverted` | info | When user reverts to an older version |
| Hard reqs | `hard_requirements.updated` | info | When PATCH route changes the rule set, with diff |
| Hard reqs | `hard_requirements.applied` | info | Once per run, summary of filter impact |
| Hard reqs | `match.filtered_by_hard_requirement` | debug | Per excluded candidate, with reasons |

Severity guides UI: `debug` events render in the admin terminal but not in the recruiter activity tab. `info` events render in both.

### 8.4 New `AgentRun.stats` field

The existing `stats Json` payload gains one optional key:

```typescript
{
  sourced: number;
  matched: number;
  errors: number;
  filteredByHardRequirements?: number;  // NEW
  icpVersion?: number;                    // NEW — which ICP version this run used
}
```

This avoids a schema migration on `AgentRun` itself.

---

## 9. Cold start handling

### 9.1 The states an agent can be in

| State | Likes | Dislikes | ICP exists? | What to do |
|---|---|---|---|---|
| **Brand new** | 0 | 0 | no | Use plain JD + criteria. Don't offer ICP regen. |
| **First triage** | 1-2 | 1-2 | no | Use plain JD + criteria. Show "Generate ICP" CTA but disabled with tooltip "Need at least 3 likes or 3 dislikes". |
| **Threshold reached** | ≥3 OR ≥3 | ≥3 OR ≥3 | no | Show "Generate Ideal Profile" CTA prominently. First click triggers regen. |
| **Has ICP** | any | any | yes | Use ICP on every run. Show "Refine ICP" button. |
| **Has stale ICP** | any | any | yes (but +N triage actions since last regen) | Show "Refine" with a badge ("4 new likes since last refine"). |

### 9.2 Minimum threshold

**Recommendation: 3 likes OR 3 dislikes (not AND).**

Reasoning:
- A recruiter who has only liked candidates is signaling "show me more like these" — that alone is enough to extract a coreSkill pattern.
- A recruiter who has only disliked candidates is signaling "stop showing me these" — that's enough to extract antiSkills.
- 3 is the smallest sample size where "3 of 3 share trait X" is a defensible pattern. With 2 it's probably noise.

The threshold lives as a constant `MIN_EXEMPLARS_FOR_ICP = 3` in `IdealProfileService.ts` so it's easy to tune.

### 9.3 The first-run experience

A brand-new agent runs without an ICP. The recruiter triages results. After the run, the workbench detects `likes + dislikes ≥ MIN_EXEMPLARS_FOR_ICP` and surfaces a banner:

> **Ready to teach your agent.** You've reviewed 5 candidates. Generate an Ideal
> Candidate Profile to make the next run smarter. **\[Generate now]**

The user clicks. ICP is generated in 5-15s. The banner is replaced with:

> **ICP v1 created** (confidence 0.6 from 3 likes, 2 dislikes). Next run will use this profile.

Subsequent runs include the ICP automatically. The recruiter can refine on demand.

### 9.4 What plain JD + criteria means

When `icp = null`, `matchResumesWithLLM()` calls `buildAugmentedJd()` with `icp = null` and `anchors = null`. The new sections are simply omitted from the user message — the existing prompt is unchanged. **No regression**.

---

## 10. Performance + cost concerns

### 10.1 ICP regeneration cost

- **One LLM call per regen.** Input: ~3-8K tokens (depends on exemplar count). Output: ~1-2K tokens.
- At Gemini 2.0 Flash pricing: ~$0.001-0.005 per regen.
- At Claude 3.5 Sonnet pricing: ~$0.02-0.05 per regen.
- ICP regen is **user-triggered** in v1, not automatic. A user manually clicking "Refine" maybe 5-10 times across the agent's lifetime → trivial cost.

### 10.2 Auto-regen rule (deferred to v2)

Once shipped, the next iteration can add `agent.config.icpSettings.autoRegenAfterTriageActions`. When set to e.g. 10, the system regenerates the ICP after every 10 like/dislike events. Implementation:

- Triage endpoint (`PATCH /agents/:id/candidates/:candidateId`) increments a counter on `Agent.config.icpSettings.triageEventsSinceLastIcp`.
- When the counter crosses the threshold, enqueue a regen via `setImmediate()`. Don't block the triage response.

For v1, ship manual only and add this in v2 once we see how often recruiters actually use the feature.

### 10.3 Per-run ICP load

Loading the ICP from the DB once per run is one extra index lookup. Negligible. **Do not** reload it on each `matchResumesWithLLM` call inside the run — pass it through `MatchContext` as a new field.

### 10.4 Hard-requirement filter cost

Pure Postgres query + JS filter. For pools of <500 resumes, sub-100ms. For pools of 10K+ MinIO resumes, the DB pre-filter is essential — that's why we push as many predicates as possible to Prisma. Index suggestions for the schema:

- `Resume.experienceYears` if we add it as a denormalized column (currently lives in `parsedData` JSON; recommend extracting to a top-level column).
- `Resume.location` (already exists in some form; verify it's indexed).
- `Resume.tags` already supports `hasSome` via Prisma's array operators.

### 10.5 Anchor digest cache

The ICP holds anchor candidate IDs, but each run resolves them into digests via `loadAnchorsForRun()`. For an agent with 5 anchors, that's 5 Prisma reads + 5 digest builds per run. Cheap, no caching needed.

If we ever need to cache, the natural place is `AgentIdealProfile.profile.anchorDigests` — store the digests inline at generation time and skip the per-run resolution. For v1, prefer freshness over caching.

### 10.6 Audit footprint

Each ICP regen writes:
- 1 `AgentIdealProfile` row (~5-10 KB JSON).
- 2 `AgentActivityLog` rows (`icp.regeneration.started`, `icp.regenerated`).

Each run with ICP applied writes:
- 1 `icp.loaded` event.
- 1 `hard_requirements.applied` event.
- N `match.filtered_by_hard_requirement` debug events (usually 0-50 per run).

Total: trivial. The activity log is already designed to absorb 1000s of events per run.

### 10.7 Visibility check optimization

The ICP routes need to verify the caller owns the agent. Use the same pattern as the existing `/agents/:id/candidates` route — fetch the agent with a `userId` filter built from `getVisibilityScope()`. Don't re-implement the visibility logic.

---

## 11. Open architecture questions for Kenny

These are decisions where I made a recommendation but want explicit sign-off before implementation starts.

### Q1. Hard requirement value localization for `education.degree`

The degree field is multilingual (本科 / Bachelor, 硕士 / Master, etc.). The hard-requirement value should be a canonical enum (`'PhD' | 'Master' | 'Bachelor' | 'Associate' | 'HighSchool'`), but the parsed resume data may have the Chinese form. **Question**: do we add a normalization helper at the parse stage so `Resume.parsedData.education[*].highestDegree` is always one of the enum values, or do we normalize at filter time inside `applyHardRequirements`? Recommend parse-time so every consumer gets the same shape, but that's a Resume model change.

### Q2. Anchor candidate deletion handling

If an anchor candidate is later soft-deleted (`AgentCandidate.status = 'archived'`), do we:
- (a) Drop it from the ICP's `anchorCandidateIds` lazily on next regen?
- (b) Surface a warning in the workbench ("3 anchors are no longer available — refresh ICP")?
- (c) Auto-trigger a regen?

Recommend (a) + (b) — lazy drop with a UX warning. Auto-regen burns LLM cost without user intent.

### Q3. Should ICP confidence affect matching threshold?

Today the matcher uses a fixed `DEFAULT_THRESHOLD = 60`. Should a low-confidence ICP (e.g. 0.3) **lower** the matching threshold to 50 (cast a wider net since we don't know yet what the recruiter wants), or **raise** it to 70 (be conservative until the recruiter signals more)? I lean toward "don't auto-adjust threshold based on ICP confidence" because the behavior is hard for the recruiter to reason about. But it's worth a discussion.

### Q4. Cross-agent ICP sharing

A recruiter who hires for multiple similar roles (e.g. 3 backend engineer postings across teams) might want to **share** an ICP across agents. Today's design is one ICP per agent. Cross-agent sharing would need:
- A `SharedIdealProfile` table that ICPs reference.
- A "Use shared profile from agent X" picker in the agent edit modal.
- A merge tool when promoting a per-agent ICP to shared.

For v1, recommend NOT building this — keep it 1:1 and add cross-agent sharing as v2 if recruiters ask.

### Q5. Hard requirement enforcement for `external_api` candidates

External API sources return candidates with vendor-supplied metadata (location, headline, etc.) but no parsed resume text. A hard requirement like `experienceYears gte 3` can't be checked because we don't know the years. **Question**: should we (a) skip hard-requirement filtering on external candidates (let them through and rely on the LLM scorer to catch bad fits), (b) reject external candidates entirely when hard requirements are set (safer, but kills a major feature), or (c) only apply the subset of rules that match available metadata fields?

Recommend (c) — apply only the predicates we have data for, and emit a `match.filtered_by_hard_requirement` event with payload `{ partiallyEvaluated: true }` so the audit trail is honest about it.

---

## 12. Implementation order for the coding agents

Suggested phasing so a coding agent can ship in vertical slices:

| Slice | Scope | Estimated effort |
|---|---|---|
| **A. Schema + service skeleton** | Prisma model, `IdealProfileService` class with stub methods, no LLM call | 0.5 day |
| **B. ICP agent + prompt** | `IdealCandidateProfileAgent`, prompt as written in §4.2, validation, parser | 1 day |
| **C. Regen route + UI banner** | `POST /regenerate`, `GET /ideal-profile`, the cold-start banner on the agent detail page | 1 day |
| **D. Matcher prompt integration** | `buildAugmentedJd` updates, `loadAnchorsForRun`, threading `icp + anchors` through `MatchContext` | 0.5 day |
| **E. Hard requirements editor** | `validateHardRequirement`, `PATCH /hard-requirements`, the rule-builder UI | 1 day |
| **F. Hard requirement filter** | `applyHardRequirements`, source-branch integration, new activity events | 0.5 day |
| **G. Preview filter route** | `POST /preview-filter`, the "this rule would filter X candidates" warning | 0.5 day |
| **H. Version history + revert** | `GET /history`, `POST /revert`, version drawer in the UI | 0.5 day |

Total: ~5.5 dev days for one coding agent, more parallel with multiple. Slices A→D unlock the smart matching loop. Slices E→G unlock the hard-requirement filter independently. Slice H is polish.

---

## 13. Definitions

| Term | Meaning |
|---|---|
| **ICP** | Ideal Candidate Profile. LLM-generated structured summary of what a recruiter wants based on like/dislike history. |
| **Hard requirement** | User-declared deterministic filter rule. Pre-filter, not LLM. |
| **Anchor** | A liked candidate the matcher is told to use as a positive exemplar. |
| **Anti-anchor** | A disliked candidate the matcher is told to avoid resembling. |
| **Suggested rule** | A hard requirement the LLM proposes during regen. Stored on the ICP version. Becomes enforced only when the user explicitly accepts it. |
| **Confidence** | LLM self-reported [0,1] score on how reliable the ICP is, derived from sample size + signal consistency. |
| **Exemplar** | Generic term for a liked or disliked candidate fed to the ICP agent. |

---

## 14. References

- `agents-redesign-spec.md` — overall agents architecture, taxonomy of activity events, run lifecycle.
- `agents-changelog.md` — feature history including Phase 4 (criteria), Phase 5 (logging), and the cold-start UI patterns this builds on.
- `base-agent-architecture.md` — `BaseAgent` template for new LLM agents.
- `backend/src/services/sources/llmMatcher.ts` — current matching pipeline that this design extends.
- `backend/src/agents/ResumeMatchAgent.ts` — the LLM scorer whose prompt this design extends.
- `backend/src/services/AgentRunService.ts` — the orchestrator this design hooks into.
- `backend/src/routes/agents.ts` — where the new HTTP routes go.
