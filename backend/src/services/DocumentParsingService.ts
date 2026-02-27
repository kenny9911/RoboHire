import { pdfService } from './PDFService.js';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

export type SupportedFormat = 'pdf' | 'docx' | 'xlsx' | 'txt' | 'unknown';

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

    // Fallback: check file extension
    if (filename) {
      const ext = filename.toLowerCase().split('.').pop();
      if (ext === 'pdf') return 'pdf';
      if (ext === 'docx' || ext === 'doc') return 'docx';
      if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
      if (ext === 'txt') return 'txt';
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
   * List of accepted MIME types for multer fileFilter.
   */
  static ACCEPTED_MIMES = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/plain',
  ]);
}

export const documentParsingService = new DocumentParsingService();
