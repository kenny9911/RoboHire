# Interview Hub — Technical Documentation

Interview Hub (`/product/interview-hub`) is RoboHire's centralised surface for AI-powered video interviews imported from the external GoHire platform. It ingests interview metadata + video + resume via CSV exports or live sync, parses resumes into the Talent Hub, links candidates to jobs and recruiters, and presents each interview with video player, resume, JD, transcript, and AI evaluation report in a single detail page.

---

## 1. Product Spec

### 1.1 Purpose

- **Primary user**: Recruitment admins and recruiters reviewing AI-screening interview recordings from GoHire.
- **Core value**: One-click ingestion of GoHire interview exports into RoboHire's candidate database (Talent Hub) with candidate ↔ recruiter ↔ job relationships automatically wired up.
- **Detail view**: A candidate-centric cockpit — video on the left, resume / JD / transcript tabs below, AI evaluation report on the right — so a recruiter can make a hire/no-hire decision without context-switching.

### 1.2 User Roles & Visibility

| Role | Can view Interview Hub | Can import CSV / sync / scan | Can see all interviews |
|------|------------------------|------------------------------|------------------------|
| `admin` | Yes | Yes | Yes |
| `internal` | Yes (sees own + team) | No | No |
| `agency` | Yes (sees own + team) | No | No |
| `user` | Yes (sees own) | No | No |

Visibility scoping uses `getVisibilityScope()` from `backend/src/lib/teamVisibility.ts`. `GoHireInterview.userId` is the canonical owner (recruiter) and is preferred over the legacy `recruiterEmail` matching for filtering.

### 1.3 Features

#### List page (`InterviewHub.tsx`)
- Paginated table of imported interviews (candidate, email, job, recruiter, date, duration, video icon, evaluation score)
- Full-text search on candidate name/email
- Filters: job title, recruiter, date range, has-video, has-evaluation
- Sort by any column
- Stats cards: total interviews, with-video count, with-evaluation count, top recruiters, top job titles
- **Admin-only action buttons** (top right):
  - **导入 CSV / Import CSV** — upload a GoHire CSV export
  - **同步简历 / Sync Resumes** — bulk backfill all interviews missing a Talent Hub resume
  - **扫描并选择 / Scan & Select** — read-only preview of missing resumes with per-row checkboxes before any DB writes
- Resume processing status badge on each row (green = synced, amber = pending, red = failed)
- Clickable candidate name links directly to Talent Hub resume detail
- Clickable job title links to Job detail

#### Detail page (`GoHireEvaluation.tsx`)
- **Header**: candidate name, job title, recruiter name, verdict badge, share button
- **Left panel**:
  - Video player (with transcript-synced seek on click)
  - Context tabs: Resume (parsed markdown + view original), JD, Transcript (per-segment with timestamps)
- **Right panel** (desktop) / **4th tab** (mobile):
  - AI evaluation report with score ring, recommendation, summary, expert insight, strengths/weaknesses, skill matrix, cheating detection warning
- **Desktop**: draggable vertical divider to resize left/right split; layout toggle (both / left only / right only) persisted in localStorage
- **Mobile**: collapsible header, compact tabs with an Evaluation tab, video auto-hides when Evaluation tab is active

### 1.4 Key User Flows

1. **Bulk CSV import** — Admin uploads GoHire export → Phase 1 (sync) creates User accounts for candidates/recruiters + Job records + GoHireInterview rows → returns batch ID → Phase 2 (async) downloads each resume, parses it via LLM, stores the original PDF, creates a Resume in Talent Hub, links the GoHireInterview
2. **Scan & Select** — Admin clicks "Scan" → read-only scan lists all interviews missing resumes with a recommended action (`create_new`, `link_existing`, `create_user_and_resume`, `no_email`, `no_url`) → admin checks specific rows (safe defaults exclude short interviews <9min and link-to-existing rows) → clicks "Create selected" → same processing pipeline runs on only the checked rows
3. **Full backfill** — Admin clicks "Sync Resumes" → all missing resumes are processed in parallel (10 concurrent) → live progress updates every 2s, with stop button for graceful cancellation
4. **Single interview review** — Recruiter clicks a row → detail page → watches video, reads parsed resume, generates/views AI evaluation → makes a hire decision

