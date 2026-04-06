# Resume Parsing System — Design & Implementation Documentation

## 1. Overview

The RoboHire resume parsing system transforms unstructured resume documents (PDF, DOCX, XLSX, TXT, MD, JSON, CSV) into structured candidate data. It features a multi-layer extraction pipeline with intelligent quality checking, watermark detection, LLM vision fallback, content-hash caching, and completeness validation.

**Key Design Goals:**
- Zero information loss — extract every piece of data verbatim
- Multi-format support — handle all common resume file types
- Watermark resilience — detect and bypass scattered tracking codes
- Language preservation — maintain original CJK/non-English text
- Graceful degradation — heuristic fallbacks when LLM parsing fails

---

## 2. Architecture

```
                        ┌──────────────────────┐
                        │   POST /api/v1/      │
                        │   resumes/upload     │
                        └──────────┬───────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  DocumentParsingService     │
                    │  detectFormat() + extract() │
                    └──┬───┬───┬───┬───┬───┬──────┘
                       │   │   │   │   │   │
              ┌────────┘   │   │   │   │   └────────┐
              ▼            ▼   ▼   ▼   ▼            ▼
          ┌───────┐   ┌────┐ ┌───┐ ┌───┐ ┌────┐ ┌──────┐
          │  PDF  │   │DOCX│ │XLS│ │CSV│ │ TXT│ │ JSON │
          │Service│   │mam-│ │X  │ │   │ │ MD │ │flat- │
          │  .ts  │   │moth│ │lib│ │raw│ │raw │ │  en  │
          └───┬───┘   └────┘ └───┘ └───┘ └────┘ └──────┘
              │
    ┌─────────▼─────────-─┐
    │  PDF Extraction     │
    │  (6-Step Strategy)  │
    │                     │
    │ 1. pdftotext        │──── layout + raw modes
    │ 2. pdf-parse        │──── JS fallback
    │ 3. Quality Check    │──── garbled char ratio, CJK ratio
    │ 4. Watermark Check  │──── scatter detection (>25%)
    │ 5. LLM Vision       │──── Gemini direct PDF or page-by-page OCR
    │ 6. Compare & Pick   │──── weighted scoring
    └─────────┬─────────-─┘
              │
    ┌─────────▼────────-──┐
    │ normalizeExtracted  │
    │ Text()              │
    │ - CRLF → LF         │
    │ - bullet normalize  │
    │ - page marker strip │
    │ - gibberish filter  │
    │ - hyphenation fix   │
    └─────────┬─────────-─┘
              │
    ┌─────────▼────────-──┐
    │ Content Hash        │
    │ SHA-256 → 16 chars  │
    └─────────┬─────────-─┘
              │
    ┌─────────▼────────────────-──┐
    │  ResumeParsingCache         │
    │  getOrParseResume()         │
    │                             │
    │  1. User-scoped DB lookup   │ ←── userId + contentHash
    │  2. Global fallback lookup  │ ←── contentHash only
    │  3. Cache miss → parse      │
    └─────────┬───────────────-───┘
              │ (cache miss)
    ┌─────────▼───────────────-───┐
    │  ResumeParseAgent           │
    │                             │
    │  parse()                    │
    │  ├─ parseOnce(temp=0.1)     │ ←── LLM extraction
    │  ├─ validate completeness   │
    │  ├─ heuristic fallback      │ ←── regex-based recovery
    │  ├─ retry parseOnce(temp=0) │ ←── stricter if still sparse
    │  └─ final heuristic         │
    └─────────┬────────────────-──┘
              │
    ┌─────────▼───────────────-───┐
    │  ResumeSummaryService       │
    │  generateResumeSummary      │
    │  Highlight()                │
    │  - LLM-generated summary    │
    │  - One-line highlight       │
    │  - Low-signal detection     │
    └─────────┬─────────────────-─┘
              │
    ┌─────────▼─────────────────-─┐
    │  Store in Resume model      │
    │  - parsedData (JSON)        │
    │  - resumeText               │
    │  - summary, highlight       │
    │  - name, email, phone       │
    │  - currentRole, expYears    │
    │  - contentHash              │
    │  - originalFile metadata    │
    └─────────┬────────────────-──┘
              │
     ┌────────┴────────┐
     ▼                 ▼
┌──────────┐    ┌───────────┐
│ Resume   │    │ Job Fit   │
│ Insight  │    │ Agent     │
│ Agent    │    │           │
│ (career, │    │ (match vs │
│  salary, │    │  job      │
│  flags)  │    │  openings)│
└──────────┘    └───────────┘
```

