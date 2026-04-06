# Agent Alex — Design & Implementation Documentation

## Overview

Agent Alex is an AI-powered **Recruitment Requirements Analyst and Orchestrator Agent**. It conducts conversational interviews with recruiters/hiring managers to extract complete hiring requirements, structures them into a live specification document, and autonomously searches the talent pool for matching candidates.

**Key Capabilities:**
- Conversational requirements gathering via text chat
- Real-time hiring specification building (live panel)
- Talent pool candidate search & matching (parallel LLM scoring)
- Job creation directly from specifications
- Session management (save/load/export)
- Speech-to-text and text-to-speech
- Live voice conversation mode (WebSocket)
- Multi-language support (en, zh, zh-TW, ja, es, fr, pt, de)

---

## Architecture

```
 Frontend (React)                           Backend (Express + Gemini)
┌──────────────────────────┐     HTTP      ┌────────────────────────────────┐
│  AgentAlex.tsx           │◄─── NDJSON ──►│  agentAlex.ts (routes)         │
│  ├─ ChatInterface.tsx    │    Stream     │  ├─ POST /chat/stream          │
│  ├─ SpecificationPanel   │               │  ├─ POST /transcribe           │
│  └─ LiveVoiceInterface   │◄── WebSocket─►│  ├─ POST /tts                  │
│                          │               │  └─ GET  /config               │
│  FloatingAgentAlex.tsx   │               │                                │
│  (widget on other pages) │               │  agentAlexSessions.ts (CRUD)   │
└──────────────────────────┘               │  ├─ GET/POST/PATCH/DELETE      │
                                           │                                │
                                           │  GeminiAgentService.ts         │
                                           │  ├─ streamChatResponse()       │
                                           │  ├─ transcribeAudio()          │
                                           │  └─ generateSpeech()           │
                                           │                                │
                                           │  InstantSearchMatchService.ts  │
                                           │  └─ executeInstantSearch()     │
                                           └───────────┬────────────────────┘
                                                       │
                                           ┌───────────▼────────────────────┐
                                           │  Google Gemini 3.1 Pro         │
                                           │  (with function calling tools) │
                                           └───────────┬────────────────────┘
                                                       │
                                           ┌───────────▼────────────────────┐
                                           │  PostgreSQL                    │
                                           │  ├─ AgentAlexSession           │
                                           │  ├─ Agent (search instances)   │
                                           │  ├─ AgentCandidate (results)   │
                                           │  ├─ Resume (talent pool)       │
                                           │  └─ Job (created positions)    │
                                           └────────────────────────────────┘
```

---

## Frontend

### File Structure

```
frontend/src/
├── pages/
│   └── AgentAlex.tsx                        # Main full-page component
├── components/agent-alex/
│   ├── types.ts                             # TypeScript interfaces
│   ├── api.ts                               # API client (streaming, CRUD)
│   ├── ChatInterface.tsx                    # Text chat UI + audio
│   ├── SpecificationPanel.tsx               # Live requirements display
│   ├── LiveVoiceInterface.tsx               # WebSocket voice chat
│   └── FloatingAgentAlex.tsx                # Floating widget for other pages
```

### AgentAlex.tsx (Main Page)

**Route:** `/agent-alex` (protected, requires auth)

**Layout:** Responsive two-panel design
- **Left panel:** `ChatInterface` — conversation with the agent
- **Right panel:** `SpecificationPanel` — live hiring requirements document
- **Header:** Session switcher, mode toggle (text/voice), export button

**Key State:**
```typescript
sessions: Session[]              // All user sessions
activeSessionId: string          // Current session
mode: 'chat' | 'live'           // Text or voice mode
```

**Core Functions:**
| Function | Purpose |
|----------|---------|
| `inferWorkType(text)` | Detects remote/hybrid/onsite from text |
| `inferEmploymentType(text)` | Parses full-time/part-time/contract |
| `inferExperienceLevel(text)` | Maps years → entry/mid/senior/lead/executive |
| `inferEducation(text)` | Maps education text to enum (supports CJK) |
| `parseSalaryRange(text)` | Handles "40万-60万", "$400k-600k", etc. |
| `buildJobPayload(reqs, t)` | Transforms HiringRequirements → Job API payload |
| `handleCreateOrUpdateJob()` | Creates/updates Job from current spec |

**Session Lifecycle:**
1. On mount → load sessions from DB (`GET /api/v1/agent-alex/sessions`)
2. If none exist → create fresh session with welcome message
3. On message/requirement change → debounced auto-save (1500ms) via `PATCH`
4. Session title auto-set from first user message
5. Deletion blocked if session has a linked Job

