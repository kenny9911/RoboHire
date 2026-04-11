# Ideal Candidate Profile (ICP) & Hard Requirements — Product Spec

**Status**: Draft v1 · Product spec, pre-implementation
**Owner**: Kenny
**Last updated**: 2026-04-12
**Related**: [agents-redesign-spec.md](./agents-redesign-spec.md) · [agents-changelog.md](./agents-changelog.md) · [agents-redesign-prompts.md](./agents-redesign-prompts.md)

---

## 0. Context

The Agents Workbench shipped Phases 0–5 on 2026-04-11. Agents can source candidates from three adapters, score them through `ResumeMatchAgent`, stream results into a triage lane, and let the recruiter Like / Dislike each row. What is missing: **nothing the recruiter does during triage feeds back into the next run.** The agent does not get smarter. It re-runs the same prompt against the same criteria and surfaces roughly the same shortlist. "Run Again" and "Find More" today are glorified pagination.

This spec defines two tightly coupled additions that close that loop:

1. **Ideal Candidate Profile (ICP)** — an LLM-generated, versioned, structured representation of the recruiter's evolving taste, rebuilt from Like / Dislike signals after every triage batch. Future runs are conditioned on the ICP, not just the original criteria.
2. **Hard requirements (硬性条件)** — strict boolean filters declared per agent, per job, or per run, that exclude candidates **before** they ever reach the LLM. They are non-negotiable, auditable, and enforced at the data layer.

The two features are designed together because they play complementary roles: hard requirements define what a candidate **must** be; the ICP defines what the recruiter **wants** them to be. Confusing the two is the single largest source of wasted LLM spend in recruitment software today.

---

## 1. Vision

Today's Agents Workbench is a keyword-and-LLM matcher that forgets everything between runs. Tomorrow's Agents Workbench is a **learning system that internalizes the recruiter's taste with every triage decision**. The recruiter's role shifts from writing increasingly elaborate search criteria to *judging candidates the agent brings back*; the agent, in turn, converts those judgments into a structured profile it carries into every subsequent run, every new source, and every related job. After a week of use, the recruiter should feel the agent "knows what I'm looking for" without ever having to rewrite the prompt. After a month, the ICP should be a durable asset that survives job rotation, can be forked to new reqs, and can be audited like a contract.

The north star metric is simple: **does the like rate on run N+1 exceed run N?** If yes, the agent is learning. If no, the ICP engine is broken.

---

## 2. The learning loop

This is the most important section of the spec. Everything else is plumbing.

### 2.1 Diagram

```
                          ┌─────────────────────────────┐
                          │   Run 1 (cold start)        │
                          │   criteria + 硬性条件 only   │
                          └──────────────┬──────────────┘
                                         │
                                         ▼
                          ┌─────────────────────────────┐
                          │   20 candidates surfaced    │
                          └──────────────┬──────────────┘
                                         │
                                         ▼
                          ┌─────────────────────────────┐
                          │   Triage                    │
                          │   Like: 4                   │
                          │   Dislike: 11               │
                          │   Skipped: 5                │
                          └──────────────┬──────────────┘
                                         │
                       ┌─────────────────┴─────────────────┐
                       ▼                                   ▼
         ┌──────────────────────────┐       ┌──────────────────────────┐
         │ ICPGeneratorAgent        │       │ AgentActivityLog         │
         │ input: criteria + likes  │       │ records triage deltas    │
         │ + dislikes + prior ICP   │       │                          │
         │ output: ICP v2 (JSON)    │       │                          │
         │ + rationale + confidence │       │                          │
         └─────────────┬────────────┘       └──────────────────────────┘
                       │
                       ▼
         ┌──────────────────────────┐
         │ ICP v2 persisted          │
         │ (old v1 kept as history) │
         └─────────────┬────────────┘
                       │
                       ▼
         ┌──────────────────────────┐
         │ Run 2: Run Again / More  │
         │ criteria + 硬性条件       │
         │ + ICP v2 + excludeIds    │
         │ (already surfaced)       │
         └─────────────┬────────────┘
                       │
                       ▼
         ┌──────────────────────────┐
         │ 20 new candidates        │
         │ scored *against ICP*     │
         │ like rate trends up →    │
         └─────────────┬────────────┘
                       │
                       ▼
                    (repeat)
```