---

## 3. File Structure

```
backend/src/
├── routes/
│   └── resumes.ts                           # Upload, reupload, reparse endpoints
├── services/
│   ├── PDFService.ts                        # PDF extraction (pdftotext, vision, watermark)
│   ├── DocumentParsingService.ts            # Multi-format dispatch (DOCX, XLSX, etc.)
│   ├── ResumeParserService.ts               # Text normalization
│   ├── ResumeParsingCache.ts                # Content-hash caching
│   ├── ResumeParseValidation.ts             # Completeness checking
│   ├── ResumeSummaryService.ts              # AI summary & highlight generation
│   ├── ResumeOriginalFileStorageService.ts  # Original file storage (S3/local)
│   └── llm/
│       ├── LLMService.ts                    # LLM provider router
│       └── GoogleProvider.ts                # Gemini multimodal support
├── agents/
│   ├── BaseAgent.ts                         # Abstract agent framework
│   ├── ResumeParseAgent.ts                  # LLM-based structured extraction
│   ├── ResumeInsightAgent.ts                # Career analysis & insights
│   └── JobFitAgent.ts                       # Resume-to-job matching
└── types/
    └── index.ts                             # ParsedResume, WorkExperience, etc.
```

---

## 4. PDF Extraction Pipeline

### 4.1 Strategy Overview

`PDFService.extractText(buffer, requestId)` implements a 6-step strategy:

```
Step 1: pdftotext (poppler)     ← Best for CJK, layout-aware, fast
   ↓ (unavailable or failed)
Step 2: pdf-parse (JS)          ← Fallback, less reliable for CJK
   ↓
Step 3: Quality + Watermark     ← Pass & no watermark? Return immediately
   ↓ (quality poor OR watermark scatter detected)
Step 4: LLM Vision              ← Direct PDF to Gemini, or page-by-page OCR
   ↓
Step 5: Compare Results         ← Weighted scoring picks richest extraction
   ↓
Step 6: Last Resort             ← Return whatever succeeded
```

### 4.2 pdftotext Extraction

`extractBestPdftotext()` runs both modes in parallel and picks the better result:

| Mode | Flag | Strengths | Weaknesses |
|------|------|-----------|------------|
| **Layout** | `-layout` | Preserves tables, columns, visual structure | Scatters watermark chars within words |
| **Raw** | (none) | Content-stream order, watermarks on separate lines | Loses multi-column structure |

**Comparison scoring** (`pickBetterPdftotext`):
- Real English words (4+ letters) — watermark damage breaks these
- CJK character count
- Resume section headers
- For CJK-heavy text: layout mode gets 5% scoring margin

**Name preservation:** If raw mode wins but layout mode has a name at top that raw doesn't, the layout name line is prepended.

### 4.3 Quality Check

`isExtractionQualityGood(text)` returns `false` if:

| Check | Threshold | Rationale |
|-------|-----------|-----------|
| Text too short | <20 chars | No meaningful content |
| Garbled char ratio | >10% | Rare CJK + exotic scripts indicate encoding failure |
| Low common CJK ratio | <30% of non-Latin chars | Text is garbled despite having CJK-looking chars |
| Contact readable but text garbled | <10 common CJK + >100 non-Latin | Email/phone extracted but body is noise |

