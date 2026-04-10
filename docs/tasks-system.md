# Tasks System — AI-Powered Recruitment Action Center

## Overview

The Tasks system is RoboHire's automated recruitment workflow engine. It transforms the platform from a tool-driven experience into an **action-driven command center** — every significant recruitment event automatically generates a task, either for an AI agent to execute autonomously or for a human recruiter to make a judgment call.

**URL:** `/product/tasks` (requires authentication)

**Admin Config:** `/product/admin?tab=Tasks` (admin role required)

---

## Core Concepts

### Human vs Agent Tasks

Tasks are classified by who should handle them:

- **Human tasks** require judgment — reviewing evaluations, making hiring decisions, shortlisting candidates. They appear in the recruiter's inbox with context cards, SLA countdowns, and quick-action buttons.
- **Agent tasks** are data processing work — running evaluations, triggering matching, sending reminders. When `autoExecute` is enabled (default for agent tasks), the system runs them automatically and marks them as `auto_completed`.

### Task Lifecycle

```
                    ┌──────────┐
          ┌────────│ pending  │────────┐
          │        └──────────┘        │
     [dismiss]      [start]       [auto-exec]
          │              │             │
          ▼              ▼             ▼
   ┌──────────┐   ┌──────────┐  ┌──────────────┐
   │dismissed │   │in_progress│  │auto_completed│
   └──────────┘   └──────────┘  └──────────────┘
                       │
                  [complete]
                       │
                       ▼
                 ┌──────────┐
                 │completed │
                 └──────────┘
```

- **Auto-archive:** Tasks in a terminal state (completed, dismissed, auto_completed) have `archivedAt` set 7 days after completion. Archived tasks are excluded from default queries.
- **Expiration:** Pending tasks past their SLA deadline with no action can be marked `expired`.

### SLA & Escalation

Each task type has a configurable SLA deadline (in hours from creation). When the deadline is breached:

1. **75% of SLA elapsed** — Amber warning indicator in the UI
2. **100% (overdue)** — Priority auto-escalates one level (low→medium, medium→high, high→critical). An overdue notification is created.
3. **150%** — "Urgent" badge, pinned to top of inbox. Email notification sent if configured.

### Priority

Tasks have four priority levels: `critical`, `high`, `medium`, `low`. Priority is set by the automation rule's default but can be:

- **Auto-overridden** by task generators based on context (e.g., `review_evaluation` is promoted to `critical` if the verdict is `strong_hire`)
- **Manually overridden** by recruiters via the task update API
- **Escalated** automatically when SLA is breached

### Deduplication

Before creating any task, the system checks for an existing task with the same `(type, userId, entityId, status=pending|in_progress)`. If a duplicate exists, creation is skipped. This prevents flooding the inbox when the same event fires multiple times.

---

## Architecture

### File Map

| Layer | File | Purpose |
|-------|------|---------|
| **Backend Service** | `backend/src/services/TaskGeneratorService.ts` | Creates tasks from events, dedup, SLA calculation, auto-notification, agent dispatch |
| **Backend Service** | `backend/src/services/TaskExecutorService.ts` | Auto-executes agent tasks (evaluation, matching, reminders, sync) |
| **Backend Service** | `backend/src/services/NotificationService.ts` | In-app notification CRUD, unread counts, email alerts |
| **Backend Routes** | `backend/src/routes/tasks.ts` | REST API: task CRUD, stats, notifications, admin rules |
| **Database** | `backend/prisma/schema.prisma` | Task, TaskAutomationRule, Notification models |
| **Frontend Page** | `frontend/src/pages/product/Tasks.tsx` | Task inbox with grouped view, filters, bulk actions, create modal |
| **Frontend Admin** | `frontend/src/pages/AdminTaskAutomationTab.tsx` | Admin config for automation rules (SLA, priority, auto-execute) |
| **Frontend Layout** | `frontend/src/layouts/ProductLayout.tsx` | Notification bell, task count badge on sidebar |
| **Design Doc** | `docs/tasks-system-design.md` | Full technical spec with sequence diagrams |

### Integration Points

The task generator is hooked into existing routes via event calls:

| Route / Service | Event | Task(s) Created |
|-----------------|-------|-----------------|
| `routes/interviews.ts` — PATCH /:id (status→completed) | Interview completed | `evaluate_interview` (agent) |
| `routes/interviews.ts` — POST /:id/evaluate | Evaluation created | `review_evaluation` (human), `hiring_decision` (human, if hire-worthy) |
| `routes/jobs.ts` — POST / | Job created as draft | `publish_job` (human) |
| `routes/jobs.ts` — PATCH /:id (status→open) | Job published | `run_matching` (agent) |
| `routes/matching.ts` — finalizeBatchSession() | Matching session completed | `review_matches` (human) |
| `routes/matching.ts` — JobMatch upsert | A+/A grade match found | `shortlist_candidates` (human) |
| `services/InstantSearchMatchService.ts` | Agent sourced candidates | `review_agent_candidates` (human) |
| Scheduled (every 6h) | Stale check: interviews | `follow_up_invitation` (human) |
| Scheduled (every 6h) | Stale check: pipeline | `stale_pipeline` (human) |
| Scheduled (every 6h) | Stale check: jobs | `close_stale_job` (human) |
| Scheduled (every 6h) | Archive cleanup | Sets `archivedAt` on 7-day-old completed tasks |

---

## All 15 Task Types

### Pipeline (5 types)

| Type | Trigger | Assignee | Default SLA | Default Priority | Description |
|------|---------|----------|-------------|------------------|-------------|
| `review_matches` | MatchingSession → completed | Human | 48h | High | Review matching results for a job. Priority elevated if A/A+ grades found. |
| `shortlist_candidates` | JobMatch created with grade A+ or A | Human | 24h | High | Strong candidate found — consider shortlisting and inviting to interview. |
| `review_evaluation` | InterviewEvaluation created | Human | 24h | Critical if strong_hire/hire, High otherwise | Review AI evaluation results. Links to the evaluation page. |
| `hiring_decision` | Evaluation verdict = strong_hire or hire | Human | 24h | Critical | Candidate recommended for hire — decide whether to extend an offer. |
| `stale_pipeline` | ResumeJobFit in "matched" status > 7 days | Human | 72h | Low | Candidate has been sitting in the pipeline without action. |

### Evaluation (2 types)

| Type | Trigger | Assignee | Default SLA | Default Priority | Description |
|------|---------|----------|-------------|------------------|-------------|
| `evaluate_interview` | Interview status → completed | Agent (auto) | 1h | High | Run EvaluationAgent on completed interview transcript. |
| `sync_gohire_interviews` | Periodic / on-demand | Agent (auto) | 4h | Medium | Sync and import interview data from GoHire platform. |

### Sourcing (2 types)

| Type | Trigger | Assignee | Default SLA | Default Priority | Description |
|------|---------|----------|-------------|------------------|-------------|
| `run_matching` | Job status → open (published) | Agent (auto) | 4h | High | Auto-match published job against the candidate pool. |
| `review_agent_candidates` | AgentCandidate created with status=pending | Human | 48h | Medium | AI agent sourced new candidates — review and approve/reject. |

### Communication (3 types)

| Type | Trigger | Assignee | Default SLA | Default Priority | Description |
|------|---------|----------|-------------|------------------|-------------|
| `send_interview_invite` | ResumeJobFit → shortlisted | Human | 24h | High | Shortlisted candidate ready for interview — send invitation. |
| `follow_up_invitation` | Interview scheduled > 3 days, not started | Human | 24h | Medium | Candidate hasn't started their interview — follow up or reschedule. |
| `interview_reminder` | 24h before Interview.scheduledAt | Agent (auto) | — | Medium | Send automated reminder email to candidate. |

### Admin (3 types)

| Type | Trigger | Assignee | Default SLA | Default Priority | Description |
|------|---------|----------|-------------|------------------|-------------|
| `publish_job` | Job created as draft | Human | 48h | Medium | New job created — review description and publish. |
| `close_stale_job` | Job open > 30 days with no activity | Human | 168h (7d) | Low | Long-open job with no recent matches/interviews — close or refresh. |
| `reparse_resume` | Incomplete parse detected | Agent (auto) | 2h | Low | Resume parse was sparse or incomplete — re-run parsing. |

---

## Database Models