### 2.2 Why each step reinforces the next

- **Triage → ICP regen**: every Like is a positive exemplar, every Dislike is a negative exemplar, and every *skip* (viewed but neither liked nor disliked) is a low-confidence neutral. The ICPGeneratorAgent is prompted to extract the *latent dimensions* the recruiter is reacting to — stage of company, domain keywords, seniority flavor, career trajectory shape — not just surface keywords.
- **ICP regen → next run**: the ICP is injected into both the **sourcing query** (for sources that accept structured filters, e.g. `internal_minio`) and the **scoring prompt** (for `ResumeMatchAgent`). The scoring prompt gets three inputs: the original criteria (what the recruiter asked for), the ICP (what the recruiter has actually liked), and the candidate resume. The LLM is told to resolve conflicts by weighting the ICP more heavily once it has ≥5 liked anchors.
- **Better matches → tighter triage**: with a higher density of good candidates, the recruiter triages faster and with stronger discrimination. Small signal differences become legible ("both of these are solid, but I prefer the one with startup experience") and the ICP captures those nuances on the next regen.
- **Tighter triage → even better ICP**: confidence grows. Once confidence crosses a threshold, the ICP is allowed to *override* parts of the original criteria (e.g. recruiter wrote "5+ years" but consistently likes 3-year candidates with strong trajectory — the ICP surfaces this contradiction and asks the recruiter whether to relax the rule).

### 2.3 Cold-start problem

**Run 1 has no likes**, so there is no ICP. Three mitigations:

1. **Seed ICP from the job**: when an agent is created, the backend runs a one-shot `ICPSeedAgent` over the Job description + the recruiter's `searchCriteria` + `instructions` to produce an *inferred* ICP v0 with `confidence: 0.2`. This is explicitly labeled "inferred from job description" in the UI.
2. **Seed ICP from prior agents on similar jobs**: if the recruiter has an existing agent on a job with ≥70% title similarity, offer to clone its latest ICP as v0 with a "borrowed from [agent name]" badge.
3. **No seed, pure criteria**: the recruiter can opt out. Run 1 uses plain criteria only. ICP v1 is generated after the first triage batch.

The UI never *hides* the cold-start state — it shows "ICP will be generated after you like or dislike your first candidates" so the recruiter knows the loop is live.

### 2.4 Saturation point

The ICP stops improving when:

- **Stable confidence**: three consecutive regens produce <5% drift in the structured fields (measured by JSON diff on `mustHave`, `niceToHave`, `avoid`, `anchors`). The UI tags the ICP as `stable` and the regen button reads "Re-learn (ICP stable)".
- **Diminishing like-rate delta**: the rolling like-rate over the last 3 runs is within ±3 percentage points. The system stops auto-regenerating and only regens on explicit user request.
- **User says stop**: a `pin` action on the ICP freezes it at the current version. Future runs still use it but the regen pipeline is skipped. Unpin to resume learning.

Saturation is a **feature, not a bug**. It is the signal that the agent has converged on the recruiter's taste for this specific req. The recruiter can then move on; the pinned ICP becomes a reusable template for the next similar req.

---

## 3. Personas & user stories

### 3.1 Personas

**Recruiter Sara — Backend engineering lead at a Series B startup.**
Needs to hire 10 backend engineers in Q2 2026. Writes criteria like "senior backend, distributed systems, not too corporate". Has a strong unspoken rule: rejects every resume that looks like it came from an agency (excessive buzzwords, suspiciously rounded years, no open-source). Can't articulate this rule in the criteria box but knows it on sight.

