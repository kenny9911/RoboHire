# ICP + Hard Requirements — UX Design Spec

**Status**: Design proposal v1 (pre-implementation)
**Owner**: Design
**Last updated**: 2026-04-11
**Scope**: Ideal Candidate Profile (ICP) that learns from likes/dislikes + Hard Requirements (`硬性条件`) filter that strictly excludes candidates
**Related**: `agents-redesign-spec.md` · `agents-changelog.md` · `AgentCriteriaModal.tsx` · `AgentRunDrawer.tsx` · `ReviewProfilesView.tsx`

---

## 0. Design principles

1. **Two mental models, one workbench.** Soft criteria SCORE, hard requirements FILTER, the ICP LEARNS. Each mode needs its own visual vocabulary so the user never confuses them.
2. **Match the existing aesthetic.** Clean borders, 12px radius (`rounded-xl` / `rounded-2xl`), slate text, violet-600 primary, juicebox.io-inspired. No surprise colors; red/amber used only for strict-filter warnings.
3. **Learning is transparent.** The ICP must always show its version, its confidence, the data it was trained on, and a diff against the previous version. Recruiters should never feel the system is learning "behind their back".
4. **Strict means strict.** Hard requirements must LOOK dangerous. The UI must make it obvious they exclude candidates entirely — not just lower a score. Copy, color, and iconography all reinforce this.
5. **Keyboard-first triage stays intact.** Nothing in the ICP flow may steal focus from the `J / K / L` shortcut loop in `ReviewProfilesView.tsx`.
6. **i18n ready.** Every string must ship a `t()` key in all 8 locales. Bilingual labels (`硬性条件 · Hard requirements`) are used in headings where the Chinese term has become product vocabulary.

---

## 1. Ideal Candidate Profile (ICP) review card

### Purpose
A persistent panel that shows the recruiter *what the agent currently thinks an ideal candidate looks like*, derived from their like/dislike signals. Appears in two places:

1. **Primary**: Top of `SettingsTab` inside `AgentRunDrawer.tsx` — the canonical home.
2. **Secondary**: Inside `RunSummaryCard` (after a triage batch completes), when the run has produced new like/dislike signals. Here it's a slimmer "ICP updated" variant — see §2.

### 1.1 Layout — Settings tab variant (full card)

