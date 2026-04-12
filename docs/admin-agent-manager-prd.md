# Admin Agent Manager — Product Requirements Document

**Status**: Draft for review (not approved for implementation)
**Author**: Kenny (translated from raw brief by Claude)
**Date**: 2026-04-12
**Reviewers needed**: Kenny

---

## 0. Original Brief (verbatim)

> please double check and review whether these agents are really work in progress "运行中"? lets make sure our design for harness and environment are properly implemented and manageable. Research and design an Agent Manager for Admin role users to use, design a robust Agent Management page and add it under /Admin.
>
> please deeply understand my prompts above, and rewrite into a complete and robust product prompts, then launch a product development team to work on this professionally, with product design, UI designer, system architect, coders, test architect, and devops.
>
> make sure document everything and save my prompts.
>
> let me know if you have questions for me. find out if what my thoughts are great, or you think should be modified.

Saved verbatim as the source of truth for what was actually asked.

---

## 1. Problem Statement

The Agents listing currently shows several agents tagged "运行中" (running) that are *not* actually running — they are zombies left over from past server restarts, killed processes, or unhandled errors mid-run. This masks the real operational state of the system, makes the workbench drawer auto-select stuck runs, and erodes trust in the agent infrastructure.

There is no admin surface to *see*, *recover*, *cancel*, *retry*, or *audit* agent runs across the fleet. The existing `/admin/agents-terminal` page is a debug-only firehose, not a management tool — it has no concept of zombies, no bulk actions, no per-user cost rollups, and no watchdog signals.

Two distinct things are conflated and need to be fixed together:

1. **Underlying bug** — runs can get stuck in `running` / `queued` forever; cancellation doesn't update the DB; there's no boot-time recovery sweep.
2. **Missing operator surface** — even after fixing #1, admins need a control plane for the agent fleet: visibility, recovery, intervention, and per-user analytics.

Building the UI without fixing the bug just hides the symptom. Fixing the bug without the UI gives admins no levers when something else inevitably breaks. **We do both.**

## 2. Diagnostic Findings (why "运行中" agents are zombies)

Detailed walkthrough of the existing code, with file paths + line numbers, to ground the design:

### 2.1 State machine has no recovery path

`backend/src/services/AgentRunService.ts:194` — `executeRun()` flips a run to `running` and starts work. The only places that flip a run *out* of `running` are:
- The success path at line 295 (`completed`)
- The catch block at line 330 (`cancelled` if `signal.aborted`, otherwise `failed`)

If the Node process is killed (`SIGKILL`, OOM, container restart, deploy) between those lines, the row stays `running` permanently. There is no boot-time scan that sweeps stale rows.

### 2.2 In-memory cancellation, in-process only

`AgentRunService.ts:139` — `runCancellation = new Map<string, AbortController>()` lives in process memory. The file even calls this out:

> // For horizontal scaling, Phase 7 will replace this with a DB-backed flag.

Implications:
- A second backend process cannot cancel a run started on the first process.
- A restart loses the entire map; cancellation requests after restart all return `false`.
- The cancel endpoint in `routes/agents.ts:845` only calls `cancelAgentRun()` and returns the boolean. It **never updates the DB row directly**. A late cancel (after the executor already finished) silently does nothing.

### 2.3 Boot has no recovery sweep

`backend/src/index.ts:358-368` — on boot, the server initializes `AgentSchedulerService`, which loads scheduled agents and registers cron tasks, then runs a missed-run catch-up pass for `nextRunAt < now()`. **It does not scan `AgentRun` for stale `queued`/`running` rows.** Those rows live forever.

### 2.4 No heartbeat / no progress signal

`backend/prisma/schema.prisma:919` — `AgentRun` has `startedAt`, `completedAt`, `createdAt`, `error`. There is no `lastHeartbeatAt`, no `lastActivityAt`. Admins cannot answer "has this run made progress in the last 5 minutes?" except by joining `AgentActivityLog` and computing `MAX(createdAt)` per run.

### 2.5 Scheduler does not guard against overlap

`backend/src/services/AgentSchedulerService.ts:116-130` — when a cron fires, the scheduler grabs a DB lock by updating `Agent.lastRunAt` and bails if another worker won the race. **It does not check whether the agent has any `running`/`queued` runs.** An agent stuck in `running` will gain a *second* concurrent run on the next cron tick.

