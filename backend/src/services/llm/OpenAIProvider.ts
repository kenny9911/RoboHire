import OpenAI from 'openai';
import { Message, MessageContent, LLMOptions, LLMProvider, LLMResponse } from '../../types/index.js';

function sanitizeOpenAIText(value: string): string {
  let normalized = '';

  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);

    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        normalized += value[i] + value[i + 1];
        i += 1;
      } else {
        normalized += '\uFFFD';
      }
      continue;
    }

    if (code >= 0xdc00 && code <= 0xdfff) {
      normalized += '\uFFFD';
      continue;
    }

    normalized += value[i];
  }

  // Keep tabs/newlines/carriage returns for prompt structure, strip other control chars.
  return normalized.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

function sanitizeOpenAIContent(content: MessageContent): string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> {
  if (typeof content === 'string') {
    return sanitizeOpenAIText(content);
  }

  return content.map((part) => {
    if (part.type === 'text') {
      return {
        type: 'text' as const,
        text: sanitizeOpenAIText(part.text || ''),
      };
    }

    return {
      type: 'image_url' as const,
      image_url: {
        url: sanitizeOpenAIText(part.image_url?.url || ''),
      },
    };
  });
}

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string) {
    const baseURL = process.env.OPENAI_BASE_URL;
    const proxyKey = process.env.LLM_PROXY_KEY;
    this.client = new OpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
      ...(baseURL && proxyKey ? { defaultHeaders: { 'X-Proxy-Key': proxyKey } } : {}),
    });
    this.defaultModel = defaultModel;
  }

  getProviderName(): string {
    return 'openai';
  }

  async chat(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
    const model = sanitizeOpenAIText(options?.model || this.defaultModel);
    const requestBody: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: sanitizeOpenAIContent(m.content),
      })),
    };

    if (typeof options?.temperature === 'number' && Number.isFinite(options.temperature)) {
      requestBody.temperature = options.temperature;
    } else if (options?.temperature === undefined) {
      requestBody.temperature = 0.7;
    }

    if (typeof options?.maxTokens === 'number' && Number.isFinite(options.maxTokens)) {
      // GPT-5 family rejects the legacy `max_tokens` field on chat completions.
      // `max_completion_tokens` is accepted by current OpenAI reasoning models and
      // also works with standard chat-completions usage.
      requestBody.max_completion_tokens = options.maxTokens;
    }

    const response = await this.client.chat.completions.create(
      requestBody as any,
      options?.signal ? { signal: options.signal } : undefined,
    );

    const content = response?.choices?.[0]?.message?.content;
    if (!content) {
      const errorMessage =
        (response as { error?: { message?: string } })?.error?.message ||
        'No content in OpenAI response';
      throw new Error(errorMessage);
    }

    return {
      content,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      model,
    };
  }
}
