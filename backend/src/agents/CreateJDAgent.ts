import { llmService } from '../services/llm/LLMService.js';
import { languageService } from '../services/LanguageService.js';
import { logger } from '../services/LoggerService.js';

export interface CreateJDInput {
  title?: string;
  requirements?: string;
  jobDescription?: string;
  language?: string;
  requestId?: string;
}

export class CreateJDAgent {
  async generate(input: CreateJDInput): Promise<string> {
    const title = input.title?.trim() || '';
    const requirements = input.requirements?.trim() || '';
    const existingJD = input.jobDescription?.trim() || '';
    const preferredLocale = input.language?.trim() || '';

    const languageSource = existingJD || requirements || title;
    const preferredLanguage = preferredLocale
      ? languageService.getLanguageFromLocale(preferredLocale)
      : null;
    const resolvedLanguage = preferredLanguage || languageService.detectLanguage(languageSource || '');
    const languageInstruction = preferredLanguage
      ? languageService.getLanguageInstructionForLanguage(preferredLanguage)
      : languageService.getLanguageInstruction(languageSource || '');

    const languageNote = preferredLanguage ? `User selected language: ${preferredLanguage}.` : '';

    const systemPrompt = `${languageInstruction}

${languageNote}

You are a senior recruitment consultant and job description strategist.
Create a clear, concise, and market-ready job description in the response language that is optimized for SEO, job boards, and ATS screening.

Guidelines:
- Output in Markdown only. Do not wrap the response in code fences.
- Use a top-level heading for the job title, then section headings for: Overview, Responsibilities, Requirements, Nice-to-haves, Benefits.
- Headings must be in the response language.
- Keep wording professional, specific, and scannable.
- Optimize for job boards and ATS: naturally include key skills, tools, and role keywords from the inputs while avoiding keyword stuffing.
- Use industry-standard role naming and seniority when supported by the inputs.
- Use bullet lists for Responsibilities and Requirements.
- If an existing JD is provided, refine it for clarity, structure, and SEO/ATS alignment while honoring the new requirements.
- If information is missing, use a short "TBD" line for that section.
- Do not invent company-specific details, benefits, or compensation.`;

    const promptParts: string[] = [];
    if (title) {
      promptParts.push(`Title: ${title}`);
    }
    if (requirements) {
      promptParts.push(`Requirements and context:\n${requirements.slice(0, 4000)}`);
    }
    if (existingJD) {
      promptParts.push(`Existing JD (revise and improve):\n${existingJD.slice(0, 6000)}`);
    }

    const userPrompt = promptParts.join('\n\n');

    try {
      const response = await llmService.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.4, requestId: input.requestId }
      );

      return response.trim();
    } catch (error) {
      logger.error('HIRING_JD', 'LLM JD generation failed, using fallback', {
        error: error instanceof Error ? error.message : String(error),
        language: resolvedLanguage,
      }, input.requestId);

      return this.buildFallbackMarkdown({
        title,
        requirements,
        existingJD,
        language: resolvedLanguage,
      });
    }
  }

  private buildFallbackMarkdown(input: {
    title: string;
    requirements: string;
    existingJD: string;
    language: string;
  }): string {
    const headings = this.getHeadingLabels(input.language);
    const title = input.title || headings.jobTitle;
    const overview = this.pickOverview(input.existingJD, input.requirements);

    const responsibilities = this.toBulletList(
      this.pickListSource(input.existingJD, input.requirements)
    );
    const requirements = this.toBulletList(
      this.pickListSource(input.requirements, input.existingJD)
    );

    const responsibilitiesContent = responsibilities.length
      ? responsibilities.map((item) => `- ${item}`).join('\n')
      : 'TBD';
    const requirementsContent = requirements.length
      ? requirements.map((item) => `- ${item}`).join('\n')
      : 'TBD';

    return [
      `# ${title}`,
      '',
      `## ${headings.overview}`,
      overview || 'TBD',
      '',
      `## ${headings.responsibilities}`,
      responsibilitiesContent,
      '',
      `## ${headings.requirements}`,
      requirementsContent,
      '',
      `## ${headings.niceToHaves}`,
      'TBD',
      '',
      `## ${headings.benefits}`,
      'TBD',
    ].join('\n');
  }

  private pickOverview(existingJD: string, requirements: string): string {
    const source = existingJD || requirements;
    if (!source) return '';
    const paragraph = source.split(/\n\s*\n/)[0]?.trim() || '';
    return paragraph;
  }

  private pickListSource(primary: string, secondary: string): string {
    return primary || secondary;
  }

  private toBulletList(text: string, maxItems = 8): string[] {
    if (!text) return [];

    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const bulletLines = lines
      .filter((line) => /^[-*•]/.test(line))
      .map((line) => line.replace(/^[-*•]\s*/, '').trim())
      .filter(Boolean);

    if (bulletLines.length > 0) {
      return bulletLines.slice(0, maxItems);
    }

    const sentences = text
      .split(/[。；;.!?]+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);

    return sentences.slice(0, maxItems);
  }

  private getHeadingLabels(language: string): {
    jobTitle: string;
    overview: string;
    responsibilities: string;
    requirements: string;
    niceToHaves: string;
    benefits: string;
  } {
    const labels: Record<string, {
      jobTitle: string;
      overview: string;
      responsibilities: string;
      requirements: string;
      niceToHaves: string;
      benefits: string;
    }> = {
      Chinese: {
        jobTitle: '职位名称',
        overview: '概述',
        responsibilities: '职责',
        requirements: '任职要求',
        niceToHaves: '加分项',
        benefits: '福利待遇',
      },
      Japanese: {
        jobTitle: '職種名',
        overview: '概要',
        responsibilities: '職務内容',
        requirements: '応募資格',
        niceToHaves: '歓迎条件',
        benefits: '福利厚生',
      },
      Spanish: {
        jobTitle: 'Título del puesto',
        overview: 'Resumen',
        responsibilities: 'Responsabilidades',
        requirements: 'Requisitos',
        niceToHaves: 'Deseables',
        benefits: 'Beneficios',
      },
      French: {
        jobTitle: 'Intitulé du poste',
        overview: 'Aperçu',
        responsibilities: 'Responsabilités',
        requirements: 'Exigences',
        niceToHaves: 'Atouts',
        benefits: 'Avantages',
      },
      Portuguese: {
        jobTitle: 'Título da vaga',
        overview: 'Visão geral',
        responsibilities: 'Responsabilidades',
        requirements: 'Requisitos',
        niceToHaves: 'Diferenciais',
        benefits: 'Benefícios',
      },
      German: {
        jobTitle: 'Stellentitel',
        overview: 'Überblick',
        responsibilities: 'Aufgaben',
        requirements: 'Anforderungen',
        niceToHaves: 'Wünschenswert',
        benefits: 'Benefits',
      },
      English: {
        jobTitle: 'Job Title',
        overview: 'Overview',
        responsibilities: 'Responsibilities',
        requirements: 'Requirements',
        niceToHaves: 'Nice-to-haves',
        benefits: 'Benefits',
      },
    };

    return labels[language] || labels.English;
  }
}

export const createJDAgent = new CreateJDAgent();