### 2.6 UI trusts the DB blindly

`frontend/src/components/AgentRunDrawer.tsx:155` — `hasLive = runs.some((r) => r.status === 'running' || r.status === 'queued')`. The badge is purely a function of the DB column. There is no validation that a `running` row is actually progressing.

### 2.7 Conclusion

The "运行中" agents the user is seeing are **real DB rows** stuck in `running` from a prior server lifecycle, plus possibly some queued cron-fired runs that overlap with those zombies. The UI is faithfully reporting bad data. Both layers need fixes.

## 3. Goals & Non-Goals

### Goals
- Eliminate zombie runs: any run with no progress for N minutes is automatically marked failed with a clear reason.
- Give admins a single page to see and manage every agent + run in the system.
- Make cancellation reliable across processes and restarts.
- Surface per-user / per-team / per-agent cost rollups to spot runaway spend.
- Make the "is this thing actually running?" question answerable in one glance.

### Non-Goals (this iteration)
- A full agent debugger/REPL (the existing `/admin/agents-terminal` covers raw event firehose).
- Cross-agent A/B tests, scheduling overrides, or auto-tuning.
- A general "fleet health" dashboard for non-agent infrastructure.
- Multi-tenant SLA enforcement (rate limits per plan tier) — out of scope, captured as a follow-up.

## 4. User Roles & Personas

| Role | Needs |
|---|---|
| **Admin** (`user.role === 'admin'`) | See every agent across every user; cancel/recover any run; bulk-action zombies; export cost CSV; force-regenerate ICP |
| **Internal** (`user.isInternal === true`) | (Not in scope for this PRD — they may get a *read-only* slice in a follow-up) |
| **Recruiter** (regular user) | Unaffected — they keep using their own `/product/agents` page |

The admin manager is **strictly admin-only**. Any non-admin hitting the page or its API gets a 403.

## 5. The Two Tracks

This work splits cleanly into two tracks that can ship independently, but both should land in the same release window so the UI is never showing fake state.

### Track A — Reliability (backend, no UI)

A1. **Boot-time sweep** — on backend startup, after Prisma connects but before accepting traffic, run:
```sql
UPDATE "AgentRun"
SET status = 'failed',
    completedAt = NOW(),
    error = 'Stale run detected on server restart'
WHERE status IN ('queued', 'running')
  AND startedAt < NOW() - INTERVAL '15 minutes';
```
Log how many rows were swept. Emit an `agent.run.swept` event per row to `AgentActivityLog` so the admin page can show what was reaped.

A2. **Heartbeat column** — add `AgentRun.lastHeartbeatAt DateTime?`. Update it inside `agentActivityLogger.log()` whenever an event with a `runId` is written. Cheap (one extra `UPDATE` per event, batched with the existing logger write).

A3. **Watchdog cron** — every 2 minutes, scan for `status IN ('running','queued') AND lastHeartbeatAt < NOW() - INTERVAL '10 minutes'` and mark them `failed` with `error='Watchdog: no heartbeat for 10m'`. Same activity event so the admin page sees it.

A4. **DB-backed cancel** — when the cancel endpoint is hit, immediately `UPDATE AgentRun SET status='cancelled', completedAt=NOW()` *in addition to* aborting the in-memory controller. Make the executor check `status='cancelled'` between LLM batches and bail out cleanly.

A5. **Concurrency guard in scheduler** — before starting a scheduled run, check `prisma.agentRun.findFirst({ where: { agentId, status: { in: ['queued','running'] } } })`. If one exists *and* it has a recent heartbeat, skip the cron tick with an `agent.run.skipped_overlap` activity event. If one exists *and* it's stale, mark it failed first then start fresh.

### Track B — Admin Agent Manager (UI + admin API)

B1. **Routes**
- `/admin/agents` — fleet overview, list of agents
- `/admin/agents/runs` — fleet overview, list of runs
- `/admin/agents/:id` — single-agent deep-dive (reuses existing AgentDetail components, scoped admin)
- `/admin/agents/runs/:runId` — single-run deep-dive

