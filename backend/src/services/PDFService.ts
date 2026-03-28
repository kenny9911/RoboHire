import pdf from 'pdf-parse';
import { spawn } from 'child_process';
import { llmService } from './llm/LLMService.js';
import { GoogleProvider } from './llm/GoogleProvider.js';
import { generateRequestId, logger } from './LoggerService.js';
import type { Message, MessageContent } from '../types/index.js';

// Vision model for PDF extraction - prefer capable vision models
const VISION_MODEL = process.env.PDF_VISION_MODEL || process.env.LLM_VISION_MODEL || '';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const PDF_LLM_MAX_TOKENS = 8000;

export class PDFService {
  private getPreferredVisionModel(): string | undefined {
    return VISION_MODEL || process.env.LLM_MODEL || undefined;
  }

  private getDirectGoogleVisionProvider(model?: string): GoogleProvider | null {
    const resolvedModel = (model || this.getPreferredVisionModel() || '').trim();
    if (!GOOGLE_API_KEY || !resolvedModel) {
      return null;
    }

    const normalized = resolvedModel.toLowerCase();
    if (!normalized.startsWith('google/') && !normalized.startsWith('gemini')) {
      return null;
    }

    return new GoogleProvider(GOOGLE_API_KEY, resolvedModel);
  }