---

## 2. Architecture

### 2.1 High-level flow

```
 GoHire Platform
       │  (CSV export)
       ▼
┌────────────────────────┐      ┌──────────────────────┐
│  POST /import-csv      │      │  POST /backfill-     │
│  (admin only)          │      │  resumes (admin)     │
└──────┬─────────────────┘      └──────────┬───────────┘
       │                                   │
       ▼                                   ▼
┌──────────────────────────────────────────────────────┐
│           GoHireImportService                        │
│  ┌────────────────┐   ┌──────────────────────────┐   │
│  │ Phase 1 (sync) │   │ Phase 2 / Backfill       │   │
│  │ Create users   │   │ (async, 10 concurrent)   │   │
│  │ Create jobs    │   │ • Download resume        │   │
│  │ Create         │──►│ • Parse text + LLM       │   │
│  │   GoHireIntrv  │   │ • Store original PDF     │   │
│  │ Return batchId │   │ • Create Resume row      │   │
│  └────────────────┘   │ • Link FKs               │   │
│                       │ • Flush progress every 2s│   │
│                       └──────────┬───────────────┘   │
└──────────────────────────────────┼───────────────────┘
                                   ▼
                       ┌───────────────────────┐
                       │ GoHireImportBatch     │
                       │ (batch progress +     │
                       │ detailed report)      │
                       └───────────────────────┘
                                   ▲
                                   │ poll every 2s
                                   │
┌──────────────────────────────────┴───────────────────┐
│     Frontend InterviewHub.tsx                        │
│     GET /import-status/:batchId                      │
│     → live counters + currently-processing list      │
│     → final report with clickable links              │
└──────────────────────────────────────────────────────┘
```

### 2.2 Backend services

| Service | Responsibility |
|---------|----------------|
| `GoHireImportService` (`services/GoHireImportService.ts`) | Central orchestrator. Phase 1 sync (user/job/interview creation), Phase 2 async (resume download + parse + store + link), scan-only discovery, graceful stop, live progress flushing, race-safe duplicate handling via P2002 recovery |
| `GoHireEvaluationService` (`services/GoHireEvaluationService.ts`) | Generates AI evaluation reports from video/transcript. Also runs `CheatingDetectorAgent` |
| `DocumentParsingService` (`services/DocumentParsingService.ts`) | Unified text extraction: PDF (`pdf-parse` + LLM vision fallback), DOCX (`mammoth`), legacy DOC (`word-extractor`), XLSX, CSV, TXT, MD, JSON |
| `ResumeOriginalFileStorageService` (`services/ResumeOriginalFileStorageService.ts`) | Persists the original PDF buffer to local disk or S3 so "View Original Document" returns the real file (not a reconstructed one) |
| `ResumeParsingCache` (`services/ResumeParsingCache.ts`) | DB-first resume parsing via SHA-256 content hash. User-scoped lookup → global fallback → fresh LLM parse |
| `ResumeSummaryService` (`services/ResumeSummaryService.ts`) | Generates one-line candidate pitch + executive summary |
| `LoggerService` | Per-request structured logging with cost tracking |

### 2.3 Helper utilities (`backend/src/utils/`)

| File | Purpose |
|------|---------|
| `concurrency.ts` | `runConcurrent(tasks, limit)` — bounded-concurrency Promise runner. Shared with `MatchOrchestratorService` |
| `salaryParser.ts` | Regex-based Chinese salary extraction (`月薪13-17K`, `年薪20-30万`, `base3000+补贴600`) |
| `jobTitleNormalizer.ts` | Strips GoHire `_YYYYMMDDHHMMSS` timestamp suffix from job titles |
| `preferencesExtractor.ts` | Derives candidate preferences from JD (salary, location, work type) and resume parse (求职意向/期望薪资 sections) |

### 2.4 Frontend

