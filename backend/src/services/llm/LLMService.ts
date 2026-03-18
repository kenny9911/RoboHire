import { Message, LLMOptions, LLMProvider, LLMResponse } from '../../types/index.js';
import { OpenAIProvider } from './OpenAIProvider.js';
import { OpenRouterProvider } from './OpenRouterProvider.js';
import { GoogleProvider } from './GoogleProvider.js';
import { KimiProvider } from './KimiProvider.js';
import { generateRequestId, logger } from '../LoggerService.js';

const DIRECT_PROVIDER_PREFIXES = new Set(['openai', 'google', 'kimi', 'moonshot']);

export class LLMService {
  private provider: LLMProvider | null = null;
  private model: string = '';
  private providerName: string = '';
  /** When providerName is 'direct', this stores the resolved provider type (e.g. 'google') */
  private defaultProviderType: string = '';
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
   * Strip provider prefix from model ID when using a direct provider.
   * e.g. "google/gemini-3-flash-preview" → "gemini-3-flash-preview" when provider is "google"
   * OpenRouter needs the prefix, direct providers don't.
   */
  private normalizeModel(model: string, provider: string): string {
    if (!model.includes('/')) return model;
    // OpenRouter expects provider/model format — keep as-is
    if (provider.toLowerCase() === 'openrouter') return model;

    const [modelProvider, ...rest] = model.split('/');
    const modelName = rest.join('/');
    // Strip prefix if it matches the active provider
    if (modelProvider.toLowerCase() === provider.toLowerCase()) {
      logger.debug('LLM_SERVICE', `Auto-corrected model ID: "${model}" → "${modelName}" for provider "${provider}"`);
      return modelName;
    }
    return model;
  }

  /**
   * In 'direct' mode, parse "provider/model" to resolve which provider to use.
   * Returns null if the prefix is not a known direct provider.
   */
  private resolveDirectModel(rawModel: string): { providerType: string; model: string } | null {
    if (!rawModel.includes('/')) return null;
    const slashIdx = rawModel.indexOf('/');
    const prefix = rawModel.substring(0, slashIdx).toLowerCase();
    if (!DIRECT_PROVIDER_PREFIXES.has(prefix)) return null;
    return { providerType: prefix, model: rawModel.substring(slashIdx + 1) };
  }

