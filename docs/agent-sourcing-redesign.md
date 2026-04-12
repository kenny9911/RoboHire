# Agent Sourcing Redesign — Calibration, Why-Matched, Mission Control

**Status**: Spec → Implementation
**Date**: 2026-04-12
**Owner**: Kenny
**Inspiration**: [juicebox-agent.super.site](https://juicebox-agent.super.site/) — clone the calibration loop, mission control feel, and rich per-profile review.

---

## 1. Goals

The current agent system already has the bones — workbench drawer, ReviewProfilesView, ICP regeneration, hard requirements — but it skips the hard parts of a Juicebox-style sourcing experience:

1. **No calibration gate** — agents go straight to autonomous sourcing on first run, before they've learned the recruiter's taste.
2. **No structured rejection feedback** — rejection is a one-click status flip with no "tell us why."
3. **No "why we matched" panel** — recruiters see a name + score but not the reasoning.
4. **No re-run that respects history** — re-running an agent re-shows already-seen profiles.
5. **AgentDetail.tsx is stale** — uses approved/rejected terminology while the rest of the system has moved to liked/disliked, no calibration progress, no easy access to review.

This redesign brings the system to parity with Juicebox while preserving all existing infrastructure (ICP service, activity logger, SSE streaming, hard requirements).

---

## 2. The Calibration Loop

### Rule (from product brief)

> The user must approve **3 consecutive profiles** that are good fits before the agent begins autonomous sourcing. Every rejection resets the counter and the agent surfaces **3 fresh profiles**.

### State machine

`Agent.calibrationState` is a new field with three values:

| State | Meaning | Agent runs autonomously? |
|---|---|---|
| `pending` | Agent created, no candidates surfaced yet | No |
| `calibrating` | At least one batch surfaced, recruiter is reviewing or has rejected | No |
| `calibrated` | 3 consecutive likes recorded | Yes |

Plus `Agent.consecutiveLikes` (Int, default 0) — current streak count, resets to 0 on any dislike.

### Transitions

```
[create]                        → pending
[first run completes]           → calibrating
[user likes a candidate]        → consecutiveLikes++
  if consecutiveLikes >= 3      → calibrated  (fire calibration.completed event)
[user dislikes a candidate]     → consecutiveLikes = 0, calibrationState = calibrating
                                  → trigger ICP regeneration (uses new dislike + reason)
                                  → trigger fresh batch of 3 candidates
                                  → exclude all previously-seen resumeIds
```

### What "calibrated" unlocks

Once `calibrated`:
- The agent can run on its `scheduled` cadence (cron) or be triggered as `event`-driven
- Manual runs no longer enforce the 3-card cap; they pull a normal batch (up to `config.maxResults`)
- The mission control header switches from "Calibrating: 2/3" to "Active · sourcing"

### Calibration batch endpoint

`POST /api/v1/agents/:id/calibration/next-batch` — request the next 3 fresh candidates. Server logic:
1. Reject if `calibrationState === 'calibrated'` (caller should use the regular runs endpoint)
2. Load all `AgentCandidate.resumeId` for this agent → exclusion set
3. Run a small `InstantSearchMatchService` invocation with `limit: 3` and the exclusion set
4. Persist the 3 new `AgentCandidate` rows under a fresh `AgentRun` tagged `triggeredBy: 'calibration'`
5. Return `{ runId, candidates }` for the frontend to render immediately

This endpoint is **also** what gets called automatically after a dislike, so the recruiter never has to wait or click.

---

## 3. Rejection Reason Capture

### Schema additions on `AgentCandidate`

| Field | Type | Purpose |
|---|---|---|
| `rejectionReason` | `String? @db.Text` | Free text from the recruiter |
| `rejectionTags`   | `String[]`         | Structured taxonomy chips (Postgres array) |

### Tag taxonomy (frontend + i18n)

- `wrong_industry`
- `wrong_location`
- `too_junior`
- `too_senior`
- `missing_key_skill`
- `wrong_background`
- `culture_mismatch`
- `other`

### UX

When user clicks **Reject** in `ReviewProfilesView`, open a modal:

```
┌─────────────────────────────────────────┐
│ Help Alex learn — why isn't this a fit? │
│                                         │
│ Pick all that apply:                    │
│ [Wrong industry] [Wrong location]       │
│ [Too junior]     [Too senior]           │
│ [Missing skill]  [Wrong background]     │
│ [Culture]        [Other]                │
│                                         │
│ Tell us more (the more detail, the      │
│ smarter the next batch):                │
│ ┌─────────────────────────────────────┐ │
│ │                                     │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│                                         │
│            [Cancel] [Skip Profile]      │
└─────────────────────────────────────────┘
```

- "Skip Profile" is the submit button — copy reinforces this is *training*, not destruction.
- At least one tag OR ≥10 chars of text required to submit.
- Server stores both, then triggers ICP regeneration synchronously (the fresh batch is more valuable than instant UI feedback — show a 1-2s spinner).

### Wiring rejection feedback into ICP

`IdealProfileService.generateForAgent` already loads `disliked` candidates. We extend it:
1. Pull `rejectionReason` and `rejectionTags` from each disliked record
2. Include them in the `IdealProfileInput.dislikedCandidates[]` payload as `userFeedback: { tags, reason }`
3. The `IdealCandidateProfileAgent` prompt is updated to weight these explicit signals heavily — they're ground truth, not inferred preferences

---

## 4. Run Again (Exclude Previously Seen)

### API change

`POST /api/v1/agents/:id/runs` accepts a new optional flag:

```json
{ "excludeSeen": true }   // default: true
```

When `excludeSeen` is true (and it almost always is — opt-out only for admin debug), `AgentRunService.startAgentRun` does:

1. Load all `AgentCandidate.resumeId` (and `externalProfileId` for external sources) for this agent
2. Pass that exclusion set into `InstantSearchMatchService` (and the external API search adapter)
3. Filter the resume pool **before** scoring, so token usage matches the actual fresh pool

### UI

A prominent **Run Again** button lives in the mission control header. It always uses `excludeSeen: true`. The legacy "Find more" button in the workbench drawer is unified to use the same flow.

Copy:
- Idle: **"Run again"**
- Running: **"Searching… {n} new profiles found"**
- After run, if 0 new profiles: a banner reads *"No new candidates to surface. The pool is exhausted — try widening criteria or adding more sources."*

### Edge case: pool exhaustion

If `excludeSeen` filters everything out, return `{ runId, exhausted: true }` and the frontend shows the banner above instead of starting a streaming run.

---

## 5. "Why We Matched This Profile"

### Data shape

A new structured field on `AgentCandidate` (or stored as parsed JSON inside the existing `metadata` column for backward compat — see migration note below):

```ts
type WhyMatched = {
  reasons: Array<{
    type: 'good' | 'potential' | 'concern';
    title: string;     // e.g. "Should have experience working as a maintenance technician"
    detail: string;    // e.g. "The candidate has 19 years experience in maintenance roles."
  }>;
  strengths: string[];     // bullet highlights
  areasToExplore: string[]; // soft gaps the recruiter should probe in interview
  skillMap: {
    matched: string[];
    missing: string[];
    extra: string[];
  };
  overallVerdict: string;  // 1-line LLM verdict
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
};
```

### How it gets populated

`InstantSearchMatchService` already calls `ResumeMatchAgent`, which produces `mustHaveAnalysis`, `transferableSkills`, `preferenceAlignment`, `candidatePotential`, `hardRequirementGaps`, `overallMatchScore`, `overallFit`. We extract these into the `WhyMatched` shape during the same loop that currently builds `highlights[]` and `gaps[]`. **No additional LLM calls.**

We store the full structured object as `metadata.whyMatched` (JSON) — no schema migration needed for this part.

### Backend exposure

`GET /api/v1/agents/:id/candidates/:candidateId/details` already returns the candidate with its resume. We extend it to also parse and return `whyMatched` at the top level for easy frontend consumption.

### UI (per Image #2 reference)

A new `WhyWeMatched` panel sits at the top of the per-candidate review page in `ReviewProfilesView`, **above** the Experience/Education/Skills tabs:

```
┌─────────────────────────────────────────────────┐
│  Why we matched this profile                    │
│                                                 │
│  ✅ Good Match                                  │
│  Should have experience working as a maintenance│
│  technician                                     │
│  → The candidate has 19 years experience…       │
│                                                 │
│  ⚡ Potential Fit                               │
│  Should have skills in both auto and HVAC       │
│  → Has automotive experience but not clear if   │
│    industrial HVAC is included.                 │
│                                                 │
│  ⚠️  Worth Exploring                            │
│  Education credentials are uncommon for the     │
│  region — verify in interview.                  │
└─────────────────────────────────────────────────┘
```

Type → color mapping:
- `good`     → green chip "Good Match"
- `potential` → amber chip "Potential Fit"
- `concern`  → orange chip "Worth Exploring"

The existing right-hand sidebar keeps the Approve / Reject buttons and the new "Profile 1/N" pager.

### Easy access from mission control

The mission control header gets a primary CTA: **"Review {n} pending profiles"** that opens the agent workbench drawer pre-routed to the review view. From there, recruiters page through profiles, see why each was matched, and approve or skip.

---

## 6. Mission Control Page

### Replaces

`frontend/src/pages/product/AgentDetail.tsx` — the existing page is functional but uses approved/rejected terminology and has no calibration awareness. We rebuild it as `MissionControl` (filename stays `AgentDetail.tsx` to avoid route changes; just rewrite the contents).

### Layout

```
[← Back to Agents]                                              [⋯ Edit] [⏸ Pause]

╔══════════════════════════════════════════════════════════════════════╗
║  ✨ AI Software Engineer                                              ║
║  ● Calibrating · 2 of 3 approvals needed                              ║
║  Sourcing for: Senior Backend Engineer · sf bay area                  ║
║                                                                       ║
║  ▓▓▓▓▓▓▓▓░░░░  2/3  →  [Review 1 pending profile]  [↻ Run again]     ║
╚══════════════════════════════════════════════════════════════════════╝

  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ Sourced  │ │   Liked  │ │  Skipped │ │ Contacted│
  │    24    │ │     2    │ │     5    │ │     0    │
  └──────────┘ └──────────┘ └──────────┘ └──────────┘

  ──────────  Latest Run  ──────────
  ▶ Run #3 · 2 mins ago · 12 candidates screened, 4 surfaced
    [Open run details →]

  ──────────  Activity  ──────────
  • You liked Sarah Chen
  • ICP regenerated to v4 (confidence 0.78)
  • You skipped Mark Johnson — "wrong industry"
  • Run #3 completed
  ...
```

Once `calibrated`, the calibration banner becomes:

```
║  ● Active · sourcing autonomously                                     ║
║  Last run 12 minutes ago · next run in 3h 48m                         ║
║                                                                       ║
║  [Review 4 pending profiles]  [↻ Run again]  [⚙ Edit criteria]       ║
```

### Status field unification

This rewrite migrates AgentDetail to use `liked` / `disliked` / `contacted` (matches the workbench drawer and IdealProfileService). Tab labels become **Pending · Liked · Skipped · Contacted · All**.

---

## 7. Migration & Rollout

### Schema migration

```prisma
model Agent {
  // … existing fields …
  calibrationState        String    @default("pending") // pending | calibrating | calibrated
  consecutiveLikes        Int       @default(0)
  calibrationCompletedAt  DateTime?
}

model AgentCandidate {
  // … existing fields …
  rejectionReason  String?  @db.Text
  rejectionTags    String[] @default([])
}
```

`whyMatched` is stored inside the existing `metadata` JSON column — no new column, no migration risk.

Existing agents with candidates already in `liked`/`disliked` states get `calibrationState = 'calibrated'` via the migration script (any agent with `totalApproved >= 3` is grandfathered in). Agents with no liked candidates default to `pending`.

### Backwards compatibility

- The old `approved` / `rejected` candidate statuses are still accepted by the PATCH endpoint and silently mapped to `liked` / `disliked` for one release. The frontend stops sending the old values immediately.
- The legacy `find more` button keeps working — it now routes through the same `excludeSeen: true` codepath.

### Rollout order

1. Schema push (additive only — no destructive changes)
2. Backend calibration logic + run-again exclude-seen + whyMatched population
3. Frontend rejection modal + why-matched panel + mission control rewrite
4. i18n keys for all 8 locales
5. Smoke test: create agent → first run → like 3 → calibrated → run again → no duplicates

---

## 8. Open Questions

1. **External-API sourcing exclusion** — for non-internal sources (LinkedIn, etc), do we dedupe by `externalProfileId` or by name+headline? Current scope: just dedupe by `resumeId`; external dedupe is a follow-up.
2. **Calibration timeout** — should agents be auto-paused if calibration stalls for >7 days? Not in v1; we'll watch and add if needed.
3. **Bulk skip** — Juicebox allows "skip all" with a single reason. Out of scope for v1.

---

## 9. Done When

- [ ] User can create an agent and is required to approve 3 consecutive profiles before it goes autonomous
- [ ] Rejecting a profile opens a "tell us why" modal with tags + free text, both required (one of)
- [ ] After a rejection, the agent automatically surfaces 3 new profiles, excluding all prior
- [ ] "Run Again" button on mission control re-runs while excluding previously-seen candidates
- [ ] Each candidate in review shows a "Why we matched this profile" panel with reasons / strengths / concerns
- [ ] Mission control shows calibration progress, latest run summary, and easy access to review
- [ ] AgentDetail uses consistent liked/disliked/contacted terminology
- [ ] All new UI strings exist in 8 locales
