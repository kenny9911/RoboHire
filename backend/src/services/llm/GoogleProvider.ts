import { GoogleGenerativeAI } from '@google/generative-ai';
import { Message, LLMOptions, LLMProvider, LLMResponse } from '../../types/index.js';

export class GoogleProvider implements LLMProvider {
  private genAI: GoogleGenerativeAI;
  private defaultModel: string;
  private readonly retryDelayMs = 800;

  constructor(apiKey: string, defaultModel: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    // Extract model name from provider/model format (e.g., "google/gemini-3-flash-preview" -> "gemini-3-flash-preview")
    this.defaultModel = defaultModel.includes('/') 
      ? defaultModel.split('/')[1] 
      : defaultModel;
  }

  getProviderName(): string {
    return 'google';
  }

  async chat(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
    let modelName = options?.model || this.defaultModel;
    // Extract model name if it includes provider prefix
    if (modelName.includes('/')) {
      modelName = modelName.split('/')[1];
    }

    const model = this.genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens,
      },
    });

    // Convert messages to Gemini format
    const systemMessage = messages.find((m) => m.role === 'system');
    const chatMessages = messages.filter((m) => m.role !== 'system');

    // Build the prompt with system message context
    let prompt = '';
    if (systemMessage) {
      prompt = `System Instructions: ${systemMessage.content}\n\n`;
    }

    // Add conversation history
    for (const msg of chatMessages) {
      const role = msg.role === 'assistant' ? 'Assistant' : 'User';
      prompt += `${role}: ${msg.content}\n\n`;
    }

    const result = await this.generateContentWithRetry(model, prompt);
    const response = result.response;
    const text = response.text();

    if (!text) {
      throw new Error('No content in Google Gemini response');
    }

    // Gemini returns usage metadata
    const usageMetadata = response.usageMetadata;

    return {
      content: text,
      usage: {
        promptTokens: usageMetadata?.promptTokenCount || 0,
        completionTokens: usageMetadata?.candidatesTokenCount || 0,
        totalTokens: usageMetadata?.totalTokenCount || 0,
      },
      model: modelName,
    };
  }

  private async generateContentWithRetry(
    model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
    prompt: string
  ) {
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await model.generateContent(prompt);
      } catch (error) {
        const isLastAttempt = attempt === maxAttempts;
        if (isLastAttempt || !this.shouldRetryHighDemandError(error)) {
          throw error;
        }

        await this.sleep(this.retryDelayMs);
      }
    }

    throw new Error('Failed to generate content after retry');
  }

  private shouldRetryHighDemandError(error: unknown): boolean {
    const fallbackMessage = String(error ?? '');
    if (!error || typeof error !== 'object') {
      return this.isRetryableMessage(fallbackMessage);
    }

    const err = error as {
      status?: number | string;
      statusCode?: number | string;
      code?: number | string;
      message?: string;
    };

    const rawStatus = err.status ?? err.statusCode ?? err.code;
    const status = typeof rawStatus === 'string' ? Number(rawStatus) : rawStatus;
    const message = typeof err.message === 'string' ? err.message : fallbackMessage;

    if (status === 503) {
      return true;
    }

    return this.isRetryableMessage(message);
  }

  private isRetryableMessage(message: string): boolean {
    const normalized = message.toLowerCase();

    return (
      normalized.includes('503 service unavailable') ||
      (normalized.includes('service unavailable') && normalized.includes('high demand')) ||
      normalized.includes('currently experiencing high demand') ||
      normalized.includes('spikes in demand are usually temporary')
    );
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
