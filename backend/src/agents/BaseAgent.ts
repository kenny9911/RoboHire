import { Message } from '../types/index.js';
import { LLMService, llmService } from '../services/llm/LLMService.js';
import { LanguageService, languageService } from '../services/LanguageService.js';
import { logger } from '../services/LoggerService.js';

/**
 * Abstract base class for all agents
 * Provides common functionality for LLM interaction and language detection
 */
export abstract class BaseAgent<TInput, TOutput> {
  protected llm: LLMService;
  protected language: LanguageService;
  protected name: string;

  constructor(name: string) {
    this.name = name;
    this.llm = llmService;
    this.language = languageService;
  }

  /**
   * LLM temperature. Override in subclasses that need deterministic output (e.g. scoring).
   */
  protected getTemperature(): number {
    return 0.7;
  }

  /**
   * Get the agent-specific system prompt
   * Override this in subclasses to define the agent's behavior
   */
  protected abstract getAgentPrompt(): string;

  /**
   * Format the input into a user message for the LLM
   * Override this in subclasses to customize input formatting
   */
  protected abstract formatInput(input: TInput): string;

  /**
   * Parse the LLM response into the expected output format
   * Override this in subclasses to customize output parsing
   */
  protected abstract parseOutput(response: string): TOutput;

  /**
   * Build the system prompt with language detection
   * @param jdContent Optional JD content for language detection
   * @param requestId Optional request ID for logging
   * @param locale Optional user locale override (e.g. 'zh', 'ja', 'fr')
   */
  protected buildSystemPrompt(jdContent?: string, requestId?: string, locale?: string): string {
    const basePrompt = this.getAgentPrompt();

    // Prefer explicit locale from user's UI language setting
    if (locale) {
      const localeInstruction = this.language.getLanguageInstructionFromLocale(locale);
      if (localeInstruction) {
        const lang = this.language.getLanguageFromLocale(locale);
        logger.logLanguageDetection(requestId || '', lang || locale, 'locale');
        return `${localeInstruction}\n\n${basePrompt}`;
      }
    }

    if (jdContent) {
      const detectedLanguage = this.language.detectLanguage(jdContent);
      const languageInstruction = this.language.getLanguageInstruction(jdContent);

      logger.logLanguageDetection(requestId || '', detectedLanguage, 'auto');

      return `${languageInstruction}\n\n${basePrompt}`;
    }

    return basePrompt;
  }

  /**
   * Execute the agent with the given input
   * @param input The input to process
   * @param jdContent Optional JD content for language detection
   * @param requestId Optional request ID for logging
   * @param locale Optional user locale override (e.g. 'zh', 'ja', 'fr')
   */
  async execute(
    input: TInput,
    jdContent?: string,
    requestId?: string,
    locale?: string,
    model?: string,
    signal?: AbortSignal,
    provider?: string,
  ): Promise<TOutput> {
    const stepNum = requestId ? logger.startStep(requestId, `${this.name}: Execute`) : 0;

    logger.logAgentStart(requestId || '', this.name, { inputType: typeof input, model: model || 'default' });

    const systemPrompt = this.buildSystemPrompt(jdContent, requestId, locale);
    const userMessage = this.formatInput(input);

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    logger.debug('AGENT', `${this.name}: Prepared messages`, {
      systemPromptLength: systemPrompt.length,
      userMessageLength: userMessage.length,
      model: model || 'default',
    }, requestId);

    try {
      const response = await this.llm.chat(messages, {
        temperature: this.getTemperature(),
        requestId,
        ...(model ? { model } : {}),
        ...(signal ? { signal } : {}),
        ...(provider ? { provider } : {}),
      });
      
      logger.debug('AGENT', `${this.name}: Parsing response`, {
        responseLength: response.length,
      }, requestId);
      
      const output = this.parseOutput(response);
      
      logger.logAgentEnd(requestId || '', this.name, true, JSON.stringify(output).length);
      
      if (requestId && stepNum) {
        logger.endStep(requestId, stepNum, 'completed');
      }
      
      return output;
    } catch (error) {
      logger.error('AGENT', `${this.name}: Execution failed`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, requestId);
      
      logger.logAgentEnd(requestId || '', this.name, false);
      
      if (requestId && stepNum) {
        logger.endStep(requestId, stepNum, 'failed');
      }
      
      throw error;
    }
  }

  /**
   * Execute and return typed JSON response
   * @param input The input to process
   * @param jdContent Optional JD content for language detection
   * @param requestId Optional request ID for logging
   */
  async executeWithJsonResponse(input: TInput, jdContent?: string, requestId?: string, model?: string): Promise<TOutput> {
    const stepNum = requestId ? logger.startStep(requestId, `${this.name}: Execute (JSON)`) : 0;

    logger.logAgentStart(requestId || '', this.name, { inputType: typeof input, outputFormat: 'JSON', model: model || 'default' });

    const systemPrompt = this.buildSystemPrompt(jdContent, requestId);
    const userMessage = this.formatInput(input);

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    logger.debug('AGENT', `${this.name}: Prepared messages for JSON response`, {
      systemPromptLength: systemPrompt.length,
      userMessageLength: userMessage.length,
      model: model || 'default',
    }, requestId);

    try {
      // Use chat() + parseOutput() so agent-specific fallback logic is always used.
      // chatWithJsonResponse() throws on malformed JSON with no fallback,
      // whereas each agent's parseOutput() provides a safe default.
      const response = await this.llm.chat(messages, {
        temperature: this.getTemperature(),
        requestId,
        ...(model ? { model } : {}),
      });

      logger.debug('AGENT', `${this.name}: Parsing JSON response`, {
        responseLength: response.length,
      }, requestId);

      const output = this.parseOutput(response);

      logger.logAgentEnd(requestId || '', this.name, true, JSON.stringify(output).length);

      if (requestId && stepNum) {
        logger.endStep(requestId, stepNum, 'completed');
      }

      return output;
    } catch (error) {
      logger.error('AGENT', `${this.name}: JSON execution failed`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, requestId);

      logger.logAgentEnd(requestId || '', this.name, false);

      if (requestId && stepNum) {
        logger.endStep(requestId, stepNum, 'failed');
      }

      throw error;
    }
  }
}
