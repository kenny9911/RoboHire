# Admin Agents Terminal

**Status**: Shipped · Phase 5 (2026-04-11)
**Owner**: Kenny
**Related**: [agents-redesign-spec.md](./agents-redesign-spec.md) · [agents-scheduler.md](./agents-scheduler.md)

---

## 1. Purpose

Unified operations console for admins to observe what every agent in the system is doing right now. It is the cross-agent counterpart to the per-run Activity tab: instead of following one run, an admin watches the entire bus of `AgentActivityLog` events as they are emitted across every agent, every user, every workspace.

Primary use cases:

- Debug a stuck run without knowing its agent id up front — the event flies by and the admin can pause and click through.
- Validate that a newly shipped source adapter or outreach channel is emitting the events it should.
- Observe cost and latency in real time while a large batch of scheduled runs fires overnight.
- Triage incidents ("why did every agent error at 02:14?") by filtering on severity + timestamp.

This doc is the design + reference for the `/product/admin/agents-terminal` route and its backing API. The spec-level contract lives in §7.8 of [agents-redesign-spec.md](./agents-redesign-spec.md).

---

## 2. Access control

Admin-only, enforced at **both** layers:

1. **API**: `GET /api/v1/admin/agents/terminal/stream` and `GET /api/v1/admin/agents/terminal/history` check `req.user.isAdmin === true` after the standard auth middleware. A non-admin session receives `403 Forbidden`. The check sits alongside the other `/admin/*` routes and uses the same guard helper.
2. **Route guard**: the frontend route `/product/admin/agents-terminal` is wrapped in `<ProtectedRoute adminOnly>`. A non-admin who navigates directly to the URL is bounced to `/product`. The sidebar link is hidden unless `user.isAdmin === true`.

Both checks are required — the API check is the source of truth, the route guard is a UX niceity so the link doesn't show up.

---

## 3. Event stream protocol

The terminal uses **Server-Sent Events (SSE)**, the same transport powering per-run result streaming, to avoid introducing a new transport. Two endpoints:

### 3.1 `GET /api/v1/admin/agents/terminal/history?limit=200`

One-shot backfill. Returns the most recent `N` `AgentActivityLog` rows across every agent, ordered newest-first (reversed client-side for chronological rendering). Each row is joined with `agent.name` and `run.id` for immediate display. Default `limit=200`, max `limit=1000`. Called once on connect to give the terminal context before the live stream catches up.

### 3.2 `GET /api/v1/admin/agents/terminal/stream`

Long-lived SSE connection subscribed to the global `AgentActivityLogger` bus. Every emitted event is serialized as one SSE message:

```
event: activity
data: {"id":"...","agentId":"...","agentName":"Sourcer A","runId":"...",
       "eventType":"llm.call.completed","severity":"info",
       "actor":"agent:cm...","payload":{"sequence":42,"model":"gpt-4o-mini",
       "promptTokens":1240,"completionTokens":180,"costUsd":0.0031,
       "latencyMs":820},"createdAt":"2026-04-11T02:14:09.221Z"}
```

**Heartbeat**: every 25 seconds the server writes an SSE comment line (`: heartbeat\n\n`) to keep idle proxies from closing the connection. The client treats missed heartbeats as a stream failure and auto-reconnects with exponential backoff (capped at 30s).

**Fan-out**: the logger keeps a per-connection subscriber list in memory. When `activityLogger.emit()` is called anywhere in the backend, the bus synchronously pushes to every admin subscriber. There is no message persistence beyond the normal `AgentActivityLog` DB row — reconnects rely on the history endpoint for backfill.

---

## 4. UI affordances

The terminal is a monospace full-height panel on `/product/admin/agents-terminal`. Layout top-down:

1. **Status bar** — connected/reconnecting indicator, event count, dropped-event count, pause indicator.
2. **Filter bar** — four filter inputs, all additive:
   - Event type: multi-select chip group (`run.*`, `source.*`, `match.*`, `llm.*`, `candidate.*`, `invite.*`, `email.*`, `im.*`, `error.*`).
   - Severity: `debug | info | warn | error`.
   - Agent: free-text contains-match on `agentName` or `agentId`.
   - Run: exact `runId`.
3. **Event list** — virtualized scrollable list, one row per event. Row format: `HH:mm:ss.SSS  <severity>  <agentName>  <eventType>  <message or payload summary>`.
4. **Detail drawer** — click a row to slide open a drawer showing the full `payload` JSON, pretty-printed.

Controls (buttons in the status bar):

- **Pause / Resume** — stops writing new events into the visible list while still receiving them from the server (buffered up to 5000, then FIFO-dropped with a counter bump).
- **Clear** — empties the visible list (does not close the stream).
- **Auto-scroll** — toggle; when on, the list sticks to the newest event; when off, the list stays where the admin scrolled.
- **Export JSONL** — downloads the current visible buffer as a `.jsonl` file for offline analysis.

---

## 5. Color coding

Severity first, then category overrides:

| Class | Color | Events |
|---|---|---|
| `error` | red (`text-rose-500`) | any `error.*`, any `severity = error` |
| `warn` | amber (`text-amber-500`) | any `severity = warn` |
| `info` | slate (`text-slate-300`) | default |
| `debug` | slate-400 (`text-slate-500`) | `severity = debug` |

Category overrides (applied after severity, so an `error` llm call stays red):

| Category | Color |
|---|---|
| `llm.*` | violet (`text-violet-400`) |
| `source.*.hit` | blue (`text-sky-400`) |
| `match.scored` | green (`text-emerald-400`) |

The terminal background is near-black (`bg-slate-950`) to match a real terminal and give color-coded text maximum contrast.

---

## 6. Keyboard shortcuts

Focus is on the event list by default. Shortcuts:

- **Space** — toggle Pause/Resume
- **C** — Clear visible list
- **/** — focus the filter text input (agent filter)
- **Esc** — close the detail drawer if open, otherwise unfocus the filter
- **J / K** — move selection down / up (hjkl-style, for muscle memory)
- **Enter** — open detail drawer for selected row

All shortcuts are disabled while a text input (filter) has focus, except `Esc`.

---

## 7. Implementation notes

- The stream subscriber is registered on `AgentActivityLogger` at connect time and removed on disconnect. No per-agent filtering happens server-side — the admin sees everything, client-side filters handle presentation. This keeps the server path a single hot-loop with O(1) fan-out.
- Per-connection buffer size is 5000 events. If the client pauses and the buffer overflows, the server keeps pushing but the client drops oldest with a counter; the status bar shows `dropped: N`.
- History endpoint reuses the existing `AgentActivityLog` indexes; the `createdAt` DESC scan is cheap for the default 200 rows.
- The route does **not** honor workspace scoping — admins see cross-workspace events on purpose. If a future deploy model requires per-workspace admin isolation, add a `workspaceId` filter server-side.
