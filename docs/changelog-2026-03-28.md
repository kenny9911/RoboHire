# Changelog — 2026-03-28

## 1. Interview Page Enhancements (`/product/interview`)

### 1.1 Remove "In Progress" Status

Simplified interview statuses from three visible states to two: **Scheduled** and **Completed**. The backend `in_progress` status is mapped to `scheduled` styling/label at the UI level across all pages.

**Files changed:**

- `frontend/src/pages/product/AIInterview.tsx`
  - `STATUS_STYLES`: mapped `in_progress` to blue (same as `scheduled`)
  - `statusLabel`: mapped `in_progress` to the scheduled translation key
  - `statuses` filter tabs: removed `'in_progress'` entry
  - `scheduledCount`: merged `in_progress` count into scheduled count
  - Removed "Live Now" metric card, pulse animation CSS, and live interview banner
- `frontend/src/pages/ResumeDetail.tsx`
  - `JobFitTab`, `AppliedJobsTab`, `InvitationsTab`: all map `in_progress` to blue styling and scheduled label
- `frontend/src/pages/Dashboard.tsx`
  - `statusColors` and status label: map `in_progress` to blue/scheduled

### 1.2 Sortable Table with New Columns

Replaced the card-based interview list with a sortable 12-column grid table.

**New columns:** Invited At, Completed At, Candidate Name, Position, Evaluation Result, Status.

**New features:**
- Click any column header to sort ascending/descending
- Search bar with clear button for filtering by candidate name, position, or email
- Expandable detail panel on row click (preserved from card layout)

**File changed:** `frontend/src/pages/product/AIInterview.tsx`
- Added states: `searchQuery`, `sortField`, `sortDir`
- Added `toggleSort()` function and `filteredAndSorted` memo
- Replaced card list with table header row + data rows

### 1.3 Remove 50-Interview Limit

Frontend now fetches all interviews by paginating through the backend API (200 per page) in a do-while loop.

**File changed:** `frontend/src/pages/product/AIInterview.tsx`
- `fetchInterviews`: loops through all pages with `limit: 200` until no more results

### 1.4 72-Hour Overdue Reminder

Added overdue interview reminders for candidates who haven't completed their interview within 72 hours of invitation.

**Frontend (`AIInterview.tsx`):**
- `overdueInterviews` memo: filters scheduled/in_progress interviews older than 72 hours
- Orange banner showing overdue count with expandable candidate list
- "Send All Reminders" button with loading state and result toast
- Added states: `sendingReminders`, `reminderResult`, `showOverdueList`
- Added `handleSendReminders()` function

**Backend (`backend/src/routes/interviews.ts`):**
- New endpoint: `POST /api/v1/interviews/send-reminders`
  - Accepts `{ interviewIds: string[] }`
  - Validates interviews exist and are in `scheduled`/`in_progress` status
  - Resolves candidate email from interview record or resume preferences
  - Sends reminder email via `emailService` with interview access link
  - Returns `{ sent, total, results }` with per-interview success/failure

**Backend (`backend/src/services/EmailService.ts`):**
- Changed `function escapeHtml` to `export function escapeHtml` (needed by the reminder endpoint)

### 1.5 Recruiter/User Selector

Added recruiter and team visibility filtering. Each recruiter sees only their own or their team's interviews. Admin users can see everyone's.

**File changed:** `frontend/src/pages/product/AIInterview.tsx`
- Added `RecruiterTeamFilter` component in the header area
- Added `recruiterFilter` state (`RecruiterTeamFilterValue`)
- `fetchInterviews` passes `filterUserId`/`filterTeamId` params to backend
- Leverages existing backend `getVisibilityScope()` + `buildAdminOverrideFilter()` from `teamVisibility.ts`

### 1.6 i18n Keys Added

New translation keys added to all 8 language files (`en`, `zh`, `zh-TW`, `ja`, `es`, `fr`, `pt`, `de`):

- `product.interview.col.*`: `candidate`, `position`, `invitedAt`, `completedAt`, `status`, `evaluation`
- `product.interview.searchPlaceholder`, `noResults`, `pendingEval`
- `product.interview.overdue*`: `overdueTitle`, `overdueDesc`, `overdueShow`, `overdueHide`, `overdueSendAll`, `overdueSending`, `overdueResultSuccess`, `overdueResultFail`, `overdueDaysAgo`, `overdueHoursAgo`

