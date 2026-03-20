# GoHire Agent Event System — Technical Specification

## Overview

A SQL-based event bus for inter-agent communication in ClawRecruiter/GoHire. Agents publish domain events to a shared event log; subscriber agents poll or get notified, consume the event payload, and pass it to an LLM for task execution.

**Architecture Pattern:** Transactional Outbox + Subscription Registry + Delivery Tracking

---

## Design Principles

1. **Events are immutable facts** — once published, never mutated. Status lives on the *delivery* record, not the event.
2. **At-least-once delivery** — every subscriber gets every matching event. Idempotency is the subscriber's responsibility.
3. **Structured payloads** — use JSONB `payload` instead of flat `message_text`. The payload carries structured context that gets injected into LLM prompts.
4. **Decoupled pub/sub** — publishers don't know who subscribes. Subscribers don't know who published. The event table is the contract.

---

## Database Schema

### 1. `event_types` — Registry of valid event types

```sql
CREATE TABLE event_types (
  event_type    VARCHAR(64) PRIMARY KEY,          -- e.g. 'AGENT_CREATED'
  description   TEXT NOT NULL,
  payload_schema JSONB,                            -- optional JSON Schema for validation
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed data
INSERT INTO event_types (event_type, description) VALUES
  ('AGENT_CREATED',   'Fired when a new agent is registered in the system'),
  ('AGENT_MODIFIED',  'Fired when an agent config/profile is updated'),
  ('AGENT_RESPONSE',  'Fired when an agent completes a task and publishes its output'),
  ('RESUME_UPLOADED', 'Fired when a resume is uploaded/assigned to an agent'),
  ('TASK_ASSIGNED',   'Fired when a task is routed to a specific agent');
```

### 2. `agent_events` — The immutable event log (outbox)

```sql
CREATE TABLE agent_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      VARCHAR(64) NOT NULL REFERENCES event_types(event_type),
  source_agent_id UUID NOT NULL,                   -- the agent that PUBLISHED this event
  payload         JSONB NOT NULL,                   -- structured data (see Payload Contracts below)
  message_text    TEXT,                              -- human-readable summary for logging/debugging
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for polling queries
CREATE INDEX idx_agent_events_type_created ON agent_events (event_type, created_at DESC);
CREATE INDEX idx_agent_events_source       ON agent_events (source_agent_id);
```

> **Note:** No `status` column here. Events are facts — they don't have status. Delivery status lives in `event_deliveries`.

### 3. `event_subscriptions` — Who listens to what

```sql
CREATE TABLE event_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_agent_id UUID NOT NULL,               -- the agent subscribing
  event_type      VARCHAR(64) NOT NULL REFERENCES event_types(event_type),
  filter_criteria JSONB,                            -- optional: JSON filter on payload fields
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (subscriber_agent_id, event_type)          -- one subscription per agent per event type
);

CREATE INDEX idx_event_subs_type ON event_subscriptions (event_type) WHERE is_active = TRUE;
```

### 4. `event_deliveries` — Per-subscriber delivery tracking

```sql
CREATE TYPE delivery_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED');

CREATE TABLE event_deliveries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES agent_events(id),
  subscription_id     UUID NOT NULL REFERENCES event_subscriptions(id),
  subscriber_agent_id UUID NOT NULL,
  status              delivery_status NOT NULL DEFAULT 'PENDING',
  attempts            INT NOT NULL DEFAULT 0,
  max_attempts        INT NOT NULL DEFAULT 3,
  picked_up_at        TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  error_message       TEXT,
  llm_prompt_snapshot TEXT,                         -- the actual prompt sent to LLM (for debugging)
  llm_response        JSONB,                        -- the LLM output (for audit trail)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (event_id, subscription_id)                -- prevent duplicate deliveries
);

CREATE INDEX idx_deliveries_pending ON event_deliveries (subscriber_agent_id, status)
  WHERE status = 'PENDING';
CREATE INDEX idx_deliveries_event   ON event_deliveries (event_id);
```

### 5. `agent_uploaded_resumes` — Resume routing between agents

```sql
CREATE TABLE agent_uploaded_resumes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent_id   UUID NOT NULL,                    -- agent that uploaded/routed the resume
  to_agent_id     UUID NOT NULL,                    -- target agent that should process it
  resume_id       UUID NOT NULL,                    -- FK to ResumeVault
  event_id        UUID REFERENCES agent_events(id), -- the RESUME_UPLOADED event that triggered this
  message_text    TEXT,                              -- instructions for the receiving agent
  metadata        JSONB,                             -- job_id, match_score, tags, etc.
  upload_date     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMPTZ                        -- NULL until receiving agent processes it
);

CREATE INDEX idx_resumes_to_agent ON agent_uploaded_resumes (to_agent_id, processed_at)
  WHERE processed_at IS NULL;
```

---

## Payload Contracts (JSONB structure per event type)

