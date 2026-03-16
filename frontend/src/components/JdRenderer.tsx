interface JdRendererProps {
  jd: {
    title?: string;
    department?: string;
    description?: string;
    requirements?: string[] | string;
    responsibilities?: string[] | string;
    qualifications?: string[] | string;
    mustHave?: string[] | string;
    hardRequirements?: string[] | string;
    niceToHave?: string[] | string;
    benefits?: string[] | string;
  };
  className?: string;
}

/**
 * Clean text: remove broken emoji fragments, PUA chars, and leading bullet chars
 */
function cleanText(text: string): string {
  return text
    // Remove PUA (Private Use Area) characters
    .replace(/[\uE000-\uF8FF]/g, '')
    // Remove isolated variation selectors / combining marks that lost their base emoji
    .replace(/[\uFE00-\uFE0F]/g, '')
    // Remove zero-width chars
    .replace(/[\uFEFF\u200B\u200C\u200D]/g, '')
    // Remove broken surrogate fragments that display as ≡ or similar
    .replace(/[\u2261\u2262\u2263]/g, '')
    // Remove leading bullet/numbering chars that LLM may have left
    .replace(/^[\s•●○◦▪▫■□◆◇·∙✦✧\-–—*]+\s*/, '')
    // Remove leading number + dot patterns (e.g., "1. ", "2. ")
    .replace(/^\d+\.\s*/, '')
    // Clean up multiple spaces
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Normalize a field that may be a string[] or a text string (with bullet lines) into string[]
 */
function toArray(value?: string[] | string): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  // Split text by newlines, strip leading "- " or "* " or numbered "1. " prefixes
  return value
    .split(/\n/)
    .map(line => line.replace(/^[\s•●○◦▪▫■□◆◇·∙✦✧\-–—*]+\s*/, '').replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);
}

function SectionList({ title, items, icon }: { title: string; items: string[]; icon?: string }) {
  if (!items || items.length === 0) return null;
  const cleaned = items.map(cleanText).filter(Boolean);
  if (cleaned.length === 0) return null;
  return (
    <div className="mb-6">
      <h3 className="jd-section-title">
        {icon && <span className="jd-section-icon">{icon}</span>}
        {title}
      </h3>
      <ul className="jd-list">
        {cleaned.map((item, i) => (
          <li key={i} className="jd-list-item">{item}</li>
        ))}
      </ul>
    </div>
  );
}

const jdStyles = `
  .jd-container {
    max-width: 800px;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
  }

  .jd-description {
    font-size: 0.925rem;
    color: #334155;
    line-height: 1.8;
    margin-bottom: 1.5rem;
    padding: 1rem;
    background: #f8fafc;
    border-radius: 0.5rem;
    border-left: 4px solid #6366f1;
  }

  .dark .jd-description {
    color: #cbd5e1;
    background: #1e293b;
    border-left-color: #818cf8;
  }

  .jd-section-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #6366f1;
    margin-bottom: 0.75rem;
    padding-bottom: 0.4rem;
    border-bottom: 2px solid #e2e8f0;
  }

  .dark .jd-section-title {
    color: #818cf8;
    border-bottom-color: #334155;
  }

  .jd-section-icon {
    font-size: 1rem;
  }

  .jd-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .jd-list-item {
    position: relative;
    padding-left: 1.25rem;
    margin-bottom: 0.6rem;
    font-size: 0.9rem;
    color: #334155;
    line-height: 1.7;
  }

  .jd-list-item::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0.6rem;
    width: 6px;
    height: 6px;
    background: #6366f1;
    border-radius: 50%;
  }

  .dark .jd-list-item {
    color: #cbd5e1;
  }

  .dark .jd-list-item::before {
    background: #818cf8;
  }

  .jd-department {
    display: inline-block;
    font-size: 0.8rem;
    color: #6366f1;
    background: #eef2ff;
    padding: 0.2rem 0.6rem;
    border-radius: 9999px;
    margin-bottom: 1rem;
    font-weight: 500;
  }

  .dark .jd-department {
    color: #a5b4fc;
    background: #312e81;
  }
`;

export function JdRenderer({ jd, className = '' }: JdRendererProps) {
  // Merge requirements + qualifications, and mustHave + hardRequirements
  const requirements = [...toArray(jd.requirements), ...toArray(jd.qualifications)];
  const mustHave = [...toArray(jd.mustHave), ...toArray(jd.hardRequirements)];
  const niceToHave = toArray(jd.niceToHave);
  const responsibilities = toArray(jd.responsibilities);
  const benefits = toArray(jd.benefits);

  return (
    <div className={`jd-container ${className}`}>
      <style dangerouslySetInnerHTML={{ __html: jdStyles }} />

      {jd.department && (
        <span className="jd-department">{jd.department}</span>
      )}

      {jd.description && (
        <div className="jd-description">{cleanText(jd.description)}</div>
      )}

      <SectionList title="职责 / Responsibilities" items={responsibilities} icon="📋" />
      <SectionList title="要求 / Requirements" items={requirements} icon="✅" />
      <SectionList title="必备能力 / Must Have" items={mustHave} icon="🎯" />
      <SectionList title="加分项 / Nice to Have" items={niceToHave} icon="⭐" />
      <SectionList title="福利 / Benefits" items={benefits} icon="💝" />
    </div>
  );
}