  private async runMultimodalExtraction(messages: Message[], requestId: string | undefined, category: string): Promise<string> {
    const model = this.getPreferredVisionModel();
    const googleProvider = this.getDirectGoogleVisionProvider(model);
    const effectiveRequestId = requestId || generateRequestId();
    const startTime = Date.now();

    if (googleProvider) {
      logger.info(category, 'Using direct Google multimodal extraction', {
        model: model || '(default)',
      }, effectiveRequestId);

      try {
        const response = await googleProvider.chat(messages, {
          temperature: 0.1,
          maxTokens: PDF_LLM_MAX_TOKENS,
          requestId: effectiveRequestId,
          ...(model ? { model } : {}),
        });

        logger.logLLMCall({
          requestId: effectiveRequestId,
          model: response.model || model || 'gemini',
          provider: googleProvider.getProviderName(),
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
          duration: Date.now() - startTime,
          status: 'success',
          messages,
          options: {
            temperature: 0.1,
            maxTokens: PDF_LLM_MAX_TOKENS,
            ...(model ? { model } : {}),
          },
          responseText: response.content,
        });

        return response.content;
      } catch (error) {
        logger.logLLMCall({
          requestId: effectiveRequestId,
          model: model || 'gemini',
          provider: googleProvider.getProviderName(),
          promptTokens: 0,
          completionTokens: 0,
          duration: Date.now() - startTime,
          status: 'error',
          messages,
          options: {
            temperature: 0.1,
            maxTokens: PDF_LLM_MAX_TOKENS,
            ...(model ? { model } : {}),
          },
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
      }
    }

    logger.info(category, 'Using configured generic multimodal provider', {
      provider: llmService.getProvider(),
      model: model || '(default)',
    }, effectiveRequestId);

    return llmService.chat(messages, {
      temperature: 0.1,
      maxTokens: PDF_LLM_MAX_TOKENS,
      requestId: effectiveRequestId,
      ...(model ? { visionModel: model } : {}),
    });
  }

  /**
   * Check if a string looks like a hash/encoded garbage
   */
  private isHashLikeGarbage(str: string): boolean {
    const trimmed = str.trim();
    if (trimmed.length < 20) return false;

    const spaces = (trimmed.match(/\s/g) || []).length;
    const lowercase = (trimmed.match(/[a-z]/g) || []).length;
    const uppercase = (trimmed.match(/[A-Z]/g) || []).length;
    const digits = (trimmed.match(/[0-9]/g) || []).length;

    const alphanumericRatio = (lowercase + uppercase + digits) / trimmed.length;

    if (alphanumericRatio > 0.9 && spaces === 0 &&
        lowercase > 0 && uppercase > 0 && digits > 0 &&
        trimmed.length > 25) {
      return true;
    }

    if (trimmed.length > 30) {
      const halfLen = Math.floor(trimmed.length / 2);
      const firstHalf = trimmed.substring(0, halfLen);
      if (trimmed.includes(firstHalf + firstHalf.substring(0, 10))) {
        return true;
      }
    }

    if (/^[A-Za-z0-9+/=_-]{30,}$/.test(trimmed)) {
      return true;
    }

    // Multi-token: line is composed of space-separated hash-like tokens
    // e.g. "a744c9d5f407585e1HZ-0t-... a744c9d5f407585e1HZ-0t-..."
    if (spaces > 0 && trimmed.length > 40) {
      const tokens = trimmed.split(/\s+/);
      if (tokens.length <= 6 && tokens.every(t => /^[A-Za-z0-9+/=_-]{15,}$/.test(t))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find repeated long alphanumeric tokens that appear 3+ times — these are almost
   * certainly watermarks / tracking codes. Returns the set of such tokens so callers
   * can strip every occurrence (including fragments scattered by layout extraction).
   */
  private findWatermarkTokens(text: string): Set<string> {
    // Match tokens of 20+ chars composed of alphanumerics, hyphens, underscores
    const longTokens = text.match(/[A-Za-z0-9_-]{20,}/g) || [];
    const freq = new Map<string, number>();
    for (const token of longTokens) {
      freq.set(token, (freq.get(token) || 0) + 1);
    }
    const watermarks = new Set<string>();
    for (const [token, count] of freq) {
      if (count >= 3 && this.isHashLikeGarbage(token)) {
        watermarks.add(token);
      }
    }
    return watermarks;
  }

  /**
   * Strip all occurrences of known watermark tokens from text, including when
   * they appear as part of a longer string or on a line with other content.
   */
  private stripWatermarks(text: string, watermarks: Set<string>): string {
    if (watermarks.size === 0) return text;
    // Build a regex that matches any of the watermark strings
    const escaped = [...watermarks].map(w => w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'));
    const re = new RegExp(`\\s*(?:${escaped.join('|')})\\s*`, 'g');
    return text.replace(re, ' ');
  }

  /**
   * Clean up extracted text by removing garbled characters
   */
  private cleanText(text: string): string {
    let cleaned = text;

    // Strip repeated watermark tokens before any other processing
    const watermarks = this.findWatermarkTokens(cleaned);
    if (watermarks.size > 0) {
      cleaned = this.stripWatermarks(cleaned, watermarks);
    }

    const cjkPattern = '\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\uac00-\ud7af';

    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '');
    cleaned = cleaned.replace(/[\uFFFD\uFFFF]/g, '');
    cleaned = cleaned.replace(/[\uE000-\uF8FF]/g, '');

    cleaned = cleaned.replace(/[A-Za-z0-9_-]{25,}/g, (match) => {
      if (match.includes(' ') || match.startsWith('http')) return match;
      if (this.isHashLikeGarbage(match)) return '';
      return match;
    });

    const safeCharsPattern = new RegExp(`[^\\w\\s${cjkPattern}.,;:!?'"()\\[\\]{}<>@#$%&*+=\\-/]{3,}`, 'g');
    cleaned = cleaned.replace(safeCharsPattern, ' ');

    cleaned = cleaned.replace(/\(cid:\d+\)/g, '');
    cleaned = cleaned.replace(/\\u[0-9a-fA-F]{4}/g, '');

    const alphanumericCjkPattern = new RegExp(`[\\w${cjkPattern}]`, 'g');
    cleaned = cleaned.split('\n').map(line => {
      // Collapse whitespace first so padded table-layout lines aren't misjudged
      const trimmed = line.trim().replace(/\s+/g, ' ');
      if (this.isHashLikeGarbage(trimmed)) return '';
      const alphanumericCount = (trimmed.match(alphanumericCjkPattern) || []).length;
      const totalLength = trimmed.length;
      if (totalLength > 5 && alphanumericCount / totalLength < 0.3) return '';
      return line;
    }).join('\n');

    const lines = cleaned.split('\n');
    const seenLines = new Set<string>();
    const uniqueLines: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < 10 || !seenLines.has(trimmed)) {
        uniqueLines.push(line);
        if (trimmed.length >= 10) seenLines.add(trimmed);
      }
    }
    cleaned = uniqueLines.join('\n');

    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/^\s+|\s+$/gm, '');

    cleaned = cleaned.split('\n').filter(line => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return true;
      if (trimmed.length === 1 && /[•·○●■□▪▫]/.test(trimmed)) return false;
      if (/^\d{1,3}$/.test(trimmed)) return false;
      return true;
    }).join('\n');

    cleaned = cleaned.trim();

    return cleaned;
  }

  /**
   * Check if pdftotext binary is available on this system.
   * Caches result after first check.
   */
  private pdftotextAvailable: boolean | null = null;
  private async isPdftotextAvailable(): Promise<boolean> {
    if (this.pdftotextAvailable !== null) return this.pdftotextAvailable;
    return new Promise((resolve) => {
      const proc = spawn('pdftotext', ['-v'], { stdio: 'ignore' });
      proc.on('error', () => { this.pdftotextAvailable = false; resolve(false); });
      proc.on('close', (code) => { this.pdftotextAvailable = code === 0 || code === 99; resolve(this.pdftotextAvailable); });
    });
  }

  /**
   * Extract text from a PDF using the system pdftotext binary (poppler-utils).
   * Much better than pdf-parse for CJK text and complex layouts.
   * Pipes the PDF buffer to stdin, reads from stdout — no temp files needed.
   */
  async extractWithPdftotext(buffer: Buffer, requestId?: string, useLayout = true): Promise<string> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      // -layout preserves the visual layout (multi-column, tables) but can
      // scatter watermark characters within words on English PDFs.
      // -enc UTF-8 ensures correct CJK output.
      // '-' for both input and output means stdin/stdout.
      const args = useLayout
        ? ['-layout', '-enc', 'UTF-8', '-', '-']
        : ['-enc', 'UTF-8', '-', '-'];
      const proc = spawn('pdftotext', args);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => { stdout += data.toString('utf-8'); });
      proc.stderr.on('data', (data: Buffer) => { stderr += data.toString('utf-8'); });

