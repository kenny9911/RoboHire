# Context Engineering & Memory Layer — Phase 7 Design

**Status**: Draft v1 · pre-implementation
**Owner**: Kenny
**Last updated**: 2026-04-12
**Related**: [icp-architecture.md](./icp-architecture.md) · [agents-changelog.md](./agents-changelog.md) · [agents-redesign-spec.md](./agents-redesign-spec.md) · [mem0-evaluation.md](./mem0-evaluation.md) (research in progress)

---

## 0. One-paragraph summary

Phase 6 shipped per-agent learning — each agent has its own Ideal Candidate Profile, regenerated from that agent's triage history. Phase 7 extends learning **across agents, across sessions, and across implicit signals**, producing a persistent recruiter taste model that:

1. **Warms up new agents** with everything the user already learned elsewhere (cold-start → warm-start)
2. **Captures implicit signals** (clicks, dwell, contact copies) alongside explicit likes/dislikes
3. **Scopes memories** to user / team / workspace / job so preferences can be company-wide or role-specific
4. **Decays old learnings** so yesterday's taste doesn't override today's
5. **Retrieves relevant context** via semantic similarity when regenerating an ICP, not just "the last 20 likes"

The goal: a brand-new agent on Day 30 is 85% accurate out of the gate, not 50% (the Phase 6 cold-start baseline).

---

## 1. Design principles

Phase 7 inherits the Phase 6 + design-north-star: **dual-interface, user-owned, observable**. New for Phase 7:

### 1.1 Memory is a first-class resource, not a black box
Every memory entry is visible to the user, editable, disable-able, and deletable. No silent background learning. The user should always be able to answer "what does the system think I want?" by reading one screen.

### 1.2 Explicit user control over scope and sharing
Memories default to **per-user private**. Upgrading a memory to team or workspace scope is a deliberate, confirm-required action. Team memories are opt-in per-user: Sarah has to explicitly subscribe to Wei's learnings before they influence her runs.

### 1.3 Time decay is mandatory
No memory lives forever by default. Every entry has a decay curve, and non-reinforced memories fade. A "permanent" flag exists but requires explicit user action.

### 1.4 Memories are immutable; the weights are mutable
Once written, a memory's content is never rewritten. Weight, lastSeenAt, and expiresAt update as signals reinforce or fade. This gives a clean audit trail and makes bugs reproducible.

### 1.5 Hiring-requirement awareness is semantic, not structural
A memory doesn't belong to a job via foreign key. It belongs to a *concept space* (e.g., "senior backend engineer at a Series B startup") and retrieval matches by semantic similarity to the new job's requirements. This makes memories portable across similar-but-not-identical searches.

---

## 2. Data model

### 2.1 New table: `UserRecruiterProfile`

Rolled-up aggregate of a user's taste across all their agents. Rebuilt (not incrementally updated) whenever any of their `AgentIdealProfile` rows change. One row per user.

