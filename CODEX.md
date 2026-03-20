# CODEX.md

This file is a working guide for Codex (and other coding agents) in this repository.

## Purpose

RoboHire is a monorepo for an AI-powered recruiting product:

- `backend/`: Express + TypeScript API (AI agents, auth, billing, usage, hiring workflows)
- `frontend/`: React + Vite SPA (marketing site, docs, dashboard, API playground, Start Hiring flow)

This guide summarizes the codebase structure, key execution flows, and change-safety notes after a repo-wide review.

## Repository Snapshot

- Monorepo: npm workspaces (`backend`, `frontend`)
- Source stack:
  - Backend: Node.js, Express, Prisma, PostgreSQL, Stripe, Passport, multer, pdf-parse, mammoth, xlsx
  - Frontend: React 18, Vite, TypeScript, Tailwind, i18next, Axios, Recharts
- Default local ports:
  - Frontend: `3607`
  - Backend: `4607`

## Quick Commands

### Root

```bash
npm install
npm run dev              # backend + frontend concurrently
npm run dev:backend
npm run dev:frontend
npm run build            # builds both workspaces
npm run start            # starts backend only (built code)

# convenience scripts
npm run services:start
npm run services:stop
npm run services:restart
```

### Backend (Prisma / DB)

```bash
npm run db:generate --workspace=backend
npm run db:push --workspace=backend
npm run db:migrate --workspace=backend
npm run db:migrate:deploy --workspace=backend
npm run db:studio --workspace=backend
npm run db:seed --workspace=backend
```

### Frontend

```bash
npm run dev --workspace=frontend
npm run build --workspace=frontend
npm run preview --workspace=frontend
```

## Environment Setup

Copy `.env.example` to `.env` at repo root:

```bash
cp .env.example .env
```

Important env groups in `.env.example`:

- LLM provider/model:
  - `LLM_PROVIDER` (`openai`, `openrouter`, `google`, `kimi`)
  - `LLM_MODEL`
  - `LLM_FAST` (used by `/api/v1/hiring-requests/generate-brief`)
  - `LLM_VISION_MODEL` / `PDF_VISION_MODEL` (used for harder PDF extraction paths)
  - Provider API keys (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `KIMI_API_KEY`)
- Database:
  - `DATABASE_URL` (PostgreSQL)
- Auth:
  - `JWT_SECRET`
  - `JWT_EXPIRES_IN`
  - `SESSION_EXPIRES_IN`
  - `FRONTEND_URL`
  - `OAUTH_CALLBACK_URL`
  - OAuth provider client IDs/secrets