**Character ranges:**
- Common CJK: U+4E00–U+9FFF
- Rare/garbled CJK: U+2E80–U+2EFF, U+3400–U+4DBF, U+A000–U+A4CF, U+F900–U+FAFF
- Exotic scripts: U+1200–U+137F (Ethiopic), U+1780–U+17FF (Khmer), etc.

### 4.4 Extraction Quality Comparison

`compareExtractionQuality(textA, textB)` scores both texts:

| Signal | Weight | Why |
|--------|--------|-----|
| Common CJK characters | x2 | Core content density |
| English words (4+ letters) | x1 | Real words vs watermark fragments |
| Date ranges (YYYY-MM) | x10 | Strong resume structure signal |
| Email present | x5 | Contact info integrity |
| Phone present | x5 | Contact info integrity |
| Section headers | x15 | Resume structure (教育背景, Experience, etc.) |
| Proper nouns (2-8 CJK) | x1 | Names, companies, institutions |

### 4.5 LLM Vision Extraction

Two paths, tried in order:

**Path A: Direct PDF** (`extractTextWithDirectLLM`)
- Sends raw PDF as base64 data URI to Gemini
- Requires `GOOGLE_API_KEY` + Gemini model
- When `pdfParseText` available: dual-source reconciliation — LLM uses visual layout for structure, raw text for proper noun accuracy

**Path B: Page-by-page OCR** (`extractTextWithVision`)
- Converts PDF pages to images via `pdf-to-img` (scale 2.0)
- OCR each page separately
- More reliable for long documents (>5 pages)
- Concatenates with `\n\n` separator

**Prompt strategy (both paths):**
```
Extract ALL text content from this PDF document.
Use the VISUAL LAYOUT for structure and reading order.
Cross-reference with RAW TEXT for character-accurate proper nouns.
Ignore watermarks, tracking codes, repeated alphanumeric strings.
Preserve original language. Output plain text only.
```

---

## 5. Watermark Handling

### 5.1 Problem

Many Chinese recruitment platforms embed invisible tracking/watermark strings (e.g., `2422cd62c4645d291HZ90ti8ElNZxYq6U_2YWOeqmP7VNxNg`) into PDF text layers. When `pdftotext` extracts text, these strings are **scattered as individual characters** across content lines:

```
Before (visual PDF):          After (pdftotext output):
┌─────────────────────┐      王 嘉 成
│ 王嘉成               │      P7
│ 工作经历             │      m
│ 全栈开发 - 北京       │      eq
└─────────────────────┘      工作经历
                             全栈开发 - 北京  d
                             c
                             22
```

This corrupts the text: words get split (`Chroma mP` instead of `ChromaDB`), sentences break mid-line, and the candidate name may appear at the end instead of the top.

### 5.2 Detection Mechanisms

#### Token-level detection (`findWatermarkTokens`)

Finds contiguous tokens (20+ chars) appearing 3+ times that match `isHashLikeGarbage()`:

```
isHashLikeGarbage(str) returns true if:
├─ 25+ chars, >90% alphanumeric, no spaces, has lowercase+uppercase+digits
├─ 30+ chars, self-repeating pattern (first half appears twice)
├─ 30+ chars, matches /^[A-Za-z0-9+/=_~-]{30,}$/
└─ Space-separated, ≤6 tokens, each 15+ chars of /^[A-Za-z0-9+/=_~-]{15,}$/
```

#### Scatter-level detection (`_watermarkScatterDetected`)

**Added to handle the common Chinese recruitment platform watermark pattern.**

In `extractWithPdftotext()`, before cleaning, counts standalone short fragment lines:

```
Fragment line = non-empty line where:
  - trimmed length ≤ 3 characters
  - purely alphanumeric: /^[A-Za-z0-9+/=_~-]+$/

If fragment lines > 25% of all non-empty lines → _watermarkScatterDetected = true
```

**Real-world examples:**

