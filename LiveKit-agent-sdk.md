# LiveKit Agent SDK Documentation

This document describes the current LiveKit voice interview agent implementation in this repository. It is not a generic LiveKit manual. It documents the code paths, defaults, configuration surface, telemetry, and tuning workflow that RoboHire currently uses.

## Scope

This documentation covers:

- the LiveKit worker entrypoint
- the interview room lifecycle
- the voice agent runtime in `backend/src/agents/interview-agent.ts`
- configurable STT, LLM, TTS, and turn-taking settings
- the telemetry saved for admin review
- how to tune the experience for multilingual interviews

It does not attempt to document every upstream LiveKit SDK API.

## Main Files

- `backend/src/interview-worker.ts`
- `backend/src/agents/interview-agent.ts`
- `backend/src/services/LiveKitService.ts`
- `backend/src/routes/interviews.ts`
- `backend/src/routes/admin.ts`
- `frontend/src/pages/AdminDashboard.tsx`
- `frontend/src/pages/AdminLogsTab.tsx`

## Package Dependencies

The current backend integration uses these packages:

- `@livekit/agents`
- `@livekit/agents-plugin-google`
- `@livekit/agents-plugin-livekit`
- `@livekit/agents-plugin-openai`
- `@livekit/agents-plugin-silero`
- `@livekit/rtc-node`
- `livekit-server-sdk`

## High-Level Architecture

The system has two separate runtime layers:

1. Express backend
2. LiveKit agent worker

The backend is responsible for:

- creating LiveKit rooms
- dispatching the configured agent
- generating participant tokens
- starting and stopping recording
- building room metadata for the worker
- receiving transcript and usage payloads from the worker
- storing usage, logs, and evaluation inputs

The worker is responsible for:

- connecting to LiveKit
- waiting for the candidate to join
- constructing the `voice.AgentSession`
- running STT, LLM, and TTS
- managing turn-taking
- collecting transcript and runtime telemetry
- posting the final transcript and usage payload back to the backend

## Runtime Lifecycle

### 1. Worker startup

The worker entrypoint is `backend/src/interview-worker.ts`.

It:

- loads env from the project root `.env`
- then loads `backend/.env`
- normalizes `LOG_LEVEL` to lowercase
- starts the LiveKit Agents CLI app with:
  - `agentName: 'RoboHire-1'`
  - `wsURL: process.env.LIVEKIT_URL`
  - `apiKey: process.env.LIVEKIT_API_KEY`
  - `apiSecret: process.env.LIVEKIT_API_SECRET`

Run it with:

```bash
npm run agent:start --workspace=backend
```

### 2. Interview room creation

The backend creates a room through `LiveKitService.createRoom(...)`.

It:

- creates room `interview-${interviewId}`
- serializes metadata into `room.metadata`
- optionally dispatches the configured LiveKit agent name
- sets `emptyTimeout: 300`

### 3. Candidate join

Relevant endpoints:

- `GET /api/v1/interviews/join/:accessToken`
- `POST /api/v1/interviews/:id/start`
- `POST /api/v1/interviews/:id/end`
- `POST /api/v1/interviews/finalize/:accessToken`
- `POST /api/v1/interviews/:id/transcript`

The normal public candidate flow is:

1. candidate opens join link
2. backend auto-starts the interview if still scheduled
3. backend creates the room and dispatches the agent
4. backend starts recording if available
5. backend returns LiveKit participant token and websocket URL

### 4. Worker session boot

When the job starts, `runInterview(...)` in `interview-agent.ts`:

1. connects to the room
2. waits for a participant
3. parses room metadata
4. resolves runtime configuration
5. normalizes STT and TTS language codes
6. constructs STT, LLM, and TTS engines
7. starts a `voice.AgentSession`

### 5. Shutdown and persistence

On worker shutdown:

- transcript is finalized
- usage payload is assembled
- usage is posted to `POST /api/v1/interviews/:id/transcript`
- backend stores the normalized session usage in interview metadata
- backend creates an admin-visible `apiRequestLog`
- backend stores per-call `lLMCallLog` rows when LLM metrics exist

