import OpenAI from 'openai';
import { Message, LLMOptions, LLMProvider, LLMResponse } from '../../types/index.js';

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string) {
    this.client = new OpenAI({ apiKey });
    this.defaultModel = defaultModel;
  }

  getProviderName(): string {
    return 'openai';
  }

  async chat(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
    const model = options?.model || this.defaultModel;
    
    const response = await this.client.chat.completions.create({
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
    });

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