### ChatInterface.tsx

**Responsibilities:**
- Render message bubbles (user = indigo right-aligned, model = white left-aligned)
- Handle text input and send via streaming API
- Process streaming events: `text-delta`, `requirements-update`, `suggestions`, `search-*`
- Audio recording (microphone → transcription via `/transcribe`)
- Text-to-speech playback (model responses → `/tts`)
- Render `SearchProgressCard` for real-time candidate search results
- Render `SuggestionChips` (clickable quick-reply buttons)

**Search UI Components:**
- `SearchProgressCard` — Progress bar, filtered/screened counts, candidate cards with medals
- `CandidateCard` — Name, score, grade badge, highlights, gaps, link to talent profile
- `SuggestionChips` — 2-3 actionable next-step buttons after each response

### SpecificationPanel.tsx

**8 collapsible sections** with icons, auto-populated as the conversation progresses:

1. **Role Overview** — jobTitle, department, reportingLine, roleType, headcount
2. **Core Responsibilities** — primary and secondary responsibilities
3. **Required Qualifications** — yearsOfExperience, education, industry, hard/soft skills
4. **Preferred Qualifications** — nice-to-haves
5. **Compensation & Benefits** — salary range, equity, benefits
6. **Logistics** — location, geographic restrictions, start date, travel
7. **Hiring Process** — interview stages, stakeholders, timeline
8. **Additional Context** — team culture, reason for opening, deal-breakers

Fields render only when populated. Arrays render as bullet lists.

### FloatingAgentAlex.tsx

**Purpose:** Compact 380x520px chat widget available on landing page and product pages.

**Differences from full page:**
- Single-panel chat only (no specification panel)
- Minimal session management (new chat, history dropdown)
- Quick-invite button (Zap icon → `/product/quick-invite`)
- "Expand" button navigates to full `/agent-alex` page
- Sessions persist to DB, shared with full page

### api.ts (Frontend API Client)

| Function | Endpoint | Description |
|----------|----------|-------------|
| `fetchAppConfig()` | `GET /agent-alex/config` | Check Gemini API key status |
| `streamChat(params)` | `POST /agent-alex/chat/stream` | Stream chat with NDJSON events |
| `transcribeAudio(base64, mime)` | `POST /agent-alex/transcribe` | Audio → text |
| `generateSpeech(text)` | `POST /agent-alex/tts` | Text → audio |
| `fetchSessions()` | `GET /agent-alex/sessions` | List user sessions |
| `createSession(data)` | `POST /agent-alex/sessions` | Create session |
| `updateSession(id, data)` | `PATCH /agent-alex/sessions/:id` | Update session |
| `deleteSession(id)` | `DELETE /agent-alex/sessions/:id` | Delete session |
| `createJobFromSpec(payload)` | `POST /jobs` | Create job from spec |
| `getLiveWebSocketUrl()` | — | Build ws:// URL for live voice |

---

## Backend

### File Structure

```
backend/src/
├── routes/
│   ├── agentAlex.ts                         # Chat stream, transcribe, TTS
│   └── agentAlexSessions.ts                 # Session CRUD
├── services/
│   ├── GeminiAgentService.ts                # Core AI orchestration
│   └── InstantSearchMatchService.ts         # Talent pool search
├── agents/
│   └── ResumeMatchAgent.ts                  # Individual resume scoring
├── types/
│   └── agentAlex.ts                         # Shared type definitions
└── index.ts                                 # WebSocket handler (live voice)
```

### API Endpoints

#### `GET /api/v1/agent-alex/config`
Returns whether Gemini API key is configured.
```json
{ "configured": true }
// or
{ "configured": false, "reason": "missing_api_key" }
```

#### `POST /api/v1/agent-alex/chat/stream`
Main chat endpoint. Returns NDJSON stream.

**Request:**
```json
{
  "history": [{ "role": "user", "text": "..." }, { "role": "model", "text": "..." }],
  "message": "I need to hire a senior React developer",
  "locale": "zh"
}
```

**Response (NDJSON — one JSON per line):**
```json
{"type":"text-delta","text":"好的，让我了解..."}
{"type":"requirements-update","data":{"jobTitle":"Senior React Developer"}}
{"type":"suggestions","data":["帮我拟技术要求","建议薪资范围","先看看类似岗位"]}
{"type":"search-started","data":{"searchId":"...","agentId":"...","totalResumes":150,"filteredCount":45}}
{"type":"search-progress","data":{"searchId":"...","completed":10,"total":45}}
{"type":"search-result","data":{"searchId":"...","candidate":{"name":"张三","score":85,"grade":"A"}}}
{"type":"search-completed","data":{"searchId":"...","totalMatched":12,"totalScreened":45}}
{"type":"done"}
```