---

## 2. Resume Parsing — Watermark Fix

Fixed a bug where PDF resumes with embedded watermark strings (e.g., `a744c9d5f407585e1HZ-0t-9E1tYy4-7UfuYWOeqmP7VNxNg`) failed to extract education, work experience, school names, and company names correctly.

**Root cause:** The `pdftotext -layout` mode scatters watermark characters within content lines. The existing `isHashLikeGarbage()` function could not detect watermark strings that were split across multiple space-separated tokens on the same line.

**File changed:** `backend/src/services/PDFService.ts`

**New methods:**
- `findWatermarkTokens(text)` — Scans text for long hash-like tokens (20+ chars, matching `[A-Za-z0-9_-]`) that appear 3+ times. These repeated patterns are identified as watermarks.
- `stripWatermarks(text, watermarks)` — Regex-removes all occurrences of identified watermark tokens from the text.

**Modified methods:**
- `isHashLikeGarbage()` — Extended with multi-token detection: lines longer than 40 chars containing up to 6 space-separated tokens where each token is 15+ chars of `[A-Za-z0-9+/=_-]` are now classified as garbage.
- `cleanText()` — Calls `findWatermarkTokens()` + `stripWatermarks()` at the start, before other cleanup processing.
- `extractWithPdftotext()` — Calls `findWatermarkTokens()` + `stripWatermarks()` on raw stdout before line-level cleanup.

---

## 3. Candidate Card Highlights (`/product/talent`)

Enhanced the candidate card in the Talent Hub with recruiter-focused highlight badges that surface key screening signals at a glance.

**File changed:** `frontend/src/pages/product/TalentHub.tsx`

### 3.1 New Helper Functions

| Function | Purpose |
|---|---|
| `getHighestDegree(parsedData)` | Detects the highest education level (PhD > MBA/Master > Bachelor) from parsed education entries. Returns degree label, field of study, and institution. Matches English and Chinese degree terms. |
| `getCurrentCompany(parsedData)` | Extracts the most recent employer from experience entries. Only returns the company if the end date indicates current employment (empty, "present", "至今", etc.). |
| `isNewCandidate(createdAt)` | Returns `true` if the resume was uploaded within the last 7 days. |
| `getSalaryDisplay(preferences)` | Formats salary expectations from candidate preferences into a compact string (e.g., `15K-25K`, `20K+`, `≤30K`). |
| `getPreferredWorkType(preferences)` | Extracts the first work type preference (e.g., "remoteOnly", "hybrid", "onSite"). |

### 3.2 New Enriched Fields on `EnrichedResume`

| Field | Type | Source |
|---|---|---|
| `_degree` | `{ label, field, institution } \| null` | `getHighestDegree()` from `parsedData.education` |
| `_currentCompany` | `string \| null` | `getCurrentCompany()` from `parsedData.experience` |
| `_isNew` | `boolean` | `isNewCandidate()` from `createdAt` |
| `_salaryDisplay` | `string \| null` | `getSalaryDisplay()` from `preferences` |
| `_workType` | `string \| null` | `getPreferredWorkType()` from `preferences` |

### 3.3 Card View Badge Changes (ResumeCard)

Badges appear in the horizontal badge strip below the candidate's current role. Order (left to right):

1. **"New" badge** — Green sparkle icon + "New" label. Shown for candidates uploaded within 7 days. Helps recruiters prioritize fresh talent.
2. **Elite school + degree** — Amber school icon. Existing elite school badge now includes degree level suffix (e.g., "MIT · Master"). Combines two signals in one badge.
3. **Advanced degree** (non-elite school) — Violet certificate icon. Shown for PhD, MBA, or Master's holders from non-elite schools. Includes field of study when available (e.g., "PhD · Computer Science").
4. **Current employer** — Blue building icon with `@ CompanyName`. Shows where the candidate works NOW. Notable past companies list is filtered to exclude the current company (avoids duplication).
5. **Experience years** — Unchanged slate badge.
6. **Location** — Unchanged slate badge.
7. **Past notable companies** — Unchanged `Ex-Company` badges, now filtered to exclude current company.
8. **Salary expectation** — Green coin icon. Shown when candidate preferences include salary range.
9. **Work type** — Sky-blue home icon. Shown when candidate preferences include work type. Uses existing i18n work type labels.
10. **Languages** — Unchanged emerald badges.
11. **Version count** — Unchanged.