| Resume | Fragment Lines | Total Lines | Ratio | Detected? |
|--------|---------------|-------------|-------|-----------|
| 王嘉成 | 87 | 207 | 42% | Yes |
| 王祥雨 | 62 | ~180 | ~34% | Yes |
| 沈裕超 | 58 | 142 | 41% | Yes |
| 孙梅 | 123 | 271 | 45% | Yes |
| Normal resume | 2–5 | 100–200 | 1–3% | No |

### 5.3 Handling Strategy

When watermark scatter is detected:

```
1. Skip early return (don't trust pdftotext even if quality check passes)
   └─ Quality check passes because watermark is ASCII, not garbled CJK

2. Force LLM vision extraction
   └─ LLM vision naturally ignores visual watermark overlay
   └─ Produces clean, correctly-ordered text

3. Prefer LLM result over local (skip compareExtractionQuality)
   └─ Local text has inline fragment damage that character counts can't detect
```

### 5.4 Text Cleaning Pipeline

For non-watermark-scattered text, the cleaning pipeline handles residual noise:

```
extractWithPdftotext() cleaning:
├─ Strip full watermark tokens (findWatermarkTokens → stripWatermarks)
├─ Remove full-line hash strings (isHashLikeGarbage)
├─ Remove lines of only short alnum tokens (e.g., "R Ux", "9 S6")
├─ Remove standalone page numbers
├─ Strip inline fragments: /\s{2,}[A-Za-z0-9~]{1,2}\s{2,}/ → "  "
├─ Strip trailing fragments: /(\s{2,}[alnum]{1,2})+\s*$/
├─ Repair broken English words: "P rodu c t" → "Product"
│   ├─ /([a-z]{2,}) ([a-z]) ([a-z]{2,})/ → join
│   ├─ /([a-z]{3,}) ([a-z])\b/ → join trailing
│   ├─ /\b([A-Z]) ([a-z]{2,})/ → join uppercase prefix
│   └─ /\b([A-Z][a-z]) ([a-z]{2,})/ → join 2-char prefix
├─ Remove Private Use Area chars (U+E000–U+F8FF)
├─ Collapse blank lines (3+ → 2)
└─ Collapse horizontal whitespace (4+ spaces → 2)

cleanText() (for pdf-parse):
├─ Strip watermark tokens
├─ Remove control chars, zero-width chars, replacement chars, PUA
├─ Remove hash-like 25+ char tokens
├─ Remove non-standard char sequences (3+ chars)
├─ Remove PDF artifacts: (cid:\d+), \uXXXX
├─ Filter low-alphanumeric lines (<30%)
├─ Deduplicate lines (10+ chars)
├─ Collapse whitespace
└─ Remove bullet-only lines, numeric-only lines
```

### 5.5 Watermark Troubleshooting Guide

**Symptoms of watermark damage:**
- Name appears at the end of text instead of top
- Skills/words split with spaces: `Chroma mP` instead of `ChromaDB`
- Random 1-2 char fragments on their own lines between content
- Dates have injected characters: `2023年9月Ft - 2026年8月`
- `parsedData` has empty `education[]`, `experience[]`, weak `skills`
- Summary contains a URL or "Unable to parse resume"

**Diagnosis:**
```bash
# Check for watermark scatter
pdftotext -enc UTF-8 "resume.pdf" - | grep -c '^[A-Za-z0-9_~/-]\{1,3\}$'
# vs total lines
pdftotext -enc UTF-8 "resume.pdf" - | wc -l
# If ratio > 25%, watermark scatter is present
```

**Resolution for already-parsed resumes:**
1. If original file is stored (`originalFileProvider` not null): Click "重新解析简历" — the reparse endpoint re-extracts from original PDF using the improved pipeline
2. If original file is NOT stored: Click "上传" and re-upload the PDF file — triggers fresh extraction with watermark scatter detection
3. The watermark scatter fix automatically triggers LLM vision, producing clean text