| File | Lines | Purpose |
|------|-------|---------|
| `frontend/src/pages/product/InterviewHub.tsx` | ~1900 | List page, all import/scan/backfill flows, progress UI, report modals |
| `frontend/src/pages/product/GoHireEvaluation.tsx` | ~2200 | Detail page with video, tabs, evaluation report, mobile responsiveness |
| `frontend/src/pages/EvaluationSharedReport.tsx` | — | Public evaluation viewer via share token (no auth) |

---

## 3. Tech Stack

### 3.1 Backend

| Layer | Choice | Version |
|-------|--------|---------|
| Runtime | Node.js + TypeScript + tsx (dev) | — |
| Web framework | Express | — |
| ORM | Prisma + PostgreSQL (Neon) | `@prisma/client` ^6.9.0 |
| Auth | bcryptjs (password hash) + JWT + session tokens | `bcryptjs` ^3.0.3 |
| File upload | multer (memory storage, 20MB CSV / 10MB resume) | `multer` ^1.4.5-lts.1 |
| PDF parsing | `pdf-parse` + fallback to LLM vision | `pdf-parse` ^1.1.1 |
| DOCX parsing | `mammoth` | `mammoth` ^1.11.0 |
| Legacy DOC parsing | `word-extractor` (pure-JS OLE compound reader) | `word-extractor` ^1.0.4 |
| Excel/CSV | `xlsx` | `xlsx` ^0.18.5 |
| LLM | Abstract `LLMService` routing to OpenAI / OpenRouter / Google / Kimi via `LLM_PROVIDER` | — |
| Storage | Local disk (default) or S3 (`@aws-sdk/client-s3`) for original resumes | — |

### 3.2 Frontend

| Layer | Choice |
|-------|--------|
| Framework | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS with arbitrary-value utilities |
| Routing | react-router-dom v6 nested routes |
| HTTP | Axios instance with auto-inject JWT (`lib/axios.ts`) |
| Markdown | `react-markdown` for parsed resume rendering |
| i18n | i18next (8 languages: en, zh, zh-TW, ja, es, fr, pt, de) |
| PDF viewing | Native browser `<iframe>` with blob URLs |
| State | React Context only (no Redux) |

---

## 4. Data Model

### 4.1 `GoHireInterview`

Core model — one row per interview recording.

**GoHire-provided fields:**
`id`, `gohireUserId`, `candidateName`, `candidateEmail`, `interviewDatetime`, `interviewEndDatetime`, `duration`, `videoUrl`, `recruiterName`, `recruiterEmail`, `recruiterId`, `jobTitle`, `jobDescription`, `jobRequirements`, `interviewRequirements`, `resumeUrl`, `transcriptUrl`, `lastLoginAt`, `invitedAt`, `transcript`

**AI evaluation fields:**
`parsedResumeText`, `evaluationData` (JSON), `evaluationScore`, `evaluationVerdict`, `evaluationShareToken`

**Relational FKs (populated by import pipeline):**
- `candidateUserId` → `User.id` — the candidate's user account (for future candidate portal)
- `userId` → `User.id` — the recruiter/owner of this interview (drives visibility scoping)
- `resumeId` → `Resume.id` — the parsed resume in Talent Hub
- `jobId` → `Job.id` — the linked job posting

**Processing state:**
- `resumeProcessingStatus` — `pending | processing | completed | failed | skipped`
- `resumeProcessingError` — error message if failed
- `importBatchId` — groups records from the same import run

### 4.2 `GoHireImportBatch`

Tracks a single CSV import or backfill run.

`id`, `adminUserId`, `fileName`, `totalRows`, `phase1Completed`, `phase2Completed`, `usersCreated`, `usersLinked`, `jobsCreated`, `jobsLinked`, `resumesCreated`, `resumesFailed`, `resumesPending`, `interviewsCreated`, `interviewsUpdated`, `interviewsSkipped`, `errors` (JSON — holds the detailed report with per-row created/skippedExisting/skippedNoEmail/failed lists), `createdAt`, `updatedAt`.

The `errors` JSON field is the source of truth for the live progress report that the frontend polls.

### 4.3 Related models

