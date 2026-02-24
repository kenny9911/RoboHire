import OpenAI from 'openai';
import { Message, LLMOptions, LLMProvider, LLMResponse } from '../../types/index.js';

const K2_MODELS = [
  'kimi-k2.5',
  'kimi-k2-0905-preview',
  'kimi-k2-turbo-preview',
  'kimi-k2-thinking',
  'kimi-k2-thinking-turbo',
];

function isK2Model(model: string): boolean {
  return K2_MODELS.some((m) => model.toLowerCase() === m.toLowerCase());
}

export class KimiProvider implements LLMProvider {
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: process.env.KIMI_API_BASE_URL || 'https://api.moonshot.cn/v1',
    });
    this.defaultModel = defaultModel;
  }

  getProviderName(): string {
    return 'kimi';
  }

  async chat(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
    const model = options?.model || this.defaultModel;
    const k2 = isK2Model(model);

    const params: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (k2) {
      // K2.5 enforces fixed values; any deviation causes an API error.
      // Thinking mode (default): temperature=1.0
      // Non-thinking mode: temperature=0.6
      params.temperature = 1;
      params.thinking = { type: 'enabled' };
    } else {
      params.temperature = options?.temperature ?? 0.7;
    }

    if (options?.maxTokens) {
      params.max_tokens = options.maxTokens;
    }

    const response = await (this.client.chat.completions.create as Function)(params);

    const choice = response.choices?.[0];
    const content = choice?.message?.content;
    if (!content) {
      throw new Error('No content in Kimi response');
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
