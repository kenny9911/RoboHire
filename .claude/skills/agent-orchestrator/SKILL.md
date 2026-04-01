# Agent Orchestrator Skill

This skill teaches how to extend Agent Alex's multi-agent orchestration system in RoboHire.

## Architecture Overview

Agent Alex (Gemini) acts as an **orchestrator** that understands user intent and dispatches specialized agents. The system uses:

1. **Gemini Function Calling** — Alex calls backend functions when it detects intent
2. **NDJSON Streaming** — Events flow from backend to frontend in real-time
3. **Parallel Agent Runners** — Concurrency-controlled Promise pools for LLM-intensive tasks
4. **BaseAgent Pattern** — All agents extend `BaseAgent<TInput, TOutput>` with `getAgentPrompt()`, `formatInput()`, `parseOutput()`

## How to Add a New Agent Capability

### Step 1: Define the Gemini Function Declaration

In `backend/src/services/GeminiAgentService.ts`:

```typescript
import { Type } from "@google/genai";

export const myNewCapabilityDeclaration: FunctionDeclaration = {
  name: "my_new_capability",
  description: `When the user expresses intent to [describe triggers clearly].
    Call this function with the relevant parameters.
    [Describe what Alex should ask/confirm before calling.]`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      param1: { type: Type.STRING, description: "..." },
      param2: { type: Type.ARRAY, items: { type: Type.STRING }, description: "..." },
    },
    required: ["param1"],
  },
};
```

**Critical**: The `description` field IS the prompt. Write it as behavioral instructions, not just what the function does.

### Step 2: Register in Tools Array

In `streamChatResponse()` config:

```typescript
tools: [{
  functionDeclarations: [
    updateRequirementsDeclaration,
    suggestNextStepsDeclaration,
    startCandidateSearchDeclaration,
    myNewCapabilityDeclaration,  // ← Add here
  ]
}]
```

Also register in the WebSocket handler in `backend/src/index.ts` for live voice mode.

### Step 3: Add Event Types

In `backend/src/types/agentAlex.ts` AND `frontend/src/components/agent-alex/types.ts`:

```typescript
export type ChatStreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "requirements-update"; data: Partial<HiringRequirements> }
  | { type: "suggestions"; data: string[] }
  | { type: "my-capability-started"; data: { taskId: string; ... } }  // ← New
  | { type: "my-capability-progress"; data: { completed: number; total: number } }
  | { type: "my-capability-result"; data: { ... } }
  | { type: "my-capability-completed"; data: { summary: ... } }
  | { type: "done" }
  | { type: "error"; code: string; message: string };
```

### Step 4: Handle the Function Call

In `streamChatResponse()`, inside the function call loop:

```typescript
} else if (call.name === "my_new_capability" && call.args) {
  const params = call.args as MyParams;

  // Trigger the backend service (async, don't await in stream)
  // Instead, start the work and stream events via onEvent
  const taskId = generateId();
  onEvent({ type: "my-capability-started", data: { taskId, ... } });

  // Run the service (this is where parallel agents execute)
  const results = await myService.execute(params, (progress) => {
    onEvent({ type: "my-capability-progress", data: progress });
  });

  onEvent({ type: "my-capability-completed", data: { taskId, summary: results } });

  // Return result to Gemini so it can comment on it
  functionResponses.push({
    functionResponse: {
      id: call.id,
      name: call.name,
      response: {
        result: "success",
        summary: `Found ${results.length} matches. Top: ${results[0]?.name} (${results[0]?.score})`,
      },
    },
  });
}
```

**Key insight**: The `functionResponse.response` object is fed back to Gemini. Include a summary so Alex can comment naturally on the results.

### Step 5: Create the Backend Service

Follow the pattern in `backend/src/services/InstantSearchMatchService.ts`:

```typescript
export class MyService {
  async execute(
    params: MyParams,
    onProgress: (event: ProgressEvent) => void,
  ): Promise<MyResult[]> {
    // 1. Pre-filter / prepare data (no LLM cost)
    // 2. Run parallel agents (concurrency-controlled)
    // 3. Aggregate results
    // 4. Create database records
    // 5. Return sorted results
  }
}
```

### Step 6: Render in Frontend

In `frontend/src/components/agent-alex/ChatInterface.tsx`, add event handlers:

```typescript
if (event.type === "my-capability-started") {
  // Add a status message to chat
}
if (event.type === "my-capability-progress") {
  // Update progress indicator
}
if (event.type === "my-capability-result") {
  // Add result card to chat
}
```

## Parallel Agent Runner Pattern

For CPU/LLM-intensive tasks, use controlled concurrency:

```typescript
async function runInParallel<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number,
  onItemComplete?: (result: R, index: number) => void,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(processor));
    for (let j = 0; j < batchResults.length; j++) {
      const r = batchResults[j];
      const result = r.status === 'fulfilled' ? r.value : null;
      if (result) {
        results.push(result);
        onItemComplete?.(result, i + j);
      }
    }
  }
  return results;
}
```

**Configuration via env vars**:
- `MATCH_CONCURRENCY` — parallel LLM calls (default: 5)
- `MATCH_THRESHOLD` — minimum score to include (default: 50)
- `MATCH_SCREEN_BATCH_SIZE` — pre-filter batch size (default: 10)

## Prompt Layering

System prompts are built in layers:

```
Layer 1: SYSTEM_INSTRUCTION (static persona + methodology)
Layer 2: Capability instructions (appended per-feature)
Layer 3: Context (current session state, Live Spec snapshot)
Layer 4: Locale (language preference)
```

Each layer is a string concatenated to the system prompt before the LLM call. Add capability instructions in the SYSTEM_INSTRUCTION constant when the capability is always available, or conditionally in `streamChatResponse()` when feature-flagged.

## Logging & Cost Tracking

Every agent execution must log via `LoggerService`:

```typescript
import { logger } from '../services/LoggerService.js';

// After each LLM call
logger.logLLMCall({
  requestId,
  model: 'gemini-3.1-pro-preview',
  provider: 'google-gemini',
  promptTokens,
  completionTokens,
  duration: durationMs,
  status: 'success',
});
```

This ensures all agent costs appear in usage dashboards and billing.

## Testing a New Capability

1. Build both workspaces: `npm run build`
2. Start dev: `npm run dev`
3. Go to `/agent-alex`
4. Type a trigger phrase for your capability
5. Verify Alex calls the function (check backend logs)
6. Verify events stream to frontend (check browser Network tab for NDJSON)
7. Verify database records are created
8. Verify results appear in chat UI

## File Reference

| File | Purpose |
|---|---|
| `backend/src/services/GeminiAgentService.ts` | Function declarations + system prompt + stream handler |
| `backend/src/types/agentAlex.ts` | Backend event types |
| `frontend/src/components/agent-alex/types.ts` | Frontend event types (must mirror backend) |
| `backend/src/routes/agentAlex.ts` | HTTP route for chat streaming |
| `backend/src/index.ts` | WebSocket handler for live voice |
| `frontend/src/components/agent-alex/ChatInterface.tsx` | Event rendering in chat UI |
| `backend/src/agents/BaseAgent.ts` | Base class for all agents |
| `backend/src/services/MatchOrchestratorService.ts` | Existing matching orchestration pattern |
| `docs/prd-agent-alex-orchestrator.md` | Product requirements and architecture |
