# RoboHire Database Documentation

> PostgreSQL database managed via Prisma ORM.
> Schema source: `backend/prisma/schema.prisma`

---

## Table of Contents

1. [Overview](#overview)
2. [Entity-Relationship Summary](#entity-relationship-summary)
3. [Core Domain Models](#core-domain-models)
   - [User](#user)
   - [Session](#session)
   - [Team](#team)
   - [TeamMember](#teammember)
   - [TeamInvitation](#teaminvitation)
4. [Recruitment Pipeline](#recruitment-pipeline)
   - [HiringRequest](#hiringrequest)
   - [Candidate](#candidate)
   - [HiringSession](#hiringsession)
   - [Job](#job)
   - [Resume](#resume)
   - [ResumeVersion](#resumeversion)
   - [ResumeJobFit](#resumejobfit)
   - [JobMatch](#jobmatch)
   - [MatchingSession](#matchingsession)
5. [Interview System](#interview-system)
   - [Interview](#interview)
   - [InterviewDialogTurn](#interviewdialogturn)
   - [InterviewEvaluation](#interviewevaluation)
   - [InterviewRoomConfigVersion](#interviewroomconfigversion)
   - [GoHireInterview](#gohireinterview)
6. [AI Agents](#ai-agents)
   - [Agent](#agent)
   - [AgentCandidate](#agentcandidate)
   - [AgentAlexSession](#agentalexsession)
7. [API & Usage Tracking](#api--usage-tracking)
   - [ApiKey](#apikey)
   - [ApiUsageRecord](#apiusagerecord)
   - [ApiRequestLog](#apirequestlog)
   - [LLMCallLog](#llmcalllog)
8. [Billing & Subscriptions](#billing--subscriptions)
   - [TopUpRecord](#topuprecord)
   - [AdminAdjustment](#adminadjustment)
9. [ATS Integrations](#ats-integrations)
   - [ATSIntegration](#atsintegration)
   - [ATSSyncLog](#atssynclog)
   - [WebhookDelivery](#webhookdelivery)
10. [Analytics & Configuration](#analytics--configuration)
    - [UserActivity](#useractivity)
    - [AppConfig](#appconfig)
11. [Index Strategy](#index-strategy)
12. [ID & Timestamp Conventions](#id--timestamp-conventions)

---

## Overview

The RoboHire database is the persistence layer for an AI-powered recruitment platform. It stores everything from user accounts and job postings to AI-generated interview evaluations and LLM cost tracking. The schema is organized around these functional areas:

| Area | Purpose | Key Models |
|------|---------|------------|
| **Identity & Teams** | User accounts, auth sessions, team collaboration | User, Session, Team, TeamMember |
| **Recruitment Pipeline** | Job definitions, resume management, AI matching | Job, Resume, HiringRequest, JobMatch, ResumeJobFit |
| **Interviews** | AI-powered interviews with transcripts and evaluations | Interview, InterviewDialogTurn, InterviewEvaluation |
| **AI Agents** | Autonomous recruitment agents and the Agent Alex chatbot | Agent, AgentCandidate, AgentAlexSession |
| **Usage & Billing** | API key management, token/cost tracking, Stripe integration | ApiKey, ApiRequestLog, LLMCallLog, TopUpRecord |
| **ATS Integrations** | External ATS sync (Greenhouse, Lever, etc.) | ATSIntegration, ATSSyncLog, WebhookDelivery |
| **Analytics** | User behavior tracking, app configuration | UserActivity, AppConfig |

All models use **CUID** primary keys (string-based, globally unique) and **UTC timestamps**.

---

## Entity-Relationship Summary

```
User ─┬── Team (many-to-one, optional)
      ├── Session[] (auth sessions)
      ├── HiringRequest[] ──┬── Candidate[] ── Interview[]
      │                     ├── ResumeJobFit[]
      │                     └── Job[]
      ├── Job[] ──┬── JobMatch[] ── Resume
      │           ├── MatchingSession[]
      │           ├── Agent[]
      │           └── AgentAlexSession (one-to-one)
      ├── Resume[] ──┬── ResumeVersion[]
      │              ├── ResumeJobFit[]
      │              ├── JobMatch[]
      │              └── AgentCandidate[]
      ├── Interview[] ──┬── InterviewDialogTurn[]
      │                 └── InterviewEvaluation (one-to-one)
      ├── Agent[] ── AgentCandidate[]
      ├── AgentAlexSession[]
      ├── ApiKey[] ──┬── ApiUsageRecord[]
      │              └── ApiRequestLog[]
      ├── ApiRequestLog[] ── LLMCallLog[]
      ├── ATSIntegration[] ──┬── ATSSyncLog[]
      │                      └── WebhookDelivery[]
      ├── TopUpRecord[]
      ├── AdminAdjustment[] (as target and as admin)
      └── UserActivity[]
```

---

## Core Domain Models

### User

The central identity model. Every authenticated entity in the system is a User.

| Column | Type | Description |
|--------|------|-------------|
| `id` | String (CUID) | Primary key |
| `email` | String | Unique login identifier |
| `passwordHash` | String? | Bcrypt hash; null for OAuth-only users |
| `name` | String? | Display name |
| `phone` | String? | Contact phone |
| `jobTitle` | String? | User's role (e.g. "HR Manager") |
| `company` | String? | Company name |
| `avatar` | String? | Avatar URL |
| `role` | String | `"user"` or `"admin"` — controls platform-level permissions |
| `provider` | String? | Auth provider: `"email"`, `"google"`, `"github"`, `"linkedin"` |
| `providerId` | String? | External provider's user ID (for OAuth) |
| `teamId` | String? | FK to Team — which team the user belongs to |
| `stripeCustomerId` | String? | Stripe customer ID (unique) |
| `subscriptionTier` | String | `"free"`, `"startup"`, `"business"`, `"custom"` |
| `subscriptionStatus` | String | `"active"`, `"past_due"`, `"canceled"` |
| `subscriptionId` | String? | Stripe subscription ID |
| `currentPeriodEnd` | DateTime? | When the current billing period ends |
| `trialEnd` | DateTime? | Trial expiration date |
| `interviewsUsed` | Int | Counter: AI interviews consumed in current period |
| `resumeMatchesUsed` | Int | Counter: resume matches consumed in current period |
| `topUpBalance` | Float | Pay-as-you-go credit balance in dollars |
| `customMaxInterviews` | Int? | Admin override for max interviews (null = plan default) |
| `customMaxMatches` | Int? | Admin override for max matches (null = plan default) |

**Key relationships:** A User owns HiringRequests, Jobs, Resumes, Interviews, Agents, ApiKeys, and all usage/billing records. A User optionally belongs to one Team.

**Indexes:** `email`, `(provider, providerId)`, `teamId`, `createdAt`

---

### Session

Database-backed auth sessions. Used alongside JWTs for session-token authentication (30-day expiry).

| Column | Type | Description |
|--------|------|-------------|
| `id` | String (CUID) | Primary key |
| `userId` | String | FK to User |
| `token` | String | Unique session token (stored in cookie or header) |
| `expiresAt` | DateTime | When this session becomes invalid |

**Cascade:** Deleted when the parent User is deleted.

---

### Team

Groups users together for shared visibility across recruitment data (jobs, resumes, interviews).

| Column | Type | Description |
|--------|------|-------------|
| `id` | String (CUID) | Primary key |
| `name` | String | Team display name |
| `description` | String? | Optional description |

**Relationships:**
- `members` — Users whose `teamId` points to this Team
- `teamMembers` — Explicit TeamMember join records (with roles)
- `invitations` — Pending TeamInvitations

---

### TeamMember

Explicit join table between User and Team, storing the user's role within the team.

| Column | Type | Description |
|--------|------|-------------|
| `userId` | String | FK to User |
| `teamId` | String | FK to Team |
| `role` | String | `"member"` or `"lead"` |

**Unique constraint:** `(userId, teamId)` — a user can only have one membership per team.
**Cascade:** Deleted if either the User or Team is deleted.

---

### TeamInvitation

Tracks pending invitations to join a team.

| Column | Type | Description |
|--------|------|-------------|
| `teamId` | String | FK to Team |
| `email` | String | Invited email address |
| `invitedBy` | String | FK to User who sent the invite |
| `status` | String | `"pending"`, `"accepted"`, `"declined"` |

**Unique constraint:** `(teamId, email)` — one active invitation per email per team.

---

## Recruitment Pipeline

### HiringRequest

A recruitment requisition — the top-level entity that groups candidates, job fit evaluations, jobs, and interviews for a single hiring need.

| Column | Type | Description |
|--------|------|-------------|
| `id` | String (CUID) | Primary key |
| `userId` | String | FK to User who created it |
| `title` | String | Position title (e.g. "Senior Backend Engineer") |
| `clientName` | String? | Client company name (for agency recruiters) |
| `requirements` | Text | Full hiring requirements text |
| `jobDescription` | Text? | Associated job description |
| `status` | String | `"active"`, `"paused"`, `"closed"` |
| `webhookUrl` | String? | URL for webhook notifications when candidates are processed |
| `intelligenceData` | Json? | AI-generated intelligence/insights about the requisition |
| `intelligenceUpdatedAt` | DateTime? | When intelligence data was last refreshed |

**Relationships:** Owns Candidates, ResumeJobFits, Jobs, and Interviews.
**Indexes:** `userId`, `status`, `(userId, status)`, `(userId, createdAt)`

---

### Candidate

A person being evaluated against a HiringRequest. Created when resumes are submitted through the API or ATS integration.

| Column | Type | Description |
|--------|------|-------------|
| `id` | String (CUID) | Primary key |
| `hiringRequestId` | String | FK to HiringRequest |
| `name` | String | Candidate's full name |
| `email` | String | Contact email |
| `resumeText` | Text | Full resume content (plain text) |
| `matchScore` | Int? | AI-generated match score (0-100) |
| `status` | String | Pipeline status: `"pending"` → `"screening"` → `"interviewed"` → `"shortlisted"` / `"rejected"` |
| `evaluationReport` | Json? | Full AI evaluation output |
| `externalAtsId` | String? | ID in external ATS system |
| `externalAtsProvider` | String? | Which ATS the candidate was imported from |

**Cascade:** Deleted when the parent HiringRequest is deleted.
**Indexes:** `hiringRequestId`, `status`, `email`, `(hiringRequestId, status)`, `(hiringRequestId, matchScore)`, `externalAtsId`

---

### HiringSession

A chat-based hiring conversation session. Stores the message history as a JSON array. Used by the legacy hiring chat feature.

| Column | Type | Description |
|--------|------|-------------|
| `id` | String (CUID) | Primary key |
| `userId` | String | FK to User |
| `title` | String? | Session title |
| `messages` | Json | Array of chat messages (default: `[]`) |
| `status` | String | `"active"`, `"completed"`, `"archived"` |

---

### Job

A fully structured job posting. Can be created independently or linked to a HiringRequest. This is the primary entity for the smart matching system.

| Column | Type | Description |
|--------|------|-------------|
| `id` | String (CUID) | Primary key |
| `userId` | String | FK to User |
| `hiringRequestId` | String? | Optional FK to HiringRequest |
| `title` | String | Job title |
| `department` | String? | Department name |
| `location` | String? | Primary location |
| `workType` | String? | `"remote"`, `"hybrid"`, `"onsite"` |
| `employmentType` | String? | `"full-time"`, `"part-time"`, `"contract"`, `"internship"` |
| `experienceLevel` | String? | `"entry"`, `"mid"`, `"senior"`, `"lead"`, `"executive"` |
| `education` | String? | Required education: `"high_school"`, `"associate"`, `"bachelor"`, `"master"`, `"phd"`, `"none"` |
| `headcount` | Int | Number of positions to fill (default: 1) |
| `salaryMin` / `salaryMax` | Int? | Salary range (numeric) |
| `salaryCurrency` | String? | Currency code (default: `"USD"`) |
| `salaryText` | Text? | Free-text salary (e.g. "base3000+补贴600+绩效1000") |
| `salaryPeriod` | String? | `"monthly"` or `"yearly"` |
| `companyName` | String? | Hiring company |
| `description` | Text? | Full job description |
| `qualifications` | Text? | Required qualifications |
| `hardRequirements` | Text? | Must-have requirements |
| `niceToHave` | Text? | Preferred qualifications |
| `benefits` | Text? | Benefits and perks |
| `requirements` | Json? | Structured: `{ mustHave: [], niceToHave: [] }` |
| `parsedData` | Json? | AI-parsed JD cache (from JDParseAgent) |
| `locations` | Json? | Array of `{ country, city }` |
| `interviewMode` | String? | `"standard"` or `"question_bank"` |
| `passingScore` | Int? | Interview passing threshold, 20-80 (default: 60) |
| `interviewLanguage` | String? | Language for AI interviews (default: `"en"`) |
| `interviewDuration` | Int? | Minutes: 15, 30, 45, or 60 (default: 30) |
| `interviewRequirements` | Text? | Custom interview instructions |
| `evaluationRules` | Text? | Custom evaluation criteria |
| `notes` | Text? | Internal notes (not shown to candidates) |
| `status` | String | `"draft"` → `"open"` → `"paused"` / `"closed"` / `"filled"` |
| `publishedAt` | DateTime? | When the job was published |
| `closedAt` | DateTime? | When the job was closed/filled |

**Relationships:** Owns JobMatches, MatchingSessions, Agents; optionally linked to one AgentAlexSession.
**Indexes:** `userId`, `(hiringRequestId, updatedAt)`, `status`, `(userId, status)`, `(userId, createdAt)`

---

### Resume

A parsed resume stored in the talent pool. Supports deduplication via content hashing, AI-generated summaries, and version tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | String (CUID) | Primary key |
| `userId` | String | FK to User who uploaded it |
| `recruiterUserId` | String? | FK to User — the recruiter who owns this resume (for team scenarios) |
| `name` | String | Candidate name (extracted or from filename) |
| `email` | String? | Candidate email |
| `phone` | String? | Candidate phone |
| `currentRole` | String? | Current job title |
| `experienceYears` | String? | Years of experience |
| `summary` | Text? | AI-generated professional summary paragraph |
| `highlight` | String? | One-line highlight for card display |
| `resumeText` | Text | Full resume content (plain text / markdown) |
| `parsedData` | Json? | Structured parse output from ResumeParseAgent |
| `insightData` | Json? | AI-generated insights about the candidate |
| `jobFitData` | Json? | Cached job fit analysis |
| `fileName` | String? | Original upload filename |
| `fileSize` | Int? | File size in bytes |
| `fileType` | String? | MIME type |
| `originalFile*` | Various | Original file storage metadata (provider, key, name, MIME, size, checksum, timestamp) |
| `contentHash` | String? | SHA hash of resume text for deduplication |
| `status` | String | `"active"` (default) |
| `source` | String | `"upload"` (default) — how the resume entered the system |
| `tags` | String[] | User-assigned tags for categorization |
| `notes` | Text? | Recruiter notes |
| `preferences` | Json? | Candidate preferences (location, salary, etc.) |

**Unique constraint:** `(userId, contentHash)` — prevents the same user from uploading duplicate resumes.
**Relationships:** Owns ResumeVersions, ResumeJobFits, JobMatches, AgentCandidates.
**Indexes:** `userId`, `recruiterUserId`, `(userId, status)`, `(userId, status, createdAt)`, `name`, `contentHash`, `originalFileKey`, `createdAt`

---

### ResumeVersion

Tracks historical versions of a resume. Created whenever a resume is re-parsed or edited.

| Column | Type | Description |
|--------|------|-------------|
| `resumeId` | String | FK to Resume |
| `userId` | String | FK to User who created this version |
| `versionName` | String? | Label (e.g. "v2 - updated skills") |
| `resumeText` | Text | Full text at this version |
| `parsedData` | Json? | Parsed data at this version |
| `name` / `email` / `phone` / `currentRole` / `experienceYears` | Various | Snapshot of extracted fields |
| `changeNote` | String? | Description of what changed |

**Cascade:** Deleted when the parent Resume is deleted.

---

### ResumeJobFit

The result of matching a Resume against a HiringRequest. Represents a candidate's fit for a specific position.

| Column | Type | Description |
|--------|------|-------------|
| `resumeId` | String | FK to Resume |
| `hiringRequestId` | String | FK to HiringRequest |
| `fitScore` | Int? | Match score (0-100) |
| `fitGrade` | String? | Letter grade (A+, A, B+, etc.) |
| `fitData` | Json? | Full match analysis output from ResumeMatchAgent |
| `pipelineStatus` | String | `"matched"` → `"shortlisted"` / `"rejected"` / `"invited"` |
| `invitedAt` | DateTime? | When an interview invitation was sent |
| `inviteData` | Json? | Invitation details |

**Unique constraint:** `(resumeId, hiringRequestId)` — one fit record per resume-request pair.

---

### JobMatch

The result of matching a Resume against a Job (the newer matching system). Similar to ResumeJobFit but operates on Jobs instead of HiringRequests.

| Column | Type | Description |
|--------|------|-------------|
| `jobId` | String | FK to Job |
| `resumeId` | String | FK to Resume |
| `score` | Int? | Match score (0-100) |
| `grade` | String? | `"A+"`, `"A"`, `"B+"`, `"B"`, `"C"`, `"D"`, `"F"` |
| `matchData` | Json? | Full ResumeMatchAgent output |
| `status` | String | `"new"` → `"reviewed"` → `"shortlisted"` / `"applied"` / `"rejected"` / `"invited"` |
| `reviewedAt` / `reviewedBy` | Various | When/who reviewed the match |
| `appliedAt` / `appliedBy` | Various | When/who moved to applied status |

**Unique constraint:** `(jobId, resumeId)` — one match record per job-resume pair.

---

### MatchingSession

Records a batch matching operation — when a user runs AI matching for multiple resumes against a single job.

| Column | Type | Description |
|--------|------|-------------|
| `userId` | String | FK to User |
| `jobId` | String | FK to Job |
| `title` | String? | Session label |
| `status` | String | `"running"`, `"completed"`, `"failed"` |
| `config` | Json | Snapshot: `{ resumeIds[], preFilter: { locations?, jobTypes?, freeText? } }` |
| `preFilterModel` | String? | LLM model used for pre-filtering |
| `preFilterResult` | Json? | `{ passedIds[], excluded: [{ resumeId, reason }], durationMs }` |
| `totalResumes` / `totalFiltered` / `totalMatched` / `totalFailed` | Int | Processing counts |
| `avgScore` | Float? | Average match score across results |
| `topGrade` | String? | Best grade achieved |
| `totalCost` / `totalTokens` / `totalLLMCalls` | Various | Cost tracking for the entire batch |
| `completedAt` | DateTime? | When the session finished |

---

## Interview System

### Interview

An AI-powered interview instance. Supports video, audio, and text modalities via LiveKit.

| Column | Type | Description |
|--------|------|-------------|
| `id` | String (CUID) | Primary key |
| `userId` | String | FK to User (the recruiter) |
| `jobId` | String? | FK to Job |
| `resumeId` | String? | FK to the candidate's Resume |
| `hiringRequestId` | String? | FK to HiringRequest |
| `candidateId` | String? | FK to Candidate |
| `candidateName` | String | Candidate's display name |
| `candidateEmail` | String? | Candidate's email |
| `jobTitle` | String? | Position being interviewed for |
| `jobDescription` | Text? | JD provided to the AI interviewer |
| `resumeText` | Text? | Resume provided to the AI interviewer |
| `status` | String | `"scheduled"` → `"in_progress"` → `"completed"` / `"cancelled"` / `"expired"` |
| `type` | String | `"ai_video"`, `"ai_audio"`, `"ai_text"` |
| `scheduledAt` | DateTime? | Planned start time |
| `startedAt` | DateTime? | Actual start time |
| `completedAt` | DateTime? | When the interview ended |
| `duration` | Int? | Duration in **seconds** |
| `accessToken` | String? | Unique token for candidate to join (used in interview URL) |
| `roomId` | String? | LiveKit room identifier |
| `transcript` | Json? | Array of `{ role, content, timestamp }` |
| `recordingUrl` | String? | URL to interview recording |
| `gohireUserId` | String? | GoHire user ID (for imported interviews) |
| `metadata` | Json? | Arbitrary metadata |

**Status flow:** `scheduled` → `in_progress` → `completed`. Completion is triggered by either candidate disconnect (with 5-minute minimum duration) or transcript receipt from the LiveKit agent.

**Relationships:** Has one optional InterviewEvaluation, many InterviewDialogTurns.
**Indexes:** `userId`, `status`, `(userId, status)`, `accessToken`, `(userId, createdAt)`, `hiringRequestId`, `candidateId`, `resumeId`, `gohireUserId`

---

### InterviewDialogTurn

Individual utterances in an interview transcript, stored as normalized rows for querying.

| Column | Type | Description |
|--------|------|-------------|
| `interviewId` | String | FK to Interview |
| `candidateId` | String? | FK to Candidate (if linked) |
| `userId` | String | FK to User (the recruiter who owns the interview) |
| `role` | String | Speaker role (e.g. `"interviewer"`, `"candidate"`) |
| `speakerName` | String? | Display name of the speaker |
| `content` | Text | What was said |
| `timestamp` | DateTime | When this turn occurred |
| `sequence` | Int | Order within the interview |

**Unique constraint:** `(interviewId, sequence)` — ensures ordered, non-duplicate turns.

---

### InterviewEvaluation

AI-generated evaluation of an interview. One-to-one with Interview.

| Column | Type | Description |
|--------|------|-------------|
| `interviewId` | String | FK to Interview (unique — one evaluation per interview) |
| `overallScore` | Int? | Numeric score (0-100) |
| `grade` | String? | Letter grade |
| `verdict` | String? | `"strong_hire"`, `"hire"`, `"lean_hire"`, `"lean_no_hire"`, `"no_hire"` |
| `evaluationData` | Json? | Full EvaluationAgent output (detailed scoring by category) |
| `summary` | Text? | Human-readable evaluation summary |
| `strengths` | Json? | String array of candidate strengths |
| `weaknesses` | Json? | String array of candidate weaknesses |

---

### InterviewRoomConfigVersion

Version-controlled configuration for the AI interview room (LiveKit agent behavior, question templates, etc.).

| Column | Type | Description |
|--------|------|-------------|
| `versionNumber` | Int | Unique sequential version number |
| `versionLabel` | String? | Human-readable label (e.g. "v3 - added coding questions") |
| `changeNote` | Text? | Description of what changed |
| `config` | Json | The full configuration payload |
| `isActive` | Boolean | Whether this version is currently live (only one should be active) |
| `activatedAt` | DateTime? | When this version was activated |
| `createdById` | String? | FK to User who created it |

---

### GoHireInterview

Imported interview records from the GoHire external platform. These are standalone records not linked to RoboHire's internal Interview model.

| Column | Type | Description |
|--------|------|-------------|
| `gohireUserId` | String | Candidate UUID in GoHire |
| `candidateName` | String | Candidate name |
| `candidateEmail` | String? | Candidate email |
| `interviewDatetime` | DateTime | Interview start time |
| `interviewEndDatetime` | DateTime? | Interview end time |
| `duration` | Int? | Duration in **minutes** |
| `videoUrl` | Text? | Video recording URL |
| `recruiterName` / `recruiterEmail` / `recruiterId` | Various | Recruiter details |
| `jobTitle` / `jobDescription` / `jobRequirements` | Various | Job context |
| `interviewRequirements` | Text? | Interview-specific requirements |
| `resumeUrl` | Text? | Resume download URL |
| `transcriptUrl` | Text? | Transcript download URL |
| `parsedResumeText` | Text? | Cached parsed resume markdown |
| `transcript` | Text? | Fetched/generated transcript text |
| `evaluationData` | Json? | AI evaluation result |
| `evaluationScore` | Int? | Quick-access score (0-100) |
| `evaluationVerdict` | String? | `"strong_hire"`, `"hire"`, `"weak_hire"`, `"no_hire"` |
| `evaluationShareToken` | String? | Unique token for public evaluation report sharing |

**Note:** This model has no foreign keys to other RoboHire models. It's a self-contained import from GoHire's system.

---

## AI Agents

### Agent

An autonomous recruitment agent that sources and evaluates candidates. Can be linked to a specific Job.

| Column | Type | Description |
|--------|------|-------------|
| `userId` | String | FK to User who created it |
| `name` | String | Agent name |
| `description` | String | Natural-language search criteria |
| `taskType` | String | `"search"` or `"match"` |
| `instructions` | String? | User-provided instructions for agent behavior |
| `status` | String | `"active"`, `"paused"`, `"completed"` |
| `jobId` | String? | FK to Job (required for task execution) |
| `config` | Json? | Search configuration: `{ location?, skills[], experienceMin?, experienceMax?, keywords? }` |
| `totalSourced` / `totalApproved` / `totalRejected` / `totalContacted` | Int | Running counters |
| `lastRunAt` | DateTime? | Last execution timestamp |

**Relationships:** Owns AgentCandidates.

---

### AgentCandidate

A candidate sourced or identified by an Agent.

| Column | Type | Description |
|--------|------|-------------|
| `agentId` | String | FK to Agent |
| `resumeId` | String? | FK to Resume (if the candidate exists in the talent pool) |
| `name` | String | Candidate name |
| `email` | String? | Contact email |
| `profileUrl` | String? | External profile link (e.g. LinkedIn) |
| `headline` | String? | Current role or summary |
| `matchScore` | Float? | Agent-assigned match score (0-100) |
| `status` | String | `"pending"` → `"approved"` / `"rejected"` / `"contacted"` |
| `outreachSentAt` | DateTime? | When outreach was sent |
| `notes` | String? | Agent or user notes |

---

### AgentAlexSession

A conversation session with Agent Alex, the AI recruitment requirements chatbot (powered by Gemini). Stores chat history and the evolving hiring requirements document.

| Column | Type | Description |
|--------|------|-------------|
| `userId` | String | FK to User |
| `title` | String | Session title (default: "New Chat") |
| `messages` | Json | Array of ChatMessage objects (default: `[]`) |
| `requirements` | Json | The current HiringRequirements document (default: `{}`) |
| `linkedJobId` | String? | FK to Job (unique — one session per job, one job per session) |

**Key behavior:** As the user chats with Agent Alex, the `requirements` JSON is progressively refined. When finalized, a Job is created and linked via `linkedJobId`.

---

## API & Usage Tracking

RoboHire has a three-tier usage tracking architecture:

```
ApiKey ← ApiUsageRecord     (legacy per-request usage)
       ← ApiRequestLog      (detailed per-request audit with payload capture)
           ← LLMCallLog[]   (individual LLM invocations within a request)
```

### ApiKey

API keys for programmatic access. Keys use the `rh_` prefix.

| Column | Type | Description |
|--------|------|-------------|
| `userId` | String | FK to User |
| `name` | String | Human-readable key name |
| `key` | String | The full API key (unique, hashed in practice) |
| `prefix` | String | First 8 chars for display (e.g. `rh_xxxx...`) |
| `lastUsedAt` | DateTime? | Last time this key was used |
| `expiresAt` | DateTime? | Expiration date (null = never expires) |
| `scopes` | String[] | Permissions: default `["read", "write"]` |
| `isActive` | Boolean | Whether the key is enabled |

---

### ApiUsageRecord

Legacy per-request usage tracking. Records token consumption and cost per API call.

| Column | Type | Description |
|--------|------|-------------|
| `userId` | String | FK to User |
| `apiKeyId` | String? | FK to ApiKey (null if called via session auth) |
| `requestId` | String? | Correlation ID |
| `endpoint` | String | API endpoint path |
| `method` | String | HTTP method |
| `statusCode` | Int | Response status code |
| `promptTokens` / `completionTokens` / `totalTokens` | Int | LLM token counts |
| `cost` | Float | Estimated cost in dollars |
| `model` | String? | LLM model used |
| `provider` | String? | LLM provider |
| `durationMs` | Int | Request duration in milliseconds |

---

### ApiRequestLog

The **primary usage audit table**. Automatically populated by the `requestAudit` middleware for every `/api/` request. Source of truth for usage analytics.

| Column | Type | Description |
|--------|------|-------------|
| `requestId` | String? | Unique correlation ID for the request |
| `userId` | String? | FK to User |
| `apiKeyId` | String? | FK to ApiKey |
| `endpoint` | String | API endpoint path |
| `method` | String | HTTP method |
| `module` | String | Functional module (e.g. `"resume_parse"`, `"smart_matching"`) |
| `apiName` | String | Human-readable API name |
| `statusCode` | Int | Response status code |
| `durationMs` | Int | Request duration |
| `promptTokens` / `completionTokens` / `totalTokens` | Int | Aggregated token counts across all LLM calls |
| `llmCalls` | Int | Number of LLM invocations in this request |
| `cost` | Float | Total estimated cost |
| `provider` | String? | Primary LLM provider |
| `model` | String? | Primary LLM model |
| `ipAddress` | String? | Client IP |
| `userAgent` | String? | Client user-agent string |
| `requestPayload` | Json? | Request body snapshot |
| `responsePayload` | Json? | Response body snapshot |

**Indexes:** Heavily indexed for analytics queries — by `requestId`, `userId`, `apiKeyId`, `endpoint`, `module`, `apiName`, `provider`, `model`, and composite time-based indexes.

---

### LLMCallLog

Individual LLM invocations. A single API request can trigger multiple LLM calls (e.g., a matching request that calls ResumeMatchAgent + SkillMatchAgent). Each call is logged separately.

| Column | Type | Description |
|--------|------|-------------|
| `requestId` | String? | Correlation ID linking to the parent request |
| `apiRequestLogId` | String? | FK to ApiRequestLog |
| `userId` | String? | FK to User |
| `endpoint` | String | API endpoint that triggered this call |
| `module` | String | Functional module |
| `status` | String | `"success"` or error status |
| `provider` | String | LLM provider (e.g. `"openai"`, `"google"`) |
| `model` | String | Specific model ID |
| `promptTokens` / `completionTokens` / `totalTokens` | Int | Token counts for this specific call |
| `cost` | Float | Cost for this specific call |
| `durationMs` | Int | Call duration |
| `requestMessages` | Json? | Messages sent to the LLM |
| `requestOptions` | Json? | LLM request options (temperature, etc.) |
| `responsePreview` | Text? | Truncated response content for debugging |
| `errorMessage` | Text? | Error details if the call failed |

---

## Billing & Subscriptions

### TopUpRecord

Records pay-as-you-go balance top-ups via Stripe Checkout.

| Column | Type | Description |
|--------|------|-------------|
| `userId` | String | FK to User |
| `stripeSessionId` | String | Stripe Checkout Session ID (unique — idempotency key) |
| `stripePaymentIntent` | String? | Stripe PaymentIntent ID (unique) |
| `amountCents` | Int | Payment amount in cents |
| `amountDollars` | Float | Payment amount in dollars |
| `status` | String | `"pending"` → `"completed"` / `"failed"` |
| `creditedAt` | DateTime? | When the credit was applied to the user's balance |

---

### AdminAdjustment

Audit log for manual admin changes to user accounts (balance adjustments, usage resets, subscription changes).

| Column | Type | Description |
|--------|------|-------------|
| `userId` | String | FK to User — the user being adjusted |
| `adminId` | String | FK to User — the admin making the adjustment |
| `type` | String | `"balance"`, `"usage_interview"`, `"usage_match"`, `"subscription"` |
| `amount` | Float? | Numeric adjustment amount (for balance changes) |
| `oldValue` | String? | Previous value (for audit trail) |
| `newValue` | String? | New value after adjustment |
| `reason` | String | Admin's explanation for the change |

**Note:** Uses two self-referencing relations on User — one for the target user and one for the admin.

---

## ATS Integrations

### ATSIntegration

Configuration for connecting to external Applicant Tracking Systems.

| Column | Type | Description |
|--------|------|-------------|
| `userId` | String | FK to User |
| `provider` | String | `"greenhouse"`, `"lever"`, `"ashby"`, `"bamboohr"`, `"workable"` |
| `credentials` | String | Encrypted JSON containing API keys, subdomains, etc. |
| `isActive` | Boolean | Whether the integration is enabled |
| `syncEnabled` | Boolean | Whether automatic sync is enabled |
| `lastSyncAt` | DateTime? | Last successful sync timestamp |
| `config` | Json? | Provider-specific configuration |

**Unique constraint:** `(userId, provider)` — one integration per provider per user.

---

### ATSSyncLog

Records individual sync operations between RoboHire and an external ATS.

| Column | Type | Description |
|--------|------|-------------|
| `integrationId` | String | FK to ATSIntegration |
| `direction` | String | `"inbound"` (ATS → RoboHire) or `"outbound"` (RoboHire → ATS) |
| `entityType` | String | `"job"`, `"candidate"`, `"application"` |
| `entityId` | String? | RoboHire entity ID |
| `externalId` | String? | ATS entity ID |
| `status` | String | `"success"`, `"failed"`, `"skipped"` |
| `error` | String? | Error message if failed |
| `payload` | Json? | Sync payload for debugging |

---

### WebhookDelivery

Tracks outbound webhook deliveries with retry logic.

| Column | Type | Description |
|--------|------|-------------|
| `integrationId` | String? | FK to ATSIntegration (optional — can also be standalone webhooks) |
| `hiringRequestId` | String? | FK to HiringRequest that triggered this webhook |
| `event` | String | Event type (e.g. `"candidate.matched"`, `"interview.completed"`) |
| `url` | String | Target webhook URL |
| `payload` | Json | The webhook payload |
| `status` | String | `"pending"` → `"delivered"` / `"failed"` |
| `statusCode` | Int? | HTTP response status code |
| `attempts` | Int | Number of delivery attempts |
| `maxAttempts` | Int | Maximum retry attempts (default: 5) |
| `lastAttemptAt` | DateTime? | Last delivery attempt |
| `nextRetryAt` | DateTime? | Scheduled next retry |
| `response` | Text? | Response body from the target |

**Index:** `(status, nextRetryAt)` — optimized for the retry queue query pattern.

---

## Analytics & Configuration

### UserActivity

Tracks user behavior in the frontend for analytics.

| Column | Type | Description |
|--------|------|-------------|
| `userId` | String | FK to User |
| `sessionId` | String | Browser session identifier |
| `eventType` | String | `"page_view"` or `"click"` |
| `path` | String | Page path |
| `element` | String? | Clicked element identifier |
| `elementTag` | String? | HTML tag of clicked element |
| `metadata` | Json? | Additional event data |
| `timestamp` | DateTime | When the event occurred |

---

### AppConfig

Key-value store for application-wide configuration (feature flags, system settings, etc.).

| Column | Type | Description |
|--------|------|-------------|
| `key` | String | Configuration key (unique) |
| `value` | String | Configuration value |
| `updatedBy` | String? | Who last changed this value |

---

## Index Strategy

The schema uses a deliberate indexing strategy optimized for common query patterns:

| Pattern | Example Indexes | Purpose |
|---------|----------------|---------|
| **Owner lookup** | `(userId)` on most models | "Show me my jobs/resumes/interviews" |
| **Owner + filter** | `(userId, status)`, `(userId, createdAt)` | "Show me my active jobs sorted by date" |
| **Time-series analytics** | `(module, createdAt)`, `(apiName, createdAt)` | "Show usage by module over time" |
| **Composite matching** | `(hiringRequestId, fitScore)`, `(jobId, score)` | "Top candidates for this job" |
| **Queue processing** | `(status, nextRetryAt)` on WebhookDelivery | "Find webhooks ready for retry" |
| **Deduplication** | `(userId, contentHash)` on Resume | "Has this user uploaded this resume before?" |
| **Unique access tokens** | `(accessToken)` on Interview | "Find interview by candidate's join link" |

---

## ID & Timestamp Conventions

- **Primary keys**: All models use `@id @default(cuid())` — globally unique, sortable, URL-safe string IDs.
- **`createdAt`**: Present on every model, always `@default(now())`. Never manually set.
- **`updatedAt`**: Present on models that support mutation, always `@updatedAt`. Automatically managed by Prisma.
- **Cascade deletes**: Most child records cascade-delete when the parent is removed (`onDelete: Cascade`). Notable exceptions:
  - `ApiRequestLog.userId` → `onDelete: SetNull` (preserve audit trail even if user is deleted)
  - `LLMCallLog.userId` → `onDelete: SetNull` (same reason)
  - `Resume.recruiterUserId` → `onDelete: SetNull` (resume survives recruiter departure)
  - `Job.hiringRequestId` → `onDelete: SetNull` (job survives request closure)
  - `Interview.hiringRequestId` / `candidateId` → `onDelete: SetNull` (preserve interview history)