## Environment Variables

At minimum, the LiveKit interview stack expects:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `BACKEND_URL`

Provider-specific keys depend on the selected runtime configuration:

- `GOOGLE_API_KEY` for Google Gemini
- `OPENAI_API_KEY` for OpenAI STT, LLM, or TTS

The worker loads both root `.env` and `backend/.env`. If the same variable exists in both, the later `dotenv.config(...)` call can override the earlier value depending on how it is already loaded in the process.

## Current Provider Support

The current code supports these provider choices.

### STT

- `livekit-inference`
- `openai`

Defaults:

- provider: `livekit-inference`
- model: `elevenlabs/scribe_v2_realtime`

Behavior:

- `livekit-inference` uses `new inference.STT(...)`
- `openai` uses `new openai.STT(...)`

### LLM

- `google`
- `openai`

Defaults:

- provider: `openai`
- model: `openai/gpt-5.4`

Behavior:

- `google` uses `new google.LLM(...)`
- `openai` uses `new openai.LLM(...)`

### TTS

- `livekit-inference`
- `openai`

Defaults:

- provider: `livekit-inference`
- model: `cartesia/sonic-3`
- voice: `e90c6678-f0d3-4767-9883-5d0ecf5894a8`

Behavior:

- `livekit-inference` uses `new inference.TTS(...)`
- `openai` uses `new openai.TTS(...)`

## Default Runtime Settings

Current defaults in `interview-agent.ts`:

- STT provider: `livekit-inference`
- STT model: `elevenlabs/scribe_v2_realtime`
- LLM provider: `openai`
- LLM model: `openai/gpt-5.4`
- TTS provider: `livekit-inference`
- TTS model: `cartesia/sonic-3`
- TTS voice: `e90c6678-f0d3-4767-9883-5d0ecf5894a8`
- turn detection: `multilingual_eou`
- allow interruptions: `true`
- discard audio if uninterruptible: `true`
- preemptive generation: `false`
- min interruption duration: `900`
- min interruption words: `2`
- min endpointing delay: `900`
- max endpointing delay: `6000`
- AEC warmup duration: `3000`
- use TTS aligned transcript: `true`
- log interim transcripts: `false`

## Interview Metadata Contract

The backend writes a metadata object into each room. The worker reads it from `ctx.room.metadata`.

Fields currently used by the worker:

- `interviewId`
- `language`
- `jobTitle`
- `jobDescription`
- `resumeText`
- `candidateName`
- `companyName`
- `instructions`
- `agentConfig`

Example:

```json
{
  "interviewId": "iv_123",
  "language": "zh-CN",
  "jobTitle": "Backend Engineer",
  "jobDescription": "...",
  "resumeText": "...",
  "candidateName": "Alice",
  "companyName": "RoboHire",
  "instructions": "Custom system prompt",
  "agentConfig": {
    "llmProvider": "openai",
    "llmModel": "openai/gpt-5.4",
    "sttProvider": "livekit-inference",
    "sttModel": "elevenlabs/scribe_v2_realtime",
    "ttsProvider": "livekit-inference",
    "ttsModel": "cartesia/sonic-3",
    "ttsVoice": "e90c6678-f0d3-4767-9883-5d0ecf5894a8",
    "turnDetection": "multilingual_eou",
    "allowInterruptions": true,
    "preemptiveGeneration": false,
    "minInterruptionDurationMs": 900,
    "minInterruptionWords": 2,
    "minEndpointingDelayMs": 900,
    "maxEndpointingDelayMs": 6000,
    "aecWarmupDurationMs": 3000,
    "useTtsAlignedTranscript": true,
    "logInterimTranscripts": false
  }
}
```

## Configuration Sources

There are two effective configuration layers.

### 1. Admin app config

Admin configuration is stored in `appConfig` and exposed through:

- `GET /api/v1/admin/interview-config`
- `PUT /api/v1/admin/interview-config`

Allowed keys:

- `interview.instructions`
- `interview.agentName`
- `interview.sttProvider`
- `interview.sttModel`
- `interview.llmProvider`
- `interview.llmModel`
- `interview.ttsProvider`
- `interview.ttsModel`
- `interview.ttsVoice`
- `interview.language`
- `interview.turnDetection`
- `interview.allowInterruptions`
- `interview.discardAudioIfUninterruptible`
- `interview.preemptiveGeneration`
- `interview.minInterruptionDurationMs`
- `interview.minInterruptionWords`
- `interview.minEndpointingDelayMs`
- `interview.maxEndpointingDelayMs`
- `interview.aecWarmupDurationMs`
- `interview.useTtsAlignedTranscript`
- `interview.logInterimTranscripts`

### 2. Room metadata

`buildRoomMetadata(...)` converts the saved admin config into `metadata.agentConfig`.

This is what actually makes the worker tunable without editing code.

## Admin UI Surface

The admin UI exposes these sections:

- Interview Instructions
- Agent Name
- STT provider/model/language
- LLM provider/model
- TTS provider/model/voice
- Turn Taking And Telemetry

The turn-taking panel allows editing:

- turn detection mode
- allow interruptions
- discard audio if uninterruptible
- preemptive generation
- interruption thresholds
- endpointing thresholds
- AEC warmup
- TTS-aligned transcript toggle
- interim transcript logging toggle

## Turn Detection Modes

Supported values:

- `multilingual_eou`
- `stt`
- `vad`
- `manual`
- `realtime_llm`

Current behavior:

- `multilingual_eou` maps to `new livekit.turnDetector.MultilingualModel()`
- other modes pass the string directly to `AgentSession.turnDetection`

### Practical guidance

- `multilingual_eou` is the best default for multilingual interviews
- `stt` is simpler but tends to commit short fillers more aggressively
- `vad` can be useful when transcript timing is unreliable
- `manual` is only for advanced/custom orchestration
- `realtime_llm` is included in the SDK surface, but only makes sense with compatible realtime models

## Prompt Construction

The interviewer prompt comes from one of two sources.

### Admin-supplied prompt

If `interview.instructions` exists, the backend writes it directly into room metadata.

### Generated prompt

If no admin prompt exists, the backend calls `InterviewPromptAgent` to generate a system prompt from:

- job title
- job description
- resume text
- qualifications
- hard requirements
- interview requirements
- evaluation rules
- company name
- interview language
- interview duration
- passing score

### Greeting

The agent separately issues a greeting through:

```ts
this.session.generateReply({
  instructions: 'Greet the user and explain the job briefly.',
  allowInterruptions: this.allowGreetingInterruptions,
});
```

The greeting uses the resolved interruption policy.

## Language Handling

The worker normalizes language differently for STT and TTS.

### STT normalization

Mapped to:

- `zh`
- `en`
- `ja`
- `es`
- `fr`
- `pt`
- `de`
- `ko`
- fallback: `multi`

### TTS normalization

Mapped to:

- `zh`
- `en`
- `ja`
- `es`
- `fr`
- `pt`
- `de`
- `ko`
- fallback: original language string

### Why this matters

Speech providers often have different language code expectations. The code intentionally separates STT and TTS normalization so multilingual sessions can use more compatible provider-specific values.

## Session Event Collection

The worker attaches handlers for these `AgentSession` events:

- `UserInputTranscribed`
- `ConversationItemAdded`
- `AgentStateChanged`
- `UserStateChanged`
- `SpeechCreated`
- `MetricsCollected`
- `Error`
- `Close`

These handlers drive:

- transcript collection
- session diagnostics
- per-metric usage aggregation
- admin-visible trace data

## Transcript Behavior

Transcript records are stored as:

- `candidate`
- `interviewer`

Rules:

- only final user transcripts are added to the saved transcript array
- assistant text messages from `ConversationItemAdded` are added as interviewer turns
- interim transcripts are optional and only retained in the trace when `logInterimTranscripts` is enabled

## Runtime Telemetry

The worker collects several classes of telemetry.

### Session configuration