```prisma
model UserRecruiterProfile {
  id            String   @id @default(cuid())
  userId        String   @unique

  // Aggregated taste — arrays of frequency-weighted terms
  topSkills     Json     // [{skill, weight, lastSeenAt, sourceCount}]
  topAntiSkills Json     // same shape
  topLocations  Json     // [{location, weight, lastSeenAt, sourceCount}]
  topIndustries Json
  topCompanySizes Json   // ['startup'|'midsize'|'enterprise']

  // Recurring hard-requirement patterns
  recurringHardReqs Json // [{description, seenInAgents: [id], suggestApply: boolean}]

  // Stats
  signalsLearned   Int @default(0)  // total likes + dislikes across all agents
  agentCount       Int @default(0)
  lastRebuiltAt    DateTime @default(now())

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

**Why JSON instead of normalized tables**: the aggregate is read/write as a unit, never queried field-by-field, and the shape evolves fast during Phase 7. Normalization is a premature optimization.

**Rebuild trigger**: every time `IdealProfileService.generateForAgent()` persists a new `AgentIdealProfile` version, it enqueues a background rebuild of the owning user's `UserRecruiterProfile`. Throttled to at most once per 60s per user.

### 2.2 New table: `CandidateInteraction`

Raw implicit signals. Append-only. Feeds the memory synthesizer.

```prisma
model CandidateInteraction {
  id          String   @id @default(cuid())
  userId      String
  agentId     String?   // null if interaction happened outside agent workbench
  runId       String?
  candidateId String    // AgentCandidate.id
  resumeId    String?   // Resume.id if the candidate was backed by a resume

  // Event shape
  eventType   String    // viewed, expanded, dwell, contact_copied, link_clicked, scroll_deep
  durationMs  Int?      // for dwell / time-on-page events
  metadata    Json?     // event-specific (e.g., { scrollPct: 80, section: 'experience' })

  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
  @@index([candidateId])
  @@index([eventType, createdAt])
}
```

**Volume estimate**: ~20 events per candidate * 50 candidates per run * 5 runs per user per week = 5,000 rows/user/week. 10k users = 50M rows/week. **This will need partitioning or retention policy by Phase 7.5** — for v1, retain raw events for 90 days then archive / aggregate.

### 2.3 New table: `MemoryEntry`

The semantic memory primitive. Used by the retrieval service. Every memory has a content string, an embedding, a scope, a weight, and an expiration.

```prisma
model MemoryEntry {
  id      String @id @default(cuid())
  kind    String // preference | rejection_pattern | hard_req_suggest | anchor | company_wide | synthesized_fact

  // Scope hierarchy — one of these is the canonical owner.
  // Higher-scope memories are visible to narrower scopes via query union
  // (e.g., a workspace memory is visible to all its users).
  scope   String // user | team | workspace | job
  scopeId String // userId | teamId | workspaceId | jobId

  // Semantic content
  content String @db.Text // human-readable fact, e.g. "Prefers ex-FAANG engineers with startup stints"

  // Embedding vector — Float[] for v1 (JS cosine similarity).
  // Phase 7.5 will migrate to pgvector for SQL-side ANN search.
  embedding Json // number[] serialized

  // Weight + decay
  weight         Float    @default(1.0) // current effective weight after decay
  baselineWeight Float    @default(1.0) // weight at creation time
  reinforceCount Int      @default(1)
  lastSeenAt     DateTime @default(now())
  expiresAt      DateTime? // null = permanent (rare, explicit user action)

  // Hiring-requirement awareness — nullable
  jobContext Json? // { jobTitle?, industry?, companySize?, role? } for semantic match

  // Provenance — which event spawned this memory
  sourceEventId String? // AgentCandidate.id, CandidateInteraction.id, or null for synthesized
  sourceAgentId String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([scope, scopeId])
  @@index([kind])
  @@index([expiresAt])
  @@index([scopeId, kind, lastSeenAt])
}
```

**Embedding storage**: `Json` column holding a `number[]`. The alternative — `Float[]` column — works on Postgres but Prisma's support for array-type operators is thin and we don't want to couple to Postgres array semantics yet. Cosine similarity is computed in JS during retrieval. **Hard limit: 1500-dim embeddings, ~6KB per row.** Adequate for Phase 7 v1.

**Path to pgvector** (Phase 7.5): add `embedding_vec vector(1536)` column via raw SQL migration, populate from existing Json, switch retrieval to `ORDER BY embedding_vec <=> query_vec LIMIT K`. No schema-level Prisma change needed beyond adding the column as `Unsupported("vector(1536)")`.

### 2.4 Modification: `Agent` model

Add one field:
```
agentInheritsFromProfile Boolean @default(true)
```

When `true` (default), creating a new agent pulls the owner's `UserRecruiterProfile` and seeds the initial ICP from it. Users can opt out per-agent ("start fresh, no learning from my other agents").

### 2.5 Modification: `Team` model (already exists)

Add:
```
memorySharingEnabled Boolean @default(false)
memorySharingMembers String[] @default([]) // userIds who have opted in
```

Opt-in is explicit and per-user. A team admin toggling the workspace-level flag doesn't auto-enroll members.

### 2.6 Back-relations

Add on `User`:
```
userRecruiterProfile  UserRecruiterProfile?
candidateInteractions CandidateInteraction[]
```

---

## 3. Scope hierarchy

A memory exists at exactly one scope level. Retrieval walks the hierarchy from narrowest to widest:

```
             user (private by default)
              │
              ├── owned by user + their own agents
              │
         team (opt-in, shared)
              │
              ├── visible to opted-in team members
              │
         workspace (admin-controlled)
              │
              ├── visible to all users in the workspace
              │
         job (hiring-requirement-scoped)
              │
              └── visible to anyone working on that job