- `User` — candidate accounts created during import use `role: 'user'` + `provider: 'gohire_import'`
- `Resume` — Talent Hub resume rows, deduped by `(userId, contentHash)` unique constraint. Stores `recruiterUserId` to link candidate ↔ recruiter. `originalFile*` fields reference the stored original PDF
- `Job` — deduped by normalized title + userId. Salary auto-parsed from JD

---

## 5. API Surface

All routes under `/api/v1/gohire-interviews/`. Written in `backend/src/routes/gohireInterviews.ts`.

### 5.1 Public
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/shared/:token` | Public evaluation report (share link, no auth) |

### 5.2 Authenticated (all users)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | List interviews with filters, search, pagination, sort. Applies visibility scope |
| GET | `/stats` | Aggregate counts + top recruiters/jobs |
| GET | `/:id` | Single interview detail |
| PATCH | `/:id` | Update interview metadata (evaluation notes, etc.) |
| GET | `/:id/resume-file` | Download original resume PDF (falls back to reconstructed if not stored) |
| POST | `/:id/parse-resume` | Re-parse the resume from `resumeUrl` |
| POST | `/:id/transcript` | Upload transcript data (used by LiveKit agent callback) |
| POST | `/:id/transcribe` | Trigger video transcription |
| POST | `/:id/load-transcript` | Load transcript from stored URL |
| POST | `/:id/evaluate` | Generate AI evaluation report |
| POST | `/:id/share` | Create public share token |
| DELETE | `/:id/share` | Revoke share token |
| POST | `/sync-from-invite` | Sync single completed interview from GoHire API |

### 5.3 Admin only (`requireAdmin`)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/import-csv` | Upload GoHire CSV export → runs Phase 1 sync + fires Phase 2 async |
| GET | `/import-status/:batchId` | Poll batch progress (returns `batch`, `statusBreakdown`, `runtime` with currently-processing items) |
| POST | `/backfill-stop/:batchId` | Request graceful stop of a running batch |
| GET | `/missing-resumes` | Read-only scan: list all interviews missing a Resume, enriched with recommended action per row |
| POST | `/create-selected-resumes` | Process only the specified interview IDs through the backfill pipeline |
| POST | `/backfill-resumes` | Process all interviews missing a resume |

---

## 6. Key Flows (detail)

### 6.1 CSV import pipeline

**Phase 1 — synchronous (~2-5s, returns immediately to frontend)**

1. Admin uploads CSV to `POST /import-csv`
2. Custom CSV parser handles quoted fields with embedded newlines/commas
3. Create a `GoHireImportBatch` row
4. `GoHireImportService.processPhase1Sync()` loops rows:
   - **Candidate user**: `findUnique(email)` → if exists link, else create `User` with `provider: 'gohire_import'` + random bcrypt-hashed password
   - **Recruiter**: `findUnique(recruiterEmail)` → if exists link as `GoHireInterview.userId`, else skip
   - **Job**: `findFirst(title: normalizedTitle, userId: owner)` → if exists link, else create with salary parsed from JD
   - **GoHireInterview**: create/update with all FKs populated; dedup by `(gohireUserId, interviewDatetime)`; set `resumeProcessingStatus: resumeUrl ? 'pending' : 'skipped'`
5. Returns `{batchId, totalToProcess, resumeProcessingStarted}` + per-row stats
6. Fires Phase 2 as a detached promise with `.catch(log)` — never awaited

**Phase 2 — asynchronous (fire-and-forget, ~4-12 minutes for 100 resumes)**

