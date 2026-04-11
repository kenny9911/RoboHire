# Agents Scheduler

**Status**: Shipped · Phase 4 (2026-04-11)
**Owner**: Kenny
**Related**: [agents-redesign-spec.md](./agents-redesign-spec.md) · [agents-terminal.md](./agents-terminal.md)

---

## 1. Overview

`AgentSchedulerService` is the in-process scheduler that fires agents on a recurring cadence. It is built on [`node-cron`](https://www.npmjs.com/package/node-cron), runs inside the same Node process as the Express API, and requires no external broker. BullMQ + Redis remains the v2 upgrade path if and when RoboHire scales horizontally.

Spec-level design lives in §8.4 + §8.8 of [agents-redesign-spec.md](./agents-redesign-spec.md); this doc is a practical reference for operators and developers.

---

## 2. Cron expression format

The scheduler accepts standard 5-field cron expressions (as understood by `node-cron`):

```
┌──────── minute (0 - 59)
│ ┌────── hour (0 - 23)
│ │ ┌──── day of month (1 - 31)
│ │ │ ┌── month (1 - 12)
│ │ │ │ ┌ day of week (0 - 6, 0 = Sunday)
│ │ │ │ │
* * * * *
```

Timezone is **server local time** (the backend process's `TZ`). On Render we run in UTC, so `0 9 * * 1` means 09:00 UTC Monday. If a recruiter needs a local time, they pick "Custom cron" and build the expression themselves for now — a tz-aware UI helper is a v1.1 ask.

---

## 3. Presets

The create agent modal exposes a `ScheduleField` dropdown with five presets. Each preset translates to a canonical cron expression at submit time so the DB always stores a valid expression.

| Preset | UI label | Cron expression | Notes |
|---|---|---|---|
| `off` | Off | `null` (scheduleEnabled=false) | Default. Agent runs only on manual trigger. |
| `hourly` | Every hour | `0 * * * *` | Top of each hour. |
| `daily` | Every day at HH:MM | `M H * * *` | Time picker fills `H` and `M`. |
| `weekly` | Weekly on <day> at HH:MM | `M H * * D` | Day picker + time picker fill `D`, `H`, `M`. |
| `custom` | Custom cron expression | user-provided | Raw text input with live validation. |

`scheduleEnabled` is set to `true` for anything other than `off`. The resolved expression is written to `Agent.schedule`, and `Agent.nextRunAt` is computed client-side from the cron expression for display; the scheduler recomputes it on each fire.

---

## 4. Missed-run catch-up

Process restarts, deploys, and crashes can cause scheduled runs to be skipped. To keep the contract "if `scheduleEnabled=true`, the agent runs on its schedule", the scheduler catches up on boot:

1. `AgentSchedulerService.init()` loads all agents where `scheduleEnabled = true`.
2. For each agent, register its cron job (§5).
3. Additionally, if `nextRunAt != null AND nextRunAt < now()`, enqueue a **one-shot catch-up run**. The catch-up uses the same pathway as a live fire — creates an `AgentRun` with `triggeredBy='schedule'`, emits `run.queued` via `AgentActivityLogger`, and hands off to `AgentRunService.startAgentRun()`.
4. The catch-up's `run.queued` event payload includes `{ catchup: true, missedBy: <seconds> }` so the admin terminal and activity tab can visually distinguish it.

Only one catch-up is issued per agent per boot, regardless of how many firings were missed — we do not try to replay a week of hourly runs after a week-long outage.

---

## 5. Live registration

Schedule changes take effect immediately without restarting the server:

- `POST /api/v1/agents` → if the new agent has `scheduleEnabled=true`, `register(agent)` is called.
- `PATCH /api/v1/agents/:id` → `register(agent)` is called with the updated record; the method first unregisters any existing cron for that id (idempotent), then installs a new one. Flipping `scheduleEnabled` from `true → false` calls `unregister(id)` and nulls `nextRunAt`.
- `DELETE /api/v1/agents/:id` → `unregister(id)` is called before the DB delete.

`register` and `unregister` are keyed by `agentId`. The in-memory map holds the `node-cron` `ScheduledTask` handle so the scheduler can `.stop()` it on unregister.

---

## 6. DB-lock concurrency guard

node-cron is single-process, but the scheduler is designed so that a future multi-instance deploy behind a shared Postgres will not double-fire. Before dispatching a run, the scheduler performs a conditional update:

```sql
UPDATE "Agent"
SET "lastRunAt" = NOW()
WHERE "id" = $1
  AND ("lastRunAt" IS NULL OR "lastRunAt" < NOW() - INTERVAL '30 seconds')
```

Only the process whose UPDATE affected one row proceeds to create the `AgentRun`. Any other process sees `rowCount = 0` and silently skips. The 30-second window is larger than any reasonable clock skew between Render instances and small enough that a genuine back-to-back minute-cadence fire is never incorrectly squashed.

This is belt-and-suspenders for today (only one process runs the scheduler), but it means the day we enable a second instance we do not need to rip out anything.

---

## 7. Debugging tips

### 7.1 Manually trigger a scheduled agent run

From the admin terminal or via the API, `POST /api/v1/agents/:id/runs` creates an ad-hoc run with `triggeredBy='user'`. This is the same pathway the scheduler uses minus the cron dispatch, so it's the correct way to smoke-test an agent's source adapters and LLM calls without waiting for the next firing.

### 7.2 Inspect registered jobs

`AgentSchedulerService` exposes a dev-only helper `listRegistered()` that returns `{ agentId, cron, nextRunAt }` for every live registration. Call it from a REPL attached to the backend process, or add a temporary admin route if you need to inspect production. The authoritative list of what *should* be registered is the Prisma query `SELECT id, schedule FROM "Agent" WHERE "scheduleEnabled" = true`; any drift between that and `listRegistered()` means the in-memory map is stale (usually a sign the service was not restarted after a schema change).

### 7.3 Watch a fire in real time

Open `/product/admin/agents-terminal` and filter by `eventType: run.*`. When the scheduler fires, the sequence of events is `run.queued → run.started → (source.*.hit and llm.call.* interleaved) → run.completed`. If you see `run.queued` but no `run.started`, the DB-lock guard lost the race or `AgentRunService.startAgentRun()` threw before the run was picked up — check the error severity events in the same filter.

### 7.4 Verify catch-up after a restart

After `npm run dev:backend` or a production deploy, filter the admin terminal by `eventType: run.queued` and look for payloads with `catchup: true`. If you flipped an agent to `scheduleEnabled=true` with a past `nextRunAt` and don't see a catchup fire within a few seconds of boot, confirm that `init()` ran by checking backend logs for `AgentSchedulerService.init complete` — a misconfigured env or early crash can silently skip it.