```
┌──────────────────────────────────────────────────────────────────────┐
│ ◎  Ideal Candidate Profile                   v3  ·  Updated 2h ago   │
│    Learned from 12 likes · 7 dislikes                                │
├──────────────────────────────────────────────────────────────────────┤
│  Confidence                                                          │
│  ████████████████░░░░░░░░   72%                                      │
│  "Needs ~5 more signals to stabilize"                                │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ ✨  A senior full-stack engineer, 6+ years, product-led,       │  │
│  │     biased toward fintech and thrives in small teams.          │  │
│  │     You consistently skip candidates from large agencies.      │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  KEY TRAITS (what you like)                                          │
│  ┌ TypeScript ┐ ┌ Startup experience ┐ ┌ Fintech ┐ ┌ Remote EU ┐     │
│  ┌ Shipped 0→1 ┐ ┌ Small team leader ┐ ┌ Python ┐ ┌ +3 more ⌄ ┐     │
│                                                                      │
│  ANTI-TRAITS (what you pass on)                                      │
│  ┌ ✕ Enterprise-only ┐ ┌ ✕ <3 yrs exp ┐ ┌ ✕ Agency bg ┐             │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────────────┐  View previous  │
│  │  ↻  Regenerate   │  │  ⤴  Copy to criteria     │   versions  ⌄   │
│  └──────────────────┘  └──────────────────────────┘                  │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.2 Visual language
- **Container**: `rounded-2xl border border-slate-200 bg-white shadow-sm`, matches `RunSummaryCard`.
- **Header strip**: Gradient `from-violet-50 to-white` with a small violet circle badge (`bg-violet-100 text-violet-600`) holding a sparkle icon. Version chip `v3` in a `bg-slate-900 text-white rounded-md text-[10px]` pill — same as the score pill in `RunSummaryCard`.
- **Confidence bar**: 4px tall, `bg-slate-100` track, `bg-gradient-to-r from-violet-500 to-violet-600` fill. Percentage right-aligned in `text-[11px] font-semibold text-slate-900`. Caption below in `text-[10px] text-slate-500`. Confidence buckets:
  - `0–30%` → slate bar, caption "Too few signals — keep triaging"
  - `30–60%` → violet-light, caption "Getting warmer — like/dislike more to sharpen"
  - `60–85%` → violet, caption "Solid — ready to guide the next run"
  - `85–100%` → emerald-tinted violet, caption "Very stable"
- **Narrative summary block**: `rounded-xl bg-slate-900 text-slate-100 px-4 py-3 text-sm leading-relaxed` — this is the "dark AI summary box" pattern from memory. Leading sparkle emoji. 1–2 sentences, max 240 chars.
- **Trait chips**: `inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700` (same as `RunSummaryCard` "Common strengths" chips, intentional visual rhyme).
- **Anti-trait chips**: `rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700` with a leading `✕`. NOT red-600; rose is softer and signals "deprioritize" rather than "error".
- **Chip overflow**: Show up to 8 per row; collapse the rest into a `+N more ⌄` chip that expands inline.

### 1.3 Affordances & interactions
| Control | Behavior |
|---|---|
| `↻ Regenerate` (primary violet button) | Triggers ICP rebuild from current like/dislike pool. Enters loading state (see §2.3). |
| `⤴ Copy to criteria` (secondary outline) | Opens a sheet listing each trait/anti-trait with checkboxes; selected items pre-fill new rows in the soft-criteria editor of the CriteriaModal. Defaults all checked. |
| `View previous versions ⌄` | Dropdown listing prior versions as `v2 · 5d ago · 9 likes, 4 dislikes`. Clicking one opens a read-only modal diff against the current version. |
| Confidence bar tooltip | Hover reveals `Based on 12 likes and 7 dislikes. Confidence grows with balanced feedback.` |
| Version pill click | Opens the version history dropdown (same as the bottom link). |

### 1.4 Empty state — no ICP yet

```
┌──────────────────────────────────────────────────────────────────────┐
│                    ✦                                                 │
│       Teach your agent what "great" looks like                       │
│                                                                      │
│  Like or dislike a few candidates and I'll learn the patterns        │
│  behind your taste. After 3+ signals I'll draft your first           │
│  Ideal Candidate Profile.                                            │
│                                                                      │
│   [ Go to review profiles → ]                                        │
└──────────────────────────────────────────────────────────────────────┘
```

- Dashed `border-dashed border-slate-200`, `bg-slate-50/40`, centered text, slate-500.
- Sparkle glyph in `text-violet-400`.
- CTA button is `bg-violet-600 text-white` — clicking routes to the Results tab with an anchor at the first pending card.
- Appears whenever `agent.config.icp == null || icp.signalCount < 3`.

### 1.5 Partial state — some signals but not enough
When `signalCount` between 1 and 2:

```
✦  Learning… 1 more signal before your first profile
   Likes 2 · Dislikes 0