#### `POST /api/v1/agent-alex/transcribe`
Audio-to-text via Gemini 3 Flash.
```json
// Request
{ "audioBase64": "...", "mimeType": "audio/webm" }
// Response
{ "text": "I need a senior developer..." }
```

#### `POST /api/v1/agent-alex/tts`
Text-to-speech via Gemini 2.5 Flash TTS (voice: "Puck", 24kHz PCM).
```json
// Request
{ "text": "Let me help you find candidates..." }
// Response
{ "audioBase64": "..." }
```

#### `GET /api/v1/agent-alex/live` (WebSocket)
Real-time bidirectional voice conversation.

**Client → Server messages:**
- `{ type: 'init', history: [...] }` — Start session
- `{ type: 'audio', data: 'base64...' }` — Audio chunk (PCM 16kHz)
- `{ type: 'close' }` — End session

**Server → Client messages:**
- `{ type: 'connected' }` — Ready
- `{ type: 'audio', data: 'base64...' }` — Response audio
- `{ type: 'requirements-update', data: {...} }` — Extracted requirements
- `{ type: 'interrupted' }` — User interrupted
- `{ type: 'error', code, message }` — Error

#### Session CRUD (all require auth)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/agent-alex/sessions` | List sessions (max 50, sorted by updatedAt) |
| POST | `/api/v1/agent-alex/sessions` | Create session |
| PATCH | `/api/v1/agent-alex/sessions/:id` | Update (title, messages, requirements, linkedJobId) |
| DELETE | `/api/v1/agent-alex/sessions/:id` | Delete (blocked if linked to Job → 409) |

### GeminiAgentService.ts

**Models:**
```typescript
const MODELS = {
  chat:       "gemini-3.1-pro-preview",
  transcribe: "gemini-3-flash-preview",
  tts:        "gemini-2.5-flash-preview-tts",
  live:       "gemini-2.5-flash-native-audio-preview-12-2025",
};
```

**System Prompt** defines the agent's behavior:

1. **Role:** Recruitment Requirements Analyst and Orchestrator Agent
2. **Core Skills:**
   - Role decomposition (break job into skill domains)
   - Adaptive questioning (2-3 per turn, max 4)
   - Gap detection and diplomatic surfacing
   - Industry benchmarking (provide market norms when user is uncertain)
   - Synthesis into structured specification
3. **Interaction Protocol:**
   - Identify and normalize the role
   - Generate requirement hypotheses silently
   - Guide inquiry in thematic clusters
   - Distinguish must-haves (必要条件) vs nice-to-haves (优先条件)
   - Detect completion, fill gaps with intelligent defaults
4. **Anti-Hallucination Rules:**
   - NEVER invent candidate names, scores, or match results
   - NEVER pretend to have search results without calling `start_candidate_search`
   - If 0 results, say so honestly
   - Do NOT generate fictional example candidates
5. **Language:** All responses and tool values written in user's interface language

**Function Calling (Tools):**

| Tool | Purpose | When Called |
|------|---------|------------|
| `update_hiring_requirements` | Update live specification with extracted info | Frequently, as info is gathered |
| `suggest_next_steps` | Provide 2-3 actionable suggestion chips | After EVERY response |
| `start_candidate_search` | Search talent pool for matching candidates | When user requests candidate matching |

**`update_hiring_requirements` parameters:**
All fields from `HiringRequirements` (jobTitle, department, hardSkills[], softSkills[], yearsOfExperience, education, salaryRange, workLocation, dealBreakers[], etc.)

**`suggest_next_steps` parameters:**
```typescript
{ suggestions: string[] }  // 2-3 short phrases, <20 CJK chars or <8 English words
```

**`start_candidate_search` parameters:**
```typescript
{
  searchCriteria: {
    jobTitle, hardSkills[], softSkills[], yearsOfExperience,
    education, workLocation, preferredQualifications[], dealBreakers[]
  },
  source: "talent_pool" | "upload"
}
```

**Streaming Loop (`streamChatResponse`):**
1. Create Gemini chat with system prompt + tools + thinking enabled (HIGH level)
2. Send user message
3. Process response chunks:
   - Text → emit `text-delta` events
   - Function call `update_hiring_requirements` → emit `requirements-update`
   - Function call `suggest_next_steps` → emit `suggestions`
   - Function call `start_candidate_search` → delegate to `InstantSearchMatchService`
