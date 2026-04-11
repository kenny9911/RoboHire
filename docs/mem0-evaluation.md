# mem0 Evaluation for RoboHire Agents Workbench Phase 7

**Status**: Research — pre-decision
**Owner**: Kenny
**Author**: Research agent, 2026-04-11
**Scope**: Should RoboHire adopt [mem0](https://github.com/mem0ai/mem0) as the memory / context-engineering layer for Phase 7 of the Agents Workbench?
**Related**: [agents-changelog.md](./agents-changelog.md) · [icp-architecture.md](./icp-architecture.md)

---

## Executive summary

mem0 is a well-designed, Apache-2.0 memory layer with a Node/TypeScript SDK, multi-level scoping (`user_id` / `agent_id` / `run_id` / `org_id` / `project_id`), automatic LLM-powered fact extraction, and support for 20+ vector stores in Python — but **only 5 vector stores in the Node SDK, and pgvector is not one of them** ([source](https://docs.mem0.ai/components/vectordbs/overview)). That single fact is the most important finding in this report: adopting mem0-OSS in our Node backend means standing up a second vector database (Qdrant, Redis, or in-memory) alongside Neon Postgres, or running the Python SDK as a sidecar. Neither is free.

The managed cloud offering ([mem0.ai/pricing](https://mem0.ai/pricing)) is well-priced for early use (Hobby free, Starter $19/mo, Pro $249/mo), and the request-based model is generous enough for a Phase 7 pilot. But it introduces a new external dependency, a new trust boundary for candidate preference data, and lock-in to a service whose "how does it handle stale facts" FAQ on their own blog admits is "an open research problem" ([source](https://mem0.ai/blog/state-of-ai-agent-memory-2026)).

**Recommendation: B — Hybrid.** Build a native `MemoryService` inside `backend/src/services/memory/` that (a) mirrors mem0's API surface (`add` / `search` / `update` / `delete` / `expire`), (b) stores memories in a new Prisma table with pgvector on Neon, (c) does fact extraction via a new `MemorySynthesisAgent` built on `BaseAgent`, and (d) leaves a clear migration seam — if the native version hits a ceiling, we swap the implementation to the mem0 managed SDK without touching callers. This matches our existing architecture (BaseAgent pattern, Neon/Prisma-first, everything audited through `AgentActivityLogger`) and avoids the dual-database tax that mem0-OSS-Node would impose.

---

## Part 1 — mem0 deep dive

### 1.1 Architecture

mem0 ships as two products:

1. **Open source library** (`pip install mem0ai` / `npm install mem0ai`) — Apache 2.0, runs in-process. You BYO LLM (OpenAI, Anthropic, Google, local) and BYO vector store. Source: [github.com/mem0ai/mem0](https://github.com/mem0ai/mem0).
2. **Managed platform** (`api.mem0.ai`) — hosted, REST-first, includes graph memory, rerankers, analytics, custom categories per project, managed vector store and embeddings. Source: [docs.mem0.ai/overview](https://docs.mem0.ai/overview).

Both share the same conceptual API (`add`, `search`, `update`, `delete`, `history`). The managed platform adds project/org concepts and several features that are not in the OSS version (custom categories at project level, per-user analytics, async mode, graph memory in the standard tier).

**Mental model**: mem0 is a thin LLM-powered layer on top of a vector store. When you call `add(messages, ...)`, mem0 runs a fact-extraction LLM call over the raw conversation, decides which facts are novel, deduplicates / updates existing facts, and writes the distilled facts (not the raw messages) into the vector store with embeddings. `search(query, ...)` runs a vector similarity search over those distilled facts and returns the top-K with a score.

### 1.2 Memory types

Per [docs.mem0.ai/core-concepts/memory-types](https://docs.mem0.ai/core-concepts/memory-types), mem0 organizes memory into four layers:

| Layer | Purpose | Our Phase 7 analogue |
|---|---|---|
| Conversation | In-flight messages, single turn | Does not map — we don't have a conversational UI around the ICP |
| Session | Short-lived facts within a single task | Maps to a single `AgentRun` |
| User | Long-lived knowledge tied to a recruiter | Maps to a recruiter's persistent taste profile |
| Organizational | Shared context across agents/teams | Maps to team-scoped sharing (our opt-in requirement) |

mem0 does not formally distinguish "semantic / episodic / procedural" — it treats everything as a flat `memory` row with categories and metadata. Retrieval is by vector similarity plus optional metadata filters, not by memory type.

### 1.3 Retrieval mechanics

- **Embeddings**: OSS version is configurable (OpenAI `text-embedding-3-small` default, supports Hugging Face, Google, Ollama). Managed version uses mem0's internal embedding pipeline.
- **Default vector store**: Qdrant for OSS, managed platform uses its own.
- **Vector stores supported (Python)**: 20 — Qdrant, pgvector, Chroma, Pinecone, MongoDB, Redis, Elasticsearch, Weaviate, FAISS, Milvus, etc. ([source](https://docs.mem0.ai/components/vectordbs/overview)).
- **Vector stores supported (TypeScript)**: **5 only — Qdrant, Redis, Valkey, Vectorize (Cloudflare), and in-memory**. **pgvector is NOT supported in the Node SDK** ([source, same page](https://docs.mem0.ai/components/vectordbs/overview)). This is the single most load-bearing finding in this report.
- **Ranking**: vector cosine similarity, with optional reranking on the managed platform (v1.0.0+). Open-source version returns raw similarity scores.
- **Benchmark**: mem0's own LOCOMO benchmark claims 66.9% accuracy (LLM-scored) for the selective-memory mode, 68.4% for the graph variant — "roughly 6 percentage points lower than full-context in exchange for substantially reduced latency and token consumption" ([source](https://mem0.ai/blog/state-of-ai-agent-memory-2026)).

### 1.4 Decay / expiration / forgetting

This is where mem0's documentation is thinnest. Findings:

- The REST API `add` endpoint accepts an **`expiration_date`** field (format `YYYY-MM-DD`) — so explicit TTL is supported at the per-memory level ([source](https://docs.mem0.ai/api-reference/memory/add-memories)).
- There is **no documented automatic decay**. No `updated_at`-weighted scoring, no half-life, no reinforcement boost on re-access. The system treats a fact written 2 years ago identically to one written yesterday unless you explicitly filter by timestamp or set `expiration_date` at write time.
- mem0's own April 2026 blog post explicitly calls stale-fact detection "an open research problem" and admits that "highly-retrieved memory about a user's employer is highly relevant until it is not" — they have not solved this.
- "Selective memory" (`immutable: true/false`, `includes`, `excludes`) lets you pin or exclude specific facts at write time but is not time-based.

**Implication for RoboHire**: if we want reinforcement-weighted decay ("Sarah liked junior Go engineers 6 months ago but has been rejecting them for the last 4 weeks"), **we will build it ourselves regardless of whether we adopt mem0**. mem0 does not give us this feature for free.

### 1.5 Scope / hierarchy

mem0's REST API's `add` endpoint accepts six identity fields, all nullable ([source](https://docs.mem0.ai/api-reference/memory/add-memories)):

```
user_id      // the recruiter
agent_id     // the RoboHire Agent instance
run_id       // the AgentRun
app_id       // app-level partition
org_id       // organization (managed platform only)
project_id   // project (managed platform only)
```

This maps **cleanly** to RoboHire's requirement of per-job (`agent_id`), per-user (`user_id`), per-team (`org_id`), per-workspace (`project_id`), and per-run (`run_id`) scoping. The query side uses the same fields as filters.

**Caveats**:
- The **OSS Node SDK is less expressive** than the REST API. Confirmed parameters in `Memory.add(messages, { userId, metadata, runId })`: `userId`, `metadata`, `runId`, `enableGraph`. `agent_id` is accepted on the managed REST API but appears not to be a first-class parameter on the OSS Node SDK ([source](https://docs.mem0.ai/open-source/node-quickstart) — only `userId` and `metadata` shown in examples; search results suggest `agentId` works but it is undocumented). Using `metadata` as a workaround is possible but loses the native filter semantics.
- `org_id` / `project_id` are managed-platform-only. If we self-host OSS, team sharing has to be hacked into `metadata`.

### 1.6 Synthesis / fact extraction

mem0's `add()` is not just an insert — it runs an **LLM-powered fact extraction** pass under the hood:

1. Take the raw `messages` array.
2. Call an LLM (`gpt-4o-mini` by default in OSS) with an internal extraction prompt.
3. The prompt asks the model to list novel, stable, user-specific facts found in the conversation.
4. For each fact, mem0 checks semantic similarity against existing memories; if the fact is new, it's inserted; if it's a refinement of an existing fact, it runs a **second** LLM call to merge/update the old memory.

This is why mem0 can claim "90% lower token usage" at retrieval time — you're retrieving ~10 distilled facts per user instead of 10,000 raw turns.

**Customization**:
- Version 1.0.3 introduced "inclusion prompts, exclusion prompts, memory depth, and usecase settings as project-level configuration" on the managed platform ([source](https://mem0.ai/blog/state-of-ai-agent-memory-2026)). So the extraction prompt is tunable but not fully swappable.
- On the OSS version, you can override the LLM client and change the model, but **the default extraction prompt lives in the library source** — overriding it means forking or monkey-patching.
- Custom categories (15 default, replaceable at project level on managed) — but the managed API explicitly does **not** support per-request category overrides ([source](https://docs.mem0.ai/platform/features/custom-categories)): "Per-request overrides (`custom_categories=...` on `client.add`) are not supported on the managed API yet."

**Implication**: mem0's fact extraction is competent out of the box but locked into its own prompt style. For RoboHire-specific extraction ("detect the candidate-gap pattern Sarah rejects"), we would need to either (a) run our own extraction agent and write raw facts into mem0 using `infer: false`, or (b) fork the OSS extraction prompts. Option (a) is what we'd end up doing anyway, which means the value-add of mem0's built-in extraction drops considerably.

### 1.7 Integration — Node.js compatibility

- **Node SDK exists**: `npm install mem0ai` — confirmed ([source](https://github.com/mem0ai/mem0)). Apache 2.0.
- **Usage**: `import { Memory } from "mem0ai/oss"; const memory = new Memory(); await memory.add(messages, { userId: "alice", metadata: {...} });` ([source](https://docs.mem0.ai/open-source/node-quickstart)).
- **Parity gap**: The Node SDK lags the Python SDK. The advanced-memory-operations docs explicitly say "Working in TypeScript? The Node SDK still uses synchronous calls — use `Memory` there" — no `AsyncMemory` class. Several features (graph memory, some reranker options, custom category APIs at the project level) are Python-only or managed-only.
- **Drop-in**: A `services/memory/Mem0Adapter.ts` calling the OSS Node SDK would be a straightforward ~150-line wrapper inside our existing Express backend. No separate process needed **if** we use an in-memory or Redis vector store.

### 1.8 Database requirements

Here is where mem0-OSS-Node gets awkward for RoboHire:

| Store | OSS-Python | OSS-Node | Fits our stack? |
|---|---|---|---|
| pgvector (Neon) | ✅ | ❌ | Would be perfect. Not available in Node. |
| Qdrant | ✅ (default) | ✅ | Requires a new service container / Render add-on |
| Redis | ✅ | ✅ | We already have zero Redis dependency. Adding one is not free. |
| Valkey | ✅ | ✅ | Redis fork. Same concern. |
| Vectorize (Cloudflare) | ❌ | ✅ | Requires Cloudflare account, binds us outside the Render estate |
| In-memory | ✅ | ✅ | **OK for dev. Not viable in production** (data lost on restart) |

**Conclusion**: adopting mem0-OSS in our Node backend forces a second datastore (Qdrant most likely), which means a new Render service, new env vars, new backups, new monitoring. Alternatively, we adopt the **managed** mem0 cloud platform and avoid the datastore problem — but at the cost of sending recruiter preference data to a third party.

A third option: run the mem0 **Python** SDK as a sidecar (separate container on Render), expose HTTP endpoints, and have our Node backend call it. This gets us pgvector on Neon but introduces a Python subsystem RoboHire has zero precedent for. Not worth it.

### 1.9 License

Apache 2.0 for the OSS repo ([source](https://github.com/mem0ai/mem0)). Safe for commercial use, no copyleft risk. Managed platform has its own ToS.

### 1.10 Pricing (managed platform)

Per [mem0.ai/pricing](https://mem0.ai/pricing):

| Tier | Price | Add req/mo | Retrieve req/mo | Notes |
|---|---|---|---|---|
| Hobby | Free | 10,000 | 1,000 | Community support |
| Starter | $19/mo | 50,000 | 5,000 | |
| Pro | $249/mo | 500,000 | 50,000 | Graph memory, multi-project, analytics |
| Enterprise | Custom | Unlimited | Unlimited | On-prem, SSO, audit logs, SLA |

**Sizing for RoboHire**: at Phase 7 launch, 20 power recruiters × 50 agent runs/month × 10 triage actions/run × 2 mem0 writes (fact extraction + reinforcement) = 20,000 adds/month. Comfortably inside the Free tier for pilot; Starter tier hits the ceiling around 125 recruiters; Pro tier scales to ~1,200 recruiters. That's not expensive. The concern isn't the dollars — it's the data-locality and extraction-prompt lock-in.

Mem0 also offers a **Startup Program** providing 3 months free Pro for companies under $5M funding ([source](https://mem0.ai/pricing)). RoboHire likely qualifies.

---

## Part 2 — Alternatives

### 2.1 Zep / Graphiti

- **Architecture**: Formerly OSS+Cloud; in 2025 the Community Edition was **deprecated and moved to `legacy/`** in the repo ([source](https://github.com/getzep/zep)). New development is on Zep Cloud and the underlying `graphiti` OSS library. So the practical choice today is "Zep managed cloud" or "build on raw Graphiti", not "self-host Zep like you used to".
- **Retrieval**: Temporal knowledge graph. Every fact has `valid_at` / `invalid_at` ranges; the system performs **fact invalidation** when new information supersedes old — this is exactly the stale-fact handling mem0 doesn't have. Claims 80.32% accuracy on LoCoMo vs mem0's 66.9% ([source](https://www.getzep.com)).
- **Scoping**: User / session / group. Less granular than mem0's six-level scope.
- **Node SDK**: `@getzep/zep-cloud` — yes. Apache 2.0 for Graphiti; commercial for Zep Cloud.
- **Expiration**: Strongest of all three — native temporal invalidation. This is Zep's unique differentiator.
- **Cost**: Cloud only; pricing not on marketing page; typically enterprise quote.
- **Fit**: **Compelling on the "stale facts" axis that both mem0 and a naive native build would struggle with.** The knowledge graph model is overkill for our Phase 7 requirements and adds a Neo4j-ish dependency. And the Community Edition being deprecated means if Zep Cloud disappears we're stuck.

**Verdict**: Strong technology, wrong economics. A graph memory layer is the right choice for a full conversational agent; for RoboHire's Phase 7 (a preference model over candidate triage), it's a heavyweight answer to a lightweight question.

### 2.2 LangChain Memory

- **Architecture**: A set of classes (`ConversationBufferMemory`, `VectorStoreRetrieverMemory`, `EntityMemory`, `ConversationSummaryMemory`, etc.) inside LangChain. Not a service — just glue around your own vector store and LLM.
- **Retrieval**: Whatever vector store you bring (pgvector works). `EntityMemory` stores entity facts, `ConversationSummaryMemory` rolling-summarizes.
- **Scoping**: None natively. You manage `namespace` or `filter` args yourself.
- **Expiration**: None. You implement it.
- **Embeddings**: BYO.
- **Node SDK**: Yes (`@langchain/core`, `langchain` on npm).
- **Fit**: LangChain Memory is really "a design pattern plus some helpers". It doesn't solve the problem — it makes you solve the problem with better scaffolding. And RoboHire has **zero LangChain dependency today**. Adopting LangChain just for its memory classes means pulling in a 500KB+ framework for two helper classes. Not a good trade.

**Verdict**: Not a fit. If we want the design patterns, we implement them natively without the LangChain runtime.

### 2.3 Native build (Prisma + pgvector on Neon + JS cosine or SQL similarity)

- **Architecture**: New Prisma model `AgentMemory` with `id`, `userId`, `agentId?`, `jobId?`, `teamId?`, `scope` (`user` / `agent` / `job` / `team`), `factType`, `factText`, `embedding` (`vector(1536)` column via pgvector), `weight`, `sourceEvents` JSON, `reinforcedAt`, `expiresAt`, `createdAt`. Extraction via a new `MemorySynthesisAgent` subclass of `BaseAgent` (same pattern as `ResumeParseAgent`, `IdealCandidateProfileAgent`).
- **Retrieval**: pgvector `<->` operator (cosine distance) with SQL `ORDER BY embedding <=> $1 LIMIT k`. Optional metadata filter `WHERE userId = $2 AND (scope = 'user' OR teamId IN $3)`. We already query Postgres — this is one more index.
- **Scoping**: Fully custom — we design the schema to match our exact multi-tenant rules (user / agent / job / team / workspace). `getVisibilityScope()` from `teamVisibility.ts` drops right in.
- **Expiration**: We write the logic. Options: (a) `expiresAt` column + cron sweep; (b) reinforcement-weighted scoring in retrieval (`score * exp(-age_days / half_life)`); (c) explicit TTL on some memory types. Completely under our control.
- **Embeddings**: Use our existing `LLMService` — either OpenAI `text-embedding-3-small` (`$0.02 / 1M tokens`) or Google equivalents. Cost is negligible.
- **Synthesis**: New `MemorySynthesisAgent` extends `BaseAgent<LikedAndDislikedEvents, ExtractedFacts[]>`. Uses a prompt we wrote and can change, routes through `LoggerService` for cost tracking, participates in the request audit. **Everything** flows through the same observability pipeline as the rest of our agents.
- **Cost**: Zero new infrastructure. Neon Postgres already supports pgvector. One extra Prisma migration.
- **Fit**: Matches every architectural decision we've made in Phases 0–6. The Agents Workbench already treats audit, cost tracking, request classification, and team visibility as universal concerns — a native memory layer inherits all of them for free.

**Verdict**: Strongest architectural fit. Highest initial implementation cost (~1,000 lines of code + a migration + a new agent). Zero operational overhead.

---

## Part 3 — Recommendation

### 3.1 Scoring matrix

Each dimension scored 1–5 (higher is better). mem0 = OSS Node SDK + managed platform blend.

| Dimension | mem0 | Zep Cloud | Native | Weight | Notes |
|---|---|---|---|---|---|
| Retrieval quality | 3 | 4 | 3 | Medium | Zep wins on temporal invalidation. mem0 and native both do vanilla vector search. |
| Decay / expiration | 2 | 5 | 4 | **High** | mem0 has explicit dates but no reinforcement. Zep has true temporal graphs. Native = we build exactly what we need. |
| Synthesis / fact extraction | 4 | 4 | 3 | Medium | mem0 and Zep ship extraction out of the box. Native means we write the agent. |
| Scoping hierarchy | 4 | 2 | 5 | **High** | mem0's REST has six scope levels. Native perfectly matches our `teamVisibility` model. Zep has fewer. |
| Node.js compatibility | 2 | 4 | 5 | **High** | mem0 Node SDK is feature-lagging. Zep has TS SDK. Native is TypeScript by definition. |
| Database fit (Neon/pgvector) | 1 | 1 | 5 | **High** | mem0-OSS-Node does NOT support pgvector. Zep is cloud-only. Native runs on our existing Neon instance. |
| Cost (runtime) | 4 | 2 | 5 | Medium | mem0 Hobby tier free; Pro $249/mo. Zep is enterprise-priced. Native is zero marginal. |
| Cost (build) | 5 | 4 | 2 | Medium | mem0 is a `npm install`. Native is ~1,000 lines. |
| Observability / audit integration | 2 | 2 | 5 | **High** | mem0 writes go through mem0's own pipeline, not our `AgentActivityLogger` or `LoggerService`. Native participates in all existing telemetry. |
| Vendor risk / lock-in | 3 | 2 | 5 | Medium | mem0 managed is a 3rd-party data boundary. Zep Community was deprecated — suggests the OSS story isn't forever. Native has no vendor. |
| Weighted total | **3.0** | **3.0** | **4.2** | | |

Native wins on the dimensions we weighted high (decay, scoping, Node.js, database, observability). mem0 wins only on build cost.

### 3.2 The decision

**Option B — Hybrid.** Build native, mirror mem0's API surface, keep the swap door open.

Specifically:

1. **Build a `MemoryService` in `backend/src/services/memory/`** with methods named after mem0's (`addMemory`, `searchMemories`, `updateMemory`, `deleteMemory`, `expireMemories`) so that if we later hit a wall, replacing the implementation with a `Mem0ManagedAdapter` is a single-file change.
2. **Store memories in a new Prisma table with pgvector** on our existing Neon instance.
3. **Write a `MemorySynthesisAgent`** extending `BaseAgent` using the existing prompt patterns (temperature 0.2 — closer to the 0.1 we use for scoring agents than the 0.7 creative default, because we want fact-extraction determinism).
4. **Make decay a first-class feature** (reinforcement-weighted retrieval score) since mem0 doesn't give us this and it's one of our stated requirements.
5. **Review after Phase 7** whether the native layer is holding up. If extraction quality is poor or retrieval is unreliable at 10k+ memories, switch to mem0 managed or Zep Cloud behind the same interface.

### 3.3 Why not option A (adopt mem0)

Three reasons, ordered by severity:

1. **pgvector is not supported in the mem0 Node SDK.** We would be forced to run a second datastore (Qdrant or Redis) just for memory, or move to the managed platform. Every other piece of RoboHire data lives on Neon; fragmenting that boundary for one feature is a bad trade.
2. **mem0's fact extraction prompt is a black box in the OSS version.** Our scoring agents use a temperature of 0.1 for determinism and carefully tuned prompts. Having memory synthesis run through mem0's default prompt — which we can't change without forking — breaks the tight prompt-quality feedback loop we rely on.
3. **None of mem0's observability surfaces integrate with `AgentActivityLogger` or `LoggerService`.** Every LLM call in RoboHire flows through `LoggerService.startRequest()` and lands in `ApiRequestLog` for per-request cost attribution. mem0's internal LLM calls do not. Adopting mem0 means a blind spot in our cost dashboard exactly where we're adding more LLM calls per user action.

### 3.4 Why not option C (skip mem0 entirely without mirroring its API)

Because in 12–18 months, one of three things is likely:
- Our reinforcement-weighted decay algorithm needs a graph traversal (Zep-like).
- Our recruiter base hits the scale where running extraction ourselves becomes expensive compared to mem0's Pro tier.
- A new memory-service winner emerges.

All three are easier to absorb if our callers already speak the mem0-shaped API. The cost of mirroring is maybe 50 lines of interface plumbing — cheap insurance.

---

## Part 4 — Integration sketch (Option B)

### 4.1 File layout

```
backend/src/services/memory/
├── MemoryService.ts          # Public facade. Only file callers import.
├── NativeMemoryAdapter.ts    # Prisma + pgvector implementation (v1)
├── Mem0ManagedAdapter.ts     # Optional future swap-in, stubbed in v1
├── MemorySynthesisAgent.ts   # Extends BaseAgent — extracts facts from raw events
├── decay.ts                  # Reinforcement + half-life scoring helpers
├── scope.ts                  # Integrates with teamVisibility
└── types.ts                  # Memory, MemoryScope, MemoryFilter, etc.

backend/src/agents/MemorySynthesisAgent.ts
    → subclass of BaseAgent<MemorySynthesisInput, MemorySynthesisOutput>

backend/prisma/schema.prisma
    + model AgentMemory { ... pgvector }
```

### 4.2 Prisma model (sketch — do not apply without review)

```prisma
model AgentMemory {
  id             String    @id @default(cuid())
  userId         String                      // always the owning recruiter
  agentId        String?                     // null = user-level
  jobId          String?                     // null = not job-scoped
  teamId         String?                     // null = not team-shared
  scope          String                       // 'user' | 'agent' | 'job' | 'team'
  factType       String                       // 'preference' | 'rejection_pattern' | 'anchor' | 'anti_anchor'
  factText       String    @db.Text           // the distilled fact
  embedding      Unsupported("vector(1536)")? // pgvector — requires raw SQL migration
  weight         Float     @default(1.0)      // reinforcement strength
  reinforcedAt   DateTime  @default(now())    // last time this fact was seen
  sourceEventIds Json                          // AgentCandidate IDs or AgentActivityLog IDs
  expiresAt      DateTime?                     // explicit TTL; null = none
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  agent          Agent?    @relation(fields: [agentId], references: [id], onDelete: SetNull)
  job            Job?      @relation(fields: [jobId], references: [id], onDelete: SetNull)

  @@index([userId, scope])
  @@index([agentId])
  @@index([jobId])
  @@index([teamId])
  @@index([expiresAt])
}
```

### 4.3 MemoryService interface (mirrors mem0)

```typescript
// backend/src/services/memory/MemoryService.ts

export interface Memory {
  id: string;
  factText: string;
  factType: MemoryFactType;
  scope: MemoryScope;
  weight: number;
  score?: number;           // only present on search results
  createdAt: Date;
  reinforcedAt: Date;
  expiresAt?: Date;
}

export interface MemoryFilter {
  userId: string;
  agentId?: string;
  jobId?: string;
  teamId?: string;
  factType?: MemoryFactType;
  scopes?: MemoryScope[];   // OR-ed
  includeExpired?: boolean;
}

export interface MemoryService {
  // Mirror of mem0.add — takes raw events, runs synthesis, inserts.
  addMemory(events: RawTriageEvent[], opts: AddMemoryOptions): Promise<Memory[]>;

  // Mirror of mem0.search — vector similarity with filter + decay-weighted scoring.
  searchMemories(query: string, filter: MemoryFilter, topK?: number): Promise<Memory[]>;

  // Mirror of mem0.update — manual fact rewrite, used by "promote suggestion" flows.
  updateMemory(id: string, patch: Partial<Memory>): Promise<Memory>;

  // Mirror of mem0.delete — removes a fact entirely.
  deleteMemory(id: string): Promise<void>;

  // Periodic sweep called by scheduler: expire TTL'd memories, apply decay.
  expireMemories(now?: Date): Promise<number>;
}
```

### 4.4 Integration with `IdealProfileService.generateForAgent()`

Phase 6 already ships `IdealProfileService` (see `icp-architecture.md` §6). Phase 7 extends it:

```typescript
// before generating a new ICP for agent X
const crossAgentMemories = await memoryService.searchMemories(
  buildCrossAgentQuery(agent.job),          // "senior Go backend engineer fintech..."
  { userId: agent.userId, scopes: ['user', 'team'], factType: 'preference' },
  20                                          // topK
);

// inject crossAgentMemories into IdealCandidateProfileAgent's input
const icp = await idealProfileAgent.generate({
  jd: job.jd,
  likes: likedCandidates,
  dislikes: dislikedCandidates,
  crossAgentInsights: crossAgentMemories,   // NEW
});
```

When a recruiter Likes or Dislikes a candidate, a new hook in `routes/agents.ts` fires an event into the `MemoryService`:

```typescript
// PATCH /agents/:id/candidates/:candidateId — on status change
if (newStatus === 'liked' || newStatus === 'disliked') {
  // fire-and-forget — don't block the triage response
  memoryService.addMemory(
    [{ kind: newStatus, candidateId, agentId, resumeId, timestamp: new Date() }],
    { userId, agentId, jobId: agent.jobId, teamId: user.teamId }
  ).catch(err => logger.warn('memory.add failed', err));
}
```

### 4.5 Decay / reinforcement

Retrieval returns `score = cosine_similarity * exp(-age_days / half_life) * weight`, where:
- `half_life = 90` by default (configurable per scope).
- Every time a memory is "re-seen" (the recruiter runs triage on a similar candidate and the memory is retrieved into the next ICP prompt), we bump `reinforcedAt = now` and `weight += 0.1` (capped).
- A nightly cron job (reuse the existing `AgentSchedulerService` plumbing) runs `expireMemories()` to delete memories where `expiresAt < now` OR `(weight < 0.3 AND age > 180 days)`.

### 4.6 Migration / setup

1. **Enable pgvector on Neon**: `CREATE EXTENSION IF NOT EXISTS vector;` — Neon supports this natively.
2. **New Prisma migration** for `AgentMemory` (Prisma's `Unsupported` type plus a follow-up raw SQL migration to add the pgvector index: `CREATE INDEX agent_memory_embedding_idx ON "AgentMemory" USING hnsw (embedding vector_cosine_ops);`).
3. **New env vars**:
   - `MEMORY_EMBEDDING_MODEL` (default `text-embedding-3-small`)
   - `MEMORY_HALF_LIFE_DAYS` (default `90`)
   - `MEMORY_MAX_TOPK` (default `20`)
4. **No new services**. All new code lives in the existing backend process.
5. **New scheduled task** added via `TaskGeneratorService` or `AgentSchedulerService`: nightly `expireMemories()` sweep.

### 4.7 Rollout

- Week 1: schema + `NativeMemoryAdapter` stub + tests against pgvector.
- Week 2: `MemorySynthesisAgent` + integration into triage hook (write path only).
- Week 3: integrate retrieval into `IdealProfileService.generateForAgent()` (read path).
- Week 4: admin UI panel showing each user's top-K memories, decay curve, manual delete. Gate behind admin role.
- Week 5: ship behind a `MEMORY_ENABLED=true` env flag to 3 pilot recruiters, measure like-rate improvement vs Phase 6 baseline.

---

## Open questions for Kenny

1. **Cross-agent leakage policy**: when recruiter Sarah has Agent A (Go backend job) and Agent B (iOS engineer job), do memories from A leak into B automatically, or only when the job descriptions are semantically similar above a threshold? This is a product question, not a technical one. The schema supports both; we need your call on the default.

2. **Team sharing default**: the requirements say "team sharing is opt-in". Should the opt-in be per-memory (the recruiter picks which facts to share after the fact), per-agent (share all memory generated while this agent runs), or per-recruiter (a global setting)? Per-agent feels right to me but you should confirm.

3. **Pilot with managed mem0 as a comparison?** One option: ship the native layer as primary, but also write the `Mem0ManagedAdapter` in the same sprint and run a 2-week A/B on 3 pilot recruiters each. Cost to run mem0 in parallel for 3 recruiters is well inside the Free tier, and the comparison data would let us kill the "but mem0 might be better" conversation dead forever.

4. **Do we need company-wide preferences now, or can we defer?** The requirements list "hiring-requirement-aware memories scoped to the company that owns the job". This is the `teamId`/`companyId` scope. RoboHire's current multi-tenant model uses `teamView` in `teamVisibility.ts` but there's no formal Company model for recruiters — teams are loose. I'd recommend deferring the company-scope tier to a Phase 7.5 once we validate the per-user and per-agent scopes work.

5. **Half-life default**: 90 days is a guess from me. Do you have a gut feel for how quickly a recruiter's taste changes? If it changes faster (e.g., because they take on a new type of role every quarter), we should go shorter — 45 days — and reinforce more aggressively.

6. **Embedding provider**: OpenAI `text-embedding-3-small` at $0.02/1M tokens is the cheapest option and the default in mem0 too. But we already route through `LLMService` — do you want memory embeddings routed through the same provider as scoring (which is whatever `LLM_PROVIDER` is set to), or hard-coded to OpenAI for embedding stability? I lean hard-coded-OpenAI; embeddings rarely need swapping.

---

## Citations

- [mem0 GitHub repo](https://github.com/mem0ai/mem0) — license (Apache 2.0), language mix, SDK availability.
- [mem0 overview docs](https://docs.mem0.ai/overview) — managed vs OSS positioning.
- [mem0 Node quickstart](https://docs.mem0.ai/open-source/node-quickstart) — Node SDK method signatures.
- [mem0 add-memories REST reference](https://docs.mem0.ai/api-reference/memory/add-memories) — full parameter schema including `user_id`, `agent_id`, `run_id`, `org_id`, `project_id`, `expiration_date`, `custom_categories`.
- [mem0 vector DB overview](https://docs.mem0.ai/components/vectordbs/overview) — Python supports 20 stores, TypeScript supports 5 (Qdrant, Redis, Valkey, Vectorize, in-memory); pgvector is Python-only.
- [mem0 memory types docs](https://docs.mem0.ai/core-concepts/memory-types) — 4-layer model.
- [mem0 custom categories](https://docs.mem0.ai/platform/features/custom-categories) — managed-only; no per-request override.
- [mem0 selective memory](https://docs.mem0.ai/platform/features/selective-memory) — confirmed no automatic decay/TTL documentation.
- [mem0 pricing page](https://mem0.ai/pricing) — Free/Starter/Pro/Enterprise tiers.
- [mem0 state-of-agent-memory blog](https://mem0.ai/blog/state-of-ai-agent-memory-2026) — LoCoMo benchmark (66.9%), stale-fact handling called an open problem.
- [Zep website](https://www.getzep.com/) — temporal graph, 80.32% LoCoMo.
- [Zep GitHub repo](https://github.com/getzep/zep) — Apache 2.0, Community Edition deprecated, TypeScript SDK available.
