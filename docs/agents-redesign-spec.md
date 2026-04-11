# Agents Workbench — Product & Architecture Spec

**Status**: Draft v5 · Phase 7 (context engineering) + Admin Memory Manager shipped
**Owner**: Kenny
**Last updated**: 2026-04-12
**Related**: [tasks-system.md](./tasks-system.md) · [agent-alex.md](./agent-alex.md) · [api-agents.md](./api-agents.md) · [agents-terminal.md](./agents-terminal.md) · [agents-scheduler.md](./agents-scheduler.md) · [icp-product-spec.md](./icp-product-spec.md) · [icp-design.md](./icp-design.md) · [icp-architecture.md](./icp-architecture.md) · [context-engineering-v7.md](./context-engineering-v7.md) · [mem0-evaluation.md](./mem0-evaluation.md) · [agents-user-guide-zh.md](./agents-user-guide-zh.md) · [agents-changelog.md](./agents-changelog.md)

> **Phase 7 reader pointer.** The memory layer data model, scope hierarchy, decay half-lives, synthesis algorithm, retrieval algorithm, privacy rationale, and phased rollout (7a / 7b / 7c / 7d) live in [context-engineering-v7.md](./context-engineering-v7.md). The "why build native vs adopt mem0" decision record lives in [mem0-evaluation.md](./mem0-evaluation.md). The recruiter-facing Chinese user guide is [agents-user-guide-zh.md](./agents-user-guide-zh.md). This spec summarizes the what-shipped surface (data model, endpoints, rollout) and links out to each source of truth.

---

## 1. Vision

RoboHire's Agents feature lets a recruiter **"hire" an AI agent** to execute a recruitment task autonomously. Today the product exposes two task types (`search_candidates`, `match_resumes`); the roadmap is to expand to the full recruitment workflow — screening, outreach, scheduling, negotiation, offer — until **100% of the pipeline can run agent-to-agent** with the human as supervisor rather than operator.

The agents are backed by **remote OpenClaw instances** that own the candidate-facing communication channel. OpenClaw is an HTTP-wrapped chat service: RoboHire POSTs messages to OpenClaw; OpenClaw handles delivery and writes activity/status back to RoboHire's Neon database so every touchpoint is auditable in one place.

### Design north star

> **Every capability in this feature must be usable by a human through the UI *and* by another agent through a stable API, with the same permissions and audit trail.**

No UI-only shortcuts, no backend-only cron jobs. If a human can click it, an agent can call it, and vice versa. The DB is the single source of truth for what an agent did, whether the actor was human, a RoboHire agent, or a remote OpenClaw agent.

---

## 2. Personas & permissions

| Role | Create agents on | See agent runs from | Act on candidates in |
|---|---|---|---|
| **Recruiter** (regular) | Own jobs only | Own agents | Own agent runs |
| **Team member** (`teamView`) | Own jobs | Own + teammates (read-only for others) | Own agent runs |
| **Internal** (`isInternal`) | Own jobs | Own agents | Own agent runs |
| **Admin** (`isAdmin = true`) | **Any user's jobs** | All agents system-wide | Any agent run |

Permission enforcement reuses `getVisibilityScope()` + `buildUserIdFilter()` from `backend/src/lib/teamVisibility.ts`. The agent-creation job dropdown is gated on the backend: `GET /api/v1/agents/jobs-available` returns the list the caller may scope to — the frontend never decides this.

---

## 3. Glossary

| Term | Meaning |
|---|---|
| **Agent** | A persistent, named configuration owned by a user, scoped to one Job, with a task type and instructions. Not a process — a record. |
| **Agent Run** | A single execution of an Agent. Produces a set of `AgentCandidate` results. An Agent can have many runs over time. |
| **Task type** | The capability the agent performs. V1: `search_candidates`, `match_resumes`. V2+: `screen`, `outreach`, `schedule`, `evaluate`, `negotiate`. |
| **Source** | Where candidates come from during a `search_candidates` run. V1 supports three: `instant_search` (current `InstantSearchMatchService`), `internal_minio` (MinIO resume repository), `external_api` (third-party APIs). |
| **OpenClaw** | Remote HTTP-based chat service that owns the candidate communication channel. Writes activity back to RoboHire's Neon DB via a webhook/ingest API. |
| **Activity** | A single fine-grained event in an agent's lifecycle: sourced, scored, liked, invited, sent, delivered, replied, errored. Logged to `AgentActivityLog`. |
| **Outreach** | Any candidate-facing action: interview invite, email, IM. Unified under one `Outreach` table with a channel discriminator. |

---

## 4. User journey (v1)

### 4.1 Create agent

1. User clicks **"Hire an Agent"** from `/product/agents`.
2. Modal opens with fields:
   - **Name** (required)
   - **Job** (required, searchable dropdown from `/agents/jobs-available`)
   - **Task** (required: Search Candidates / Match Resumes)
   - **Candidate source** (required for `search_candidates`, hidden for `match_resumes`): multi-select — `instant_search`, `internal_minio`, `external_api` — filtered to only sources the admin has enabled globally (see §9)
   - **Search criteria** (required, **auto-growing + user-resizable** textarea)
   - **Instructions** (optional, **auto-growing + user-resizable** textarea)
   - **Schedule** (optional): Off / Every hour / Every day at HH:MM / Weekly / Custom cron — v1 ships with a **real scheduler** (see §8.4)
3. Submit → `POST /api/v1/agents` → agent lands on dashboard, inactive until first run (or waits for its schedule).

Auto-grow behavior: textareas grow with content up to `max-height: 40vh`; user can still drag-resize vertically. Implemented with shared `<AutoGrowTextarea>` (ref + `scrollHeight` on input; `resize-y` CSS).

### 4.2 Run agent

1. User clicks **Run** or the scheduler fires → creates an `AgentRun` row, streams results via SSE (reusing the pattern from `InstantSearchMatchService`).
2. Detail drawer opens with four tabs: **Results · Runs · Activity · Settings**.
3. **Results** tab streams candidate cards in as they arrive. Status chip at top: `queued → running → completed | failed`.
4. **Activity** tab shows the raw `AgentActivityLog` timeline — every sourced-scored-liked-invited-sent-delivered-replied event, including activities written by OpenClaw. This is the audit trail.

### 4.3 Triage results

Horizontal card lane. Keyboard shortcuts: `J = dislike`, `K = like`, `L = open detail`.

- **Search Candidates card**: name, headline, location, current role, match score, LLM "why this candidate" one-liner, source badge (`instant_search | minio | external`).
- **Match Resumes card**: candidate, fit score, top 3 matching skills, top 1 gap, link to full `MatchResultDisplay`.

Actions: `Like` / `Dislike` → `PATCH /agents/:id/candidates/:candidateId { status }`. Dislike fades out after 300ms. Top bar filter: All · Liked · Disliked · Acted on. Soft-delete only.

### 4.4 Act on liked candidates

Sticky action bar once ≥1 candidate is liked:

```
[👍 3 liked]   [📅 Invite to Interview]   [✉ Contact via Email]   [💬 Send Message]   [⋯]
```

Actions work on single-select or multi-select. Each action posts to a **dual-interface** endpoint (see §7).

#### 4.4.1 Invite to Interview

- Reuses `POST /api/v1/invite-candidate`.
- New wrapper `POST /api/v1/agents/:id/candidates/:candidateId/invite` persists an `Invitation` row linking `AgentCandidate → Invitation → (future) Interview`.
- When the candidate completes the interview, `routes/interviews.ts` fires an event that back-links `Interview.invitationId`. The agent dashboard then shows a closed funnel: "3 invited → 2 interviewed → 1 hired".
- Status transitions: `liked → invited → interviewed → {hired | rejected}`.

#### 4.4.2 Contact via Email

