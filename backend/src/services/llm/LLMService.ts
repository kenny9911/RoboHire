import { Message, LLMOptions, LLMProvider, LLMResponse } from '../../types/index.js';
import { OpenAIProvider } from './OpenAIProvider.js';
import { OpenRouterProvider } from './OpenRouterProvider.js';
import { GoogleProvider } from './GoogleProvider.js';
import { KimiProvider } from './KimiProvider.js';
import { logger } from '../LoggerService.js';

export class LLMService {
  private provider: LLMProvider | null = null;
  private model: string = '';
  private providerName: string = '';
  private initialized: boolean = false;

  private getConfiguredFallbackModel(primaryModel: string): string | null {
    const configured = (process.env.LLM_FALLBACK_MODEL || '').trim();
    if (configured && configured !== primaryModel) {
      return configured;
    }

    const normalized = primaryModel.toLowerCase();
    const providerPrefix = primaryModel.includes('/') ? `${primaryModel.split('/')[0]}/` : '';

    if (normalized.includes('gemini-3.1-pro-preview') || normalized.includes('gemini-3-pro-preview')) {
      return `${providerPrefix}gemini-3-flash-preview`;
    }

    return null;
  }

  private shouldTryFallback(error: unknown): boolean {
    const message = String(
      (error && typeof error === 'object' && 'message' in error)
        ? (error as { message?: string }).message
        : error
    ).toLowerCase();

    return (
      message.includes('503') ||
      message.includes('service unavailable') ||
      message.includes('high demand') ||
      message.includes('fetch failed') ||
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('429') ||
      message.includes('too many requests') ||
      message.includes('quota exceeded') ||
      message.includes('rate limit')
    );
  }

  /**
   * Lazily initialize the LLM provider
   * This ensures environment variables are loaded before accessing them
   */
  private ensureInitialized(): void {
    if (this.initialized) return;
    
    this.providerName = process.env.LLM_PROVIDER || 'openrouter';
    this.model = process.env.LLM_MODEL || 'google/gemini-3-flash-preview';
    this.provider = this.createProvider(this.providerName);
    this.initialized = true;
    
    logger.info('LLM_SERVICE', `Initialized LLM service`, {
      provider: this.providerName,
      model: this.model,
    });
  }

  private createProvider(providerType: string): LLMProvider {
    switch (providerType.toLowerCase()) {
      case 'openai':
        return new OpenAIProvider(
          process.env.OPENAI_API_KEY || '',
          this.model
        );
      case 'openrouter':
        return new OpenRouterProvider(
          process.env.OPENROUTER_API_KEY || '',
          this.model
        );
      case 'google':
        return new GoogleProvider(
          process.env.GOOGLE_API_KEY || '',
          this.model
        );
      case 'kimi':
      case 'moonshot':
        return new KimiProvider(
          process.env.KIMI_API_KEY || '',
          this.model
        );
      default:
        logger.warn('LLM_SERVICE', `Unknown provider "${providerType}", falling back to OpenRouter`);
        return new OpenRouterProvider(
          process.env.OPENROUTER_API_KEY || '',
          this.model
        );
    }
  }

  async chat(messages: Message[], options?: LLMOptions): Promise<string> {
    this.ensureInitialized();

    const startTime = Date.now();
    const requestId = options?.requestId;
    // Use visionModel if specified (for multimodal messages), otherwise regular model
    const model = options?.visionModel || options?.model || this.model;

    logger.debug('LLM', `Starting LLM call`, {
      model,
      messagesCount: messages.length,
      promptLength: messages.reduce((acc, m) => acc + m.content.length, 0),
    }, requestId);

    try {
      const response = await this.provider!.chat(messages, {
        ...options,
        model,
      });

      const duration = Date.now() - startTime;

      // Log the LLM usage
      if (requestId) {
        logger.logLLMCall(
          requestId,
          response.model || model,
          this.provider!.getProviderName(),
          response.usage.promptTokens,
          response.usage.completionTokens,
          duration
        );
      } else {
        logger.info('LLM', `LLM call completed`, {
          model: response.model || model,
          tokens: `${response.usage.promptTokens}/${response.usage.completionTokens}/${response.usage.totalTokens}`,
          duration: `${duration}ms`,
        });
      }

      return response.content;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('LLM', `LLM call failed`, {
        model,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: `${duration}ms`,
      }, requestId);

      const fallbackModel = this.getConfiguredFallbackModel(model);
      if (fallbackModel && fallbackModel !== model && this.shouldTryFallback(error)) {
        const fallbackStart = Date.now();
        logger.warn('LLM', 'Retrying with fallback model', {
          model,
          fallbackModel,
        }, requestId);

        try {
          const fallbackResponse = await this.provider!.chat(messages, {
            ...options,
            model: fallbackModel,
          });

          const fallbackDuration = Date.now() - fallbackStart;
          if (requestId) {
            logger.logLLMCall(
              requestId,
              fallbackResponse.model || fallbackModel,
              this.provider!.getProviderName(),
              fallbackResponse.usage.promptTokens,
              fallbackResponse.usage.completionTokens,
              fallbackDuration
            );
          } else {
            logger.info('LLM', `Fallback LLM call completed`, {
              model: fallbackResponse.model || fallbackModel,
              tokens: `${fallbackResponse.usage.promptTokens}/${fallbackResponse.usage.completionTokens}/${fallbackResponse.usage.totalTokens}`,
              duration: `${fallbackDuration}ms`,
            });
          }

          return fallbackResponse.content;
        } catch (fallbackError) {
          const fallbackDuration = Date.now() - fallbackStart;
          logger.error('LLM', `Fallback LLM call failed`, {
            model: fallbackModel,
            error: fallbackError instanceof Error ? fallbackError.message : 'Unknown error',
            duration: `${fallbackDuration}ms`,
          }, requestId);
          throw fallbackError;
        }
      }

      throw error;
    }
  }

  async chatWithJsonResponse<T>(messages: Message[], options?: LLMOptions): Promise<T> {
    const response = await this.chat(messages, options);
    
    // Try to extract JSON from the response
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                      response.match(/```\s*([\s\S]*?)\s*```/) ||
                      response.match(/(\{[\s\S]*\})/);
    
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1].trim()) as T;
      } catch {
        // If parsing fails, try to parse the entire response
      }
    }
    
    try {
      return JSON.parse(response) as T;
    } catch {
      logger.error('LLM', `Failed to parse JSON response`, {
        responsePreview: response.substring(0, 200),
      }, options?.requestId);
      throw new Error(`Failed to parse LLM response as JSON: ${response.substring(0, 200)}...`);
    }
  }

  getModel(): string {
    this.ensureInitialized();
    return this.model;
  }

  getProvider(): string {
    this.ensureInitialized();
    return this.providerName;
  }
}

export const llmService = new LLMService();