1. Query all interviews in this batch with `resumeProcessingStatus: 'pending'`
2. Start a `setInterval` that flushes in-progress report to `batch.errors` every 2 seconds
3. Run `runConcurrent(tasks, RESUME_PROCESS_CONCURRENCY=10)`:
   - Per-task `finally` block removes from in-flight tracking map
   - Each task calls `processOneResume(interview)`:
     1. **Safety check**: look up existing resume by `email` OR `userId` — if found, link and return (never overwrite)
     2. Mark `resumeProcessingStatus: 'processing'`
     3. Download file with 30s timeout via `AbortController`
     4. Detect mimetype (URL extension → Content-Type → magic bytes)
     5. `documentParsingService.extractText()` — PDF / DOCX / legacy DOC / etc.
     6. `normalizeExtractedText()` + compute SHA-256 content hash
     7. `getOrParseResume()` — cache-first LLM parse
     8. `generateResumeSummaryHighlight()` — AI pitch text
     9. `extractPreferencesFromJob()` + `enrichPreferencesFromResume()` — candidate preferences
     10. `resumeOriginalFileStorageService.saveFile()` — persist original PDF
     11. `prisma.resume.create()` with all fields. On P2002 unique constraint race → recover by fetching the row that won the race
     12. Update `GoHireInterview` with `resumeId`, `resumeProcessingStatus: 'completed'`
4. `finally`: `clearInterval(flushInterval)` + final flush with `phase2Completed: true`
5. Create in-app notification for the admin

### 6.2 Graceful stop

- In-memory `_stoppingBatches: Set<string>` map on the service
- `POST /backfill-stop/:batchId` adds the ID to the set
- Each task checks the set at its start — if requested, skip the task (added to `notProcessed` list)
- Tasks already past the check complete naturally — no forced abort
- After `runConcurrent` returns, service detects `wasStopped` and builds a final report with `notProcessed` populated
- Cleans up in-memory state (`_currentlyProcessing`, `_stoppingBatches`)

### 6.3 Scan & Select (read-only preview)

- `GET /missing-resumes` returns enriched per-row data: whether candidate user exists, whether a resume already exists (by email OR userId), whether recruiter exists, and a `recommendedAction`
- Frontend renders a modal with filter chips, search, checkboxes per row
- Default selection: only `create_new` / `create_user_and_resume` rows AND excludes short interviews (<9 minutes)
- Clicking "Create selected" → `POST /create-selected-resumes {interviewIds}` — runs the same `runBackfill` pipeline but restricted to the passed IDs
- Backend always re-filters `resumeId: null` before processing so rows processed between scan and submit are naturally skipped

### 6.4 Live progress updates

- Backend: `setInterval` in `runBackfill` / `processPhase2Async` flushes `report.created/skippedExisting/failed/notProcessed` to `batch.errors` every 2 seconds
- Frontend: polls `GET /import-status/:batchId` every 2 seconds, extracts counts from `batch.errors`, rebuilds the progress UI
- Counters animate in real time (not stuck at 0 until the end as in earlier versions)
- `runtime.processing` shows the list of currently-processing candidate names with per-item elapsed seconds

### 6.5 Race-safe resume creation

Multiple concurrent tasks can process interviews for the same candidate (same email → same `userId` → same `contentHash`). The unique constraint `@@unique([userId, contentHash])` would cause one to succeed and others to fail with Prisma `P2002`. The pipeline catches this specific error and looks up the row that won the race, then links to it as if the initial dedup check had found it. No data is lost.

---

## 7. Mobile UI

The detail page (`GoHireEvaluation.tsx`) uses CSS-based responsive layout (no JSX duplication):

- **Desktop (`lg+`)**: Two-column layout with draggable divider. Video + tabs on the left, full evaluation report on the right.
- **Mobile (`< lg`)**:
  - Header compacts (smaller text, icon-only back button)
  - Left panel: video constrained to `max-h-[30vh]` with `aspect-video`
  - Tabs show a **4th "评估" tab** (`lg:hidden`) alongside resume/JD/transcript
  - When the Evaluation tab is active: video and tab content are hidden (`hidden lg:block`), left panel collapses to `flex-none`, and the right panel (`hidden lg:flex` by default) switches to `flex` and takes the full remaining vertical space
  - The same right-panel JSX renders in both layouts — no duplication — just visibility swapped by Tailwind responsive classes
- **Admin action buttons** and the mobile Evaluation tab are gated by role (admin only for the action row)

---

## 8. Environment & Configuration

### 8.1 Required env vars

