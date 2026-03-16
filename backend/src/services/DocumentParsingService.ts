import { pdfService } from './PDFService.js';
import { logger } from './LoggerService.js';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

export type SupportedFormat = 'pdf' | 'docx' | 'xlsx' | 'csv' | 'txt' | 'md' | 'json' | 'unknown';

/**
 * Unified document parsing service that extracts text from PDF, DOCX, XLSX, and TXT files.
 * Supports i18n / UTF-8 content (CJK, accented characters, etc.)
 * All methods propagate requestId for end-to-end logging.
 */
export class DocumentParsingService {
  /**
   * Detect the format from MIME type or file extension.
   */
  detectFormat(mimetype: string, filename?: string): SupportedFormat {
    const mime = (mimetype || '').toLowerCase();
    if (mime === 'application/pdf') return 'pdf';
    if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mime === 'application/msword'
    ) return 'docx';
    if (
      mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mime === 'application/vnd.ms-excel'
    ) return 'xlsx';
    if (mime === 'text/csv' || mime === 'application/csv') return 'csv';
    if (mime === 'text/plain') return 'txt';
    if (mime === 'text/markdown' || mime === 'text/x-markdown' || mime === 'application/x-markdown') return 'md';
    if (mime === 'application/json') return 'json';

    // Fallback: check file extension
    if (filename) {
      const ext = filename.toLowerCase().split('.').pop();
      if (ext === 'pdf') return 'pdf';
      if (ext === 'docx' || ext === 'doc') return 'docx';
      if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
      if (ext === 'csv') return 'csv';
      if (ext === 'txt') return 'txt';
      if (ext === 'md' || ext === 'markdown') return 'md';
      if (ext === 'json') return 'json';
    }

