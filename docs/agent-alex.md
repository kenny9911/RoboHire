# Agent Alex — AI Recruitment Requirements Agent

## Overview

Agent Alex is RoboHire's AI-powered recruitment requirements analyst. It conducts guided conversations with hiring managers and recruiters to extract, structure, and finalize job requirement specifications. It supports both text chat and real-time voice interaction, powered by Google Gemini.

**URL:** `/agent-alex` (requires authentication)

**Replaces:** `/start-hiring` (now redirects to `/agent-alex`)

---

## Architecture

### Frontend

| File | Purpose |
|---|---|
| `frontend/src/pages/AgentAlex.tsx` | Main page — session management, mode toggle, resizable panels, export |
| `frontend/src/components/agent-alex/ChatInterface.tsx` | Text chat UI — streaming responses, STT/TTS, markdown rendering |
| `frontend/src/components/agent-alex/LiveVoiceInterface.tsx` | Real-time voice — WebSocket audio streaming, AudioWorklet capture |
| `frontend/src/components/agent-alex/SpecificationPanel.tsx` | Live requirements document — 8 collapsible sections, real-time updates |
| `frontend/src/components/agent-alex/FloatingAgentAlex.tsx` | Floating CTA button on homepage |
| `frontend/src/components/agent-alex/api.ts` | API client — HTTP streaming, WebSocket, session CRUD, job creation |
| `frontend/src/components/agent-alex/types.ts` | TypeScript interfaces |
| `frontend/public/audio-capture-processor.js` | AudioWorklet for 16kHz mono PCM microphone capture |

### Backend

| File | Purpose |
|---|---|
| `backend/src/services/GeminiAgentService.ts` | Gemini AI integration — chat streaming, transcription, TTS, live voice, function calling |
| `backend/src/routes/agentAlex.ts` | HTTP endpoints — `/config`, `/chat/stream`, `/transcribe`, `/tts` |
| `backend/src/routes/agentAlexSessions.ts` | Session CRUD — list, create, update, delete sessions (DB-backed) |
| `backend/src/types/agentAlex.ts` | Shared TypeScript types |
| `backend/src/index.ts` | WebSocket upgrade handler for `/api/v1/agent-alex/live` |

### Database

Agent Alex sessions are stored in the `AgentAlexSession` model (Prisma schema):

```prisma
model AgentAlexSession {
  id           String   @id @default(cuid())
  userId       String
  title        String   @default("New Chat")
  messages     Json     @default("[]")
  requirements Json     @default("{}")
  linkedJobId  String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  user         User     @relation(fields: [userId], references: [id])
  linkedJob    Job?     @relation(fields: [linkedJobId], references: [id])
}
```

---

## API Endpoints

### HTTP Routes (under `/api/v1/agent-alex/`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/config` | No | Check if Gemini API key is configured |
| POST | `/chat/stream` | No | Stream chat response (NDJSON). Body: `{history, message, locale}` |
| POST | `/transcribe` | No | Speech-to-text. Body: `{audioBase64, mimeType}` |
| POST | `/tts` | No | Text-to-speech. Body: `{text}` → `{audioBase64}` |

### Session Routes (under `/api/v1/agent-alex/sessions/`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Yes | List user's sessions |
| POST | `/` | Yes | Create new session. Body: `{title?, messages?, requirements?}` |
| PATCH | `/:id` | Yes | Update session. Body: `{title?, messages?, requirements?, linkedJobId?}` |
| DELETE | `/:id` | Yes | Delete session (unlinks job if linked) |

### WebSocket

| Path | Description |
|---|---|
| `/api/v1/agent-alex/live` | Real-time bidirectional voice conversation |

**Client → Server messages:**
- `{type: "init", history: HistoryMessage[]}` — Initialize with conversation context
- `{type: "audio", data: string}` — Base64-encoded 16kHz mono PCM audio
- `{type: "close"}` — Graceful disconnect

**Server → Client messages:**
- `{type: "connected"}` — Ready for audio
- `{type: "audio", data: string}` — Base64-encoded 24kHz mono audio response
- `{type: "interrupted"}` — Agent interrupted (user started speaking)
- `{type: "requirements-update", data: Partial<HiringRequirements>}` — Extracted data
- `{type: "error", code: string, message: string}` — Error