- Opens **EmailComposer** modal.
- Step 1: user picks a template (library in §10 — not limited to 5).
- Step 2: backend calls new `OutreachEmailAgent` (`BaseAgent` subclass, temperature `0.7`), drafts body from `{candidate, job, template, agent.instructions, recruiter.signature}`.
- Step 3: user edits in rich-text area; Save Draft or Send Now.
- Step 4: Send → Resend API (existing `EmailService.send()`); persists an `Outreach` row with `channel='email'`, `status ∈ {draft, queued, sent, delivered, replied, bounced}`.
- Drafts live in DB (not localStorage) so an agent can resume a human draft and vice versa.

#### 4.4.3 Send Message (OpenClaw)

- Opens compact chat composer.
- Backend POSTs to `OpenClawClient.sendMessage({ candidateId, body, metadata })`.
- OpenClaw accepts the message, owns delivery on whatever channel it's configured for, and writes back status + replies to RoboHire via the **OpenClaw ingest API** (see §9).
- `Outreach.thread` JSON accumulates the full conversation — outbound and inbound — so the agent has durable context for follow-ups.

---

## 5. Data model changes

New + modified tables in `backend/prisma/schema.prisma`.

### 5.1 Modified: `Agent`

Add columns:
- `taskType` — stays string; expand accepted values
- `source Json?` — `{ modes: ['instant_search', 'internal_minio', 'external_api'], externalApiConfigId?: string }`
- `schedule String?` — cron expression, e.g. `0 9 * * *`
- `scheduleEnabled Boolean @default(false)`
- `nextRunAt DateTime?`
- `autonomy String @default("manual")` — `manual | scheduled | event`

### 5.2 New: `AgentRun`

```prisma
model AgentRun {
  id            String    @id @default(cuid())
  agentId       String
  agent         Agent     @relation(fields: [agentId], references: [id], onDelete: Cascade)
  triggeredBy   String    // 'user' | 'schedule' | 'event' | 'agent' | 'openclaw'
  triggeredById String?   // userId, parent runId, or openclaw delivery id
  status        String    // 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  startedAt     DateTime?
  completedAt   DateTime?
  error         String?
  stats         Json?     // { sourced, matched, liked, disliked, invited, emailed, messaged }
  // Comprehensive logging columns (Phase 5) — populated at run completion
  tokensIn      Int       @default(0)
  tokensOut     Int       @default(0)
  costUsd       Float     @default(0)
  llmCallCount  Int       @default(0)
  avgLatencyMs  Int       @default(0)
  durationMs    Int       @default(0)
  createdAt     DateTime  @default(now())
  candidates    AgentCandidate[]
  activities    AgentActivityLog[]
  @@index([agentId, createdAt])
  @@index([status])
}
```

**Comprehensive run metrics (Phase 5)**: the six explicit columns (`tokensIn`, `tokensOut`, `costUsd`, `llmCallCount`, `avgLatencyMs`, `durationMs`) are populated at run completion by summing/averaging the matching `llm.call.completed` events captured via `AgentActivityLogger` for the run. `stats` Json remains the flexible bag for funnel counts; the columns above are pulled out for cheap indexed queries from the admin terminal, dashboards, and cost analytics. `durationMs` is computed from `completedAt - startedAt` on finalization. A failed run still sets these fields to the partial totals observed before failure so cost analysis isn't lost.

### 5.3 New: `AgentActivityLog`

**This is the durable audit log you asked for.** OpenClaw writes here via ingest API (§9).

```prisma
model AgentActivityLog {
  id          String    @id @default(cuid())
  agentId     String
  runId       String?
  candidateId String?   // AgentCandidate.id
  actor       String    // 'system' | 'user:<id>' | 'agent:<id>' | 'openclaw:<instanceId>'
  eventType   String    // see taxonomy below
  severity    String    @default("info")  // 'debug' | 'info' | 'warn' | 'error'
  message     String?
  payload     Json?     // arbitrary structured data for the event
  errorCode   String?
  errorStack  String?
  createdAt   DateTime  @default(now())
  agent       Agent           @relation(fields: [agentId], references: [id], onDelete: Cascade)
  run         AgentRun?       @relation(fields: [runId], references: [id], onDelete: Cascade)
  @@index([agentId, createdAt])
  @@index([runId, createdAt])
  @@index([candidateId])
  @@index([eventType, createdAt])
  @@index([severity, createdAt])
}
```

**Event type taxonomy** (extensible — add values as new capabilities ship):

| Category | eventType |
|---|---|
| Run lifecycle | `run.queued`, `run.started`, `run.completed`, `run.failed`, `run.cancelled` |
| Sourcing | `source.instant_search.hit`, `source.minio.hit`, `source.external_api.hit`, `source.error` |
| Scoring | `match.scored`, `match.rejected_below_threshold` |
| LLM calls | `llm.call.started`, `llm.call.completed`, `llm.call.failed` |
| Triage | `candidate.liked`, `candidate.disliked`, `candidate.archived` |
| Invitation | `invite.sent`, `invite.opened`, `invite.accepted`, `invite.expired`, `interview.linked` |
| Email | `email.draft_created`, `email.sent`, `email.delivered`, `email.bounced`, `email.replied` |
| OpenClaw IM | `im.sent`, `im.delivered`, `im.read`, `im.replied`, `im.failed` |
| Errors | `error.llm`, `error.http`, `error.validation`, `error.auth` |

**LLM call event payloads** (Phase 5): every resume scoring / outreach drafting / parse call is wrapped with a `llm.call.started` + (`llm.call.completed` | `llm.call.failed`) pair so the admin terminal and cost rollups see every model invocation in real time.

- `llm.call.started` — payload: `{ sequence, model, provider, promptTokens: <estimate>, purpose }`. Emitted immediately before dispatch.
- `llm.call.completed` — payload: `{ sequence, model, provider, promptTokens, completionTokens, costUsd, latencyMs }`. Emitted on response; sums of these feed `AgentRun.tokensIn/Out/costUsd/llmCallCount/avgLatencyMs` on finalization.
- `llm.call.failed` — payload: `{ sequence, model, provider, errorCode, latencyMs }`. Counts toward `llmCallCount` but contributes zero tokens/cost.

**Sequence**: `AgentActivityLogger` assigns a monotonically increasing integer per-run into `payload.sequence` for every emitted event, so the admin terminal (§7.8) can replay a run's LLM calls in dispatch order even when activities arrive out of order due to async batching. The counter is per `runId`; events without a `runId` (e.g. scheduler fires before a run exists) use a separate agent-scoped sequence.

### 5.4 Modified: `AgentCandidate`

Add columns:
- `runId String?` → FK to `AgentRun`
- `status` expanded: `pending | liked | disliked | invited | contacted | messaged | interviewed | hired | rejected | archived`
- `source String?` — which source produced this candidate
- `reason String?` — LLM "why this candidate" one-liner
- `metadata Json?` — per-task extras (matched skills, external profile URL, etc.)

### 5.5 New: `Invitation`

```prisma
model Invitation {
  id                String    @id @default(cuid())
  agentCandidateId  String?
  agentCandidate    AgentCandidate? @relation(fields: [agentCandidateId], references: [id])
  resumeId          String?
  jobId             String
  invitedByUserId   String?
  invitedByAgentId  String?
  channel           String    // 'email' | 'sms' | 'openclaw'
  loginUrl          String?
  qrcodeUrl         String?
  sentAt            DateTime  @default(now())
  acceptedAt        DateTime?
  interviewId       String?   @unique
  interview         Interview? @relation(fields: [interviewId], references: [id])
  status            String    // 'sent' | 'opened' | 'accepted' | 'expired' | 'cancelled'
  @@index([jobId, sentAt])
}
```

