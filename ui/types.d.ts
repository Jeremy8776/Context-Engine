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
};
declare function animateCount(element: HTMLElement, value: number): void;
declare function esc(value: unknown): string;
declare function switchTabByName(name: string): void;
