# CLAUDE.md — RoboHire Codebase Guide

## Project Overview

RoboHire is an AI-powered recruitment platform with a REST API and web UI. It supports multi-LLM providers (OpenAI, OpenRouter, Google Gemini, Kimi/Moonshot) for tasks like resume matching, JD parsing, interview evaluation, and a recruitment consultant chat agent.

**Production URLs:**
- Frontend: https://robohire.io
- Backend API: https://api.robohire.io
- Demo account: `demo@robohire.io` / `demo1234`

---

## Monorepo Structure

This is an **npm workspaces** monorepo with two workspaces:

```
RoboHire/
├── backend/          # Express + TypeScript API server
├── frontend/         # React + Vite + Tailwind SPA
├── scripts/          # Shell scripts (start.sh, stop.sh, restart.sh)
├── package.json      # Root: workspace config + concurrently dev script
├── render.yaml       # Render.com deployment blueprint
├── API_DOCUMENTATION.md
└── CLAUDE.md
```

---

## Tech Stack

### Backend
- **Runtime:** Node.js 18+ with ESM (`"type": "module"`)
- **Framework:** Express 4
- **Language:** TypeScript 5 (compiled with `tsc`, run with `tsx` in dev)
- **ORM:** Prisma 6 with PostgreSQL
- **Auth:** JWT (`jsonwebtoken`) + session tokens + OAuth via Passport.js (Google, GitHub, LinkedIn)
- **File uploads:** Multer
- **PDF parsing:** pdf-parse
- **Payments:** Stripe
- **LLM SDKs:** `openai`, `@google/generative-ai`

### Frontend
- **Framework:** React 18 + React Router 6
- **Build tool:** Vite 5 (dev server on port 3607)
- **Language:** TypeScript 5 (strict mode, `noEmit: true`)
- **Styling:** Tailwind CSS 3
- **i18n:** i18next + react-i18next (7 locales: en, zh, ja, de, es, fr, pt)
- **Charts:** Recharts
- **HTTP client:** Axios + native `fetch`
- **SEO:** react-helmet-async

---

## Ports

| Service | Port |
|---------|------|
| Backend (dev & prod) | 4607 |
| Frontend (dev Vite) | 3607 |
| Production backend (Render) | 10000 (mapped via env) |

In development, Vite proxies `/api` → `http://localhost:4607`, so all frontend API calls use relative URLs.

---

## Development Workflow

### Setup

```bash
# Install all dependencies (root + both workspaces)
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your API keys
```

### Running

```bash
# Run both backend and frontend concurrently
npm run dev

# Run separately
npm run dev:backend    # tsx watch — hot reload
npm run dev:frontend   # Vite dev server
```

### Building

```bash
npm run build          # tsc (backend) + vite build (frontend)
npm start              # node dist/index.js (backend only)
```

### Database

```bash
cd backend
npm run db:generate    # prisma generate (regen client after schema changes)
npm run db:push        # prisma db push (apply schema, no migration history)
npm run db:migrate     # prisma migrate dev (create migration)
npm run db:studio      # Prisma Studio GUI
npm run db:seed        # tsx prisma/seed.ts
```

> **Note:** `prisma generate` runs automatically via `postinstall`.
> In production Render uses `npx prisma db push --accept-data-loss` during build.

---

## Environment Variables

The backend loads `.env` from the repo root first, then `backend/.env` (for Render). Key variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (required) |
| `JWT_SECRET` | Secret for JWT signing (required) |
| `LLM_PROVIDER` | `openrouter` \| `openai` \| `google` \| `kimi` |
| `LLM_MODEL` | Model name (e.g. `google/gemini-2.0-flash`) |
| `OPENROUTER_API_KEY` | OpenRouter key |
| `OPENAI_API_KEY` | OpenAI key |
| `GOOGLE_API_KEY` | Google AI key |
| `KIMI_API_KEY` | Kimi/Moonshot key |
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `PORT` | Backend port (default: 4607) |
| `NODE_ENV` | `development` \| `production` |
| `FRONTEND_URL` | CORS allowed origin in production |
| `OAUTH_CALLBACK_URL` | OAuth redirect base URL |
| `LOG_LEVEL` | `DEBUG` \| `INFO` \| `WARN` \| `ERROR` |
| `FILE_LOGGING` | `true` / `false` |
| `STRIPE_SECRET_KEY` | Stripe secret |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `RECRUITER_EMAIL` | Email for demo requests |
| `ROBOHIRE_INVITATION_API` | External invitation API URL |

Frontend variable (set in `frontend/.env` or Render):

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend base URL in production (empty in dev — uses Vite proxy) |

---

## Backend Architecture

### Entry Point