### 5.6 New: `Outreach`

```prisma
model Outreach {
  id                 String    @id @default(cuid())
  agentCandidateId   String?
  resumeId           String?
  jobId              String?
  initiatedByUserId  String?
  initiatedByAgentId String?
  channel            String    // 'email' | 'openclaw' | 'sms' | 'linkedin'
  templateKey        String?
  subject            String?
  body               String
  thread             Json?     // [{ role, body, at, externalId? }]
  status             String    // 'draft' | 'queued' | 'sent' | 'delivered' | 'replied' | 'bounced' | 'failed'
  externalId         String?   // Resend msg id, OpenClaw delivery id
  sentAt             DateTime?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
  @@index([agentCandidateId, createdAt])
  @@index([channel, status])
  @@index([externalId])
}
```

### 5.7 New: `ExternalSourceConfig`

Admin-managed config for third-party candidate APIs (LinkedIn, GitHub, job boards, etc.). Used by `source='external_api'`.

```prisma
model ExternalSourceConfig {
  id          String   @id @default(cuid())
  name        String   // human label, e.g. "LinkedIn Recruiter"
  provider    String   // 'linkedin' | 'github' | 'seekout' | 'fetcher' | 'custom'
  enabled     Boolean  @default(true)
  baseUrl     String
  authType    String   // 'api_key' | 'oauth' | 'basic'
  credentials Json     // encrypted at rest
  config      Json?    // provider-specific knobs
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([enabled, provider])
}
```

### 5.8 New: `SourceConfig` (per-tenant toggle)

Feature-flag style per-workspace toggles for the three sources. Lets admin enable/disable per workspace.

```prisma
model SourceConfig {
  id                 String   @id @default(cuid())
  workspaceId        String?  // null = global default
  instantSearchEnabled Boolean @default(true)
  internalMinioEnabled Boolean @default(false)
  externalApiEnabled   Boolean @default(false)
  minioBucket          String?  // override default
  updatedAt            DateTime @updatedAt
  @@unique([workspaceId])
}
```

### 5.9 Modified: `Interview`

Add `invitationId String? @unique` so back-link closes the loop when a candidate completes.

### 5.10 New: `AgentCriteriaPreset`

Reusable sets of evaluation criteria that recruiters build up over time — "senior backend engineer · Python · FinTech" — and attach to new agents without retyping. Presets are bucket-aware so users can pin "most important" and "least important" items separately. Criteria are the free-text items a recruiter would otherwise put into the agent's **Search criteria** textarea; turning them into structured presets lets the LLM treat them as a checklist and lets the UI render them as chips.

```prisma
model AgentCriteriaPreset {
  id         String   @id @default(cuid())
  userId     String
  name       String
  criteria   Json     // Array of { id, text, pinned, bucket: 'most'|'least' }
  scope      String   @default("private") // 'private' | 'shared'
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([scope])
}
```

**Scope semantics**:
- `private` — visible and editable only to the owning `userId`. Default for new presets.
- `shared` — visible to every user in the same workspace (read for all, write for the owner or any `isAdmin`). Shared presets let a team standardize on canonical "gold" criteria for common roles. The list endpoint unions `{ userId = req.user.id } ∪ { scope = 'shared' }` scoped by the caller's workspace.