4. Loop if function calls present (tool response round-trip)
5. Emit `done`, return token usage metrics

### InstantSearchMatchService.ts

**Function:** `executeInstantSearch(config, onEvent)`

**Pipeline:**

```
1. Create Agent record in DB
   ↓
2. Query talent pool (user's active resumes, max 200)
   ↓
3. Pre-filter by keywords (no LLM — fast)
   ├─ At least 1 must-have skill keyword in resume text
   └─ Loose job title matching
   → Emit: search-started { totalResumes, filteredCount }
   ↓
4. Parallel LLM matching (concurrency=5)
   ├─ For each resume: call ResumeMatchAgent
   ├─ Score 0-100, grade A+/A/B+/B/C/D/F
   ├─ Extract highlights[], gaps[], verdict
   ├─ Emit: search-progress { completed, total }
   └─ Emit: search-result { candidate } (if score >= threshold)
   ↓
5. Save AgentCandidate records to DB
   ↓
6. Update Agent stats (completed, totalSourced, totalApproved)
   ↓
7. Emit: search-completed { totalMatched, totalScreened, topCandidates[] }
```

**Configuration (env vars):**
| Variable | Default | Description |
|----------|---------|-------------|
| `MATCH_CONCURRENCY` | 5 | Parallel LLM calls for matching |
| `MATCH_THRESHOLD` | 50 | Minimum score to include candidate |
| `MATCH_MAX_RESUMES` | 200 | Max resumes to process per search |
| `LLM_MATCH_RESUME` | (default model) | Override model for resume matching |

---

## Data Model

### AgentAlexSession

```prisma
model AgentAlexSession {
  id           String   @id @default(cuid())
  userId       String
  title        String   @default("New Chat")
  messages     Json     @default("[]")     // ChatMessage[]
  requirements Json     @default("{}")     // HiringRequirements
  linkedJobId  String?  @unique            // 1:1 link to Job
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user         User     @relation(...)
  linkedJob    Job?     @relation(...)

  @@index([userId, updatedAt])
}
```

### Agent (Search Instance)

```prisma
model Agent {
  id             String    @id @default(cuid())
  userId         String
  name           String                        // "{jobTitle} — {timestamp}"
  taskType       String    @default("search")  // "instantSearchMatch"
  status         String    @default("active")  // active → completed
  config         Json?                         // searchCriteria, threshold, stats
  totalSourced   Int       @default(0)
  totalApproved  Int       @default(0)
  jobId          String?
  lastRunAt      DateTime?
  ...
  candidates     AgentCandidate[]
}
```

### AgentCandidate (Search Result)

```prisma
model AgentCandidate {
  id          String  @id @default(cuid())
  agentId     String
  resumeId    String?
  name        String
  matchScore  Int?                    // 0-100
  status      String  @default("pending")
  notes       Json?                   // { grade, verdict, highlights[], gaps[] }
  ...
}
```

---

## Type Definitions

### HiringRequirements
```typescript
interface HiringRequirements {
  jobTitle?: string;
  department?: string;
  reportingLine?: string;
  roleType?: string;                    // "individual_contributor" | "management" | ...
  headcount?: string;
  primaryResponsibilities?: string[];
  secondaryResponsibilities?: string[];
  hardSkills?: string[];
  softSkills?: string[];
  yearsOfExperience?: string;
  education?: string;
  industryExperience?: string;
  preferredQualifications?: string[];
  salaryRange?: string;
  equityBonus?: string;
  benefits?: string[];
  workLocation?: string;
  geographicRestrictions?: string;
  startDate?: string;
  travelRequirements?: string;
  interviewStages?: string[];
  keyStakeholders?: string[];
  timelineExpectations?: string;
  teamCulture?: string;
  reasonForOpening?: string;
  dealBreakers?: string[];
}
```

### ChatMessage
```typescript
interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  isThinking?: boolean;
  isError?: boolean;
  suggestions?: string[];
  searchState?: SearchState;
}
```

### SearchState
```typescript
interface SearchState {
  status: "running" | "completed";
  searchId: string;
  agentId: string;
  totalResumes: number;
  filteredCount: number;
  completed: number;
  candidates: SearchCandidate[];
  totalMatched: number;
  totalScreened: number;
}
```

### SearchCandidate
```typescript
interface SearchCandidate {
  name: string;
  score: number;          // 0-100
  grade: string;          // A+, A, B+, B, C, D, F
  resumeId: string;
  verdict: string;
  highlights: string[];   // Top matched skills/achievements
  gaps: string[];         // Missing requirements
}
```