**Recruiter Wei — In-house TA at a Beijing-based fintech.**
Only hires candidates who speak Mandarin natively *and* are physically in Beijing (relocation not sponsored). Hard rules, no exceptions. Keeps getting bilingual candidates from Shanghai because the current criteria box is treated as a soft preference by the LLM.

**Admin Alex — Platform admin / head of RevOps.**
Oversees 40 recruiters across the company. Gets asked in QBR "how is the AI actually helping?" and needs to show ICP evolution, like-rate trends, and which agents have stable vs. drifting ICPs. Also needs a kill switch if an ICP starts learning the wrong thing.

### 3.2 User stories

1. **As Sara**, I want to Like or Dislike each candidate the agent brings back, so that the next run surfaces more candidates like the ones I liked and fewer like the ones I rejected — without me having to explain why in writing.
2. **As Sara**, I want to see the ICP the agent built from my feedback in plain language, so that I can sanity-check what it thinks I want before the next run fires.
3. **As Sara**, I want to click "Run Again" / "Find More" and know the agent will skip the candidates it already showed me, so I am never asked to re-triage the same person twice.
4. **As Wei**, I want to declare hard requirements (硬性条件) like `location = 北京` and `native_language contains 中文` that *exclude* candidates before they are scored, so that my LLM budget is not spent on candidates I can never hire.
5. **As Wei**, I want the hard-requirements editor to live in three places — job Criteria, the agent creation modal, and the agent edit drawer — and stay in sync, so that I configure once and apply everywhere.
6. **As Wei**, I want a warning ("this rule will exclude ~92% of current pool") before I save a hard requirement that is too aggressive, so I don't accidentally empty the funnel.
7. **As Sara**, I want to pin an ICP version I like, so that subsequent runs use that exact profile until I explicitly unpin — useful when I'm handing the agent off to a teammate.
8. **As Alex**, I want an audit trail of every ICP version per agent, including who triggered the regen, what likes/dislikes fed into it, and what changed, so that I can explain to my CHRO exactly what the AI learned and when.
9. **As Alex**, I want to see a "like rate over time" chart per agent in the admin dashboard, so that I can identify which agents are genuinely learning and which are stuck.
10. **As Sara**, I want the agent to flag when my likes contradict my criteria (e.g. I wrote "5+ years" but liked three candidates with 3 years), so that I can update the criteria consciously rather than drift.

---

## 4. Concept definitions

### 4.1 Ideal Candidate Profile (ICP)

The **Ideal Candidate Profile** is a versioned, LLM-generated JSON document that describes the *kind of candidate the recruiter is actually trying to hire*, as inferred from (a) the recruiter's stated criteria and job description, and (b) the observed Like / Dislike / skip signals on previously surfaced candidates. It is structured, not free text — it has named fields the scoring agent can reason about mechanically (`mustHave`, `niceToHave`, `avoid`, `anchors`, `latentDimensions`, `confidence`) — but it is generated and updated by an LLM, not handwritten. Every regeneration creates a new version; the old version is kept for audit. The ICP is *not* a hard filter and *not* a search query on its own: it is a **scoring conditioner** injected into the match prompt and, where supported, a **soft ranker** applied to source queries.

### 4.2 Hard requirements (硬性条件)