**Routes** (under `/api/v1/agents/criteria-presets`):

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/agents/criteria-presets` | List presets visible to caller. Query params: `?scope=private|shared|all` (default `all`), `?q=` for name search. |
| `POST` | `/agents/criteria-presets` | Create a preset. Body: `{ name, criteria, scope? }`. |
| `DELETE` | `/agents/criteria-presets/:id` | Delete. Owner or admin only. |

Presets are referenced by id at **agent create time** — the create modal writes the resolved criteria into the agent's own fields, so later preset edits don't retroactively mutate existing agents. This keeps run history reproducible.

### 5.11 New: `AgentIdealProfile` (Phase 6)

The versioned LLM-inferred profile that closes the learning loop. Rebuilt from Like / Dislike history by `IdealCandidateProfileAgent`, persisted once per regeneration, injected into every subsequent matching run. See [icp-architecture.md §1.1](./icp-architecture.md) for the full rationale and [icp-product-spec.md §4.1](./icp-product-spec.md) for the product definition.

```prisma
model AgentIdealProfile {
  id                        String   @id @default(cuid())
  agentId                   String
  userId                    String   // denormalized for cheap visibility checks
  version                   Int      @default(1)
  profile                   Json     // IdealCandidateProfile shape (see icp-architecture.md §2)
  suggestedHardRequirements Json?    // LLM-proposed rules awaiting user approval
  narrativeSummary          String?  @db.Text
  confidence                Float    @default(0)
  generatedFromLikes        Int      @default(0)
  generatedFromDislikes     Int      @default(0)
  reasoningTrace            String?  @db.Text
  tokensIn                  Int      @default(0)
  tokensOut                 Int      @default(0)
  costUsd                   Float    @default(0)
  llmModel                  String?
  llmProvider               String?
  generatedAt               DateTime @default(now())
  updatedAt                 DateTime @updatedAt

  agent                     Agent    @relation(fields: [agentId], references: [id], onDelete: Cascade)
  user                      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([agentId, version])
  @@index([agentId, version])
  @@index([userId])
}
```

**Design decisions.**

- **Keep all versions** — `@@unique([agentId, version])` enforces monotonic versioning. The "current" ICP is `MAX(version) WHERE agentId = ?`. Soft-revert copies an old version forward as `max + 1` rather than rewinding the counter, so the audit trail stays linear.
- **Hard requirements live elsewhere.** Enforced rules are on `Agent.config.hardRequirements`; LLM suggestions live on `AgentIdealProfile.suggestedHardRequirements`. Promotion from suggestion to enforced is an explicit `POST /ideal-profile/promote-suggestion` action — never implicit.
- **Per-version cost accounting.** `tokensIn`, `tokensOut`, `costUsd`, `llmModel`, `llmProvider` mirror the Phase 5 `AgentRun` shape so a single admin analytics query can attribute ICP regen cost alongside run cost.
- **`reasoningTrace` is audit-only.** Truncated at ~8 KB on insert, rendered in the admin trace view, not the recruiter UI. Surfacing it by default bloats the drawer without helping the user.

**Inverse relations.** Both `Agent` and `User` gain back-links (`idealProfiles AgentIdealProfile[]` and `agentIdealProfiles AgentIdealProfile[]` respectively) so cascade deletes clean up versions when an agent or user is removed.

**`Agent.config` addition.** The existing free-form `config Json?` field gains two nested keys — no schema migration required:

```typescript
interface AgentConfig {
  // existing
  criteria?: AgentCriterion[];
  resumeIds?: string[];
  // Phase 6
  hardRequirements?: HardRequirement[];   // enforced rules, user-owned
  icpSettings?: {
    autoRegenAfterTriageActions?: number; // 0 = manual only (v1 default)
    autoApply?: boolean;                   // v2+
  };
}
```

`HardRequirement[]` shape and operators are documented in full in [icp-architecture.md §3](./icp-architecture.md). Validation (field × operator type matrix, legal blocklist, max 20 rules) runs at the `PATCH /hard-requirements` endpoint.

### 5.12 New: `UserRecruiterProfile` (Phase 7a)

Rolled-up aggregate of a user's taste across all their agents. One row per user (`userId @unique`). Rebuilt — not incrementally updated — whenever any of their `AgentIdealProfile` rows change; throttled to at most once per 60s per user via a debounce in `UserRecruiterProfileService`. JSON-first by design because the aggregate shape evolves fast during Phase 7 and normalization is a premature optimization.

Full field list + rebuild trigger + rationale: [context-engineering-v7.md §2.1](./context-engineering-v7.md). Fields in brief: `topSkills`, `topAntiSkills`, `topLocations`, `topIndustries`, `topCompanySizes` (all frequency-weighted JSON arrays), `recurringHardReqs`, plus stats (`signalsLearned`, `agentCount`, `lastRebuiltAt`).

**`Agent` modification (Phase 7a)**: adds `agentInheritsFromProfile Boolean @default(true)`. Per-agent opt-out for users who deliberately want a clean-slate agent. Read at `POST /agents` time; if `true` and the user has a `UserRecruiterProfile`, `IdealProfileService.seedFromUserProfile()` writes a synthetic v1 `AgentIdealProfile` at `confidence = 0.35`.

### 5.13 New: `CandidateInteraction` (Phase 7b)

Append-only implicit-signal log. Feeds the (deferred) Phase 7c synthesis worker. Event shape: `eventType` ∈ `viewed | expanded | dwell | contact_copied | link_clicked | scroll_deep`, with `durationMs?` for dwell events and a freeform `metadata` JSON bag. Written exclusively through `POST /api/v1/candidate-interactions` where `userId` is always server-stamped from the session (never trusted from the body). 90-day retention target; cleanup job deferred.

Full schema + volume estimates: [context-engineering-v7.md §2.2](./context-engineering-v7.md). Frontend wiring: `useCandidateInteractionTracker` hook, currently attached to `ReviewProfilesView` only — other candidate surfaces pending.

### 5.14 New: `MemoryEntry` (Phase 7c)

The semantic memory primitive. `kind` ∈ `preference | rejection_pattern | hard_req_suggest | anchor | company_wide | synthesized_fact`. `scope` ∈ `user | team | workspace | job` — exactly one scope per row, with `scopeId` pointing at the owning entity (`userId | teamId | workspaceId | jobId`). `content` is the human-readable fact the LLM sees. `embedding` is a JSON-serialized `number[]` (1536-dim for OpenAI `text-embedding-3-small`); the pgvector migration is deferred until the synthesis worker actually populates rows.

`weight` + `baselineWeight` + `reinforceCount` + `lastSeenAt` + `expiresAt?` power the decay/reinforcement loop. `jobContext` JSON (`{jobTitle?, industry?, companySize?, role?}`) makes memories portable across similar-but-not-identical searches. `sourceEventId?` / `sourceAgentId?` preserve provenance.

Full schema + rationale + scope hierarchy + decay half-lives (`user 30d, team 60d, workspace 180d, job 45d`): [context-engineering-v7.md §2.3, §3, §4](./context-engineering-v7.md).

**Retrieval primitive** (`backend/src/services/memory/ContextRetrievalService.ts`, shipped in Phase 7c): `retrieveForRegen(query)` walks all applicable scopes in parallel, computes `score = cosineSim × decayedWeight × scopeBoost`, enforces per-scope caps (`user: 8, team: 3, workspace: 2, job: 2`), and returns the top-K. `formatForPrompt(memories)` emits the "Prior learnings" block for ICP prompt injection. Synthesis worker + embedding adapter + `IdealProfileService` integration are deferred.

### 5.15 New: `MemoryAdminAuditLog` (Phase 7.5)

Durable, immutable audit trail for every admin action against memory data. Written BEFORE the data read / write by `AdminMemoryService` so attempted access is captured even when the downstream Prisma query fails. Fields: `adminId`, `targetType` (`memory_entry | user_profile | interaction | user`), `targetId`, `action` (11 values: `view_profile | view_memories | view_interactions | edit_memory | delete_memory | pin_memory | unpin_memory | rebuild_profile | reset_profile | export | view_audit`), `reason?` (optional admin justification), `changes?` JSON diff (for edits), `ipAddress?`, `createdAt`.

The table is the governance backbone of the Admin Memory Manager break-glass UX. Rationale lives in [context-engineering-v7.md §8.2](./context-engineering-v7.md): memory content is sensitive, admin tools must not expose raw content except via a governed flow, and every touch must be auditable. Admin edits of memory content additionally pass through a legal-content blocklist mirroring `hardRequirementsFilter.LEGAL_BLOCKLIST`.

---

## 6. Candidate source adapters

Source adapters are pluggable implementations of a common interface:

```typescript
// backend/src/services/sources/CandidateSource.ts
export interface CandidateSource {
  readonly key: 'instant_search' | 'internal_minio' | 'external_api';
  search(input: SearchInput, ctx: SourceContext): AsyncIterable<SourceCandidate>;
}
```

### 6.1 `InstantSearchSource` (reuses existing)

Wraps `InstantSearchMatchService` behavior. Searches internal RoboHire resumes via the current matching pipeline. **V1 default enabled.**

### 6.2 `MinIOSource` (new)

Scans the MinIO bucket (`resume-originals` prefix by default) for resumes not yet indexed, parses them lazily via `ResumeParseAgent`, and yields candidates.

**Critical finding**: The repo currently uses `@aws-sdk/client-s3` in `ResumeOriginalFileStorageService.ts` with support for S3-compatible endpoints via `S3_ENDPOINT` + `S3_FORCE_PATH_STYLE`. **MinIO can be wired in by env config alone** — no new SDK needed. The `MinIOSource` adapter will reuse this client.

New env vars:
```
S3_ENDPOINT=https://minio.internal.robohire.io
S3_FORCE_PATH_STYLE=true
S3_BUCKET=robohire-resumes
MINIO_RESUME_PREFIX=resumes/
```

Behavior: adapter lists objects, filters by `LastModified > lastRunAt`, parses new ones, yields `SourceCandidate` entries. Results are cached in DB via `ResumeParsingCache`.

### 6.3 `ExternalApiSource` (new)

Dispatches to a provider-specific driver based on `ExternalSourceConfig.provider`. V1 drivers shipped: `custom` (HTTP POST + JSON contract), with `linkedin`/`github`/`seekout` as driver stubs for V2.

Each driver implements:
```typescript
interface ExternalSourceDriver {
  search(config: ExternalSourceConfig, input: SearchInput): AsyncIterable<SourceCandidate>;
}
```

The **custom** driver calls `POST {baseUrl}/search` with `{ criteria, limit }` and expects a standard response envelope; this lets admins onboard arbitrary search vendors without code changes.

### 6.4 Admin UI for source config

New admin tab at `/product/profile/admin/sources` (under the existing admin settings). Three toggles (one per source) plus a list of `ExternalSourceConfig` entries with CRUD. Only `isAdmin` users see it. Credentials are encrypted at rest via a new `CryptoService.encryptField()` helper.

---

## 7. API surface

All routes under `/api/v1`. **Every action route is dual-interface** — same auth, same audit, same request shape whether the caller is a human (session cookie) or an agent (API key). Routes are idempotent on retry via `Idempotency-Key` header.

### 7.1 Agent lifecycle

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/agents/jobs-available` | **New.** Jobs the caller can scope an agent to (§2). |
| `GET` | `/agents` | List (existing, extended with `runStatus`, `scheduleEnabled` filters). |
| `POST` | `/agents` | Create. `jobId` server-validated against §2. |
| `PATCH` | `/agents/:id` | Update config including source + schedule. |
| `DELETE` | `/agents/:id` | Delete. |

### 7.2 Runs

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/agents/:id/runs` | **New.** Start a run. Returns `{ runId, streamUrl }`. |
| `GET` | `/agents/:id/runs` | **New.** List runs. |
| `GET` | `/agents/:id/runs/:runId` | **New.** Get single run + candidates. |
| `GET` | `/agents/:id/runs/:runId/stream` | **New.** SSE stream of incoming candidates. |
| `POST` | `/agents/:id/runs/:runId/cancel` | **New.** Cancel. |

### 7.3 Activity log

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/agents/:id/activity` | **New.** Paginated activity timeline. Filterable by `runId`, `eventType`, `severity`. |
| `GET` | `/agents/:id/runs/:runId/activity` | **New.** Activity scoped to one run. |

