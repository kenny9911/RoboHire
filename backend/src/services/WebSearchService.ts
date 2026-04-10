/**
 * Web search service for Agent Alex — Tavily integration.
 * Provides real-time market data, salary benchmarks, and industry insights.
 */

import { logger } from './LoggerService.js';

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface WebSearchResponse {
  query: string;
  answer?: string;
  results: WebSearchResult[];
  responseTimeMs: number;
}

export function isWebSearchEnabled(): boolean {
  return (
    process.env.AGENT_ALEX_WEB_SEARCH_ENABLED === 'true' &&
    !!process.env.TAVILY_API_KEY?.trim()
  );
}

export async function searchWeb(
  query: string,
  options?: {
    maxResults?: number;
    searchDepth?: 'basic' | 'advanced';
    topic?: 'general' | 'news';
  },
): Promise<WebSearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY is not configured');
  }

  const startTime = Date.now();
  const maxResults = options?.maxResults ?? 5;
  const searchDepth = options?.searchDepth ?? 'basic';
  const topic = options?.topic ?? 'general';

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        search_depth: searchDepth,
        topic,
        include_answer: true,
        include_raw_content: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Tavily API error ${response.status}: ${errText}`);
    }

    const data = await response.json() as {
      answer?: string;
      results?: Array<{ title: string; url: string; content: string; score: number }>;
    };

    const elapsed = Date.now() - startTime;

    logger.info('WEB_SEARCH', 'Tavily search completed', {
      query,
      resultCount: data.results?.length ?? 0,
      responseTimeMs: elapsed,
      hasAnswer: !!data.answer,
    });

    return {
      query,
      answer: data.answer || undefined,
      results: (data.results || []).map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score,
      })),
      responseTimeMs: elapsed,
    };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    logger.error('WEB_SEARCH', 'Tavily search failed', {
      query,
      error: error instanceof Error ? error.message : String(error),
      responseTimeMs: elapsed,
    });
    throw error;
  }
}
