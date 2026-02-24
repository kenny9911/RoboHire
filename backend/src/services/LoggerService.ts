import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

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
  private logLevel: LogLevel;
  private requestContexts: Map<string, RequestContext> = new Map();
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
    const context = this.requestContexts.get(requestId);
    if (!context) return;

    const duration = Date.now() - context.startTime;
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
        console.log(`      [${i + 1}] ${call.model}`);
        console.log(`          Tokens: ${call.promptTokens} in / ${call.completionTokens} out = ${call.totalTokens} total`);
        console.log(`          Cost:   $${call.cost.toFixed(6)}`);
        console.log(`          Time:   ${this.formatDuration(call.duration)}`);
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
        model: c.model,
        provider: c.provider,
        promptTokens: c.promptTokens,
        completionTokens: c.completionTokens,
        totalTokens: c.totalTokens,
        cost: c.cost,
        duration: c.duration,
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
  logLLMCall(
    requestId: string,
    model: string,
    provider: string,
    promptTokens: number,
    completionTokens: number,
    duration: number
  ): LLMUsage {
    const totalTokens = promptTokens + completionTokens;
    const cost = this.calculateCost(model, promptTokens, completionTokens);

    const usage: LLMUsage = {
      promptTokens,
      completionTokens,
      totalTokens,
      model,
      provider,
      cost,
      duration,
    };

    // Update request context
    const context = this.requestContexts.get(requestId);
    if (context) {
      context.llmCalls.push(usage);
      context.totalCost += cost;
      context.totalTokens += totalTokens;
    }

    // Update global stats
    this.globalStats.totalLLMCalls++;
    this.globalStats.totalTokens += totalTokens;
    this.globalStats.totalCost += cost;

    this.info('LLM', `API call completed`, {
      model,
      provider,
      tokens: `${promptTokens}/${completionTokens}/${totalTokens}`,
      cost: `$${cost.toFixed(6)}`,
      duration: this.formatDuration(duration),
    }, requestId);

    // Write to dedicated LLM log file
    this.writeToFile(this.llmLogStream, {
      timestamp: this.formatTimestamp(),
      requestId,
      ...usage,
      formattedCost: `$${cost.toFixed(6)}`,
      formattedDuration: this.formatDuration(duration),
    });

    return usage;
  }

  private calculateCost(model: string, promptTokens: number, completionTokens: number): number {
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
    const ctx = this.requestContexts.get(requestId);
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

    return {
      promptTokens,
      completionTokens,
      totalTokens: ctx.totalTokens,
      totalCost: ctx.totalCost,
      lastModel,
      lastProvider,
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
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
