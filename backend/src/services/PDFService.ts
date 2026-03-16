import pdf from 'pdf-parse';
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

    return false;
  }

  /**
   * Clean up extracted text by removing garbled characters
   */
  private cleanText(text: string): string {
    let cleaned = text;

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
    if (nonLatinCount > 50 && commonCjkCount < nonLatinCount * 0.3) {
      logger.info('PDF_QUALITY', 'Quality check FAIL: low common CJK ratio', {}, requestId);
      return false;
    }

    if ((hasEmail || hasPhone) && commonCjkCount < 10 && nonLatinCount > 100) {
      logger.info('PDF_QUALITY', 'Quality check FAIL: contact info readable but text garbled', {}, requestId);
      return false;
    }

    logger.info('PDF_QUALITY', 'Quality check PASS', { totalChars, commonCjkCount, latinCount }, requestId);
    return true;
  }

  /**
   * Extract text from a PDF by sending the raw PDF only when we can talk to
   * Gemini directly. Generic OpenAI-style chat providers do not reliably
   * support PDF data URIs, so this path is provider-aware by design.
   */
  async extractTextWithDirectLLM(buffer: Buffer, requestId?: string): Promise<string> {
    if (!this.getDirectGoogleVisionProvider()) {
      throw new Error('Direct PDF extraction requires direct Google Gemini access');
    }

    const base64Pdf = buffer.toString('base64');
    const sizeKB = Math.round(buffer.length / 1024);

    logger.info('PDF_LLM', `Sending raw PDF directly to LLM (${sizeKB}KB)`, {
      sizeKB,
      visionModel: VISION_MODEL || '(default)',
    }, requestId);

    const contentParts: MessageContent = [
      {
        type: 'text' as const,
        text: `Extract ALL text content from this PDF document.
Output the text EXACTLY as it appears, preserving the original language (Chinese, Japanese, English, etc.).
Maintain the document structure with sections, headings, and bullet points.
Include ALL details: job title, company name, department, responsibilities, requirements, qualifications, skills, salary, benefits, contact info, etc.
Do NOT translate, summarize, or omit any content. Output plain text only.`,
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
  async extractTextWithVision(buffer: Buffer, requestId?: string): Promise<string> {
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
      const contentParts: MessageContent = [
        {
          type: 'text' as const,
          text: `Extract ALL text content from page ${pageNumber} of ${images.length} of this document.
Output the text EXACTLY as it appears, preserving the original language (Chinese, Japanese, English, etc.).
Maintain the document structure with sections, headings, and bullet points.
Include ALL details from this page only. Do NOT translate, summarize, or omit any content. Output plain text only.`,
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
   *   1. Try pdf-parse for quick text extraction
   *   2. If quality is good → return immediately (fastest path)
   *   3. If quality is poor → send raw PDF base64 directly to LLM (most reliable)
   *   4. If direct LLM fails → try converting to images + LLM vision (fallback)
   *   5. If all LLM methods fail → return poor-quality text as last resort
   */
  async extractText(buffer: Buffer, requestId?: string): Promise<string> {
    logger.info('PDF_EXTRACT', `Starting PDF extraction (${Math.round(buffer.length / 1024)}KB)`, {
      bufferSizeKB: Math.round(buffer.length / 1024),
    }, requestId);

    // Step 1: Try pdf-parse for quick text extraction
    let rawText = '';
    let pdfParseSuccess = false;

    try {
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        if (typeof args[0] === 'string' && args[0].includes('private use area')) return;
        originalWarn.apply(console, args);
      };

      try {
        const startTime = Date.now();
        const data = await pdf(buffer);
        rawText = this.cleanText(data.text);
        const elapsedMs = Date.now() - startTime;

        logger.info('PDF_EXTRACT', `pdf-parse completed in ${elapsedMs}ms`, {
          rawChars: data.text.length,
          cleanedChars: rawText.length,
          pages: data.numpages,
          preview: rawText.substring(0, 150),
        }, requestId);

        pdfParseSuccess = true;
      } finally {
        console.warn = originalWarn;
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.warn('PDF_EXTRACT', `pdf-parse failed: ${errMsg}`, {}, requestId);
    }

    // Step 2: If pdf-parse succeeded with good quality, return immediately
    if (pdfParseSuccess && rawText.length > 0) {
      const qualityGood = this.isExtractionQualityGood(rawText, requestId);
      if (qualityGood) {
        logger.info('PDF_EXTRACT', 'Using pdf-parse result (quality OK)', { chars: rawText.length }, requestId);
        return rawText;
      }
      logger.info('PDF_EXTRACT', 'pdf-parse quality poor, using LLM extraction', {
        rawTextLength: rawText.length,
        preview: rawText.substring(0, 200),
      }, requestId);
    }

    // Step 3: Send raw PDF directly to LLM (most reliable for CJK documents)
    let directLLMSuccess = false;
    try {
      const directText = await this.extractTextWithDirectLLM(buffer, requestId);
      if (directText && directText.trim().length > 20) {
        logger.info('PDF_EXTRACT', 'Direct LLM extraction succeeded', { chars: directText.length }, requestId);
        return directText;
      }
      logger.warn('PDF_EXTRACT', 'Direct LLM returned too-short text, trying image fallback', {
        chars: directText?.length ?? 0,
      }, requestId);
    } catch (directError) {
      const errMsg = directError instanceof Error ? directError.message : 'Unknown';
      logger.warn('PDF_EXTRACT', `Direct LLM failed: ${errMsg}, trying image fallback`, {}, requestId);
    }

    // Step 4: Fallback — convert to images + LLM vision
    if (!directLLMSuccess) {
      try {
        const visionText = await this.extractTextWithVision(buffer, requestId);
        if (visionText && visionText.trim().length > 20) {
          logger.info('PDF_EXTRACT', 'Vision extraction succeeded', { chars: visionText.length }, requestId);
          return visionText;
        }
      } catch (visionError) {
        const errMsg = visionError instanceof Error ? visionError.message : 'Unknown';
        logger.error('PDF_EXTRACT', `Vision extraction also failed: ${errMsg}`, {}, requestId);
      }
    }

    // Step 5: Last resort — return poor-quality pdf-parse text if we have anything
    if (rawText.length > 0) {
      logger.warn('PDF_EXTRACT', 'All LLM methods failed, returning poor-quality pdf-parse text', {
        chars: rawText.length,
      }, requestId);
      return rawText;
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
    try {
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        if (typeof args[0] === 'string' && args[0].includes('private use area')) return;
        originalWarn.apply(console, args);
      };

      let data: { text: string; numpages: number; info: Record<string, unknown> };
      try {
        data = await pdf(buffer);
      } finally {
        console.warn = originalWarn;
      }

      const cleanedText = this.cleanText(data.text);

      let finalText = cleanedText;
      if (!this.isExtractionQualityGood(cleanedText, requestId)) {
        logger.info('PDF_EXTRACT', 'Quality poor in extractWithMetadata, using LLM', {}, requestId);
        let directSuccess = false;
        try {
          finalText = await this.extractTextWithDirectLLM(buffer, requestId);
          directSuccess = true;
        } catch (err) {
          logger.warn('PDF_EXTRACT', `Direct LLM failed during extractWithMetadata, trying vision fallback...`, {}, requestId);
        }

        if (!directSuccess) {
          try {
            finalText = await this.extractTextWithVision(buffer, requestId);
          } catch (err) {
            logger.warn('PDF_EXTRACT', `Vision fallback also failed during extractWithMetadata, retaining cleaned text.`, {}, requestId);
            // Keep cleaned pdf-parse text
          }
        }
      }

      return {
        text: finalText,
        numPages: data.numpages,
        info: data.info || {},
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to parse PDF: ${message}`);
    }
  }
}

export const pdfService = new PDFService();
