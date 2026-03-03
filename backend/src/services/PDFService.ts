import pdf from 'pdf-parse';

export class PDFService {
  /**
   * Check if a string looks like a hash/encoded garbage
   * Examples: "5e38e336b2588dc1X1z2969FVFZwY6-Uv6bWOGinPHZNRZj"
   */
  private isHashLikeGarbage(str: string): boolean {
    const trimmed = str.trim();
    
    // Too short to be garbage hash
    if (trimmed.length < 20) return false;
    
    // Check for hash-like patterns (long alphanumeric strings with mixed case and numbers)
    // These typically have no spaces and are mostly alphanumeric with few special chars
    
    // Count character types
    const spaces = (trimmed.match(/\s/g) || []).length;
    const lowercase = (trimmed.match(/[a-z]/g) || []).length;
    const uppercase = (trimmed.match(/[A-Z]/g) || []).length;
    const digits = (trimmed.match(/[0-9]/g) || []).length;
    const special = (trimmed.match(/[-_]/g) || []).length;
    
    // Hash-like strings: mostly alphanumeric, few/no spaces, mixed case
    const alphanumericRatio = (lowercase + uppercase + digits) / trimmed.length;
    
    // If it's mostly alphanumeric (>90%) with no spaces and mixed case + digits, it's likely garbage
    if (alphanumericRatio > 0.9 && spaces === 0 && 
        lowercase > 0 && uppercase > 0 && digits > 0 &&
        trimmed.length > 25) {
      return true;
    }
    
    // Check for repeated patterns (same string repeated)
    if (trimmed.length > 30) {
      const halfLen = Math.floor(trimmed.length / 2);
      const firstHalf = trimmed.substring(0, halfLen);
      if (trimmed.includes(firstHalf + firstHalf.substring(0, 10))) {
        return true;
      }
    }
    
    // Check for base64-like patterns
    if (/^[A-Za-z0-9+/=_-]{30,}$/.test(trimmed)) {
      // Likely base64 or similar encoded string
      return true;
    }
    
    return false;
  }

  /**
   * Clean up extracted text by removing garbled characters
   * Preserves: English, Chinese (CJK), Japanese (Hiragana/Katakana), Korean (Hangul)
   */
  private cleanText(text: string): string {
    let cleaned = text;
    
    // CJK and Asian character ranges to preserve:
    // \u4e00-\u9fff - CJK Unified Ideographs (Chinese/Japanese/Korean common)
    // \u3400-\u4dbf - CJK Unified Ideographs Extension A
    // \u3000-\u303f - CJK Symbols and Punctuation (。、「」etc)
    // \u3040-\u309f - Hiragana (Japanese)
    // \u30a0-\u30ff - Katakana (Japanese)
    // \uff00-\uffef - Halfwidth and Fullwidth Forms (Chinese punctuation，。！？etc)
    // \uac00-\ud7af - Hangul Syllables (Korean)
    const cjkPattern = '\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\uac00-\ud7af';
    
    // 1. Remove control characters (except newline, tab, carriage return)
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // 2. Remove zero-width characters and other invisible Unicode
    cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '');
    
    // 3. Remove Unicode replacement character and other common garbage
    cleaned = cleaned.replace(/[\uFFFD\uFFFF]/g, '');
    
    // 4. Remove Private Use Area characters (often garbled fonts)
    cleaned = cleaned.replace(/[\uE000-\uF8FF]/g, '');
    
    // 5. Remove hash-like garbage strings (long alphanumeric without spaces)
    // Pattern: 25+ alphanumeric chars with mixed case, digits, and optional -_
    cleaned = cleaned.replace(/[A-Za-z0-9_-]{25,}/g, (match) => {
      // Keep if it looks like a real word/sentence (has spaces) or is a URL
      if (match.includes(' ') || match.startsWith('http')) return match;
      // Check if it's hash-like garbage
      if (this.isHashLikeGarbage(match)) return '';
      return match;
    });
    
