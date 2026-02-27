# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RoboHire is an AI-powered recruitment platform. Monorepo with npm workspaces: `backend/` (Express + TypeScript API) and `frontend/` (React + Vite SPA).

## Commands

### Development
```bash
npm install                     # Install all workspace dependencies
npm run dev                     # Start both backend (port 4607) and frontend (port 3607)
npm run dev:backend             # Backend only with tsx watch
npm run dev:frontend            # Frontend only with Vite dev server
npm run start                   # Start backend only (built code, production)
npm run services:start          # Start background services
npm run services:stop
npm run services:restart
```

### Build
```bash
npm run build                   # Build both backend and frontend
npm run preview --workspace=frontend   # Preview production build
```

### Database (run from root)
```bash
npm run db:generate --workspace=backend   # Generate Prisma client
npm run db:push --workspace=backend       # Push schema changes to DB
npm run db:migrate --workspace=backend    # Create migration
npm run db:migrate:deploy --workspace=backend  # Deploy migrations (production)
npm run db:studio --workspace=backend     # Open Prisma Studio GUI
npm run db:seed --workspace=backend       # Seed database with demo data
```

### No test or lint commands are configured.

Verify changes manually: smoke test login/auth restore, `/start-hiring`, one API playground endpoint, and dashboard page load after auth/data changes.

## Architecture

### Backend (`backend/src/`)

**Entry point** — `backend/src/index.ts`. Loads env from root `.env` first, then `backend/.env` if present. Applies raw body parser for Stripe webhook **before** `express.json()` — do not reorder or Stripe signature validation will break.

**Agent Pattern** — All AI features use `BaseAgent<TInput, TOutput>` (`agents/BaseAgent.ts`). Subclasses implement `getAgentPrompt()`, `formatInput()`, and `parseOutput()`. Agents: ResumeMatch, ResumeParse, JDParse, Invite, Evaluation, CreateJD, CheatingDetector, RecruitmentConsultant. `RecruitmentConsultantAgent` emits action markers like `[[ACTION:CREATE_REQUEST]]` which the frontend detects.

**LLM Abstraction** — `services/llm/LLMService.ts` routes to provider implementations (OpenAI, OpenRouter, Google, Kimi) based on `LLM_PROVIDER` env var. Each provider implements a common interface.

**Auth** — Multi-method auth in `middleware/auth.ts`. Priority: `X-API-Key` header → `Authorization: Bearer` → `session_token` cookie → `X-Session-Token` header → `?token=` query param. JWT (7-day), session tokens (30-day DB-backed), and API keys (`rh_` prefix) are all supported. Do not change precedence order.

**Key services:**
- `AuthService` — signup, login, OAuth, JWT/session management
- `LoggerService` — JSON Lines logging with per-request cost tracking
- `DocumentStorageService` — file-based caching of parsed resumes/JDs/matches by content hash; whitespace-only text transforms can change cache behavior
- `LanguageService` — auto-detects language from text, adjusts LLM prompts
- `PDFService` — extraction via `pdf-parse`; uses memory storage (multer), so large PDF changes can affect RAM

**Routes:** `routes/api.ts` (core AI endpoints under `/api/v1`), `routes/auth.ts`, `routes/hiring.ts`, `routes/hiringSessions.ts`, `routes/hiringChat.ts`, `routes/apiKeys.ts`, `routes/usage.ts`, `routes/checkout.ts` (Stripe), `routes/demo.ts`.

**Middleware chain:** CORS → JSON parser → cookie parser → Passport → requestId → auth → rate limit → usage tracking → route handler. Rate limiting is in-memory per-process (resets on restart, not distributed). Usage records are written after response completion.

### Frontend (`frontend/src/`)

**State management** — React Context only (no Redux). `AuthContext` stores JWT in localStorage under key `auth_token`; restores session via `/api/auth/me`. `FormDataContext` syncs form data across API playground pages.

**Layouts** — `DashboardLayout` (sidebar + nested routes), `APIPlayground` (tabbed API testing), `DocsLayout` (docs sidebar). Routes defined in `App.tsx`. Dashboard routes gated by `ProtectedRoute.tsx`.