**Hard requirements** are strict boolean filters declared on an agent (or inherited from its Job or the recruiter's global defaults) that **exclude candidates from the pool entirely** before any LLM call is made. They are explicit, non-negotiable, and auditable: if a candidate fails a hard requirement, they are never scored, never shown, and their exclusion is logged in `AgentActivityLog` with the rule that rejected them. Hard requirements are the recruiter's way of saying "do not waste a single token on anyone who is not $X". They are enforced at the data layer — SQL `WHERE` clauses where possible, post-fetch JS filters where the underlying field is JSON — *never* in the LLM prompt.

### 4.3 Soft criteria (existing)

**Soft criteria** are the free-text `searchCriteria` and `instructions` fields the recruiter already writes today on agent creation. They are interpreted by the LLM as *weighted preferences*: they influence the match score but do not exclude. A candidate can fail every soft criterion and still be shown if their overall score is high enough. Soft criteria remain the primary input on Run 1; by Run 3+ the ICP will typically dominate.

### 4.4 Anchors

**Anchors** are specific liked candidates — referenced by ID and summarized by the LLM in the ICP — that the scoring prompt cites as exemplars: *"look for candidates similar in shape to Anchor A (senior backend, ex-startup CTO) and Anchor B (infra specialist, deep Kubernetes) — not Anchor C (staff at a FAANG, too corporate for this team)."* Anchors are the bridge between unstructured recruiter taste and structured scoring. The ICPGeneratorAgent selects up to 5 positive anchors and up to 3 "anti-anchors" from the user's triage history, chosen for *diversity* (not just the top-scoring likes) so the agent learns the full shape of the taste, not just one axis.

### 4.5 Relationship

```
┌─────────────────────────────────────────────────────────────┐
│                        Candidate Pool                       │
└──────────────────────────┬──────────────────────────────────┘
                           │ 硬性条件 (hard requirements)
                           │ SQL / JS pre-filter — EXCLUDE
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Eligible Candidates                       │
└──────────────────────────┬──────────────────────────────────┘
                           │ LLM scoring using:
                           │   • soft criteria (what user said)
                           │   • ICP (what user has liked)
                           │   • anchors (specific exemplars)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                       Ranked Results                        │
└─────────────────────────────────────────────────────────────┘
```

Hard requirements narrow the pool; soft criteria + ICP + anchors rank what remains.

---

## 5. Hard requirements semantics

### 5.1 Supported field types

| Field type | Example fields | Supported operators |
|---|---|---|
| **Numeric** | `experienceYears`, `currentSalary`, `expectedSalary`, `age` (where legal) | `gte`, `lte`, `gt`, `lt`, `eq`, `between` |
| **Enum / string** | `location.city`, `location.country`, `educationLevel`, `employmentStatus` | `eq`, `neq`, `in`, `notIn` |
| **Array of strings** | `skills`, `languages`, `certifications`, `industries` | `containsAll`, `containsAny`, `containsNone` |
| **Boolean** | `willingToRelocate`, `visaSponsorshipRequired`, `remoteOnly` | `eq` (`true` / `false`) |
| **Regex** (advanced) | Raw resume text, job titles | `matches`, `notMatches` — admin-flag-gated |
| **Date** | `availableFrom`, `lastActiveAt` | `before`, `after`, `withinDays` |

### 5.2 Rule shape (conceptual, not schema)

A hard requirement is a list of `{field, operator, value, missingPolicy}` tuples, joined by AND (the common case). OR groups are supported via nested arrays for v1. Every rule has a human-readable `label` the UI renders in the audit log.

### 5.3 Missing-data policy (critical)

What happens when a candidate's resume does not contain the field a hard requirement references? This is the number-one ambiguity in boolean filters on messy recruitment data.

Three modes, per rule:

1. **`fail`** (strict, default): missing data = candidate fails the rule and is excluded. Safest for legal / compliance rules (work authorization, native language).
2. **`skip`** (permissive): missing data = rule is ignored for this candidate. Good for optional fields like `certifications` where absence does not mean the candidate lacks them — their resume may just be incomplete.
3. **`ask_llm`** (smart, v1.1): missing data = a cheap one-shot LLM call is made to try to infer the field from the full resume text before re-evaluating the rule. Useful for fields that are present in free-text but not structured (e.g. `willingToRelocate`). Has a budget cap per run to avoid runaway cost.

The editor UI forces the recruiter to pick a mode per rule at creation time. Default is `fail` for enums/booleans, `skip` for arrays/regex.

### 5.4 Performance: where filters run

| Filter | Layer | Rationale |
|---|---|---|
| Numeric on indexed columns (`experienceYears`, `expectedSalary`) | SQL `WHERE` | Indexed, cheap, runs on millions of rows |
| Location on indexed `location.city` / `location.country` | SQL `WHERE` | Indexed in Phase 0 schema |
| `skills` array (JSON) — `containsAny` | SQL JSONB operator (Postgres `?|`) | Postgres native, fast |
| `skills` array — `containsAll` | SQL JSONB `@>` | Native |
| Free-text regex | Post-fetch JS | Regex on GIN indexes is possible but not worth the complexity in v1 |
| `ask_llm` resolution | Post-filter LLM call | Runs only after cheap filters narrow the pool |

The order is strict: SQL filters first (reduce pool to ~thousands), JS filters second (reduce to ~hundreds), LLM-assisted rules last (reduce to ~tens). The activity log captures the drop count at each stage so the recruiter can see "硬性条件 excluded 847 candidates · 4 rules applied".

### 5.5 Inheritance & overrides

Hard requirements can be declared at three scopes, merged with this precedence (lowest → highest):

1. **Job-level** — attached to the Job in the Criteria editor. Applies to every agent on that job.
2. **Agent-level** — declared in the agent creation / edit modal. Extends or overrides job-level rules.
3. **Run-level** — ad-hoc rules added in the "Run Again" dialog for a single run. Not persisted to the agent.

Conflicts are resolved by **intersection** (more restrictive wins), with an explicit UI warning when an agent-level rule contradicts a job-level rule ("this rule is stricter than the job's rule — continue?").

---

## 6. ICP lifecycle

### 6.1 Generation triggers

- **User-triggered**: explicit "Regenerate ICP" button in the ICP panel. Always allowed.
- **Auto-suggest after N likes**: after the recruiter logs ≥5 likes *since the last regeneration*, a toast appears: "You've liked 5 more candidates — regenerate ICP?" One click to accept, dismissable. Threshold is configurable per workspace; default 5.
- **After each run completes**: if `autoRegen` is enabled on the agent (default off in v1), the ICP is regenerated automatically at run end.
- **Scheduled**: v1.1 only — not in v1.

### 6.2 Versioning

Every regen creates a new **`IcpVersion`** row. The previous version is never deleted. Each version stores:

- The JSON ICP document
- The rationale the LLM provided ("I noticed you consistently liked candidates with startup experience and disliked corporate backgrounds...")
- The set of candidate IDs (likes, dislikes, skips) that were in the input window
- `createdBy` (user or system)
- `createdAt`
- `confidence` (see 6.4)
- `parentVersionId` (for the diff UI)

The agent's `currentIcpVersionId` points to the active version. The user can roll back to any prior version.

### 6.3 Confidence score

Confidence is a number in [0, 1] computed at generation time as a function of:

- **Signal volume** — `min(1, (likes + dislikes) / 20)`. Raw amount of feedback.
- **Agreement** — how internally consistent the likes are (measured by the LLM during generation and returned as a self-report `internalCoherence: 0–1`).
- **Contradiction penalty** — if likes and dislikes both match a candidate template, subtract 0.2.
- **Job match** — cosine similarity between the ICP's extracted attributes and the Job description's extracted attributes (smaller penalty if they diverge — the recruiter may be discovering the job is mis-specified).

The final score is clamped and shown in the UI as Low / Medium / High with a tooltip explaining the inputs. Not a magic number for the user to optimize — a guardrail for the scoring agent.

### 6.4 When the ICP is "ready" to drive runs

- **Always usable**: the ICP is always injected into the scoring prompt if one exists, regardless of confidence. The prompt tells the LLM how much to weight it, based on confidence.
  - Confidence < 0.3 → treat as "light hint"
  - Confidence 0.3–0.6 → treat as "strong hint"
  - Confidence ≥ 0.6 → "primary scoring input, may override parts of the original criteria"
- **Never blocks**: a run with no ICP (e.g. freshly created agent on Run 1) just uses the cold-start path (§2.3). The feature never prevents a run.

### 6.5 Regen inputs & window

The ICPGeneratorAgent receives:

- Original job description (truncated to 2k tokens)
- Original recruiter-written criteria and instructions
- **All** likes from this agent's history (capped at 30 most recent)
- **All** dislikes from this agent's history (capped at 30 most recent)
- A sample of skips (viewed but no action — capped at 10)
- The prior ICP JSON (if any)

It outputs: new ICP JSON + rationale + confidence + list of anchors it chose. Temperature is `0.1` for consistency; this is a structured-reasoning task, not a creative one.

---

## 7. Exclusion semantics for "Run Again" / "More"

Every candidate an agent has ever surfaced is recorded in `AgentCandidate` with `(agentId, sourceCandidateId)` uniqueness. When the user clicks **Run Again** or **Find More**:

1. The backend queries `AgentCandidate` for all prior `sourceCandidateId`s scoped to this agent.
2. The set is passed as `excludeIds` to each source adapter (`instant_search`, `internal_minio`, `external_api`). Source adapters are responsible for honoring the exclude list at query time (SQL `NOT IN`, vector search filter, API parameter).
3. If a source cannot filter on its side (some external APIs), the backend filters post-fetch and logs the waste in `AgentActivityLog` so admins can catch expensive adapters.
4. The UI distinguishes "Run Again" (re-score the same pool with the new ICP, *do not* exclude) from "Find More" (*do* exclude previously seen). Two different buttons, two different intents.

"Run Again" is useful after an ICP regen: the recruiter wants to see how the old pool re-ranks under the new taste. "Find More" is useful for expanding the funnel.

---

## 8. Edge cases & failure modes

### 8.1 All candidates rejected, zero likes

The ICPGeneratorAgent must still produce something useful. It falls back to generating an **anti-profile**: a structured description of what the recruiter does *not* want, extracted from the dislikes. The main `mustHave` / `niceToHave` fields stay empty (or inherit from the cold-start seed), but `avoid` is rich. Confidence is capped at 0.4 until at least one like exists. UI labels the ICP "Anti-profile — no positive signal yet" to make the asymmetry obvious.

### 8.2 Conflicting feedback

Recruiter likes Candidate A (senior, ex-Google) and dislikes Candidate B (senior, ex-Google, very similar profile on paper). The LLM is prompted to identify the *differentiating* feature — maybe A has open-source commits and B doesn't. If it cannot find one, it flags the conflict: `{conflicts: [{likedId, dislikedId, reason: "indistinguishable on available data"}]}`. The UI surfaces conflicts in the ICP panel with a "review these" prompt. Contradiction lowers confidence.

### 8.3 Low confidence ICP

If confidence is below 0.2 after regeneration, the scoring prompt is instructed to **ignore** the ICP and fall back to plain criteria. This prevents bad early signal from poisoning the pool. The recruiter sees a badge "ICP confidence too low — using criteria only".

### 8.4 Hard requirements filter out the entire pool

Before saving a new hard requirement, the editor runs a **dry-run count** against the current candidate pool for this agent's sources and shows: "This rule will exclude 94% of candidates (1,238 / 1,320). Continue?" If the post-rule pool size is below 10, the save button is disabled with a hard warning. Recruiters can override by checking "I understand this will return few or no candidates".

### 8.5 Schema drift — ICP references fields that don't exist

The LLM might hallucinate fields like `hasKubernetesCertification` that are not consistently populated in the candidate schema. The ICPGeneratorAgent is constrained to a **whitelist** of known fields (published as part of the prompt) plus a `freeText` field for anything outside the whitelist. Free-text hints are used by the scoring prompt but never by hard requirements (which require structured fields). A validator rejects ICP outputs that reference fields outside the whitelist and forces one retry before falling back to the previous version.

### 8.6 Race: ICP regen while a run is in flight

Runs are pinned to a specific `icpVersionId` at start time. A regen during an active run does not affect that run — it takes effect on the next one. The UI shows "using ICP v3 · v4 available after run completes".

### 8.7 Feedback poisoning (adversarial / careless user)

A user who rapid-fires Like on everything destroys the signal. Guardrail: if the like rate on a triage batch exceeds 90% *and* the dislike rate is below 5%, the ICPGeneratorAgent is told to treat the batch as low-information and its influence on the next ICP is down-weighted. Logged but not blocked.

### 8.8 Deleted candidates

If a liked candidate is later deleted or anonymized (GDPR, compliance), the ICP's anchor referencing them is either replaced by the next-best like or, if none, flagged in the version history as "anchor lost". ICPs are not silently mutated — a new version is cut.

---

## 9. Prompt optimization directions

Not the prompt itself — that's an implementation concern — but the directions the prompt engineering should move:

1. **Structure over prose**: the scoring prompt should receive ICP as JSON + a short paragraph, not a long paragraph. LLMs reason better over structured data.
2. **Anchors by ID + summary**: the prompt should name each anchor by ID and include a 1-sentence summary, so the LLM can reference them explicitly in the reasoning output ("similar to anchor A"). This makes the reasoning auditable.
3. **Explicit conflict resolution rules**: the scoring prompt must explicitly tell the LLM how to break ties between criteria and ICP at different confidence levels (see 6.4).
4. **Hard requirements are not in the prompt**: they are pre-filters. The prompt should not even know about them. This reduces prompt length and prevents the LLM from "softening" a hard rule by accident.
5. **Language**: the prompt for `ICPGeneratorAgent` should output in the same language as the recruiter's criteria (detected via `LanguageService`), so Mandarin recruiters see Mandarin rationale. The structured JSON keys stay in English for consistency.
6. **Temperature**: `0.1` for `ICPGeneratorAgent`. `0.1` for the ICP-conditioned `ResumeMatchAgent`. Creative work happens elsewhere.

---

## 10. Success metrics

The feature is working if and only if the numbers move. Tracked per-agent, aggregated per-workspace.

| Metric | Target | Why it matters |
|---|---|---|
| **Like rate delta (Run N vs Run N+1)** | +5pp average after 3 runs | Direct measure of "agent is learning" |
| **Time-to-first-like on cold start** | <60 seconds | Feature is worthless if the recruiter bounces before the loop starts |
| **ICP stability (regens until stable)** | ≤6 regens | Convergence speed; too many = taste is too noisy or prompt is weak |
| **Hard-requirement exclusion rate** | Report-only, no target | Just surface it so admins can see wasted LLM spend avoided |
| **LLM cost per hire (USD / accepted candidate)** | -30% vs pre-ICP baseline | The economic justification for the whole feature |
| **Run-to-hire funnel conversion** | +20% (liked → interviewed → hired) | Downstream impact — the real goal |
| **ICP pin rate** | ≥40% of agents pin an ICP by run 10 | Recruiters only pin what they trust |
| **Rollback rate** | <5% of regens | High rollback = regen is making things worse |

Metrics are exposed in the admin dashboard and per-agent in the Runs tab.

---

## 11. Out of scope (v1)

Explicitly deferred to v1.1 or later:

1. **Cross-agent ICP sharing** — recruiter A's ICP being used on recruiter B's agent. Raises privacy and team-scope questions that are not worth blocking v1 on.
2. **ICP A/B testing** — running two ICPs in parallel on the same pool to compare like rates. Interesting but premature before we know the base feature works.
3. **Negative ICPs as standalone filters** — using the `avoid` field as a hard filter rather than a scoring signal. Blurs the line between ICP and hard requirements; keep them separate.
4. **Auto-deployed ICPs without user review** — the system *never* silently swaps the active ICP without showing the recruiter at least a toast with "ICP updated · view changes".
5. **ICP templates / marketplace** — publishing ICPs as reusable templates across the workspace or RoboHire-wide.
6. **Cross-job ICP inheritance** — automatically cloning an ICP from a similar closed job to a new open job (manual clone at job creation is in scope; automatic is not).
7. **ICP-aware outreach templates** — personalizing email / IM outreach copy based on the ICP. Nice, but that's Phase 7 / 8 work.
8. **Multi-modal ICP** — learning from video interview signals, not just resume triage. Out of scope until we have enough interview data per agent.
9. **`ask_llm` missing-data resolution** — deferred to v1.1 as noted in §5.3. V1 ships with `fail` and `skip` only.
10. **Custom regex hard requirements** — admin-flag-gated, off by default in v1 for non-admin recruiters.

---

## 12. Open questions for Kenny

These need a decision before the architect agent starts Phase 6:

1. **Auto-regen cadence**: should the ICP regenerate *automatically* after every run by default, or only after an explicit button click / toast confirmation? Auto is faster but riskier; manual is safer but adds friction. **Recommendation**: manual with a toast after ≥5 new likes. Confirm?
2. **Minimum likes before ICP influences scoring**: is there a floor (e.g. 3 likes) below which the ICP is generated but *not* injected into the scoring prompt, or does every ICP influence scoring regardless of confidence? **Recommendation**: always inject, weight by confidence tier (§6.4). Confirm?
3. **Hard-requirement scope**: should job-level hard requirements be authored in the existing Job Criteria editor and *inherited* by every agent, or authored only on agents and optionally copied to the Job? **Recommendation**: both authorable, job-level inherited with override. Confirm?
4. **Native-language / location rules and legal exposure**: some hard requirements (age, nationality, gender) are illegal to filter on in EU/US jurisdictions. Do we ship with a **prohibited-fields list** enforced server-side, or leave it as recruiter responsibility? **Recommendation**: server-side blocklist of fields, with per-country overrides driven by `workspace.jurisdiction`. Needs legal review.
5. **Like / Dislike weighting**: should a Like count the same as a Dislike in ICP generation, or should we weight dislikes more heavily (since recruiters are often more certain about rejection than acceptance)? **Recommendation**: equal weight in v1, revisit after 1000 agent-runs of data. Confirm?
6. **ICP visibility to team members**: on a teamView-enabled workspace, can a teammate see the ICP on an agent they don't own? Read-only? Hidden entirely? **Recommendation**: read-only view + rationale, no edit, no regen trigger. Confirm?
7. **What happens to existing agents at migration time**: when this feature ships, agents created before 2026-04-12 have zero likes in history. Do we backfill an inferred ICP v0 from their job description on first run, or leave them as pure-criteria until the recruiter starts triaging? **Recommendation**: lazy backfill on next run, logged as `system`-triggered. Confirm?

---

## 13. Appendix: glossary delta vs existing spec

Terms added by this document on top of `agents-redesign-spec.md` §3:

| Term | Meaning |
|---|---|
| **ICP (Ideal Candidate Profile)** | Versioned, LLM-generated JSON representation of recruiter taste. See §4.1. |
| **ICP version** | A single immutable snapshot of the ICP at a point in time. Every regen creates a new version. See §6.2. |
| **Anchor** | A specific liked candidate cited as an exemplar in the ICP and the scoring prompt. See §4.4. |
| **Anti-anchor** | A specific disliked candidate cited in the ICP as a negative exemplar. See §4.4. |
| **Hard requirement (硬性条件)** | Strict boolean filter excluding candidates before LLM scoring. See §4.2 and §5. |
| **Missing-data policy** | Per-rule setting for how to treat a candidate when the referenced field is absent: `fail`, `skip`, `ask_llm`. See §5.3. |
| **ICP confidence** | [0,1] score computed per version from signal volume, coherence, and agreement. See §6.3. |
| **Cold-start seed** | Inferred ICP v0 produced from job description + criteria when no triage signal exists. See §2.3. |
| **Saturation** | State in which successive regens produce minimal ICP drift; auto-regen halts. See §2.4. |
| **Anti-profile** | Fallback ICP containing only the `avoid` field, generated when all feedback is negative. See §8.1. |

---

**End of spec.** Hand off to architect agent for technical design, to the prompts agent for `ICPGeneratorAgent` and `ICPSeedAgent` prompt drafts, and to the implementation agents only after Kenny signs off on the Open Questions in §12.