```typescript
// AGENT_CREATED
interface AgentCreatedPayload {
  agent_id: string;
  agent_name: string;
  agent_type: string;         // e.g. 'RECRUITER', 'SCREENER', 'COORDINATOR'
  capabilities: string[];     // e.g. ['resume_parsing', 'interview_scheduling']
  config: Record<string, unknown>;
}

// AGENT_MODIFIED
interface AgentModifiedPayload {
  agent_id: string;
  agent_name: string;
  changed_fields: string[];   // which fields changed
  previous_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
}

// AGENT_RESPONSE
interface AgentResponsePayload {
  responding_agent_id: string;
  task_id: string;
  task_type: string;
  result: Record<string, unknown>;
  confidence_score?: number;
  next_action?: string;        // suggested next step for downstream agents
}

// RESUME_UPLOADED
interface ResumeUploadedPayload {
  resume_id: string;
  candidate_name: string;
  from_agent_id: string;
  to_agent_id: string;
  job_id?: string;
  instructions: string;        // what the receiving agent should do
}

// TASK_ASSIGNED
interface TaskAssignedPayload {
  task_id: string;
  task_type: string;
  assigned_to_agent_id: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  instructions: string;
  context: Record<string, unknown>;
  deadline?: string;           // ISO 8601
}
```

---

## Core Operations (TypeScript / Fastify service layer)

### Publishing an Event

```typescript
// services/event-bus.ts
async function publishEvent(
  db: DatabaseClient,
  eventType: string,
  sourceAgentId: string,
  payload: Record<string, unknown>,
  messageText?: string
): Promise<string> {
  // 1. Insert the event
  const [event] = await db.query(`
    INSERT INTO agent_events (event_type, source_agent_id, payload, message_text)
    VALUES ($1, $2, $3, $4)
    RETURNING id
  `, [eventType, sourceAgentId, JSON.stringify(payload), messageText]);

  // 2. Fan out: create delivery records for all active subscribers
  await db.query(`
    INSERT INTO event_deliveries (event_id, subscription_id, subscriber_agent_id)
    SELECT $1, es.id, es.subscriber_agent_id
    FROM event_subscriptions es
    WHERE es.event_type = $2
      AND es.is_active = TRUE
      AND es.subscriber_agent_id != $3   -- don't deliver to self
      AND (es.filter_criteria IS NULL
           OR $4::jsonb @> es.filter_criteria)
  `, [event.id, eventType, sourceAgentId, JSON.stringify(payload)]);

  return event.id;
}
```

### Consuming Events (Polling pattern for Inngest/Trigger.dev)