### Task

```prisma
model Task {
  id            String    @id @default(cuid())
  userId        String    // assignee
  createdById   String?   // who created it (null = system)
  type          String    // one of 15 task types
  category      String    // pipeline | evaluation | sourcing | communication | admin
  assigneeType  String    @default("human") // human | agent
  title         String
  description   String?   @db.Text
  actionUrl     String?   // deep link to relevant page (e.g., /product/evaluations)
  actionLabel   String?   // button text (e.g., "Review Evaluation")
  jobId         String?
  resumeId      String?
  interviewId   String?
  candidateId   String?
  matchingSessionId String?
  agentId       String?
  hiringRequestId String?
  priority      String    @default("medium") // critical | high | medium | low
  dueAt         DateTime?
  slaDeadline   DateTime?
  escalatedAt   DateTime?
  status        String    @default("pending")
  completedAt   DateTime?
  completedBy   String?   // userId or 'system'
  dismissReason String?
  result        Json?
  triggerEvent  String    // what event spawned this
  triggerData   Json?     // event context snapshot
  isAutoGenerated Boolean @default(true)
  archivedAt    DateTime? // set 7 days after completion
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}
```

### TaskAutomationRule

```prisma
model TaskAutomationRule {
  id                  String    @id @default(cuid())
  userId              String?   // null = global default
  taskType            String    @unique
  enabled             Boolean   @default(true)
  assigneeType        String    @default("human")
  autoExecute         Boolean   @default(false)
  slaHours            Int?
  priority            String    @default("medium")
  escalateAfterHours  Int?
  emailNotify         Boolean   @default(false)
  config              Json?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
}
```

### Notification

```prisma
model Notification {
  id          String    @id @default(cuid())
  userId      String
  taskId      String?
  type        String    // task_created | task_overdue | task_escalated | task_completed
  title       String
  message     String?
  actionUrl   String?
  read        Boolean   @default(false)
  readAt      DateTime?
  emailSent   Boolean   @default(false)
  createdAt   DateTime  @default(now())
}
```

---

## API Endpoints

### Task CRUD

#### `GET /api/v1/tasks`

List tasks with filters and pagination. Respects team visibility scope.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | `active` | `active` (pending+in_progress), `all`, `pending`, `in_progress`, `completed`, `dismissed` |
| `category` | string | `all` | `pipeline`, `evaluation`, `sourcing`, `communication`, `admin` |
| `priority` | string | `all` | `critical`, `high`, `medium`, `low` |
| `assigneeType` | string | `all` | `human`, `agent` |
| `type` | string | — | Filter by specific task type (e.g., `review_evaluation`) |
| `jobId` | string | — | Filter tasks linked to a specific job |
| `search` | string | — | Search in title and description |
| `page` | number | `1` | Page number |
| `limit` | number | `20` | Items per page (max 50) |
| `includeArchived` | boolean | `false` | Include archived tasks |

**Response:**

```json
{
  "success": true,
  "tasks": [
    {
      "id": "clx...",
      "type": "review_evaluation",
      "category": "pipeline",
      "assigneeType": "human",
      "title": "Review evaluation: Sarah Chen — strong_hire",
      "description": "Score: 92. Excellent candidate...",
      "priority": "critical",
      "status": "pending",
      "dueAt": "2026-04-10T14:00:00.000Z",
      "slaDeadline": "2026-04-10T14:00:00.000Z",
      "actionUrl": "/product/evaluations",
      "actionLabel": "Review Evaluation",
      "job": { "id": "clx...", "title": "Senior Engineer", "status": "open" },
      "resume": { "id": "clx...", "name": "Sarah Chen" },
      "interview": { "id": "clx...", "candidateName": "Sarah Chen", "status": "completed" },
      "createdAt": "2026-04-09T14:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }
}
```

#### `GET /api/v1/tasks/stats`

Task counts broken down by status, priority, and category. Used for the stats bar and sidebar badge.

**Response:**

```json
{
  "success": true,
  "stats": {
    "total": 42,
    "actionRequired": 12,
    "pending": 8,
    "inProgress": 4,
    "completed": 20,
    "dismissed": 3,
    "autoCompleted": 7,
    "overdue": 2,
    "byPriority": { "critical": 3, "high": 5, "medium": 3, "low": 1 },
    "byCategory": { "pipeline": 5, "evaluation": 2, "sourcing": 2, "communication": 2, "admin": 1 }
  }
}
```