### ChatStreamEvent
```typescript
type ChatStreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "requirements-update"; data: Partial<HiringRequirements> }
  | { type: "suggestions"; data: string[] }
  | { type: "search-started"; data: { searchId, agentId, totalResumes, filteredCount } }
  | { type: "search-progress"; data: { searchId, completed, total } }
  | { type: "search-result"; data: { searchId, candidate: SearchCandidate } }
  | { type: "search-completed"; data: { searchId, agentId, totalMatched, totalScreened, topCandidates } }
  | { type: "done" }
  | { type: "error"; code: string; message: string }
```

---

## Data Flows

### Chat Conversation Flow

```
User types message
  → ChatInterface.handleSend()
  → api.streamChat({ history, message, locale })
  → POST /api/v1/agent-alex/chat/stream
  → GeminiAgentService.streamChatResponse()
  → Gemini 3.1 Pro (with tools)
  → Stream NDJSON events back
  → ChatInterface processes events:
     text-delta        → append to message bubble
     requirements-update → parent merges into HiringRequirements
     suggestions       → render as clickable chips
     search-*          → render SearchProgressCard
     done              → finalize message
```

### Candidate Search Flow

```
User: "帮我匹配候选人"
  → Gemini calls start_candidate_search(criteria, source)
  → Route handler calls executeInstantSearch()
  → InstantSearchMatchService:
     1. Create Agent record
     2. Query user's talent pool (up to 200 resumes)
     3. Pre-filter by keywords (fast, no LLM)
     4. Parallel match via ResumeMatchAgent (5 concurrent)
     5. Stream progress events → client renders live
     6. Save qualified candidates → AgentCandidate table
     7. Stream completion with top 10
  → Agent summarizes actual results (no hallucination)
  → Suggests next actions: "帮您邀请前3名面试"
```

### Job Creation Flow

```
User clicks "Create Job"
  → AgentAlex.handleCreateOrUpdateJob()
  → buildJobPayload(requirements, t)
     ├─ inferWorkType, inferEmploymentType, inferExperienceLevel
     ├─ inferEducation, parseSalaryRange, cleanLocation
     └─ Build description, qualifications, hard requirements
  → POST /api/v1/jobs (creates Job record)
  → PATCH /api/v1/agent-alex/sessions/:id { linkedJobId }
  → UI shows "Update Job" and "View Job" buttons
```

---

## Configuration

### Required Environment Variables

```bash
GEMINI_API_KEY=<your-key>              # Required for all Agent Alex features
```

### Optional Environment Variables

```bash
MATCH_CONCURRENCY=5                     # Parallel LLM calls for matching
MATCH_THRESHOLD=50                      # Min score to include candidate (0-100)
MATCH_MAX_RESUMES=200                   # Max resumes to process per search
LLM_MATCH_RESUME=<model>               # Override model for resume matching
```

### Placeholder Detection

The system detects placeholder API keys and shows a configuration banner:
`MY_GEMINI_API_KEY`, `YOUR_GEMINI_API_KEY`, `YOUR_API_KEY`, `GEMINI_API_KEY`

---

## Error Handling

| Error | Code | User Message |
|-------|------|-------------|
| Missing API key | 503 | "Gemini API key is missing. Set GEMINI_API_KEY in .env.local" |
| Placeholder key | 503 | "Gemini API key is still a placeholder" |
| Rate limit (429) | 429 | "You exceeded your current quota" |
| Invalid key | 400 | "Gemini rejected the configured API key" |
| Generic error | 500 | "Sorry, I encountered an error processing your request" |

---

## Security & Access Control

- All session endpoints require JWT authentication (`requireAuth` middleware)
- Sessions isolated by `userId` — users can only access their own
- Chat streaming endpoint is public (no session persistence without auth)
- Job linking: `linkedJobId` unique constraint (1:1), deletion blocked if job exists
- Token stored in localStorage as `auth_token`

---

## Performance

| Optimization | Detail |
|-------------|--------|
| Debounced auto-save | 1500ms delay prevents excessive DB writes |
| NDJSON streaming | Partial rendering for instant UI feedback |
| Pre-filtering | Keyword filter reduces expensive LLM calls before matching |
| Parallel matching | Configurable concurrency (default 5) with batching |
| Message dedup | Filters thinking/error messages from history sent to LLM |
| Indexed queries | `(userId, updatedAt)` index on AgentAlexSession |
| JSON fields | Flexible schema, no migrations needed for requirement changes |
