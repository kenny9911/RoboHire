/**
 * LiveKit Agent Worker entry point.
 * Run with: npx tsx src/interview-worker.ts start
 *
 * This is a separate process from the Express server.
 * It connects to LiveKit Cloud and handles interview agent jobs.
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env from project root
config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '../.env') });

import { cli, ServerOptions } from '@livekit/agents';

cli.runApp(
  new ServerOptions({
    agent: resolve(__dirname, 'agents/interview-agent.ts'),
    agentName: 'RoboHire-1',
    wsURL: process.env.LIVEKIT_URL || '',
    apiKey: process.env.LIVEKIT_API_KEY,
    apiSecret: process.env.LIVEKIT_API_SECRET,
  }),
);