### 3.4 List View Changes (ResumeListRow)

- Name column: added "New" sparkle badge, elite school mini-badge, and PhD/MBA badge inline with name
- Companies column: added `@ CurrentCompany` badge (blue) before `Ex-*` badges; filters current company from notable list

### 3.5 New Icons Imported

From `@tabler/icons-react`: `IconBuildingSkyscraper`, `IconCertificate`, `IconSparkles`, `IconCoin`, `IconHome`

### 3.6 i18n Key Added

New key `product.talent.badgeNew` added to all 8 language files:

| Language | Value |
|---|---|
| en | New |
| zh | 新 |
| zh-TW | 新 |
| ja | 新着 |
| es | Nuevo |
| fr | Nouveau |
| pt | Novo |
| de | Neu |

---

## 4. Candidate Card UI Overhaul (`/product/talent`)

### 4.1 Remove Avatar & Simplify Layout

Removed the initials-based avatar box and the `flex gap-5` two-column wrapper. The card now uses a single-column layout with more horizontal space for content.

**File changed:** `frontend/src/pages/product/TalentHub.tsx`
- Removed `getInitials()` helper function
- Removed `<div className="flex h-16 w-16 ...">` avatar element
- Removed outer `flex gap-5` wrapper; replaced with flat `<div className="min-w-0">`
- Candidate name is now a clickable `<Link>` to the detail page (blue hover state)

### 4.2 Compact Icon Action Buttons

Replaced the large labeled buttons (View Profile, Invite, Apply) and the right-side button column with small icon-only buttons in the card's top-right corner, alongside the existing Preferences and Delete buttons.

**File changed:** `frontend/src/pages/product/TalentHub.tsx`

**New button layout (left to right):**

| Button | Icon | Library | Action |
|---|---|---|---|
| View Profile | `HiOutlineDocumentText` | react-icons/hi2 (Heroicons) | Link to `/product/talent/:id` |
| Invite | `PiPaperPlaneTiltBold` | react-icons/pi (Phosphor) | Opens `InterviewInviteModal` |
| Apply | `PiBriefcaseBold` | react-icons/pi (Phosphor) | Opens `ApplyToJobModal` |
| Preferences | `IconAdjustments` | @tabler/icons-react | Opens `CandidatePreferencesModal` |
| Delete | `IconX` | @tabler/icons-react | Deletes resume (guarded by `hasInvitations`) |

**Other layout changes:**
- Removed the bottom-right `lg:w-[180px]` button column containing the "View Full Profile" large button
- AI Summary box changed from `flex-col lg:flex-row` two-panel layout to a single full-width panel
- Summary expand icon changed from `IconEye` to `IconExternalLink`

**New dependency:** `react-icons` added to `frontend/package.json` for Heroicons and Phosphor Icons

### 4.3 Interview Invite Modal Integration

The Invite button on the candidate card now opens the `InterviewInviteModal` component (same modal used in `ResumeDetail.tsx`), instead of navigating away to the interview page.

**File changed:** `frontend/src/pages/product/TalentHub.tsx`
- Added `inviteResume` state (`EnrichedResume | null`)
- `handleInvite()` changed from `navigate('/product/interview', ...)` to `setInviteResume(resume)`
- Removed `useNavigate` import (no longer needed)
- Added `<InterviewInviteModal>` component render when `inviteResume` is set
- `onSuccess` callback refreshes the resume list

**File changed:** `frontend/src/components/InterviewInviteModal.tsx`
- Added `hiringRequestId` to job fetch mapping
- Sends `hiring_request_id` in the invitation API payload (needed for JD persistence)

---

## 5. Interview Invitation — JD Persistence

Fixed a bug where the Job Description tab was empty on the Interview Hub detail page (`/product/interview-hub/:id`). The JD was not being saved when interviews were created via invitation.

### 5.1 Save JD on Interview Creation