`backend/src/index.ts` — loads `.env`, sets up Express middleware, mounts routers, starts the server.

**Middleware order:**
1. CORS (env-aware allowed origins)
2. Raw body for Stripe webhook (`/api/v1/webhooks/stripe`)
3. `express.json()` (10 MB limit)
4. `express.urlencoded()`
5. `cookie-parser`
6. `passport.initialize()`
7. `attachRequestId` (adds UUID to each request)

### Route Structure

| Mount path | Router file | Auth |
|------------|-------------|------|
| `/api/auth` | `routes/auth.ts` | — |
| `/api/v1` | `routes/api.ts` | optional/required per endpoint |
| `/api/v1/hiring-requests` | `routes/hiring.ts` | required |
| `/api/v1/hiring-sessions` | `routes/hiringSessions.ts` | required |
| `/api/v1/hiring-chat` | `routes/hiringChat.ts` | optional |
| `/api/v1/api-keys` | `routes/apiKeys.ts` | required |
| `/api/v1/usage` | `routes/usage.ts` | required |
| `/api/v1/request-demo` | `routes/demo.ts` | — |
| `/api/v1` | `routes/checkout.ts` | required |

### Agents

All agents extend `BaseAgent<TInput, TOutput>` in `backend/src/agents/BaseAgent.ts`.

**Abstract methods to implement:**
- `getAgentPrompt()` — system prompt
- `formatInput(input)` — converts input to user message string
- `parseOutput(response)` — parses LLM string response to typed output

**Available agents:**

| File | Purpose |
|------|---------|
| `RecruitmentConsultantAgent.ts` | Conversational hiring requirements chat |
| `ResumeMatchAgent.ts` | Score resume against JD |
| `InviteAgent.ts` | Generate interview invitation emails |
| `ResumeParseAgent.ts` | Parse resume PDF → structured JSON |
| `JDParseAgent.ts` | Parse JD PDF → structured JSON |
| `EvaluationAgent.ts` | Evaluate interview transcripts |
| `CheatingDetectorAgent.ts` | Detect AI-assisted interview answers |
| `CreateJDAgent.ts` | Generate job descriptions |

**Creating a new agent:**
1. Create `backend/src/agents/MyAgent.ts` extending `BaseAgent<MyInput, MyOutput>`
2. Implement the three abstract methods
3. Export a singleton instance
4. Wire it into the appropriate route handler

### LLM Service

`backend/src/services/llm/LLMService.ts` is a lazy-initialized singleton (`llmService`).

- `llmService.chat(messages, options?)` — returns raw string
- `llmService.chatWithJsonResponse<T>(messages, options?)` — auto-parses JSON from response (handles `` ```json ``` `` fences)

Provider is selected via `LLM_PROVIDER` env var. Supported providers: `openai`, `openrouter`, `google`, `kimi`/`moonshot`.

### Authentication Middleware

`backend/src/middleware/auth.ts` provides:
- `requireAuth` — enforces authentication; checks (in order): `X-API-Key` header, `Authorization: Bearer <token>` (JWT or `rh_`-prefixed API key), `session_token` cookie, `X-Session-Token` header, `?token=` query param
- `optionalAuth` — same logic but passes through if no token
- `requireScopes(...scopes)` — used with API key auth to check scopes

API keys are prefixed with `rh_`. JWTs are issued by `AuthService`. Session tokens are stored in the `Session` DB table.

### Rate Limiting

