# Agents Workbench — Changelog & Runbook

**Status**: Living document · covers Phase 0 → Phase 7 + Admin Memory Manager (shipped 2026-04-12)
**Owner**: Kenny
**Related**: [agents-redesign-spec.md](./agents-redesign-spec.md) · [agents-redesign-prompts.md](./agents-redesign-prompts.md) · [agents-terminal.md](./agents-terminal.md) · [agents-scheduler.md](./agents-scheduler.md) · [icp-product-spec.md](./icp-product-spec.md) · [icp-design.md](./icp-design.md) · [icp-architecture.md](./icp-architecture.md) · [context-engineering-v7.md](./context-engineering-v7.md) · [mem0-evaluation.md](./mem0-evaluation.md) · [agents-user-guide-zh.md](./agents-user-guide-zh.md)
**Last updated**: 2026-04-12

## Phase 6 + Phase 7 reading guide

**Phase 6 (Smart Agent / ICP + Hard Requirements)** has three well-scoped reference documents kept separate from this runbook on purpose — each answers a different question. Read [icp-product-spec.md](./icp-product-spec.md) when you need the **why** (the learning-loop vision, personas, success metrics, open product questions that Kenny must answer before v2); read [icp-design.md](./icp-design.md) when you need the **UX** (component inventory, confidence-bar buckets, amber "STRICT FILTER" treatment, regenerate loading/diff states, CriteriaSuggestionsModal HR integration); read [icp-architecture.md](./icp-architecture.md) when you need the **how** (the `AgentIdealProfile` schema, the literal `IdealCandidateProfileAgent` system prompt, the two-stage hard-requirement filter, the exact `buildAugmentedJd` prepend+append strategy, and the sequence diagrams for regenerate + run-with-ICP). The factual what-shipped record is §3.9 below.

**Phase 7 (Context engineering / memory layer)** expands learning across agents, sessions, and implicit signals. Read [context-engineering-v7.md](./context-engineering-v7.md) when you need the **design** — the `UserRecruiterProfile` / `CandidateInteraction` / `MemoryEntry` data model, the scope hierarchy (user → team → workspace → job), the decay half-lives (30/60/180 days), the synthesis + retrieval algorithm, and the privacy policy (§8.2 of that doc is the governance rationale that grounds the Admin Memory Manager below). Read [mem0-evaluation.md](./mem0-evaluation.md) when you need the **why build native instead of adopting mem0** — the pgvector-in-Node-SDK finding is the load-bearing fact, plus the scoring matrix that landed on "Option B — Hybrid". The end-user-facing product guide is [agents-user-guide-zh.md](./agents-user-guide-zh.md) (中文, recruiter-targeted). The factual what-shipped records for Phase 7 are §3.10 (7a warm-start), §3.11 (7b implicit signals), §3.12 (7c retrieval foundation), §3.13 (7d mem0 evaluation), and §3.14 (Admin Memory Manager, numbered Phase 7.5).

---

## 1. Executive summary

The **Agents Workbench** is the recruiter-facing half of RoboHire's "hire an AI agent" product. A recruiter (or an admin on behalf of any user) creates a persistent **Agent** — a named configuration scoped to one Job with a task type, natural-language criteria, fine-tuned dealbreakers, optional source selection, and an optional cron schedule. Every execution becomes an **AgentRun** that streams live candidate results, sourced from `instant_search`, `internal_minio`, or `external_api` adapters, scored through the real `ResumeMatchAgent` (not keyword heuristics), and persisted as **AgentCandidate** rows with like / dislike triage. Every step — from `run.queued` to each individual `llm.call.completed` with tokens, cost, model, provider, and latency — funnels through **AgentActivityLogger**, a single durable audit log + in-memory event bus that fans out to three SSE channels: per-run, per-agent, and a global `all` channel subscribed to by the admin-only **Realtime Terminal**. Scheduled runs fire via the in-process **AgentSchedulerService** (node-cron, with missed-run catch-up on boot and a DB-lock guard for future horizontal scale). The design north star is that **every capability is dual-interface** — a human clicking a button and another agent calling an API take the same path, the same auth, and the same audit trail. This document is the changelog + runbook for everything that shipped on 2026-04-11 across Phases 0–5.

---

## 2. Architecture at a glance

```
                         ┌────────────────────────┐
                         │  Recruiter / Admin UI  │
                         │  /product/agents       │
                         │  AgentRunDrawer        │
                         └──────────┬─────────────┘
                                    │ REST + SSE
                                    ▼
┌──────────────┐   register   ┌──────────────────┐        ┌────────────────────┐
│ node-cron    ├─────────────▶│ routes/agents.ts │◀──────▶│ AgentRunService    │
│ AgentScheduler│   trigger    │ + admin/*        │  start │ (orchestrator)     │
└──────────────┘              └────────┬─────────┘        └──────────┬─────────┘
                                       │                             │
                                       │                             ▼
                                       │                ┌────────────────────────┐
                                       │                │ sources/llmMatcher.ts  │
                                       │                │ ↳ ResumeMatchAgent     │
                                       │                │ ↳ logger.startRequest  │
                                       │                │ ↳ logger.getSnapshot   │
                                       │                └──────────┬─────────────┘
                                       │                           │ token/cost
                                       │                           ▼
                                       │            ┌──────────────────────────┐
                                       └───────────▶│  AgentActivityLogger     │
                                                    │   ├── DB: AgentActivityLog│
                                                    │   └── EventEmitter bus   │
                                                    │        ├─ run:<runId>    │
                                                    │        ├─ agent:<agentId>│
                                                    │        └─ all (admin)    │
                                                    └─────────────┬────────────┘
                                                                  │ SSE
                                                                  ▼
                                                    ┌──────────────────────────┐
                                                    │ /admin/agents-terminal   │
                                                    │ AdminAgentsTerminal.tsx  │
                                                    └──────────────────────────┘
```

- **Source adapters** live under `backend/src/services/sources/`. All three (`instant_search`, `internal_minio`, `external_api`) converge on `llmMatcher.ts`, which runs `ResumeMatchAgent` in bounded-concurrency batches and writes `AgentCandidate` rows that pass the 60-score floor.
- **External drivers** live under `backend/src/services/sources/drivers/`. V1 ships `CustomHttpDriver.ts`; credentials are decrypted per-run via `lib/crypto.ts`.
- **Future → Invitation / Outreach** models are persisted today but the action UIs (Invite, Email, OpenClaw IM) are deferred to Phase 6–8.

---

## 3. Phase-by-phase changelog

### 3.1 Phase 0 — Foundations (2026-04-11, shipped)

**Scope.** A single Prisma migration introduces the models the rest of the workbench depends on, modifies `Agent`, `AgentCandidate`, and `Interview`, and scaffolds empty service files so later phases compile incrementally.

**Schema changes** (`backend/prisma/schema.prisma`).

| Change | Model | Notes |
|---|---|---|
| **New** | `AgentRun` | Status machine (`queued → running → completed | failed | cancelled`), `triggeredBy`, `stats` JSON bag, plus six Phase 5 metric columns (`tokensIn`, `tokensOut`, `costUsd`, `llmCallCount`, `avgLatencyMs`, `durationMs`). |
| **New** | `AgentActivityLog` | The single durable audit log. `actor`, `eventType`, `severity`, `message`, `payload`, plus a per-run monotonic `sequence` column added in Phase 5. Indexed on `(agentId,createdAt)`, `(runId,createdAt)`, `candidateId`, `(eventType,createdAt)`, `(severity,createdAt)`. |
| **New** | `AgentCriteriaPreset` | Reusable structured criteria buckets. `criteria` JSON: array of `{id, text, pinned, bucket: 'most' | 'least'}`. `scope` = `private | shared`. |
| **New** | `Invitation` | Candidate interview invitations; `@unique interviewId` for the eventual back-link when an interview completes. |
| **New** | `Outreach` | Unified email / OpenClaw / SMS / LinkedIn outreach thread. `thread` JSON accumulates inbound + outbound messages. |
| **New** | `ExternalSourceConfig` | Admin-managed third-party sourcing credentials (LinkedIn, GitHub, SeekOut, custom). `credentials` encrypted at rest. |
| **New** | `SourceConfig` | Per-workspace toggles for each source mode; `@unique workspaceId` with `null = global default`. |
| **Modified** | `Agent` | Added `taskType` (expanded values), `source` JSON (modes + externalApiConfigId), `schedule` / `scheduleEnabled` / `nextRunAt` / `autonomy`, plus totals and `lastRunAt`. Added `@@index([scheduleEnabled, nextRunAt])`. |
| **Modified** | `AgentCandidate` | Added `runId`, `source`, `reason`, `metadata`, `profileUrl`, `headline`, `notes`, `outreachSentAt`. Expanded `status` vocabulary to 10 values. |
| **Modified** | `Interview` | Added `invitationId @unique` for the Invitation → Interview back-link. |

**Key decisions.**

- `candidateId` on `AgentActivityLog` is intentionally a scalar — **no FK** — so deleting a candidate preserves the historical log.
- All status fields are strings, not enums, so rolling out new states (`messaged`, `archived`) is a code-only change, no migration.
- `AgentRun.stats` stays JSON (funnel counts, flexible); the six cost/token/latency columns are promoted out of JSON so admin queries are cheap and indexable.
- `@@index([costUsd])` on `AgentRun` so `ORDER BY costUsd DESC` is O(log n) for the "most expensive runs" view.

**Gotcha.** `db:push` must be re-run any time `AgentRun` columns change because Phase 5 added six columns after Phase 3 code was already deployed in dev. If an existing `AgentRun` row predates the new columns, defaults (`@default(0)`) keep reads safe.

---

### 3.2 Phase 1 — Create flow (2026-04-11, shipped)

**Scope.** The "Hire an Agent" modal, with admin gating of the job picker, shared auto-growing textareas, and the new source + schedule fields.

**Shipped.**

- `GET /api/v1/agents/jobs-available` — the backend is the source of truth for which jobs the caller may scope an agent to. Recruiters see their own `status ∈ {open, published, active}` jobs; admins see every user's. The frontend never decides.
- `AutoGrowTextarea` — shared component in `frontend/src/components/AutoGrowTextarea.tsx`. Grows with content up to `max-height: 40vh`, keeps `resize-y` so users can still drag. Used by the create modal, the settings tab, and Agent Alex spec fields.
- The create modal (and the Settings tab — see §3.5) now carries:
  - **Job** searchable dropdown bound to `/jobs-available`
  - **Task type** radio (`search_candidates` / `match_resumes`)
  - **Source modes** multi-select chip group (hidden for `match_resumes`)
  - **Criteria** autogrow textarea (plain text; fine-tuning happens in the Edit Criteria modal — see §3.4)
  - **Instructions** autogrow textarea
  - **Schedule** preset dropdown (Off / Hourly / Daily / Weekly / Custom cron) resolving to a canonical cron expression at submit time
- `POST /agents` validates `jobId` server-side against the caller's visibility scope.

**Key decisions.** Admin gating is enforced at the API layer, not only the dropdown — a non-admin who forges a `jobId` for someone else's job is rejected with `403` before the agent is written.

---

### 3.3 Phase 2 — Run + results + activity (2026-04-11, shipped)

**Scope.** The heart of the workbench: starting a run, streaming candidates back, persisting activity events, and rendering the Results / Runs / Activity / Settings drawer.

**Backend.**

- `services/AgentRunService.ts` (~590 lines). Public API: `startAgentRun()`, `cancelAgentRun()`. Creates an `AgentRun` row, writes `run.queued`, kicks off async execution via `setImmediate` so the HTTP response returns first, then orchestrates per-mode dispatch.
- **Cancellation.** In-memory `Map<runId, AbortController>`. `cancelAgentRun(runId)` calls `.abort()`, the source loops observe `signal.aborted`, and execution stops with a `CancelledError` that writes `run.cancelled` and sets `status='cancelled'`. The map entry is always cleaned up in the `.finally()` of `executeRun`. For horizontal scaling, Phase 7+ will replace this with a DB-backed cancel flag.
- `services/AgentActivityLogger.ts`. The single emit point. Writes one `AgentActivityLog` row then fans out to three `EventEmitter` channels: `run:<runId>`, `agent:<agentId>`, and `all`. Fire-and-forget safe — DB errors are logged but never thrown upstream, so a logger hiccup can't crash a run.
- **Three SSE endpoints.**
  - `GET /agents/:id/runs/:runId/stream` — subscribes via `subscribeToRun`, replays recent events from DB on connect, then streams live.
  - `GET /agents/:id/activity/stream` — subscribes via `subscribeToAgent`, powers the Activity tab's live tail. Added in the bug-fix pass (see §4.3).
  - `GET /admin/agents-terminal/stream` — subscribes via `subscribeToAll`, admin-only firehose (Phase 5, see §3.6).

**Frontend.**

- `components/AgentRunDrawer.tsx` (~1,495 lines). Four tabs:
  1. **Results** — streaming candidate cards with Like/Dislike, filter bar (Pending / Liked / Disliked / All), and two views: `list` and `profile-by-profile`.
  2. **Runs** — history list with `LiveRunCard` for in-flight runs (see §4.4) and `RunSummaryCard` for completed ones.
  3. **Activity** — uses `useAgentActivityStream` (SSE-backed), renders severity-coded rows with agent name + message + sequence + relative timestamp.
  4. **Settings** — full create-form parity (§3.5).
- `hooks/useAgentRunStream.ts` — connects to the per-run SSE, accumulates candidates + activities into component state, auto-reconnects with backoff.
- `hooks/useAgentActivityStream.ts` — connects to the per-agent SSE, renders into the Activity tab as events land. Lives separately from `useAgentRunStream` because Activity can be open without a specific run pinned.
- Triage actions (`PATCH /agents/:id/candidates/:candidateId`) are debounced into local `triageOverrides` state so the row reflects the new status instantly; a background refetch reconciles.

**Gotcha.** The SSE handler uses `flushHeaders()` and writes `event:` + `data:` on separate lines per SSE spec. The heartbeat is a comment line (`: ping\n\n`) — do not change it to an `event:` line, otherwise browsers increment the message listener count and the admin terminal's pause buffer double-counts pings.

---

### 3.4 Phase 2b — Review Profiles + score floor 60 (2026-04-11, shipped)

**Scope.** A calibration UI where a recruiter pages through each matched profile one at a time, keyboard-approves or keyboard-rejects, and uses rejections to teach the agent.

**Shipped.**

- `components/ReviewProfilesView.tsx` — profile-by-profile view toggled from Results. Three inner tabs per candidate (Experience / Education / Skills), sourced from `ParsedResumeData` on the candidate's linked resume.
- **Keyboard shortcuts.** `K = approve`, `J = reject`, `←/→ = navigate`, `E = open criteria modal`. Matches the Triage lane's hjkl muscle memory.
- **"I've found initial matches" intro card.** First-run landing panel inside the Review view that primes the recruiter for the calibration loop.
- **Score floor 60.** Hard-coded in `sources/llmMatcher.ts` as `DEFAULT_THRESHOLD`. Any resume scored below 60 is logged as `match.rejected_below_threshold` (severity `debug`) and skipped. The threshold is overridable per context; external vendor scores below 60 are gated identically.

**Key decisions.** Profile-by-profile mode is **not** a separate route — it's a `view` state on the Results tab so the back button restores the list view cleanly. Rejections don't retrain the agent's criteria automatically in v1; a future "find more + criteria suggestions" pass (see §10 open follow-ups) reads rejections and suggests criteria edits.

---

### 3.5 Phase 2c — Edit Criteria modal (2026-04-11, shipped)

**Scope.** A dedicated modal for the structured criteria bag that lives on `Agent.config.criteria` and flows into `llmMatcher.buildAugmentedJd`.

**Shipped.**