**File changed:** `backend/src/routes/api.ts` (`POST /api/v1/invite-candidate`)
- Added `jobDescription: jd.trim()` to the `Interview` create payload
- Previously only `jobTitle` was saved; the full JD text was used for the AI agent prompt but never persisted

### 5.2 Skip Re-Parsing for Known Resumes

Optimized the invitation endpoint to avoid redundant LLM resume parsing when the resume already has parsed data in the database.

**File changed:** `backend/src/routes/api.ts` (`POST /api/v1/invite-candidate`)
- Pre-loads `parsedData` from the `Resume` record when `resume_id` is provided
- Passes `preferredParsedResume` to `resolveResumeTextForInvitation()`
- If `parsedData` already exists, skips `getOrParseResume()` entirely (saves LLM tokens and latency)
- Falls back to content-hash upsert only when `resume_id` is not found

### 5.3 GoHire JD Backfill — On Sync

When the GoHire sync endpoint creates a `GoHireInterview` and the GoHire API doesn't return a JD (`job_info.job_jd` is null), the system now falls back through a chain:

1. Look up the original `Interview` record (by `gohireUserId`) for its `jobDescription`
2. If not found, look up the linked `HiringRequest` for its `jobDescription`

**File changed:** `backend/src/routes/gohireInterviews.ts` (`POST /sync-from-invite`)
- Added fallback lookup: `Interview` → `HiringRequest` → use whichever has a JD
- `GoHireInterview.create` data now uses `jobInfo?.job_jd || fallbackJobDescription || null`
- Changed 404 response to 200 with `code: 'GOHIRE_INTERVIEW_NOT_READY'` when GoHire data isn't available yet (avoids frontend error handling for timing issues)

### 5.4 GoHire JD Backfill — On Read

For existing `GoHireInterview` records that were created before the fix and have null JD, the GET endpoint now backfills on read.

**File changed:** `backend/src/routes/gohireInterviews.ts` (`GET /:id`)
- If `jobDescription` is null and `gohireUserId` is present, runs the same `Interview` → `HiringRequest` fallback chain
- Persists the backfilled JD to the database (so subsequent reads don't re-query)
- Returns the backfilled data in the response

---

## 6. Interview List API — Backend Sort & Search

Enhanced the interview listing API to support server-side sorting and search, enabling the new sortable table in the frontend.

**File changed:** `backend/src/routes/interviews.ts` (`GET /api/v1/interviews`)

- New query params: `sort`, `sortDir`, `search`, `filterUserId`, `filterTeamId`
- Sort fields whitelisted: `scheduledAt`, `completedAt`, `candidateName`, `createdAt`
- Search applies case-insensitive `contains` filter across `candidateName`, `candidateEmail`, `jobTitle`
- Page limit raised from 50 to 200 (supports frontend full-pagination fetch)
- Visibility filtering upgraded from `buildUserIdFilter()` to `buildAdminOverrideFilter()` (supports recruiter/team selector)
- Evaluation select now includes `createdAt` field

---

## Files Changed Summary

| File | Changes |
|---|---|
| `frontend/src/pages/product/AIInterview.tsx` | Status simplification, sortable table, pagination, overdue reminders, recruiter filter |
| `frontend/src/pages/ResumeDetail.tsx` | Map `in_progress` to `scheduled` in 3 tabs |
| `frontend/src/pages/Dashboard.tsx` | Map `in_progress` to `scheduled` |
| `frontend/src/pages/product/TalentHub.tsx` | Highlight badges, avatar removal, icon action buttons, invite modal integration, elite university list |
| `frontend/src/components/InterviewInviteModal.tsx` | New component — interview invitation modal with job selector, success state, QR code |
| `backend/src/routes/api.ts` | Save JD on interview creation, skip re-parsing for known resumes |
| `backend/src/routes/interviews.ts` | Send-reminders endpoint, server-side sort/search/filter, raised page limit |
| `backend/src/routes/gohireInterviews.ts` | JD fallback on sync, JD backfill on read, soft error for not-ready state |
| `backend/src/services/EmailService.ts` | Export `escapeHtml` |
| `backend/src/services/PDFService.ts` | Watermark detection + stripping |
| `frontend/package.json` | Added `react-icons` dependency |
| `frontend/src/i18n/locales/*/translation.json` (x8) | Interview column, overdue, and talent badge keys |
