import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { getCurrentRequestId } from '../lib/requestContext.js';
import type { LLMOptions, Message, MessageContent } from '../types/index.js';

// Log levels
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// Log entry structure
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  levelName: string;
  category: string;
  message: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
  duration?: number;
}

// LLM usage tracking
export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  provider: string;
  cost: number;
  duration: number;
  status: 'success' | 'error';
  requestMessages?: unknown[] | null;
  requestOptions?: Record<string, unknown> | null;
  responsePreview?: string | null;
  errorMessage?: string | null;
}

interface LogLLMCallInput {
  requestId?: string;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  duration: number;
  status?: 'success' | 'error';
  messages?: Message[];
  options?: LLMOptions | Record<string, unknown>;
  responseText?: string | null;
  errorMessage?: string | null;
}

// Request context for tracking
export interface RequestContext {
  requestId: string;
  startTime: number;
  endpoint: string;
  method: string;
  steps: StepLog[];
  llmCalls: LLMUsage[];
  totalCost: number;
  totalTokens: number;
  endTime?: number;
  duration?: number;
  status?: 'success' | 'error';
  statusCode?: number;
}

export interface RequestUsageSnapshot {
  requestId: string;
  endpoint: string;
  method: string;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalCost: number;
  lastModel: string | null;
  lastProvider: string | null;
  llmCallsCount: number;
  llmCalls: LLMUsage[];
  startedAt: string;
  endedAt?: string;
  status?: 'success' | 'error';
  statusCode?: number;
}

// Step logging
export interface StepLog {
  step: number;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'started' | 'completed' | 'failed';
  metadata?: Record<string, unknown>;
}

// Model pricing (per million tokens)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenRouter models
  'google/gemini-3-flash-preview': { input: 0.50, output: 3.00 },
  'google/gemini-3-pro-preview': { input: 2.00, output: 12.00 },
  'x-ai/grok-4.1-fast': { input: 0.20, output: 0.50 },
  'x-ai/grok-code-fast-1': { input: 0.20, output: 1.50 },
  'openai/gpt-oss-120b': { input: 0.039, output: 0.19 },
  'openai/gpt-5.2': { input: 1.75, output: 14.00 },
  'anthropic/claude-opus-4.5': { input: 5.00, output: 25.00 },
  'xiaomi/mimo-v2-flash': { input: 0.09, output: 0.29 },
  'z-ai/glm-4.7': { input: 0.40, output: 1.50 },
  // OpenAI direct
  'gpt-4': { input: 30.00, output: 60.00 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  // Kimi (Moonshot) direct
  'kimi-k2.5': { input: 0.60, output: 3.00 },
  'kimi-k2-0905-preview': { input: 0.60, output: 3.00 },
  'kimi-k2-turbo-preview': { input: 0.30, output: 1.50 },
  'kimi-k2-thinking': { input: 0.60, output: 3.00 },
  'kimi-k2-thinking-turbo': { input: 0.30, output: 1.50 },
  // OpenRouter Kimi
  'moonshotai/kimi-k2.5': { input: 0.60, output: 3.00 },
  // Google direct
  'gemini-pro': { input: 0.50, output: 1.50 },
  'gemini-1.5-pro': { input: 3.50, output: 10.50 },
  // Default fallback
  'default': { input: 1.00, output: 3.00 },
};

class LoggerService extends EventEmitter {
  private readonly maxLoggedPromptChars = 12000;
  private readonly maxLoggedResponseChars = 12000;
  private readonly maxLoggedUrlChars = 1000;
  private logLevel: LogLevel;
  private requestContexts: Map<string, RequestContext> = new Map();
  private completedRequestContexts: Map<string, { context: RequestContext; completedAt: number }> = new Map();
  private readonly snapshotTtlMs = 6 * 60 * 60 * 1000; // 6 hours
  private globalStats = {
    totalRequests: 0,
    totalLLMCalls: 0,
    totalTokens: 0,
    totalCost: 0,
    totalDuration: 0,
  };

  // File logging
  private logDir: string;
  private currentDate: string;
  private allLogStream: fs.WriteStream | null = null;
  private errorLogStream: fs.WriteStream | null = null;
  private llmLogStream: fs.WriteStream | null = null;
  private requestLogStream: fs.WriteStream | null = null;
  private fileLoggingEnabled: boolean;