#### `GET /api/v1/tasks/:id`

Get a single task with full context (includes related job, resume, interview with evaluation details, creator, assignee).

#### `POST /api/v1/tasks`

Create a manual task. Recruiters and agents can create tasks for themselves or others.

**Request Body:**

```json
{
  "title": "Follow up with hiring manager about Backend Developer role",
  "description": "Discuss updated salary range and timeline",
  "priority": "high",
  "category": "communication",
  "dueAt": "2026-04-12T00:00:00.000Z",
  "assigneeId": "clx...",
  "jobId": "clx..."
}
```

#### `PATCH /api/v1/tasks/:id`

Update task fields: `status`, `priority`, `userId` (reassign), `description`.

#### `PATCH /api/v1/tasks/:id/complete`

Mark a task as completed. Optionally pass `result` JSON with outcome data.

#### `PATCH /api/v1/tasks/:id/dismiss`

Dismiss a task. Pass `reason` string explaining why.

#### `POST /api/v1/tasks/bulk-action`

Perform bulk operations on multiple tasks.

**Request Body:**

```json
{
  "taskIds": ["clx1...", "clx2...", "clx3..."],
  "action": "complete",
  "reason": "Batch reviewed"
}
```

Actions: `complete`, `dismiss` (with optional `reason`), `reassign` (with `assigneeId`).

---

### Notifications

#### `GET /api/v1/tasks/notifications/list`

List notifications with pagination.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | `20` | Max notifications to return |
| `offset` | number | `0` | Pagination offset |
| `unreadOnly` | boolean | `false` | Only return unread notifications |

#### `GET /api/v1/tasks/notifications/unread-count`

Returns `{ count: number }` — used for the notification bell badge. Polled every 60 seconds by the frontend.

#### `PATCH /api/v1/tasks/notifications/:id/read`

Mark a single notification as read.

#### `POST /api/v1/tasks/notifications/mark-all-read`

Mark all notifications as read for the current user.

---

### Admin: Automation Rules

All admin endpoints require `role === 'admin'`.

#### `GET /api/v1/tasks/admin/rules`

List all 15 automation rules. Seeds defaults on first call if the table is empty.

**Response:**

```json
{
  "success": true,
  "rules": [
    {
      "id": "clx...",
      "taskType": "evaluate_interview",
      "enabled": true,
      "assigneeType": "agent",
      "autoExecute": true,
      "slaHours": 1,
      "priority": "high",
      "escalateAfterHours": 4,
      "emailNotify": false
    }
  ]
}
```

#### `PATCH /api/v1/tasks/admin/rules/:taskType`

Update a rule. All fields are optional — only send what changed.

**Request Body (example):**

```json
{
  "enabled": false,
  "slaHours": 48,
  "priority": "medium",
  "emailNotify": true
}
```

#### `POST /api/v1/tasks/admin/rules/reset`

Delete all rules and re-seed from defaults. Returns the fresh rules array.

#### `POST /api/v1/tasks/admin/run-stale-checks`

Manually trigger the scheduled stale detection and escalation checks. Useful for testing or when you want immediate results.

---

## Frontend Pages

### Tasks Page (`/product/tasks`)

The main task inbox. Accessible from the sidebar under "Client Management".

**Layout:**

1. **Header** — Title, subtitle, "New Task" button
2. **Stats bar** — 6 KPI cards: Action Required, Overdue, Critical, High, Completed, Total
3. **Filter bar** — Status, category, priority, assignee type, search. Bulk action buttons appear when tasks are selected.
4. **Grouped task list** — Tasks grouped into collapsible sections:
   - **Overdue** (red) — Tasks past their SLA deadline
   - **Today** (amber) — Tasks due today
   - **This Week** (blue) — Tasks due this week
   - **Later** (slate) — Tasks with later deadlines or no deadline
   - **Completed** (green) — Recently completed/dismissed/auto_completed tasks

