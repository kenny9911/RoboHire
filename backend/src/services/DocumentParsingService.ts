import { pdfService } from './PDFService.js';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

export type SupportedFormat = 'pdf' | 'docx' | 'xlsx' | 'txt' | 'md' | 'json' | 'unknown';

/**
 * Unified document parsing service that extracts text from PDF, DOCX, XLSX, and TXT files.
 * Supports i18n / UTF-8 content (CJK, accented characters, etc.)
 */
export class DocumentParsingService {
  /**
   * Detect the format from MIME type or file extension.
   */
  detectFormat(mimetype: string, filename?: string): SupportedFormat {
    const mime = mimetype.toLowerCase();
    if (mime === 'application/pdf') return 'pdf';
    if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mime === 'application/msword'
    ) return 'docx';
    if (
      mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mime === 'application/vnd.ms-excel'
    ) return 'xlsx';
    if (mime === 'text/plain') return 'txt';
    if (mime === 'text/markdown') return 'md';
    if (mime === 'application/json') return 'json';

    // Fallback: check file extension
    if (filename) {
      const ext = filename.toLowerCase().split('.').pop();
      if (ext === 'pdf') return 'pdf';
      if (ext === 'docx' || ext === 'doc') return 'docx';
      if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
      if (ext === 'txt') return 'txt';
      if (ext === 'md' || ext === 'markdown') return 'md';
      if (ext === 'json') return 'json';
    }

    return 'unknown';
  }

  /**
   * Extract text from a file buffer based on its format.
   */
  async extractText(buffer: Buffer, mimetype: string, filename?: string): Promise<string> {
    const format = this.detectFormat(mimetype, filename);

    switch (format) {
      case 'pdf':
        return pdfService.extractText(buffer);
      case 'docx':
        return this.extractDocx(buffer);
      case 'xlsx':
        return this.extractXlsx(buffer);
      case 'txt':
        return this.extractTxt(buffer);
      case 'md':
        return this.extractMarkdown(buffer);
      case 'json':
        return this.extractJson(buffer);
      default:
        throw new Error(`Unsupported file format: ${mimetype}`);
    }
  }

  /**
   * Extract text from DOCX using mammoth.
   * mammoth handles UTF-8/CJK/i18n content natively.
   */
  private async extractDocx(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();
    if (!text) {
      throw new Error('No text content found in DOCX file');
    }
    return text;
  }

  /**
   * Extract text from XLSX (Excel) spreadsheets.
   * Reads all sheets and concatenates cell values.
   */
  private extractXlsx(buffer: Buffer): string {
    const workbook = XLSX.read(buffer, { type: 'buffer', codepage: 65001 /* UTF-8 */ });

    const parts: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      // Convert to array of arrays for clean text extraction
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

      parts.push(''); // blank line between sheets
    }

    const text = parts.join('\n').trim();
    if (!text) {
      throw new Error('No text content found in Excel file');
    }
    return text;
  }

  /**
   * Extract text from plain text files.
   * Tries UTF-8 first, falls back to Latin-1.
   */
  private extractTxt(buffer: Buffer): string {
    let text = buffer.toString('utf-8');

    // If UTF-8 decode produced replacement chars, try Latin-1
    if (text.includes('\uFFFD')) {
      text = buffer.toString('latin1');
    }

    return text.trim();
  }

  /**
   * Extract text from Markdown files.
   * Strips markdown formatting syntax, returning plain text.
   */
  private extractMarkdown(buffer: Buffer): string {
    const raw = this.extractTxt(buffer);
    return DocumentParsingService.stripMarkdown(raw);
  }

  /**
   * Strip markdown formatting from text, returning plain text.
   */
  static stripMarkdown(text: string): string {
    return text
      // Remove code blocks (``` ... ```)
      .replace(/```[\s\S]*?```/g, '')
      // Remove inline code (`code`)
      .replace(/`([^`]+)`/g, '$1')
      // Remove images ![alt](url)
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      // Convert links [text](url) to text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove heading markers (# ## ### etc.)
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bold/italic markers
      .replace(/(\*{1,3}|_{1,3})([^*_]+)\1/g, '$2')
      // Remove strikethrough ~~text~~
      .replace(/~~([^~]+)~~/g, '$1')
      // Remove horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, '')
      // Remove blockquote markers
      .replace(/^>\s?/gm, '')
      // Remove unordered list markers
      .replace(/^[\s]*[-*+]\s+/gm, '')
      // Remove ordered list markers
      .replace(/^[\s]*\d+\.\s+/gm, '')
      // Remove HTML tags
      .replace(/<[^>]+>/g, '')
      // Collapse multiple blank lines
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Extract readable text from JSON files.
   * Flattens JSON structure into human-readable key-value text.
   */
  private extractJson(buffer: Buffer): string {
    const raw = buffer.toString('utf-8').trim();
    try {
      const parsed = JSON.parse(raw);
      return DocumentParsingService.flattenJson(parsed);
    } catch {
      return raw;
    }
  }

  /**
   * Flatten a JSON value into human-readable text.
   * Unwraps common API response wrappers like { success, data }.
   */
  static flattenJson(value: unknown): string {
    // Unwrap common API response wrapper
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
   * Used to sanitize user-provided content (pasted text, uploaded content).
   */
  static cleanTextContent(text: string): string {
    if (!text || typeof text !== 'string') return text;
    const trimmed = text.trim();

    // Detect JSON: starts with { or [
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

    // Detect heavy markdown: if text has many markdown markers, strip them
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
    'text/plain',
    'text/markdown',
    'application/json',
  ]);
}

export const documentParsingService = new DocumentParsingService();