  constructor() {
    super();
    this.logLevel = this.parseLogLevel(process.env.LOG_LEVEL || 'INFO');
    this.fileLoggingEnabled = process.env.FILE_LOGGING !== 'false';
    this.logDir = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
    this.currentDate = this.getDateString();
    
    if (this.fileLoggingEnabled) {
      this.initializeLogFiles();
    }
  }

  private getDateString(): string {
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  }

  private initializeLogFiles(): void {
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    this.openLogStreams();
    console.log(`📁 Log files initialized in: ${this.logDir}`);
  }

  private openLogStreams(): void {
    const date = this.currentDate;
    const flags = { flags: 'a' as const }; // Append mode

    this.allLogStream = fs.createWriteStream(
      path.join(this.logDir, `all-${date}.jsonl`),
      flags
    );
    
    this.errorLogStream = fs.createWriteStream(
      path.join(this.logDir, `error-${date}.jsonl`),
      flags
    );
    
    this.llmLogStream = fs.createWriteStream(
      path.join(this.logDir, `llm-${date}.jsonl`),
      flags
    );
    
    this.requestLogStream = fs.createWriteStream(
      path.join(this.logDir, `requests-${date}.jsonl`),
      flags
    );
  }

  private checkDateRotation(): void {
    const today = this.getDateString();
    if (today !== this.currentDate) {
      // Close existing streams
      this.closeLogStreams();
      
      // Update date and open new streams
      this.currentDate = today;
      this.openLogStreams();
      
      console.log(`📁 Log files rotated for: ${today}`);
    }
  }

  private closeLogStreams(): void {
    this.allLogStream?.end();
    this.errorLogStream?.end();
    this.llmLogStream?.end();
    this.requestLogStream?.end();
  }

  private writeToFile(stream: fs.WriteStream | null, entry: object): void {
    if (!this.fileLoggingEnabled || !stream) return;
    
    this.checkDateRotation();
    
    try {
      stream.write(JSON.stringify(entry) + '\n');
    } catch (err) {
      console.error('Failed to write to log file:', err);
    }
  }

  // Get log file paths
  getLogFilePaths(): { all: string; error: string; llm: string; requests: string } {
    const date = this.currentDate;
    return {
      all: path.join(this.logDir, `all-${date}.jsonl`),
      error: path.join(this.logDir, `error-${date}.jsonl`),
      llm: path.join(this.logDir, `llm-${date}.jsonl`),
      requests: path.join(this.logDir, `requests-${date}.jsonl`),
    };
  }

  // Get log directory
  getLogDirectory(): string {
    return this.logDir;
  }

  // Graceful shutdown
  shutdown(): void {
    this.closeLogStreams();
    console.log('📁 Log streams closed');
  }