```
Slim single-line banner in violet-50 background. No regenerate button until threshold reached.

---

## 2. Regeneration trigger & flow

### 2.1 Where the button lives
Three surfaces:

1. **ICP card itself** — primary `↻ Regenerate` button. Always available once `signalCount >= 3`.
2. **RunSummaryCard footer** — after a triage batch closes with `likes + dislikes >= 3 new signals since last ICP`, we insert an **ICP delta strip** above the existing action row:

   ```
   ┌──────────────────────────────────────────────────────────────────┐
   │ ✨  You added 4 likes and 2 dislikes.                            │
   │     Update the ideal profile?    [ ↻ Update profile ]  [ Skip ]  │
   └──────────────────────────────────────────────────────────────────┘
   ```
   Violet-50 background, subtle violet border. Dismissible with "Skip" (stores dismissal on the run so it doesn't re-appear).

3. **Floating toast** — if the user is still triaging and crosses a meaningful threshold (e.g., 5 new likes), a `bottom-6 right-6` toast appears: "Profile ready to learn from your latest picks. [Update]". Auto-dismisses after 8 seconds. Does not steal focus.

### 2.2 Auto-suggest rules (not auto-run)
We **never** silently regenerate. We only *suggest* regeneration when ONE of:
- `newSignalsSinceLastICP >= 3` AND at least 1 new dislike (ensures both signals represented)
- `confidence < 40%` AND `newSignalsSinceLastICP >= 5` (help users climb confidence)
- User opens Settings tab and the ICP is more than 7 days old

The suggestion banner at the top of the ICP card reads: "Your taste has evolved — regenerate to refresh."

### 2.3 Loading state (5–15s LLM call)
When regenerate is clicked:

```
┌──────────────────────────────────────────────────────────────────────┐
│ ◎  Ideal Candidate Profile                   v3  →  v4 pending      │
│    Re-learning from 16 likes · 9 dislikes                            │
├──────────────────────────────────────────────────────────────────────┤
│  ⣾  Analyzing signals…                                               │
│     Step 2 of 4 · Clustering traits                                  │
│  ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░  42%                                    │
│                                                                      │
│  [ Cancel ]                                                          │
└──────────────────────────────────────────────────────────────────────┘
```
- Progress phases: `Reading signals` → `Clustering traits` → `Drafting narrative` → `Finalizing`. Each phase advances the bar by ~25%; between phases the bar animates smoothly.
- Indeterminate fallback: if the backend sends no progress events, use a single `animate-pulse` violet bar and the text "Drafting new profile — typically 5–15 seconds."
- `Cancel` is destructive but allowed; aborts the request and restores `v3`.
- The rest of the Settings tab is NOT blocked — users can still scroll and edit other fields. Only the ICP card is in loading state.

### 2.4 Completion diff
After regeneration, the card enters **diff mode** for 10 seconds (or until the user clicks "Dismiss diff"):

```
┌──────────────────────────────────────────────────────────────────────┐
│ ◎  Ideal Candidate Profile   v4  (was v3)         [ Dismiss diff ]  │
│    Confidence  62% → 78%   ↑ +16                                     │
├──────────────────────────────────────────────────────────────────────┤
│  What changed                                                        │
│                                                                      │
│  NARRATIVE                                                           │
│  - "Senior full-stack, 6+ yrs, product-led, fintech bias."           │
│  + "Senior full-stack, 6+ yrs, product-led, fintech AND healthtech,  │
│     comfortable with ambiguous specs."                               │
│                                                                      │
│  KEY TRAITS                                                          │
│  +  Healthtech   +  Ambiguity-tolerant   +  Python                  │
│  −  Remote EU (dropped — not consistent)                            │
│                                                                      │
│  ANTI-TRAITS                                                         │
│  +  ✕ Agency-only  (new pattern)                                     │
│                                                                      │
│  ┌ Keep v4 ┐  ┌ Revert to v3 ┐                                       │
└──────────────────────────────────────────────────────────────────────┘
```
- Added items in `bg-emerald-50 border-emerald-200` with `+` prefix.
- Removed items in `bg-rose-50/60 border-rose-200` with `−` prefix, slightly faded (`opacity-70`).
- Narrative shown as a git-style inline diff with `-` line in `bg-rose-50/60`, `+` line in `bg-emerald-50`. No word-level diff — full-line only for readability.
- Confidence delta chip in violet, arrow + sign colored by direction.
- If the user hits `Revert to v3`, the card animates back to pre-regen state and logs `icp.reverted` activity.

### 2.5 Error states
- **LLM failure**: Card switches to `border-rose-200 bg-rose-50` with icon + message "Couldn't regenerate the profile. [ Try again ]". Previous `v3` is preserved.
- **Insufficient signals** (edge case if user deletes candidates mid-run): "Need at least 3 like/dislike signals. Currently: 2." Regenerate button disabled.
- **Rate limited**: "You've regenerated recently. Try again in 45s." Counter updates live.

---

## 3. Hard Requirements editor — `硬性条件`

### 3.1 Mental model
Soft criteria = score modifier. Hard requirements = pool filter. The editor's entire visual treatment screams "this is a SQL `WHERE` clause that removes people". The recruiter should never be surprised by an empty result set.

### 3.2 Component: `<HardRequirementsEditor>`
Reusable component, lives in `frontend/src/components/HardRequirementsEditor.tsx` (new). Embedded in three places:

- `AgentCriteriaModal.tsx` — new top section above "Most Important".
- `CreateAgentModal.tsx` (or equivalent) — inline below task/source fields.
- `SettingsTab` inside `AgentRunDrawer.tsx` — new section directly below the ICP card.

### 3.3 Layout

```
┌────────────────────────────────────────────────────────────────────────┐
│ ⚠  硬性条件 · Hard requirements        [ STRICT FILTER ]               │
│    Candidates not meeting ALL of these are excluded entirely —         │
│    not down-scored. Use sparingly.                                     │
├────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 💼  Experience           ≥ (at least)    5  years        [ ✕ ]  │  │
│  │  "At least 5 years of experience"                                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 📍  Location             is any of        [Shanghai ×][Beijing ×]│  │
│  │                                           [+ add]        [ ✕ ]  │  │
│  │  "Based in Shanghai or Beijing"                                  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 🛠  Technical skill      contains all    [Python ×][AWS ×]      │  │
│  │                                           [+ add]        [ ✕ ]  │  │
│  │  "Must know Python and AWS"                                      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  [ + Add requirement ⌄ ]                                               │
│                                                                        │
│  Quick add:                                                            │
│  [ 5+ years exp ]  [ Located in… ]  [ Speaks English ]  [ Bachelor+ ] │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Visual language — the "danger" treatment
- **Outer container**: `rounded-2xl border border-amber-300 bg-amber-50/40`. Amber (not red) because these are user-authored filters, not errors.
- **Header strip**: `bg-amber-100/60 border-b border-amber-200`, warning triangle icon in `text-amber-700`, heading in `text-amber-900 font-semibold`.
- **STRICT FILTER badge**: `rounded-full bg-amber-600 text-white text-[9px] font-bold uppercase tracking-[0.1em] px-2 py-0.5`. Sits next to the heading.
- **Subtitle**: `text-xs text-amber-800/80`. Always visible, never collapsed.
- **Rule rows**: `rounded-xl border border-amber-200 bg-white px-3 py-2.5`. Each row has:
  - Leading icon (field-type glyph) in `text-amber-600`
  - Field selector pill (dropdown)
  - Operator pill (dropdown)
  - Value input (type-aware)
  - Trailing `✕` delete button (appears on hover, `text-slate-300 hover:text-red-600`)
  - Auto-generated natural-language description in `text-[11px] text-slate-500 italic` below the controls — this is the "plain English" readback so the user confirms intent