**Prevention:**
- The `_watermarkScatterDetected` flag in PDFService ensures all future uploads with >25% fragment lines automatically use LLM vision
- Both `extractText()` and `extractWithMetadata()` respect this flag

---

## 6. Resume Parse Agent

### 6.1 LLM Extraction

**Model:** Configured via `LLM_MODEL` (default: `google/gemini-3-flash-preview`)
**Temperature:** 0.1 (first attempt), 0 (retry)
**Max tokens:** 8000

**System prompt** instructs the LLM to:
- Extract EVERY piece of information — zero loss tolerance
- Copy EXACT original text, no summarization or paraphrasing
- Preserve non-English text in original language
- Include ALL entries (every job, every education, every project)
- Map content to specific sections (Personal Info, Summary, Skills, Experience, Projects, Education, Awards, Certifications, Languages, Publications, Patents, Volunteer Work, Other)

### 6.2 Output Schema

```json
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "address": "string",
  "linkedin": "string",
  "github": "string",
  "portfolio": "string",
  "summary": "COMPLETE self-evaluation / summary text",
  "skills": {
    "technical": ["Python", "React", ...],
    "soft": ["Leadership", ...],
    "languages": ["English", ...],
    "tools": ["Docker", ...],
    "frameworks": ["LangChain", ...],
    "other": [...]
  },
  "experience": [{
    "company": "string",
    "role": "string",
    "location": "string",
    "startDate": "YYYY-MM",
    "endDate": "YYYY-MM or present",
    "duration": "string",
    "description": "ALL bullet points joined with newlines",
    "achievements": ["string"],
    "technologies": ["string"],
    "employmentType": "full-time | internship | contract | ..."
  }],
  "education": [{
    "institution": "string",
    "degree": "string",
    "field": "string",
    "startDate": "YYYY-MM",
    "endDate": "YYYY-MM",
    "gpa": "string",
    "achievements": ["string"],
    "coursework": ["string"]
  }],
  "projects": [{ "name", "role", "date", "description", "technologies[]", "link" }],
  "certifications": [{ "name", "issuer", "date" }],
  "awards": [{ "name", "issuer", "date", "description" }],
  "languages": [{ "language", "proficiency" }],
  "volunteerWork": [{ "organization", "role", "duration", "description" }],
  "publications": ["string"],
  "patents": ["string"],
  "otherSections": { "sectionName": "content" }
}
```

### 6.3 Parse Flow

```
parse(resumeText, requestId)
│
├─ parseOnce(temp=0.1)
│   ├─ Build system prompt + user message
│   ├─ LLM.chat() → JSON response
│   ├─ parseOutput() → extract JSON from markdown fences
│   └─ normalizeFields() → map alternative field names
│
├─ isParsedResumeLikelyIncomplete(result, text)?
│   ├─ YES → buildHeuristicFallback()
│   │         ├─ findName() — 4 strategies (CJK block, suffix, early, English)
│   │         ├─ findSummary() — intro lines before first date range
│   │         ├─ extractSkillsFromText() — regex for tech terms
│   │         └─ extractExperience() — date range + company/role extraction
│   │
│   ├─ Still incomplete? → parseOnce(temp=0, retry=true)
│   │   └─ Retry prompt adds: "Previous parse missed sections. Re-read ENTIRE resume."
│   │
│   └─ Still incomplete? → buildHeuristicFallback() again
│
└─ Return best result
```

### 6.4 Field Normalization

Maps LLM's alternative field names to canonical names:

| Canonical | Alternatives |
|-----------|-------------|
| `name` | `candidateName`, `fullName`, `姓名` |
| `email` | `e-mail`, `邮箱` |
| `phone` | `telephone`, `mobile`, `电话`, `手机` |
| `address` | `location`, `地址`, `现居地` |
| `institution` | `school`, `university`, `college` |
| `role` | `jobTitle`, `position`, `title` |
| `company` | `companyName`, `employer`, `organization` |