**Task Card** displays:
- Priority dot (color-coded)
- Title (with strikethrough if completed)
- Agent badge (purple) for agent-assigned tasks
- Overdue / Escalated badges when applicable
- Description (2-line clamp)
- Context chips: priority label, category, linked job title, resume name, interview candidate name
- Time ago (creation) and SLA countdown
- Action buttons: primary action (navigates to relevant page), complete (checkmark), dismiss (X)

**Manual Task Creation Modal:**
- Title (required), description, priority (dropdown), category (dropdown), due date (date picker)
- Creates a human-assigned task with `triggerEvent: 'manual_creation'`

### Notification Bell

Located in the desktop header bar (top-right, next to the language selector).

- **Bell icon** with red unread-count badge
- **Dropdown** showing 10 most recent notifications
  - Unread notifications have a blue dot and blue background tint
  - Click a notification → marks it as read and navigates to `actionUrl`
  - "Mark all read" button in header
  - "View all tasks" link at bottom → navigates to `/product/tasks`
- **Polling:** Unread count refreshes every 60 seconds

### Sidebar Badge

The "Tasks" nav item in the sidebar shows a red badge with the `actionRequired` count (pending + in_progress tasks). Displays "99+" if count exceeds 99. When the sidebar is collapsed, shows a small red dot instead.

### Admin Task Automation Tab

Accessible at `/product/admin?tab=Tasks` (admin only).

**Features:**
- All 15 task types displayed in cards grouped by category (Pipeline, Evaluation, Sourcing, Communication, Admin)
- Per-rule controls:
  - **Enable/disable toggle** — Disabling a task type prevents new tasks of that type from being created
  - **Priority selector** — Default priority for new tasks of this type
  - **SLA hours** — Number input for deadline threshold
  - **Escalate after hours** — When to auto-escalate priority
  - **Auto-execute checkbox** (agent tasks only) — Whether to run the task automatically
  - **Email notify checkbox** — Whether to send email on task creation
- **"Run Stale Checks"** button — Manually triggers follow-up invitation, stale pipeline, and stale job detection
- **"Reset to Defaults"** button — Resets all rules to factory settings (with confirmation)

---

## Sequence Flows

### Flow 1: Interview Completed → Auto-Evaluate → Human Review → Hire Decision

```
1. Candidate completes AI interview
2. interviews.ts sets status='completed'
3. TaskGenerator.onInterviewCompleted() fires
   → Creates task: evaluate_interview (agent, auto-execute)
4. TaskExecutor runs EvaluationAgent
   → Task marked auto_completed
5. TaskGenerator.onEvaluationCreated() fires
   → Creates task: review_evaluation (human)
   → If verdict=strong_hire/hire, also creates: hiring_decision (human, critical priority)
6. Recruiter sees both tasks in inbox
   → Reviews evaluation → completes review_evaluation task
   → Makes hiring decision → completes hiring_decision task
```

### Flow 2: Job Published → Auto-Match → Review Matches → Shortlist

```
1. Recruiter publishes job (status draft→open)
2. TaskGenerator.onJobPublished() fires
   → Creates task: run_matching (agent, auto-execute)
3. TaskExecutor triggers MatchOrchestratorService
   → Task marked auto_completed
4. finalizeBatchSession() fires TaskGenerator.onMatchingCompleted()
   → Creates task: review_matches (human)
5. For each A+/A grade match, TaskGenerator.onHighMatchFound()
   → Creates task: shortlist_candidates (human, per candidate)
6. Recruiter reviews matches → shortlists top candidates
   → Triggers: send_interview_invite (human) for shortlisted candidates
```

### Flow 3: Stale Detection (Scheduled, every 6 hours)

```
1. Cron fires TaskGenerator.runStaleChecks()
2. Queries interviews with status=scheduled, created > 3 days ago
   → Creates: follow_up_invitation for each (with dedup)
3. Queries ResumeJobFit with pipelineStatus=matched, updated > 7 days ago
   → Creates: stale_pipeline for each (with dedup)
4. Queries Jobs with status=open, updated > 30 days ago
   → Creates: close_stale_job for each (with dedup)
5. Archives tasks completed/dismissed > 7 days ago
   → Sets archivedAt timestamp
6. TaskGenerator.runEscalationChecks()
   → Finds tasks past SLA with no escalation
   → Promotes priority one level, sets escalatedAt
   → Creates task_overdue notification
```