**i18n** — 7 languages (en, zh, ja, es, fr, pt, de) via i18next. Translations in `i18n/locales/{lang}/translation.json`. Auto-detects from browser with English fallback.

**HTTP client** — `lib/axios.ts` creates an Axios instance that auto-injects JWT from localStorage into `Authorization` header. In dev, Vite proxies `/api` to backend (`http://localhost:4607`). In prod, `VITE_API_URL` sets the base URL.

**`StartHiring.tsx`** — Most complex page. AI consultant chat intake, optional auth-persisted sessions, file attachment reading (PDF/doc/txt via `file.text()`), role templates, action marker detection (`create_request`), and a confirmation/edit step before final API submission. High regression risk.

**Docs pages** — `frontend/src/pages/docs/*`. Static content with hardcoded examples — not generated from backend schemas. Update manually if API contracts change.

### Database

PostgreSQL with Prisma ORM. Schema at `backend/prisma/schema.prisma`. Key models: User, Session, HiringRequest, Candidate, HiringSession, ApiKey, ApiUsageRecord. User model tracks subscription tier, Stripe IDs, and usage counters.

### Deployment

Render Blueprint in `render.yaml`. Backend is a Node.js service (port 10000 in prod, `rootDir: backend`), build includes `prisma generate` + `prisma db push`. Frontend is a static site from `frontend/dist` with SPA rewrite to `/index.html`.

## Environment

Copy `.env.example` to `.env` at repo root. Key variable groups: `LLM_PROVIDER`/`LLM_MODEL`/provider API keys, `DATABASE_URL`, `JWT_SECRET`, OAuth client IDs/secrets, Stripe keys. Demo account (after seed): `demo@robohire.io` / `demo1234`.

## Key File Pointers

| Concern | File |
|---|---|
| Backend bootstrap | `backend/src/index.ts` |
| Core AI endpoints | `backend/src/routes/api.ts` |
| Hiring request APIs | `backend/src/routes/hiring.ts` |
| Hiring chat/sessions | `backend/src/routes/hiringChat.ts`, `hiringSessions.ts` |
| Auth middleware + service | `backend/src/middleware/auth.ts`, `backend/src/services/AuthService.ts` |
| LLM provider routing | `backend/src/services/llm/LLMService.ts` |
| Prisma schema | `backend/prisma/schema.prisma` |
| Frontend routes | `frontend/src/App.tsx` |
| Auth state | `frontend/src/context/AuthContext.tsx` |
| Start Hiring flow | `frontend/src/pages/StartHiring.tsx` |

## High-Risk Files

These have dense logic and higher regression risk — read carefully before editing:

- `frontend/src/pages/StartHiring.tsx`
- `frontend/src/components/MatchResultDisplay.tsx`
- `frontend/src/components/EvaluationResultDisplay.tsx`
- `backend/src/routes/api.ts`
- `backend/src/routes/auth.ts`
- `backend/src/routes/hiring.ts`
- `backend/src/services/LoggerService.ts`
- `backend/src/agents/EvaluationAgent.ts`
- `backend/src/agents/ResumeMatchAgent.ts`

## API Contract Change Checklist

When changing API request/response shapes, update:
1. Backend route handler + types (`backend/src/types/index.ts`)
2. Frontend consumer page/component
3. Docs page examples (`frontend/src/pages/docs/*`) — not auto-generated

## Coding Standards

### i18n — All user-facing text must be translated

Every user-visible string in the frontend **must** use `t()` from i18next with a translation key — never hardcode raw text. This includes:

- UI labels, buttons, headings, placeholders
- Success messages, error messages, and fallback text
- Chat messages assembled in code (e.g. step-by-step instructions)

When adding or changing any `t()` key, update **all 7 translation files** (`en`, `zh`, `ja`, `es`, `fr`, `pt`, `de`) in `frontend/src/i18n/locales/{lang}/translation.json`. Do not leave keys present only in English with fallback defaults — every key must have a proper translation in every language file.