  private parseLogLevel(level: string): LogLevel {
    switch (level.toUpperCase()) {
      case 'DEBUG': return LogLevel.DEBUG;
      case 'INFO': return LogLevel.INFO;
      case 'WARN': return LogLevel.WARN;
      case 'ERROR': return LogLevel.ERROR;
      default: return LogLevel.INFO;
    }
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}min`;
  }

  private truncateForLog(text: string, maxChars: number): { value: string; truncated: boolean; originalLength: number } {
    if (text.length <= maxChars) {
      return { value: text, truncated: false, originalLength: text.length };
    }

    return {
      value: `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`,
      truncated: true,
      originalLength: text.length,
    };
  }

  private sanitizeMessageContent(content: MessageContent): unknown[] {
    const parts = Array.isArray(content)
      ? content
      : [{ type: 'text' as const, text: content }];

    return parts.map((part) => {
      if (part.type === 'text') {
        const truncated = this.truncateForLog(part.text, this.maxLoggedPromptChars);
        return {
          type: 'text',
          text: truncated.value,
          originalLength: truncated.originalLength,
          truncated: truncated.truncated,
        };
      }

      const url = part.image_url.url || '';
      if (url.startsWith('data:')) {
        const mimeType = url.match(/^data:([^;,]+)/)?.[1] || 'application/octet-stream';
        return {
          type: 'image_url',
          image_url: {
            url: `[redacted data URI: ${mimeType}]`,
            mimeType,
            originalLength: url.length,
            redacted: true,
          },
        };
      }

      const truncated = this.truncateForLog(url, this.maxLoggedUrlChars);
      return {
        type: 'image_url',
        image_url: {
          url: truncated.value,
          originalLength: truncated.originalLength,
          truncated: truncated.truncated,
          redacted: false,
        },
      };
    });
  }

  private sanitizeMessages(messages?: Message[]): unknown[] | null {
    if (!messages || messages.length === 0) return null;

    return messages.map((message) => ({
      role: message.role,
      content: this.sanitizeMessageContent(message.content),
    }));
  }

  private sanitizeOptions(options?: LLMOptions | Record<string, unknown>): Record<string, unknown> | null {
    if (!options) return null;

    const cleanedEntries = Object.entries(options)
      .filter(([key, value]) => key !== 'requestId' && value !== undefined)
      .map(([key, value]) => {
        if (typeof value === 'string') {
          const truncated = this.truncateForLog(value, this.maxLoggedUrlChars);
          return [key, truncated.value];
        }
        if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
          return [key, value];
        }
        if (Array.isArray(value)) {
          return [key, value.slice(0, 20)];
        }
        return [key, String(value)];
      });

    if (cleanedEntries.length === 0) return null;
    return Object.fromEntries(cleanedEntries);
  }

  private getLevelName(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG: return 'DEBUG';
      case LogLevel.INFO: return 'INFO';
      case LogLevel.WARN: return 'WARN';
      case LogLevel.ERROR: return 'ERROR';
      default: return 'UNKNOWN';
    }
  }

  private getLevelColor(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG: return '\x1b[36m'; // Cyan
      case LogLevel.INFO: return '\x1b[32m';  // Green
      case LogLevel.WARN: return '\x1b[33m';  // Yellow
      case LogLevel.ERROR: return '\x1b[31m'; // Red
      default: return '\x1b[0m';
    }
  }

  private pruneCompletedRequestContexts(): void {
    const now = Date.now();
    for (const [requestId, snapshot] of this.completedRequestContexts.entries()) {
      if (now - snapshot.completedAt > this.snapshotTtlMs) {
        this.completedRequestContexts.delete(requestId);
      }
    }
  }

  private log(level: LogLevel, category: string, message: string, metadata?: Record<string, unknown>, requestId?: string): void {
    if (level < this.logLevel) return;

    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level,
      levelName: this.getLevelName(level),
      category,
      message,
      metadata,
      requestId,
    };

    // Console output with colors
    const color = this.getLevelColor(level);
    const reset = '\x1b[0m';
    const dim = '\x1b[2m';
    
    let logLine = `${dim}[${entry.timestamp}]${reset} ${color}[${entry.levelName}]${reset} ${dim}[${category}]${reset}`;
    
    if (requestId) {
      logLine += ` ${dim}(${requestId.substring(0, 8)})${reset}`;
    }
    
    logLine += ` ${message}`;

    if (metadata && Object.keys(metadata).length > 0) {
      // Format metadata nicely
      const metaStr = Object.entries(metadata)
        .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join(' | ');
      logLine += ` ${dim}{ ${metaStr} }${reset}`;
    }

    console.log(logLine);

    // Write to all log file
    this.writeToFile(this.allLogStream, entry);

    // Write errors to error log file
    if (level >= LogLevel.ERROR) {
      this.writeToFile(this.errorLogStream, entry);
    }

    // Emit event for external log handlers
    this.emit('log', entry);
  }

  // Public logging methods
  debug(category: string, message: string, metadata?: Record<string, unknown>, requestId?: string): void {
    this.log(LogLevel.DEBUG, category, message, metadata, requestId);
  }

  info(category: string, message: string, metadata?: Record<string, unknown>, requestId?: string): void {
    this.log(LogLevel.INFO, category, message, metadata, requestId);
  }

  warn(category: string, message: string, metadata?: Record<string, unknown>, requestId?: string): void {
    this.log(LogLevel.WARN, category, message, metadata, requestId);
  }

  error(category: string, message: string, metadata?: Record<string, unknown>, requestId?: string): void {
    this.log(LogLevel.ERROR, category, message, metadata, requestId);
  }

  // Request tracking
  startRequest(requestId: string, endpoint: string, method: string): RequestContext {
    const existing = this.requestContexts.get(requestId);
    if (existing) {
      return existing;
    }

    const completed = this.completedRequestContexts.get(requestId);
    if (completed) {
      return completed.context;
    }

    const context: RequestContext = {
      requestId,
      startTime: Date.now(),
      endpoint,
      method,
      steps: [],
      llmCalls: [],
      totalCost: 0,
      totalTokens: 0,
    };

    this.requestContexts.set(requestId, context);
    this.globalStats.totalRequests++;

    this.info('REQUEST', `▶ Started: ${method} ${endpoint}`, {
      requestId: requestId.substring(0, 8),
    }, requestId);

    return context;
  }

  endRequest(requestId: string, status: 'success' | 'error', statusCode?: number): void {
    this.pruneCompletedRequestContexts();

    const context = this.requestContexts.get(requestId);
    if (!context) return;

    const duration = Date.now() - context.startTime;
    context.endTime = Date.now();
    context.duration = duration;
    context.status = status;
    context.statusCode = statusCode;
    this.globalStats.totalDuration += duration;

    const symbol = status === 'success' ? '✓' : '✗';
    const logMethod = status === 'success' ? 'info' : 'error';

    this[logMethod]('REQUEST', `${symbol} Completed: ${context.method} ${context.endpoint}`, {
      status,
      statusCode,
      duration: this.formatDuration(duration),
      steps: context.steps.length,
      llmCalls: context.llmCalls.length,
      totalTokens: context.totalTokens,
      totalCost: `$${context.totalCost.toFixed(6)}`,
    }, requestId);

    // Log summary
    this.logRequestSummary(context, duration);

    this.completedRequestContexts.set(requestId, {
      context: { ...context, llmCalls: [...context.llmCalls], steps: [...context.steps] },
      completedAt: Date.now(),
    });
    this.requestContexts.delete(requestId);
  }

  private logRequestSummary(context: RequestContext, totalDuration: number): void {
    console.log('\n' + '─'.repeat(80));
    console.log(`📊 REQUEST SUMMARY [${context.requestId.substring(0, 8)}]`);
    console.log('─'.repeat(80));
    console.log(`   Endpoint:      ${context.method} ${context.endpoint}`);
    console.log(`   Total Duration: ${this.formatDuration(totalDuration)}`);
    console.log(`   Steps:         ${context.steps.length}`);
    console.log(`   LLM Calls:     ${context.llmCalls.length}`);
    
    if (context.llmCalls.length > 0) {
      console.log('\n   📈 LLM Usage:');
      context.llmCalls.forEach((call, i) => {
        console.log(`      [${i + 1}] ${call.model} (${call.status})`);
        console.log(`          Tokens: ${call.promptTokens} in / ${call.completionTokens} out = ${call.totalTokens} total`);
        console.log(`          Cost:   $${call.cost.toFixed(6)}`);
        console.log(`          Time:   ${this.formatDuration(call.duration)}`);
        if (call.errorMessage) {
          console.log(`          Error:  ${call.errorMessage}`);
        }
      });
      console.log(`\n   💰 Total Cost:   $${context.totalCost.toFixed(6)}`);
      console.log(`   🔢 Total Tokens: ${context.totalTokens}`);
    }

    if (context.steps.length > 0) {
      console.log('\n   📋 Steps:');
      context.steps.forEach((step) => {
        const statusIcon = step.status === 'completed' ? '✓' : step.status === 'failed' ? '✗' : '○';
        const duration = step.duration ? this.formatDuration(step.duration) : 'N/A';
        console.log(`      [${step.step}] ${statusIcon} ${step.name} (${duration})`);
      });
    }

    console.log('─'.repeat(80) + '\n');

    // Write to dedicated request log file
    this.writeToFile(this.requestLogStream, {
      timestamp: this.formatTimestamp(),
      requestId: context.requestId,
      endpoint: context.endpoint,
      method: context.method,
      status: context.status,
      statusCode: context.statusCode,
      duration: totalDuration,
      formattedDuration: this.formatDuration(totalDuration),
      stepsCount: context.steps.length,
      llmCallsCount: context.llmCalls.length,
      totalTokens: context.totalTokens,
      totalCost: context.totalCost,
      formattedCost: `$${context.totalCost.toFixed(6)}`,
      steps: context.steps.map(s => ({
        step: s.step,
        name: s.name,
        status: s.status,
        duration: s.duration,
      })),
      llmCalls: context.llmCalls.map(c => ({
        status: c.status,
        model: c.model,
        provider: c.provider,
        promptTokens: c.promptTokens,
        completionTokens: c.completionTokens,
        totalTokens: c.totalTokens,
        cost: c.cost,
        duration: c.duration,
        errorMessage: c.errorMessage,
      })),
    });
  }

  // Step tracking
  startStep(requestId: string, stepName: string): number {
    const context = this.requestContexts.get(requestId);
    if (!context) return 0;

    const stepNumber = context.steps.length + 1;
    const step: StepLog = {
      step: stepNumber,
      name: stepName,
      startTime: Date.now(),
      status: 'started',
    };

    context.steps.push(step);

    this.debug('STEP', `[${stepNumber}] Started: ${stepName}`, undefined, requestId);

    return stepNumber;
  }

  endStep(requestId: string, stepNumber: number, status: 'completed' | 'failed' = 'completed', metadata?: Record<string, unknown>): void {
    const context = this.requestContexts.get(requestId);
    if (!context) return;

    const step = context.steps.find(s => s.step === stepNumber);
    if (!step) return;

    step.endTime = Date.now();
    step.duration = step.endTime - step.startTime;
    step.status = status;
    step.metadata = metadata;

    const symbol = status === 'completed' ? '✓' : '✗';
    this.debug('STEP', `[${stepNumber}] ${symbol} ${step.name}`, {
      duration: this.formatDuration(step.duration),
      ...metadata,
    }, requestId);
  }

  // LLM call tracking
  logLLMCall(input: LogLLMCallInput): LLMUsage {
    const effectiveRequestId = input.requestId || getCurrentRequestId() || `untracked_${Date.now()}`;
    const status = input.status || 'success';
    const promptTokens = input.promptTokens;
    const completionTokens = input.completionTokens;
    const totalTokens = promptTokens + completionTokens;
    const cost = this.calculateCost(input.model, promptTokens, completionTokens);
    const responsePreview = input.responseText
      ? this.truncateForLog(input.responseText, this.maxLoggedResponseChars).value
      : null;
    const errorMessage = input.errorMessage
      ? this.truncateForLog(input.errorMessage, this.maxLoggedResponseChars).value
      : null;

    const usage: LLMUsage = {
      promptTokens,
      completionTokens,
      totalTokens,
      model: input.model,
      provider: input.provider,
      cost,
      duration: input.duration,
      status,
      requestMessages: this.sanitizeMessages(input.messages),
      requestOptions: this.sanitizeOptions(input.options),
      responsePreview,
      errorMessage,
    };

    const context = this.requestContexts.get(effectiveRequestId);
    if (context) {
      context.llmCalls.push(usage);
      context.totalCost += cost;
      context.totalTokens += totalTokens;
    }

    this.globalStats.totalLLMCalls++;
    this.globalStats.totalTokens += totalTokens;
    this.globalStats.totalCost += cost;

    const logMethod = status === 'success' ? 'info' : 'error';
    this[logMethod]('LLM', status === 'success' ? 'API call completed' : 'API call failed', {
      model: input.model,
      provider: input.provider,
      status,
      tokens: `${promptTokens}/${completionTokens}/${totalTokens}`,
      cost: `$${cost.toFixed(6)}`,
      duration: this.formatDuration(input.duration),
      error: errorMessage || undefined,
    }, effectiveRequestId);

    this.writeToFile(this.llmLogStream, {
      timestamp: this.formatTimestamp(),
      requestId: effectiveRequestId,
      ...usage,
      formattedCost: `$${cost.toFixed(6)}`,
      formattedDuration: this.formatDuration(input.duration),
    });

    return usage;
  }

  calculateCost(model: string, promptTokens: number, completionTokens: number): number {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['default'];
    const inputCost = (promptTokens / 1_000_000) * pricing.input;
    const outputCost = (completionTokens / 1_000_000) * pricing.output;
    return inputCost + outputCost;
  }

  // Agent logging
  logAgentStart(requestId: string, agentName: string, input: Record<string, unknown>): void {
    this.info('AGENT', `🤖 ${agentName} started`, {
      inputSize: JSON.stringify(input).length,
    }, requestId);
  }

  logAgentEnd(requestId: string, agentName: string, success: boolean, outputSize?: number): void {
    const symbol = success ? '✓' : '✗';
    this.info('AGENT', `${symbol} ${agentName} completed`, {
      success,
      outputSize,
    }, requestId);
  }

  // PDF parsing logging
  logPDFParse(requestId: string, fileSize: number, extractedChars: number, duration: number): void {
    this.info('PDF', `Parsed PDF document`, {
      fileSize: `${(fileSize / 1024).toFixed(1)}KB`,
      extractedChars,
      duration: this.formatDuration(duration),
    }, requestId);
  }

  // Language detection logging
  logLanguageDetection(requestId: string, detectedLanguage: string, confidence: string): void {
    this.debug('LANGUAGE', `Detected language: ${detectedLanguage}`, {
      confidence,
    }, requestId);
  }

  /**
   * Return aggregated token/cost data for a request so the usage tracker
   * middleware can persist it to the database.
   */
  getRequestContext(requestId: string): {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    totalCost: number;
    lastModel: string | null;
    lastProvider: string | null;
  } | null {
    const snapshot = this.getRequestSnapshot(requestId);
    if (!snapshot) return null;

    return {
      promptTokens: snapshot.promptTokens,
      completionTokens: snapshot.completionTokens,
      totalTokens: snapshot.totalTokens,
      totalCost: snapshot.totalCost,
      lastModel: snapshot.lastModel,
      lastProvider: snapshot.lastProvider,
    };
  }

  hasActiveRequestContext(requestId: string): boolean {
    return this.requestContexts.has(requestId);
  }

  getRequestSnapshot(requestId: string): RequestUsageSnapshot | null {
    this.pruneCompletedRequestContexts();

    const ctx = this.requestContexts.get(requestId) ?? this.completedRequestContexts.get(requestId)?.context;
    if (!ctx) return null;

    let promptTokens = 0;
    let completionTokens = 0;
    let lastModel: string | null = null;
    let lastProvider: string | null = null;

    for (const call of ctx.llmCalls) {
      promptTokens += call.promptTokens;
      completionTokens += call.completionTokens;
      lastModel = call.model;
      lastProvider = call.provider;
    }

    const now = Date.now();
    const durationMs = ctx.duration ?? ((ctx.endTime ?? now) - ctx.startTime);

    return {
      requestId: ctx.requestId,
      endpoint: ctx.endpoint,
      method: ctx.method,
      durationMs,
      promptTokens,
      completionTokens,
      totalTokens: ctx.totalTokens,
      totalCost: ctx.totalCost,
      lastModel,
      lastProvider,
      llmCallsCount: ctx.llmCalls.length,
      llmCalls: [...ctx.llmCalls],
      startedAt: new Date(ctx.startTime).toISOString(),
      endedAt: ctx.endTime ? new Date(ctx.endTime).toISOString() : undefined,
      status: ctx.status,
      statusCode: ctx.statusCode,
    };
  }

  // Get global statistics
  getGlobalStats(): typeof this.globalStats {
    return { ...this.globalStats };
  }

  // Print global stats summary
  printGlobalStats(): void {
    console.log('\n' + '═'.repeat(80));
    console.log('📊 GLOBAL STATISTICS');
    console.log('═'.repeat(80));
    console.log(`   Total Requests:  ${this.globalStats.totalRequests}`);
    console.log(`   Total LLM Calls: ${this.globalStats.totalLLMCalls}`);
    console.log(`   Total Tokens:    ${this.globalStats.totalTokens.toLocaleString()}`);
    console.log(`   Total Cost:      $${this.globalStats.totalCost.toFixed(4)}`);
    console.log(`   Total Duration:  ${this.formatDuration(this.globalStats.totalDuration)}`);
    if (this.globalStats.totalRequests > 0) {
      console.log(`   Avg per Request: ${this.formatDuration(this.globalStats.totalDuration / this.globalStats.totalRequests)}`);
    }
    console.log('═'.repeat(80) + '\n');
  }
}

// Singleton instance
export const logger = new LoggerService();

// Request ID generator
export function generateRequestId(): string {
  const currentRequestId = getCurrentRequestId();
  if (currentRequestId) return currentRequestId;
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
