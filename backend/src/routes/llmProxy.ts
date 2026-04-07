import { Router, Request, Response } from 'express';

/**
 * Transparent reverse proxy for LLM APIs that are geo-restricted.
 * Deployed on Render (US region), used by local dev environments only.
 * Production code calls APIs directly — this route is never hit in prod.
 *
 * Auth: requires X-Proxy-Key header matching LLM_PROXY_KEY env var.
 *
 * Usage (local .env):
 *   GEMINI_BASE_URL=https://api.robohire.io/api/v1/llm-proxy/gemini
 *   OPENAI_BASE_URL=https://api.robohire.io/api/v1/llm-proxy/openai
 *   LLM_PROXY_KEY=<shared secret>
 */

const router = Router();

const TARGETS: Record<string, string> = {
  gemini: 'https://generativelanguage.googleapis.com',
  openai: 'https://api.openai.com',
  anthropic: 'https://api.anthropic.com',
};

router.all('/:provider/*', async (req: Request, res: Response) => {
  // Auth check
  const expectedKey = process.env.LLM_PROXY_KEY;
  if (!expectedKey) {
    return res.status(503).json({ error: 'LLM proxy not configured (LLM_PROXY_KEY not set)' });
  }
  if (req.headers['x-proxy-key'] !== expectedKey) {
    return res.status(401).json({ error: 'Invalid proxy key' });
  }

  // Resolve target
  const provider = req.params.provider;
  const target = TARGETS[provider];
  if (!target) {
    return res.status(404).json({ error: `Unknown LLM provider: ${provider}` });
  }

  // Build target URL preserving path and query string
  const pathAfterProvider = (req.params as Record<string, string>)[0];
  const queryString = new URL(req.originalUrl, 'http://localhost').search;
  const targetUrl = `${target}/${pathAfterProvider}${queryString}`;

  // Forward headers (strip hop-by-hop and proxy-specific)
  const skipHeaders = new Set([
    'host', 'connection', 'content-length', 'transfer-encoding',
    'x-proxy-key', // don't leak our proxy auth to upstream
  ]);
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!skipHeaders.has(key.toLowerCase()) && typeof value === 'string') {
      headers[key] = value;
    }
  }

  try {
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: hasBody && req.body ? JSON.stringify(req.body) : undefined,
    });

    // Forward status + response headers
    res.status(upstream.status);
    const skipResponseHeaders = new Set(['connection', 'transfer-encoding', 'content-encoding', 'content-length']);
    for (const [key, value] of upstream.headers.entries()) {
      if (!skipResponseHeaders.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    }

    // Stream response body (supports SSE / chunked streaming from LLM APIs)
    if (upstream.body) {
      const reader = upstream.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!res.writableEnded) res.write(value);
        }
      } catch {
        // client disconnected
      }
      if (!res.writableEnded) res.end();
    } else {
      res.end();
    }
  } catch (error) {
    if (!res.headersSent) {
      res.status(502).json({
        error: 'LLM proxy request failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
});

export default router;