      proc.on('error', (err) => {
        reject(new Error(`pdftotext spawn failed: ${err.message}`));
      });

      proc.on('close', (code) => {
        const elapsedMs = Date.now() - startTime;
        if (code !== 0) {
          reject(new Error(`pdftotext exited with code ${code}: ${stderr}`));
          return;
        }

        // Strip repeated watermark tokens before line-level cleanup
        const watermarks = this.findWatermarkTokens(stdout);
        let preClean = stdout;
        if (watermarks.size > 0) {
          preClean = this.stripWatermarks(stdout, watermarks);
        }

        // Clean watermark noise — short alphanumeric-only fragments scattered
        // by -layout mode from watermark/tracking strings like
        // "6e72aef5715f42b81HZ709S6FFRUxYW-UfOZWOeqmP7VNxNg"
        const isAlnumToken = (s: string) => /^[A-Za-z0-9+/=_-]+$/.test(s);

        const cleaned = preClean
          .split('\n')
          .filter(line => {
            const trimmed = line.trim();
            if (!trimmed) return true; // keep blank lines for structure
            // Remove full watermark/hash strings
            if (this.isHashLikeGarbage(trimmed)) return false;
            // Remove lines composed entirely of short alphanumeric tokens
            // e.g. "R Ux", "9 S6", "H Z7", "2 b8", "7 15", "N  g"
            const tokens = trimmed.split(/\s+/);
            if (tokens.every(t => t.length <= 3 && isAlnumToken(t))) return false;
            // Remove standalone single CJK page numbers
            if (/^\d{1,3}$/.test(trimmed)) return false;
            return true;
          })
          .map(line => {
            const hasCjk = /[\u4e00-\u9fff]/.test(line);
            // Strip inline watermark fragments: 1-2 char alnum tokens surrounded by 2+ spaces
            // Works for both CJK and English: "Education  Vd  Shanghai" → "Education  Shanghai"
            // Safe: normal English words have single spaces, not 2+
            let cleaned = line.replace(/\s{2,}[A-Za-z0-9]{1,2}\s{2,}/g, '  ');
            // Strip trailing watermark fragments (1-2 char for English, up to 3 for CJK)
            // e.g. "Ding Yi  W" → "Ding Yi", "崔晋闻  个人简历  O" → "崔晋闻  个人简历"
            const trailingLimit = hasCjk ? 3 : 2;
            const trailingRe = new RegExp(`(\\s{2,}[A-Za-z0-9+/=_-]{1,${trailingLimit}})+\\s*$`);
            cleaned = cleaned.replace(trailingRe, '').trimEnd();
            return cleaned;
          })
          .join('\n')
          // Repair watermark-broken English words per line.
          // After watermark chars are removed, gaps remain inside words:
          //   "P rodu c t M anager" → "Product Manager"
          //   "Co mm er c iali z ation" → "Commercialization"
          // Only apply aggressive joining on lines with 2+ single-char alpha
          // tokens (sign of watermark damage), to avoid breaking normal text.
          .split('\n').map(line => {
            const tokens = line.trim().split(/\s+/);
            const singleCharAlpha = tokens.filter(t => /^[a-zA-Z]$/.test(t)).length;
            if (singleCharAlpha < 2) return line;
            let fixed = line;
            // Multiple passes to handle chains like "er c iali z ation"
            for (let i = 0; i < 3; i++) {
              fixed = fixed.replace(/([a-z]{2,}) ([a-z]) ([a-z]{2,})/g, '$1$2$3');
            }
            // Rejoin trailing single char: "Produc t" → "Product"
            for (let i = 0; i < 3; i++) {
              fixed = fixed.replace(/([a-z]{3,}) ([a-z])\b/g, '$1$2');
            }
            // Rejoin single uppercase + lowercase: "M arketing" → "Marketing"
            fixed = fixed.replace(/\b([A-Z]) ([a-z]{2,})/g, '$1$2');
            // Rejoin 2-char prefix + fragment: "Co mmercialization" → "Commercialization"
            // Safe on damaged lines only (wouldn't run on "He went")
            fixed = fixed.replace(/\b([A-Z][a-z]) ([a-z]{2,})/g, '$1$2');
            return fixed;
          }).join('\n')
          // Strip Private Use Area characters (icon font glyphs from PDF templates)
          .replace(/[\uE000-\uF8FF]/g, '')
          // Collapse excessive blank lines
          .replace(/\n{3,}/g, '\n\n')
          // Collapse excessive horizontal whitespace (layout padding)
          .replace(/[ \t]{4,}/g, '  ')
          .trim();

        logger.info('PDF_PDFTOTEXT', `pdftotext completed in ${elapsedMs}ms (${useLayout ? 'layout' : 'raw'})`, {
          rawChars: stdout.length,
          cleanedChars: cleaned.length,
          elapsedMs,
          mode: useLayout ? 'layout' : 'raw',
          preview: cleaned.substring(0, 200),
        }, requestId);

        resolve(cleaned);
      });