```typescript
// services/event-consumer.ts
async function claimNextEvent(
  db: DatabaseClient,
  agentId: string
): Promise<EventDelivery | null> {
  // Atomic claim with SELECT ... FOR UPDATE SKIP LOCKED
  const [delivery] = await db.query(`
    UPDATE event_deliveries
    SET status = 'PROCESSING',
        picked_up_at = NOW(),
        attempts = attempts + 1,
        updated_at = NOW()
    WHERE id = (
      SELECT ed.id
      FROM event_deliveries ed
      WHERE ed.subscriber_agent_id = $1
        AND ed.status = 'PENDING'
        AND ed.attempts < ed.max_attempts
      ORDER BY ed.created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `, [agentId]);

  if (!delivery) return null;

  // Fetch the full event
  const [event] = await db.query(`
    SELECT * FROM agent_events WHERE id = $1
  `, [delivery.event_id]);

  return { delivery, event };
}
```

### Processing: Event → LLM Prompt

```typescript
// services/event-processor.ts
async function processEventDelivery(
  delivery: EventDelivery,
  event: AgentEvent,
  agentConfig: AgentConfig
): Promise<void> {
  // Build LLM prompt from event payload
  const systemPrompt = agentConfig.system_prompt;
  const userPrompt = buildPromptFromEvent(event);

  // Call LLM
  const llmResponse = await callLLM(systemPrompt, userPrompt);

  // Mark delivery complete, store audit trail
  await db.query(`
    UPDATE event_deliveries
    SET status = 'COMPLETED',
        completed_at = NOW(),
        llm_prompt_snapshot = $1,
        llm_response = $2,
        updated_at = NOW()
    WHERE id = $3
  `, [userPrompt, JSON.stringify(llmResponse), delivery.id]);

  // If the agent produced output, publish an AGENT_RESPONSE event
  if (llmResponse.result) {
    await publishEvent(db, 'AGENT_RESPONSE', agentConfig.agent_id, {
      responding_agent_id: agentConfig.agent_id,
      task_id: event.payload.task_id,
      task_type: event.event_type,
      result: llmResponse.result,
    });
  }
}

function buildPromptFromEvent(event: AgentEvent): string {
  const p = event.payload;

  switch (event.event_type) {
    case 'AGENT_CREATED':
      return `A new agent has been registered in the system.\n` +
        `Agent: ${p.agent_name} (${p.agent_type})\n` +
        `Capabilities: ${p.capabilities.join(', ')}\n` +
        `Please acknowledge and update your coordination map.`;

    case 'AGENT_MODIFIED':
      return `Agent "${p.agent_name}" has been modified.\n` +
        `Changed: ${p.changed_fields.join(', ')}\n` +
        `Details: ${JSON.stringify(p.new_values)}\n` +
        `Please update your internal state accordingly.`;

    case 'AGENT_RESPONSE':
      return `Agent response received for task ${p.task_id}.\n` +
        `Result: ${JSON.stringify(p.result)}\n` +
        `Suggested next action: ${p.next_action || 'none'}\n` +
        `Process this result and take appropriate action.`;

    case 'RESUME_UPLOADED':
      return `Resume ${p.resume_id} for candidate "${p.candidate_name}" ` +
        `has been assigned to you.\n` +
        `Instructions: ${p.instructions}\n` +
        `Job context: ${p.job_id || 'general pool'}`;

    case 'TASK_ASSIGNED':
      return `New task assigned: ${p.task_type}\n` +
        `Priority: ${p.priority}\n` +
        `Instructions: ${p.instructions}\n` +
        `Deadline: ${p.deadline || 'none'}\n` +
        `Context: ${JSON.stringify(p.context)}`;

    default:
      return `Event received: ${event.event_type}\n` +
        `Payload: ${JSON.stringify(p)}\n` +
        `Process accordingly.`;
  }
}
```

---

## Orchestration (Inngest / Trigger.dev)

```typescript
// inngest/functions/process-agent-events.ts
import { inngest } from '../client';

// Cron job: poll for pending deliveries every 5 seconds
export const processAgentEvents = inngest.createFunction(
  { id: 'process-agent-events' },
  { cron: '*/5 * * * * *' },    // or use event-driven trigger
  async ({ step }) => {
    // Get all agents with pending deliveries
    const agents = await step.run('get-active-agents', async () => {
      return db.query(`
        SELECT DISTINCT subscriber_agent_id
        FROM event_deliveries
        WHERE status = 'PENDING'
        LIMIT 10
      `);
    });

    // Process one event per agent in parallel
    for (const agent of agents) {
      await step.run(`process-${agent.subscriber_agent_id}`, async () => {
        const claimed = await claimNextEvent(db, agent.subscriber_agent_id);
        if (claimed) {
          const config = await getAgentConfig(claimed.delivery.subscriber_agent_id);
          await processEventDelivery(claimed.delivery, claimed.event, config);
        }
      });
    }
  }
);
```

---

## Example Flow: Agent Created → Coordinator Notified

```
1. POST /api/agents  (create "ResumeScreener" agent)
      │
2. ───► INSERT INTO agent_events (AGENT_CREATED, payload={...})
      │
3. ───► Fan-out: INSERT INTO event_deliveries
        for each subscriber of AGENT_CREATED
      │
4. Inngest cron picks up PENDING delivery for "CoordinatorAgent"
      │
5. ───► claimNextEvent() → status = 'PROCESSING'
      │
6. ───► buildPromptFromEvent() → LLM prompt:
        "A new agent has been registered...
         Agent: ResumeScreener (SCREENER)
         Capabilities: resume_parsing, skill_extraction
         Please acknowledge and update your coordination map."
      │
7. ───► LLM processes → returns coordination update
      │
8. ───► publishEvent('AGENT_RESPONSE', coordinatorId, result)
      │
9. ───► ResumeScreener (subscribed to AGENT_RESPONSE)
        picks up the coordinator's response
```

---

## Key Design Decisions & Rationale

| Decision | Why |
|---|---|
| **JSONB `payload` instead of `message_text` only** | Structured data enables filtering, indexing on payload fields, and clean LLM prompt construction. `message_text` is kept as a human-readable summary for logs. |
| **Separate `event_deliveries` from `agent_events`** | Events are facts (write-once). Delivery is state (PENDING→PROCESSING→COMPLETED). Mixing them creates update contention and makes event replay impossible. |
| **`SELECT FOR UPDATE SKIP LOCKED`** | Prevents double-processing when multiple Inngest workers poll concurrently. |
| **`filter_criteria` on subscriptions** | Allows an agent to subscribe to AGENT_RESPONSE but only for `task_type = 'RESUME_SCREENING'`. Avoids noisy over-delivery. |
| **`llm_prompt_snapshot` + `llm_response` on delivery** | Full audit trail for debugging agent behavior. You can replay any event through any agent and compare outputs. |
| **`event_id` FK on `agent_uploaded_resumes`** | Links the resume routing back to the event that triggered it, enabling full lineage tracking from upload → event → delivery → LLM response. |

---

## Migration Checklist for Claude Code

- [ ] Create all tables in a single Drizzle/Knex migration file
- [ ] Seed `event_types` with the 5 initial types
- [ ] Add `publishEvent()` to the shared service layer
- [ ] Add `claimNextEvent()` + `processEventDelivery()` to the consumer service
- [ ] Wire `publishEvent('AGENT_CREATED', ...)` into the existing agent creation endpoint
- [ ] Wire `publishEvent('AGENT_MODIFIED', ...)` into the agent update endpoint
- [ ] Create Inngest function for polling deliveries
- [ ] Add Zod schemas matching the TypeScript payload interfaces
- [ ] Add integration tests: publish event → verify delivery created → claim → process → verify COMPLETED