```

Retrieval query flow when starting a new run:
1. Pull all memories where `(scope='user' AND scopeId=userId)`
2. ... UNION memories where `(scope='team' AND scopeId IN userOptedInTeamIds)`
3. ... UNION memories where `(scope='workspace' AND scopeId = user.workspaceId)`
4. ... UNION memories where `(scope='job' AND scopeId = currentJobId)`
5. Rank by cosine similarity to the query, then apply decay weight
6. Return top-K

### 3.1 Opt-in team sharing

When Sarah creates a team memory, she's publishing a fact to the team. But Wei doesn't see Sarah's team memories unless Wei has **opted in** to receiving them. Wei opts in once, not per-memory.

The `Team.memorySharingMembers` list is the subscription roster. Removing yourself from this list instantly stops team memories from influencing your runs on subsequent queries (they're not cached).

### 3.2 Workspace scope

Workspace memories are the strongest shared context. Only workspace admins can create them. They represent company-wide hiring preferences ("we never hire fresh grads without internships", "we prefer candidates in the US-East timezone").

### 3.3 Job scope

A memory tied to a specific `Job` via `scopeId=jobId`. When the user is running an agent for that job, these are always retrieved with high priority. Useful for: "for the Senior Platform Engineer role, we specifically need Kubernetes experience".

Job memories are automatically GC'd when the job is closed for >90 days.

---

## 4. Decay, expiration, and reinforcement

Three signals govern a memory's weight:

### 4.1 Decay function

```
effectiveWeight = baselineWeight × decay(daysSinceLastSeen)
```

Where `decay(t)` is a half-life curve with a half-life of **30 days** for user-scope memories, **60 days** for team-scope, **180 days** for workspace-scope. Rationale: individual taste shifts faster than team conventions, which shift faster than company policy.

```typescript
function decay(daysSinceLastSeen: number, halfLifeDays: number): number {
  return Math.pow(0.5, daysSinceLastSeen / halfLifeDays);
}
```

A memory with baseline weight 1.0 at 30 days old = 0.5 effective weight in a user-scope retrieval. At 90 days = 0.125.

### 4.2 Reinforcement

When a retrieval hits a memory AND the new ICP regen decides to "use" that memory (confidence threshold), the retrieval service updates:
- `lastSeenAt = now()`
- `reinforceCount += 1`
- `weight = min(baselineWeight × (1 + log(reinforceCount)), baselineWeight × 3)` — capped so no single memory can dominate

This creates a positive feedback loop: memories that matter keep themselves alive.

### 4.3 Explicit expiration

`expiresAt` can be set explicitly:
- At creation for ephemeral memories (e.g., "we paused hiring in EMEA for Q2 2026")
- By the user through a "Forget this memory" button in the UI (sets `expiresAt = now()`)
- By the cleanup job for workspace-wide policy changes

A daily background sweep hard-deletes memories past their `expiresAt`.

### 4.4 Never-expire memories

Rare but supported. User explicitly pins a memory. `expiresAt = null`. Decay still applies to weight. A user's workspace might have ~5–10 pinned memories total.

---

## 5. Memory synthesis — turning raw events into facts

Raw `CandidateInteraction` + `AgentCandidate` triage decisions are too noisy to feed directly into LLM prompts. They need to be distilled into structured facts.

### 5.1 When synthesis happens

**Batched, not real-time.** A background worker runs every 15 minutes per active user, processing new events since the last synthesis. Not on every click — that would thrash the LLM.

### 5.2 The synthesis LLM call

Input:
- User's last N AgentCandidate triage decisions with metadata
- User's last N CandidateInteraction events with dwell/scroll data
- Current `UserRecruiterProfile` (for context)
- Similar past decisions via embedding retrieval (bootstrap once the table has data)

Output:
- Array of distilled `MemoryEntry` candidates: `{content, kind, weight, jobContext, expiresAt}`
- The LLM is prompted to produce specific, actionable memories, not generic observations
- Examples:
  - ❌ "The user likes engineers" → too generic
  - ✅ "The user consistently rejects candidates with 3+ short stints (<12mo) in backend engineering roles" → specific, actionable, retrievable

### 5.3 Deduplication

Before persisting a new memory, compute embedding similarity to existing memories with the same scope+kind. If similarity > 0.85 to an existing memory:
- Don't create a new row
- Instead **reinforce** the existing one (update lastSeenAt, bump reinforceCount)

This prevents memory table bloat and rewards consistency.

---

## 6. Retrieval algorithm

Used by `IdealProfileService.generateForAgent()` to pull context for the next ICP regen.

### 6.1 Query formation

Build a natural-language query from the context of the regen:
```
"Evaluate a candidate for: {jobTitle} at {companySize or workspace.companyName}.
 Requirements: {hardRequirements narrative + instructions}.
 Current criteria: {criteria list}."