- `components/AgentCriteriaModal.tsx` (~584 lines). Tactile pin/drag UI: every criterion is a chip with a pin toggle and a drag handle. Drag between two buckets — **MOST IMPORTANT** and **LEAST IMPORTANT** — using native HTML5 drag-and-drop.
- **Pinned = mandatory dealbreaker.** The LLM prompt in `buildAugmentedJd` explicitly labels pinned items as "DEALBREAKERS. A candidate missing ANY of the following MUST be disqualified (grade F, verdict 'Not Qualified')." Non-pinned `most` are labeled "Highly weighted preferences". `least` becomes "Nice-to-haves".
- **Storage.** `Agent.config.criteria: Array<{id, text, pinned, bucket}>`. Read/written through the same `PATCH /agents/:id` endpoint; no dedicated criteria endpoint (presets use `/agents/criteria-presets/*` instead).
- **Presets.** Importable via `AgentCriteriaPreset` model + the criteria preset routes. On import, the preset's criteria are **copied** into `Agent.config.criteria` — later preset edits do not retroactively mutate existing agents, so run history stays reproducible.

**Key decisions.** Native HTML5 DnD was chosen over `react-dnd` or `dnd-kit` specifically because the UI only needs 2-bucket between-group drop — no nested containers, no virtualized lists. It keeps the bundle small and avoids a dep.

---

### 3.5b Phase 2d — Settings tab (2026-04-11, shipped)

**Scope.** Bring the full create form into the detail drawer so a recruiter never has to delete-and-recreate to change source, schedule, or criteria.

**Shipped.**

- `SettingsTab` component in `AgentRunDrawer.tsx` (line ~1094). Loads the full `AgentDetail`, renders:
  - Name, Job picker, Task type, Source modes, Instructions, Schedule — all identical to the create modal.
  - Section headers + spacing that match the Agents Workbench enterprise SaaS spec.
  - **Sticky save bar** at the bottom of the tab that appears only when `dirty === true`.
  - **Danger Zone** at the bottom with a "Delete agent" button that calls `DELETE /agents/:id` and closes the drawer.
- Every form change mutates local `agent` state; `dirty` is tracked from a deep-compare vs. the loaded snapshot. Save calls `PATCH /agents/:id` with the full config.

**Known limitation.** The create modal and the Settings tab **duplicate** the form rendering code. An `AgentForm` shared component is the cleanest next step but was deferred — see §10.

---

### 3.6 Phase 3 — Source adapters + LLM scoring (2026-04-11, shipped)

**Scope.** Replace Phase 2's keyword scoring stub with real LLM-backed matching, plus the three source adapters and the admin config UI.

**Shipped.**

- `services/sources/llmMatcher.ts` (~340 lines). The shared matcher. Takes a pool of resumes + JD + criteria + instructions and runs `ResumeMatchAgent` in batches of `DEFAULT_CONCURRENCY = 5`. Skips any resume that already has an `AgentCandidate` for this agent (de-dupe across runs). Builds an **augmented JD** via `buildAugmentedJd()` that weaves structured criteria into the prompt as dealbreakers / highly-weighted / nice-to-have sections.
- `runInstantSearch` — queries `Resume` where `userId = agent.userId` (owner's private pool), capped at `MAX_POOL_INSTANT = 50`.
- `runMinIOSearch` — queries `Resume` where `originalFileProvider = 's3'` AND `userId != agent.userId`. "MinIO" here means the S3-compatible archive, treated as a shared company-wide pool disjoint from the owner's own uploads. Capped at `MAX_POOL_MINIO = 100`.
- `runExternalApiSearch` — iterates `ExternalSourceConfig` rows with `enabled = true`, optionally pinned to a single `externalApiConfigId` on the agent's source config. For each, decrypts credentials via `lib/crypto.ts:decryptJson()` and dispatches to `CustomHttpDriver`. Candidates are persisted **without** a `resumeId` (they don't live as `Resume` rows) and are metadata-tagged with `{ provider, externalSourceConfigId, location }`. Cap: `MAX_EXTERNAL_PER_DRIVER = 25`.
- `services/sources/drivers/CustomHttpDriver.ts` — POST `{baseUrl}/search` with `{criteria, instructions, jobTitle, limit}` and expects a standard `{candidates: ExternalCandidate[]}` envelope. Future drivers (`linkedin`, `github`, `seekout`) will implement the same `ExternalSourceDriver` interface.
- `lib/crypto.ts` — `encryptJson` / `decryptJson` helpers using `FIELD_ENCRYPTION_KEY`. Used exclusively for `ExternalSourceConfig.credentials` today; reserved for any future field-level secrets.
- `pages/AdminAgentSourcesTab.tsx` (~500 lines) — admin-only tab at `/product/profile/admin/sources`. Three toggles for the workspace-level `SourceConfig` plus CRUD for `ExternalSourceConfig` entries.
- `routes/adminAgentSources.ts` — the CRUD backend, admin-guarded.

**Key decisions.**

- All three source branches produce activity events with a **scope discriminator** in the payload (`owner` for instant, `shared` for minio, `external_api` + provider for external) so the activity tab can tell at a glance where a batch came from.
- A resume that already exists as an `AgentCandidate` for this agent is skipped at the batch pre-filter step, so re-running an agent doesn't re-score (or re-charge) candidates the recruiter already saw. This is the foundation the future "find more" button will build on.

---

### 3.7 Phase 4 — Scheduler (2026-04-11, shipped)

**Scope.** Honor the `Agent.schedule` field with real cron-based dispatch.

**Shipped.**

- `services/AgentSchedulerService.ts` (~190 lines). Built on `node-cron`; single-process; in-memory `Map<agentId, {cron, task}>` holding `ScheduledTask` handles.
- **Lifecycle hooks.**
  - `init()` — called once from `backend/src/index.ts` after Prisma connects. Loads all agents with `scheduleEnabled = true AND status = 'active'`, registers a cron task per agent, and runs the missed-run catch-up pass.
  - `register(agent)` — called from `POST /agents` and `PATCH /agents/:id` with the post-write record so schedule changes take effect immediately. Idempotent — re-registering unregisters the old task first.
  - `unregister(agentId)` — called from `DELETE /agents/:id` and from `register` when a caller flips `scheduleEnabled` to `false`.
  - `shutdown()` — graceful SIGTERM/SIGINT path that stops every registered task.
- **Missed-run catch-up.** On boot, for each agent where `nextRunAt != null AND nextRunAt < now()`, the scheduler fires a **one-shot catch-up** via the same `fire()` path a live tick uses. Only one catch-up is issued regardless of how many firings were missed (no replay of a week of hourly runs after a week-long outage).
- **DB-lock concurrency guard.** Before dispatching, the scheduler performs:

  ```sql
  UPDATE "Agent"
  SET "lastRunAt" = NOW()
  WHERE "id" = $1
    AND ("lastRunAt" IS NULL OR "lastRunAt" < NOW() - INTERVAL '30 seconds')
  ```

  Only the process whose `UPDATE` affects one row proceeds to create the `AgentRun`. Single-process dev effectively no-ops this guard; multi-instance deploys behind a shared Postgres get double-fire protection for free.
- **Manual trigger.** `agentScheduler.triggerNow(agentId)` is exposed as a dev helper (ad-hoc fire bypassing the cron tick, identical to what `POST /agents/:id/runs` does but for scheduler-path testing).
- **Activity events.** Every fire, success, and failure emits via `AgentActivityLogger` with `actor = 'schedule'` so the admin terminal sees scheduled runs identically to user-initiated ones. Catch-up fires carry `{catchup: true, missedBy: <seconds>}` in the payload.
- `listRegistered()` — dev-only helper returning `{agentId, cron}[]` for every live registration. The authoritative list is `SELECT id, schedule FROM "Agent" WHERE "scheduleEnabled" = true`; any drift means a schema-change restart was missed.

**Timezone.** Defaults to `SCHEDULER_TZ || 'UTC'`. Render runs UTC. Recruiters who need a local time pick the Custom cron preset in the Schedule field and build the expression themselves for now — tz-aware presets are a v1.1 ask.

---

### 3.8 Phase 5 — Comprehensive logging + admin terminal (2026-04-11, shipped)

**Scope.** Make every LLM invocation visible in real time, attribute token/cost/latency per run, and give admins a firehose terminal to watch the whole system.

**Shipped.**

- **Six metric columns on `AgentRun`**: `tokensIn`, `tokensOut`, `costUsd`, `llmCallCount`, `avgLatencyMs`, `durationMs`. Populated at run completion by `aggregateLlmStats(runId)`, which sums the payloads of every `llm.call.completed` event written during the run. Failed runs still persist whatever partial totals were observed before the failure.
- **Per-call LLM events.** `llmMatcher.ts` wraps each `ResumeMatchAgent.match()` call with:

  ```
  llm.call.started  (severity=debug, payload={sequence, resumeId, callRequestId})
  ↓
  llm.call.completed (severity=info, payload={sequence, resumeId, callRequestId,
                      tokensIn, tokensOut, costUsd, latencyMs, model, provider})
  ↓ or ↓
  llm.call.failed   (severity=error, payload={sequence, latencyMs, callRequestId})
  ```

  Each call gets a unique `callRequestId = ${runId}-c${seq}` so the snapshot read from `LoggerService.getRequestSnapshot()` is unambiguous.
- **Monotonic `sequence` column on `AgentActivityLog`.** Derived from `payload.sequence` if present, else 0. Lets the terminal replay a run's LLM dispatch order even when async writes land out of order.
- **Admin Terminal backend** — `routes/adminAgentsTerminal.ts`. Three endpoints:
  - `GET /history?limit=N` — one-shot backfill (newest-first, reversed client-side), joins `agent.name`, default 200 / max 1000.
  - `GET /stream` — SSE. `subscribeToAll` handler with per-event `agentName` resolution cached in-memory. 25-second comment heartbeat. `Content-Type: text/event-stream` + `X-Accel-Buffering: no` so Render's proxy doesn't buffer.
  - `GET /runs?limit=N` — recent `AgentRun` rows joined with agent name + user + candidate/activity counts for the sidebar.
- **Admin Terminal frontend** — `pages/AdminAgentsTerminal.tsx` (~426 lines). Route `/product/admin/agents-terminal`, wrapped in `<ProtectedRoute adminOnly>`. Monospace `bg-slate-950` panel, virtualized event list, pause/resume/clear/auto-scroll/export-JSONL controls, filter bar (event type chips, severity, agent name/id contains, run id exact), keyboard shortcuts (`Space`, `C`, `/`, `Esc`, `J/K`, `Enter`), severity+category color coding (violet for `llm.*`, sky for `source.*.hit`, emerald for `match.scored`, rose for errors, amber for warn).
- **Admin-only scrub on every other endpoint.** `scrubRunStats` and `scrubActivityRow` strip `tokensIn`, `tokensOut`, `costUsd`, `llmCallCount`, `avgLatencyMs`, `model`, `provider` from responses going to non-admin callers. Applied on: `GET /runs`, `GET /runs/:runId`, `GET /runs/:runId/progress`, `GET /activity`, `GET /activity/stream`, `GET /runs/:runId/activity`. Frontend also conditionally renders these fields via `useAuth().user.role`.

**Spec-level note.** Phase 5 did not introduce any new env vars — it reuses Prisma, the existing `AgentActivityLogger` EventEmitter, the existing SSE transport, and the existing session-cookie auth.

---

### 3.9 Phase 6 — Smart Agent / ICP + Hard Requirements (2026-04-12, shipped)

**Scope.** Close the learning loop. Phases 0–5 produced a workbench where triage feedback was write-only; nothing the recruiter liked or disliked changed the next run. Phase 6 introduces an **Ideal Candidate Profile (ICP)** — an LLM-inferred, versioned, structured profile rebuilt from Like / Dislike history — and **hard requirements (硬性条件)** — user-declared boolean pre-filters that exclude candidates before any LLM call. The two are deliberately separated: the ICP is the recruiter's taste (probabilistic, LLM-conditioned), hard requirements are the recruiter's policy (deterministic, pre-filter). Together they turn the workbench from a keyword-flavored matcher into a learning system.

**The learning loop.**

```
Run 1 (cold start) ─► triage (Like/Dislike) ─► ICPGeneratorAgent
        ▲                                              │
        │                                              ▼
     next run  ◄─── ICP v2 loaded + anchors injected + hard reqs pre-filter
```

Every Like is a positive exemplar; every Dislike is a negative exemplar. The ICPGeneratorAgent extracts patterns (core skills, anti-skills, seniority band, soft signals, anchor candidate IDs) into a typed JSON profile. The next run loads the latest ICP, pre-filters the pool with the agent's hard requirements, and injects the ICP narrative + anchor names into the matcher prompt. With more triage, the profile sharpens; the like-rate on run N+1 should exceed run N.

**The strict separation that holds the feature together.**

- **Hard requirements** live on `Agent.config.hardRequirements`. User-owned, deterministic, enforced via `applyHardRequirements()` in `backend/src/lib/hardRequirementsFilter.ts` as a SQL/JS pre-filter **that the LLM never sees**. Rules are typed (`experienceYears gte 3`, `location in [Beijing]`, `skills.technical contains_any [Go, Python]`) and produce a `{passed, rejected}` bifurcation before a single token is spent.
- **ICP** lives on the new `AgentIdealProfile` table. LLM-inferred, probabilistic, injected into `buildAugmentedJd()` as a **scoring conditioner** — a new section of the user message the scorer consumes alongside the JD and criteria. Regeneration is a separate LLM call routed through `IdealCandidateProfileAgent`, not a side effect of a matching run.
- **`suggestedHardRequirements`** lives on the ICP version. The ICP agent may propose rules ("all 6 liked candidates are based in Beijing → suggest `location = Beijing`") but those suggestions are read-only artifacts — a rule only becomes enforced when the user clicks "Promote" in the UI, which calls `POST /agents/:id/ideal-profile/promote-suggestion`.

This split is load-bearing. Putting the rules on the ICP would let the LLM silently override the recruiter's policy. Putting ICP hints into the hard filter would discard candidates the LLM might have surfaced as hidden gems. Keeping them apart is what lets the user regenerate the ICP without touching their rules and lets the system inject soft profile context without weakening strict filters.

**Anchor candidates (not abstract weights).** The matcher prompt addition is not "use this ICP to score" — it's a list of named exemplars. `resolveAnchors()` in `llmMatcher.ts` reads `profile.anchorCandidateIds` + `antiAnchorCandidateIds` from the ICP and fetches `{name, headline}` for each, producing a block like:

```
## Anchor candidates (use as ground truth)
POSITIVE EXEMPLARS — score this resume HIGHER if it resembles these:
  1. Wang Tao — Senior Backend Engineer @ ByteDance
  2. Li Mei — Staff Engineer @ Meituan
NEGATIVE EXEMPLARS — score this resume LOWER if it resembles these:
  1. Zhang Wei — Frontend dev, 3 role switches in 5 years
```

LLMs imitate concrete examples far better than they apply abstract weight vectors. Anchors are the bridge between unstructured recruiter taste and structured scoring, and they're what gets the hidden soft-signal preferences (startup experience, 985 background, ships fast) legible to the matcher without ever being typed into a criteria box.

**Cold-start support.** Run 1 has zero Likes and zero Dislikes. `IdealCandidateProfileAgent` accepts a `likedCandidates: []` / `dislikedCandidates: []` input and still produces a minimal profile seeded from the JD + criteria alone, flagged with `confidence ≤ 0.3`. `AgentRunService.executeRun()` also works with `icp = null` — the new sections are simply absent from `buildAugmentedJd()` and the existing Phase 3 behavior holds verbatim. **No regression for brand-new agents.**

**Legal field blocklist.** `backend/src/lib/hardRequirementsFilter.ts` rejects any rule whose `field` contains a substring from `LEGAL_BLOCKLIST`: `age`, `gender`, `race`, `religion`, `nationality`, `marital`, `pregnan`. Validation runs at the `PATCH /hard-requirements` route before persistence and again in the dry-run preview. Location and language are explicitly allowed (business-legitimate filters). Per-jurisdiction overrides are deferred — the base list ships globally and is audited in-code. A frontend user attempting to save a `custom` regex rule targeting an illegal field gets a `HR_VALIDATION_FAILED` response with the field name echoed back.