  /**
   * Lazily initialize the LLM provider
   * This ensures environment variables are loaded before accessing them
   */
  private ensureInitialized(): void {
    if (this.initialized) return;

    this.providerName = (process.env.LLM_PROVIDER || 'openrouter').toLowerCase();
    const rawModel = process.env.LLM_MODEL || 'google/gemini-3-flash-preview';

    if (this.providerName === 'direct') {
      const resolved = this.resolveDirectModel(rawModel);
      if (resolved) {
        this.defaultProviderType = resolved.providerType;
        this.model = resolved.model;
      } else {
        // No recognized prefix — treat entire string as model, fall back to openrouter
        logger.warn('LLM_SERVICE', `direct mode but model "${rawModel}" has no recognized provider prefix, falling back to openrouter`);
        this.defaultProviderType = 'openrouter';
        this.model = rawModel;
      }
      this.provider = this.createProvider(this.defaultProviderType);
    } else {
      this.model = this.normalizeModel(rawModel, this.providerName);
      this.provider = this.createProvider(this.providerName);
    }

    this.initialized = true;

    logger.info('LLM_SERVICE', `Initialized LLM service`, {
      provider: this.providerName,
      ...(this.providerName === 'direct' ? { resolvedProvider: this.defaultProviderType } : {}),
      model: this.model,
      ...(rawModel !== this.model ? { rawModel } : {}),
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
    const requestId = options?.requestId || generateRequestId();

    // Resolve provider + model depending on mode
    const rawModel = options?.visionModel || options?.model || this.model;
    let activeProvider: LLMProvider;
    let model: string;

    if (options?.provider) {
      // Explicit per-call provider override
      activeProvider = this.createProvider(options.provider);
      model = this.normalizeModel(rawModel, options.provider);
    } else if (this.providerName === 'direct') {
      // Direct mode: parse provider from the model string prefix
      const resolved = this.resolveDirectModel(rawModel);
      if (resolved) {
        if (resolved.providerType === this.defaultProviderType) {
          activeProvider = this.provider!; // reuse default instance
        } else {
          activeProvider = this.createProvider(resolved.providerType);
        }
        model = resolved.model;
      } else {
        // No prefix or unknown prefix — use default provider, pass model as-is
        activeProvider = this.provider!;
        model = rawModel;
      }
    } else {
      // Legacy single-provider mode (openrouter, google, openai, kimi)
      activeProvider = this.provider!;
      model = this.normalizeModel(rawModel, this.providerName);
    }

    const providerName = activeProvider.getProviderName();
    const requestOptions = {
      ...options,
      model,
    };
    logger.info('LLM', `→ ${providerName}/${model}`, {
      provider: providerName,
      model,
      messages: messages.length,
    }, requestId);

    try {
      const response = await activeProvider.chat(messages, {
        ...options,
        model,
      });

      const duration = Date.now() - startTime;

      logger.logLLMCall({
        requestId,
        model: response.model || model,
        provider: activeProvider.getProviderName(),
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        duration,
        status: 'success',
        messages,
        options: requestOptions,
        responseText: response.content,
      });

      return response.content;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.logLLMCall({
        requestId,
        model,
        provider: providerName,
        promptTokens: 0,
        completionTokens: 0,
        duration,
        status: 'error',
        messages,
        options: requestOptions,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      logger.error('LLM', `✗ ${providerName}/${model} failed`, {
        provider: providerName,
        model,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: `${duration}ms`,
      }, requestId);

      const rawFallbackModel = this.getConfiguredFallbackModel(model);
      if (rawFallbackModel && rawFallbackModel !== model && this.shouldTryFallback(error)) {
        // In direct mode, the fallback model may have a provider prefix that needs resolving
        let fallbackProvider = activeProvider;
        let fallbackModel = rawFallbackModel;
        if (this.providerName === 'direct') {
          const resolved = this.resolveDirectModel(rawFallbackModel);
          if (resolved) {
            fallbackModel = resolved.model;
            if (resolved.providerType !== activeProvider.getProviderName().toLowerCase()) {
              fallbackProvider = this.createProvider(resolved.providerType);
            }
          }
        }

        const fallbackStart = Date.now();
        logger.warn('LLM', 'Retrying with fallback model', {
          model,
          fallbackModel,
          fallbackProvider: fallbackProvider.getProviderName(),
        }, requestId);

        try {
          const fallbackResponse = await fallbackProvider.chat(messages, {
            ...options,
            model: fallbackModel,
          });

          const fallbackDuration = Date.now() - fallbackStart;
          logger.logLLMCall({
            requestId,
            model: fallbackResponse.model || fallbackModel,
            provider: fallbackProvider.getProviderName(),
            promptTokens: fallbackResponse.usage.promptTokens,
            completionTokens: fallbackResponse.usage.completionTokens,
            duration: fallbackDuration,
            status: 'success',
            messages,
            options: {
              ...requestOptions,
              model: fallbackModel,
              fallbackFrom: model,
            },
            responseText: fallbackResponse.content,
          });

          return fallbackResponse.content;
        } catch (fallbackError) {
          const fallbackDuration = Date.now() - fallbackStart;
          logger.logLLMCall({
            requestId,
            model: fallbackModel,
            provider: fallbackProvider.getProviderName(),
            promptTokens: 0,
            completionTokens: 0,
            duration: fallbackDuration,
            status: 'error',
            messages,
            options: {
              ...requestOptions,
              model: fallbackModel,
              fallbackFrom: model,
            },
            errorMessage: fallbackError instanceof Error ? fallbackError.message : 'Unknown error',
          });
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