```

Embed this query via the same embedding model used for memory storage.

### 6.2 Multi-scope fetch

Parallel queries to:
- All `MemoryEntry` where scope=user AND scopeId=userId (no filter — filter happens client-side by score)
- All scope=team AND scopeId IN optedInTeamIds
- All scope=workspace AND scopeId=workspaceId
- All scope=job AND scopeId=jobId

Bounded by: `WHERE expiresAt IS NULL OR expiresAt > NOW()` to skip expired rows. Limit 500 per scope (hard cap to bound memory cost).

### 6.3 Ranking

For each candidate memory:
```
score = cosine(queryEmbedding, memory.embedding)
      × effectiveWeight(memory)
      × scopeBoost(memory.scope)
```

Where `scopeBoost` is:
- `job` → 1.5 (most specific)
- `user` → 1.2
- `team` → 1.0
- `workspace` → 0.8 (least specific, broadest)

### 6.4 Top-K selection

Return top 15 memories. Typical split: 8 user, 3 team, 2 workspace, 2 job. The exact split depends on scores but we cap per-scope to prevent one scope from drowning out others.

### 6.5 Prompt injection

Retrieved memories are formatted as a "Prior learnings" section in the ICP regen prompt:

```
## Prior learnings (top 15 from your history, ranked by relevance)
1. [USER, weight 2.8, seen 4×] You prefer ex-FAANG engineers who later joined startups.
2. [WORKSPACE, weight 1.5] Our company doesn't hire without a 6-month minimum tenure.
3. [JOB, weight 1.2] For this specific role, we need Kubernetes production experience.
...
```

The LLM is instructed to weight these learnings alongside the current job's triage data.

---

## 7. API surface

### 7.1 Memory CRUD (admin + user)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/memory?scope=user` | List memories for the current user |
| `GET` | `/api/v1/memory/:id` | Detail + embedding + history |
| `PATCH` | `/api/v1/memory/:id` | Edit content OR disable (weight=0) |
| `DELETE` | `/api/v1/memory/:id` | Forget immediately (set expiresAt=now) |
| `POST` | `/api/v1/memory/:id/pin` | Never-expire |
| `POST` | `/api/v1/memory/:id/unpin` | Restore decay |

### 7.2 User recruiter profile

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/user-recruiter-profile` | Current user's aggregate profile |
| `POST` | `/api/v1/user-recruiter-profile/rebuild` | Force rebuild now (debounced server-side) |
| `DELETE` | `/api/v1/user-recruiter-profile` | Reset — user goes back to cold-start |

### 7.3 Candidate interaction ingest

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/candidate-interactions` | Batch ingest — body: `{events: [{eventType, candidateId, durationMs?, metadata?}]}` |

Batched endpoint. Frontend hook buffers events locally and flushes every 5s or when buffer hits 50 events.

### 7.4 Team sharing

| Method | Path | Purpose |
|---|---|---|
| `PATCH` | `/api/v1/teams/:id/memory-sharing` | Admin only — enable/disable for team |
| `POST` | `/api/v1/teams/:id/memory-sharing/subscribe` | Per-user opt-in |
| `POST` | `/api/v1/teams/:id/memory-sharing/unsubscribe` | Per-user opt-out |

### 7.5 Memory retrieval (internal only)

Not an HTTP endpoint — a service method `contextRetrievalService.retrieveForICPRegen(agentId, k=15)`. Called by `IdealProfileService.generateForAgent()`. Emits `memory.retrieved` activity events with the top-K content for audit.

---

## 8. Privacy & compliance

### 8.1 Data retention
- `CandidateInteraction` raw events: 90 days, then aggregated into synthesized memories and deleted
- `MemoryEntry`: governed by `expiresAt` + decay
- Audit trail (AgentActivityLog `memory.*` events): indefinite — immutable audit
- **"Delete my account" flow must cascade-delete all three**

### 8.2 Memory content is sensitive
- **Not** shown to anyone outside the owning scope
- Admin monitoring tools should NEVER expose raw memory content (aggregate stats only)
- Exception: admin debugging for a specific user's agent must require the user's explicit consent

### 8.3 Legal field leak risk
The synthesizer LLM could produce a memory like "Prefers candidates under 35" from implicit signals. **Mitigation**: every synthesized memory passes through a pre-persist validator that rejects content matching the legal blocklist (`age`, `gender`, `race`, `religion`, `nationality`, `marital`, `pregnan*`). If a memory is rejected, it's logged as `memory.synthesis.rejected` for audit and dropped.