**Versioning + soft revert.** Every `POST /ideal-profile/regenerate` creates a new `AgentIdealProfile` row with `version = max + 1` (unique index `@@unique([agentId, version])`). The old row is never deleted; `getVersionHistory()` returns the full ladder newest-first. `POST /ideal-profile/revert` is a **soft** revert — it copies the target version's `profile` + `suggestedHardRequirements` forward as a new latest version rather than rewinding the counter, so the audit trail stays linear. The user cannot manually delete a single version.

**Dry-run guardrail.** Before a run starts — or before the user saves a new hard requirement — the frontend can call `POST /agents/:id/hard-requirements/dry-run` with a proposed rule set and get back `{poolSize, passed, rejected, rejectionsByRule, sampleRejected}`. `HardRequirementsWarning.tsx` surfaces this as an amber banner ("This rule excludes 397 of 420 candidates · continue?") before any destructive action. If `remaining / poolSize < 5%` the warning flips to rose and the user must explicitly opt in. The dry-run endpoint hits zero LLM calls and zero persistence — pure Prisma query + JS filter.

**Auto-suggest, never auto-run.** The regen flow is strictly user-confirmed. The frontend surfaces a "Regenerate profile" CTA when `newSignalsSinceLastIcp ≥ 3 AND at least 1 new dislike`, but no code path ever fires a regen on its own. The `agent.config.icpSettings.autoRegenAfterTriageActions` field exists in the types and the schema, but is **not yet wired** into the triage endpoint — Kenny explicitly deferred the auto-trigger until post-v1 so users see an explicit "new ICP available" confirmation every time. This is a feature, not a limitation: silently swapping the active ICP would erode trust. See open follow-ups below.

**Seven new endpoints** (all under `/api/v1/agents/:id/`, all `requireAuth` + ownership via `getVisibilityScope()`):

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/ideal-profile` | Latest `AgentIdealProfile` for the agent, or `404 ICP_NOT_FOUND`. |
| `GET` | `/ideal-profile/history` | All versions newest-first (default 20, max 50). |
| `POST` | `/ideal-profile/regenerate` | Blocking LLM call via `IdealCandidateProfileAgent`; writes a new version row. 5–15s latency. |
| `POST` | `/ideal-profile/revert` | Soft revert — copies version N forward as `max + 1`. |
| `POST` | `/ideal-profile/promote-suggestion` | Copies a `suggestedHardRequirements[i]` entry into `Agent.config.hardRequirements` with `source: 'icp_suggestion'` + `sourceIcpVersion`. |
| `PATCH` | `/hard-requirements` | Full-replace of `Agent.config.hardRequirements`. Validates field × operator × value type matrix; enforces the legal blocklist; max 20 rules. |
| `POST` | `/hard-requirements/dry-run` | Pure Prisma + JS preview: `{passed, rejected, rejectionsByRule, sampleRejected}` for a proposed rule set. No LLM, no persistence. |

**New activity events.** Appended to the taxonomy in §7:

| Event | Severity | When |
|---|---|---|
| `icp.regeneration.started` | `info` | Before the LLM call in `IdealProfileService.generateForAgent()`. |
| `icp.regenerated` | `info` | After successful persistence of the new version. Payload: `{version, confidence, generatedFromLikes, generatedFromDislikes, tokensIn, tokensOut, costUsd}`. |
| `icp.regeneration.failed` | `error` | LLM call or validation failure. Prior version stays active. |
| `icp.loaded` | `info` | Once per run when `loadCurrent()` returns a profile. Payload: `{icpVersion, confidence, coreSkillCount, anchorCount}`. |
| `icp.skipped` | `debug` | Once per run when no ICP exists — scoring proceeds with JD + criteria only. |
| `icp.reverted` | `info` | Soft-revert action. Payload: `{fromVersion, toVersion}`. |
| `hard_requirements.updated` | `info` | `PATCH /hard-requirements` succeeded. Payload carries the promoted rule id or a diff. |
| `hard_requirements.applied` | `info` | Once per source branch. Payload: `{poolSize, passed, rejected, ruleCount, topRejectionReasons}`. |
| `match.filtered_by_hard_requirement` | `debug` | Per rejected candidate, capped at 20 per branch to avoid log spam. Payload: `{resumeId, ruleId, reason}`. Renders in the admin terminal only. |

**Backend file inventory** (Phase 6 only).

| File | LOC | Role |
|---|---|---|
| `backend/src/types/icp.ts` | 150 | Shared types: `HRField`, `HROperator`, `HardRequirement`, `IdealCandidateProfile`, `ExemplarCandidate`. |
| `backend/src/agents/IdealCandidateProfileAgent.ts` | 559 | `BaseAgent` subclass. Temperature `0.4`. Contains the verbatim system prompt (see icp-architecture.md §4.2). Output validation via `isIdealProfileOutput` — parse failures degrade to `{error: 'parse_failed'}` rather than silently substituting defaults. |
| `backend/src/services/IdealProfileService.ts` | 442 | Orchestrator. `generateForAgent`, `loadCurrent`, `getVersionHistory`, `revertToVersion`, plus the resume-digest builder that compresses `ParsedResumeData` into ~400-token exemplar lines. |
| `backend/src/lib/hardRequirementsFilter.ts` | 565 | `validateHardRequirement`, `applyHardRequirements`, `topRejectionReasons`, the field × operator matrix, the `LEGAL_BLOCKLIST`, and the `DEGREE_RANK` table for the `education.degree gte` operator (maps Chinese aliases `本科/硕士/博士` onto the English ordinal). |
| `backend/src/services/sources/llmMatcher.ts` (modified) | +~130 | New `buildAugmentedJd` prepends `## Recruiter's Ideal Candidate Profile` and appends `## Anchor candidates` sections when `icp` is non-null. `resolveAnchors()` fetches up to 5 positive + 5 negative exemplar digests once per run (not per resume) via a single `agentCandidate.findMany`. |
| `backend/src/services/AgentRunService.ts` (modified) | +~80 | `executeRun` now loads `icp + hardRequirements` once at run start, logs `icp.loaded` / `icp.skipped`, builds a `RunContext` carrying both, and each source branch calls `filterAndLog()` between fetch and match. The `stats` JSON grows a `filteredByHardRequirements` key. |
| `backend/src/routes/agents.ts` (modified) | +~350 | Seven new routes (see table above). Reuses `getVisibilityScope` + `buildUserIdFilter` for ownership checks. |

**Frontend file inventory.**

| File | LOC | Role |
|---|---|---|
| `frontend/src/components/IdealProfileCard.tsx` | 336 | The persistent ICP review card. Renders narrative summary (dark AI-summary box), confidence bar (4 buckets), core/bonus/anti skill chips, anchor count, version pill, and the "Regenerate" button. Used in `SettingsTab` of `AgentRunDrawer`. |
| `frontend/src/components/HardRequirementsEditor.tsx` | 610 | The reusable amber "STRICT FILTER" editor. Field picker + type-aware operator picker + type-aware value input (number / tag list / degree enum / regex). Auto-generates the plain-language description below each row. Inline validation per rule. Quick-add preset chips. |
| `frontend/src/components/RegenerateProfileModal.tsx` | 239 | Modal shown during the 5–15s regen LLM call. Progress phases ("Analyzing signals → Clustering traits → Drafting narrative → Finalizing"), indeterminate fallback, Cancel button that aborts the request and restores the prior version. |
| `frontend/src/components/HardRequirementsWarning.tsx` | 138 | The pre-run / pre-save dry-run banner: "Of 420 candidates, 397 would be excluded." Top 2 offending rules highlighted. Amber for `remaining > 5%`, rose for `remaining < 5%`. |
| `frontend/src/hooks/useIdealProfile.ts` | 202 | Thin data hook. `useIdealProfile(agentId)` returns `{profile, loading, error, regenerate, revert, history}` backed by the seven new endpoints. |
| `frontend/src/components/AgentRunDrawer.tsx` (modified) | — | `SettingsTab` now renders `<IdealProfileCard>` at the top and a collapsed `<HardRequirementsEditor>` below it; the modified `RunSummaryCard` hooks into `useIdealProfile` for the "Using ICP v3" badge. |

**Gotchas.**

- **No Prisma push-down for hard requirements in v1.** `applyHardRequirements()` fetches the full pool and runs every predicate in JS. The architecture doc (§3.4, §10.4) describes a two-stage DB pre-filter + JS post-filter plan; the DB stage is deferred because the `Resume.experienceYears` / `Resume.location` denormalized columns don't exist yet. For pools under ~500 resumes (current dev default) this is sub-100ms and fine. Running against a real MinIO archive of 10K+ resumes will need the DB stage.
- **Degree hierarchy is multilingual by lookup table.** `DEGREE_RANK` in `hardRequirementsFilter.ts` hardcodes aliases for `本科/学士/硕士/研究生/博士/专科/高中` alongside the English enum. If a parser outputs a new Chinese variant, the `education.degree gte` operator silently fails to match. Long term this belongs in the resume parser, not the filter.
- **Anchor resolution runs once per run, not once per resume.** A run that scores 50 resumes does a single `prisma.agentCandidate.findMany` with `id: in [...]` instead of 50 separate lookups. This is deliberate — the anchor list is constant across every matcher call inside the run — but if you move anchor resolution into `matchResumesWithLLM()` you will burn N+1 queries.
- **The LLM prompt is in `getAgentPrompt()` verbatim.** Editing it without updating `docs/icp-architecture.md §4.2` will cause drift. That doc is the source of truth for the prompt text.
- **`filteredByHardRequirements` lives on `AgentRun.stats` JSON, not a new column.** Querying "total filtered this month" requires a JSON path expression. If this becomes a common analytics query, promote it to a top-level column like Phase 5 did with the six metric columns.

**Open follow-ups.**

- **Auto-regen trigger** — `agent.config.icpSettings.autoRegenAfterTriageActions` field exists in the types but the triage endpoint (`PATCH /candidates/:candidateId`) does not yet increment a counter or enqueue a regen. Kenny deferred wiring this until the threshold is tuned against real usage data.
- **Prisma push-down for hard requirements** — mentioned above. Needs schema changes to promote `experienceYears` + `location` to top-level indexed columns on `Resume`. Until then, every hard-req filter runs in JS.
- **Five open architecture questions in `icp-architecture.md §11`**, paraphrased: (Q1) where to normalize `education.degree` multilingual values — parse stage or filter stage; (Q2) how to handle deleted anchor candidates — lazy drop vs. warn vs. auto-regen; (Q3) whether ICP confidence should dynamically tune `DEFAULT_THRESHOLD = 60`; (Q4) cross-agent ICP sharing; (Q5) how to apply hard requirements to external-API candidates with partial metadata. All five have recommendations in the doc; none are implemented.
- **Seven product open questions in `icp-product-spec.md §12`** — auto-regen cadence, minimum likes before ICP influences scoring, hard-requirement inheritance scope (job vs. agent), jurisdiction-aware legal blocklist, Like/Dislike weight ratio, team-visibility of ICPs, and migration behavior for pre-Phase-6 agents. These are for Kenny before v2 work starts.
- **Suggestions modal integration (`CriteriaSuggestionsModal`)** — `icp-design.md §6` describes an amber "SUGGESTED HARD REQUIREMENTS" section inside the existing suggestions modal. The `promote-suggestion` backend route is built but the suggestions-modal UI integration is pending.
- **Activity tab filter chip for `match.filtered_by_hard_requirement`** — events are emitted at `debug` severity so they show in the admin terminal but not the recruiter Activity tab. A dedicated "Filtered by HR" chip on the recruiter view would close the feedback loop.
- **Auto-run "find more" after regen** — when the ICP is regenerated, the workbench could offer to immediately re-run against the existing pool with the new profile. Currently the user must click "Find more" manually. Flagged by the product spec as a natural UX win.

**Status.** Shipped on `main` 2026-04-12. End-to-end path verified: create agent → run → triage (≥3 likes + ≥1 dislike) → regenerate ICP → next run loads ICP, applies hard reqs, and injects anchor candidates. The admin terminal shows `icp.loaded` → `hard_requirements.applied` → `match.scored` → `run.completed` with correct filtered-by-HR counts.

---

### 3.10 Phase 7a — Cross-agent warm-start (2026-04-12, shipped)

**Scope.** Phase 6 learned **per agent**: each `AgentIdealProfile` was rebuilt from that agent's own triage history, so a brand-new agent on Monday started at Phase 6 cold-start confidence (≤0.3) even if the user had triaged 200 candidates across five other agents the week before. Phase 7a closes that gap by rolling a user's taste up into a single `UserRecruiterProfile` and seeding every new agent's v1 ICP from it. Existing agents are untouched; the warm-start fires only at create time, only for users who have a profile, and only when the new `agentInheritsFromProfile` field is `true` (default).

**Schema changes** (`backend/prisma/schema.prisma`).

- **New** `UserRecruiterProfile` — one row per user. Fields: `topSkills`, `topAntiSkills`, `topLocations`, `topIndustries`, `topCompanySizes` (all JSON arrays of `{term, weight, lastSeenAt, sourceCount}`), `recurringHardReqs` JSON, `signalsLearned` / `agentCount` / `lastRebuiltAt`. JSON-first by design — the aggregate shape evolves fast during Phase 7 and normalization is a premature optimization. `@@index([userId])`, `userId @unique` enforces one row per user.
- **Modified** `Agent` — added `agentInheritsFromProfile Boolean @default(true)`. Per-agent opt-out for users who deliberately want a clean-slate agent ("don't bias this search with my other agents' history"). Read at create time; never read again.

**Key files.**