---

## Configuration Defaults

All defaults are seeded to the `TaskAutomationRule` table on first access. Admins can modify any value through the UI.

| Task Type | Enabled | Assignee | Auto-Execute | SLA | Priority | Escalate After | Email |
|-----------|---------|----------|--------------|-----|----------|----------------|-------|
| `evaluate_interview` | Yes | Agent | Yes | 1h | High | 4h | No |
| `review_evaluation` | Yes | Human | No | 24h | High | 48h | Yes |
| `hiring_decision` | Yes | Human | No | 24h | Critical | 48h | Yes |
| `review_matches` | Yes | Human | No | 48h | High | 72h | No |
| `shortlist_candidates` | Yes | Human | No | 24h | High | 48h | No |
| `send_interview_invite` | Yes | Human | No | 24h | High | 48h | No |
| `follow_up_invitation` | Yes | Human | No | 24h | Medium | 48h | No |
| `interview_reminder` | Yes | Agent | Yes | — | Medium | — | No |
| `run_matching` | Yes | Agent | Yes | 4h | High | 8h | No |
| `review_agent_candidates` | Yes | Human | No | 48h | Medium | 72h | No |
| `publish_job` | Yes | Human | No | 48h | Medium | 96h | No |
| `close_stale_job` | Yes | Human | No | 168h | Low | 336h | No |
| `stale_pipeline` | Yes | Human | No | 72h | Low | 168h | No |
| `sync_gohire_interviews` | Yes | Agent | Yes | 4h | Medium | — | No |
| `reparse_resume` | Yes | Agent | Yes | 2h | Low | — | No |

---

## Email Notifications

Critical and overdue tasks can trigger email notifications via the Resend API (configured with `RESEND_API_KEY`).

**Subject:** `[RoboHire] Action Required: {task.title}`

**Content:**
- Priority badge (color-coded)
- Task title and description
- SLA deadline
- Direct action link to the relevant page

Email is sent when:
1. A task is created with `emailNotify: true` in its automation rule
2. A task becomes overdue (SLA breach + escalation)

---

## Adding a New Task Type

To add a 16th task type (e.g., `offer_sent`):

1. **Add the type constant** in `backend/src/services/TaskGeneratorService.ts`:
   ```typescript
   // In TASK_TYPES:
   OFFER_SENT: 'offer_sent',
   
   // In TASK_CATEGORIES:
   [TASK_TYPES.OFFER_SENT]: 'pipeline',
   
   // In DEFAULT_RULES:
   { taskType: 'offer_sent', enabled: true, assigneeType: 'human', ... },
   ```

2. **Add a convenience method** on `TaskGeneratorService`:
   ```typescript
   async onOfferSent(data: { ... }): Promise<void> {
     await this.createTask({ type: TASK_TYPES.OFFER_SENT, ... });
   }
   ```

3. **Hook the event** in the relevant route file:
   ```typescript
   import { taskGenerator } from '../services/TaskGeneratorService.js';
   // After offer creation:
   void taskGenerator.onOfferSent({ ... });
   ```

4. **Add the type label** in the admin tab (`AdminTaskAutomationTab.tsx`, `TYPE_LABELS` object).

5. **Seed the new rule**: Delete the existing automation rules (or call the reset endpoint) so the new default gets seeded.

No frontend Tasks page changes are needed — the inbox renders all task types generically based on `title`, `description`, `actionUrl`, and `priority`.

---

## Scheduled Jobs

The task system relies on periodic checks that should be run via an external scheduler (cron, Render cron job, or a setInterval in the server process):

| Job | Endpoint | Frequency | Purpose |
|-----|----------|-----------|---------|
| Stale checks | `POST /api/v1/tasks/admin/run-stale-checks` | Every 6 hours | Detect stale invitations, pipeline, and jobs |
| Escalation | (included in stale checks) | Every 6 hours | Escalate overdue tasks and send notifications |
| Archive cleanup | (included in stale checks) | Every 6 hours | Set `archivedAt` on 7-day-old completed tasks |

These can be triggered manually from the admin panel or automated via a cron job calling the endpoint with an admin API key.