- Stripe (optional billing features):
  - `STRIPE_SECRET_KEY`
  - `STRIPE_PUBLISHABLE_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - plan price IDs
- App/runtime:
  - `PORT`
  - `NODE_ENV`
  - `RECRUITER_EMAIL`
  - `GOHIRE_INVITATION_API`
- Logging/storage:
  - `LOG_LEVEL`
  - `FILE_LOGGING`
  - `LOG_DIR`
  - `DOCUMENT_STORAGE_DIR`

Demo credentials (after seed):

- Email: `demo@robohire.io`
- Password: `demo1234`

## Project Structure (High Level)

```text
/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── src/
│       ├── agents/
│       ├── middleware/
│       ├── routes/
│       ├── services/
│       ├── types/
│       └── index.ts
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── data/
│   │   ├── i18n/
│   │   ├── layouts/
│   │   ├── pages/
│   │   └── lib/
│   ├── vite.config.ts
│   └── tailwind.config.js
├── scripts/
├── render.yaml
├── README.md
├── API_DOCUMENTATION.md
└── CLAUDE.md
```

## Backend Architecture

### Entry Point and Middleware

`backend/src/index.ts` builds the Express app and wires middleware/routes.

Notable behavior:

- Loads env from root `.env` first, then `backend/.env` (if present)
- Uses `cors`, `cookie-parser`, `passport`
- Applies raw body parsing specifically for Stripe webhook before JSON parser
- Adds request ID middleware (`X-Request-Id`)
- Adds request audit pipeline (`beginRequestLogging`, `persistRequestAudit`) for `/api/*`
- Mounts auth + API + hiring + usage + checkout + demo + resumes + admin routes
- Centralized error handler returns JSON errors
- Graceful shutdown on `SIGINT` / `SIGTERM` with logger summary

Change-safety note:

- Do not move the Stripe webhook raw parser behind `express.json()` or signature validation will break.

### Core Backend Modules

#### Agents (`backend/src/agents`)

All AI features follow a `BaseAgent<TInput, TOutput>` pattern:

- `BaseAgent.ts`: common execution, prompt assembly, language-aware prompting, logger integration
- `ResumeParseAgent.ts`: parse resume text to structured JSON
- `JDParseAgent.ts`: parse JD text to structured JSON
- `ResumeMatchAgent.ts`: detailed resume-vs-JD evaluation and interview question generation
- `EvaluationAgent.ts`: interview transcript evaluation, score caps, must-have verification
- `CheatingDetectorAgent.ts`: AI-assisted answer detection
- `InviteAgent.ts`: invitation message generation (with external API path + fallback)
- `CreateJDAgent.ts`: generate JD drafts
- `RecruitmentConsultantAgent.ts`: hiring intake chat; emits action markers like `[[ACTION:CREATE_REQUEST]]`

#### Services (`backend/src/services`)

- `llm/LLMService.ts`: provider abstraction and routing (`openai`, `openrouter`, `google`, `kimi`)
- `llm/*Provider.ts`: provider-specific implementations
- `AuthService.ts`: signup/login/session/JWT/OAuth account linking/profile/password
- `LoggerService.ts`: JSONL logs, request tracking, token/cost accounting, summaries
- `DocumentStorageService.ts`: file-based cache of parsed resumes/JDs/match results by content hash
- `DocumentParsingService.ts`: unified PDF/DOCX/XLSX/TXT/MD/JSON extraction with MIME + filename detection; legacy binary `.doc` is rejected and should be resaved as `.docx`
- `PDFService.ts`: PDF extraction, text cleanup, and multimodal fallback for harder PDFs when needed
- `LanguageService.ts`: language detection + prompt language hints
- `pricingConfig.ts`: central pricing matrix + discount config loading/parsing

#### Middleware (`backend/src/middleware`)

- `auth.ts`:
  - Supports API key, JWT bearer token, session cookie, session header, and query token
  - Includes `requireAuth`, `optionalAuth`, scope checks
  - Auth endpoint rate limiting helpers
- `rateLimiter.ts`:
  - In-memory sliding window limiter (API key or IP based)
  - Adds rate-limit headers
  - Resets on server restart (not distributed)
- `requestId.ts`:
  - Attaches request ID to request + response header
- `requestAudit.ts`:
  - Starts request context and persists `ApiRequestLog` + `LLMCallLog` rows on response finish
- `usageTracker.ts`:
  - Persists API usage records after response completes
- `usageMeter.ts`:
  - Enforces plan limits + top-up deduction for billable endpoints only

#### Types (`backend/src/types`)

- `index.ts`: shared API request/response types, parsed document shapes, match/eval output schemas
- `auth.ts`: Express `Request` extensions (`requestId`, auth/session/api key fields)
- `pdf-parse.d.ts`: custom typing shim

### API Route Map

#### Auth (`/api/auth`)

`backend/src/routes/auth.ts`

- Email/password signup/login/logout
- Current user (`/me`)
- Profile update / change password
- OAuth: Google, GitHub, LinkedIn

#### Core AI + Ops (`/api/v1`)

`backend/src/routes/api.ts`

- `POST /match-resume`
- `POST /invite-candidate`
- `POST /parse-resume` (PDF upload via multer memory storage)
- `POST /parse-jd` (document upload via the unified parser)
- `POST /extract-document` (raw text extraction for uploads; optional auth)
- `POST /evaluate-interview`
- `GET /health`
- `GET /stats`
- `GET /documents`
- `GET /logs`

#### Hiring Requests + Helpers (`/api/v1/hiring-requests`)

`backend/src/routes/hiring.ts`

- Title suggestion + JD draft generation (can be optional auth depending on endpoint)
- `/generate-brief` uses `LLM_FAST` when configured, then falls back to the default model
- CRUD for hiring requests
- Candidate status updates/listing under a request

#### Hiring Sessions (`/api/v1/hiring-sessions`)

`backend/src/routes/hiringSessions.ts`

- Create/list/get/update/delete chat sessions
- Append messages to a session

#### Hiring Chat (`/api/v1/hiring-chat`)

`backend/src/routes/hiringChat.ts`

- Recruitment consultant conversation endpoint
- Optional auth
- Can persist session-aware chat history when session IDs are used

#### Developer Platform / Billing

- `backend/src/routes/apiKeys.ts`: create/list/reveal/regenerate/update/delete API keys
- `backend/src/routes/usage.ts`: usage list/summary/by-key aggregations + call history/detail
- `backend/src/routes/checkout.ts`: Stripe checkout, top-ups, billing history, webhooks, public pricing config
- `backend/src/routes/admin.ts`: admin analytics, user controls, and pricing config management
- `backend/src/routes/resumes.ts`: resume library upload/list/detail/insights/job-fit APIs
- `backend/src/routes/demo.ts`: demo request capture endpoint

### Data Model (Prisma)

Schema: `backend/prisma/schema.prisma`

Key models:

- `User`
  - auth identity, subscription tier/status, Stripe IDs, trials, usage counters, top-up balance
- `Session`
  - DB-backed auth sessions (token)
- `HiringRequest`
  - stored job requests and linked candidates
- `Candidate`
  - candidate data/status tied to a hiring request
- `HiringSession`
  - Start Hiring chat history/session persistence
- `ApiKey`
  - hashed API keys + scopes/active status
- `ApiUsageRecord`
  - endpoint usage/tokens/cost tracking
- `ApiRequestLog`
  - request-level audit logs with request/response payload capture
- `LLMCallLog`
  - per-LLM-call token/cost telemetry tied to request log
- `AppConfig`
  - key/value app configuration (pricing, Stripe IDs, discount settings)
- `Resume`
  - user-owned parsed resumes, metadata, AI insights, and status/tags/notes
- `ResumeJobFit`
  - join table for resume-vs-hiring-request fit analyses

Seed script: `backend/prisma/seed.ts`

- Creates demo user and sample hiring request data

### Backend Runtime Outputs (Local Files)

Generated at runtime (depending on config):

- `logs/` (JSON Lines request/system logs; file logging can be disabled)
- `parsed-documents/` (cached parsed resumes, JDs, match results)

Do not commit generated runtime data unless intentionally needed for debugging.

## Frontend Architecture

### App Shell and Routing

Routing is defined in `frontend/src/App.tsx`.

Major route groups:

- Public marketing/product pages:
  - `/`
  - `/login`
  - `/start-hiring`
  - `/developers`
  - `/pricing`
  - `/request-demo`
  - `/quick-invite`
- Protected dashboard:
  - `/dashboard`
  - `/dashboard/resumes`
  - `/dashboard/resumes/:id`
  - `/dashboard/api-keys`
  - `/dashboard/usage`
  - `/dashboard/usage/calls/:id`
  - `/dashboard/stats`
  - `/dashboard/account`
  - `/dashboard/admin`
  - `/dashboard/requests/:id`
- API playground:
  - `/api-playground/*`
- Docs:
  - `/docs/*`

`frontend/src/components/ProtectedRoute.tsx` gates dashboard routes.

### Frontend State and Infrastructure

- `frontend/src/context/AuthContext.tsx`
  - Handles session restore via `/api/auth/me`
  - Stores JWT in `localStorage` (`auth_token`)
  - Supports login/signup/logout/refresh
- `frontend/src/context/FormDataContext.tsx`
  - Shares resume/JD payloads across playground pages
- `frontend/src/lib/axios.ts`
  - Sets `axios.defaults.baseURL` from `VITE_API_URL`
  - Auto-injects `Authorization: Bearer <token>` from localStorage
- `frontend/src/config.ts`
  - `API_BASE = VITE_API_URL || ''`
  - In dev, Vite proxy handles `/api` to backend
- `frontend/src/components/ReleaseVersionGuard.tsx`
  - Mounted from `frontend/src/main.tsx`
  - Polls `/version.json` with `no-store`, also checks on focus/visibility, and reloads stale tabs after deploys

### i18n

- `frontend/src/i18n/index.ts`
- Uses `i18next` + browser language detector
- Supported locales: `en`, `zh`, `zh-TW`, `ja`, `es`, `fr`, `pt`, `de`

### Layouts

- `frontend/src/layouts/DashboardLayout.tsx`
  - Sidebar/topbar dashboard shell
  - Notification dropdown assembled from recent candidates/hiring requests
- `frontend/src/layouts/APIPlayground.tsx`
  - Playground navigation, auth warning, docs/developer links
- `frontend/src/layouts/DocsLayout.tsx`
  - Docs sidebar/topnav/mobile menu

### Key Frontend Pages

#### `Start Hiring` (Complex Flow)

Primary file: `frontend/src/pages/StartHiring.tsx`

This is the most complex product page and a common place for regressions.

Behavior:

- AI consultant chat-style intake UX
- Optional authenticated persistence via hiring sessions API
- Unauthenticated mode keeps ephemeral history in local state
- Supports role templates and quick prompts
- Supports JD attachment extraction through backend `POST /api/v1/extract-document`
- JD attachment pickers accept `.pdf`, `.docx`, `.txt`, `.md`, `.markdown`
- The landing uploader and the composer attachment flow both pass extracted JD text into the hiring chat / request creation flow
- Detects assistant action markers (`create_request`)
- Confirmation step lets user edit generated title/JD with markdown + preview modes
- Thinking state UI is surfaced with localized step-by-step reasoning labels
- "Try asking" follow-up suggestions are rendered beneath assistant responses
- Creates final hiring request through API after confirmation

Related helper data/components:

- `frontend/src/data/hiringTemplates.ts`
- `frontend/src/components/hiring/*`

Note: some hiring components appear reusable/legacy while `StartHiring.tsx` contains a large amount of inline UI logic.

#### API Playground Pages

- `frontend/src/pages/MatchResume.tsx`
- `frontend/src/pages/InviteCandidate.tsx`
- `frontend/src/pages/ParseResume.tsx`
- `frontend/src/pages/ParseJD.tsx`
- `frontend/src/pages/EvaluateInterview.tsx`

Shared output/rendering components:

- `frontend/src/components/MatchResultDisplay.tsx` (very large formatted match UI)
- `frontend/src/components/EvaluationResultDisplay.tsx` (very large formatted evaluation UI)
- `frontend/src/components/ResultViewer.tsx`
- `frontend/src/components/JsonViewer.tsx`
- `frontend/src/components/ApiInfoPanel.tsx`

#### Dashboard Pages

- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/pages/ResumeLibrary.tsx`
- `frontend/src/pages/ResumeDetail.tsx`
- `frontend/src/pages/APIKeys.tsx`
- `frontend/src/pages/UsageDashboard.tsx`
- `frontend/src/pages/CallDetail.tsx`
- `frontend/src/pages/DashboardStats.tsx`
- `frontend/src/pages/Account.tsx`
- `frontend/src/pages/AdminDashboard.tsx`

These pages depend on authenticated backend routes and are tightly coupled to the current response shapes. `UsageDashboard.tsx` now shows both API-key usage and website feature usage derived from request-audit logs.

#### Docs Pages

`frontend/src/pages/docs/*`

Static docs pages rendered inside `DocsLayout`:

- Overview / Quick Start
- Authentication
- Endpoint pages (match, invite, parse resume, parse JD, evaluate interview)
- Error handling
- Webhooks

If backend response formats or auth headers change, docs pages and examples may need manual updates.

### Styling and Build

- Tailwind configured in `frontend/tailwind.config.js`
- Vite config in `frontend/vite.config.ts`
  - Dev server port `3607`
  - Proxy `/api` -> `http://localhost:4607`
  - Emits `version.json` for release detection

## Deployment

Render blueprint: `render.yaml`

- Backend service (`robohire-api`)
  - Node runtime
  - `rootDir: backend`
  - build runs Prisma generate + `prisma db push` + backend build
  - production `PORT=10000`
- Frontend service (`robohire-web`)
  - Static site build from `frontend/dist`
  - SPA rewrite to `/index.html`
  - `VITE_API_URL` points to backend origin
  - Cache headers keep `index.html` and `version.json` uncached while `/assets/*` stays immutable

## Operational / Change Notes

### No Automated Tests or Lint in Repo Scripts

At the time of review:

- No root `test` script
- No root `lint` script
- No backend/frontend test suites configured in package scripts

Verify changes manually (API endpoint smoke tests, UI route checks) unless you add testing infrastructure.

### High-Risk Files (Large / Complex)

These files have dense logic and higher regression risk:

- `frontend/src/components/MatchResultDisplay.tsx`
- `frontend/src/pages/StartHiring.tsx`
- `frontend/src/components/EvaluationResultDisplay.tsx`
- `backend/src/services/LoggerService.ts`
- `backend/src/routes/api.ts`
- `backend/src/routes/auth.ts`
- `backend/src/routes/hiring.ts`
- `backend/src/agents/EvaluationAgent.ts`
- `backend/src/agents/ResumeMatchAgent.ts`

### Backend Behavior Details That Matter

- Rate limiting is in-memory and per-process only.
- Usage tracking is recorded after response completion via middleware.
- Request audit now persists API request/response payloads in DB (`ApiRequestLog`) plus per-call LLM telemetry (`LLMCallLog`).
- API keys, JWTs, and session tokens all coexist; avoid breaking auth precedence.
- File uploads use memory storage; large PDF handling changes can affect RAM usage.
- Document cache keys are based on normalized content hashing; whitespace-only text transforms can change cache behavior.
- Upload parsing is centralized through `DocumentParsingService`; if you change accepted formats, update the multer filters and the frontend `accept` lists together.
- Stripe webhook signature validation depends on raw request body path handling.
- Public pricing is now config-driven (USD/CNY/JPY + discount), and checkout can apply a Stripe coupon when discount is enabled.

### Frontend Behavior Details That Matter

- `axios` auth header injection depends on `auth_token` in localStorage.
- Dev/prod API base behavior differs (`''` in dev via Vite proxy, `VITE_API_URL` in prod).
- `StartHiring` mixes UI state, API orchestration, and action parsing in one file.
- `/pricing` consumes backend pricing config (no hard-coded localized pricing constants).
- Usage and statistics pages hide cost data for non-admin users; admin users see cost metrics and call-level details.
- Website feature usage on `/dashboard/usage` is derived from backend request logs where `apiKeyId` is `null`; it is not raw frontend click analytics.
- Docs pages contain hardcoded examples; they are not generated from backend schemas.
- Release freshness relies on `version.json` plus `ReleaseVersionGuard`, not on remotely clearing browser cache.

## Recommended Workflow for Changes

1. Identify which layer is affected (`backend`, `frontend`, or both).
2. If changing API contracts, update:
   - backend route + types
   - frontend consumer page/component(s)
   - docs page examples (if user-facing docs changed)
3. Run relevant local commands:
   - backend: `npm run dev --workspace=backend`
   - frontend: `npm run dev --workspace=frontend`
4. For schema changes:
   - update `backend/prisma/schema.prisma`
   - run Prisma commands
   - check impacted queries/routes/services
5. Smoke test critical paths:
   - login/auth state restore
   - `/start-hiring`
   - one API playground endpoint
   - dashboard page load (if auth/data changes)

## File Pointers (Good Starting Points)

- Backend app bootstrap: `backend/src/index.ts`
- Core AI endpoints: `backend/src/routes/api.ts`
- Hiring product APIs: `backend/src/routes/hiring.ts`
- Hiring chat/session APIs: `backend/src/routes/hiringChat.ts`, `backend/src/routes/hiringSessions.ts`
- Resume library APIs: `backend/src/routes/resumes.ts`
- Request auditing: `backend/src/middleware/requestAudit.ts`, `backend/src/lib/requestClassification.ts`
- Admin APIs: `backend/src/routes/admin.ts`
- Auth implementation: `backend/src/middleware/auth.ts`, `backend/src/services/AuthService.ts`
- LLM abstraction: `backend/src/services/llm/LLMService.ts`
- Prisma schema: `backend/prisma/schema.prisma`
- Frontend routes: `frontend/src/App.tsx`
- Auth state: `frontend/src/context/AuthContext.tsx`
- Start Hiring flow: `frontend/src/pages/StartHiring.tsx`
- Release freshness guard: `frontend/src/components/ReleaseVersionGuard.tsx`, `frontend/src/main.tsx`
- Pricing UI: `frontend/src/pages/Pricing.tsx`
- Admin dashboard UI: `frontend/src/pages/AdminDashboard.tsx`
- Resume dashboard UI: `frontend/src/pages/ResumeLibrary.tsx`, `frontend/src/pages/ResumeDetail.tsx`
- Dashboard shell: `frontend/src/layouts/DashboardLayout.tsx`
- API playground shell: `frontend/src/layouts/APIPlayground.tsx`
- Docs shell: `frontend/src/layouts/DocsLayout.tsx`

## Notes for Future Agent Updates

Keep this file current when any of the following change:

- Route paths or auth requirements
- Prisma schema models/relations
- LLM provider integration behavior
- Frontend route structure
- Start Hiring workflow/action marker protocol
- Upload parsing formats / `extract-document` flow
- Deployment setup (`render.yaml`)
- Release version / cache behavior
- Build/dev commands or environment variables