`backend/src/middleware/rateLimiter.ts` — sliding window rate limiter keyed by `apiKeyId` or IP. Sets `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers.

### Usage Tracking

`backend/src/middleware/usageTracker.ts` — `trackUsage` middleware records API calls to `ApiUsageRecord` table after response finishes. Pulls token usage from the logger's per-request context.

### Logging

`backend/src/services/LoggerService.ts` — structured JSON Lines logger with:
- Daily rotating log files in `backend/logs/`
- Files: `all-YYYY-MM-DD.jsonl`, `error-YYYY-MM-DD.jsonl`, `llm-YYYY-MM-DD.jsonl`, `requests-YYYY-MM-DD.jsonl`
- Per-request context tracking (tokens, cost, steps)
- Methods: `logger.info/debug/warn/error(category, message, data?, requestId?)`

### Document Storage & Caching

`backend/src/services/DocumentStorageService.ts` — caches parsed PDFs by content hash in `backend/parsed-documents/`:
- `resumes/` — parsed resume JSON files + `_index.json`
- `jds/` — parsed JD JSON files
- `match-results/` — match results as `{CandidateName}_{JobTitle}_{Timestamp}.json`

---

## Database Schema (Prisma / PostgreSQL)

Key models:

| Model | Description |
|-------|-------------|
| `User` | Core user; supports email+password and OAuth; has `subscriptionTier` (free/startup/business/custom) and usage counters |
| `Session` | DB-persisted session tokens |
| `HiringRequest` | A job opening with requirements and status |
| `Candidate` | Applicant linked to a HiringRequest |
| `HiringSession` | Persistent chat session for the RecruitmentConsultant agent |
| `ApiKey` | User-issued API keys with prefix `rh_`, scopes, expiry |
| `ApiUsageRecord` | Per-request usage tracking (tokens, cost, duration) |

After modifying `backend/prisma/schema.prisma`, run:
```bash
cd backend && npm run db:generate && npm run db:push
```

---

## Frontend Architecture

### Routing (React Router 6)

| Path | Component | Auth |
|------|-----------|------|
| `/` | `Landing` | Public |
| `/login` | `Login` | Public |
| `/start-hiring` | `StartHiring` | Public |
| `/developers` | `APILanding` | Public |
| `/pricing` | `Pricing` | Public |
| `/request-demo` | `RequestDemo` | Public |
| `/dashboard/*` | `DashboardLayout` | Protected |
| `/api-playground/*` | `APIPlayground` | Public |
| `/docs/*` | `DocsLayout` | Public |

### Context Providers

- **`AuthProvider`** (`context/AuthContext.tsx`) — manages auth state; stores JWT in `localStorage` under key `auth_token`; uses `credentials: 'include'` for cookie-based session support
- **`FormDataProvider`** (`context/FormDataContext.tsx`) — shared resume/JD form state synced across API playground pages

### API Configuration

`frontend/src/config.ts` exports `API_BASE`:
- Dev: `""` (empty — Vite proxies `/api` to backend)
- Prod: value of `VITE_API_URL` env var

`frontend/src/lib/axios.ts` — configured Axios instance for API requests.

### i18n

7 locales in `frontend/src/i18n/locales/`: `en`, `zh`, `ja`, `de`, `es`, `fr`, `pt`.

Use `useTranslation()` from `react-i18next` in components. The `LanguageSwitcher` component updates the active locale. Language is also auto-detected from the browser.

### Tailwind CSS

Utility-first styling. No CSS modules or styled-components. Add custom styles in `frontend/src/index.css`.

---

## Key Conventions

### TypeScript
- Backend: `"module": "NodeNext"` — use `.js` extensions in all imports (even for `.ts` source files)
- Backend: `"noImplicitAny": false` — some loose typing is acceptable
- Frontend: strict mode with `noUnusedLocals` and `noUnusedParameters`
- Frontend: `noEmit: true` — Vite handles transpilation; `tsc` is only for type checking

### Import Paths
- Backend imports must use `.js` extension: `import { foo } from './bar.js'` (NodeNext resolution)
- Frontend imports use bare paths (bundler resolution): `import { foo } from './bar'`

### API Response Shape
All API endpoints return a consistent shape:
```json
{ "success": true, "data": { ... } }
{ "success": false, "error": "message", "code": "ERROR_CODE" }
```

### Adding New API Endpoints
1. Add the route handler to the appropriate file in `backend/src/routes/`
2. Apply `requireAuth` or `optionalAuth` as needed
3. Apply `trackUsage` middleware for metered endpoints
4. Use `attachRequestId` middleware (already global) for log correlation
5. Return `{ success: true, data: ... }` or call `next(error)` for errors

### Agents Pattern
- Each agent is a class instance — use the singleton export (e.g., `export const resumeMatchAgent = new ResumeMatchAgent()`)
- Pass `requestId` from `req.requestId` through to agent calls for end-to-end log correlation
- Use `executeWithJsonResponse()` when the output must be structured JSON

---

## Deployment

Deployed on **Render.com** via `render.yaml` (Render Blueprint):

- **Backend** (`robohire-api`): Node web service, `rootDir: backend`, build: `npm install && npx prisma generate && npx prisma db push --accept-data-loss && npm run build`, start: `node dist/index.js`
- **Frontend** (`robohire-web`): Static site, `rootDir: frontend`, build: `npm install && npm run build`, publish: `dist/`, SPA rewrite rule

**Secrets** are set manually in the Render Dashboard (not in `render.yaml`).

---

## Scripts

```bash
npm run restart         # ./scripts/restart.sh
npm run stop            # ./scripts/stop.sh
npm run services:start  # ./scripts/start.sh
```

---

## Files to Avoid Committing

- `.env` (contains secrets)
- `backend/logs/` (runtime logs)
- `backend/parsed-documents/` (cached parsed files)
- `backend/dist/` (compiled output)
- `frontend/dist/` (build output)
- `node_modules/`