    // 6. Remove excessive special character sequences (likely garbled)
    // Pattern: 3+ consecutive characters that are NOT: word chars, space, CJK, common punctuation
    const safeCharsPattern = new RegExp(`[^\\w\\s${cjkPattern}.,;:!?'"()\\[\\]{}<>@#$%&*+=\\-/]{3,}`, 'g');
    cleaned = cleaned.replace(safeCharsPattern, ' ');
    
    // 7. Fix common PDF artifacts
    cleaned = cleaned.replace(/\(cid:\d+\)/g, ''); // CID references
    cleaned = cleaned.replace(/\\u[0-9a-fA-F]{4}/g, ''); // Escaped unicode that wasn't decoded
    
    // 8. Remove lines that are hash-like garbage or mostly special characters
    const alphanumericCjkPattern = new RegExp(`[\\w${cjkPattern}]`, 'g');
    cleaned = cleaned.split('\n').map(line => {
      const trimmed = line.trim();
      
      // Check if whole line is hash-like garbage
      if (this.isHashLikeGarbage(trimmed)) {
        return '';
      }
      
      const alphanumericCount = (trimmed.match(alphanumericCjkPattern) || []).length;
      const totalLength = trimmed.length;
      // If line has content but less than 30% is alphanumeric/CJK, it's likely garbage
      if (totalLength > 5 && alphanumericCount / totalLength < 0.3) {
        return '';
      }
      return line;
    }).join('\n');
    
    // 9. Remove repeated identical lines (keep first occurrence)
    const lines = cleaned.split('\n');
    const seenLines = new Set<string>();
    const uniqueLines: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      // Allow empty lines and short lines to repeat
      if (trimmed.length < 10 || !seenLines.has(trimmed)) {
        uniqueLines.push(line);
        if (trimmed.length >= 10) {
          seenLines.add(trimmed);
        }
      }
    }
    cleaned = uniqueLines.join('\n');
    
    // 10. Normalize whitespace
    cleaned = cleaned.replace(/[ \t]+/g, ' '); // Multiple spaces/tabs to single space
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // Multiple newlines to double newline
    cleaned = cleaned.replace(/^\s+|\s+$/gm, ''); // Trim each line
    
    // 11. Remove lines that are just numbers or single characters (page numbers, bullets that got separated)
    cleaned = cleaned.split('\n').filter(line => {
      const trimmed = line.trim();
      // Keep lines that have actual content
      if (trimmed.length === 0) return true; // Keep empty lines for paragraph separation
      if (trimmed.length === 1 && /[•·○●■□▪▫]/.test(trimmed)) return false; // Remove lone bullets
      if (/^\d{1,3}$/.test(trimmed)) return false; // Remove standalone page numbers (1-999)
      return true;
    }).join('\n');
    
    // 12. Final trim
    cleaned = cleaned.trim();
    
    return cleaned;
  }

  /**
   * Extract text content from a PDF buffer
   */
  async extractText(buffer: Buffer): Promise<string> {
    try {
      // Suppress noisy "Ran out of space in font private use area" warnings from pdf-parse
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        if (typeof args[0] === 'string' && args[0].includes('private use area')) return;
        originalWarn.apply(console, args);
      };
      try {
        const data = await pdf(buffer);
        return this.cleanText(data.text);
      } finally {
        console.warn = originalWarn;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to parse PDF: ${message}`);
    }
  }

  /**
   * Extract text and metadata from a PDF buffer
   */
  async extractWithMetadata(buffer: Buffer): Promise<{
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
      try {
        const data = await pdf(buffer);
        return {
          text: this.cleanText(data.text),
          numPages: data.numpages,
          info: data.info || {},
        };
      } finally {
        console.warn = originalWarn;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to parse PDF: ${message}`);
    }
  }
}

export const pdfService = new PDFService();