    return 'unknown';
  }

  static isAcceptedUpload(mimetype: string, filename?: string): boolean {
    const parser = new DocumentParsingService();
    return parser.detectFormat(mimetype, filename) !== 'unknown';
  }

  /**
   * Extract text from a file buffer based on its format.
   * Logs every step for debuggability.
   */
  async extractText(buffer: Buffer, mimetype: string, filename?: string, requestId?: string): Promise<string> {
    const format = this.detectFormat(mimetype, filename);

    logger.info('DOC_PARSE', `Starting extraction: format=${format}`, {
      filename, mimetype, bufferSize: buffer.length,
    }, requestId);

    const startTime = Date.now();

    try {
      let text: string;

      switch (format) {
        case 'pdf':
          logger.info('DOC_PARSE', 'Delegating to PDFService.extractText (with LLM vision fallback)', {}, requestId);
          text = await pdfService.extractText(buffer, requestId);
          break;
        case 'docx':
          text = await this.extractDocx(buffer, requestId);
          break;
        case 'xlsx':
          text = this.extractXlsx(buffer, requestId);
          break;
        case 'csv':
          text = this.extractCsv(buffer, requestId);
          break;
        case 'txt':
          text = this.extractTxt(buffer, requestId);
          break;
        case 'md':
          text = this.extractMarkdown(buffer, requestId);
          break;
        case 'json':
          text = this.extractJson(buffer, requestId);
          break;
        default:
          throw new Error(`Unsupported file format: ${mimetype} (detected: ${format})`);
      }

      const elapsedMs = Date.now() - startTime;
      logger.info('DOC_PARSE', `Extraction complete: ${text.length} chars in ${elapsedMs}ms`, {
        format, chars: text.length, lines: text.split('\n').length, elapsedMs,
        preview: text.substring(0, 120),
      }, requestId);

      return text;
    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('DOC_PARSE', `Extraction failed after ${elapsedMs}ms: ${errMsg}`, {
        format, filename, elapsedMs,
        stack: error instanceof Error ? error.stack : undefined,
      }, requestId);
      throw error;
    }
  }

  /**
   * Extract text from DOCX using mammoth.
   * mammoth handles UTF-8/CJK/i18n content natively.
   */
  private async extractDocx(buffer: Buffer, requestId?: string): Promise<string> {
    logger.info('DOC_PARSE', 'Extracting DOCX with mammoth', {}, requestId);

    if (buffer.length < 2 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new Error('Legacy .doc files are not supported yet. Please save the Word document as .docx and upload again.');
    }

    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();

    if (result.messages?.length) {
      logger.warn('DOC_PARSE', `mammoth warnings: ${result.messages.length}`, {
        warnings: result.messages.slice(0, 5).map(m => m.message),
      }, requestId);
    }

    if (!text) {
      logger.warn('DOC_PARSE', 'mammoth returned empty text', {}, requestId);
      throw new Error('No text content found in DOCX file');
    }

    logger.info('DOC_PARSE', `DOCX extracted: ${text.length} chars`, {}, requestId);
    return text;
  }

  /**
   * Extract text from XLSX (Excel) spreadsheets.
   * Reads all sheets and concatenates cell values.
   */
  private extractXlsx(buffer: Buffer, requestId?: string): string {
    logger.info('DOC_PARSE', 'Extracting XLSX', {}, requestId);
    const workbook = XLSX.read(buffer, { type: 'buffer', codepage: 65001 /* UTF-8 */ });

    const parts: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      if (workbook.SheetNames.length > 1) {
        parts.push(`[${sheetName}]`);
      }

      for (const row of rows) {
        const line = row
          .map((cell) => String(cell ?? '').trim())
          .filter(Boolean)
          .join('\t');
        if (line) parts.push(line);
      }

      parts.push('');
    }

    const text = parts.join('\n').trim();
    if (!text) {
      throw new Error('No text content found in Excel file');
    }

    logger.info('DOC_PARSE', `XLSX extracted: ${text.length} chars, ${workbook.SheetNames.length} sheets`, {}, requestId);
    return text;
  }

  /**
   * Extract text from CSV files as plain text.
   */
  private extractCsv(buffer: Buffer, requestId?: string): string {
    logger.info('DOC_PARSE', 'Extracting CSV as text', {}, requestId);
    const text = buffer.toString('utf-8');
    if (!text.trim()) throw new Error('CSV file is empty');
    logger.info('DOC_PARSE', `CSV extracted: ${text.length} chars`, {}, requestId);
    return text;
  }

  /**
   * Extract text from plain text files.
   * Tries UTF-8 first, falls back to Latin-1.
   */
  private extractTxt(buffer: Buffer, requestId?: string): string {
    let text = buffer.toString('utf-8');

    if (text.includes('\uFFFD')) {
      logger.info('DOC_PARSE', 'UTF-8 decode had replacement chars, falling back to Latin-1', {}, requestId);
      text = buffer.toString('latin1');
    }

    return text.trim();
  }

  /**
   * Extract text from Markdown files.
   */
  private extractMarkdown(buffer: Buffer, requestId?: string): string {
    const raw = this.extractTxt(buffer, requestId);
    return DocumentParsingService.stripMarkdown(raw);
  }

  /**
   * Strip markdown formatting from text, returning plain text.
   */
  static stripMarkdown(text: string): string {
    return text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/(\*{1,3}|_{1,3})([^*_]+)\1/g, '$2')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/^[-*_]{3,}\s*$/gm, '')
      .replace(/^>\s?/gm, '')
      .replace(/^[\s]*[-*+]\s+/gm, '')
      .replace(/^[\s]*\d+\.\s+/gm, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Extract readable text from JSON files.
   */
  private extractJson(buffer: Buffer, requestId?: string): string {
    const raw = buffer.toString('utf-8').trim();
    try {
      const parsed = JSON.parse(raw);
      const flattened = DocumentParsingService.flattenJson(parsed);
      logger.info('DOC_PARSE', `JSON extracted and flattened: ${flattened.length} chars`, {}, requestId);
      return flattened;
    } catch {
      logger.warn('DOC_PARSE', 'JSON parse failed, returning raw text', {}, requestId);
      return raw;
    }
  }

  /**
   * Flatten a JSON value into human-readable text.
   */
  static flattenJson(value: unknown): string {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      if ('data' in obj && obj.data && typeof obj.data === 'object') {
        value = obj.data;
      }
    }

    const lines: string[] = [];

    const walk = (v: unknown, prefix: string) => {
      if (v === null || v === undefined || v === '') return;
      if (typeof v === 'string') {
        lines.push(prefix ? `${prefix}: ${v}` : v);
      } else if (typeof v === 'number' || typeof v === 'boolean') {
        lines.push(prefix ? `${prefix}: ${v}` : String(v));
      } else if (Array.isArray(v)) {
        for (const item of v) {
          walk(item, prefix);
        }
      } else if (typeof v === 'object') {
        for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
          walk(child, prefix ? `${prefix} > ${k}` : k);
        }
      }
    };

    walk(value, '');
    return lines.join('\n').trim() || JSON.stringify(value, null, 2);
  }

  /**
   * Detect and clean JSON or markdown from arbitrary text input.
   */
  static cleanTextContent(text: string): string {
    if (!text || typeof text !== 'string') return text;
    const trimmed = text.trim();

    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        const flattened = DocumentParsingService.flattenJson(parsed);
        if (flattened) return flattened;
      } catch {
        // Not valid JSON, continue
      }
    }

    const mdMarkers = (trimmed.match(/^#{1,6}\s|```|\*\*|__|\[.+\]\(.+\)/gm) || []).length;
    if (mdMarkers >= 3) {
      return DocumentParsingService.stripMarkdown(trimmed);
    }

    return trimmed;
  }

  /**
   * List of accepted MIME types for multer fileFilter.
   */
  static ACCEPTED_MIMES = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/csv',
    'text/plain',
    'text/markdown',
    'application/json',
  ]);
}

export const documentParsingService = new DocumentParsingService();
