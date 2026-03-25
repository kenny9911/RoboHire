import { useMemo } from 'react';

interface ResumeRendererProps {
  content: string;
  jdKeywords?: string[]; // Keywords from JD to highlight
}

// Pattern for keyword matching
const CJK_CHAR_REGEX = /[\u3040-\u30ff\u3400-\u9fff]/;

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildKeywordRegex = (keywords: string[]): RegExp | null => {
  const patterns = keywords
    .map(k => k.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(keyword => {
      const escaped = escapeRegex(keyword);
      if (CJK_CHAR_REGEX.test(keyword)) return escaped;
      return `(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`;
    });

  if (patterns.length === 0) return null;
  return new RegExp(`(${patterns.join('|')})`, 'gi');
};

/**
 * Extract keywords from JD requirements and responsibilities
 */
export function extractJDKeywords(jd: { requirements?: string[]; responsibilities?: string[]; description?: string } | null): string[] {
  if (!jd) return [];

  const allText = [
    ...(jd.requirements || []),
    ...(jd.responsibilities || []),
    jd.description || ''
  ].join(' ');

  // Common technical keywords and skills to look for
  const technicalPatterns = [
    // Programming languages
    /Python|Java|JavaScript|TypeScript|Go|Rust|C\+\+|Ruby|PHP|Swift|Kotlin/gi,
    // AI/ML terms
    /LLM|大模型|Transformer|BERT|GPT|NLP|机器学习|深度学习|神经网络|AI|人工智能/gi,
    /Agent|智能体|RAG|Prompt|微调|Fine-?tuning|LoRA|PEFT|向量|Embedding/gi,
    // Frameworks
    /PyTorch|TensorFlow|LangChain|LlamaIndex|FastAPI|Django|Flask|React|Vue|Next\.?js/gi,
    /Spark|Hadoop|Hive|Kafka|Redis|MySQL|PostgreSQL|MongoDB|Docker|Kubernetes|K8s/gi,
    // Skills
    /全栈|后端|前端|架构|分布式|微服务|API|REST|GraphQL/gi,
    /数据处理|数据分析|数据清洗|ETL|数据管道/gi,
    // Soft skills (Chinese)
    /沟通|协作|团队|领导|解决问题|学习能力|抽象能力|业务理解/gi,
  ];

  const keywords = new Set<string>();

  technicalPatterns.forEach(pattern => {
    const matches = allText.match(pattern);
    if (matches) {
      matches.forEach(m => keywords.add(m));
    }
  });

  // Also extract quoted terms or terms in parentheses
  const quotedTerms = allText.match(/[「」""''（）()]\s*([^「」""''（）()]+)\s*[「」""''（）()]/g);
  if (quotedTerms) {
    quotedTerms.forEach(t => {
      const clean = t.replace(/[「」""''（）()]/g, '').trim();
      if (clean.length > 1 && clean.length < 20) {
        keywords.add(clean);
      }
    });
  }

  return Array.from(keywords).filter(k => k.length > 1);
}

const resumeStyles = `
  .resume-container {
    max-width: 800px;
    margin: 0 auto;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    color: #1a1a1a;
  }

  .dark .resume-container {
    color: #e5e5e5;
  }

  .resume-name {
    font-size: 2rem;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 0.5rem;
    letter-spacing: -0.02em;
    border-bottom: 3px solid #3b82f6;
    padding-bottom: 0.5rem;
  }

  .dark .resume-name {
    color: #f8fafc;
    border-bottom-color: #60a5fa;
  }

  .resume-contact {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    font-size: 0.9rem;
    color: #475569;
    margin-bottom: 1.5rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid #e2e8f0;
  }

  .dark .resume-contact {
    color: #94a3b8;
    border-bottom-color: #334155;
  }

  .resume-section-title {
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: #3b82f6;
    margin: 2rem 0 1rem 0;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid #e2e8f0;
  }

  .dark .resume-section-title {
    color: #60a5fa;
    border-bottom-color: #334155;
  }

  .resume-h3 {
    font-size: 1.05rem;
    font-weight: 600;
    color: #1e293b;
    margin: 1.25rem 0 0.5rem 0;
  }

  .dark .resume-h3 {
    color: #f1f5f9;
  }

  .resume-h4 {
    font-size: 0.95rem;
    font-weight: 500;
    color: #334155;
    margin: 0.75rem 0 0.25rem 0;
  }

  .dark .resume-h4 {
    color: #cbd5e1;
  }

  .resume-date {
    font-style: normal;
    font-size: 0.85rem;
    color: #64748b;
    display: inline-block;
    margin-bottom: 0.5rem;
  }

  .dark .resume-date {
    color: #94a3b8;
  }

  .resume-location {
    font-size: 0.85rem;
    color: #64748b;
    margin-bottom: 0.5rem;
  }

  .dark .resume-location {
    color: #94a3b8;
  }

  .resume-list {
    list-style: none !important;
    padding: 0 !important;
    margin: 0.5rem 0 1rem 0;
  }

  .resume-bullet {
    position: relative;
    padding-left: 1.25rem;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    color: #334155;
    line-height: 1.6;
    list-style: none !important;
  }

  .resume-bullet::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0.55rem;
    width: 6px;
    height: 6px;
    background: #3b82f6;
    border-radius: 50%;
  }

  /* Hide any residual bullet characters that weren't stripped */
  .resume-bullet > span.bullet-char {
    display: none;
  }

  .dark .resume-bullet {
    color: #cbd5e1;
  }

  .dark .resume-bullet::before {
    background: #60a5fa;
  }

  .resume-paragraph {
    font-size: 0.9rem;
    color: #334155;
    margin-bottom: 0.75rem;
    line-height: 1.7;
  }

  .dark .resume-paragraph {
    color: #cbd5e1;
  }

  .resume-tech-stack {
    font-size: 0.85rem;
    color: #475569;
    margin: 0.5rem 0;
    padding: 0.5rem 0.75rem;
    background: #f8fafc;
    border-radius: 0.375rem;
    border-left: 3px solid #3b82f6;
  }

  .dark .resume-tech-stack {
    color: #94a3b8;
    background: #1e293b;
    border-left-color: #60a5fa;
  }

  .tech-label {
    font-weight: 600;
    color: #1e293b;
  }

  .dark .tech-label {
    color: #e2e8f0;
  }

  .resume-gpa {
    font-size: 0.85rem;
    color: #059669;
    font-weight: 500;
  }

  .dark .resume-gpa {
    color: #34d399;
  }

  .resume-link {
    color: #3b82f6;
    text-decoration: none;
    border-bottom: 1px dotted #3b82f6;
  }

  .resume-link:hover {
    border-bottom-style: solid;
  }

  .dark .resume-link {
    color: #60a5fa;
    border-bottom-color: #60a5fa;
  }

  .resume-divider {
    border: none;
    border-top: 1px solid #e2e8f0;
    margin: 1.5rem 0;
  }

  .dark .resume-divider {
    border-top-color: #334155;
  }

  .keyword-highlight {
    background: linear-gradient(120deg, #fef3c7 0%, #fde68a 100%);
    color: #92400e;
    padding: 0.1rem 0.25rem;
    border-radius: 0.25rem;
    font-weight: 500;
  }

  .dark .keyword-highlight {
    background: linear-gradient(120deg, #78350f 0%, #92400e 100%);
    color: #fef3c7;
  }

  /* Strong text styling */
  .resume-container strong {
    font-weight: 600;
    color: #1e293b;
  }

  .dark .resume-container strong {
    color: #f1f5f9;
  }

  /* Print styles */
  @media print {
    .resume-container {
      max-width: 100%;
      font-size: 11pt;
    }

    .resume-name {
      font-size: 18pt;
    }

    .resume-section-title {
      font-size: 10pt;
      page-break-after: avoid;
    }

    .resume-h3 {
      page-break-after: avoid;
    }

    .keyword-highlight {
      background: #fef3c7;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
`;

/**
 * Professional Resume Renderer
 * Renders LLM-formatted resume with beautiful styling
 */
export function ResumeRenderer({ content, jdKeywords = [] }: ResumeRendererProps) {

  const highlightKeywords = (text: string, keywords: string[]): string => {
    if (keywords.length === 0) return text;

    const regex = buildKeywordRegex(keywords);
    if (!regex) return text;

    // Split by HTML tags to avoid highlighting inside tags
    const parts = text.split(/(<[^>]+>)/g);

    return parts.map(part => {
      if (part.startsWith('<')) return part;
      return part.replace(regex, '<mark class="keyword-highlight">$1</mark>');
    }).join('');
  };

  const renderMarkdown = (text: string): string => {
    if (!text) return '';

    // Clean up any LLM artifacts
    let cleanText = text
      .replace(/^(以下是|Here is|Below is|这是)[^\n]*\n?/gm, '')
      .replace(/^\*+\s*$/gm, '')
      .trim();

    let html = cleanText
      // Escape HTML first
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

      // Headers with professional styling
      .replace(/^#### (.+)$/gm, '<h4 class="resume-h4">$1</h4>')
      .replace(/^### (.+)$/gm, '<h3 class="resume-h3">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="resume-section-title">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="resume-name">$1</h1>')

      // Contact line (single line with bullet separators)
      .replace(/^([^#\n•*-][^\n]*•[^\n]+)$/gm, '<div class="resume-contact">$1</div>')

      // Bold and italic
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/(?<![*\w])\*([^*\n]+)\*(?![*\w])/g, '<em class="resume-date">$1</em>')

      // Horizontal rules
      .replace(/^[-*]{3,}$/gm, '<hr class="resume-divider" />')

      // List items: first normalize all bullet-like line starts to a uniform marker
      .replace(/^[\u2022\u2023\u2043\u204C\u204D\u2219\u25AA\u25AB\u25CF\u25CB\u25E6\u25A0\u25A1\u25C6\u25C7\u25FC\u25FB\u25FE\u25FD\u2013\u2014\u2212•●○◦▪▫■□◆◇◼◻◾◽‣⁃∙·\-\*]+\s+/gm, '\u0000BULLET\u0000')
      // Then convert the marker to styled list items
      .replace(/^\u0000BULLET\u0000(.+)$/gm, '<li class="resume-bullet">$1</li>')

      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="resume-link" target="_blank" rel="noopener">$1</a>')

      // Location indicator
      .replace(/^📍\s*(.+)$/gm, '<div class="resume-location">📍 $1</div>')

      // Tech stack and other labels
      .replace(/^\*\*(技术栈|Tech Stack|Technologies|链接|Links):\*\*\s*(.+)$/gm,
        '<div class="resume-tech-stack"><span class="tech-label">$1:</span> $2</div>')

      // GPA line
      .replace(/^(GPA:?\s*.+)$/gm, '<div class="resume-gpa">$1</div>')

      // Paragraphs (anything not already processed)
      .replace(/^(?!<h|<ul|<li|<hr|<p|<div|<a)(.+)$/gm, '<p class="resume-paragraph">$1</p>');

    // Highlight keywords
    html = highlightKeywords(html, jdKeywords);

    // Wrap consecutive list items in ul (content may contain nested HTML tags)
    html = html.replace(/(<li class="resume-bullet">[\s\S]*?<\/li>\s*)+/g, (match) => {
      return `<ul class="resume-list">${match}</ul>`;
    });

    return html;
  };

  const renderedContent = useMemo(() => renderMarkdown(content), [content, jdKeywords]);

  return (
    <div className="resume-container">
      <style dangerouslySetInnerHTML={{ __html: resumeStyles }} />
      <div dangerouslySetInnerHTML={{ __html: renderedContent }} />
    </div>
  );
}

/**
 * Convert legacy parsedData (stored in DB as JSON) to markdown for ResumeRenderer.
 * Works with both old format (name, email, role) and new format (candidateName, contact, title).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ParsedDataToMarkdownOptions {
  includeSummary?: boolean;
  includeSkills?: boolean;
}

export function parsedDataToMarkdown(
  parsed: Record<string, any>,
  options: ParsedDataToMarkdownOptions = {},
): string {
  if (!parsed) return '';
  const { includeSummary = true, includeSkills = true } = options;
  const lines: string[] = [];

  const sanitizeSummary = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    const keptLines = value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^(男|女|闻)$/.test(line))
      .filter((line) => !/^(出生年月|出生日期|政治面貌|联系电话|电话|邮箱|现居地|所在地|性别)\s*[:：]/i.test(line))
      .filter((line) => line.length > 1);
    return keptLines.join('\n').trim();
  };

  // Name
  const name = parsed.candidateName || parsed.name || 'Unknown';
  lines.push(`# ${name}`);
  lines.push('');

  // Contact
  const contactParts: string[] = [];
  if (parsed.contact) {
    if (parsed.contact.email) contactParts.push(parsed.contact.email);
    if (parsed.contact.phone) contactParts.push(parsed.contact.phone);
    if (parsed.contact.location) contactParts.push(parsed.contact.location);
    if (parsed.contact.github) contactParts.push(parsed.contact.github);
    if (parsed.contact.linkedin) contactParts.push(parsed.contact.linkedin);
    if (parsed.contact.website) contactParts.push(parsed.contact.website);
  } else {
    if (parsed.email) contactParts.push(parsed.email);
    if (parsed.phone) contactParts.push(parsed.phone);
    if (parsed.address) contactParts.push(parsed.address);
    if (parsed.github) contactParts.push(parsed.github);
    if (parsed.linkedin) contactParts.push(parsed.linkedin);
    if (parsed.portfolio) contactParts.push(parsed.portfolio);
  }
  if (contactParts.length > 0) {
    lines.push(contactParts.join(' • '));
    lines.push('');
  }

  // Summary
  const safeSummary = sanitizeSummary(parsed.summary);
  if (includeSummary && safeSummary) {
    lines.push('## 个人简介');
    lines.push(safeSummary);
    lines.push('');
  }

  // Skills — translate common category keys to bilingual labels
  const skillCategoryMap: Record<string, string> = {
    tools: '工具 / Tools',
    languages: '编程语言 / Languages',
    technical: '专业技能 / Technical',
    frameworks: '框架 / Frameworks',
    databases: '数据库 / Databases',
    cloud: '云平台 / Cloud',
    devops: 'DevOps',
    soft: '软技能 / Soft Skills',
    other: '其他 / Other',
  };
  const skills = parsed.skills;
  if (includeSkills && skills) {
    lines.push('## 技能');
    if (Array.isArray(skills)) {
      // SkillCategory[] format
      for (const cat of skills) {
        if (cat.category && Array.isArray(cat.skills)) {
          const label = skillCategoryMap[cat.category.toLowerCase()] || cat.category;
          lines.push(`**${label}:** ${cat.skills.join(', ')}`);
        } else if (typeof cat === 'string') {
          lines.push(`• ${cat}`);
        }
      }
    } else if (typeof skills === 'object') {
      for (const [category, items] of Object.entries(skills)) {
        if (Array.isArray(items) && items.length > 0) {
          const label = skillCategoryMap[category.toLowerCase()] || category;
          lines.push(`**${label}:** ${items.join(', ')}`);
        }
      }
    }
    lines.push('');
  }

  // Experience — handle common LLM field name variations
  const experience = parsed.experience as Array<Record<string, unknown>> | undefined;
  if (experience && experience.length > 0) {
    lines.push('## 工作经历');
    for (const exp of experience) {
      const role = (exp.title || exp.role || exp.jobTitle || exp.job_title || exp.position || '') as string;
      const company = (exp.company || exp.companyName || exp.company_name || exp.employer || exp.organization || '') as string;
      if (company && role) {
        lines.push(`### ${company} | ${role}`);
      } else if (company || role) {
        lines.push(`### ${company || role}`);
      }
      const period = (exp.period || exp.startDate || exp.start_date || '') as string;
      const expLocation = (exp.location || exp.city || '') as string;
      if (expLocation && period) {
        lines.push(`*${expLocation} | ${period}${exp.endDate || exp.end_date ? ` — ${exp.endDate || exp.end_date}` : ''}*`);
      } else if (period) {
        lines.push(`*${period}${exp.endDate || exp.end_date ? ` — ${exp.endDate || exp.end_date}` : ''}*`);
      } else if (expLocation) {
        lines.push(`*${expLocation}*`);
      }
      const highlights = (exp.highlights || exp.achievements || []) as string[];
      for (const h of highlights) {
        lines.push(`• ${h}`);
      }
      if (exp.description) lines.push(exp.description as string);
      lines.push('');
    }
  }

  // Education — handle common LLM field name variations
  const education = parsed.education as Array<Record<string, unknown>> | undefined;
  if (education && education.length > 0) {
    lines.push('## 教育背景');
    for (const edu of education) {
      const degree = (edu.degree || edu.degreeName || '') as string;
      const field = (edu.field || edu.major || edu.fieldOfStudy || edu.specialization || '') as string;
      const institution = (edu.institution || edu.school || edu.university || edu.schoolName || edu.college || '') as string;
      const degreeDisplay = field && !degree.includes(field)
        ? `${degree},专业:${field}`
        : degree;
      if (institution && degreeDisplay) {
        lines.push(`### ${institution} | ${degreeDisplay}`);
      } else if (institution || degreeDisplay) {
        lines.push(`### ${institution || degreeDisplay}`);
      }
      const period = (edu.period || edu.startDate || edu.start_date || '') as string;
      const location = (edu.location || '') as string;
      if (location && period) {
        lines.push(`*${location} | ${period}${edu.endDate || edu.end_date ? ` — ${edu.endDate || edu.end_date}` : ''}*`);
      } else if (period) {
        lines.push(`*${period}${edu.endDate || edu.end_date ? ` — ${edu.endDate || edu.end_date}` : ''}*`);
      }
      if (edu.gpa) lines.push(`GPA: ${edu.gpa}`);
      const details = (edu.details || edu.coursework || edu.courses || []) as string[];
      for (const d of details) {
        lines.push(`• ${d}`);
      }
      const achievements = (edu.achievements || []) as string[];
      for (const a of achievements) {
        lines.push(`• ${a}`);
      }
      lines.push('');
    }
  }

  // Projects
  const projects = parsed.projects as Array<Record<string, unknown>> | undefined;
  if (projects && projects.length > 0) {
    lines.push('## 项目经历');
    for (const proj of projects) {
      const projName = (proj.name || '') as string;
      lines.push(`### ${projName}`);
      if (proj.period) lines.push(`*${proj.period}*`);
      if (proj.description) lines.push(proj.description as string);
      const highlights = (proj.highlights || []) as string[];
      for (const h of highlights) {
        lines.push(`• ${h}`);
      }
      const techs = (proj.technologies || []) as string[];
      if (techs.length > 0) {
        lines.push(`**Technologies:** ${techs.join(', ')}`);
      }
      lines.push('');
    }
  }

  // Certifications
  const certs = parsed.certifications as Array<Record<string, unknown> | string> | undefined;
  if (certs && certs.length > 0) {
    lines.push('## 证书资质');
    for (const c of certs) {
      lines.push(`• ${typeof c === 'string' ? c : (c.name || c.title || '')}`);
    }
    lines.push('');
  }

  // Awards
  const awards = parsed.awards as Array<Record<string, unknown>> | undefined;
  if (awards && awards.length > 0) {
    lines.push('## 获奖荣誉');
    for (const a of awards) {
      const title = (a.title || a.name || '') as string;
      lines.push(`• ${title}${a.date ? ` (${a.date})` : ''}`);
    }
    lines.push('');
  }

  // Languages
  const languages = parsed.languages as Array<Record<string, unknown>> | undefined;
  if (languages && languages.length > 0) {
    lines.push('## 语言能力');
    for (const lang of languages) {
      lines.push(`• ${lang.language}: ${lang.proficiency}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