No drag handles. Order is meaningless for filters (spec'd explicitly).

### 3.5 Fields, operators, and type-aware values

| Field (internal key) | Icon | Operators | Value UI |
|---|---|---|---|
| `experienceYears` | 💼 | `gte`, `lte`, `eq`, `between` | Number spinner. `between` shows two numbers. |
| `location` | 📍 | `is_any_of`, `is_none_of`, `within_km_of` | Tag input with city autocomplete. `within_km_of` shows city + radius slider. |
| `skills.technical` | 🛠 | `contains_any`, `contains_all`, `contains_none` | Tag input, autocomplete from known skills. |
| `education.degree` | 🎓 | `gte`, `eq` | Ordinal select: None / HS / Associate / Bachelor / Master / PhD |
| `languages` | 🌐 | `contains_any`, `contains_all` + proficiency min | Multi-tag with per-tag proficiency dropdown (basic/intermediate/fluent/native) |
| `currentTitleMatches` | 🏷 | `matches_any`, `not_matches` | Tag input; values treated as case-insensitive substrings |
| `companyTier` | 🏢 | `is_any_of`, `is_none_of` | Multi-select: FAANG / Big Tech / Unicorn / Startup / Agency / Enterprise |
| `custom` | ⚙ | `matches` (regex), `not_matches` (regex) | Monospace text input + "Test" popover |

### 3.6 Inline validation
- Numeric fields: if user types a non-number, field border turns rose-400 + message `"Value must be a number"`.
- `between` operator: if `min > max`, row turns amber-400 + message `"Minimum must be less than maximum"`.
- Empty tag lists: row shows `"Add at least one value"` in rose-500 text; Save button at modal level is disabled.
- Regex custom: live-parse on every keystroke; invalid pattern shows `"Invalid regular expression"` and disables Save.
- Empty rule (field + operator but no value): show `"(empty rule — will be ignored)"` in slate-400, DON'T block save — just ignore.

### 3.7 Quick-add presets
A row of chips below the rule list:
```
Quick add:   [ 5+ years exp ]  [ Located in… ]  [ Speaks English ]  [ Bachelor+ ]
```
Clicking a preset inserts a pre-filled rule and immediately focuses its first editable cell. Presets:
- `5+ years exp` → `experienceYears gte 5`
- `Located in…` → `location is_any_of []` (empty, focus tag input)
- `Speaks English` → `languages contains_any [English: intermediate]`
- `Bachelor+` → `education.degree gte Bachelor`
- `No agencies` → `companyTier is_none_of [Agency]`
- `Custom regex…` → `custom matches [""]`

Admins may later add team-shared presets via `criteria-presets` endpoint (same table, new `kind='hard'`).

### 3.8 Empty state
```
┌────────────────────────────────────────────────────────────────────────┐
│ ⚠  硬性条件 · Hard requirements        [ STRICT FILTER ]               │
│                                                                        │
│         No strict filters yet.                                         │
│         Every sourced candidate will reach the scoring stage.          │
│                                                                        │
│         Quick add:  [ 5+ years ]  [ Located in… ]  [ Bachelor+ ]      │
└────────────────────────────────────────────────────────────────────────┘
```
Dashed amber border in the center area, slate-500 text. Still shows quick-add chips.

### 3.9 Keyboard & a11y
- `Tab` moves through rule rows cell-by-cell (field → operator → value → delete).
- `Enter` inside value commits the edit.
- `Cmd/Ctrl+Backspace` on a focused row deletes it with undo toast.
- Each rule row has `role="group"` with an `aria-label` of the natural-language description.
- Delete buttons: `aria-label="Remove rule: {description}"`.
- `STRICT FILTER` badge is `aria-hidden` — the subtitle carries the semantic meaning.

### 3.10 Guardrail: "this will exclude everyone" warning
See §4.3 — the warning fires at run-time, not edit-time, but the editor surfaces a live counter when possible. If the backend returns a `preview.excludedByHR` count (reusing the cached pool), show an inline note:
```
→  Currently excludes ~84% of candidates in this agent's pool.
```
In `text-xs text-amber-700`. Threshold `>90%` flips the note to `text-rose-600` with a stronger message `"Warning: would exclude almost everyone"`.

---

## 4. Run-with-ICP flow

### 4.1 Run button ornamentation
The "Find more candidates" / "Run again" button in `RunSummaryCard` and on the agent card itself picks up a small ornament:

```
  ┌─────────────────────────────────────────┐
  │  ▸  Find more candidates                │
  │     ┌──────────────────────┐            │
  │     │ ✨ Using ICP v3      │            │
  │     └──────────────────────┘            │
  └─────────────────────────────────────────┘
```

- Badge style: `inline-flex items-center gap-1 rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-[10px] font-medium` with a sparkle icon.
- Hover tooltip: "Runs filter by hard requirements first, then score using ICP v3 + your criteria."
- Position: directly below the button, not inside it — keeps the button height stable.

### 4.2 No ICP yet
If `icp == null`:
- Badge text: `No ideal profile yet · using criteria only`
- Badge background: `bg-slate-100 text-slate-600`
- Tooltip: "Like or dislike candidates and I'll learn your preferences automatically."
- Button label unchanged.

### 4.3 Pre-run guardrail — "would exclude everyone"
Before kicking off a run, we POST a lightweight `/agents/:id/dry-run` that returns `{ poolSize, excludedByHR, remaining }`. If `remaining == 0` OR `remaining / poolSize < 0.05` (less than 5% survive), we intercept the run with a modal:

```
┌──────────────────────────────────────────────────────────────────────┐
│ ⚠  Hard requirements may exclude almost everyone                    │
├──────────────────────────────────────────────────────────────────────┤
│  Of 420 sourced candidates:                                          │
│                                                                      │
│    ████████████████████████████░░   397 excluded by filters         │
│    ▓                                 3  would be evaluated          │
│                                                                      │
│  The rules below are removing most of the pool:                      │
│    •  Experience  ≥ 15 years             (excludes 340)              │
│    •  Location is any of [Zurich]       (excludes 82)                │
│                                                                      │
│  [ Edit hard requirements ]   [ Run anyway ]                         │
└──────────────────────────────────────────────────────────────────────┘
```

- "Edit" is primary, "Run anyway" is a subdued `text-slate-500` link-style button.
- Top 2 offending rules are highlighted (by `excludedCount` from the dry-run).
- If `remaining > 0` but `< 5%`, we use softer copy: "Only a few candidates survive your filters — run anyway?"

### 4.4 During the run — ICP-aware status chip
In the Results tab, the existing status chip (`queued → running → completed`) picks up a sub-line:

```
  ● running   ✨ using ICP v3  ⚠ filtered 397/420
```
The `397/420` counter increments live as sourcing finishes; filtered count is clickable and opens an Activity tab pre-filtered to `source.rejected.hardRequirement` events (new event type in the `AgentActivityLog` taxonomy — note for backend, not built here).

---

## 5. Criteria modal — relationship to hard requirements

### 5.1 New section ordering
`AgentCriteriaModal.tsx` currently has Most Important / Least Important. We prepend a third section:

```
┌──────────────────────────────────────────────────────────────────────┐
│  Criteria                                   [preset ⌄] [save ⌄] [✕] │
├──────────────────────────────────────────────────────────────────────┤
│  ⚠  硬性条件 · HARD REQUIREMENTS      [ STRICT FILTER ]              │
│     <HardRequirementsEditor/>                                        │
│                                                                      │
│  ─── MOST IMPORTANT ──────────────────────────────────                │
│     <CriteriaBucket tone="most"/>                                    │
│                                                                      │
│  ─── LEAST IMPORTANT ─────────────────────────────                   │
│     <CriteriaBucket tone="least"/>                                   │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.2 Relationship banner
Between the HR editor and the "Most Important" section, a one-line explainer:

```
  ↓  Hard requirements run first to filter the pool.
      Then soft criteria score what's left.
```
`text-[11px] text-slate-500 italic px-1` with a small down-arrow glyph. This is the single source of truth for explaining the mental model and appears only here.

### 5.3 Visual hierarchy at-a-glance
- Hard requirements: amber container, tall, unmissable.
- Most Important: slate-50 container (unchanged).
- Least Important: transparent container (unchanged).
- The modal's max height becomes `70vh` (up from `60vh`) to accommodate. Both HR and criteria sections scroll together — no nested scroll.

### 5.4 Empty HR is OK
If the user creates zero hard requirements, the section collapses to a thin header bar:
```
  ⚠  硬性条件 · Hard requirements     [ + Add requirement ]
```
Still amber-tinted, but only ~40px tall. This keeps the modal compact for agents that don't need filters.

### 5.5 Save / discard semantics
- HR changes are staged alongside criteria changes.
- Hitting **Update** saves both. Hitting **Esc** discards both (existing behavior).
- If HR is invalid (see §3.6), the Update button shows a red dot and the invalid rule scrolls into view on click.

---

## 6. CriteriaSuggestionsModal — ICP & HR integration

### 6.1 Current flow
`CriteriaSuggestionsModal` reads the run's disliked candidates and proposes new soft criteria. We extend it in two ways.

### 6.2 New: "Suggested hard requirements" section
When the LLM detects an **extreme pattern** in rejections (e.g., 100% of rejections share a location the job doesn't need, or all rejected candidates have < 3 years experience), it proposes a hard requirement instead of a soft criterion.

Modal layout becomes:

```
┌──────────────────────────────────────────────────────────────────────┐
│  Criteria suggestions                                           [✕] │
│  Based on 7 candidates you passed on.                               │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ⚠  SUGGESTED HARD REQUIREMENTS (3)                                  │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 📍 Location is any of [China]                                │   │
│  │    "All 7 rejected candidates were outside China."           │   │
│  │    Confidence: ██████████ 100%       [ Apply ]               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 💼 Experience ≥ 5 years                                      │   │
│  │    "6 of 7 rejections had <5 years of experience."           │   │
│  │    Confidence: ███████░░░ 86%        [ Apply ]               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ── MOST IMPORTANT (2) ──                                            │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ "Has hands-on experience with payments infra"                │   │
│  │ From 4 rejections.                   [ Apply ]               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  …                                                                   │
│                                                                      │
│  [ Apply all ]   [ Dismiss ]                                         │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.3 When HR suggestions fire
Backend rule (spec only; document here so coder implements consistently):
- A location / experience / degree / language pattern appears in `>= 90%` of rejections (`confidence >= 0.9`).
- AND there are at least 5 rejected candidates (no single-sample proposals).
- AND the pattern does NOT already match an existing hard requirement.

If no HR patterns meet the bar, the section is omitted entirely (not shown empty).

### 6.4 Apply button behavior
- **HR suggestion "Apply"**: opens the `<HardRequirementsEditor>` pre-populated with the suggested rule, inside a slim slide-over on top of the suggestions modal. User confirms, rule is saved, slide-over dismisses, card in suggestions modal is checkmarked "Applied".
- **Soft criterion "Apply"**: existing behavior — routes to criteria most-important bucket.
- **Apply all**: applies every suggestion in order (HR first, then soft), showing a progress bar. Any failure surfaces a rose toast and preserves the rest.

### 6.5 Dismissing suggestions
- Individual dismiss: `✕` on each card, stores `dismissedSuggestionIds` on the run so the same pattern won't be re-suggested within the same run.
- Bulk dismiss: footer button.

### 6.6 Copy distinction
The suggestions modal uses distinct headers to reinforce the mental model:
- `SUGGESTED HARD REQUIREMENTS` — amber uppercase, same amber-700 as editor.
- `MOST IMPORTANT` / `LEAST IMPORTANT` — existing slate uppercase.
Users should never confuse which bucket a suggestion goes into.

---

## 7. Cross-cutting interaction notes

### 7.1 Toasts & activity logging
Every ICP and HR mutation emits an activity event for the audit trail (spec §5.3 in `agents-redesign-spec.md`):
- `icp.generated` — payload: `{ version, confidence, signalCount }`
- `icp.regenerated` — payload: `{ fromVersion, toVersion, diff }`
- `icp.reverted` — payload: `{ fromVersion, toVersion }`
- `hr.rule.added` / `hr.rule.updated` / `hr.rule.removed` — payload: `{ field, operator, value }`
- `hr.dryrun.blocked` — emitted when user chose "Edit" from the guardrail modal
- `hr.override.forced` — emitted when user chose "Run anyway"

These must appear in the Activity tab timeline.

### 7.2 i18n keys
Every new string must exist in `en`, `zh`, `zh-TW`, `ja`, `es`, `fr`, `pt`, `de`. Key namespace: `agents.workbench.icp.*` and `agents.workbench.hardRequirements.*`. The bilingual heading `硬性条件 · Hard requirements` is built at render time by interpolating `t('agents.workbench.hardRequirements.titleCn')` + `' · '` + `t('agents.workbench.hardRequirements.titleEn')` — for locales where the Chinese prefix is redundant (zh, zh-TW), the `titleCn` key is empty and the separator is suppressed.

### 7.3 Responsive behavior
- ICP card: drops trait chip grid to single column below `sm`. Narrative summary stays full-width.
- HR editor: each rule row stacks vertically below `md` — field/operator/value each take a full row inside the rule container.
- Suggestions modal: stays `max-w-2xl`, body scrolls.

### 7.4 Loading shimmer
All three features use `animate-pulse` slate placeholders matching existing patterns (see `RunSummaryCard` loading). No skeleton sprites — just shaped divs.

### 7.5 Permissions
Hard requirements and ICP are per-agent, so permission is identical to existing agent edit scopes via `getVisibilityScope()`. Admin can see and edit anyone's ICP; internal/team users per existing team rules. No new permission checks needed at UI level.

---

## 8. Open questions for product

1. **ICP sharing across agents?** Should a user be able to "Copy ICP from another agent for the same job"? Out of v1 scope but note for v2.
2. **HR presets as shared team resources?** Same `criteria-presets` table or separate? Recommend reusing with `kind='hard'` column — avoids another admin UI.
3. **ICP driving scoring weight?** For v1, ICP is informational + used to bias LLM prompts. In v2, consider letting ICP directly adjust criterion weights.
4. **Explainability on filtered candidates?** Should a rejected candidate's card still appear in Activity with "excluded by HR: experience < 5"? Recommended yes.

---

## 9. Component inventory

One-line descriptions of every new/modified component so the frontend coder can scaffold.

### New components
| Component | File | Purpose |
|---|---|---|
| `IdealCandidateProfileCard` | `frontend/src/components/IdealCandidateProfileCard.tsx` | Primary ICP review card (full variant for Settings). |
| `IdealCandidateProfileCompact` | same file, named export | Slim variant embedded in `RunSummaryCard` delta strip. |
| `ICPRegenerateButton` | same file, named export | Regenerate button + loading/cancel state, drives the LLM call. |
| `ICPDiffView` | `frontend/src/components/ICPDiffView.tsx` | Renders v(n-1) → v(n) diff of narrative + traits + anti-traits. |
| `ICPEmptyState` | same file as card | Empty / partial states for 0–2 signals. |
| `ICPVersionDropdown` | same file as card | Dropdown listing prior versions; opens read-only diffs. |
| `HardRequirementsEditor` | `frontend/src/components/HardRequirementsEditor.tsx` | Reusable editor for the HR rule list. Takes `value`, `onChange`, `context?`. |
| `HardRequirementRuleRow` | same file | Single rule row with field/operator/value/delete + auto-description + inline validation. |
| `HardRequirementFieldPicker` | same file | Dropdown for selecting field type (experienceYears, location, etc.) with icons. |
| `HardRequirementOperatorPicker` | same file | Operator dropdown filtered by field type. |
| `HardRequirementValueInput` | same file | Type-aware input: number / tags / select / regex. Dispatches to sub-components. |
| `HardRequirementsQuickAdd` | same file | Preset chip row under the rule list. |
| `HRDryRunWarningModal` | `frontend/src/components/HRDryRunWarningModal.tsx` | "This would exclude almost everyone" pre-run modal. |
| `ICPDeltaStrip` | inline inside `RunSummaryCard` | "You added 4 likes and 2 dislikes. Update profile?" banner. |
| `ICPUsageBadge` | `frontend/src/components/ICPUsageBadge.tsx` | Small "Using ICP v3" chip displayed near Run buttons. |
| `HRExcludedPreviewNote` | inside editor | Shows "Currently excludes ~84%" live preview when dry-run data is available. |
| `HardRequirementSuggestionCard` | inside `CriteriaSuggestionsModal.tsx` | Card variant for HR suggestions (amber, with Apply/Dismiss). |

### Modified components
| Component | File | Change |
|---|---|---|
| `AgentCriteriaModal` | `frontend/src/components/AgentCriteriaModal.tsx` | Prepend `<HardRequirementsEditor>` section + relationship banner. Bump max-height. Validate HR on save. |
| `AgentRunDrawer` → `RunSummaryCard` | `frontend/src/components/AgentRunDrawer.tsx` | Add optional `<ICPDeltaStrip>` above action row; insert `<ICPUsageBadge>` near "Find more" button. |
| `AgentRunDrawer` → `SettingsTab` | `frontend/src/components/AgentRunDrawer.tsx` | Add top-of-tab `<IdealCandidateProfileCard>` and `<HardRequirementsEditor>` sections. Include them in save payload. |
| `AgentRunDrawer` → Results tab status chip | `frontend/src/components/AgentRunDrawer.tsx` | Add ICP + filtered sub-line during `running`. |
| `CriteriaSuggestionsModal` | `frontend/src/components/CriteriaSuggestionsModal.tsx` | Render `SUGGESTED HARD REQUIREMENTS` section when backend returns HR suggestions; route Apply through `<HardRequirementsEditor>` slide-over. |
| `CreateAgentModal` (wherever new agents are created) | TBD — likely `frontend/src/pages/product/Agents.tsx` or a new modal | Embed collapsed `<HardRequirementsEditor>` below task/source fields. Default collapsed. |
| `ReviewProfilesView` | `frontend/src/components/ReviewProfilesView.tsx` | No visual change; on every `like`/`dislike` PATCH, check if `newSignalsSinceLastICP` crossed threshold and show floating toast (`<ICPUpdateToast>`, a new slim named export). |

### Shared primitives (reuse where possible)
| Primitive | Existing location | Notes |
|---|---|---|
| `Section`, `Field` | `AgentRunDrawer.tsx` internal helpers | Reuse for Settings-tab ICP + HR sections. |
| Chip style (emerald/amber/rose) | `RunSummaryCard` skill/gap chips | Match this exactly for ICP traits. |
| "Dark AI summary box" | `bg-slate-900 text-slate-100 rounded-xl px-4 py-3` | Used for ICP narrative per design memory. |
| Preset dropdown pattern | `AgentCriteriaModal` preset picker | Reuse for HR presets library. |
| Progress bar | None yet — create generic `<ProgressBar>` in `frontend/src/components/ui/ProgressBar.tsx` if nothing similar exists. |

---

## 10. Out of scope for v1

- ICP "lock" to prevent auto-suggest regeneration (v2).
- ICP export/import between agents (v2).
- HR complex boolean logic (OR between rules, grouped rules). v1 is implicit AND only.
- Per-candidate "overrule hard requirement" button during triage. Defer until users ask.
- Multi-version A/B comparison of ICPs on the same run. Defer.

---

End of spec.