### 7.4 Candidate triage

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/agents/:id/candidates` | List (existing, extended filters). |
| `PATCH` | `/agents/:id/candidates/:candidateId` | Update status. |
| `POST` | `/agents/:id/candidates/bulk` | **New.** Bulk status update. |

### 7.5 Actions (the hireable verbs)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/agents/:id/candidates/:candidateId/invite` | Send interview invitation, create `Invitation`. |
| `POST` | `/agents/:id/candidates/:candidateId/email/draft` | Generate LLM draft from template. |
| `PATCH` | `/outreach/:id` | Edit a draft. |
| `POST` | `/outreach/:id/send` | Transition `draft → queued → sent`. |
| `POST` | `/agents/:id/candidates/:candidateId/message` | Send IM via OpenClaw. |

### 7.6 OpenClaw ingest (write-back from remote)

**This is the endpoint OpenClaw uses to update RoboHire's Neon DB.** HMAC-verified.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/openclaw/activity` | **New.** OpenClaw writes an `AgentActivityLog` event. Body: `{ agentId, runId?, candidateId?, eventType, severity?, message?, payload?, externalId? }`. |
| `POST` | `/openclaw/outreach/:externalId/status` | **New.** OpenClaw updates an `Outreach` row it owns (delivered/read/replied/failed). |
| `POST` | `/openclaw/outreach/:externalId/reply` | **New.** OpenClaw appends a reply to `Outreach.thread` and fires a Notification. |
| `POST` | `/openclaw/run/:runId/status` | **New.** OpenClaw updates `AgentRun.status` and `stats`. |

All `/openclaw/*` routes verify `X-OpenClaw-Signature: hmac-sha256(OPENCLAW_WEBHOOK_SECRET, rawBody)` and are exempt from user auth (but subject to per-IP rate limiting).

### 7.7 Admin / config

| Method | Path | Purpose |
|---|---|---|
| `GET/PATCH` | `/admin/sources/config` | **New.** Get/update `SourceConfig` for workspace. Admin only. |
| `GET/POST/PATCH/DELETE` | `/admin/external-sources` | **New.** CRUD `ExternalSourceConfig`. Admin only. |
| `GET` | `/agents/:id/stats` | Extended with funnel metrics (sourced → liked → invited → interviewed → hired). |

### 7.8 Admin Realtime Terminal (Phase 5)

Global operations console that streams every agent activity event in the system in real time — the admin counterpart to the per-agent activity tab. See the reference doc [agents-terminal.md](./agents-terminal.md) for the full UI spec; below is the API contract.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/admin/agents/terminal/stream` | **New.** SSE. Requires `isAdmin`. Subscribes to the global `AgentActivityLogger` event bus and streams every activity across every agent in real time. Each message is a full `AgentActivityLog` row plus joined `agent.name` and `run.id` for display. Heartbeat every 25s. |
| `GET` | `/admin/agents/terminal/history?limit=200` | **New.** Initial backfill on connect. Returns the most recent `N` events across all agents (default 200, max 1000) so the terminal has immediate context before the stream catches up. Ordered newest-first, then reversed client-side for chronological rendering. |

Both routes are admin-only at the API layer (not just the route guard) — a non-admin session token receives `403`. The SSE stream reuses the same `AgentActivityLogger` event bus that powers per-run SSE, with an `admin: true` subscription that bypasses the per-run filter.

**Frontend**: new route `/product/admin/agents-terminal` rendered by `pages/AdminAgentsTerminal.tsx`, only visible to `isAdmin` users (hidden from the sidebar otherwise; direct URL access is blocked by `ProtectedRoute` + the same backend check). The page is a monospace terminal UI with color-coded severity, a filter bar (event type, agent name, severity, run id), pause/resume, clear, and an auto-scroll toggle. Full UI spec in [agents-terminal.md](./agents-terminal.md).

### 7.9 Smart agent endpoints (Phase 6)

Seven routes under `/api/v1/agents/:id/` that power the ICP learning loop and the hard-requirements filter. All `requireAuth` + ownership via `getVisibilityScope()`. Full request/response shapes in [icp-architecture.md §7](./icp-architecture.md).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/:id/ideal-profile` | **New.** Latest `AgentIdealProfile` for the agent. `404 ICP_NOT_FOUND` when no version exists yet. |
| `GET` | `/:id/ideal-profile/history` | **New.** All versions newest-first. Query: `?limit=20` (max 50). Used by the version-history drawer. |
| `POST` | `/:id/ideal-profile/regenerate` | **New.** Blocking LLM call via `IdealCandidateProfileAgent`; persists a new version row with `version = max + 1`. 5–15s latency. Body: `{force?: boolean, includeDisabledExamples?: boolean}`. `400 ICP_INSUFFICIENT_DATA` when likes + dislikes < 3 and `force` is false. |
| `POST` | `/:id/ideal-profile/revert` | **New.** Soft revert — copies an older version's profile forward as a new latest version. Body: `{version: number}`. Preserves the audit trail. |
| `POST` | `/:id/ideal-profile/promote-suggestion` | **New.** Copies an entry from `AgentIdealProfile.suggestedHardRequirements` into `Agent.config.hardRequirements` with `source: 'icp_suggestion'` + `sourceIcpVersion`. Body: `{ruleId: string}`. |
| `PATCH` | `/:id/hard-requirements` | **New.** Full-replace of `Agent.config.hardRequirements`. Validates field × operator × value type matrix; enforces the legal blocklist (`age`, `gender`, `race`, `religion`, `nationality`, `marital`, `pregnan`); caps at 20 rules per agent. Emits `hard_requirements.updated` with a diff. |
| `POST` | `/:id/hard-requirements/dry-run` | **New.** Pure Prisma + JS preview: `{poolSize, passed, rejected, rejectionsByRule, sampleRejected}` for a proposed rule set. Zero LLM calls, zero persistence. Drives the `HardRequirementsWarning` banner. |

All seven routes emit into the existing `AgentActivityLogger` firehose and appear in the admin terminal with events `icp.regeneration.started`, `icp.regenerated`, `icp.regeneration.failed`, `icp.loaded`, `icp.skipped`, `icp.reverted`, `hard_requirements.updated`, `hard_requirements.applied`, and `match.filtered_by_hard_requirement`.

### 7.10 Smart agent context endpoints (Phase 7)

Three route groups power the context-engineering / memory layer. All mounted at the top-level `/api/v1` path (not under `/agents/:id/`), because they operate on the user's cross-agent state.

**User recruiter profile** (`routes/userRecruiterProfile.ts`, Phase 7a). All `requireAuth`, acting on the current user.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/user-recruiter-profile` | Current user's rolled-up taste profile or `null`. |
| `POST` | `/user-recruiter-profile/rebuild` | Force rebuild (server-side debounced to once per 60s per user). |
| `DELETE` | `/user-recruiter-profile` | Reset — user goes back to cold-start for any agent created after this. Existing agent ICPs are untouched. |

**Candidate interactions** (`routes/candidateInteractions.ts`, Phase 7b). Single batch-ingest endpoint.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/candidate-interactions` | Batch ingest: `{events: [{eventType, candidateId, agentId?, runId?, resumeId?, durationMs?, metadata?}]}`. All rows written in a single `createMany`. `userId` is always server-stamped. Client-side buffered by `useCandidateInteractionTracker` (5s / 50 events). |

**Admin memory manager** (`routes/adminMemory.ts`, Phase 7.5). Admin-gated via the parent `routes/admin.ts` router. Every request writes a `MemoryAdminAuditLog` row BEFORE the payload is assembled. 11 routes under `/api/v1/admin/memory/*`:

| Method | Path | Action logged |
|---|---|---|
| `GET` | `/admin/memory/users` | `view_profile` |
| `GET` | `/admin/memory/users/:userId/profile` | `view_profile` |
| `GET` | `/admin/memory/users/:userId/memories` | `view_memories` |
| `GET` | `/admin/memory/users/:userId/interactions` | `view_interactions` |
| `GET` | `/admin/memory/memory/:id` | `view_memories` |
| `PATCH` | `/admin/memory/memory/:id` | `edit_memory` (+ diff; runs legal-content blocklist) |
| `DELETE` | `/admin/memory/memory/:id` | `delete_memory` |
| `POST` | `/admin/memory/memory/:id/pin` | `pin_memory` |
| `POST` | `/admin/memory/memory/:id/unpin` | `unpin_memory` |
| `POST` | `/admin/memory/users/:userId/profile/rebuild` | `rebuild_profile` |
| `DELETE` | `/admin/memory/users/:userId/profile` | `reset_profile` |
| `GET` | `/admin/memory/audit` | `view_audit` |

The audit-read (`view_audit`) is itself audited to a separate channel so a future "who viewed the audit log" recursive query does not self-reference.

---

## 8. Backend architecture

### 8.1 New services

```
backend/src/services/
├── AgentRunService.ts             # Orchestrates a run end-to-end
├── AgentActivityLogger.ts         # Centralized emitter for AgentActivityLog
├── AgentSchedulerService.ts       # node-cron based scheduler (§8.4)
├── sources/
│   ├── CandidateSource.ts         # Interface
│   ├── InstantSearchSource.ts     # Wraps InstantSearchMatchService
│   ├── MinIOSource.ts             # Reuses S3 client from ResumeOriginalFileStorageService
│   ├── ExternalApiSource.ts       # Dispatches to drivers
│   └── drivers/
│       ├── CustomHttpDriver.ts    # V1
│       ├── LinkedInDriver.ts      # V2 stub
│       ├── GitHubDriver.ts        # V2 stub
│       └── SeekOutDriver.ts       # V2 stub
├── openclaw/
│   ├── OpenClawClient.ts          # Outbound HTTP
│   ├── OpenClawIngestService.ts   # Handles inbound writes + HMAC verification
│   └── types.ts
├── OutreachService.ts             # CRUD + state machine
├── InvitationService.ts           # Persists invites, back-links Interviews
└── CryptoService.ts               # Field-level encrypt for ExternalSourceConfig.credentials
```

### 8.2 New agents

```
backend/src/agents/
├── OutreachEmailAgent.ts          # Drafts email bodies. temperature 0.7.
└── (future) OutreachMessageAgent.ts  # For OpenClaw IM drafting
```

`OutreachEmailAgent` extends `BaseAgent<Input, Output>`. Input: `{ candidate, job, template, agentInstructions, tone?, length? }`. Output: `{ subject, body }`.

### 8.3 AgentActivityLogger — the write path

All event emissions funnel through one service so every event has the same shape and batch-writes efficiently:

```typescript
// backend/src/services/AgentActivityLogger.ts
activityLogger.emit({
  agentId, runId, candidateId,
  actor: 'agent:' + agentId,
  eventType: 'invite.sent',
  payload: { invitationId, channel }
});
```

Called from: `AgentRunService`, all action routes, `OutreachService`, `InvitationService`, `OpenClawIngestService`. Also exposed via HTTP for OpenClaw (§7.6).

### 8.4 Scheduler — v1 ships node-cron

**Decision**: Use **`node-cron`** (in-process, no Redis required) for v1. BullMQ + Redis is the v2 upgrade path when horizontal scaling is needed.

```
backend/src/services/AgentSchedulerService.ts
```

- On boot (`backend/src/index.ts`), `AgentSchedulerService.init()` loads all agents with `scheduleEnabled=true` and registers cron jobs.
- On agent create/update with a schedule, scheduler re-registers the job.
- Each fired job creates an `AgentRun` with `triggeredBy='schedule'` and dispatches to `AgentRunService.run()`.
- Scheduler writes to `AgentActivityLog` on every fire, success, and failure.
- Missed runs (process was down): on boot, agents whose `nextRunAt < now()` get a one-shot catch-up run, unless configured otherwise.

Package add: `node-cron` + `@types/node-cron` to `backend/package.json`.

### 8.5 Task-system integration

New event hooks fire from:
- `AgentRunService.complete()` → `agent_run_completed` task
- `OpenClawIngestService.onReply()` → `outreach_reply_received` task
- `InvitationService.acceptInvitation()` → `invitation_accepted` task

These flow through `NotificationService` for in-app + email alerts (existing infrastructure).

### 8.6 Audit & analytics

All new action routes captured by `requestAudit.ts` middleware. Add to `lib/requestClassification.ts`:
- `/agents/*/runs` → `agent_run`
- `/agents/*/activity` → `agent_activity`
- `/agents/*/candidates/*/invite` → `agent_outreach_invite`
- `/agents/*/candidates/*/email/*` → `agent_outreach_email`
- `/agents/*/candidates/*/message` → `agent_outreach_message`
- `/openclaw/*` → `openclaw_ingest`

### 8.7 Frontend architecture

```
pages/product/Agents.tsx
├── components/agents/AgentList.tsx
│   └── AgentCard.tsx
├── components/agents/AgentDetailDrawer.tsx
│   ├── tabs/AgentResultsTab.tsx
│   │   ├── ResultsTriageLane.tsx
│   │   │   └── CandidateResultCard.tsx
│   │   └── ResultsActionBar.tsx
│   ├── tabs/AgentRunsTab.tsx
│   │   └── RunHistoryList.tsx
│   ├── tabs/AgentActivityTab.tsx           # NEW — reads /agents/:id/activity
│   │   └── ActivityTimeline.tsx
│   └── tabs/AgentSettingsTab.tsx
├── components/agents/CreateAgentModal.tsx
│   ├── SourceSelector.tsx                  # NEW — multi-select source modes
│   └── ScheduleField.tsx                   # NEW — cron preset + custom
├── components/shared/AutoGrowTextarea.tsx  # NEW — reused
├── components/agents/actions/
│   ├── InviteInterviewModal.tsx
│   ├── EmailComposerModal.tsx
│   └── SendMessageModal.tsx
├── pages/profile/admin/AdminSourcesTab.tsx # NEW — §6.4
└── hooks/
    ├── useAgentRunStream.ts
    ├── useAgentActivity.ts
    └── useAgentCandidates.ts
```

Design system: internal enterprise SaaS style per memory — clean borders, 12px radius, dark AI summary boxes, horizontal card layout, minimal shadows. i18n: all strings added to all 8 locale files under `agents.workbench.*`.

### 8.8 Scheduler (Phase 4)

`AgentSchedulerService` is the Phase 4 landing of §8.4's design. It is in-process, single-node, and relies on `node-cron` — BullMQ + Redis remains the v2 upgrade path once horizontal scale is real. See [agents-scheduler.md](./agents-scheduler.md) for the reference doc; this section covers spec-level contracts.

