# LLM Provider Configuration Guide

RoboHire supports multiple LLM providers and two routing modes: **direct** and **OpenRouter**. This guide explains how provider routing works and how to configure models for each feature.

## Routing Modes (`LLM_PROVIDER`)

### `direct` — Per-model provider routing (recommended)

Each model string uses a `provider/model` prefix to determine which API to call directly. This lets you mix providers freely — e.g. use Google for general tasks, OpenAI for interviews, and Kimi for Chinese-language processing.

```bash
LLM_PROVIDER=direct

LLM_MODEL=google/gemini-3.1-pro-preview     # → Google API, model "gemini-3.1-pro-preview"
LLM_FAST=google/gemini-3-flash-preview       # → Google API, model "gemini-3-flash-preview"
LLM_LIVEKIT=openai/gpt-5.4                   # → OpenAI API, model "gpt-5.4"
LLM_MATCH_RESUME=kimi/kimi-k2.5              # → Kimi (Moonshot) API, model "kimi-k2.5"
```

**How it works**: The prefix before `/` selects the provider. The rest is the model name sent to that provider's API. The prefix is stripped automatically — Google's API receives `gemini-3.1-pro-preview`, not `google/gemini-3.1-pro-preview`.

Recognized prefixes:

| Prefix | Provider | API Key env var |
|--------|----------|-----------------|
| `google/` | Google AI (Gemini) | `GOOGLE_API_KEY` |
| `openai/` | OpenAI | `OPENAI_API_KEY` |
| `kimi/` | Moonshot (Kimi) | `KIMI_API_KEY` |
| `moonshot/` | Moonshot (Kimi) | `KIMI_API_KEY` |

If the prefix is not recognized (e.g. `x-ai/grok-4.1-fast`), the system falls back to OpenRouter using `OPENROUTER_API_KEY`.

### `openrouter` — Unified routing through OpenRouter

All model strings are sent as-is to the OpenRouter API. The `provider/model` format is OpenRouter's own routing key — OpenRouter decides which upstream provider to call.

```bash
LLM_PROVIDER=openrouter

LLM_MODEL=google/gemini-3-flash-preview      # → OpenRouter API, routing key "google/gemini-3-flash-preview"
LLM_FAST=anthropic/claude-sonnet-4-5         # → OpenRouter API, routing key "anthropic/claude-sonnet-4-5"
LLM_MATCH_RESUME=x-ai/grok-4.1-fast          # → OpenRouter API, routing key "x-ai/grok-4.1-fast"
```

**Advantages**: Access to 200+ models from all providers through a single API key. Supports providers not available in direct mode (Anthropic, xAI, Zhipu, MiniMax, Xiaomi, etc.).

**Trade-off**: Adds a routing hop — slightly higher latency and OpenRouter takes a margin on top of upstream pricing.

### Legacy single-provider modes (`openai`, `google`, `kimi`)

Forces all models through one provider. The `provider/` prefix is stripped if it matches the provider name. These are superseded by `direct` mode but remain for backward compatibility.

```bash
LLM_PROVIDER=google
LLM_MODEL=gemini-3-flash-preview              # No prefix needed
# or
LLM_MODEL=google/gemini-3-flash-preview       # Prefix auto-stripped
```

## Comparison Table

| | `direct` | `openrouter` | `google` / `openai` / `kimi` |
|---|---|---|---|
| Mix providers per model | Yes | No (all via OpenRouter) | No (single provider) |
| Prefix meaning | Selects API endpoint | OpenRouter routing key | Stripped if matching |
| Supported providers | Google, OpenAI, Kimi | All OpenRouter models | One only |
| API keys needed | One per provider used | `OPENROUTER_API_KEY` only | One key |
| Latency | Direct to provider | +OpenRouter hop | Direct to provider |
| Cost | Provider pricing | Provider + OpenRouter margin | Provider pricing |

## Model Environment Variables

Each variable can independently target a different provider when `LLM_PROVIDER=direct`:

| Variable | Purpose | Fallback |
|----------|---------|----------|
| `LLM_MODEL` | Default model for all AI features | Required |
| `LLM_FAST` | Synchronous UX-critical tasks (hiring brief generation) | `LLM_MODEL` |
| `LLM_VISION_MODEL` | PDF/image understanding with vision capabilities | `LLM_MODEL` |
| `LLM_MATCH_RESUME` | AI resume-job matching analysis | `LLM_MODEL` |
| `LLM_PREMATCH_FILTER` | Lightweight pre-screening before full matching | Skipped if unset |
| `LLM_EXTRACT_MODEL` | Resume/JD structured data extraction | `LLM_MODEL` |
| `LLM_LIVEKIT` | LiveKit AI video interview agent | `LLM_MODEL` |
| `INTERVIEW_PROMPT_MODEL` | Interview prompt generation before room join | `LLM_FAST` → `LLM_MODEL` |
| `LLM_FALLBACK_MODEL` | Auto-retry target on 503/429/timeout errors | Auto-selected (Pro → Flash) |

## Automatic Fallback

When the primary model returns a transient error (503, 429, timeout, rate limit), the system automatically retries with a fallback model:

- If `LLM_FALLBACK_MODEL` is set, that model is used
- Otherwise, Gemini Pro models automatically fall back to Gemini Flash
- In `direct` mode, the fallback model's provider prefix is resolved independently — the fallback can use a different provider than the primary

## Pricing Reference (per 1M tokens)

### Direct Providers

| Model | Input | Output | Notes |
|-------|-------|--------|-------|
| `google/gemini-3-flash-preview` | $0.50 | $3.00 | Fast, cost-effective |
| `google/gemini-3.1-pro-preview` | $2.00 | $12.00 | Higher quality |
| `openai/gpt-5.4` | $1.75 | $14.00 | |
| `openai/gpt-oss-120b` | $0.039 | $0.19 | Ultra low cost |
| `kimi/kimi-k2.5` | $0.60 | $3.00 | 256K context, thinking mode |

### OpenRouter-only Models

| Model | Input | Output | Notes |
|-------|-------|--------|-------|
| `x-ai/grok-4.1-fast` | $0.20 | $0.50 | |
| `x-ai/grok-code-fast-1` | $0.20 | $1.50 | |
| `anthropic/claude-opus-4.6` | $5.00 | $25.00 | Highest quality |
| `z-ai/glm-5` | $0.95 | $2.55 | |
| `minimax/minimax-m2.5` | $0.30 | $1.10 | |

## Example Configurations

### Cost-optimized (all Google Flash)

```bash
LLM_PROVIDER=direct
LLM_MODEL=google/gemini-3-flash-preview
LLM_FAST=google/gemini-3-flash-preview
LLM_MATCH_RESUME=google/gemini-3-flash-preview
LLM_PREMATCH_FILTER=google/gemini-3-flash-preview
```

### Quality-optimized (mixed providers)

```bash
LLM_PROVIDER=direct
LLM_MODEL=google/gemini-3.1-pro-preview
LLM_FAST=google/gemini-3-flash-preview
LLM_MATCH_RESUME=google/gemini-3.1-pro-preview
LLM_LIVEKIT=openai/gpt-5.4
LLM_PREMATCH_FILTER=google/gemini-3-flash-preview
```

### OpenRouter with exotic models

```bash
LLM_PROVIDER=openrouter
LLM_MODEL=anthropic/claude-opus-4.6
LLM_FAST=x-ai/grok-4.1-fast
LLM_MATCH_RESUME=google/gemini-3.1-pro-preview
```

## Implementation Details

Source: `backend/src/services/llm/LLMService.ts`

Provider implementations:

| File | Provider |
|------|----------|
| `backend/src/services/llm/GoogleProvider.ts` | Google AI (Gemini) |
| `backend/src/services/llm/OpenAIProvider.ts` | OpenAI |
| `backend/src/services/llm/KimiProvider.ts` | Moonshot (Kimi) |
| `backend/src/services/llm/OpenRouterProvider.ts` | OpenRouter (unified) |

All providers implement the `LLMProvider` interface with a `chat()` method. The `LLMService` singleton resolves which provider to use based on the mode and model string, then delegates the call.