- room name
- runtime language
- STT/TTS language
- turn detection mode
- interruption settings
- endpointing settings
- AEC warmup
- aligned transcript toggle
- provider/model/voice identifiers

### Operational

- participant identity
- participant track count
- participant track snapshot
- session start and end time
- total duration
- candidate turn count
- interviewer turn count
- close reason
- agent state transitions
- user state transitions
- session errors

### Metrics

- `llmMetrics`
- `sttMetrics`
- `ttsMetrics`
- `vadMetrics`
- `eouMetrics`

### Diagnostics

- observed languages
- final transcript event count
- interim transcript event count
- empty final transcript count
- short final transcript count
- interrupted assistant message count
- speeches created
- audio track publication count
- video track publication count
- trace truncation counters

### Trace

- user transcription trace
- assistant message trace
- speech creation trace
- participant track trace
- truncation metadata

## Trace Limits

High-volume arrays are capped to avoid runaway payload growth.

Current caps:

- `llmMetrics`: 200
- `sttMetrics`: 200
- `ttsMetrics`: 300
- `vadMetrics`: 400
- `eouMetrics`: 200
- `stateTransitions`: 200
- `userStateTransitions`: 200
- `userTranscriptions`: 300
- `assistantMessages`: 200
- `speechEvents`: 200

If an array exceeds its limit:

- additional records are not appended
- `traceTruncation` is incremented for that key

This is important when enabling interim transcript logging in long interviews.

## Persisted Usage Flow

At shutdown, the worker posts:

```json
{
  "transcript": [...],
  "apiKey": "LIVEKIT_API_KEY",
  "usage": { ... }
}
```

The backend then:

1. validates `apiKey`
2. normalizes the usage payload
3. estimates LLM cost from token counts
4. stores `livekitUsage` in interview metadata
5. writes a structured `apiRequestLog`
6. writes `lLMCallLog` records when LLM metrics exist

## Cost Accounting

Currently:

- LLM cost is estimated from token usage via `logger.calculateCost(...)`
- STT cost is not estimated by app logic
- TTS cost is not estimated by app logic

The saved `costs` object explicitly notes that total cost is currently LLM-driven unless STT/TTS pricing is added in the future.

## Admin Visibility

Admins can inspect LiveKit interview runtime data through the existing logs UI.

Saved records include:

- the raw enriched usage object in `apiRequestLog.requestPayload`
- a summary object in `apiRequestLog.responsePayload`
- normalized `livekitUsage` in interview metadata
- per-call LLM rows in `lLMCallLog`

This makes it possible to inspect:

- model selection
- turn-taking thresholds
- transcript timing
- speech interruptions
- VAD and EOU timing
- token usage
- estimated cost

## Programmatic Tuning

The system is tunable in two ways.

### 1. Via admin config

Recommended for most operators.

Update through the admin UI or the `PUT /api/v1/admin/interview-config` endpoint.

### 2. Via room metadata

Useful if you want per-interview overrides.

You can pass an `agentConfig` object when creating the room metadata. The worker will honor it at runtime.

This is the key mechanism for:

- per-language tuning
- per-customer voice selection
- per-role endpointing strategy
- A/B tests for interruption thresholds

## Recommended Tuning Playbook

### If the agent cuts the candidate off too early

- increase `minEndpointingDelayMs`
- increase `minInterruptionDurationMs`
- increase `minInterruptionWords`
- keep `preemptiveGeneration` disabled
- prefer `multilingual_eou` over `stt`

### If the agent feels too slow to respond

- reduce `minEndpointingDelayMs`
- review `eouMetrics.transcriptionDelayMs`
- review `llmMetrics.ttftMs`
- review `ttsMetrics.durationMs`
- check if the selected LLM is too slow for live interviewing

### If short fillers like “um” or “嗯” trigger replies

- raise `minInterruptionWords`
- raise `minEndpointingDelayMs`
- monitor `shortFinalTranscripts`
- inspect `observedLanguages` and `userTranscriptions`

### If multilingual recognition is unstable