```bash
# LLM routing (resume parsing, evaluation, cheating detection)
LLM_PROVIDER=google      # openai | openrouter | google | kimi | direct
LLM_MODEL=google/gemini-3-flash-preview
GOOGLE_API_KEY=...       # or OPENAI_API_KEY / OPENROUTER_API_KEY / KIMI_API_KEY

# Database
DATABASE_URL=postgresql://...

# Authentication
JWT_SECRET=...

# Original resume file storage
RESUME_FILE_STORAGE_PROVIDER=local   # local | s3 | none (default: local)
RESUME_FILE_STORAGE_LOCAL_DIR=./storage
# If using S3:
S3_BUCKET=...
S3_REGION=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...

# Optional
GOHIRE_INVITATION_API=https://...
DOCUMENT_STORAGE_DIR=./storage/documents
```

### 8.2 Service constants (hardcoded)

| Constant | Value | Location |
|----------|-------|----------|
| `RESUME_PROCESS_CONCURRENCY` | `10` | `GoHireImportService.ts:65` |
| `RESUME_DOWNLOAD_TIMEOUT_MS` | `30_000` | `GoHireImportService.ts:64` |
| CSV upload limit | `20 MB` | `gohireInterviews.ts` multer config |
| Resume upload limit | `10 MB` | `resumes.ts` multer config |
| Progress flush interval | `2000 ms` | both `runBackfill` and `processPhase2Async` |
| Frontend polling interval | `2000 ms` | `InterviewHub.tsx` polling handlers |
| Short interview threshold | `9 minutes` | scan modal filter |

### 8.3 Feature flags

None. Features are gated by user role only (admin / internal / agency / user).

---

## 9. Testing & Verification

No automated tests are configured (per CLAUDE.md: "No test or lint commands are configured"). Verification is manual smoke testing.

### 9.1 Smoke test checklist after changes

**Authentication & routing**
- [ ] Login → land on `/product` → sidebar renders without errors
- [ ] Admin sees all admin-only buttons on `/product/interview-hub`; non-admin users do not

**CSV import**
- [ ] Upload `gohire_interview_list_all_20260321022935.csv` (or similar)
- [ ] Phase 1 returns within 5 seconds with counts for users created/linked, jobs created/linked, interviews created
- [ ] Phase 2 progress counters update every ~2 seconds (not stuck at 0)
- [ ] Currently-processing list shows candidate names with per-item elapsed seconds
- [ ] Stop button gracefully stops — in-flight resumes finish, remaining go to `notProcessed`
- [ ] Final report shows 4 expandable lists (Created, Already Exist, No Email, Failed) with clickable links to Talent Hub and original PDFs
- [ ] Re-importing the same CSV does not create duplicate Users/Jobs/Resumes (idempotency)

**Scan & Select**
- [ ] Click "Scan & Select" → modal opens with all interviews missing resumes
- [ ] Filters, search, "Unselect all", "Only new", "Hide short interviews" all work
- [ ] Row with existing resume shows `link_existing` action (unchecked by default)
- [ ] Row with no email shows `no_email` action (disabled)
- [ ] Click "Create N resumes" → only selected rows process
- [ ] Same progress UI as full backfill

**Talent Hub integration**
- [ ] After sync, candidates appear in `/product/talent` with `source: 'gohire_import'`
- [ ] Each synced Resume has `recruiterUserId` set to the interview's recruiter
- [ ] "View Original Document" returns the actual PDF (not a reconstructed text-based one)
- [ ] Legacy `.doc` files are handled (tested by uploading a `.doc` resume URL)

**Detail page (desktop)**
- [ ] Video plays; panel layout toggle (both/left/right) works and persists
- [ ] Resume tab shows parsed markdown; "View original" opens the PDF viewer
- [ ] Transcript tab clicks seek video
- [ ] Evaluation tab shows score ring, recommendation, strengths/weaknesses, cheating warning (if present)
- [ ] Share button creates a public link; `/product/interview-hub/shared/:token` renders without auth

**Detail page (mobile, width < 1024px)**
- [ ] Header compacts, back button collapses to icon
- [ ] Video is constrained to `max-h-[30vh]`
- [ ] Tabs row shows 4 items (including Evaluation)
- [ ] Clicking Evaluation tab → video and tab content hide, evaluation report fills the screen
- [ ] Switching to Resume/JD/Transcript → video + tab content reappear