B2. **Backend admin API** (`backend/src/routes/adminAgents.ts` — new file)
- `GET /api/v1/admin/agents` — list, paginated, with filters: owner, status, calibrationState, hasStuckRun, taskType, createdAt
- `GET /api/v1/admin/agents/runs` — list runs across all agents, filters: status, owner, agentId, durationOver, costOver, startedBetween
- `POST /api/v1/admin/agents/runs/:runId/cancel` — admin-force cancel (writes `cancelled` to DB even if in-memory controller is gone)
- `POST /api/v1/admin/agents/runs/:runId/mark-failed` — admin manual reap with reason
- `POST /api/v1/admin/agents/runs/sweep` — admin trigger of the watchdog sweep on demand
- `POST /api/v1/admin/agents/:id/pause` / `unpause`
- `GET /api/v1/admin/agents/cost-rollup` — `{ byUser, byAgent, byTaskType, period }` for the cost panel
- All endpoints gated by `requireAuth` + `requireAdmin` middleware

B3. **Page sections (single-page tabbed)**

```
[ Admin · Agent Manager ]                                [ Run sweep ] [ Export CSV ]

  ┌─ Health summary ────────────────────────────────────────────────┐
  │  152 agents · 12 active runs · 3 stale (no heartbeat 10m+)      │
  │  Today: 421 runs · $4.82 spend · 1.2M tokens                    │
  │  [ View 3 stale runs → ]                                        │
  └─────────────────────────────────────────────────────────────────┘

  [ Agents (152) ]  [ Runs (4,921) ]  [ Cost (today) ]  [ Activity ]

  ─── Filters ──────────────────────────────────────────────────────
  Owner [ all ▾ ]  Status [ all ▾ ]  Calibration [ any ▾ ]
  Has stuck run [ ✓ ]  Cost > [ $— ]  Created after [ — ]

  ─── Table ────────────────────────────────────────────────────────
  ☐  Name              Owner       Status     Calib.       Last run    Spend     ⋯
  ☐  AI 软件工程师      kenny       active     calibrated   12m ago     $4.82    ⋯
  ☐  Backend SRE        sarah       paused     calibrating  2h ago      $0.18    ⋯
  ☐  …
  [ Cancel selected ] [ Pause selected ] [ Mark failed ] [ Delete ]
```

B4. **"Stale run" badge** — any run with `status IN ('queued','running')` AND `lastHeartbeatAt < NOW() - 5min` gets a red "STALE" pill in both the agents table and the runs table. Clicking it opens a modal: last activity, error log, and one-click "Force fail" with a reason field.

B5. **Per-run drill-in** — reuses existing activity log + LLM call breakdown components, but adds an admin-only "Process state" panel showing in-memory controller presence, owning process pid (if we add it), and a "Force fail" button.

B6. **Cost rollup** — bar chart by user, by agent, by day. Hover = exact $. Click = filter the table to that slice. Computes from existing `AgentRun.costUsd` column.

## 6. Architecture Decisions

### Watchdog: cron, not background worker
We have no background worker infrastructure today. Use `node-cron` (already a dep via `AgentSchedulerService`) and register a separate "watchdog" job at boot. One process holds the lock via the existing scheduler's DB-lock pattern; others skip.

### Heartbeat write site: inside agentActivityLogger
Every meaningful run event already flows through `agentActivityLogger.log()`. Piggybacking the heartbeat update there guarantees zero drift between "the run has been progressing" and "the heartbeat is fresh." We deliberately do *not* heartbeat from a separate timer because a hung HTTP call should look hung.

### Force-cancel semantics
Admin force-cancel writes `status='cancelled', completedAt=now(), error='admin force cancel by <user>'` *immediately*. The executor (if still alive) will see the status flip on its next batch boundary and bail; if dead, the row is already correct. This converges from both directions.

### Why a separate `/admin/agents` page instead of bolting onto `/admin/agents-terminal`
The terminal is an event firehose for debugging. The manager is a control plane. They serve different jobs and should have different layouts. They can link to each other (manager → terminal, run drill-in → terminal filtered by runId).

