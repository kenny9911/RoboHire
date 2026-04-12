# Agent Sourcing System — Complete Session Log (2026-04-12)

**Session scope**: End-to-end redesign of the agent sourcing experience + admin fleet management
**Duration**: Single continuous session
**Artifacts produced**: 2 PRDs, 12 new files, 30+ modified files, 8-locale i18n across all features

---

## Table of Contents

1. [Prompt #1: Sourcing Redesign — Calibration, Why-Matched, Mission Control](#prompt-1)
2. [Prompt #2: Click-to-View Profile](#prompt-2)
3. [Prompt #3: Results Tab Empty Bug Fix](#prompt-3)
4. [Prompt #4: "Agent is Working" Empty State](#prompt-4)
5. [Prompt #5: Admin Agent Manager — Research, Spec, and Phase 1+2](#prompt-5)
6. [Prompt #6: Phase 3 — Admin Agent Manager UI](#prompt-6)
7. [Prompt #7: Phase 4 — Internal Role Read-Only Access](#prompt-7)
8. [Complete File Manifest](#file-manifest)
9. [Schema Changes Summary](#schema-changes)
10. [Architecture Decisions Log](#architecture-decisions)

---

<a id="prompt-1"></a>
## 1. Prompt #1: Sourcing Redesign

### Original Prompt (verbatim)

> [Image #1], there should be a button to run the agent again, when run again, do not select the ones that were selected from previous agent runs for the same agent.
> 2. When user rejects a profile, user will be asked for a reason for rejecting the profile. This will help the agent in finding the right profiles. Ask user to provide as much feedback as possible.
> 3. To let the agent begin sourcing, user needs to approve three (3) consecutive profiles that are good fits. Every time user rejects a profile, user will receive three (3) new profiles for approval. ---> please think deeply for this logic, design the spec and update the current implementation and flows, as well as enhancing the prompts. Maximize the power of LLM.
> 4. The Agent is Sourcing for the user - After completing the agent set up, the agent will start sourcing for the user. The user can review its progress by heading to the mission controll (which will show all the details for progress and results).
> 5. [Image #2], see [Image #2] for reference, our current implementation should have a button and easy access for the user to see the profile the agent matched for the user, including the section of "Why we matched this profile", this should include all the reasons, strength (highlights), fit, match reasons, and areas to look for.
> 6. please research https://juicebox-agent.super.site/ and its related pages to understand more, we want to learn and clone as much from juicebox ai as possible.
> ---> please design and plan well, create the documentation first, product spec, and then start the implementation autopilot.

### What Was Built

**Product spec**: `docs/agent-sourcing-redesign.md` (full PRD with 13 sections)

**Schema changes** (Prisma, pushed to Neon):
- `Agent.calibrationState` (String, default 'pending') — pending | calibrating | calibrated
- `Agent.consecutiveLikes` (Int, default 0) — current streak, resets on dislike
- `Agent.calibrationCompletedAt` (DateTime?)
- `AgentCandidate.rejectionReason` (String? @db.Text) — free-text from recruiter
- `AgentCandidate.rejectionTags` (String[] @default([])) — structured taxonomy

**Backend changes**:
- `routes/agents.ts` — rewrote `PATCH /:id/candidates/:candidateId` with calibration loop (3-consecutive-likes gate), rejection feedback capture, auto ICP-regen on dislike, auto fresh-batch trigger. Added `POST /:id/calibration/next-batch`. Legacy `approved`/`rejected` → `liked`/`disliked` normalization. Details endpoint surfaces `whyMatched` at top level.
- `services/sources/llmMatcher.ts` — new `buildWhyMatched()` extractor that maps `ResumeMatchAgent` output into structured `WhyMatched` (reasons/strengths/areasToExplore/skillMap). Zero extra LLM calls.
- `services/InstantSearchMatchService.ts` — same `whyMatched` shape backfilled for the legacy path.
- Run-again exclude-seen: already wired via `alreadyEvaluatedResumeIds()` — no change needed.

**Frontend changes**:
- `hooks/useAgentRunStream.ts` — exported `WhyMatched` types + `extractWhyMatched()` helper
- `components/RejectionReasonModal.tsx` — new modal with 8 tag chips + free-text
- `components/ReviewProfilesView.tsx` — opens rejection modal on Reject, renders `WhyWeMatchedPanel`
- `components/AgentRunDrawer.tsx` — extended `triageMutation` for rejection extras
- `pages/product/AgentDetail.tsx` — full rebuild as Mission Control with calibration progress bar, Run Again button, unified liked/disliked terminology

**i18n**: ~40 new keys across 8 locales (en, zh, zh-TW, ja, es, fr, pt, de)

---

<a id="prompt-2"></a>
## 2. Prompt #2: Click-to-View Profile

### Original Prompt (verbatim)

> [Image #3], [Image #4], user should be able to click on a candidate and see the profile like this: [Image #5].

### What Was Built

- `ReviewProfilesView.tsx` — added `initialCandidateId?` prop. When set, view switches to *inspect mode*: pages through all candidates (not just pending), starts on the requested one, shows current status badge instead of approve/reject for already-actioned profiles. Auto-advance suppressed in inspect mode.
- `AgentRunDrawer.tsx` — accepts `initialCandidateId?`. Opens directly in review view when set. Threads `onInspect` callback through `ResultsTab` → `CandidateCard`.
- `CandidateCard` — now a `role="button"` clickable area with `hover:border-violet-200`. Like/dislike buttons use `stopPropagation()` to prevent double-fire.
- `AgentDetail.tsx` (mission control) — candidate rows clickable, opens drawer pre-routed to that profile.
- 8 locales — added `agents.workbench.review.status.*` for the inline status badge.

---

<a id="prompt-3"></a>
## 3. Prompt #3: Results Tab Empty Bug Fix

### Original Prompt (verbatim)

> [Image #6] need to display the data on this screen stably, sometimes it shows results, sometimes it is like this, empty. but actually, there are a few agent ran already and there are results. please review it and implement

### Root Cause

The Results tab used `useAgentRunStream` which only loads candidates from a single run's SSE snapshot. The drawer auto-selected the most-recent run — often a freshly-triggered empty one (especially after a dislike fires the auto-batch). The SSE snapshot for that run was empty; legacy candidates with `runId: null` never appeared in any per-run snapshot.

### What Was Built

- `routes/agents.ts` `GET /:id/candidates` — enriched resume select to match the SSE shape (phone/tags/summary/highlight/experienceYears), ordered by `matchScore desc`.
- `AgentRunDrawer.tsx` — added `allCandidates` state populated by REST call to `GET /agents/:id/candidates` on mount. Merged with `stream.candidates` (deduped by id, stream wins). Refetches on stream-end, triage, and 6s polling while a run is in-flight.

---

<a id="prompt-4"></a>
## 4. Prompt #4: "Agent is Working" Empty State

### Original Prompt (verbatim)

> [Image #7] when extracting education, work experience, and skills, do not display "未从该简历中解析到工作经历", 而是要 "Agent 在工作中" 等比较产品画的信息。

### What Was Built

- `ReviewProfilesView.tsx` — new `AgentWorkingState` component with animated spinner in a dashed violet card. `ExperienceList`, `EducationList`, `SkillsMap` now take a `loading` prop. Loading = `parsedById[id] === undefined` (still fetching); empty = fetched but no data.
- Copy distinction: **loading** → "Agent 正在整理工作经历…" / **empty** → "Agent 在工作中,工作经历即将呈现。"
- Removed unused `EmptyState` component.
- 8 locales — 6 new keys per locale (`loadingExperience`/`workingExperience` + education + skills).

---

<a id="prompt-5"></a>
## 5. Prompt #5: Admin Agent Manager — Research + Phase 1+2

### Original Prompt (verbatim)

> [Image #8], please double check and review whether these agents are really work in progress "运行中"? lets make sure our design for harness and environment are properly implemented and manageable. Research and design an Agent Manager for Admin role users to use, design a robust Agent Management page and add it under /Admin.
>
> please deeply understand my prompts above, and rewrite into a complete and robust product prompts, then launch a product development team to work on this professionally, with product design, UI designer, system architect, coders, test architect, and devops.
>
> make sure document everything and save my prompts.
>
> let me know if you have questions for me. find out if what my thoughts are great, or you think should be modified.

### Follow-up Answers

> start (a) now.
> 1. 15-min and 20-min.
> 2. your top 4, plus force re-run. these 5 bulk actions for now, we can think of other useful ones once we got these working stably.
> 3. today, last 7 days, last 30 days, with default to last 7 days.
> 4. polling-every-5s for v1. when it is stable, we can change it to realtime.
> 5. yes.
> 6. yes.
>
> also only show the token usage and cost to the admin role user. we can think about how to charge the user after we complete the functionality of the agent. what do you think?

### Diagnostic Findings

Full writeup in `docs/admin-agent-manager-prd.md` §2. Key findings:
- **Zombie runs are real**: process crash/restart leaves `AgentRun.status='running'` permanently — no boot-time recovery sweep exists.
- **In-memory only cancellation**: `cancelAgentRun()` only calls `AbortController.abort()` — never writes `cancelled` to the DB. Post-restart cancels are no-ops.
- **No heartbeat column**: admins can't distinguish "stuck for 6 hours" from "progressing normally".
- **Scheduler doesn't guard concurrency**: a cron tick can spawn a sibling run on top of a zombie.
- **UI trusts the DB blindly**: "运行中" badge is purely `status === 'running'`, no progress validation.

### What Was Built (Phase 1+2 — Reliability)

**Schema** (pushed to Neon):
- `AgentRun.lastHeartbeatAt` (DateTime?) — bumped by AgentActivityLogger on every event
- `AgentRun.swept` (Boolean, default false) — true if force-failed by sweep
- `AgentRun.sweepReason` (String?) — 'boot' | 'watchdog' | 'admin'
- `@@index([status, lastHeartbeatAt])` — supports watchdog query

**New service**: `services/AgentRunWatchdogService.ts`
- `bootSweep()` — fired once at backend startup, sweeps anything stale > 15 min
- `start()` — node-cron every 2 min, sweeps no-heartbeat > 20 min
- Both reap: emit `agent.run.swept` activity event + in-app notification to agent owner

**Boot wiring**: `index.ts` — sweep runs after scheduler init, watchdog starts, stopped on shutdown.

**DB-backed cancel**: `routes/agents.ts` cancel endpoint now writes `status='cancelled'` to DB immediately before calling in-memory abort. Executor checks DB status between source-mode boundaries via `isRunCancelledInDb()`. Both success-path and error-path updates use `updateMany` with status guard to avoid overwriting authoritative terminal states.

**Scheduler concurrency guard**: `AgentSchedulerService.ts:fire()` checks for existing `queued`/`running` runs before starting a new cron-fired one.

---

<a id="prompt-6"></a>
## 6. Prompt #6: Phase 3 — Admin Agent Manager UI

### Original Prompt (verbatim)

> start Phase 3 now

### What Was Built

**Full PRD**: `docs/admin-agent-manager-prd.md` — 13-section document with diagnostic, user roles, two tracks (reliability + UI), architecture decisions, data model changes, phased rollout, open questions + answers, test/devops plan, team structure, and what's great vs. what to modify.

**Backend**: `routes/adminAgentManager.ts` — 13 endpoints mounted at `/api/v1/admin/agent-manager` (later moved to `/api/v1/agent-manager` in Phase 4):

| Method | Path | Purpose |
|---|---|---|
| GET | /summary | Health card (totals, today spend, stale count) |
| GET | /agents | Fleet agents list with filters |
| GET | /runs | Fleet runs list with filters |
| GET | /cost-rollup | Cost rollup (today/7d/30d windows) |
| POST | /runs/sweep | On-demand watchdog trigger |
| POST | /runs/:runId/cancel | Admin force-cancel |
| POST | /runs/:runId/mark-failed | Manual reap with reason |
| POST | /agents/:id/pause | Pause agent |
| POST | /agents/:id/unpause | Unpause agent |
| POST | /agents/:id/run | Force re-run |
| DELETE | /agents/:id | Delete agent (cancels live runs first) |
| POST | /bulk | Batch dispatcher for all 5 bulk actions |

**Frontend**: `pages/AdminAgentManager.tsx` (~1k LOC, no new deps):
- Health summary card with 8 metrics + Run-sweep button
- Tab: Agents — filters, table, bulk toolbar (Force re-run / Pause / Unpause / Delete)
- Tab: Runs — filters, table, bulk toolbar (Cancel / Mark failed…), STALE + sweep-reason badges
- Tab: Cost — window pills (Today / 7d default / 30d), totals, CSS-bar day chart, by-owner + by-agent rollup tables
- 5s polling on all tabs
- Mounted at `/product/admin/agent-manager` via lazy load in App.tsx
- "Agent Manager" pill button added to AdminDashboard header

**i18n**: ~70 new keys per locale across 8 locales.

---

<a id="prompt-7"></a>
## 7. Prompt #7: Phase 4 — Internal Role Read-Only

### Original Prompt (verbatim)

> if you have not done phase 4, please go ahead and start phase 4 implementation.

### What Was Built

**Backend**:
- New `requireAdminOrInternal` middleware in `middleware/admin.ts` — admits `role === 'admin' || role === 'internal'`
- Router moved from `/api/v1/admin/agent-manager` (admin-only parent) to `/api/v1/agent-manager` with `requireAuth + requireAdminOrInternal` at mount level
- Every mutating endpoint stacks `requireAdmin` inline so internal users get 403 on writes

**Frontend**:
- `AdminAgentManager.tsx` — detects `canMutate = role === 'admin'`, hides sweep button, bulk toolbars, checkbox columns, and ReasonModal for internal users. Shows blue read-only banner.
- `ProductLayout.tsx` — new sidebar link "Agent Manager" visible for admin OR internal. Internal users see a "view" badge.

**i18n**: `readOnly.title/body`, updated `forbidden.body`, `product.nav.agentManager/readOnly` across 8 locales.

---

<a id="file-manifest"></a>
## 8. Complete File Manifest

### New Files Created

| File | Purpose |
|---|---|
| `docs/agent-sourcing-redesign.md` | PRD for calibration, why-matched, mission control |
| `docs/admin-agent-manager-prd.md` | PRD for admin agent manager (all 4 phases) |
| `docs/agent-sourcing-session-2026-04-12.md` | This document |
| `backend/src/services/AgentRunWatchdogService.ts` | Boot sweep + runtime cron watchdog |
| `backend/src/routes/adminAgentManager.ts` | Admin agent manager API (13 endpoints) |
| `frontend/src/components/RejectionReasonModal.tsx` | Structured rejection feedback modal |
| `frontend/src/pages/AdminAgentManager.tsx` | Admin agent manager page (3 tabs) |

### Modified Files

| File | Changes |
|---|---|
| `backend/prisma/schema.prisma` | Agent calibration fields, AgentCandidate rejection fields, AgentRun heartbeat/sweep fields, 2 new indexes |
| `backend/src/index.ts` | Boot sweep + watchdog start/stop, agent-manager mount with requireAdminOrInternal |
| `backend/src/routes/admin.ts` | Removed agent-manager sub-mount (moved to own path) |
| `backend/src/routes/agents.ts` | Calibration loop, DB-backed cancel, enriched candidates endpoint, whyMatched in details |
| `backend/src/services/AgentRunService.ts` | DB-backed cancel check, race-safe terminal writes, out-of-process cancel detection |
| `backend/src/services/AgentActivityLogger.ts` | Heartbeat write on every run-scoped event |
| `backend/src/services/AgentSchedulerService.ts` | Concurrency guard before scheduled runs |
| `backend/src/services/InstantSearchMatchService.ts` | whyMatched backfill + metadata field |
| `backend/src/services/sources/llmMatcher.ts` | buildWhyMatched extractor, WhyMatched types |
| `backend/src/middleware/admin.ts` | requireAdminOrInternal middleware |
| `frontend/src/App.tsx` | AdminAgentManager lazy import + route |
| `frontend/src/hooks/useAgentRunStream.ts` | WhyMatched types, extractWhyMatched helper |
| `frontend/src/components/AgentRunDrawer.tsx` | allCandidates REST merge, triageMutation extras, initialCandidateId, onInspect |
| `frontend/src/components/ReviewProfilesView.tsx` | initialCandidateId, inspect mode, WhyWeMatchedPanel, AgentWorkingState, RejectionReasonModal wiring |
| `frontend/src/pages/product/AgentDetail.tsx` | Full rebuild as Mission Control |
| `frontend/src/pages/AdminDashboard.tsx` | Agent Manager pill button |
| `frontend/src/layouts/ProductLayout.tsx` | Agent Manager sidebar link for admin + internal |
| `frontend/src/i18n/locales/*/translation.json` | All 8 locales (~120 new keys each) |

---

<a id="schema-changes"></a>
## 9. Schema Changes Summary

All changes are additive (no drops, no renames). Safe to deploy without data backfill.

```prisma
// Agent model additions
calibrationState        String    @default("pending")
consecutiveLikes        Int       @default(0)
calibrationCompletedAt  DateTime?

// AgentCandidate model additions
rejectionReason  String?  @db.Text
rejectionTags    String[] @default([])

// AgentRun model additions
lastHeartbeatAt DateTime?
swept           Boolean   @default(false)
sweepReason     String?

// New indexes
@@index([status, lastHeartbeatAt])  // on AgentRun
```

---

<a id="architecture-decisions"></a>
## 10. Architecture Decisions Log

| # | Decision | Rationale | Alternative Considered |
|---|---|---|---|
| AD-1 | Boot sweep + cron watchdog, not background worker | No background worker infra exists; node-cron is already a dependency via AgentSchedulerService | Redis-backed worker queue (overkill for this use case) |
| AD-2 | Heartbeat write inside AgentActivityLogger | Every meaningful run event already flows through here; guarantees zero drift between "run is progressing" and "heartbeat is fresh" | Separate timer (would mask hung HTTP calls) |
| AD-3 | DB-backed cancel writes status immediately, then fires in-memory abort | Converges from both directions; works across process restarts and sibling workers | DB polling loop in executor (too expensive) |
| AD-4 | Agent Manager at its own mount point, not under /admin | Internal users need read access but the /admin parent enforces requireAdmin | Duplicating the router (DRY violation) |
| AD-5 | whyMatched stored in metadata JSON, not a new column | No schema migration needed; the data is unstructured and varies by match agent version | New column (migration + backfill cost) |
| AD-6 | Calibration state on Agent, not on AgentRun | Calibration is a lifecycle property of the agent, not a per-run attribute | Separate CalibrationSession model (over-engineering) |
| AD-7 | REST polling every 5s for admin page, not SSE | Simpler, sufficient for a control plane, less code, can upgrade to SSE later | SSE (more code + server state for a page that's rarely open) |
| AD-8 | allCandidates REST merge in AgentRunDrawer | Solves the "empty Results tab" bug by loading ALL agent candidates regardless of which run is selected; SSE stream candidates are merged as they arrive | Only SSE (would perpetuate the single-run filter bug) |

---

## 11. Environment Variables Added

| Variable | Default | Purpose |
|---|---|---|
| `AGENT_RUN_BOOT_SWEEP_MINUTES` | `15` | Boot sweep threshold — mark stale `running`/`queued` rows as `failed` if older than this |
| `AGENT_RUN_STALE_MINUTES` | `20` | Runtime watchdog threshold — mark no-heartbeat rows as `failed` |
| `AGENT_RUN_WATCHDOG_CRON` | `*/2 * * * *` | Watchdog cron expression |

---

## 12. Testing Recommendations

### Calibration Loop
1. Create agent → first run → review 1 candidate → Like → calibration bar shows 1/3
2. Skip (reject) the next → rejection modal opens → submit → ICP regenerates → fresh batch fires → calibration resets to 0/3
3. Like 3 in a row → badge flips to "Active · sourcing"
4. Click "Run again" → confirm previously-seen candidates don't reappear

### Why-Matched Panel
1. Open any candidate in review view → verify "Why we matched this profile" panel renders with Good Match / Potential Fit / Worth Exploring chips
2. Verify strengths + areas-to-explore sections show when data exists

### Admin Agent Manager
1. Log in as admin → Admin dashboard → click "Agent Manager" pill
2. Agents tab: filter by "Stuck runs only", select rows, try Pause/Unpause
3. Runs tab: filter by status=running, select, Cancel; try "Mark failed…" with reason
4. Cost tab: flip between Today / 7d / 30d
5. Run sweep button → watch toast
6. Log in as internal user → verify read-only banner, no bulk toolbars, no checkboxes

### Watchdog / Boot Sweep
1. Start backend → check console for "Boot sweep reaped N zombie agent runs" (if any exist)
2. Kill backend mid-run (`kill -9`), restart → verify the run is marked `failed` with "Stale run detected on server restart"
3. Verify agent owner gets an in-app notification