| File | LOC | Role |
|---|---|---|
| `backend/src/services/UserRecruiterProfileService.ts` | ~220 | `rebuildForUser(userId)` aggregates across all the user's `AgentIdealProfile` rows and writes a single `UserRecruiterProfile`. `getForUser(userId)` returns current row or null. `scheduleRebuild(userId)` is the throttled trampoline called from `IdealProfileService.generateForAgent()` — at most one rebuild per user per 60s, debounced via an in-memory `Map<userId, timer>`. |
| `backend/src/services/IdealProfileService.ts` (modified) | +~90 | New method `seedFromUserProfile(agentId, userId, profile)` — constructs a synthetic v1 `AgentIdealProfile` from the rolled-up profile's top skills, anti-skills, locations, and industries. Confidence is pegged at `0.35` (slightly higher than pure cold-start `0.3` but below real-triage confidence) and `generatedFromLikes/Dislikes` are set to `0` with `reasoningTrace` flagged as `warm_start_from_user_profile`. At the end of `generateForAgent()` (after persisting the new version), schedules a debounced `rebuildForUser(userId)` so the next agent benefits from today's triage. |
| `backend/src/routes/userRecruiterProfile.ts` | ~80 | Three routes mounted at `/api/v1/user-recruiter-profile/*`: `GET /` (current user's profile), `POST /rebuild` (force-rebuild, respects the 60s debounce), `DELETE /` (reset — user goes back to cold-start). All `requireAuth`; no admin gate. |
| `backend/src/routes/agents.ts` (modified) | +~20 | `POST /agents` now reads `agentInheritsFromProfile` from the request body, persists it, then — when `true` and a profile exists — imports `userRecruiterProfileService` and `idealProfileService` lazily and calls `seedFromUserProfile(agent.id, userId, userProfile)`. Failures are logged but non-fatal: a warm-start failure must never prevent agent creation. |

**Decay half-life.** User-scope memories decay on a 30-day half-life (matches `HALF_LIFE_DAYS.user` in `ContextRetrievalService`). The rolled-up `UserRecruiterProfile` itself has no decay — it's rebuilt fresh every time, and the underlying `AgentIdealProfile.confidence` values it aggregates over are already weighted by recency via the per-agent regeneration cadence.

**Key decisions.**

- **Rebuild, don't increment.** `rebuildForUser` is a full-aggregate rewrite, not an in-place update. This keeps the shape simple (no "delete item from array" diffing), is idempotent, and survives out-of-order AgentIdealProfile writes from concurrent agents.
- **Throttled to 60s.** A user triaging 50 candidates in a minute would otherwise trigger 50 rebuilds. The debounce batches them into one.
- **Warm-start is strictly additive.** Zero regression risk — if the user has no profile, no warm-start fires and the existing cold-start path runs verbatim. If the user opts out per-agent, same thing.
- **`agentInheritsFromProfile` is not wired into a UI toggle yet.** The field exists, the backend honors it, but the Settings tab does not expose it to the user in v1. Per-agent opt-out is API-only for now — flagged in §10.

**Gotchas.**

- `seedFromUserProfile` produces a **synthetic** ICP with `generatedFromLikes = generatedFromDislikes = 0`. Do not read these counters as "the user's real triage history" — they reflect the seed operation only. The real counters appear on subsequent regen versions.
- The `UserRecruiterProfile` table has **no foreign-key back-link** from `AgentIdealProfile`. The relationship is "this user's profile is derived from this user's ICPs" and lives in code, not in a join table. Dropping a user cascades to both via `User.onDelete: Cascade`.

**Status.** Shipped on `main` 2026-04-12. The rebuild-on-ICP-generate hook is live; the warm-start hook on `POST /agents` is live; the three routes are mounted at `/api/v1/user-recruiter-profile/*`. Not yet shipped: a user-facing settings page that lets the recruiter see and edit their profile.

---

### 3.11 Phase 7b — Implicit signal capture (2026-04-12, shipped)

**Scope.** Explicit Likes and Dislikes are a strong signal but miss everything in between: the candidates the recruiter paused on, the sections they scrolled to, whose email they copied without messaging. Phase 7b captures these implicit signals into an append-only `CandidateInteraction` table so the Phase 7c synthesis worker (see §3.12) can distill them into memories alongside explicit triage. Nothing written in 7b is yet read by the LLM — the write path is live; the read path ships with the synthesis worker.

**Schema changes.**

- **New** `CandidateInteraction` — append-only. Fields: `userId`, `agentId?`, `runId?`, `candidateId`, `resumeId?`, `eventType` (string: `viewed | expanded | dwell | contact_copied | link_clicked | scroll_deep`), `durationMs?` (dwell time), `metadata` JSON (event-specific — e.g. `{scrollPct: 80, section: 'experience'}`), `createdAt`. Indexed on `(userId, createdAt)`, `candidateId`, `(eventType, createdAt)`. 90-day retention is the design target; the cleanup job is deferred to Phase 7.5.

**Key files.**

| File | LOC | Role |
|---|---|---|
| `backend/src/routes/candidateInteractions.ts` | ~100 | Single endpoint: `POST /api/v1/candidate-interactions`. Body: `{events: [{eventType, candidateId, agentId?, runId?, resumeId?, durationMs?, metadata?}]}`. Validates each event, writes all rows in a single `prisma.candidateInteraction.createMany()` call, returns `{accepted: N}`. `requireAuth`; `userId` is always stamped from the session, never trusted from the body. |
| `frontend/src/hooks/useCandidateInteractionTracker.ts` | 129 | Buffered client-side tracker. Exposes `track(event)` to call sites; accumulates into a local `useRef` buffer; auto-flushes every **5 seconds** OR when the buffer hits **50 events**, whichever first. Uses `navigator.sendBeacon` on `beforeunload` so the last few events survive tab close. Handles 4xx / network errors by dropping the batch (implicit signals are best-effort — a lost batch is a non-event). |
| `frontend/src/components/ReviewProfilesView.tsx` (modified) | +~35 | Dwell-tracking integration. Starts a `performance.now()` timer on profile mount, fires `{eventType: 'dwell', durationMs, candidateId}` on unmount or candidate switch. Also fires `{eventType: 'viewed', candidateId}` when the profile first renders. Keyboard approve/reject and tab switches within a profile do NOT fire additional events — they're captured by the explicit triage path. |

**Flush cadence rationale.** 5s / 50 events is the same tradeoff every telemetry library makes: short enough that a 10s tab-close loses ≤5s of data, long enough to batch. `sendBeacon` fallback on unload is the belt-and-braces. At peak (a recruiter reviewing 50 candidates in 5 minutes), a tracker emits ~250 events in 300s, i.e. ~2 batches; the DB write cost is negligible.

**Key decisions.**

- **No synthesis yet.** This ships only the write path. Rows accumulate in `CandidateInteraction`; the Phase 7c synthesis worker (when built) will process them into `MemoryEntry` rows. Until then, these rows are passive — they consume disk but do not influence any LLM call.
- **Wired into ReviewProfilesView only.** The profile-by-profile calibration view is the highest-value capture point (recruiters spend 30+ seconds per card there). Other candidate surfaces — the flat list view, Talent Hub, Smart Matching — are pending and are the primary Phase 7b follow-up. See §10.
- **`userId` server-stamped.** An attacker posting fake events for another user's `userId` gets theirs overwritten. Same pattern as every other write route.

**Gotchas.**

- **Volume estimate**: ~20 events per candidate × 50 candidates per run × 5 runs per user per week = ~5,000 rows/user/week. At 10k users that's 50M rows/week. The design calls for 90-day retention + aggregation; the cleanup job is not built yet and until it is, `CandidateInteraction` grows without bound. Not a blocker for dev; will be one at scale.
- **Dwell timer fires on every unmount.** If a recruiter rapidly arrows through 10 profiles in 15s, you get 10 dwell events with ~1500ms each. This is correct but noisy — the synthesis worker will need a floor (`durationMs < 2000 → drop`).

**Status.** Shipped on `main` 2026-04-12. The endpoint is mounted; the hook is importable from any component; `ReviewProfilesView` emits `viewed` + `dwell`. Events land in the DB. Nothing downstream yet reads them.

---

### 3.12 Phase 7c — Memory retrieval foundation (2026-04-12, partial)

**Scope.** Phase 7c is the retrieval primitive: the `MemoryEntry` table, the `ContextRetrievalService` that walks the scope hierarchy and ranks memories by cosine-similarity × decay × scope-boost, the prompt-injection formatter. What ships today is **the foundation on which the synthesis worker and the IdealProfileService integration will be built** — the write path (synthesis) and the read path (injection into `generateForAgent`) are deferred. This is a deliberate cut: the retrieval primitive is the piece that has architectural load-bearing decisions (scope boosts, half-lives, cosine vs pgvector); the write/read wiring is mechanical.

**Schema changes.**

- **New** `MemoryEntry` — the semantic memory primitive. Fields: `id`, `kind` (string: `preference | rejection_pattern | hard_req_suggest | anchor | company_wide | synthesized_fact`), `scope` (string: `user | team | workspace | job`), `scopeId` (userId / teamId / workspaceId / jobId depending on scope), `content` (the human-readable fact — e.g. "Prefers ex-FAANG engineers with startup stints"), `embedding` (JSON-serialized `number[]`, 1536 dims for OpenAI `text-embedding-3-small`), `weight` / `baselineWeight` / `reinforceCount` / `lastSeenAt` / `expiresAt?`, `jobContext` JSON (`{jobTitle?, industry?, companySize?, role?}`), `sourceEventId?` / `sourceAgentId?` for provenance. Indexed on `(scope, scopeId)`, `kind`, `expiresAt`, `(scopeId, kind, lastSeenAt)`. `@@index([scope, scopeId])` is the hot path for retrieval.

**Key file.**

| File | LOC | Role |
|---|---|---|
| `backend/src/services/memory/ContextRetrievalService.ts` | 229 | The retrieval primitive. `retrieveForRegen(query: RetrievalQuery)` accepts `{userId, jobId?, teamIds?, workspaceId?, queryEmbedding, k=15}`, fetches in parallel across every applicable scope (each capped at 500 DB rows), computes `score = cosineSimilarity(embedding, queryEmbedding) × decayedWeight × SCOPE_BOOST[scope]`, sorts descending, then enforces per-scope caps (`user: 8, team: 3, workspace: 2, job: 2`) before trimming to k. Returns `RetrievedMemory[]` with raw `cosineSim` + decayed `weight` + final `score` so callers can log the ranking decisions. `formatForPrompt(memories)` emits the "Prior learnings" section block that the regen prompt will append. `reinforce(memoryId)` bumps `lastSeenAt`, increments `reinforceCount`, and recomputes `weight = min(baseline × (1 + ln(count)), baseline × 3)` so retrieval reinforcement plateaus after ~20 hits. Cosine similarity is computed in JS over the Json-serialized embedding; pgvector migration is deferred. |

**Half-lives + boosts** (from the design doc, implemented verbatim):

```
HALF_LIFE_DAYS = { user: 30, team: 60, workspace: 180, job: 45 }
SCOPE_BOOST    = { job: 1.5, user: 1.2, team: 1.0, workspace: 0.8 }
PER_SCOPE_CAP  = { user: 8,  team: 3,  workspace: 2, job: 2 }
```

**What is deferred** (the other half of Phase 7c).

- **Synthesis worker (`MemorySynthesisWorker`)** — not yet built. Would run every 15 minutes per active user, pull recent `AgentCandidate` + `CandidateInteraction` rows since last synthesis, call an LLM (design calls for Gemini Flash at temperature 0.2) to distill them into facts, deduplicate against existing memories via cosine similarity > 0.85, and persist. Until this ships, `MemoryEntry` is empty and retrieval returns `[]`.
- **Embedding adapter (`embedText(s: string): Promise<number[]>`)** — not yet built. Design calls for OpenAI `text-embedding-3-small` routed through the existing `LLMService`. Without this, nothing can write embeddings to `MemoryEntry` and the retrieval service has nothing to cosine against.
- **Integration into `IdealProfileService.generateForAgent()`** — not yet wired. The service method has the extension point (`seedFromUserProfile` exists, retrieval is importable) but the actual call site that would do `const memories = await contextRetrievalService.retrieveForRegen(...)` and append `formatForPrompt(memories)` to the regen prompt is not yet added. When it is, the "Prior learnings" block will land in the ICP prompt automatically.
- **pgvector migration** — the `embedding` column is `Json` (a serialized `number[]`). The path to `vector(1536)` via a raw SQL migration + `embedding_vec vector(1536)` column is documented in `context-engineering-v7.md §2.3` but deferred until the synthesis worker actually populates rows.
- **Team + workspace scope UI** — the retrieval service already supports `scope='team'` and `scope='workspace'` queries, but the opt-in team-sharing UI (`Team.memorySharingEnabled` + `memorySharingMembers`) is not yet built. Until it is, all retrieval falls back to the user scope only.

**Status.** The `MemoryEntry` table + `ContextRetrievalService` file are on `main` 2026-04-12. The service is callable; its output is correct for any rows the caller manually seeds. Because the synthesis worker and embedding adapter are not yet built, production retrieval currently returns an empty array for every caller. This is a deliberate staged rollout — the data model and retrieval ranking are the load-bearing parts, and shipping them first lets the synthesis worker be developed against a stable interface.

---

### 3.13 Phase 7d — mem0 evaluation (2026-04-12, shipped)

**Scope.** Before building any of 7a/7b/7c natively, Kenny asked a research agent to evaluate [mem0](https://github.com/mem0ai/mem0) as the memory / context-engineering layer. The output is `docs/mem0-evaluation.md`. Phase 7d is the decision record: **Option B — Hybrid. Build native, mirror mem0's API surface, keep the swap door open.**

**The pgvector finding.** The single load-bearing fact in the report: mem0's Python SDK supports 20 vector stores including pgvector, but **the Node SDK supports only 5 (Qdrant, Redis, Valkey, Cloudflare Vectorize, in-memory)** and pgvector is not one of them. RoboHire's entire stack is Neon Postgres. Adopting mem0 in our Node backend would force a second datastore — Qdrant container on Render, new env vars, new backups, new monitoring — just for this one feature. Alternatively, we'd adopt mem0's managed cloud platform, but at the cost of sending recruiter preference data to a third-party trust boundary.

**Why native won** (the scoring matrix, reproduced from `mem0-evaluation.md §3.1`, weighted).

| Dimension | mem0 | Zep | Native | Weight |
|---|---|---|---|---|
| Retrieval quality | 3 | 4 | 3 | Medium |
| Decay / expiration | 2 | 5 | 4 | **High** |
| Synthesis / fact extraction | 4 | 4 | 3 | Medium |
| Scoping hierarchy | 4 | 2 | 5 | **High** |
| Node.js compatibility | 2 | 4 | 5 | **High** |
| Database fit (Neon/pgvector) | 1 | 1 | 5 | **High** |
| Cost (runtime) | 4 | 2 | 5 | Medium |
| Cost (build) | 5 | 4 | 2 | Medium |
| Observability integration | 2 | 2 | 5 | **High** |
| Vendor risk / lock-in | 3 | 2 | 5 | Medium |
| **Weighted total** | **3.0** | **3.0** | **4.2** | |

Native wins on every high-weight dimension. mem0 wins only on build cost. Zep Cloud (the Graphiti-based temporal-graph alternative) has the strongest stale-fact handling story of any candidate but is cloud-only, Community Edition is deprecated, and the graph model is overkill for a preference layer.

**Three secondary reasons native beat mem0** (not just pgvector).

1. **mem0's fact-extraction prompt is a black box in the OSS version.** Our scoring agents use temperature 0.1 for determinism and have carefully tuned prompts. Having memory synthesis run through mem0's default prompt — which we can't change without forking — breaks the tight prompt-quality feedback loop we rely on. Option (a) run our own extraction agent and write raw facts into mem0 via `infer: false`, or (b) fork the OSS extraction prompts. Option (a) is what we'd end up doing anyway, which collapses the value-add of mem0's built-in extraction.
2. **mem0's LLM calls do not flow through `LoggerService` or `AgentActivityLogger`.** Every other LLM call in RoboHire lands in `ApiRequestLog` for per-request cost attribution via `logger.startRequest()`. Adopting mem0 means a blind spot in our cost dashboard exactly where we're adding more LLM calls per user action.
3. **mem0 has no native reinforcement-weighted decay.** Their own April 2026 blog post calls stale-fact detection "an open research problem". They support explicit `expiration_date` at write time but there's no `updated_at`-weighted scoring, no half-life, no reinforcement boost on re-access. We would be building this ourselves regardless.

**The "keep the swap door open" path.** The native `ContextRetrievalService` public API intentionally mirrors mem0's method names (`addMemory` / `searchMemories` / `updateMemory` / `deleteMemory` / `expireMemories`) so that if our native stack hits a ceiling in 12–18 months, replacing the implementation with a `Mem0ManagedAdapter` is a single-file change — the callers don't know the difference. The cost of this mirroring is maybe 50 lines of interface plumbing; cheap insurance against a future where mem0's managed platform sprouts a killer feature we don't want to build ourselves.

**What Phase 7d actually shipped.**

- The full evaluation report at `docs/mem0-evaluation.md` — 432 lines, with scoring matrix, alternatives comparison (Zep / LangChain / native), integration sketch for Option B, citation footnotes, and six open questions for Kenny that informed the final design.
- The decision that unlocked the native build: Phase 7a/7b/7c above all proceed under "Option B — native with mem0-shaped API".

**Status.** Evaluation shipped 2026-04-11. Decision shipped and documented 2026-04-12. Revisit gate: if native extraction quality is poor or retrieval becomes unreliable at 10k+ memories, switch to mem0 managed or Zep Cloud behind the same interface.

---

### 3.14 Admin Memory Manager (Phase 7.5, 2026-04-12, shipped)

**Scope.** Phase 7's data model makes memory a first-class user-owned resource — and `context-engineering-v7.md §8.2` says explicitly that **memory content is sensitive and admin monitoring tools should NEVER expose raw content except via an explicit break-glass flow**. But RoboHire is a real product with real users, and eventually an admin will need to debug "why does Wei's new agent keep surfacing frontend devs when his job is backend?" That debugging needs to see the actual memory rows — which means a governed, audited, break-glass admin tool. Phase 7.5 ships that tool.

**The governance policy this implements.** Every admin read AND every admin write against memory data goes through `AdminMemoryService`, which writes a `MemoryAdminAuditLog` row BEFORE returning the payload. The audit log is durable, immutable, and indexed by `targetType` + `targetId` so a future user-facing "who looked at my memories" screen can be built against the same table. Admin edits of memory content additionally pass through a legal-content blocklist mirroring `hardRequirementsFilter.ts` — so even an admin cannot inject content matching `age`, `gender`, `race`, `religion`, `nationality`, `marital`, `pregnan` into a user's memory row. The break-glass UX in `AdminMemoryTab.tsx` prompts for an optional reason string on destructive actions (delete, reset, edit), and the reason is persisted to `MemoryAdminAuditLog.reason` alongside the diff.

**Schema changes.**

- **New** `MemoryAdminAuditLog` — every admin action on memory data goes here. Fields: `adminId` (the admin doing the action), `targetType` (string: `memory_entry | user_profile | interaction | user`), `targetId` (memoryId / userId / interactionId), `action` (string enum covering `view_profile | view_memories | view_interactions | edit_memory | delete_memory | pin_memory | unpin_memory | rebuild_profile | reset_profile | export | view_audit`), `reason?` (optional user-provided justification for the action), `changes?` JSON (`{before, after}` diff for edits), `ipAddress?`, `createdAt`. Indexed on `(adminId, createdAt)`, `(targetType, targetId, createdAt)`, `(action, createdAt)`. `admin User @relation onDelete: Cascade`.

**Key files.**

| File | LOC | Role |
|---|---|---|
| `backend/src/services/AdminMemoryService.ts` | 403 | The single entry point for admin memory operations. Every public method takes an `AdminContext` (`{adminId, reason?, ipAddress?}`) and writes a `MemoryAdminAuditLog` row BEFORE touching the data. Methods: `listUsersWithMemoryData`, `getUserProfile`, `listUserMemories`, `listUserInteractions`, `getMemoryDetail`, `editMemory`, `deleteMemory`, `pinMemory`, `rebuildUserProfile`, `resetUserProfile`, `queryAudit`. The legal-content check on `editMemory` iterates `LEGAL_CONTENT_BLOCKLIST` (case-insensitive substring match) and rejects the edit before the DB write if any term matches. Audit failures are logged to stderr but never block the admin action — the priority is "the admin can always debug", the secondary priority is "we always know they did". |
| `backend/src/routes/adminMemory.ts` | 201 | 11 routes mounted under `/api/v1/admin/memory/*` via the admin router at `backend/src/routes/admin.ts` (which already applies admin gating). `GET /users`, `GET /users/:userId/profile`, `GET /users/:userId/memories`, `GET /users/:userId/interactions`, `GET /memory/:id`, `PATCH /memory/:id`, `DELETE /memory/:id`, `POST /memory/:id/pin`, `POST /memory/:id/unpin`, `POST /users/:userId/profile/rebuild`, `DELETE /users/:userId/profile`, `GET /audit`. Each handler calls the matching `adminMemoryService.xxx()` with a `buildCtx(req)` that extracts `adminId` / `reason` / `ipAddress`. |
| `frontend/src/pages/AdminMemoryTab.tsx` | 716 | The Memory tab in Admin Dashboard. Split-pane UX: user list on the left, per-user detail on the right with three sub-tabs (Profile, Memories, Interactions) plus a read-only Audit feed. Memory edit / delete / pin / unpin / reset-profile all open a confirm modal with an optional reason textarea. The audit feed shows the last 50 actions across all users, each row carrying the admin's name, target, action, reason, and timestamp. |
| `frontend/src/pages/AdminDashboard.tsx` (modified) | — | Added a new "Memory" tab to the `TABS` array, rendered by `AdminMemoryTab`. Existing tab ordering preserved. |

**11 routes under `/api/v1/admin/memory/*`.**

| Method | Path | Action logged |
|---|---|---|
| `GET` | `/users` | `view_profile` (aggregate browse) |
| `GET` | `/users/:userId/profile` | `view_profile` |
| `GET` | `/users/:userId/memories` | `view_memories` |
| `GET` | `/users/:userId/interactions` | `view_interactions` |
| `GET` | `/memory/:id` | `view_memories` |
| `PATCH` | `/memory/:id` | `edit_memory` (+ `changes: {before, after}`) |
| `DELETE` | `/memory/:id` | `delete_memory` |
| `POST` | `/memory/:id/pin` | `pin_memory` |
| `POST` | `/memory/:id/unpin` | `unpin_memory` |
| `POST` | `/users/:userId/profile/rebuild` | `rebuild_profile` |
| `DELETE` | `/users/:userId/profile` | `reset_profile` |
| `GET` | `/audit` | `view_audit` (viewing the audit log is itself audited, to a separate channel — prevents a self-referential "who viewed the audit" loop from flooding the table) |

**Key decisions.**

- **Audit-on-read, not just audit-on-write.** The design-doc instinct is "only audit mutations". Phase 7.5 audits reads too — because the sensitivity of the data is **in the content itself**, and an admin reading a user's rejection-pattern memory is already a privacy event whether they modify it or not.
- **Audit-before-return, not audit-after.** Every service method writes the audit row before it issues the Prisma query for the actual payload. An admin who calls `editMemory` and then the DB write fails mid-request still leaves an audit trail of "this admin attempted this edit". The inverse — write-then-audit — would lose the attempt on failure.
- **Legal-content blocklist on edits.** An admin fixing a typo in a memory row cannot accidentally inject discriminatory content. Same word list as `hardRequirementsFilter.LEGAL_BLOCKLIST`. A follow-up should extract this into a shared lib (it's currently duplicated in two files).
- **`reason` is optional, not required.** UX call: making it mandatory would tempt admins to type garbage ("fix"). Making it optional but prominent (textarea, not a hidden field) nudges them to fill it in for destructive actions without blocking quick reads. The audit log carries `reason = null` when skipped; that's a legitimate signal in itself.
- **No rate limiting.** V1 ships without throttling admin memory routes because the user base is small and all admins are trusted. Flagged in §10 as a known gap.

**Gotchas.**

- **`auditRead` writes happen even for 404s.** If an admin requests `/memory/nonexistent-id`, the audit row is written and THEN the service returns null. This is intentional — "attempted to read" is itself auditable — but means the audit log has "noise" rows for typos. The separate index on `(action, createdAt)` makes filtering these out cheap if someone needs a clean view.
- **Legal blocklist is a substring match.** Editing a memory to `"manager at a company age verification team"` will be rejected by the substring match on `age`. False positives are possible. V1 accepts this trade; V2 should switch to word-boundary matches.
- **Diff storage is unbounded.** `MemoryAdminAuditLog.changes` is a JSON blob holding the full `{before, after}`. For a memory whose content field is long, this can be ~1KB per edit. 10k edits = 10 MB. Not a problem now; flagged.

**Status.** Shipped on `main` 2026-04-12. The 11 routes are mounted under the admin router (admin gate enforced by the parent `admin.ts` middleware — `AdminMemoryTab` is only reachable at `/product/admin` → Memory tab when `user.role === 'admin'`). End-to-end path verified: admin opens the Memory tab → selects a user → views their profile + memories + interactions → attempts an edit with a legal-blocklist-violating word → gets rejected → successful edit persists + audit row lands → Audit sub-tab shows the change with diff and reason.

---

## 4. Bug fixes & enhancements

Every fix below landed the same day as its underlying phase (2026-04-11) and is live on `main`. Each entry lists the **symptom → root cause → fix → test path**.

### 4.1 Tokens and cost showed as `0` in the activity log

**Symptom.** Admin terminal streamed `llm.call.completed` events with `tokensIn: 0`, `tokensOut: 0`, `costUsd: 0`, even though `ResumeMatchAgent` was clearly running real LLM calls and the run dashboard showed activity.

**Root cause.** `LoggerService.logLLMCall()` keys every cost/token record by `requestId`, and silently **drops** the record when no `RequestContext` exists for that id. Phase 5 coined a brand-new per-call `callRequestId = ${runId}-c${seq}`, but nobody had called `logger.startRequest(callRequestId, ...)` first — so the snapshot read back via `getRequestSnapshot()` was always empty.

**Fix.** `llmMatcher.ts` now calls `logger.startRequest(callRequestId, 'agent.runs.match', 'INTERNAL')` immediately before each `agent.match()`, seeding the per-request context. The snapshot read afterward carries the real `promptTokens`, `completionTokens`, `totalCost`, `lastModel`, `lastProvider`.

**Test path.** Start a match-resumes run with 2–3 resumes, open `/product/admin/agents-terminal`, filter `llm.call.completed` — payloads now carry non-zero `tokensIn/tokensOut/costUsd/model`. Then open the Runs tab in the drawer, confirm `RunSummaryCard` shows the same totals. Non-admin users should see the candidates and status but **not** these fields.

### 4.2 Admin-only gating for tokens / cost / model / provider

**Symptom.** A non-admin recruiter could hit `GET /agents/:id/runs/:runId` and see cost and token counts in the payload — information that is sensitive (competitive, billing) and should only be visible to admins.

**Root cause.** Phase 5 added the six columns to `AgentRun` and the rich payloads to `llm.call.completed`, but the six read endpoints returned the raw objects without filtering.

**Fix.** Added `scrubRunStats` and `scrubActivityRow` helpers at the top of `routes/agents.ts`:

- `SENSITIVE_RUN_FIELDS = ['tokensIn', 'tokensOut', 'costUsd', 'llmCallCount', 'avgLatencyMs']` — dropped from every run row for non-admins. `durationMs` stays visible (it's useful and not sensitive).
- `SENSITIVE_PAYLOAD_FIELDS = ['tokensIn', 'tokensOut', 'costUsd', 'model', 'provider']` — dropped from the `payload` of `llm.call.started`, `llm.call.completed`, and `run.completed` events for non-admins.

Applied to six endpoints: `GET /:id/runs`, `GET /:id/runs/:runId`, `GET /:id/runs/:runId/progress`, `GET /:id/activity`, `GET /:id/activity/stream` (both initial backfill and live SSE), `GET /:id/runs/:runId/activity`. Frontend conditionally hides these rows via `useAuth().user.role === 'admin'`.

**Test path.** Log in as a recruiter, open the drawer, inspect network responses — no token fields. Log in as admin, same endpoints, token fields present. Open `/product/admin/agents-terminal` — only accessible as admin.

### 4.3 Activity log felt slow + missing agent name

**Symptoms.**

1. The Activity tab took several seconds to load because the REST endpoint pulled every column including `errorStack` for rows with stack traces.
2. The Activity tab had no live updates — you had to refresh to see new events.
3. Rows didn't show which agent the event belonged to (only the eventType and message), which was useless when an admin was tailing multiple agents.

**Root causes.**

1. No explicit `select` on the REST `GET /agents/:id/activity` query, so Postgres returned `@db.Text` stack columns in the default projection.
2. No SSE stream for the Activity tab; the one in Phase 2 was scoped to a single run.
3. The SSE event envelope was the raw `PersistedActivityEvent` with no joined `agentName`.

**Fixes.**

1. REST query now has an explicit `select` that excludes `errorStack` (available via a separate `GET /agents/:id/activity/:id` if you need it). Load time drops below 150ms for 100 rows.
2. New endpoint `GET /agents/:id/activity/stream` — per-agent SSE, subscribes via `agentActivityLogger.subscribeToAgent`, sends an initial `meta` event with `{agentId, agentName}` so the client knows what it's tailing. New hook `hooks/useAgentActivityStream.ts` wraps the connection + reconnect logic.
3. The `meta` event carries the agent name once; every row rendered in the timeline references it from local state so the display is consistent even as events stream in.

**Test path.** Open an agent drawer, click Activity — tab loads instantly, SSE connects (`connected` event in the network panel), start a run from the Runs tab, watch events appear live in the Activity tab without a refresh. Confirm the agent's name is visible on every row.

### 4.4 "Running" run card was a single dull line

**Symptom.** While a run was in flight, the Runs tab just showed a spinner + "Running..." with no sense of progress, elapsed time, or what the LLM was doing. Users felt like the system had hung.

**Root cause.** There was no intermediate read model between `AgentRun.status = 'running'` and `completed`. The Phase 5 metric columns are only populated at completion, so querying them mid-run returned zeros.

**Fix.** New endpoint `GET /agents/:id/runs/:runId/progress` returns:

```typescript
{
  run: { id, status, startedAt, completedAt, triggeredBy, ...adminMetrics },
  elapsedMs,
  lastActivity: { eventType, message, severity, createdAt, payload },
  live: { scored, matched, errors, sourceHits, ...adminMetrics }
}
```

The live section is aggregated **on the fly** from `AgentActivityLog` — it counts `match.scored` events, `AgentCandidate` rows, `severity = 'error'` events, `source.*.hit` events, and sums token/cost/latency from `llm.call.completed` payloads. Admin-only fields are gated via `scrubRunStats` + an inline `if (adminOnly)` branch.

New frontend component `LiveRunCard` polls the endpoint every 2 seconds while the run is running, renders a metric grid (scored / matched / errors / source hits / elapsed), an admin-only token + cost line, and the last-activity row with severity color coding.

**Test path.** Start a run, watch `LiveRunCard` tick: elapsed time increments every second (client-side), metrics update every 2s from the poll, the last-activity line changes as new events land.

### 4.5 Phase 2 was scoring candidates with keyword heuristics, not an LLM

**Symptom.** Early Phase 2 dev runs were returning candidates whose "match" felt wrong — obvious mismatches scoring high, obvious matches scoring low.

**Root cause.** The Phase 2 scoring stub was a placeholder that counted keyword hits between the criteria and the resume text — no LLM involved.

**Fix.** Phase 3's `sources/llmMatcher.ts` replaces the stub entirely. Every source adapter (`instant_search`, `internal_minio`, `match_resumes`) now flows through `matchResumesWithLLM`, which runs `ResumeMatchAgent` (the same agent powering the production smart-matching UI) and persists the full `overallMatchScore`, `grade`, `verdict`, `matchedSkills`, `uniqueValueProps`, and `hardRequirementGaps` on each `AgentCandidate`.

**Test path.** Run a match against a pool with clearly-qualified and clearly-unqualified resumes; confirm scores and grades line up. Verify `AgentCandidate.metadata` carries `{grade, verdict, matchedSkills, gaps, uniqueValue}`.

### 4.6 `AgentForm` extraction (deferred)

**Symptom.** The create modal and the Settings tab have ~250 lines of identical form JSX. Editing one and forgetting the other is a guaranteed drift vector.

**Decision.** **Deferred.** Both surfaces currently ship the same form by literal duplication. A clean `AgentForm` component extraction is straightforward when someone has time; it was consciously not done during the sprint to avoid thrashing two surfaces simultaneously while Phases 3–5 were still landing. Flagged in §10 as an open follow-up.

### 4.7 Phase 6 hardens the keyword/LLM matcher into a learning system (2026-04-12)

**Symptom.** Phases 3–5 replaced the keyword stub with `ResumeMatchAgent`, but the scoring prompt was identical on every run of an agent. "Run Again" and "Find More" re-scored the same pool against the same fixed JD + criteria payload. Triage Likes and Dislikes were recorded but never fed back. Recruiters complained the agent "isn't learning".

**Root cause.** `buildAugmentedJd()` in `llmMatcher.ts` only knew about (a) the JD text, (b) the structured `AgentCriterion[]` bag, and (c) the optional `instructions` string. There was no code path by which triage history could modify the next call's prompt.

**Before.** One call produced one prompt of the form:

```
<jd text with criteria woven in>
## Mandatory requirements (DEALBREAKERS)
...
## Highly weighted preferences
...
## Recruiter instructions
...
```

No exemplars, no taste signal, no memory across runs.

**After.** `buildAugmentedJd()` now takes two extra arguments — `icp: IdealCandidateProfile | null` and `anchors: AnchorDigest[]` — and appends:

```
## Recruiter's Ideal Candidate Profile
Core skills: Go (critical), Distributed systems (high), Kafka (medium)
Bonus skills: Kubernetes
AVOID: React Native, frequent job-hopping
Years of full-time experience: 3-8 (ideal 5)
Preferred locations: Beijing
Soft signals to look for:
  - owns on-call rotations
  - ships fast / clear ownership
Soft signals to penalize:
  - frequent job-hopping (>3 employers in 5 years)

## Anchor candidates (use as ground truth)
POSITIVE EXEMPLARS — score this resume HIGHER if it resembles these:
  1. Wang Tao — Senior Backend Engineer @ ByteDance
  2. Li Mei — Staff Engineer @ Meituan
NEGATIVE EXEMPLARS — score this resume LOWER if it resembles these:
  1. Zhang Wei — Frontend dev, 3 role switches in 5 years
```

The 450-line scoring system prompt in `ResumeMatchAgent` is **unchanged**. Agents without an ICP (brand-new, or ones where the user hasn't triaged yet) get exactly the Phase 3–5 behavior verbatim. The new sections are added only when an ICP exists, so the change is backward-compatible.

**Test path.** Run a match against the same pool twice: once before creating an ICP, once after regenerating an ICP from 3+ likes/dislikes. The scoring output on run 2 should visibly pull toward the anchor candidates (grade/verdict/score deltas on the same resumes), and the activity log should show `icp.loaded` → `hard_requirements.applied` → `match.scored` for every candidate that cleared the filter.

### 4.8 `LiveRunCard` stuck on "运行中 0ms" after completion

**Symptom.** A run would complete cleanly on the backend (`AgentRun.status = 'completed'`, activity log showed `run.completed`, candidates persisted), but the in-drawer `LiveRunCard` stayed pinned on "运行中 · 0ms" indefinitely. Refreshing the drawer fixed it. Flagged in §10 of the first-pass changelog as "in progress".

**Root cause.** Two compounding issues. First, `LiveRunCard` was polling `/runs/:runId/progress` but did not notify the parent drawer when the run transitioned from `running` to `completed` / `failed` / `cancelled` — so the parent's Runs tab never swapped the card out for a `RunSummaryCard`. Second, when a run was very fast or failed before any activity landed, the live-aggregated metric grid was constructed from nullable branches (`lastActivity?`, `live?.scored || 0`) and the card rendered as an empty shell because one of the pieces was undefined.

**Fix.** Two-part.

1. `LiveRunCard` now watches `progress.run.status` on every poll tick. When the status transitions out of `running`, it calls a new `onTransitioned(runId, finalStatus)` prop, which the parent `Runs` tab uses to refetch the run list and swap the card for a `RunSummaryCard` in place. The card also clears its local polling interval on transition, so a stale pointer doesn't continue hitting the endpoint after completion.
2. The metric grid always renders with zero defaults (`scored: 0, matched: 0, errors: 0, sourceHits: 0`) regardless of whether any `AgentActivityLog` rows have landed yet. A "waiting for first activity" placeholder text renders when `lastActivity == null`. This eliminates the 0ms empty shell.

**Test path.** Start a `match_resumes` run against a 1-resume pool (fast path, completes in <3s). Observe `LiveRunCard` render the 0-default grid for the ~500ms before the first activity, then transition to `RunSummaryCard` within one poll tick of completion. Also verify a failing run (invalid job id) cleanly transitions to a red `RunSummaryCard` showing the error.

### 4.9 "Find more" / "Run again" + LLM criteria suggestions

**Symptom / product ask.** Phase 2b landed profile-by-profile triage but didn't do anything with the rejections. Recruiters asked: "if I just rejected 8 candidates in a row, the agent obviously misread the brief — surface the criteria changes it should make." The 2026-04-11 prompt log carries this verbatim ("RoboHire agent can make some suggestions in the criteria and requirements").

**Fix.** Two-part.

1. **Skip-list foundation for re-runs.** `llmMatcher.ts` was already pre-filtering resumes where an `AgentCandidate` exists for this agent (so re-runs don't re-score the same pool). This was extended into `AgentRunService.executeRun()` itself — all three source branches (`instant_search`, `internal_minio`, `match_resumes`) now call a new helper `alreadyEvaluatedResumeIds(agentId)` (in `services/AgentRunService.ts`) which returns a `Set<string>` of resume ids that have been scored for this agent across any prior run. The pool fetch filters these out before the LLM ever sees them.
2. **"Find more / Run again" button on `RunSummaryCard`.** Renders when a run is completed and the pool still has unevaluated candidates (queried via a lightweight count endpoint). Clicking it fires `POST /agents/:id/runs` identically to a fresh run — the skip-list foundation above handles the "don't re-score" guarantee.
3. **Criteria suggestions modal.** New endpoint `POST /agents/:id/runs/:runId/criteria-suggestions` reads the run's `AgentCandidate` rows with `status IN ('liked', 'disliked')` plus their `reason` / matched-skills metadata, calls an LLM at temperature 0.3 asking it to propose three to five criteria edits that would surface more of the liked pattern and fewer of the disliked pattern, and returns a `{suggestions: [{text, bucket: 'most'|'least', pinned: bool, rationale}]}` payload. Frontend `CriteriaSuggestionsModal` (inside `AgentRunDrawer.tsx`) renders the suggestions with accept / reject chips per suggestion; accepted suggestions are appended to `Agent.config.criteria` via the existing `PATCH /agents/:id` endpoint, so run history stays reproducible.

**Test path.** Start a run on a mixed pool, Like 3 candidates and Dislike 5 in the Review Profiles view, open `RunSummaryCard` → "Suggest criteria edits" → accept 2 suggestions → click "Find more" → next run scores only previously-unseen resumes under the updated criteria.

### 4.10 `AgentRunDrawer.handleRunNow` posted to a nonexistent endpoint

**Symptom.** The Phase 6 dry-run preview (amber "STRICT FILTER" banner that shows "this rule excludes 397/420 candidates") was broken from the drawer's "Run Now" button. Clicking it produced a 404 in the network tab and a silent failure in the UI — no amber banner ever rendered.

**Root cause.** `AgentRunDrawer.handleRunNow` was POSTing to `/api/v1/agents/:id/ideal-profile/preview-filter` — an endpoint that does not exist. The correct route is `POST /api/v1/agents/:id/hard-requirements/dry-run`, and the request/response shapes are different: the preview endpoint was expected to take `{hardRequirements}` and return `{poolSize, passed, rejected}`, whereas the real dry-run endpoint takes `{rules}` and returns `{passed, rejected, rejectionsByRule, sampleRejected}`. Caught by the test agent during the Phase 6 sweep.

**Fix.** `handleRunNow` now posts to `/hard-requirements/dry-run` with `{rules: agent.config.hardRequirements}` and maps the response shape to the fields `HardRequirementsWarning` consumes (`poolSize = passed + rejected`, `rejectionReasons = topRejectionReasons(rejectionsByRule)`). The mapper is a small helper inline in the drawer.

**Test path.** Open a Phase 6 agent with a hard requirement that would reject most of the pool (e.g. `experienceYears gte 15`). Click "Run Now" — amber warning banner now renders with the correct `remaining / poolSize` fraction. Clicking "Continue anyway" proceeds to `POST /runs` as before.

---

## 5. Data model reference

Full schema at `backend/prisma/schema.prisma`. One-line summaries of every model touched or added by this sprint:

| Model | Purpose |
|---|---|
| `Agent` | Persistent named config: task, source modes, schedule, criteria (on `.config`), owned by a user, scoped to one `Job`. |
| `AgentRun` | One execution of an Agent. Status machine + funnel `stats` JSON + Phase 5 metric columns (tokens, cost, latency). |
| `AgentCandidate` | A single sourced/scored candidate for a run. Linked back to `Resume` when the source produced one, or stands alone for external hits. |
| `AgentActivityLog` | The single durable audit log for every event across every agent. Written by everyone, read by the terminal + tabs. |
| `AgentCriteriaPreset` | Reusable structured-criteria preset owned by a user, with `private | shared` scope. Copied into an agent at create-time — not referenced. |
| `Invitation` | Candidate interview invitation row. `@unique interviewId` for the Interview back-link when the candidate completes. Model exists; action UI pending Phase 6. |
| `Outreach` | Unified email / OpenClaw / SMS / LinkedIn outreach thread with `thread` JSON for conversation history. Model exists; action UI pending Phase 7/8. |
| `ExternalSourceConfig` | Admin-managed third-party sourcing vendor credentials (LinkedIn, GitHub, SeekOut, custom). Encrypted-at-rest credentials. |
| `SourceConfig` | Per-workspace feature-flag-style toggles for the three source modes. `null workspaceId` = global default. |
| `Interview` (modified) | Added `invitationId @unique` for the Invitation → Interview back-link. |
| `AgentIdealProfile` (Phase 6) | Versioned LLM-inferred recruiter taste profile per agent. `@@unique([agentId, version])` enforces monotonic versioning; soft-revert copies forward instead of rewinding. Holds `profile` JSON, `suggestedHardRequirements`, `confidence`, and per-version token/cost totals. |
| `UserRecruiterProfile` (Phase 7a) | **New.** One row per user. Rolled-up aggregate of taste across all their agents (`topSkills`, `topAntiSkills`, `topLocations`, `topIndustries`, `topCompanySizes`, `recurringHardReqs`). Rebuilt (not incrementally updated) whenever any owning `AgentIdealProfile` row changes, throttled to once per 60s per user. Feeds `IdealProfileService.seedFromUserProfile()` at agent-create time. |
| `CandidateInteraction` (Phase 7b) | **New.** Append-only implicit-signal log. `eventType` ∈ `viewed | expanded | dwell | contact_copied | link_clicked | scroll_deep`, optional `durationMs` + `metadata`. 90-day retention target; cleanup job deferred. Feeds the (deferred) synthesis worker. |
| `MemoryEntry` (Phase 7c) | **New.** The semantic memory primitive. `scope` ∈ `user | team | workspace | job`, `kind` ∈ `preference | rejection_pattern | hard_req_suggest | anchor | company_wide | synthesized_fact`, `content` + JSON `embedding` + `weight` + `baselineWeight` + `reinforceCount` + `lastSeenAt` + `expiresAt?`. Walked by `ContextRetrievalService` via cosine similarity × decay × scope-boost. Synthesis writer + `IdealProfileService` reader deferred. |
| `MemoryAdminAuditLog` (Phase 7.5) | **New.** Durable immutable audit trail for every admin memory operation. `adminId`, `targetType`, `targetId`, `action` (11 values), `reason?`, `changes?` JSON diff, `ipAddress?`, `createdAt`. Written BEFORE the data read/write by `AdminMemoryService` so attempted access is captured even on failure. Audit-of-audit (viewing the log itself) is recorded under a separate `view_audit` action to prevent self-reference loops. |
| `Agent` (modified, Phase 7a) | Added `agentInheritsFromProfile Boolean @default(true)` — per-agent opt-out from warm-start seeding at create time. |
| `AgentAlexSession` | Unrelated to the workbench — just noted here because it lives in the same schema and gets imported by Agent Alex docs. |

---

## 6. API surface reference

All routes are under `/api/v1` and enforce the standard auth middleware unless noted. Admin-only routes additionally check `user.role === 'admin'` at the route layer.

### 6.1 Agent CRUD (`routes/agents.ts`)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/agents/jobs-available` | Jobs the caller may scope an agent to. Admin sees all. |
| `GET` | `/agents` | List agents (filters: `status`, `taskType`, date range, `filterUserId`, `teamView`). |
| `GET` | `/agents/:id` | Single agent. |
| `POST` | `/agents` | Create agent. Validates `jobId` vs caller scope. Calls `agentScheduler.register(agent)` if scheduled. |
| `PATCH` | `/agents/:id` | Update agent. Re-registers scheduler. |
| `DELETE` | `/agents/:id` | Delete agent. Unregisters scheduler. |
| `GET` | `/agents/:id/stats` | Funnel stats (sourced → matched → liked → invited → hired). |

### 6.2 Runs

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/agents/:id/runs` | Start a run. Returns `{runId}`. Execution is fire-and-forget via `setImmediate`. |
| `GET` | `/agents/:id/runs` | List runs. Stats are admin-scrubbed for non-admin. |
| `GET` | `/agents/:id/runs/:runId` | Single run detail. |
| `GET` | `/agents/:id/runs/:runId/stream` | SSE stream of candidates + activity for the run. |
| `POST` | `/agents/:id/runs/:runId/cancel` | Cancel a running run (in-memory AbortController). |
| `GET` | `/agents/:id/runs/:runId/progress` | Live progress read model for in-flight runs (§4.4). |
| `GET` | `/agents/:id/runs/:runId/summary` | Structured run summary (top candidates, skills, gaps, duration). |

### 6.3 Activity

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/agents/:id/activity` | Paginated activity timeline. Excludes `errorStack` for speed. |
| `GET` | `/agents/:id/activity/stream` | Per-agent SSE. Initial `meta` event carries `agentName`. |
| `GET` | `/agents/:id/runs/:runId/activity` | Activity scoped to one run. |

### 6.4 Candidates

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/agents/:id/candidates` | List candidates with filters (`status`, `runId`). |
| `PATCH` | `/agents/:id/candidates/:candidateId` | Triage: `liked | disliked | archived | invited | contacted | ...`. |

### 6.5 Criteria presets (`routes/agentCriteriaPresets.ts`)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/agents/criteria-presets?scope=private|shared|all&q=` | List visible presets (union of own private + workspace-shared). |
| `POST` | `/agents/criteria-presets` | Create preset `{name, criteria, scope?}`. |
| `DELETE` | `/agents/criteria-presets/:id` | Delete (owner or admin only). |

### 6.6 Admin agent sources (`routes/adminAgentSources.ts`)

| Method | Path | Purpose |
|---|---|---|
| `GET` / `PATCH` | `/admin/agent-sources/config` | Workspace `SourceConfig` toggle state. |
| `GET` / `POST` / `PATCH` / `DELETE` | `/admin/agent-sources/external` | CRUD `ExternalSourceConfig` entries. Credentials encrypted on write. |

### 6.7 Admin terminal (`routes/adminAgentsTerminal.ts`)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/admin/agents-terminal/history?limit=200` | One-shot backfill of most-recent events (joined agent name). |
| `GET` | `/admin/agents-terminal/stream` | SSE firehose. Subscribes via `AgentActivityLogger.subscribeToAll`. Heartbeat every 25s. |
| `GET` | `/admin/agents-terminal/runs?limit=50` | Recent `AgentRun`s with cost/token/latency for the sidebar. |

### 6.8 Smart agent endpoints — ICP + Hard Requirements (`routes/agents.ts`, Phase 6)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/agents/:id/ideal-profile` | Latest `AgentIdealProfile` for the agent, or `404 ICP_NOT_FOUND`. |
| `GET` | `/agents/:id/ideal-profile/history` | All versions newest-first (default 20, max 50). |
| `POST` | `/agents/:id/ideal-profile/regenerate` | Blocking LLM call via `IdealCandidateProfileAgent`; writes a new version row. 5–15s latency. |
| `POST` | `/agents/:id/ideal-profile/revert` | Soft revert — copies version N forward as `max + 1`. |
| `POST` | `/agents/:id/ideal-profile/promote-suggestion` | Copies a `suggestedHardRequirements[i]` entry into `Agent.config.hardRequirements`. |
| `PATCH` | `/agents/:id/hard-requirements` | Full-replace of `Agent.config.hardRequirements`. Validates field × operator × value type matrix; enforces legal blocklist; max 20 rules. |
| `POST` | `/agents/:id/hard-requirements/dry-run` | Pure Prisma + JS preview: `{passed, rejected, rejectionsByRule, sampleRejected}` for a proposed rule set. No LLM, no persistence. |
| `POST` | `/agents/:id/runs/:runId/criteria-suggestions` | LLM-proposed criteria edits inferred from the run's Liked + Disliked candidates. Returns `{suggestions: [{text, bucket, pinned, rationale}]}`. Read-only — accepting suggestions is an explicit `PATCH /agents/:id` with the merged criteria bag. |

### 6.9 User recruiter profile (`routes/userRecruiterProfile.ts`, Phase 7a)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/user-recruiter-profile` | Current user's rolled-up taste profile, or `null` if not yet rebuilt. |
| `POST` | `/user-recruiter-profile/rebuild` | Force rebuild now (server-side debounced to once per 60s per user). |
| `DELETE` | `/user-recruiter-profile` | Reset — user goes back to cold-start for any agent created after this. Existing agents keep their own ICP history. |

### 6.10 Candidate interactions (`routes/candidateInteractions.ts`, Phase 7b)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/candidate-interactions` | Batch ingest: `{events: [{eventType, candidateId, agentId?, runId?, resumeId?, durationMs?, metadata?}]}`. Writes all rows in a single `createMany`. `userId` is server-stamped from the session. |

### 6.11 Admin memory manager (`routes/adminMemory.ts`, Phase 7.5)

All routes admin-gated via `routes/admin.ts`. Every request is audited to `MemoryAdminAuditLog` BEFORE the response.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/admin/memory/users` | List users with memory data (paginated). Action: `view_profile`. |
| `GET` | `/admin/memory/users/:userId/profile` | Target user's rolled-up `UserRecruiterProfile`. Action: `view_profile`. |
| `GET` | `/admin/memory/users/:userId/memories` | Target user's `MemoryEntry` rows. Action: `view_memories`. |
| `GET` | `/admin/memory/users/:userId/interactions` | Target user's `CandidateInteraction` rows. Action: `view_interactions`. |
| `GET` | `/admin/memory/memory/:id` | Single memory row + history. Action: `view_memories`. |
| `PATCH` | `/admin/memory/memory/:id` | Edit content / weight / `expiresAt`. Runs legal-content blocklist; rejects on match. Action: `edit_memory` + `changes: {before, after}` diff. |
| `DELETE` | `/admin/memory/memory/:id` | Delete a single memory row. Action: `delete_memory`. |
| `POST` | `/admin/memory/memory/:id/pin` | Set `expiresAt = null`. Action: `pin_memory`. |
| `POST` | `/admin/memory/memory/:id/unpin` | Restore decay. Action: `unpin_memory`. |
| `POST` | `/admin/memory/users/:userId/profile/rebuild` | Force rebuild for target user. Action: `rebuild_profile`. |
| `DELETE` | `/admin/memory/users/:userId/profile` | Reset target user's profile to cold-start. Action: `reset_profile`. |
| `GET` | `/admin/memory/audit` | Read the audit log itself. Action: `view_audit`. |

---

## 7. Activity event taxonomy

Every event that lands in `AgentActivityLog.eventType`. Extensible — new capabilities may add values as long as they're documented here.

### Run lifecycle

| Event | When |
|---|---|
| `run.queued` | `AgentRun` row created, before async execution starts. Payload carries `triggeredBy`. Catchup runs carry `{catchup: true, missedBy: <s>}`. |
| `run.started` | Execution entered; `status → running` and `startedAt` set. |
| `run.completed` | All sources exhausted; `status → completed`; metric columns populated. Payload includes `stats` + admin metric totals. |
| `run.failed` | Uncaught exception; `status → failed`; `error` + `errorStack` persisted. |
| `run.cancelled` | User cancelled mid-run via `POST /cancel`; `status → cancelled`. |

### Sourcing

| Event | When |
|---|---|
| `source.instant_search.hit` | Owner's private resume pool queried. Payload: `{poolSize, scope: 'owner'}`. Also used by `match_resumes` with `explicit: true` marker. |
| `source.internal_minio.hit` | Shared S3/MinIO archive queried. Payload: `{poolSize, scope: 'shared'}`. |
| `source.external_api.hit` | Per-configured vendor. Payload: `{provider, configId, count}`. Severity `warn` when no enabled sources exist. |

### LLM calls (Phase 5)

| Event | When |
|---|---|
| `llm.call.started` | Immediately before dispatching a `ResumeMatchAgent.match()` call. Severity `debug`. Payload: `{sequence, resumeId, callRequestId}`. |
| `llm.call.completed` | On successful response. Severity `info`. Payload: `{sequence, resumeId, callRequestId, tokensIn, tokensOut, costUsd, latencyMs, model, provider}`. |
| `llm.call.failed` | On exception. Severity `error`. Payload: `{sequence, latencyMs, callRequestId}` + `errorStack`. |

### Scoring

| Event | When |
|---|---|
| `match.scored` | A candidate cleared the threshold and an `AgentCandidate` row was written. Payload: `{score, grade, verdict, resumeId}`. |
| `match.rejected_below_threshold` | Candidate was scored but fell below `DEFAULT_THRESHOLD = 60`. Severity `debug`. |

### Triage

| Event | When |
|---|---|
| `candidate.liked` | Recruiter approved a candidate. Written from the `PATCH /candidates/:id` endpoint. |
| `candidate.disliked` | Recruiter rejected a candidate. Same path. |
| `candidate.archived` | Soft delete. |

### Errors

| Event | When |
|---|---|
| `error.llm` | LLM call rejected in `Promise.allSettled` aggregation. |
| `error.http` | External source HTTP request failed. Payload carries the vendor name. |
| `error.validation` | Scheduler dispatch threw (bad cron, missing agent, etc.). |
| `error.auth` | Credential decryption failed for an external source. |

### ICP + hard requirements (Phase 6)

| Event | Severity | When |
|---|---|---|
| `icp.regeneration.started` | `info` | Before the LLM call in `IdealProfileService.generateForAgent()`. |
| `icp.regenerated` | `info` | After successful persistence of the new version. Payload: `{version, confidence, generatedFromLikes, generatedFromDislikes, tokensIn, tokensOut, costUsd}`. |
| `icp.regeneration.failed` | `error` | LLM call or validation failure. Prior version stays active. |
| `icp.loaded` | `info` | Once per run when `loadCurrent()` returns a profile. Payload: `{icpVersion, confidence, coreSkillCount, anchorCount}`. |
| `icp.skipped` | `debug` | Once per run when no ICP exists — scoring proceeds with JD + criteria only. |
| `icp.reverted` | `info` | Soft-revert action. Payload: `{fromVersion, toVersion}`. |
| `icp.seeded_from_profile` | `info` | **Phase 7a.** Once per agent create when `seedFromUserProfile` wrote a synthetic v1 ICP from the user's rolled-up `UserRecruiterProfile`. Payload: `{topSkillsCount, topAntiSkillsCount}`. |
| `hard_requirements.updated` | `info` | `PATCH /hard-requirements` succeeded. Payload carries the promoted rule id or a diff. |
| `hard_requirements.applied` | `info` | Once per source branch. Payload: `{poolSize, passed, rejected, ruleCount, topRejectionReasons}`. |
| `match.filtered_by_hard_requirement` | `debug` | Per rejected candidate, capped at 20 per branch to avoid log spam. Payload: `{resumeId, ruleId, reason}`. Renders in the admin terminal only. |

### Memory layer (Phase 7c+, reserved)

The memory synthesis + retrieval layer will emit these events once the synthesis worker ships. The event types are reserved but **not yet wired** — no code path currently emits them because `ContextRetrievalService.retrieveForRegen` is not yet called from any production caller (see §3.12, deferred pieces).

| Event | Severity | When |
|---|---|---|
| `memory.retrieved` | `info` | After `retrieveForRegen` returns during an ICP regen. Payload: `{k, scopesWalked, topScore, contentIds}`. Will fire once per regen. |
| `memory.reinforced` | `debug` | After the synthesis worker confirms a retrieved memory was "used" by the regen and bumps `reinforceCount`. |
| `memory.synthesized` | `info` | After the synthesis worker persists a new `MemoryEntry`. Payload: `{memoryId, kind, scope, sourceEventCount}`. |
| `memory.synthesis.rejected` | `warn` | Synthesized content hit the legal-field blocklist and was dropped pre-persist. |

### Future (model exists, events wired in Phases 8+)

`invite.sent`, `invite.opened`, `invite.accepted`, `invite.expired`, `interview.linked`, `email.draft_created`, `email.sent`, `email.delivered`, `email.bounced`, `email.replied`, `im.sent`, `im.delivered`, `im.read`, `im.replied`, `im.failed`.

---

## 8. Frontend component map

| File | Role | Key imports |
|---|---|---|
| `pages/product/Agents.tsx` | Workbench landing; list of agent cards; hosts `AgentRunDrawer`. | `AgentRunDrawer`, `CreateAgentModal`, `useAuth`. |
| `components/AgentRunDrawer.tsx` | 4-tab drawer: Results / Runs / Activity / Settings. Hosts `LiveRunCard`, `RunSummaryCard`, `SettingsTab`, `ActivityTab`, `ResultsTab`, `ReviewProfilesView`. | `useAgentRunStream`, `useAgentActivityStream`, `AgentCriteriaModal`, `AutoGrowTextarea`. |
| `components/ReviewProfilesView.tsx` | Profile-by-profile calibration view with keyboard shortcuts. | `AgentCriteriaModal`, `useAgentRunStream` types. |
| `components/AgentCriteriaModal.tsx` | Tactile pin/drag criteria editor; pinned = dealbreaker; MOST/LEAST IMPORTANT buckets. | Native HTML5 DnD; no third-party dep. |
| `components/AutoGrowTextarea.tsx` | Shared auto-grow + user-resizable textarea (`max-h: 40vh`, `resize-y`). | — |
| `components/CreateAgentModal.tsx` | "Hire an Agent" modal with source selector + schedule field. **Form JSX duplicated with Settings tab** (see §10). | `AutoGrowTextarea`, job picker hook. |
| `pages/AdminAgentSourcesTab.tsx` | Admin-only: workspace SourceConfig toggles + `ExternalSourceConfig` CRUD. | axios; admin guard via `useAuth`. |
| `pages/AdminAgentsTerminal.tsx` | Admin-only monospace terminal. Virtualized event list, filters, pause/resume, export JSONL. Route `/product/admin/agents-terminal`. | Native `EventSource`, `useAuth`. |
| `hooks/useAgentRunStream.ts` | Per-run SSE: candidates + activity accumulated into state. | — |
| `hooks/useAgentActivityStream.ts` | Per-agent SSE with `meta` event carrying agent name. | — |
| `components/IdealProfileCard.tsx` | **Phase 6.** Persistent ICP review card shown in the Settings tab. Renders narrative summary, 4-bucket confidence bar, core/bonus/anti skill chips, anchor count, version pill, and the "Regenerate" button. | `useIdealProfile`, enterprise SaaS dark AI-summary box styling. |
| `components/HardRequirementsEditor.tsx` | **Phase 6.** Reusable amber "STRICT FILTER" editor. Field picker + type-aware operator picker + value input (number / tag list / degree enum / regex). Quick-add preset chips + inline validation per rule. | Enforces client-side legal blocklist mirroring `hardRequirementsFilter.LEGAL_BLOCKLIST`. |
| `components/RegenerateProfileModal.tsx` | **Phase 6.** Modal shown during the 5–15s regen LLM call. Progress phases + indeterminate fallback + Cancel button that aborts and restores prior version. | `useIdealProfile.regenerate`. |
| `components/HardRequirementsWarning.tsx` | **Phase 6.** Pre-run / pre-save dry-run banner ("This rule excludes 397 of 420 candidates · continue?"). Amber for remaining > 5%, rose for < 5%. | `POST /hard-requirements/dry-run`. |
| `components/CriteriaSuggestionsModal` (inside `AgentRunDrawer.tsx`) | **Phase 6.** LLM-proposed criteria edits after a run with Likes + Dislikes. Accept / reject per suggestion; accepted ones are merged into `Agent.config.criteria` via `PATCH /agents/:id`. | `POST /agents/:id/runs/:runId/criteria-suggestions`. |
| `hooks/useIdealProfile.ts` | **Phase 6.** Thin data hook. `useIdealProfile(agentId)` returns `{profile, loading, error, regenerate, revert, history}` backed by the seven Phase 6 endpoints. | — |
| `hooks/useCandidateInteractionTracker.ts` | **Phase 7b.** Buffered implicit-signal tracker. `track(event)` buffers locally; flushes every 5s or at 50 events, whichever first; `sendBeacon` on `beforeunload`. Currently wired into `ReviewProfilesView` only. | `POST /candidate-interactions`. |
| `pages/AdminMemoryTab.tsx` | **Phase 7.5.** Admin-only Memory tab in Admin Dashboard. Split-pane: user list + per-user detail with Profile / Memories / Interactions / Audit sub-tabs. Edit / delete / pin / reset all prompt for an optional reason that persists to `MemoryAdminAuditLog.reason`. | 11 routes under `/api/v1/admin/memory/*`. |

---

## 9. Internationalization

RoboHire ships 8 locales: `en`, `zh`, `zh-TW`, `ja`, `es`, `fr`, `pt`, `de`. Every user-facing string added by this sprint has a key in **all eight** `frontend/src/i18n/locales/{lang}/translation.json` files — no English-only fallbacks. Key namespaces:

| Namespace | Scope |
|---|---|
| `agents.workbench.*` | Agents page, create modal, drawer tabs, Review Profiles, Criteria modal, triage actions, settings tab. |
| `admin.agentSources.*` | Admin Agent Sources tab (SourceConfig toggles + ExternalSourceConfig CRUD). |
| `admin.agentsTerminal.*` | Admin Agents Terminal page (filter labels, status bar, keyboard hints, controls). |

Translation injection follows the project convention — surgical brace-matching scripts preserve JSON formatting so diff noise stays minimal.

---

## 10. Known limitations & open follow-ups

Honest accounting of what is **not** done. Each row is a known ship with a known scope for the next sprint.

| # | Limitation | Impact | Status |
|---|---|---|---|
| 1 | `AgentForm` component extraction | CreateAgentModal and SettingsTab share ~250 lines of form JSX by literal duplication. Drift risk when adding new fields. | Deferred. Clean refactor available. |
| 2 | Email outreach | Model (`Outreach`) exists, action UI does not. No `OutreachEmailAgent`, no template library in DB, no composer modal. | Phase 7. |
| 3 | Interview invitation persistence | `Invitation` model and the Interview back-link exist, but the "Invite to Interview" button and the `POST /candidates/:id/invite` wrapper route are not built. Current invites still go through the legacy Talent Hub endpoint. | Phase 6. |
| 4 | OpenClaw integration | `Outreach.channel='openclaw'` is a valid enum but there is no `OpenClawClient`, no `OpenClawIngestService`, and the four `/openclaw/*` ingest routes are stubs. HMAC secret env vars exist but are unused. | Phase 8. Filename blocker logged in spec. |
| 5 | Funnel analytics dashboard | `GET /agents/:id/stats` exists and returns counts, but there is no cross-agent recruiter dashboard that visualizes sourced → matched → liked → invited → interviewed → hired as a funnel. | Phase 9. |
| 6 | Per-run budget caps | `AgentRun.costUsd` is tracked in real time, but no hard cap is enforced. A runaway agent could spend indefinitely. Admin terminal is the only line of defense today. | v1.1. |
| 7 | "Find more" + criteria suggestions | The prompts log includes a 2026-04-11 request for a "find more" button plus LLM-generated criteria refinements when the recruiter has rejected lots of candidates. **Currently being built in parallel** as of this document's writing. Skip-list foundation is in place (`llmMatcher` pre-filters already-matched `resumeId`s). | **In progress.** |
| 8 | `LiveRunCard` can go stale on "running" | If polling misses the completion signal (e.g. a network blip on the last tick), the card can stay stuck on "Running" until a refresh. **Currently being fixed in parallel** — the fix will fall back to `GET /runs/:runId` when the progress endpoint reports `status=running` but `elapsedMs > some threshold` without any new activity. | **In progress.** |
| 9 | Run summary LLM narrative | `GET /runs/:runId/summary` currently returns structured data only (top candidates, aggregated skills/gaps, duration). A narrative summary ("This run sourced 42 resumes; 7 cleared threshold; the common gap was senior leadership experience…") would close the UX loop. | v1.1. |
| 10 | Scheduler horizontal scale | node-cron is single-process; the DB-lock guard makes multi-instance safe in theory but has never been exercised. A BullMQ + Redis upgrade path is sketched in the spec. | v2. |
| 11 | MinIO adapter is not yet the real MinIO | `runMinIOSearch` currently queries `Resume.originalFileProvider='s3'` as a proxy — a true bucket scan with `LastModified > lastRunAt` incremental cursor is the real adapter shape. Works for dev but won't scale. | Phase 3.1. |
| 12 | Activity log retention | `AgentActivityLog` grows unbounded. Indexes are partition-friendly but no retention job exists. | v1.1 (`activities > 90 days → archive`). |
| 13 | **Phase 7c — Memory synthesis worker** | The `MemorySynthesisWorker` that would process `CandidateInteraction` + `AgentCandidate` triage rows into `MemoryEntry` facts every 15 minutes is not built. Until it ships, `MemoryEntry` is empty in production. | Phase 7c remainder. |
| 14 | **Phase 7c — Embedding adapter** | `embedText(s: string): Promise<number[]>` is not yet built. Design calls for OpenAI `text-embedding-3-small` routed through `LLMService`. Without this, nothing can write embeddings to `MemoryEntry`. | Phase 7c remainder. |
| 15 | **Phase 7c — Retrieval not yet wired into `IdealProfileService.generateForAgent`** | `ContextRetrievalService.retrieveForRegen` and `formatForPrompt` exist and are callable, but the "Prior learnings" block is not yet appended to the ICP regen prompt. Integration is mechanical once synthesis + embeddings ship. | Phase 7c remainder. |
| 16 | **Phase 7 — pgvector migration deferred** | `MemoryEntry.embedding` is a JSON-serialized `number[]` and cosine similarity runs in JS. Path to `vector(1536)` via raw SQL migration is documented but not applied until synthesis starts writing enough rows to matter. | Phase 7.5. |
| 17 | **Phase 7 — Team + workspace scope UI** | `ContextRetrievalService` supports `scope='team'` and `scope='workspace'` queries, but `Team.memorySharingEnabled` + `memorySharingMembers` opt-in UX is not built. All retrieval currently falls back to user-scope only. | Phase 7.5. |
| 18 | **Phase 7a — User recruiter profile settings page** | `UserRecruiterProfile` is built, rebuilt, and queryable via `/api/v1/user-recruiter-profile`, but there is no user-facing profile settings screen where a recruiter can see their rolled-up taste or hit "reset". Admin can see it via the Memory tab; the user cannot. | Phase 7.5. |
| 19 | **Phase 6 — Auto-regen trigger not wired** | `agent.config.icpSettings.autoRegenAfterTriageActions` exists in the types + schema but the triage endpoint does not increment a counter or enqueue a regen. Kenny deferred wiring until the threshold is tuned against real usage data. | Post-v1. |
| 20 | **Phase 7b — `useCandidateInteractionTracker` only wired into `ReviewProfilesView`** | Other candidate surfaces (flat Results list, Talent Hub candidate detail, Smart Matching) do not yet emit implicit signals. The hook is importable; the call-site wiring is pending. | Phase 7b extension. |
| 21 | **Phase 7.5 — "Who saw my memories" user-facing screen** | `MemoryAdminAuditLog` indexes on `(targetType, targetId, createdAt)` for exactly this query, but no user-facing page reads it. Admin can see the audit log; the user cannot see when an admin viewed their memory. | Phase 7.5 extension. |
| 22 | **Phase 7.5 — No rate limiting, bulk delete, or export on Admin Memory Manager** | V1 ships without throttling admin memory routes, without bulk delete / export actions, and with `reason` as optional (not mandatory on destructive actions). Acceptable for a small admin roster; flagged for v1.1. | v1.1. |
| 23 | **Phase 7 — `Agent.agentInheritsFromProfile` UI toggle** | Field exists, backend honors it, but the Settings tab does not expose it. Per-agent opt-out is API-only. | Phase 7a extension. |

---

## 11. Operational runbook

Practical debugging for the morning-of on-call person.

### 11.1 Manually trigger a stuck or scheduled agent

Two equivalent paths:

- **Via API (preferred):**
  ```bash
  curl -X POST https://api.robohire.io/api/v1/agents/<agentId>/runs \
    -H "Cookie: session_token=<your_admin_session>"
  ```
- **Via a backend REPL attached to the running process:**
  ```javascript
  await agentScheduler.triggerNow('<agentId>')
  ```
  This invokes the same `fire()` path the cron tick uses — including the 30-second DB-lock guard — so it's safe to call even if a scheduled fire is imminent.

### 11.2 Inspect a stuck run

A run is "stuck" when `AgentRun.status = 'running'` but no new activity has landed in several minutes. Two queries:

```sql
-- All currently-running runs, sorted by how long they've been running
SELECT id, "agentId", "startedAt", NOW() - "startedAt" AS elapsed
FROM "AgentRun"
WHERE status = 'running'
ORDER BY "startedAt";

-- Last activity for a specific stuck run
SELECT "createdAt", "eventType", severity, message
FROM "AgentActivityLog"
WHERE "runId" = '<runId>'
ORDER BY "createdAt" DESC
LIMIT 20;
```

If the run genuinely died (process crash mid-run), either cancel it via `POST /agents/:id/runs/:runId/cancel` (which flips to `cancelled`) or directly update the row: `UPDATE "AgentRun" SET status='failed', "completedAt"=NOW(), error='Lost process' WHERE id=$1`.

### 11.3 Verify SSE works at the transport layer

```bash
curl -N https://api.robohire.io/api/v1/admin/agents-terminal/stream \
  -H "Cookie: session_token=<your_admin_session>"
```

You should see `event: connected`, then every 25 seconds a `: ping` comment line, then `event: event` payloads as real activity lands. If curl hangs with no `connected` marker, either the cookie is wrong (403) or Render's proxy is stripping `Content-Type: text/event-stream` — check `X-Accel-Buffering` is set.

### 11.4 Verify the scheduler registered jobs on boot

On backend boot, console should log:

```
[AgentScheduler] Registering N scheduled agent(s) on boot
[AgentScheduler] Registered <agentId> @ "0 9 * * 1"
...
[AgentScheduler] Catch-up firing missed run for agent <id>   # only if missed
```

If the count is wrong, run `SELECT id, schedule FROM "Agent" WHERE "scheduleEnabled" = true;` and compare against `agentScheduler.list()` (in a REPL). Drift usually means the backend was not restarted after a schema or schedule change.

### 11.5 Check token / cost when something feels off

Three places they're surfaced:

1. **`AgentRun.tokensIn / tokensOut / costUsd / llmCallCount / avgLatencyMs`** — populated at run completion. Cheap indexed query: `SELECT id, tokensIn, tokensOut, costUsd FROM "AgentRun" WHERE "agentId" = $1 ORDER BY "createdAt" DESC LIMIT 10;`.
2. **`GET /api/v1/agents/:id/runs/:runId/summary`** — admin-gated; returns the same values in the response plus top candidates and common skills/gaps.
3. **Admin Agents Terminal** (`/product/admin/agents-terminal`) — filter for `llm.call.completed` and watch the payloads live. Each event carries the per-call `tokensIn/tokensOut/costUsd/latencyMs/model/provider`.

If `AgentRun.costUsd = 0` but `llm.call.completed` events show non-zero cost in the terminal, a row-by-row `aggregateLlmStats` mismatch is the likely cause — check that the `runId` on the events matches the `AgentRun.id` you're inspecting (both sides are cuids, easy to typo).

### 11.6 Verify the admin-only scrub is working

Log in as a non-admin, open the drawer on any completed run, open DevTools network, inspect the response to `GET /agents/:id/runs/:runId` — `tokensIn`, `tokensOut`, `costUsd`, `llmCallCount`, `avgLatencyMs` must **not** be present. `durationMs` should be present (not sensitive). Repeat as admin — all fields present. This is the easiest end-to-end check that `scrubRunStats` is wired on every read path.

### 11.7 Debug a user's memory state via the Admin Memory tab

When a user reports "my new agent keeps surfacing the wrong kind of candidate" or "my ICP regen isn't picking up my recent dislikes", the Admin Memory Manager is the break-glass debugging path. It is admin-gated and every action leaves an audit row, so it is safe to use but should be reserved for real debugging.

Flow:

1. As an admin, open `/product/admin` → **Memory** tab. The user list renders on the left with a search box.
2. Locate the user. Click their row. The right pane loads three sub-tabs: **Profile** (the rolled-up `UserRecruiterProfile`), **Memories** (paginated `MemoryEntry` rows — currently empty until the synthesis worker ships), **Interactions** (recent `CandidateInteraction` rows, useful for "did their clicks even land?").
3. If the Profile tab shows stale-looking aggregates — e.g. `agentCount = 2` but the user has 5 agents — click **Rebuild Profile** (logs a `rebuild_profile` audit row). This calls `userRecruiterProfileService.rebuildForUser(userId)` and refreshes the card.
4. If the Profile shows clearly wrong data (e.g. "prefers junior" when the user explicitly triages for senior), click **Reset Profile** and enter a reason. This hard-deletes the row and the user falls back to cold-start on their next new agent. Existing agent ICPs are untouched.
5. If a specific `MemoryEntry` looks wrong (again, will apply once the synthesis worker ships), use **Edit** to fix the content — the legal-blocklist validator runs on save and will reject content matching `age`, `gender`, etc. — or **Delete** to hard-remove the row. Both actions require an optional reason and persist a `changes: {before, after}` diff.
6. Every action lands in the **Audit** sub-tab (read-only) so you can verify the sequence and reproduce the paper trail.

**Don't forget**: views are audited too. Browsing a user's memory pane writes `view_memories` / `view_interactions` / `view_profile` rows. Future work will surface these to the user via a "recent admin access" page. Treat every open of this tab as an auditable event and fill in the reason field when prompted.

To query the audit trail directly in SQL (for compliance / incident review):

```sql
-- Who looked at user X's memories in the last 7 days?
SELECT m."createdAt", u.email, m.action, m.reason
FROM "MemoryAdminAuditLog" m
JOIN "User" u ON u.id = m."adminId"
WHERE m."targetType" = 'user'
  AND m."targetId" = '<userId>'
  AND m."createdAt" > NOW() - INTERVAL '7 days'
ORDER BY m."createdAt" DESC;
```

---

## 12. Glossary

| Term | Meaning |
|---|---|
| **Agent** | A persistent named configuration owned by a user, scoped to one Job, with a task type, instructions, criteria, optional source modes, and an optional schedule. **A record, not a process.** |
| **AgentRun** | A single execution of an Agent. One Agent can have many runs over time. Holds status, start/end timestamps, funnel `stats`, and cost/token/latency totals. |
| **AgentCandidate** | A single sourced or matched candidate produced by an AgentRun. Linked to a `Resume` row if the source is internal; stands alone if from an external vendor. Has a status in the triage state machine. |
| **Source mode** | Which candidate pool a `search_candidates` run reaches into. V1: `instant_search` (owner's pool), `internal_minio` (shared archive), `external_api` (third-party vendors). Multi-select on the agent. |
| **Criteria** | The structured list of evaluation criteria on `Agent.config.criteria`. Each item has `{id, text, pinned, bucket}`. Pinned = dealbreaker; bucket = MOST IMPORTANT vs LEAST IMPORTANT. Rendered as chips in the Edit Criteria modal, woven into the JD by `buildAugmentedJd`. |
| **Preset** | A saved reusable criteria bag (`AgentCriteriaPreset`) with `private | shared` scope. Imported into an agent by **copy** — later preset edits do not mutate existing agents, preserving run history. |
| **Dealbreaker** | A pinned criterion. The LLM is instructed to grade any candidate missing a dealbreaker as F / "Not Qualified" regardless of other strengths. |
| **OpenClaw** | Remote HTTP-wrapped chat service that owns the candidate-facing communication channel. Writes activity back to RoboHire's Neon DB via HMAC-verified ingest endpoints. **Integration pending (Phase 8).** |
| **llmMatcher** | The shared helper under `services/sources/llmMatcher.ts` that every source adapter calls to run `ResumeMatchAgent` in bounded-concurrency batches. Owns the 60-score floor, the per-call `llm.call.*` event wrapping, the augmented-JD prompt builder, and the AgentCandidate persistence. |
| **AgentActivityLogger** | The single emit point for every activity event. Writes one `AgentActivityLog` row and fans out to three in-memory `EventEmitter` channels (`run:<runId>`, `agent:<agentId>`, `all`). |
| **Admin terminal** | The monospace full-system event console at `/product/admin/agents-terminal`. Admin-only. SSE-subscribed to the `all` channel. Shows every event across every agent system-wide. |
| **Scrub** | The helper pair (`scrubRunStats`, `scrubActivityRow`) in `routes/agents.ts` that strips token/cost/model/provider fields from responses going to non-admin callers. Applied on six read endpoints. |
| **Catch-up run** | A one-shot run fired at boot for an agent whose `nextRunAt < now()` — covers scheduled runs that were skipped while the process was down. Marked with `{catchup: true, missedBy: <seconds>}` in the `run.queued` payload. |
| **Progress endpoint** | `GET /agents/:id/runs/:runId/progress` — a live read model for in-flight runs that aggregates `AgentActivityLog` and counts `AgentCandidate` rows on the fly, because `AgentRun.tokensIn/etc` are only populated at completion. Powers the `LiveRunCard`. |
| **Ideal Candidate Profile (ICP)** | The versioned LLM-inferred recruiter taste model on `AgentIdealProfile`. Rebuilt by `IdealCandidateProfileAgent` from Like / Dislike history. Injected into `buildAugmentedJd` as a scoring conditioner. Soft-revert copies forward; never rewinds. |
| **Hard Requirement (硬性条件)** | User-declared boolean pre-filter on `Agent.config.hardRequirements`. Deterministic, enforced via `applyHardRequirements()` as a JS pre-filter the LLM never sees. Typed rules like `experienceYears gte 3`, `location in [Beijing]`. |
| **Anchor candidate** | A named exemplar candidate injected into the matcher prompt as a ground-truth example — "score higher if the resume resembles Wang Tao @ ByteDance". LLMs imitate concrete examples far better than they apply abstract weight vectors. Positive + negative anchors come from the ICP. |
| **Warm-start** | **Phase 7a.** A brand-new agent's v1 ICP is seeded from the owner's rolled-up `UserRecruiterProfile` instead of starting cold. Fires only at create time, only when `agentInheritsFromProfile = true`. |
| **UserRecruiterProfile** | **Phase 7a.** One row per user; rolled-up aggregate of taste across all their agents. Rebuilt (not incrementally updated) whenever any of their ICPs change, throttled to once per 60s. |
| **CandidateInteraction** | **Phase 7b.** Append-only implicit-signal event: `viewed`, `expanded`, `dwell`, `contact_copied`, `link_clicked`, `scroll_deep`. Captured client-side via `useCandidateInteractionTracker`, batched + flushed every 5s. |
| **MemoryEntry** | **Phase 7c.** The semantic memory primitive — a single distilled fact with scope, embedding, weight, decay, and optional expiry. Retrieved via cosine similarity × decay × scope-boost. Scope is `user | team | workspace | job`. |
| **Decay half-life** | The exponential decay curve applied to memory weights. `user: 30d, team: 60d, workspace: 180d, job: 45d`. Individual taste shifts faster than team conventions, which shift faster than company policy. |
| **Reinforcement** | When retrieval surfaces a memory that ends up being used in an ICP regen, its `lastSeenAt` bumps and `weight` boosts up to `3 × baseline`. Creates a positive feedback loop: memories that matter keep themselves alive. |
| **ContextRetrievalService** | **Phase 7c.** The service that walks the scope hierarchy, computes `cosineSim × decayedWeight × scopeBoost`, enforces per-scope caps, and returns the top-K memories for an ICP regen. Currently callable but returns `[]` in production until the synthesis worker ships. |
| **Admin Memory Manager** | **Phase 7.5.** The admin break-glass tool for debugging memory state. Every read and every write audits to `MemoryAdminAuditLog` BEFORE the action. Admin edits pass through a legal-content blocklist. Accessed via `/product/admin` → Memory tab. |
| **mem0 Option B (Hybrid)** | **Phase 7d.** The decision to build a native memory layer that mirrors mem0's API surface (`addMemory` / `searchMemories` / `updateMemory` / `deleteMemory` / `expireMemories`) so that a future swap to `Mem0ManagedAdapter` is a single-file change. Driven by the finding that mem0's Node SDK does not support pgvector. |

---

**End of changelog.** When Phase 7c's remaining pieces (synthesis worker, embedding adapter, `IdealProfileService` integration) and Phase 8+ (Invite / Email / OpenClaw) land, append to this document under new sections rather than rewriting history — this is the durable record of how the workbench got to where it is on 2026-04-12.
