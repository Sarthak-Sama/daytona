export type Mode = 'fork' | 'hot-snapshot' | 'rehydrate' | 'mock' | 'local';

export interface Capture {
  id: string;                 // nanoid(10), also the share-link token
  createdAt: number;
  mode: Mode;
  stillPath: string;          // .data/captures/<id>.jpg
  width: number; height: number;
  sourceRef: string;          // capture VM id | snapshot name | path to state.json
  logsTail: string;           // last 200 lines of shop/logs/app.log at capture time
  debugState: unknown;        // GET /api/debug/state at capture time
  note?: string;              // optional tester note ("checkout isn't working")
}

export interface Session {
  id: string;                 // nanoid(16); secret, grants control of one copy
  captureId: string | null;   // null for the tester's session on the golden VM
  kind: 'tester' | 'human' | 'ai';
  label: string;              // "You", "Copy 2", "AI Detective"
  sandboxId: string;
  status: 'starting' | 'ready' | 'error' | 'closed';
  error?: string;
  createdAt: number; lastInputAt: number;
}

export interface Investigation {
  id: string; captureId: string; sessionId: string;
  status: 'starting' | 'running' | 'done' | 'error';
  model: string; provider: string;
  steps: AgentStep[];         // appended live; the UI polls this
  report?: BugReport;
  error?: string;
}

export interface AgentStep {
  n: number;
  kind: 'thought' | 'command' | 'report';
  text?: string;              // model's short reasoning, if any
  command?: string; exitCode?: number; output?: string;   // output truncated to 4000 chars
  ms?: number;
}

export interface BugReport {
  title: string;
  observedError: string;
  reproSteps: string[];
  rootCause: string;
  evidence: { step: number; excerpt: string }[];   // step = AgentStep.n of a command
  suggestedFix: string;
  confidence: number;         // 0..1
  uncertainty: string;
}
