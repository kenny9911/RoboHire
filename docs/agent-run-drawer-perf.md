# Agent Run Drawer — Initial Load Performance Fix

## Problem

Opening the Agent workbench drawer took **minutes** to show candidate data. During that time the drawer rendered "No candidates in this view yet.", making it look like there was no data at all.

## Root Causes

1. **Massive payload per candidate in SSE replay.** The SSE stream at `GET /api/v1/agents/:id/runs/:runId/stream` replayed history by `include`-ing `resume.parsedData` on every candidate. `parsedData` is a 10–50KB JSON blob per resume. For a run with 50+ candidates that's multiple MB of serialized JSON.
2. **One SSE event per row.** Each historical activity and candidate was sent as its own `event: activity` / `event: candidate` write. Every event triggered a React `setState` with O(N) dedup, causing N re-renders on drawer open.
3. **No loading UI.** The drawer's empty state was indistinguishable from "still connecting", so users assumed the agent had produced no results.

## Fixes

### 1. Strip `parsedData` from SSE + bulk snapshot event

[backend/src/routes/agents.ts](../backend/src/routes/agents.ts) — SSE handler at `/:id/runs/:runId/stream`:

- Introduced a lightweight `resumeListSelect` that excludes `parsedData`. Used for both replay and the live `match.scored` candidate lookup.
- Replaced the per-row replay loop with a single `snapshot` SSE event containing `{ activities, candidates }` arrays.
- Parallelised the two replay queries via `Promise.all`.

### 2. Lazy candidate-details endpoint

New route `GET /api/v1/agents/:id/candidates/:candidateId/details` returns a single candidate including the full `resume.parsedData`. Called only when the recruiter enters the review view.

### 3. Snapshot handling in the stream hook

[frontend/src/hooks/useAgentRunStream.ts](../frontend/src/hooks/useAgentRunStream.ts) — new `snapshot` event listener that bulk-replaces `activities` and `candidates` with one `setState`. Eliminates the N re-renders that made drawer open feel laggy even after the network payload arrived.

### 4. Loading skeleton

[frontend/src/components/AgentRunDrawer.tsx](../frontend/src/components/AgentRunDrawer.tsx) — added `CandidateListSkeleton` (spinner + 3 shimmer cards). Shown when `streamStatus === 'connecting'` and no candidates have arrived yet, so the drawer visibly signals that data is loading.

New i18n key `agents.workbench.drawer.loadingResults` added to all 8 locales (en, zh, zh-TW, ja, es, fr, pt, de).

### 5. Lazy parsedData fetch in review view

[frontend/src/components/ReviewProfilesView.tsx](../frontend/src/components/ReviewProfilesView.tsx) — added a `parsedById` cache keyed by candidate id. When the current or next pending card lacks parsed data, fetches it via the new details endpoint. The `parsed` binding reads from the cache first, falling back to any inline `parsedData` on the candidate object.

Prefetching `index + 1` means that once the recruiter hits a card, the next one is already loading in the background, so keyboard-driven reviews stay smooth.

## Verification

- `npx tsc --noEmit` passes for both `backend/` and `frontend/`.
- Manual smoke test checklist:
  1. Open an agent with many existing candidates — drawer shows spinner + skeleton immediately, candidates appear in one batch shortly after.
  2. Switch between pending / liked / disliked / all filters — counts are correct.
  3. Enter review view — first card renders experience/education/skills after a ~100ms details fetch; subsequent cards render instantly thanks to prefetch.
  4. Start a new run — live `candidate` events still stream in without `parsedData` (review view lazy-loads as needed).

## Files Touched

| File | Change |
|---|---|
| [backend/src/routes/agents.ts](../backend/src/routes/agents.ts) | SSE snapshot event, slim resume select, new `/candidates/:id/details` endpoint |
| [frontend/src/hooks/useAgentRunStream.ts](../frontend/src/hooks/useAgentRunStream.ts) | `snapshot` event listener |
| [frontend/src/components/AgentRunDrawer.tsx](../frontend/src/components/AgentRunDrawer.tsx) | `CandidateListSkeleton`, connecting-state branch |
| [frontend/src/components/ReviewProfilesView.tsx](../frontend/src/components/ReviewProfilesView.tsx) | `parsedById` cache + on-demand details fetch |
| `frontend/src/i18n/locales/*/translation.json` | `loadingResults` key across 8 locales |
