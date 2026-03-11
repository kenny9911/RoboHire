import pdf from 'pdf-parse';
import { llmService } from './llm/LLMService.js';
import { logger } from './LoggerService.js';
import type { Message, MessageContent } from '../types/index.js';

// Vision model for PDF extraction - prefer capable vision models
const VISION_MODEL = process.env.PDF_VISION_MODEL || process.env.LLM_VISION_MODEL || '';

export class PDFService {
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

    // 1. Remove control characters (except newline, tab, carriage return)
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // 2. Remove zero-width characters and other invisible Unicode
    cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '');

    // 3. Remove Unicode replacement character
    cleaned = cleaned.replace(/[\uFFFD\uFFFF]/g, '');

    // 4. Remove Private Use Area characters (often garbled fonts)
    cleaned = cleaned.replace(/[\uE000-\uF8FF]/g, '');

    // 5. Remove hash-like garbage strings
    cleaned = cleaned.replace(/[A-Za-z0-9_-]{25,}/g, (match) => {
      if (match.includes(' ') || match.startsWith('http')) return match;
      if (this.isHashLikeGarbage(match)) return '';
      return match;
    });

    // 6. Remove excessive special character sequences
    const safeCharsPattern = new RegExp(`[^\\w\\s${cjkPattern}.,;:!?'"()\\[\\]{}<>@#$%&*+=\\-/]{3,}`, 'g');
    cleaned = cleaned.replace(safeCharsPattern, ' ');

    // 7. Fix common PDF artifacts
    cleaned = cleaned.replace(/\(cid:\d+\)/g, '');
    cleaned = cleaned.replace(/\\u[0-9a-fA-F]{4}/g, '');

    // 8. Remove lines that are garbage
    const alphanumericCjkPattern = new RegExp(`[\\w${cjkPattern}]`, 'g');
    cleaned = cleaned.split('\n').map(line => {
      const trimmed = line.trim();
      if (this.isHashLikeGarbage(trimmed)) return '';
      const alphanumericCount = (trimmed.match(alphanumericCjkPattern) || []).length;
      const totalLength = trimmed.length;
      if (totalLength > 5 && alphanumericCount / totalLength < 0.3) return '';
      return line;
    }).join('\n');

    // 9. Remove repeated identical lines
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

    // 10. Normalize whitespace
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/^\s+|\s+$/gm, '');

    // 11. Remove lone bullets and page numbers
    cleaned = cleaned.split('\n').filter(line => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return true;
      if (trimmed.length === 1 && /[•·○●■□▪▫]/.test(trimmed)) return false;
      if (/^\d{1,3}$/.test(trimmed)) return false;
      return true;
    }).join('\n');

    // 12. Final trim
    cleaned = cleaned.trim();

    return cleaned;
  }

  /**
   * Detect if extracted text is garbled (poor extraction quality).
   * Returns a quality score from 0 to 1 (1 = good, 0 = completely garbled).
   */
  isExtractionQualityGood(text: string): boolean {
    if (!text || text.length < 20) return false;

    // Common CJK range (real Chinese/Japanese/Korean characters)
    const commonCjkRe = /[\u4e00-\u9fff]/g;
    // Uncommon/rare CJK blocks that pdf-parse often produces for garbled text
    // These ranges contain valid but extremely rare characters that almost never appear in resumes
    const rareCjkRe = /[\u2E80-\u2EFF\u3400-\u4DBF\uA000-\uA4CF\uA490-\uA4CF\uF900-\uFAFF]/g;
    // Extended CJK blocks (very rare in normal text)
    const extRareRe = /[\u1200-\u137F\u13A0-\u13FF\u1680-\u169F\u16A0-\u16FF\u1780-\u17FF\u1800-\u18AF\u1900-\u194F\u1950-\u197F\u19E0-\u19FF\u1A00-\u1A1F\u2C00-\u2C5F\u2D00-\u2D2F\u2D80-\u2DDF\uA800-\uA82F\uA840-\uA87F\uAB00-\uAB2F]/g;
    // Latin/ASCII readable text
    const latinRe = /[a-zA-Z0-9@.]/g;

    const commonCjkCount = (text.match(commonCjkRe) || []).length;
    const rareCjkCount = (text.match(rareCjkRe) || []).length;
    const extRareCount = (text.match(extRareRe) || []).length;
    const latinCount = (text.match(latinRe) || []).length;

    const totalChars = text.replace(/\s/g, '').length;
    if (totalChars === 0) return false;

    // If text has recognizable ASCII content (email, phone, URLs) but garbled CJK
    const hasEmail = /@\w+\.\w+/.test(text);
    const hasPhone = /\d{3,4}[-\s]?\d{3,4}[-\s]?\d{4}/.test(text);

    // Key indicator: if there are more rare/unusual Unicode chars than common CJK chars,
    // the extraction is likely garbled (font encoding issue)
    const garbledCharCount = rareCjkCount + extRareCount;

    // If garbled chars make up more than 10% of non-whitespace text, it's bad
    if (garbledCharCount > totalChars * 0.1) {
      logger.info('PDF_QUALITY', 'Text extraction quality poor: high garbled char ratio', {
        totalChars, commonCjkCount, garbledCharCount, latinCount,
      });
      return false;
    }

    // If text appears to be CJK-heavy but has very few common CJK chars, it's garbled
    const nonLatinCount = totalChars - latinCount;
    if (nonLatinCount > 50 && commonCjkCount < nonLatinCount * 0.3) {
      logger.info('PDF_QUALITY', 'Text extraction quality poor: low common CJK ratio', {
        totalChars, commonCjkCount, nonLatinCount, latinCount,
      });
      return false;
    }

    // Check for email/phone but garbled surrounding text (partial extraction)
    if ((hasEmail || hasPhone) && commonCjkCount < 10 && nonLatinCount > 100) {
      logger.info('PDF_QUALITY', 'Text extraction quality poor: contact info readable but text garbled', {
        hasEmail, hasPhone, commonCjkCount, nonLatinCount,
      });
      return false;
    }

    return true;
  }

  /**
   * Convert PDF buffer to PNG images (one per page)
   */
  async convertToImages(buffer: Buffer, scale = 2.0): Promise<Buffer[]> {
    const { pdf: pdfToImg } = await import('pdf-to-img');
    const images: Buffer[] = [];
    const document = await pdfToImg(buffer, { scale });
    for await (const image of document) {
      images.push(Buffer.from(image));
    }
    return images;
  }

  /**
   * Extract text from PDF using LLM vision (for garbled PDFs).
   * Converts pages to images and sends to a vision-capable LLM.
   */
  async extractTextWithVision(buffer: Buffer, requestId?: string): Promise<string> {
    const images = await this.convertToImages(buffer, 2.0);

    logger.info('PDF_VISION', `Converting ${images.length} PDF pages to images for vision extraction`, {}, requestId);

    // Build multimodal message with all page images
    const contentParts: MessageContent = [
      {
        type: 'text' as const,
        text: `Extract ALL text content from these resume/document page images.
Output the text exactly as it appears, preserving the original language (Chinese, English, etc.).
Maintain the document structure with sections, headings, and bullet points.
Include ALL details: name, contact info, education, experience, skills, projects, certifications, etc.
Do NOT translate, summarize, or omit any content. Output plain text only.`,
      },
    ];

    for (const img of images) {
      const base64 = img.toString('base64');
      contentParts.push({
        type: 'image_url' as const,
        image_url: { url: `data:image/png;base64,${base64}` },
      });
    }

    const messages: Message[] = [
      {
        role: 'user',
        content: contentParts,
      },
    ];

    const visionModel = VISION_MODEL || undefined;
    const extractedText = await llmService.chat(messages, {
      temperature: 0.1,
      maxTokens: 8000,
      requestId,
      visionModel: visionModel,
    });

    logger.info('PDF_VISION', `Vision extraction completed: ${extractedText.length} chars`, {}, requestId);

    return extractedText;
  }

  /**
   * Extract text content from a PDF buffer.
   * First tries direct text extraction; if quality is poor (garbled), falls back to LLM vision.
   */
  async extractText(buffer: Buffer, requestId?: string): Promise<string> {
    try {
      // Suppress noisy warnings from pdf-parse
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        if (typeof args[0] === 'string' && args[0].includes('private use area')) return;
        originalWarn.apply(console, args);
      };

      let rawText: string;
      try {
        const data = await pdf(buffer);
        rawText = this.cleanText(data.text);
      } finally {
        console.warn = originalWarn;
      }

      // Check extraction quality
      if (this.isExtractionQualityGood(rawText)) {
        return rawText;
      }

      // Text extraction is garbled — fall back to vision
      logger.info('PDF_EXTRACT', 'Text extraction garbled, falling back to LLM vision', {
        rawTextLength: rawText.length,
        rawTextPreview: rawText.substring(0, 200),
      }, requestId);

      return await this.extractTextWithVision(buffer, requestId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      // If pdf-parse fails entirely, try vision extraction
      logger.warn('PDF_EXTRACT', `pdf-parse failed: ${message}, trying vision extraction`, {}, requestId);
      try {
        return await this.extractTextWithVision(buffer, requestId);
      } catch (visionError) {
        const visionMessage = visionError instanceof Error ? visionError.message : 'Unknown error';
        throw new Error(`Failed to parse PDF (text: ${message}, vision: ${visionMessage})`);
      }
    }
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

      // Check extraction quality — if garbled, use vision
      let finalText = cleanedText;
      if (!this.isExtractionQualityGood(cleanedText)) {
        logger.info('PDF_EXTRACT', 'Text extraction garbled in extractWithMetadata, falling back to vision', {}, requestId);
        finalText = await this.extractTextWithVision(buffer, requestId);
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