- **Boot wiring**: `AgentSchedulerService.init()` runs from `backend/src/index.ts` after Prisma connects, loads every `Agent` where `scheduleEnabled = true`, and registers a cron job per agent using `agent.schedule` as the cron expression.
- **Live registration**: `register(agent)` and `unregister(agentId)` are called from the `POST`, `PATCH`, and `DELETE` handlers in `routes/agents.ts` so schedule changes take effect immediately without a restart. `register` is idempotent — re-registering an agent unregisters the old cron first.
- **Firing**: on fire, the scheduler creates an `AgentRun` with `triggeredBy = 'schedule'` and `triggeredById = null`, then calls `AgentRunService.startAgentRun()`. Scheduler emits `run.queued` via `AgentActivityLogger` before handing off, and the run pipeline takes over from there.
- **Missed-run catch-up**: on boot, after `init()` registers live jobs, any agent with `scheduleEnabled = true` AND `nextRunAt < now()` receives a **one-shot catch-up run** (same path as a live fire, `triggeredBy = 'schedule'`). This guarantees that a process restart during off-hours does not silently drop a scheduled run. Catch-up is logged with an explicit `run.queued` event whose payload includes `{ catchup: true, missedBy: <seconds> }`.
- **DB-lock concurrency guard**: before dispatching, the scheduler performs a conditional update:
  ```sql
  UPDATE "Agent"
  SET "lastRunAt" = NOW()
  WHERE "id" = $1
    AND ("lastRunAt" IS NULL OR "lastRunAt" < NOW() - INTERVAL '30 seconds')
  ```
  Only the process whose UPDATE affects one row proceeds to create the `AgentRun`. This is a best-effort guard against double-firing once horizontal scale is added; node-cron itself is single-process, but the guard makes the design forward-compatible with multi-instance deploys behind a shared Postgres.
- **Deregistration on delete/disable**: deleting an agent or flipping `scheduleEnabled` to `false` calls `unregister(agentId)` and writes `nextRunAt = null`.

---

## 9. OpenClaw integration contract

### 9.1 Outbound — RoboHire → OpenClaw

```
POST {OPENCLAW_BASE_URL}/api/v1/messages
Headers:
  Authorization: Bearer {OPENCLAW_API_KEY}
  X-Idempotency-Key: {outreach.id}
  Content-Type: application/json
Body:
  {
    "candidate_ref": "rh:{agentCandidateId}",
    "body": "Hi Sarah, I noticed...",
    "reply_webhook": "https://api.robohire.io/api/v1/openclaw/outreach/{outreach.id}/reply",
    "status_webhook": "https://api.robohire.io/api/v1/openclaw/outreach/{outreach.id}/status",
    "metadata": {
      "agentId": "...",
      "jobId": "...",
      "runId": "...",
      "robohire_ingest": "https://api.robohire.io/api/v1/openclaw/activity"
    }
  }
Response: { delivery_id, status }
```

### 9.2 Inbound — OpenClaw → RoboHire

Four ingest endpoints (§7.6) that OpenClaw calls. All require `X-OpenClaw-Signature: hmac-sha256(OPENCLAW_WEBHOOK_SECRET, rawBody)`.

The critical flow:
1. OpenClaw receives a reply from the candidate → POSTs to `/openclaw/outreach/{id}/reply`
2. RoboHire appends to `Outreach.thread`, writes `im.replied` to `AgentActivityLog`, fires a `Notification` to the agent owner.
3. For pure activity updates without a message (e.g. "message delivered"), OpenClaw calls `/openclaw/activity` directly, which is a thin wrapper over `AgentActivityLogger.emit()`.

### 9.3 Env vars

```
OPENCLAW_BASE_URL=
OPENCLAW_API_KEY=
OPENCLAW_WEBHOOK_SECRET=
OPENCLAW_ENABLED=false     # gate until production-ready
```

**Note on discovery**: An initial search of `backend/src/services/` did not find an existing OpenClaw service file. Kenny indicated one exists; the spec assumes we'll connect to it once the filename is confirmed. If none exists, the spec's design still holds — `OpenClawClient.ts` is a straightforward HTTP wrapper that can be built from scratch in a few hundred lines.

---

## 10. Email template library

Proposed starter library based on how competing AI recruiting platforms (Gem, hireEZ, SeekOut, Paradox, Fetcher, Loxo) structure outreach. Not capped at 5 — we ship these 10 in v1 and add more as recruiters ask:

| Key | Name | When to use | Tone |
|---|---|---|---|
| `cold_outreach_intro` | Cold Outreach — First Touch | Initial message to a passive candidate who matched criteria | Warm, curious, personal |
| `cold_outreach_role_specific` | Cold Outreach — Role Specific | Candidate whose background maps tightly to one opening | Direct, specifics-first |
| `follow_up_nudge` | Follow-up Nudge | Gentle reminder after no response (≥5 days) | Light, low-pressure |
| `follow_up_value_add` | Follow-up with Value | Second follow-up with new info (salary range, team lead bio) | Helpful, additive |
| `interview_invite` | Interview Invitation | After candidate expresses interest | Clear, logistical |
| `interview_reminder` | Interview Reminder | 24h before a scheduled interview | Short, confirmatory |
| `post_interview_thanks` | Post-Interview Thank You | Same-day thank-you + next-steps | Grateful, forward-looking |
| `rejection_with_future` | Thoughtful Rejection | Declining with invitation to stay in touch | Kind, genuine, future-oriented |
| `talent_pool_nurture` | Talent Pool Nurture | Periodic keep-warm for high-value passive candidates | Newsy, brand-building |
| `reference_check_request` | Reference Check Request | Asking candidate for references | Professional, clear ask |
| `referral_ask` | Referral Ask | After positive interaction, asking for referrals | Collegial, low-pressure |
| `re_engagement` | Re-engage Past Candidate | Reach out to silver-medalist from old pipeline | Memory-jog, fresh role |

Template content lives in `backend/src/templates/outreach/*.md` with Handlebars-style placeholders: `{{candidate.firstName}}`, `{{job.title}}`, `{{recruiter.signature}}`, etc. The `OutreachEmailAgent` uses the template as a *seed* and rewrites in the tone set by agent instructions — so two recruiters using the same template produce different-sounding emails.

---

## 11. Environment variables (summary)

New env vars introduced by this spec:

```
# OpenClaw
OPENCLAW_BASE_URL=
OPENCLAW_API_KEY=
OPENCLAW_WEBHOOK_SECRET=
OPENCLAW_ENABLED=false

# MinIO (reuses existing S3 client)
S3_ENDPOINT=https://minio.internal.robohire.io
S3_FORCE_PATH_STYLE=true
MINIO_RESUME_PREFIX=resumes/

# Feature flags
FEATURE_AGENTS_WORKBENCH=false

# Crypto (for encrypting ExternalSourceConfig.credentials)
FIELD_ENCRYPTION_KEY=
```