---

## Gemini Models Used

| Purpose | Model |
|---|---|
| Text chat | `gemini-3.1-pro-preview` |
| Speech-to-text | `gemini-3-flash-preview` |
| Text-to-speech | `gemini-2.5-flash-preview-tts` (voice: "Puck") |
| Live voice | `gemini-2.5-flash-native-audio-preview-12-2025` |

---

## Function Calling — Structured Extraction

Agent Alex uses Gemini's function calling to extract structured data into 28 fields:

**Tool:** `update_hiring_requirements`

**Fields extracted:**

| Category | Fields |
|---|---|
| Role Overview | jobTitle, department, reportingLine, roleType, headcount |
| Responsibilities | primaryResponsibilities[], secondaryResponsibilities[] |
| Required Qualifications | hardSkills[], softSkills[], yearsOfExperience, education, industryExperience |
| Preferred Qualifications | preferredQualifications[] |
| Compensation | salaryRange, equityBonus, benefits[] |
| Logistics | workLocation, geographicRestrictions, startDate, travelRequirements |
| Hiring Process | interviewStages[], keyStakeholders[], timelineExpectations |
| Additional Context | teamCulture, reasonForOpening, dealBreakers[] |

The agent calls this tool frequently during conversation to build up the live specification document.

---

## i18n / Locale Support

- Frontend detects the user's i18n locale and passes it to `/chat/stream` as `locale` parameter
- Backend appends a locale-specific instruction to the system prompt, requiring Gemini to respond in the user's language
- Supported: en, zh, zh-TW, ja, es, fr, pt, de
- SpecificationPanel uses `t()` keys under `agentAlex.spec.*`

---

## JD Creation Flow

When the agent has gathered enough requirements, users can create a job directly:

1. Agent Alex extracts structured requirements via function calling
2. User clicks "Create Job" in the SpecificationPanel
3. Frontend calls `POST /api/v1/jobs` with the structured data mapped to job fields
4. Job is created and linked to the session (`linkedJobId`)
5. Subsequent requirement updates sync to the linked job via `PATCH /api/v1/jobs/:id`

### Mapping: HiringRequirements → Job

| HiringRequirements field | Job field |
|---|---|
| jobTitle | title |
| department | department |
| workLocation | location |
| roleType | employmentType |
| yearsOfExperience | experienceLevel |
| education | education |
| headcount | headcount |
| salaryRange | salaryText, salaryMin, salaryMax |
| primaryResponsibilities + secondaryResponsibilities | description |
| hardSkills + softSkills + education + yearsOfExperience | qualifications |
| hardSkills | hardRequirements |
| preferredQualifications | niceToHave |
| benefits | benefits |
| interviewStages + keyStakeholders | interviewRequirements |
| teamCulture + reasonForOpening + dealBreakers | notes |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google Gemini API key for Agent Alex |
| `GOOGLE_API_KEY` | Fallback | Falls back to this if GEMINI_API_KEY not set |

---

## Session Lifecycle

1. **Create**: User navigates to `/agent-alex` → new session created (DB + UI)
2. **Chat**: User sends messages → streamed responses → requirements extracted → session auto-saved
3. **Switch**: User can switch between sessions via the history dropdown
4. **Export**: JSON download of current requirements specification
5. **Create Job**: Convert requirements to a Job record, linked to session
6. **Delete**: Removes session; if linked to a job, warns user

---

## System Prompt Strategy

The agent follows a guided inquiry methodology:

1. **Role identification** — Normalize the job title
2. **Requirement hypothesis** — Silently predict likely requirements to prioritize questions
3. **Guided inquiry** — Ask 2-3 questions per turn, acknowledge previous answers
4. **Priority distinction** — Explicitly separate must-haves (必要条件) from nice-to-haves (优先条件)
5. **Completion detection** — Stop when user signals done or all dimensions addressed
6. **Gap filling** — Apply intelligent defaults for unaddressed areas

**Response formatting rules:**
- Bullet points for lists
- Bold for labels and key terms
- Blank lines between topics
- Short paragraphs (2-3 sentences max)
- Structured summaries with numbered lists