      // Pipe the PDF buffer to pdftotext's stdin
      proc.stdin.write(buffer);
      proc.stdin.end();
    });
  }

  /**
   * Try pdftotext in both layout and raw modes, compare results, return the better one.
   * Layout mode preserves spatial structure (tables, columns) but can scatter watermark
   * characters within words. Raw mode extracts in content-stream order, keeping watermark
   * text on separate lines where noise filters can remove it.
   */
  private async extractBestPdftotext(buffer: Buffer, requestId?: string): Promise<string> {
    const [layoutText, rawText] = await Promise.all([
      this.extractWithPdftotext(buffer, requestId, true).catch(() => ''),
      this.extractWithPdftotext(buffer, requestId, false).catch(() => ''),
    ]);

    if (!layoutText && !rawText) {
      throw new Error('pdftotext failed in both layout and raw modes');
    }
    if (!rawText) return layoutText;
    if (!layoutText) return rawText;

    const { text: bestText, usedLayout } = this.pickBetterPdftotext(layoutText, rawText, requestId);

    // If raw mode won, check if it's missing a name that layout mode preserved.
    // Layout mode often keeps the candidate name at the top even when watermark
    // scatters elsewhere; raw mode can lose it entirely.
    if (!usedLayout) {
      const layoutName = this.findNameLineInTop(layoutText);
      const rawName = this.findNameLineInTop(rawText);
      if (layoutName && !rawName) {
        logger.info('PDF_PDFTOTEXT', `Prepending name from layout mode: "${layoutName}"`, {}, requestId);
        return layoutName + '\n' + bestText;
      }
    }

    return bestText;
  }

  /**
   * Look for a name-like line in the first 15 non-empty lines of text.
   * Returns the line if found, null otherwise.
   */
  private findNameLineInTop(text: string): string | null {
    // Only check the first 3 non-empty lines — a name is virtually always at the top.
    const topLines = text.split('\n').slice(0, 15).map(l => l.trim()).filter(Boolean).slice(0, 3);
    // English name: 2-3 capitalized words, excluding university/company names
    const englishName = topLines.find(l =>
      /^[A-Z][a-z]+ [A-Z][a-z]+(\s[A-Z][a-z]+)?$/.test(l) &&
      !/University|Institute|College|Company|Corporation|Education|Experience|School|Academy|Center|Technology|Engineering/i.test(l)
    );
    if (englishName) return englishName;
    // CJK name: 2-4 characters only
    const cjkName = topLines.find(l => /^[\u3400-\u9fff]{2,4}$/.test(l));
    if (cjkName) return cjkName;
    return null;
  }

  /**
   * Compare layout-mode vs raw-mode pdftotext output and pick the one with
   * more recognisable content.
   * - Real English words (4+ letters) are a strong signal — watermark fragments break them.
   * - CJK character count is stable across modes for CJK resumes.
   * - Resume section keywords get a bonus.
   */
  private pickBetterPdftotext(layoutText: string, rawText: string, requestId?: string): { text: string; usedLayout: boolean } {
    const contentScore = (text: string) => {
      const realWords = (text.match(/\b[a-zA-Z]{4,}\b/g) || []).length;
      const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
      const sections = (
        text.match(/\b(?:Education|Experience|Skills|Summary|Projects|University|Company|Manager|Engineer|Director|Bachelor|Master|Degree|Internship|Responsibilities|Achievements)\b/gi) || []
      ).length + (
        text.match(/(?:教育背景|教育经历|工作经历|工作经验|专业技能|项目经历|自我评价|求职意向)/g) || []
      ).length;
      return { realWords, cjk, sections, total: realWords + cjk + sections * 10 };
    };

    const layoutScore = contentScore(layoutText);
    const rawScore = contentScore(rawText);

    // For CJK-heavy text, prefer layout mode when scores are close — layout
    // preserves two-column structure and field labels, while raw mode interleaves
    // columns and breaks field labels across lines.
    const isCjkHeavy = layoutScore.cjk > 100 || rawScore.cjk > 100;
    const margin = isCjkHeavy ? 0.05 : 0; // 5% margin for CJK
    const usedLayout = layoutScore.total >= rawScore.total * (1 - margin);
    logger.info('PDF_PDFTOTEXT', `Comparing layout vs raw mode → ${usedLayout ? 'layout' : 'raw'}${isCjkHeavy ? ' (CJK layout preference)' : ''}`, {
      layout: { chars: layoutText.length, ...layoutScore },
      raw: { chars: rawText.length, ...rawScore },
    }, requestId);

    return { text: usedLayout ? layoutText : rawText, usedLayout };
  }

  /**
   * Detect if extracted text is garbled (poor extraction quality).
   */
  isExtractionQualityGood(text: string, requestId?: string): boolean {
    if (!text || text.length < 20) {
      logger.info('PDF_QUALITY', `Quality check FAIL: text too short (${text?.length ?? 0} chars)`, {}, requestId);
      return false;
    }

    const commonCjkRe = /[\u4e00-\u9fff]/g;
    const rareCjkRe = /[\u2E80-\u2EFF\u3400-\u4DBF\uA000-\uA4CF\uA490-\uA4CF\uF900-\uFAFF]/g;
    const extRareRe = /[\u1200-\u137F\u13A0-\u13FF\u1680-\u169F\u16A0-\u16FF\u1780-\u17FF\u1800-\u18AF\u1900-\u194F\u1950-\u197F\u19E0-\u19FF\u1A00-\u1A1F\u2C00-\u2C5F\u2D00-\u2D2F\u2D80-\u2DDF\uA800-\uA82F\uA840-\uA87F\uAB00-\uAB2F]/g;
    const latinRe = /[a-zA-Z0-9@.]/g;

    const commonCjkCount = (text.match(commonCjkRe) || []).length;
    const rareCjkCount = (text.match(rareCjkRe) || []).length;
    const extRareCount = (text.match(extRareRe) || []).length;
    const latinCount = (text.match(latinRe) || []).length;

    const totalChars = text.replace(/\s/g, '').length;
    if (totalChars === 0) {
      logger.info('PDF_QUALITY', 'Quality check FAIL: zero non-whitespace chars', {}, requestId);
      return false;
    }

    const hasEmail = /@\w+\.\w+/.test(text);
    const hasPhone = /\d{3,4}[-\s]?\d{3,4}[-\s]?\d{4}/.test(text);
    const garbledCharCount = rareCjkCount + extRareCount;

    logger.info('PDF_QUALITY', 'Quality analysis', {
      totalChars, commonCjkCount, rareCjkCount, extRareCount, garbledCharCount,
      latinCount, hasEmail, hasPhone,
      garbledRatio: (garbledCharCount / totalChars).toFixed(3),
      cjkRatio: (commonCjkCount / totalChars).toFixed(3),
    }, requestId);

    if (garbledCharCount > totalChars * 0.1) {
      logger.info('PDF_QUALITY', 'Quality check FAIL: high garbled char ratio', {}, requestId);
      return false;
    }

    const nonLatinCount = totalChars - latinCount;
    const latinRatio = latinCount / totalChars;
    // Only apply CJK ratio checks when text is NOT predominantly Latin/English.
    // English-only resumes have zero CJK but are perfectly valid.
    if (latinRatio < 0.5) {
      if (nonLatinCount > 50 && commonCjkCount < nonLatinCount * 0.3) {
        logger.info('PDF_QUALITY', 'Quality check FAIL: low common CJK ratio', {}, requestId);
        return false;
      }

      if ((hasEmail || hasPhone) && commonCjkCount < 10 && nonLatinCount > 100) {
        logger.info('PDF_QUALITY', 'Quality check FAIL: contact info readable but text garbled', {}, requestId);
        return false;
      }
    }

    logger.info('PDF_QUALITY', 'Quality check PASS', { totalChars, commonCjkCount, latinCount }, requestId);
    return true;
  }

  /**
   * Compare two text extractions and return which one is richer for resume parsing.
   * Counts common CJK characters, date ranges, contact signals, and resume section headers.
   * Returns 'a' if textA is better, 'b' if textB is better.
   */
  private compareExtractionQuality(textA: string, textB: string, requestId?: string): 'a' | 'b' {
    const score = (text: string) => {
      const commonCjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
      const dateRanges = (text.match(/(19|20)\d{2}[./-]\d{1,2}\s*(?:-|–|—|~|至)/g) || []).length;
      const hasEmail = /@\w+\.\w+/.test(text) ? 1 : 0;
      const hasPhone = /1[3-9]\d{9}/.test(text) ? 1 : 0;
      // Resume section headers (Chinese + English)
      const sectionHeaders = (text.match(/(?:教育背景|教育经历|工作经历|工作经验|实习经历|项目经历|项目经验|专业技能|自我评价|求职意向|荣誉奖项|获奖情况|Education|Experience|Projects|Skills)/g) || []).length;
      // Proper noun density — CJK strings of 2-8 chars between punctuation/spaces (likely names)
      const properNouns = (text.match(/[\u4e00-\u9fff]{2,8}/g) || []).length;
      // English word count — real words (4+ letters) to detect watermark damage
      const englishWords = (text.match(/\b[a-zA-Z]{4,}\b/g) || []).length;
      return {
        commonCjk,
        dateRanges,
        contacts: hasEmail + hasPhone,
        sectionHeaders,
        properNouns,
        englishWords,
        total: commonCjk * 2 + englishWords + dateRanges * 10 + (hasEmail + hasPhone) * 5 + sectionHeaders * 15 + properNouns,
      };
    };

    const scoreA = score(textA);
    const scoreB = score(textB);

    logger.info('PDF_QUALITY', 'Comparing extraction quality', {
      textA: { chars: textA.length, ...scoreA },
      textB: { chars: textB.length, ...scoreB },
      winner: scoreA.total >= scoreB.total ? 'A (pdf-parse)' : 'B (LLM)',
    }, requestId);

    return scoreA.total >= scoreB.total ? 'a' : 'b';
  }

  /**
   * Extract text from a PDF by sending the raw PDF only when we can talk to
   * Gemini directly. Generic OpenAI-style chat providers do not reliably
   * support PDF data URIs, so this path is provider-aware by design.
   */
  async extractTextWithDirectLLM(buffer: Buffer, requestId?: string, pdfParseText?: string): Promise<string> {
    if (!this.getDirectGoogleVisionProvider()) {
      throw new Error('Direct PDF extraction requires direct Google Gemini access');
    }

    const base64Pdf = buffer.toString('base64');
    const sizeKB = Math.round(buffer.length / 1024);

    logger.info('PDF_LLM', `Sending raw PDF directly to LLM (${sizeKB}KB)`, {
      sizeKB,
      visionModel: VISION_MODEL || '(default)',
      hasPdfParseRef: !!pdfParseText,
    }, requestId);

    // When pdf-parse text is available, use dual-input reconciliation:
    // The LLM uses the visual PDF for correct structure/layout, and the
    // pdf-parse text as a character-accuracy reference for proper nouns.
    const promptText = pdfParseText
      ? `Extract ALL text content from this PDF document.

IMPORTANT — DUAL-SOURCE RECONCILIATION:
I also provide raw text extracted from this PDF by a text parser (see "RAW TEXT REFERENCE" below).
The raw text has ACCURATE characters (especially proper nouns: company names, school names, project names, person names) but its STRUCTURE may be wrong (sections mixed up, columns interleaved, content out of order).

Your task:
1. Use the VISUAL LAYOUT of the PDF for correct section structure, reading order, and entry formatting.
2. Cross-reference with the RAW TEXT REFERENCE to ensure ALL proper nouns and detailed content are character-accurate. If you see a company/school/project name in the raw text that seems garbled or missing in your visual read, USE the raw text version.
3. For each work experience entry, ensure you capture: date range, company name, location, job title/role — all on one structured line.
4. For each project entry: date range, project name, role.
5. For each education entry: date range, institution name, degree, major.

Ignore any watermarks, tracking codes, or repeated alphanumeric strings — do NOT include them in the output.
Preserve the original language (Chinese, Japanese, English, etc.). Do NOT translate, summarize, or omit any content.
Output plain text only.

--- RAW TEXT REFERENCE (for character accuracy) ---
${pdfParseText.substring(0, 6000)}
--- END RAW TEXT REFERENCE ---`
      : `Extract ALL text content from this PDF document.
Output the text EXACTLY as it appears, preserving the original language (Chinese, Japanese, English, etc.).
Maintain the document structure with sections, headings, and bullet points.
IMPORTANT: Preserve ALL proper nouns exactly — company names (e.g. 蔚来汽车, 中信证券, Google), school/university names (e.g. 武汉大学, 清华大学), project names, and person names. These are critical and must not be lost or garbled.
Include ALL details: job title, company name, department, responsibilities, requirements, qualifications, skills, salary, benefits, contact info, etc.
Ignore any watermarks, tracking codes, or repeated alphanumeric strings (e.g. long hash-like strings) — do NOT include them in the output.
Do NOT translate, summarize, or omit any content. Output plain text only.`;

    const contentParts: MessageContent = [
      {
        type: 'text' as const,
        text: promptText,
      },
      {
        type: 'image_url' as const,
        image_url: { url: `data:application/pdf;base64,${base64Pdf}` },
      },
    ];

    const messages: Message[] = [
      { role: 'user', content: contentParts },
    ];

    const startTime = Date.now();

    try {
      const extractedText = await this.runMultimodalExtraction(messages, requestId, 'PDF_LLM');

      const elapsedMs = Date.now() - startTime;
      logger.info('PDF_LLM', `Direct LLM extraction completed`, {
        chars: extractedText.length,
        lines: extractedText.split('\n').length,
        elapsedMs,
        preview: extractedText.substring(0, 150),
      }, requestId);

      return extractedText;
    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('PDF_LLM', `Direct LLM extraction failed after ${elapsedMs}ms: ${errMsg}`, {
        stack: error instanceof Error ? error.stack : undefined,
      }, requestId);
      throw error;
    }
  }

  /**
   * Convert PDF pages to images and OCR them page-by-page.
   * Page-scoped extraction is slower than one giant multimodal request,
   * but it is substantially more reliable for long hiring/JD attachments.
   */
  async extractTextWithVision(buffer: Buffer, requestId?: string, pdfParseText?: string): Promise<string> {
    logger.info('PDF_VISION', 'Converting PDF pages to images for vision extraction...', {}, requestId);

    let images: Buffer[];
    try {
      const { pdf: pdfToImg } = await import('pdf-to-img');
      images = [];
      const document = await pdfToImg(buffer, { scale: 2.0 });
      for await (const image of document) {
        images.push(Buffer.from(image));
      }
      logger.info('PDF_VISION', `Converted ${images.length} pages to images`, {
        pages: images.length,
      }, requestId);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('PDF_VISION', `pdf-to-img conversion failed: ${errMsg}`, {
        stack: error instanceof Error ? error.stack : undefined,
      }, requestId);
      throw new Error(`PDF to image conversion failed: ${errMsg}`);
    }

    if (images.length === 0) {
      throw new Error('PDF has no pages to extract');
    }

    const startTime = Date.now();
    const pageTexts: string[] = [];

    for (const [index, img] of images.entries()) {
      const pageNumber = index + 1;
      const visionPrompt = pdfParseText
        ? `Extract ALL text content from page ${pageNumber} of ${images.length} of this document.

IMPORTANT — I also provide raw text extracted from this PDF by a text parser (see below).
The raw text has ACCURATE characters (especially proper nouns: company names, school names, project names) but may have wrong structure.
Use the VISUAL LAYOUT of the image for correct reading order and structure, but cross-reference with the raw text to ensure proper nouns are character-accurate.
For each work/project/education entry, capture: date range, organization name, role/degree on one structured line.
Ignore watermarks and tracking codes. Preserve original language. Output plain text only.

--- RAW TEXT REFERENCE ---
${pdfParseText.substring(0, 6000)}
--- END ---`
        : `Extract ALL text content from page ${pageNumber} of ${images.length} of this document.
Output the text EXACTLY as it appears, preserving the original language (Chinese, Japanese, English, etc.).
Maintain the document structure with sections, headings, and bullet points.
IMPORTANT: Preserve ALL proper nouns exactly — company names, school/university names, project names, and person names. These are critical and must not be lost or garbled.
Ignore any watermarks, tracking codes, or repeated alphanumeric strings — do NOT include them in the output.
Include ALL details from this page only. Do NOT translate, summarize, or omit any content. Output plain text only.`;

      const contentParts: MessageContent = [
        {
          type: 'text' as const,
          text: visionPrompt,
        },
        {
          type: 'image_url' as const,
          image_url: { url: `data:image/png;base64,${img.toString('base64')}` },
        },
      ];

      const messages: Message[] = [{ role: 'user', content: contentParts }];

      try {
        const pageText = await this.runMultimodalExtraction(messages, requestId, 'PDF_VISION');
        if (pageText.trim()) {
          pageTexts.push(pageText.trim());
        }
        logger.info('PDF_VISION', `Extracted page ${pageNumber}/${images.length}`, {
          pageNumber,
          chars: pageText.length,
        }, requestId);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.warn('PDF_VISION', `Page ${pageNumber}/${images.length} extraction failed: ${errMsg}`, {
          pageNumber,
        }, requestId);
      }
    }

    if (pageTexts.length === 0) {
      throw new Error('Vision OCR returned no text for any PDF page');
    }

    const extractedText = pageTexts.join('\n\n');
    const elapsedMs = Date.now() - startTime;
    logger.info('PDF_VISION', `Vision extraction completed: ${extractedText.length} chars in ${elapsedMs}ms`, {
      pagesAttempted: images.length,
      pagesExtracted: pageTexts.length,
    }, requestId);
    return extractedText;
  }

  /**
   * Extract text content from a PDF buffer.
   * Strategy:
   *   1. Try pdftotext (poppler) — best CJK support, layout-aware, fast
   *   2. If pdftotext unavailable/fails → try pdf-parse (JS fallback)
   *   3. Quality check on best local result
   *   4. If quality poor → send PDF to LLM with local text as character reference
   *   5. Compare all results, pick the richest one
   *   6. Last resort → return whatever we have
   */
  async extractText(buffer: Buffer, requestId?: string): Promise<string> {
    logger.info('PDF_EXTRACT', `Starting PDF extraction (${Math.round(buffer.length / 1024)}KB)`, {
      bufferSizeKB: Math.round(buffer.length / 1024),
    }, requestId);

    // Step 1: Try pdftotext (poppler-utils) — best quality for CJK + complex layouts
    let localText = '';
    let localSource = '';

    if (await this.isPdftotextAvailable()) {
      try {
        localText = await this.extractBestPdftotext(buffer, requestId);
        localSource = 'pdftotext';
        logger.info('PDF_EXTRACT', `pdftotext succeeded: ${localText.length} chars`, {}, requestId);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown';
        logger.warn('PDF_EXTRACT', `pdftotext failed: ${errMsg}, falling back to pdf-parse`, {}, requestId);
      }
    } else {
      logger.info('PDF_EXTRACT', 'pdftotext not available, using pdf-parse', {}, requestId);
    }

    // Step 2: Fallback to pdf-parse if pdftotext didn't work
    if (!localText) {
      try {
        const originalWarn = console.warn;
        console.warn = (...args: unknown[]) => {
          if (typeof args[0] === 'string' && args[0].includes('private use area')) return;
          originalWarn.apply(console, args);
        };
        try {
          const startTime = Date.now();
          const data = await pdf(buffer);
          localText = this.cleanText(data.text);
          localSource = 'pdf-parse';
          logger.info('PDF_EXTRACT', `pdf-parse completed in ${Date.now() - startTime}ms`, {
            rawChars: data.text.length, cleanedChars: localText.length,
            preview: localText.substring(0, 150),
          }, requestId);
        } finally {
          console.warn = originalWarn;
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.warn('PDF_EXTRACT', `pdf-parse failed: ${errMsg}`, {}, requestId);
      }
    }

    // Step 3: Quality check — if local extraction is good, return immediately
    if (localText.length > 0 && this.isExtractionQualityGood(localText, requestId)) {
      logger.info('PDF_EXTRACT', `Using ${localSource} result (quality OK)`, { chars: localText.length }, requestId);
      return localText;
    }

    if (localText.length > 0) {
      logger.info('PDF_EXTRACT', `${localSource} quality poor, trying LLM extraction with local text as reference`, {
        localChars: localText.length,
      }, requestId);
    }

    // Step 4: LLM extraction with local text as character-accuracy reference
    const localRef = localText.length > 50 ? localText : undefined;
    let llmText = '';

    try {
      const directText = await this.extractTextWithDirectLLM(buffer, requestId, localRef);
      if (directText && directText.trim().length > 20) {
        llmText = directText;
        logger.info('PDF_EXTRACT', 'Direct LLM extraction succeeded', { chars: llmText.length }, requestId);
      }
    } catch (directError) {
      const errMsg = directError instanceof Error ? directError.message : 'Unknown';
      logger.warn('PDF_EXTRACT', `Direct LLM failed: ${errMsg}, trying image fallback`, {}, requestId);
    }

    if (!llmText) {
      try {
        const visionText = await this.extractTextWithVision(buffer, requestId, localRef);
        if (visionText && visionText.trim().length > 20) {
          llmText = visionText;
          logger.info('PDF_EXTRACT', 'Vision extraction succeeded', { chars: llmText.length }, requestId);
        }
      } catch (visionError) {
        const errMsg = visionError instanceof Error ? visionError.message : 'Unknown';
        logger.error('PDF_EXTRACT', `Vision extraction also failed: ${errMsg}`, {}, requestId);
      }
    }

    // Step 5: Pick the best result — compare local vs LLM
    if (llmText && localText.length > 0) {
      const winner = this.compareExtractionQuality(localText, llmText, requestId);
      if (winner === 'a') {
        logger.info('PDF_EXTRACT', `${localSource} richer than LLM — using ${localSource}`, {
          localChars: localText.length, llmChars: llmText.length,
        }, requestId);
        return localText;
      }
      logger.info('PDF_EXTRACT', 'LLM extraction richer — using LLM result', {
        localChars: localText.length, llmChars: llmText.length,
      }, requestId);
      return llmText;
    }

    if (llmText) return llmText;

    // Step 6: Last resort
    if (localText.length > 0) {
      logger.warn('PDF_EXTRACT', `All LLM methods failed, returning ${localSource} text`, {
        chars: localText.length,
      }, requestId);
      return localText;
    }

    throw new Error('PDF extraction failed: no text could be extracted by any method');
  }

  /**
   * Extract text and metadata from a PDF buffer
   */
  async extractWithMetadata(buffer: Buffer, requestId?: string): Promise<{
    text: string;
    numPages: number;
    info: Record<string, unknown>;
  }> {
    // We always need pdf-parse for metadata (numPages, info)
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].includes('private use area')) return;
      originalWarn.apply(console, args);
    };

    let data: { text: string; numpages: number; info: Record<string, unknown> };
    try {
      data = await pdf(buffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to parse PDF: ${message}`);
    } finally {
      console.warn = originalWarn;
    }

    // Step 1: Try pdftotext first for text extraction
    let localText = '';
    let localSource = '';

    if (await this.isPdftotextAvailable()) {
      try {
        localText = await this.extractBestPdftotext(buffer, requestId);
        localSource = 'pdftotext';
        logger.info('PDF_EXTRACT', `extractWithMetadata: pdftotext succeeded (${localText.length} chars)`, {}, requestId);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown';
        logger.warn('PDF_EXTRACT', `extractWithMetadata: pdftotext failed: ${errMsg}`, {}, requestId);
      }
    }

    // Step 2: Fallback to pdf-parse text if pdftotext didn't work
    if (!localText) {
      localText = this.cleanText(data.text);
      localSource = 'pdf-parse';
    }

    // Step 3: Quality check — if local extraction is good, return immediately
    if (localText.length > 0 && this.isExtractionQualityGood(localText, requestId)) {
      return { text: localText, numPages: data.numpages, info: data.info || {} };
    }

    // Step 4: LLM extraction with local text as character-accuracy reference
    if (localText.length > 0) {
      logger.info('PDF_EXTRACT', `extractWithMetadata: ${localSource} quality poor, trying LLM`, {}, requestId);
    }

    const localRef = localText.length > 50 ? localText : undefined;
    let llmText = '';

    try {
      llmText = await this.extractTextWithDirectLLM(buffer, requestId, localRef);
    } catch (err) {
      logger.warn('PDF_EXTRACT', 'extractWithMetadata: direct LLM failed, trying vision', {}, requestId);
    }

    if (!llmText || llmText.trim().length <= 20) {
      try {
        llmText = await this.extractTextWithVision(buffer, requestId, localRef);
      } catch (err) {
        logger.warn('PDF_EXTRACT', 'extractWithMetadata: vision also failed', {}, requestId);
      }
    }

    // Step 5: Pick the best result
    let finalText = localText;
    if (llmText && llmText.trim().length > 20 && localText.length > 0) {
      const winner = this.compareExtractionQuality(localText, llmText, requestId);
      finalText = winner === 'a' ? localText : llmText;
    } else if (llmText && llmText.trim().length > 20) {
      finalText = llmText;
    }

    return { text: finalText, numPages: data.numpages, info: data.info || {} };
  }
}

export const pdfService = new PDFService();