Existing vars reused: `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `RESEND_API_KEY`, `EMAIL_FROM`, `DATABASE_URL`.

**Phase 4 + 5 additions (2026-04-11)**: none. The scheduler, comprehensive logging, and admin terminal all reuse existing infrastructure (Prisma, `AgentActivityLogger`, SSE, session auth) — no new env vars were introduced.

---

## 12. Rollout plan

| Phase | Scope | Status | Gates |
|---|---|---|---|
| **0 — Foundations** | Prisma migration: `AgentRun`, `AgentActivityLog`, `Invitation`, `Outreach`, `ExternalSourceConfig`, `SourceConfig`, `AgentCriteriaPreset`; modify `Agent`, `AgentCandidate`, `AgentRun`, `Interview`; scaffold new service files | **Done (2026-04-11)** | `db:push` works, schema compiles |
| **1 — Create flow** | `/agents/jobs-available`, admin gating, `AutoGrowTextarea`, new create modal with source + schedule fields, criteria preset picker | **Done (2026-04-11)** | Recruiter sees only own jobs; admin sees all; textareas grow |
| **2 — Run + results + activity** | `POST /agents/:id/runs`, SSE, Results tab, Activity tab, `AgentActivityLogger` | **Done (2026-04-11)** | Search + match render; Like/Dislike persist; activity timeline populated |
| **3 — Source adapters** | `InstantSearchSource` wrapper, `MinIOSource`, `ExternalApiSource` + `CustomHttpDriver`, admin config UI | **Done (2026-04-11)** | Each source produces candidates in a test run |
| **4 — Scheduler** | `AgentSchedulerService` with node-cron, schedule field in create modal, missed-run catch-up, DB-lock guard | **Done (2026-04-11)** | Agent fires on schedule; missed run catches up after restart |
| **5 — Comprehensive logging + admin terminal** | `AgentRun` metric columns, `llm.call.*` events with `sequence`, `/admin/agents/terminal/stream` SSE, `AdminAgentsTerminal.tsx` | **Done (2026-04-11)** | Admin terminal streams across agents; token/cost/latency per run visible |
| **6 — Smart Agent / ICP + Hard Requirements** | `AgentIdealProfile` model, `IdealCandidateProfileAgent` (temperature 0.4), `IdealProfileService`, `hardRequirementsFilter` (JS pre-filter w/ legal blocklist), 7 new endpoints, `buildAugmentedJd` ICP + anchor injection, `IdealProfileCard`/`HardRequirementsEditor`/`RegenerateProfileModal`/`HardRequirementsWarning` frontend, `useIdealProfile` hook, `icp.*` + `hard_requirements.*` activity events | **Done (2026-04-12)** | Regen creates new version; next run loads ICP and pre-filters via hard requirements; admin terminal shows `icp.loaded` → `hard_requirements.applied` → `match.scored` → `run.completed` |
| **7a — Context: cross-agent warm-start** | `UserRecruiterProfile` model, `UserRecruiterProfileService` (`rebuildForUser`, `getForUser`, 60s debounce), `IdealProfileService.seedFromUserProfile`, `Agent.agentInheritsFromProfile`, warm-start hook on `POST /agents`, 3 routes under `/user-recruiter-profile/*` | **Done (2026-04-12)** | New agent's v1 ICP seeds from user profile when available; rebuild fires after every `AgentIdealProfile` regen |
| **7b — Context: implicit signal capture** | `CandidateInteraction` model, `POST /candidate-interactions` batch ingest, `useCandidateInteractionTracker` hook, `ReviewProfilesView` dwell tracking | **Done (2026-04-12)** | Events land in DB from Review Profiles view; `userId` server-stamped |
| **7c — Context: memory retrieval foundation** | `MemoryEntry` model, `ContextRetrievalService` (cosine similarity, decay per scope, scope boosts, per-scope caps, prompt injection formatter) | **Partial (2026-04-12)** | Service + schema shipped; synthesis worker + embedding adapter + `IdealProfileService` integration deferred. Retrieval returns `[]` in prod until synthesis populates rows. |
| **7d — mem0 evaluation** | Research report `docs/mem0-evaluation.md`, scoring matrix, "Option B — Hybrid" decision, pgvector-in-Node-SDK finding | **Done (2026-04-12)** | Native build proceeds with mem0-shaped API surface; swap door open |
| **7.5 — Admin Memory Manager** | `MemoryAdminAuditLog` model, `AdminMemoryService` (audit-before-action pattern, legal-content blocklist on edits), 11 routes under `/admin/memory/*`, `AdminMemoryTab.tsx`, Memory tab added to `AdminDashboard.TABS` | **Done (2026-04-12)** | Admin can view / edit / delete memories + profile + interactions per user; every action audited; legal-blocklist on edits prevents discriminatory content injection |
| **8 — Invite** | `Invitation` model, invite endpoint, modal, back-link to `Interview` | Pending | Invite creates row; Interview back-link closes loop |
| **8 — Email** | `OutreachEmailAgent`, 12 templates, composer modal, Resend send | Pending | Draft + send works; `email.sent` logged |
| **9 — OpenClaw outbound + ingest** | `OpenClawClient`, `OpenClawIngestService`, all four ingest routes, HMAC verification | Pending | Outbound POSTs reach OpenClaw; inbound writes update DB; activity log gets `im.*` events |
| **10 — Funnel analytics** | Extended `/agents/:id/stats` with sourced → liked → invited → interviewed → hired counts | Pending | Dashboard shows real funnel metrics |

Phases 0–8 gated behind `FEATURE_AGENTS_WORKBENCH`. Phase 9 gated additionally by `OPENCLAW_ENABLED`. Phases 0–6 landed on 2026-04-11 / 2026-04-12 — remaining phase numbers (Invite, Email, OpenClaw, Analytics) are renumbered from prior tables as Phase 6 (Smart Agent / ICP) slotted in between Phase 5 and the original Phase 6 (Invite).

---

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| OpenClaw service not yet in this repo; contract may shift | Ship outbound client against a documented contract; HMAC-protected ingest routes are safe to ship behind `OPENCLAW_ENABLED=false` |
| MinIO scanning a large bucket is slow/expensive | `MinIOSource` uses `LastModified > lastRunAt` incremental scan; cached in `ResumeParsingCache` |
| node-cron is single-process; if backend scales horizontally, jobs fire N times | Ship a lock-based guard: before running, `SELECT FOR UPDATE` on the agent row; only the winner runs. Revisit with BullMQ + Redis if/when horizontal scale is real |
| LLM-drafted emails could send garbage | All outreach starts as `draft`; explicit user `send` required until we ship auto-send (post-v1 decision) |
| External source credentials in DB | Encrypted at rest via `CryptoService`; `FIELD_ENCRYPTION_KEY` from env; never logged |
| `AgentActivityLog` table growth | Partition-friendly indexes; add retention policy (`activities > 90 days → archive`) in v1.1 |
| Dual-interface endpoints blur actor identity | `AgentActivityLog.actor` field required on every emit; middleware stamps it automatically |

---

## 14. Open questions — status

| # | Question | Answer |
|---|---|---|
| 1 | Is OpenClaw a real, existing service? | **Yes** per Kenny — but a search of `backend/src/services/` didn't find it. **Need filename confirmation before phase 7.** |
| 2 | What channel does OpenClaw deliver over? | **HTTP-wrapped chat** — treat as a single "IM" channel for v1; delivery target is opaque to RoboHire. |
| 3 | Search Candidates sources? | **Three**: `instant_search` (existing), `internal_minio` (new), `external_api` (new). Admin config toggles each. |
| 4 | Admin = `isAdmin = true`? | **Confirmed**. |
| 5 | Scheduled runs in v1? | **Partially addressed (2026-04-11)**. Phase 4 landed `AgentSchedulerService` with node-cron, missed-run catch-up, and the DB-lock guard (§8.8). Full activity+status+error logging is live. BullMQ remains the v2 upgrade path. |
| 6 | Email template set? | **Proposed in §10** — 12 templates, extensible. |
| 7 | Invitation → Interview auto-transition? | **Still open** — defaulting to: auto-transition to `interviewed` on `Interview.completed`; human can override to `rejected`. |
| 8 | Disliked candidates scope | **Still open** — defaulting to: per-run soft-hide, recoverable from Disliked filter. Not hidden from future runs. |
| 9 | Multi-tenancy of OpenClaw | **Still open** — assuming one shared RoboHire→OpenClaw tenant with `metadata.workspaceId` routing on OpenClaw side. |
| 10 | Budget / rate limit per run | **Partially addressed (2026-04-11)**. Phase 5 landed per-run cost tracking: `AgentRun.tokensIn/tokensOut/costUsd/llmCallCount/avgLatencyMs/durationMs` and `llm.call.*` events stream into the admin terminal (§7.8). A hard cap is still not enforced — defaulting to: no hard cap in v1; admins can review cost in real time via terminal + `AgentRun.costUsd`. Add a configurable cap in v1.1 if any run exceeds target. |

### Still need from Kenny before coding:

- **Confirm OpenClaw filename or confirm we're building the client from scratch.** This is the only blocker for Phase 7.
- **Your call on #7, #8, #9, #10** — happy to proceed with my defaults if silent.