**Race conditions & errors**
- [ ] Intentionally trigger a race by re-running backfill twice simultaneously (shouldn't happen in practice) → no P2002 errors surface to UI
- [ ] Broken resume URL (404) is reported in the Failed list with the HTTP status code, not a generic error
- [ ] Admin receives an in-app notification on batch completion

### 9.2 Manual DB verification

```bash
# Check row counts after a CSV import
npm run db:studio --workspace=backend
# Open GoHireInterview, GoHireImportBatch, User (filter provider='gohire_import'), Resume (source='gohire_import'), Job

# Or via prisma query
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const imported = await p.goHireInterview.count({ where: { importBatchId: { not: null } } });
  const linked = await p.goHireInterview.count({ where: { resumeId: { not: null } } });
  const candidates = await p.user.count({ where: { provider: 'gohire_import' } });
  console.log({ imported, linked, candidates });
  await p.\$disconnect();
})();
"
```

### 9.3 Known edge cases

- **Duplicate candidates across interviews** — handled by race-safe P2002 recovery
- **Missing candidate email** — marked as `skippedNoEmail` (cannot create User without email)
- **Dead resume URLs (HTTP 404)** — surfaced in the Failed list with the HTTP status
- **Very short interviews (<9 min)** — hidden by default in the Scan modal; user can un-hide to process them
- **Same job title reused across recruiters** — deduped by `(title, ownerUserId)` so different recruiters keep separate Jobs
- **Legacy .doc files** — auto-detected by OLE compound magic bytes (`0xD0CF11E0`) and parsed via `word-extractor`

---

## 10. Key File Pointers

| Concern | File |
|---|---|
| List page | `frontend/src/pages/product/InterviewHub.tsx` |
| Detail page | `frontend/src/pages/product/GoHireEvaluation.tsx` |
| Public share viewer | `frontend/src/pages/EvaluationSharedReport.tsx` |
| Backend routes | `backend/src/routes/gohireInterviews.ts` |
| Import pipeline | `backend/src/services/GoHireImportService.ts` |
| Evaluation generation | `backend/src/services/GoHireEvaluationService.ts` |
| Document parsing | `backend/src/services/DocumentParsingService.ts` |
| Original file storage | `backend/src/services/ResumeOriginalFileStorageService.ts` |
| Resume parsing cache | `backend/src/services/ResumeParsingCache.ts` |
| Import utilities | `backend/src/utils/{concurrency,salaryParser,jobTitleNormalizer,preferencesExtractor}.ts` |
| Prisma schema | `backend/prisma/schema.prisma` (search `GoHireInterview`, `GoHireImportBatch`) |
| i18n keys | `frontend/src/i18n/locales/{lang}/translation.json` (`interviewHub`, `goHireEval`) |
| Conversation history | `interview-hub-prompts.md` (chronological log of build-out prompts) |

---

## Change log (major milestones)

1. **Initial CSV import** — created `GoHireInterview` records from GoHire CSV exports with 19 columns (no FK links)
2. **Full data integration** — added FKs + two-phase pipeline: Phase 1 creates Users/Jobs, Phase 2 async downloads and parses resumes
3. **Recruiter association** — Resume `recruiterUserId` set during creation so candidates are linked to their recruiter
4. **Scan & Select** — read-only preview with per-row checkboxes before any DB writes
5. **Graceful stop + live progress** — in-memory stop flag + 2s flush interval for real-time counters
6. **Race-safe concurrency** — bumped from 3 to 10 parallel agents, added P2002 recovery
7. **Mobile-friendly detail page** — Evaluation as 4th tab on mobile via CSS-only responsive layout
8. **Original PDF storage** — `ResumeOriginalFileStorageService.saveFile()` persists the raw buffer so "View Original" works
9. **Legacy .doc support** — `word-extractor` for OLE compound files, auto-detected via magic bytes
10. **Admin-only gating** — Import/Sync/Scan buttons hidden from non-admin roles; Client Management section restricted to `agency` + `admin`
