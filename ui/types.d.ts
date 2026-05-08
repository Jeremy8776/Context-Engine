type ToastType = 'info' | 'success' | 'error' | 'warning';

type ToastApi = {
  info(message: string, duration?: number): void;
  success(message: string, duration?: number): void;
  error(message: string, duration?: number): void;
  warn(message: string, duration?: number): void;
  action(message: string, label: string, onClick: () => void | Promise<void>): void;
};

type SkillRecord = {
  id: string;
  type?: string;
  [key: string]: unknown;
};

type ToolRecord = {
  available?: boolean;
  category?: string;
  compileError?: string;
  fileStandard?: boolean;
  globalInstalled?: boolean;
  globalPath?: string;
  globalReady?: boolean;
  globalWritable?: boolean;
  installed?: boolean;
  projectReady?: boolean;
  status?: string;
  [key: string]: unknown;
};

type WorkspaceRecord = {
  label: string;
  path: string;
  lastCompiled?: string;
};

type CompilePreviewResult = {
  content: string;
  filename: string;
  tokens: number;
};

type TargetReadiness = 'globalReady' | 'projectReady';

type McpHostStep = {
  id: string;
  title: string;
  body: string;
  done: boolean;
  action?: {
    type: string;
    href?: string;
    hostId?: string;
  };
};

type McpHostRecord = {
  id: string;
  label: string;
  supported: boolean;
  mode?: string;
  status: string;
  appDetected?: boolean;
  path: string | null;
  summary: string;
  snippet: string;
  note: string | null;
  steps?: McpHostStep[];
};

type DataStoreApi = {
  getHealth(): Promise<any>;
  getContextMd(): Promise<any>;
  regenContextMd(): Promise<any>;
  getBudget(): Promise<any>;
  getBackups(): Promise<any>;
  createBackup(): Promise<any>;
  restoreBackup(timestamp: string): Promise<any>;
  getSessionLog(): Promise<any>;
  logSession(entry: unknown): Promise<any>;
  getModes(): Promise<any>;
  applyMode(id: string): Promise<any>;
  ingestRepo(url: string): Promise<any>;
  pollIngestJob(jobId: string): Promise<any>;
  parseSkills(options?: Record<string, unknown>): Promise<any>;
  organiseSkills(apply?: boolean): Promise<any>;
  reviewSimilarSkills(options?: Record<string, unknown>): Promise<any>;
  getOllamaModels(): Promise<any>;
  getAppVersion(): Promise<any>;
  getIndexStatus(): Promise<any>;
  indexSkills(): Promise<any>;
  searchIndex(query: string, limit?: number): Promise<any>;
  getMcpHosts(): Promise<{ hosts?: McpHostRecord[] } | null>;
  installMcpHost(hostId: string): Promise<any>;
  getCompileTargets(): Promise<any>;
  compilePreview(targets: string[]): Promise<any>;
  compile(targets: string[], outputDir?: string): Promise<any>;
  detectTools(): Promise<Record<string, ToolRecord> | null>;
  installGlobal(targets: string[]): Promise<any>;
  getWorkspaces(): Promise<{ workspaces?: WorkspaceRecord[] } | null>;
  addWorkspace(path: string, label: string): Promise<any>;
  removeWorkspace(path: string): Promise<any>;
  compileWorkspaces(targets: string[], workspacePath: string | null): Promise<any>;
};

declare const Toast: ToastApi;
declare const DS: DataStoreApi;
declare let SKILL_DATA: SkillRecord[];
declare let CATEGORIES: unknown[];
declare const DEFAULT_RULES: RulesData;
declare const SS: {
  active(id: string): boolean;
  loadFromServer(): Promise<void>;
};
declare const MS: {
  getData(): { entries?: Array<string | { content?: string }> };
  loadFromServer(): Promise<unknown>;
};
declare const RS: {
  get(): { coding?: string; general?: string; soul?: string };
  loadFromServer(): Promise<unknown>;
};
declare const DashboardTab: {
  refreshBudget(): Promise<void>;
};
declare const SkillsTab: {
  refresh?: () => Promise<void> | void;
  init?: () => void;
};
declare const AppDialog: {
  confirm(options?: {
    title?: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
  }): Promise<boolean>;
};
declare type IndexStatusView = {
  ok?: boolean;
  ready?: boolean;
  chunks?: number;
  skills?: number;
  model?: string | null;
  updatedAt?: string | null;
} | null;
declare const CESelect: {
  enhance(select: HTMLSelectElement): void;
  enhanceAll(root?: ParentNode): void;
};
declare const CompileView: {
  availableTargets(tools: Record<string, ToolRecord>, readiness: TargetReadiness): string[];
  isToolAvailable(id: string, tool?: ToolRecord | null): boolean;
  renderFallbackSummary(tools: Record<string, ToolRecord>, workspaces: WorkspaceRecord[]): string;
  renderIndexStatus(status: IndexStatusView, building?: boolean): string;
  renderMcpHostActions(host: McpHostRecord): string;
  renderMcpHostConfig(host: McpHostRecord): string;
  renderMcpHosts(hosts: McpHostRecord[]): string;
  renderPreviewTabs(results: Record<string, CompilePreviewResult>, activeId: string | null): string;
  renderReadinessBanner(status: IndexStatusView, ctx: { hosts: McpHostRecord[] }): string;
  renderSummary(data: {
    results?: Record<string, CompilePreviewResult>;
    context?: { activeSkills?: number; totalSkills?: number };
  }): string;
  renderTools(tools: Record<string, ToolRecord>): string;
  renderWorkspaces(items: WorkspaceRecord[]): string;
  statusLabel(status: string): string;
  targetLabel(id: string): string;
};
declare function loadSkillData(): Promise<void>;
declare const ModesTab: {
  apply(id: string): Promise<void>;
};
declare const MemoryTab: {
  init(): void;
};
declare const ConfigTab: {
  init(): void;
};
declare const CompileTab: {
  installAllDetected(): Promise<void>;
  deployAllAvailable(): Promise<void>;
  compileAllWorkspaces(): Promise<void>;
  preview(): Promise<void>;
  refreshMcpHosts(): Promise<void>;
  openHostConfig(hostId: string): void;
  closeHostConfig(event?: MouseEvent): void;
};
declare function animateCount(element: HTMLElement, value: number): void;
declare function esc(value: unknown): string;
declare function switchTabByName(name: string): void;