### Authorization
A new `requireAdmin` middleware (`backend/src/middleware/auth.ts` already has user, just need a thin wrapper) returns 403 if `req.user.role !== 'admin'`. Apply to every `/api/v1/admin/*` route. Frontend gates the route entry in `App.tsx` via the existing `ProtectedRoute` + role check pattern.

## 7. Data Model Changes

```prisma
model AgentRun {
  // … existing fields …
  lastHeartbeatAt DateTime?  // NEW — written by agentActivityLogger on every run-scoped event
  swept           Boolean    @default(false)  // NEW — true if marked failed by sweep, for audit
  sweepReason     String?    // NEW — "boot" | "watchdog" | "admin"

  @@index([status, lastHeartbeatAt])  // NEW — supports the watchdog query
}
```

Migration is purely additive — safe to push.

## 8. Phased Rollout

**Phase 1 ✅ shipped** — Track A1+A2+A3 (boot sweep + heartbeat + watchdog cron).

**Phase 2 ✅ shipped** — Track A4+A5 (DB-backed cancel + scheduler concurrency guard).

**Phase 3 ✅ shipped** — Track B (admin page + APIs).

**Phase 4 ✅ shipped** — Read-only slice for `internal` role users:

- New `requireAdminOrInternal` middleware at `backend/src/middleware/admin.ts` stacks alongside the existing `requireAdmin`. The agent-manager router moved from `/api/v1/admin/agent-manager` (admin-only parent) to its own mount at `/api/v1/agent-manager` with `requireAuth + requireAdminOrInternal` at the mount, then `requireAdmin` inline on every mutating handler (`/runs/sweep`, `/runs/:runId/cancel`, `/runs/:runId/mark-failed`, `/agents/:id/pause|unpause|run`, `DELETE /agents/:id`, `/bulk`).
- Frontend detects `user.role === 'internal'` and renders a read-only variant: hides the Run-sweep button, bulk toolbars on both the Agents and Runs tabs, row-checkbox columns, and the ReasonModal entry points. Shows a blue "Read-only view" banner explaining why.
- New sidebar link in `ProductLayout` visible for admin OR internal, with a small "view" badge for internal users. Admin still reaches it from the AdminDashboard pill or the sidebar; internal users get the sidebar as their only entry point (they don't see the full admin dashboard).
- i18n: new `admin.agentManager.readOnly.*`, updated `admin.agentManager.forbidden.body`, and new `product.nav.agentManager` / `product.nav.readOnly` across all 8 locales.
- Token/cost data remains admin-only for the underlying run/activity endpoints via the existing `scrubRunStats` / `scrubActivityRow` helpers in `routes/agents.ts`. The agent-manager aggregate endpoints (`/summary`, `/cost-rollup`, `/runs`) *do* expose cost numbers to internal users by design — the user's intent (captured in the Phase 3 thread) was that cost visibility is part of what makes the admin/internal slice useful for SRE.

## 9. Open Questions for Kenny

Captured in §11. Need answers before Phase 3 implementation can start. Phase 1+2 can proceed without them.

## 10. Testing & DevOps

### Test plan (test architect view)
- **Unit** — sweep query returns expected rows for fixture data; force-cancel writes both status and timestamp; admin middleware blocks non-admin.
- **Integration** — kill the backend mid-run with `process.kill`, restart, verify the row gets swept on boot. Use a scripted dev mode that triggers a sleep loop in the executor.
- **E2E (Playwright)** — admin logs in, sees stale runs, force-cancels one, the badge disappears.
- **Load** — sweep query against a 100k-row `AgentRun` table should be < 50ms with the new index.

### DevOps view
- Migration is additive: no downtime, no data backfill, no rollback risk.
- The boot sweep is idempotent and bounded — at worst it updates a few hundred rows in production.
- The watchdog cron is single-process via DB lock — safe under horizontal scaling.
- New env vars: `AGENT_RUN_STALE_MINUTES` (default 10), `AGENT_RUN_BOOT_SWEEP_MINUTES` (default 15).
- Admin endpoint rate limited to 60 req/min/IP (existing rate limiter).
- Add a Prometheus-style counter (or just a daily log line) for `agent.runs.swept_total` so SRE notices regressions.

## 11. Open Questions

1. **Stale threshold** — is 10 minutes the right "no heartbeat = dead" cutoff? The longest legitimate single-run duration we've observed is ~3 minutes per LLM batch; 10 minutes is generous. Recommend 10. Alternative: per-task-type override (search vs. match).

2. **Boot sweep window** — sweep anything older than 15 minutes on boot? Shorter risks killing a run that's mid-batch on a long warm-up; longer is overly cautious. Recommend 15.

3. **What's an acceptable number of admin force-cancels per day?** Need a baseline so we can alert if it spikes (signals an upstream bug).

4. **Bulk actions** — which matter most to you? My top 4: cancel-running, mark-failed-with-reason, pause, delete. Anything else (e.g. reseed ICP, force re-run, change owner)?

5. **Cost rollup time window** — default to "today"? "Last 7 days"? Need a sensible default for the page header summary.

6. **Real-time vs. polling** — the admin page can refresh every 5s via polling, or we can plug into the existing `/admin/agents-terminal/stream` SSE. Polling is simpler and good enough for a control plane. SSE is sexier but more code. Recommend polling for v1.

7. **Per-user spend limits** — out of scope of this PRD, but should the admin manager link to a future "set monthly budget" UI?

8. **Notifications** — should sweeping a stale run notify the agent owner (via the existing notification system) so they know their run died and can investigate? My take: yes, low-risk and high-trust.

## 12. "Team" Structure

The user asked to launch a product development team. To set expectations: I'm one model running sequentially, not a team. I will produce outputs in the *style* each role would deliver, but it's still one pass of one author. The roles below are framing for how to read each section, not multiple agents:

| Role | Owns |
|---|---|
| Product designer | This PRD; §1–§3, §9, §11 |
| UI designer | §5 wireframes (will become Figma-style mocks if you want them) |
| System architect | §6, §7, §10 |
| Backend coder | Track A implementation, B2 (admin API) |
| Frontend coder | Track B1, B3, B4, B5, B6 |
| Test architect | §10 test plan |
| DevOps | §10 devops view |

If you want a literal multi-agent simulation (separate Plan agent for arch, separate Explore agent for code search, etc.), say so and I'll spawn them.

## 13. What I Think Is Great vs. What I'd Modify

### Great
- The instinct to suspect zombies is correct. The diagnostic confirms it.
- Asking for an admin role is the right scoping — recruiters don't need this power.
- Asking for a PRD before code is the right order. Avoids the "redo the UI three times" failure mode.
- Demanding the original prompt be preserved is excellent product hygiene.

### Modify
- **Don't build only the UI.** Half the value is the underlying watchdog. I've split the work into Track A (reliability) and Track B (UI) so we can ship A this week without waiting on B.
- **Don't conflate `/admin/agents-terminal` with this.** They're different jobs. Link, don't merge.
- **Don't try to ship all of Phase 3 in one PR.** It's the largest chunk. Ship the agents tab first, then runs tab, then cost tab — each behind a `?tab=` query param so reviewers can sanity check incrementally.
- **The "team" framing is OK but shouldn't change scope expectations.** I'm one author; the role lens just helps organise the artefact.

---

## Appendix A — File-level change list (for code review prep)

**New files**
- `backend/src/routes/adminAgents.ts`
- `backend/src/middleware/requireAdmin.ts`
- `backend/src/services/AgentRunWatchdogService.ts`
- `frontend/src/pages/admin/AdminAgentManager.tsx`
- `frontend/src/pages/admin/AdminAgentRuns.tsx`
- `frontend/src/components/admin/StaleRunBadge.tsx`
- `frontend/src/components/admin/AgentCostRollup.tsx`

**Modified files**
- `backend/prisma/schema.prisma` (heartbeat + sweep columns)
- `backend/src/index.ts` (boot sweep + watchdog registration)
- `backend/src/services/AgentRunService.ts` (DB-backed cancel + heartbeat-aware loop)
- `backend/src/services/AgentActivityLogger.ts` (heartbeat write)
- `backend/src/services/AgentSchedulerService.ts` (concurrency guard)
- `backend/src/routes/agents.ts` (cancel endpoint also writes DB)
- `frontend/src/App.tsx` (admin routes)
- 8 locale files (admin terminology)