This is the same blocklist that `hardRequirementsFilter.ts` uses — DRY it into a shared lib.

### 8.4 Cross-agent visibility
A recruiter's user-scope memories are strictly private. Admins can see their *existence* (for cost/audit) but not *content* unless the user opts in via a support ticket.

---

## 9. Phased rollout

### 9.1 Phase 7a — Foundation (ship this first)

- Add the three Prisma tables: `UserRecruiterProfile`, `CandidateInteraction`, `MemoryEntry`
- Add `Agent.agentInheritsFromProfile`
- Build `UserRecruiterProfileService`:
  - `rebuildForUser(userId)` — aggregates across all the user's `AgentIdealProfile` rows
  - `getForUser(userId)` — returns current profile or null
- Hook into `IdealProfileService.generateForAgent()`:
  - **After** persisting a new ICP version, enqueue a profile rebuild (throttled 60s)
- Hook into `POST /agents` (create agent):
  - If `agentInheritsFromProfile === true` AND the user has a profile, seed the new agent's initial `AgentIdealProfile` from the profile (version 1, synthetic)
- Backend API: `GET /user-recruiter-profile`, `POST /user-recruiter-profile/rebuild`, `DELETE /user-recruiter-profile`
- Frontend: new "Your recruiter profile" section in the profile settings page, showing the aggregated taste

**What ships**: cross-agent learning for explicit triage signals only. No embeddings, no retrieval, no implicit signals yet.

### 9.2 Phase 7b — Implicit signals

- Add `CandidateInteraction` ingest endpoint
- Frontend hook `useCandidateInteractionTracker()` that emits events from candidate cards and profile detail:
  - `viewed` when card enters viewport for ≥2s
  - `expanded` on click to full detail
  - `dwell` on detail view (report duration on unmount)
  - `contact_copied` when email/phone copied
  - `link_clicked` when external link opened
- Wire the hook into `CandidateCard`, `ReviewProfilesView`, and the talent hub candidate detail
- Batched + debounced — buffer 50 events or flush every 5s, whichever first
- **No synthesis yet** — events are captured but not yet turned into memories

### 9.3 Phase 7c — Memory synthesis + retrieval

- Build `ContextRetrievalService` with cosine similarity in JS
- Embedding adapter (`embedText(s: string): Promise<number[]>`) — starts with OpenAI `text-embedding-3-small` (1536 dims) via the existing `LLMService`
- Build `MemorySynthesisWorker` — background job that runs every 15 min, processes recent AgentCandidate + CandidateInteraction events, calls LLM to distill memories, deduplicates, persists
- Wire into `IdealProfileService.generateForAgent()` — add a "Prior learnings" section to the prompt
- Memory-CRUD UI: list/edit/delete/pin memories in the profile settings
- Team-sharing UI: subscribe/unsubscribe toggle in the team admin page

### 9.4 Phase 7d — mem0 evaluation

- The research agent's `docs/mem0-evaluation.md` report
- Decide: native / hybrid / adopt
- If adopting: wrap mem0 behind `ContextRetrievalService` so the interface stays stable
- If hybrid: use mem0 as a secondary retrieval backend, compare recall quality
- If skipping: document why (likely reason: Node.js ecosystem fit, our simpler stack)

---

## 10. Risks & open issues

### 10.1 LLM cost
Synthesis is a new LLM call per user every 15 min × many users. Bounded by:
- Skip users with zero new events since last synthesis
- Only synthesize when there's ≥3 new interactions
- Use the cheaper model (`gemini-flash`, not `gpt-4o`)
- Cap synthesis output to 10 memories per run to avoid runaway costs

**Estimated cost per 1000 active users**: ~$5/day with Gemini Flash.

### 10.2 Volume of CandidateInteraction rows
50M rows/week at 10k users is real. Phase 7b v1 uses a simple retention policy (90 days then aggregate + delete). Phase 7.5 should evaluate partitioning or moving to a time-series store (ClickHouse?).

### 10.3 Embedding model lock-in
Mixing embeddings from different models (e.g., migrating from `text-embedding-3-small` to `text-embedding-3-large`) breaks cosine similarity. Options:
- Store `embeddingModel` on each MemoryEntry and filter retrieval by model
- Batch-recompute on migration (expensive but clean)

### 10.4 Legal blocklist bypass via synthesis
An LLM could generate a memory like "Prefers candidates from top 5 Chinese universities" that passes the field-name blocklist but is functionally discriminatory. Mitigation: periodic admin review of top-weighted user memories, with a "flag for review" button.