### 6.5 Heuristic Fallback

When LLM parsing produces sparse results, regex-based heuristics recover data:

**Name extraction (4 strategies):**
1. CJK name (2-4 chars) alone on a line + contact signal within 4 lines
2. Name + "个人简历"/"简历"/"resume"/"CV" suffix
3. CJK name at start of first 3 lines + contact follows
4. English name (2-3 Title Case words) near top + contact within 5 lines

**Experience extraction:**
- Regex: `/(19|20)\d{2}[./-]\d{1,2}\s*(?:-|–|—|~|至)\s*(至今|present|...|(19|20)\d{2}[./-]\d{1,2})/`
- Extracts company/role from same line or next line
- Collects description lines until next date/heading/contact
- Detects internship from keywords: 实习, intern

**Skills extraction:**
- Matches: 3+ char alphanumeric tokens (e.g., Python, React, K8S)
- Plus hardcoded CJK tech terms: 用友, 金蝶, 数据治理, etc.
- Returns top 12

---

## 7. Validation & Completeness

### 7.1 Incompleteness Detection

`isParsedResumeLikelyIncomplete(parsed, resumeText)` returns `true` if:

| Check | Condition | Rationale |
|-------|-----------|-----------|
| No data | `totalStructuredEntries === 0` | Complete parse failure |
| Education-only | Rich source but only education + contact | LLM missed most sections |
| Missing sections | Rich source but zero: skills, exp, projects, languages, pubs, awards, certs | Structural failure |
| Sparse parse | Source 600+ chars but ≤2 populated sections | Significant data loss |
| Hollow entries | Education has no institution, or experience has no company AND no role | LLM used wrong field names |

**"Rich source" definition:** ≥250 non-whitespace chars AND resume signal score ≥3

**Resume signal scoring:**
- URLs (≥1): +2
- Date ranges (≥2): +2
- Technical terms (≥3): +1
- Section signals (≥2): +1
- Email + 8+ digit number: +1

### 7.2 Summary Validation

`isResumeSummaryLowSignal()` detects generic/placeholder summaries:

- Philosophical quotes ("给我一个支点，撬起整个地球")
- Mottos ("座右铭", "人生格言")
- Generic trait lists ("hard-working, fast learner, team player")
- Too short (≤80 chars) with no evidence tokens
- 2+ generic Chinese signals (本人, 工作认真, 勤奋, 上进, 抗压) with no technical content

---

## 8. Caching Strategy

### 8.1 Content Hash

```
SHA-256(text.trim().toLowerCase().replace(/\s+/, ' '))
→ First 16 hex characters
→ Stored as resume.contentHash
→ Unique constraint: (userId, contentHash)
```

### 8.2 Cache Lookup (3 levels)

```
getOrParseResume(text, userId, requestId)
│
├─ Level 1: User-scoped
│   WHERE userId = ? AND contentHash = ?
│   └─ Return if found AND not incomplete
│
├─ Level 2: Global fallback
│   WHERE contentHash = ?  (any user)
│   ORDER BY updatedAt DESC, LIMIT 10
│   └─ Return first complete match
│
└─ Level 3: Parse fresh
    └─ resumeParseAgent.parse(normalizedText)
```

**Cache invalidation:** Reparse endpoint (`POST /:id/reparse`) bypasses cache entirely, calling `resumeParseAgent.parse()` directly.

---

## 9. Text Normalization

`normalizeExtractedText(rawText)` cleans raw extracted text before parsing:

| Step | Operation |
|------|-----------|
| 1 | CRLF/CR → LF |
| 2 | Remove null bytes |
| 3 | Remove trailing whitespace per line |
| 4 | Collapse 3+ newlines → 2 |
| 5 | Filter page markers (`1/2`, `第1页`, `page 1 of 2`) |
| 6 | Filter gibberish tokens (28+ char base64-like strings) |
| 7 | Remove single Latin chars on their own line |
| 8 | Normalize bullet glyphs (■□▪▫◆◇ → •) |
| 9 | Handle bullet-only lines (merge with next content line) |
| 10 | Normalize bullet prefixes to `• ` |
| 11 | Collapse double bullets (`• •` → `•`) |
| 12 | Repair hyphenation at line breaks (`word-\nlower` → `wordlower`) |
| 13 | Final collapse of 3+ newlines |

---

## 10. Summary & Highlight Generation

`generateResumeSummaryHighlight(parsed, requestId)`:

```
1. Check existing summary
   ├─ Length ≥ 30 AND not low-signal → use as-is
   └─ Extract highlight: first 80 chars or to first period

2. Build LLM context
   ├─ Name
   ├─ Experience: "role @ company (dates)"
   ├─ Education: "degree in field from institution"
   └─ Top skills (first 15)

3. LLM generation prompt:
   "Senior recruiter writing executive summary...
    TWO outputs:
    1. Summary: 3-4 sentences, 80-120 words, highlight skills/depth,
       experience/achievements, education, uniqueness
    2. Highlight: one-line, <60 chars
    Write in SAME LANGUAGE as candidate name/experience."

4. Validate via isResumeSummaryLowSignal()
   └─ If low-signal: buildFallbackSummaryHighlight()
       → Assembles from: latest role@company + top 5 skills + education
```

---

## 11. Downstream Agents

### 11.1 Resume Insight Agent

Analyzes parsed resume for career intelligence:

| Analysis Area | Output |
|--------------|--------|
| Career Trajectory | direction (Upward/Lateral/Declining/Early/Change), transitions, rate |
| Salary Estimate | range with currency, confidence level, factors |
| Market Competitiveness | 0-100 score, in-demand/rare/commodity skill categorization |
| Strengths & Development | 3-5 strengths with evidence, 2-4 development areas |
| Culture Fit | work style, values, environment preferences |
| Red Flags | job hopping, gaps, declining trajectory, inconsistencies |
| Recommended Roles | 3-5 role types with seniority and reasoning |
| Executive Summary | 2-3 sentence positioning |

### 11.2 Job Fit Agent

Matches resume against job openings with hard requirement validation:

**Scoring weights:**
- Hard Requirements: **Gate** (must pass — any dealbreaker caps score at 30)
- Skills Match: **35%**
- Experience Alignment: **30%**
- Transferable Skills & Potential: **20%**
- Domain & Culture Relevance: **15%**

**Grade scale:** A+ (90-100), A (80-89), B+ (70-79), B (60-69), C (40-59), D (20-39), F (0-19)

**Key rules:**
- Internships do NOT count toward full-time experience requirements
- Transferable skills score at 60-80% of exact matches (not 0%)
- Related tech stacks: React ↔ Vue ↔ Angular, AWS ↔ GCP ↔ Azure

### 11.3 Experience Computation

`computeExperienceYears(experience[])`:
- Separates full-time and internship months
- Parses dates: ISO 8601, MM/DD/YYYY, MM/YYYY, YYYY
- Parses durations: "2 years 3 months", "1.5 years", "年", "ヶ月"
- Returns formatted string: "3.5 years" or "3 years + 6 months internship"

---

## 12. API Endpoints

### Upload

```
POST /api/v1/resumes/upload
Content-Type: multipart/form-data

file: (PDF/DOCX/XLSX/TXT/MD/JSON/CSV, max 10MB)
jobId?: string  (optional: create JobMatch)

Response: { success, data: Resume, personDuplicate?, metrics }
```

### Re-upload (overwrite existing)

```
POST /api/v1/resumes/:id/reupload
Content-Type: multipart/form-data

file: (new file to replace)

Response: { success, data: Resume, metrics }
```

- Clears `resumeJobFit` records
- Clears `insightData` and `jobFitData`
- Always re-parses (bypasses cache intent)
- Uses team-aware visibility scope (not just owner)

