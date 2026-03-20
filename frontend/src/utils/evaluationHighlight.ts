function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function highlightEvaluationKeywords(text: string, tone: 'green' | 'red'): string {
  const cls = tone === 'green'
    ? 'font-normal text-slate-900 bg-emerald-50 px-1 py-0.5 rounded'
    : 'font-normal text-slate-900 bg-rose-50 px-1 py-0.5 rounded';

  const chineseKeywords = [
    '系统设计',
    '架构设计',
    '架构能力',
    '工程化',
    '业务理解',
    '需求分析',
    '问题拆解',
    '沟通表达',
    '逻辑思维',
    '项目管理',
    '项目经验',
    '领导力',
    '执行力',
    '推进能力',
    '协作能力',
    '学习能力',
    '稳定性',
    '性能优化',
    '代码质量',
    '数据分析',
    '风险意识',
    'ownership',
    '沟通',
    '表达',
    '逻辑',
    '架构',
    '业务',
    '领导',
    '细节',
    '复盘',
    '抗压',
    'AI',
    'LLM',
    'MCP',
    'RAG',
    'Prompt Engineering',
    'System Prompt',
  ];

  let safe = escapeHtml(text);

  safe = safe.replace(/[""「【]([^""」】]+)[""」】]/g, `<span class="${cls}">"$1"</span>`);
  safe = safe.replace(/\*\*([^*]+)\*\*/g, `<span class="${cls}">$1</span>`);

  safe = safe.replace(/^([^，。：,<]{4,40})[，。：,]/, (match, topic) => {
    if (topic.includes('</span>') || topic.includes('<span')) return match;
    const sep = match[match.length - 1];
    return `<span class="${cls}">${topic}</span>${sep}`;
  });

  safe = safe.replace(/(?<![<\w])([A-Z][a-zA-Z]*(?:[\s/][A-Z][a-zA-Z]*)+)(?![>\w])/g, (match) => {
    if (match.length < 3) return match;
    return `<span class="${cls}">${match}</span>`;
  });
  safe = safe.replace(/(?<![<\w])([A-Z]{2,}[a-z]*(?:\/[A-Z]{2,}[a-z]*)*)(?![>\w])/g, (match) => {
    return `<span class="${cls}">${match}</span>`;
  });

  const keywordPattern = chineseKeywords
    .sort((a, b) => b.length - a.length)
    .map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  if (keywordPattern) {
    safe = safe.replace(new RegExp(`(${keywordPattern})`, 'g'), `<span class="${cls}">$1</span>`);
  }

  safe = safe.replace(
    /<span class="[^"]*"><span class="[^"]*">([^<]*)<\/span><\/span>/g,
    `<span class="${cls}">$1</span>`,
  );

  return safe;
}