### 10.5 User trust
Users may feel uncomfortable knowing the system is synthesizing inferences from their behavior. Mitigation: transparent UI, easy "forget" button, no synthesis happens unless the user has explicitly enabled "Learn from my behavior" in settings.

### 10.6 Team memory conflicts
What if Sarah's team-shared memory contradicts Wei's user memory ("prefers US-based" vs "open to Europe")? **Resolution**: user-scope memories always override team-scope memories for that user. Team memories only fill gaps.

---

## 11. Open questions for Kenny

1. **Synthesis frequency** — every 15 min feels right for active users but may be overkill. Should we make it event-driven (triggered after N interactions) or time-based?
2. **Embedding provider** — OpenAI `text-embedding-3-small` ($0.02/1M tokens) is cheapest. Google Gemini has embeddings too. Should we prefer the provider we're already using for matching (whatever `LLM_PROVIDER` is set to), or pick independently?
3. **Memory editing by user** — should users be able to hand-write memories, or only edit/delete LLM-synthesized ones? My lean: both — advanced users benefit from explicit control.
4. **"Start fresh" affordance** — when a user hits a new company or pivots roles, they may want to purge all learned memories. Confirm this is a supported flow (`DELETE /user-recruiter-profile` cascades to `DELETE FROM MemoryEntry WHERE scope='user'`).
5. **Phase 7a minimum viable** — if we ship 7a only (no retrieval, no synthesis), is the profile-page readout + warm-start seeding alone valuable? My lean: yes — it's a meaningful improvement even without the embedding layer.
6. **Per-team admin roles** — who can create workspace-scope memories? Team admin? Workspace admin? Just the user who owns the workspace?
7. **Audit for privacy** — should every memory retrieval emit an activity log event, or only synthesis/reinforcement? (Cost vs auditability tradeoff.)

---

## 12. Success metrics

How do we know Phase 7 is working?

1. **Cold-start accuracy** — new-agent first-run like rate on Day 30 should exceed 70% (vs Phase 6 baseline of ~50%)
2. **ICP stability** — time for a new agent to reach confidence ≥ 0.6 should drop from 3 regens to 1
3. **Memory reinforcement rate** — at least 40% of retrieved memories are reinforced within 30 days (indicator that retrieval is surfacing useful content)
4. **User control usage** — <5% of users delete their entire `UserRecruiterProfile` (indicator that users trust the learning)
5. **Synthesis cost** — <$10/user/month at p95

---

## 13. Glossary

- **User recruiter profile**: cross-agent aggregate of one recruiter's taste
- **Memory entry**: a single semantic fact with scope, embedding, decay
- **Scope**: the visibility level — user / team / workspace / job
- **Decay**: automatic weight reduction over time; half-life varies by scope
- **Reinforcement**: a retrieved memory gets its weight boosted when the ICP uses it
- **Synthesis**: the background LLM call that turns raw events into memory entries
- **Retrieval**: the semantic similarity search that pulls relevant memories for an ICP regen
- **Warm-start**: a new agent inherits preferences from the user's profile instead of starting blank
- **Opt-in team sharing**: a user must explicitly subscribe to a team's shared memories
- **Embedding**: a high-dimensional vector representation of text used for semantic similarity

---

## Appendix A — Why not just dump raw events into the LLM prompt?

Naive approach: "here's the user's last 500 triage decisions, now generate the ICP." Fails because:
1. **Context window blow-up** — 500 candidates × 200 tokens each = 100k tokens just in examples
2. **No decay** — Monday's preferences get the same weight as today's
3. **No cross-agent memory** — only the current agent's history is visible
4. **No implicit signals** — click/dwell data never reaches the LLM
5. **No scoping** — team/workspace preferences invisible

Phase 7 solves all five with a retrieval layer and a synthesis step.

## Appendix B — Why not just use mem0?

We're researching this in parallel (see `docs/mem0-evaluation.md`). Likely outcomes:
- **Adopt**: if mem0 covers our requirements with lower total complexity than native, use it behind a `MemoryService` abstraction
- **Hybrid**: build native, mirror mem0's API surface so we could swap later
- **Skip**: if mem0 is Python-first and integrates poorly with our Node.js stack, or if it doesn't support our scope hierarchy, build native

Either way, the abstractions in this doc (`MemoryEntry`, `ContextRetrievalService`, scopes, decay) are the same. Only the storage + retrieval backend differs.
