import path from 'node:path';
import type { Mode } from './types';
const modes: Mode[] = ['fork', 'hot-snapshot', 'rehydrate', 'mock', 'local'];
const mode = (process.env.LIVESHOT_MODE || 'local') as Mode;
if (!modes.includes(mode)) throw new Error('Invalid LIVESHOT_MODE');
export const config = {
  mode,
  dataDir: path.resolve(process.env.LIVESHOT_DATA_DIR || path.join(process.cwd(), '.data')),
  shopDir: path.resolve(process.env.SHOP_DIR || '../test-app/shop'),
  daytonaApiKey: process.env.DAYTONA_API_KEY || '',
  daytonaApiUrl: process.env.DAYTONA_API_URL || 'https://app.daytona.io/api',
  daytonaTarget: process.env.DAYTONA_TARGET || 'us',
  daytonaVmSnapshot: process.env.DAYTONA_VM_SNAPSHOT || 'daytona-vm-medium',
  daytonaOrganizationId: process.env.DAYTONA_ORGANIZATION_ID || '',
  forkSource: process.env.FORK_SOURCE === 'golden' ? 'golden' as const : 'capture' as const,
  prewarm: process.env.PREWARM !== '0',
  maxLiveSessions: Math.max(1, Number(process.env.MAX_LIVE_SESSIONS) || 3),
  llmBaseUrl: process.env.LLM_BASE_URL || (process.env.OPENAI_API_KEY ? 'https://api.openai.com/v1' : 'https://inference.nosana.com/v1'),
  llmApiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '',
  llmModel: process.env.LLM_MODEL || '',
  llmProviderLabel: process.env.LLM_PROVIDER_LABEL || (process.env.OPENAI_API_KEY && !process.env.LLM_API_KEY ? 'OpenAI' : 'Nosana'),
  llmVision: process.env.LLM_VISION === '1',
  agentProtocol: process.env.AGENT_PROTOCOL === 'json' ? 'json' : 'tools',
};