### Re-parse (no new file)

```
POST /api/v1/resumes/:id/reparse

Response: { success, data: { parsedData, summary, highlight, ... } }
```

- If original PDF stored: re-extracts text from it (uses improved pipeline)
- If no original file: re-parses existing `resumeText`
- Always bypasses DB cache (calls agent directly)
- Regenerates summary & highlight

---

## 13. Database Model

```prisma
model Resume {
  id                   String    @id @default(cuid())
  userId               String
  name                 String              // Candidate name
  email                String?             // Contact email
  phone                String?             // Contact phone
  currentRole          String?             // Latest job title
  experienceYears      String?             // "3.5 years" or "2 years + 6mo internship"
  summary              String?   @db.Text  // AI-generated professional summary
  highlight            String?             // One-line selling point (<60 chars)
  resumeText           String    @db.Text  // Full extracted text
  parsedData           Json?               // Complete ParsedResume JSON
  insightData          Json?               // ResumeInsight analysis
  jobFitData           Json?               // JobMatch results
  contentHash          String?             // SHA-256 first 16 chars for dedup
  status               String    @default("active")
  source               String    @default("upload")

  // Original file storage
  originalFileProvider String?             // "s3" | "local" | null
  originalFileKey      String?             // Storage path/key
  originalFileName     String?
  originalFileMimeType String?
  originalFileSize     Int?
  originalFileChecksum String?             // SHA-256 of file bytes
  originalFileStoredAt DateTime?

  @@unique([userId, contentHash])
  @@index([userId, status, createdAt])
  @@index([contentHash])
}
```

---

## 14. Configuration Reference

### LLM Models

| Variable | Default | Used By |
|----------|---------|---------|
| `LLM_PROVIDER` | `openrouter` | LLMService — provider routing |
| `LLM_MODEL` | `google/gemini-3-flash-preview` | Default model for all agents |
| `LLM_FALLBACK_MODEL` | (none) | Fallback on 503/rate-limit |
| `LLM_TIMEOUT_MS` | `120000` | Request timeout |
| `PDF_VISION_MODEL` | (LLM_MODEL) | PDF vision extraction model |
| `GOOGLE_API_KEY` | (required) | Gemini multimodal access |

### PDF Extraction

| Parameter | Value | Description |
|-----------|-------|-------------|
| `PDF_LLM_MAX_TOKENS` | 8000 | Max tokens for LLM extraction |
| Watermark scatter threshold | 25% | Fragment lines / total lines |
| Quality garbled char ratio | 10% | Max garbled chars before quality fail |
| Page image scale | 2.0 | Resolution for vision OCR |
| Min text length | 20 chars | Reject if less |

### Parsing

| Parameter | Value | Description |
|-----------|-------|-------------|
| Parse temperature (first) | 0.1 | Low variance for consistency |
| Parse temperature (retry) | 0.0 | Deterministic retry |
| Max tokens (parse) | 8000 | Output limit |
| Content hash length | 16 chars | SHA-256 substring |
| Rich source min length | 250 chars | For completeness checking |
| Rich source min signal | 3 | Resume signal score threshold |
| Sparse source threshold | 600 chars | Source chars for sparse check |

### File Storage

| Variable | Default | Description |
|----------|---------|-------------|
| `RESUME_FILE_STORAGE_PROVIDER` | auto-detect | `s3`, `local`, or `none` |
| `RESUME_FILE_STORAGE_PREFIX` | `resume-originals` | Storage key prefix |
| `S3_BUCKET` | (required for S3) | S3 bucket name |
| `S3_ACCESS_KEY_ID` | (required for S3) | AWS credentials |
| `S3_SECRET_ACCESS_KEY` | (required for S3) | AWS credentials |
| `S3_REGION` | `auto` | AWS region |
| `S3_ENDPOINT` | (optional) | Custom S3-compatible endpoint |