- keep `turnDetection` on `multilingual_eou`
- inspect `observedLanguages`
- inspect final vs interim transcript behavior
- verify `language`, `sttLanguage`, and `ttsLanguage`
- compare STT provider/model choices for the target language

### If playback interruption feels wrong

- inspect `speechEvents`
- inspect `interruptedAssistantMessages`
- change `allowInterruptions`
- change `discardAudioIfUninterruptible`
- review AEC warmup behavior

### If logs are too noisy

- keep `logInterimTranscripts` off
- rely on final transcript events plus metrics
- inspect `traceTruncation` to confirm caps are being hit

## Known Limitations

- provider support is intentionally narrower than the old UI implied
- STT/TTS pricing is not yet estimated in app logic
- OpenAI STT/TTS behavior differs from LiveKit inference behavior
- `realtime_llm` is not the default path and is not the primary tested interview mode here
- telemetry is rich, but audio waveform level diagnostics are not currently stored

## Operational Notes

### Recording

The backend tries to start room composite recording for each interview.

Recording:

- is non-fatal if startup fails
- is stopped on finalize/end
- is stored through LiveKit egress

### Disconnect handling

The worker starts sessions with:

```ts
inputOptions: {
  closeOnDisconnect: false,
  participantIdentity: participant.identity
}
```

This is important because brief client disconnects should not immediately destroy the agent session.

### Security

The worker posts transcript data back to the backend using `LIVEKIT_API_KEY` as a simple shared-secret check. This is functional but basic. If the security model needs to be tightened later, this callback path should move to a stronger authenticated channel.

## Example Admin Config Payload

```json
{
  "interview.llmProvider": "openai",
  "interview.llmModel": "openai/gpt-5.4",
  "interview.sttProvider": "livekit-inference",
  "interview.sttModel": "elevenlabs/scribe_v2_realtime",
  "interview.ttsProvider": "livekit-inference",
  "interview.ttsModel": "cartesia/sonic-3",
  "interview.ttsVoice": "e90c6678-f0d3-4767-9883-5d0ecf5894a8",
  "interview.turnDetection": "multilingual_eou",
  "interview.allowInterruptions": "true",
  "interview.discardAudioIfUninterruptible": "true",
  "interview.preemptiveGeneration": "false",
  "interview.minInterruptionDurationMs": "900",
  "interview.minInterruptionWords": "2",
  "interview.minEndpointingDelayMs": "900",
  "interview.maxEndpointingDelayMs": "6000",
  "interview.aecWarmupDurationMs": "3000",
  "interview.useTtsAlignedTranscript": "true",
  "interview.logInterimTranscripts": "false"
}
```

## Example Use Cases

### English technical screening

- `language = en`
- `turnDetection = multilingual_eou`
- `minEndpointingDelayMs = 900`
- `minInterruptionWords = 2`

### Mandarin interview with slower cadence

- `language = zh-CN`
- `turnDetection = multilingual_eou`
- `minEndpointingDelayMs = 1200` to `1500`
- `minInterruptionWords = 2` or `3`
- monitor `shortFinalTranscripts` and `observedLanguages`

### High-latency but conservative mode

- `preemptiveGeneration = false`
- `allowInterruptions = true`
- `minEndpointingDelayMs = 1200`
- `maxEndpointingDelayMs = 6000`
- `logInterimTranscripts = false`

## Future Extensions

Likely next improvements:

- add explicit STT/TTS cost models
- add per-language presets
- support more provider plugins where needed
- expose session quality dashboards from `diagnostics`
- persist richer audio device and subscription diagnostics when needed

## Summary

The LiveKit interview agent in this repo is now designed to be:

- configurable without code edits
- tunable per interview or globally
- observable enough for multilingual debugging
- auditable from admin logs

The core tuning loop is:

1. change admin config or per-room `agentConfig`
2. run interviews
3. inspect `livekitUsage`, `apiRequestLog`, and `lLMCallLog`
4. adjust turn-taking, model, and language settings

That is the intended operational model for improving the RoboHire voice interview experience over time.
