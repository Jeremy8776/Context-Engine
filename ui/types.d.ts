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
  description?: string;
  fileStandard?: boolean;
  globalInstalled?: boolean;
  globalPath?: string;
  globalReady?: boolean;
  globalWritable?: boolean;
  installed?: boolean;
  outputFilename?: string | null;
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
  connection?: {
    transport: string;
    endpoint?: string;
    mcpUrl?: string;
    auth?: string;
    command?: string;
  };
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
  getDedupReport(refresh?: boolean): Promise<any>;
  resolveDedupCluster(input: {
    clusterId: string;
    action: string;
    keepSkillId?: string;
    note?: string;
  }): Promise<any>;
  smartCompile(input: {
    task: string;
    targets?: string[];
    maxTokens?: number;
    projectPath?: string;
  }): Promise<any>;
  getMcpHosts(): Promise<{ hosts?: McpHostRecord[] } | null>;
  installMcpHost(hostId: string): Promise<any>;
  listSkillSources(): Promise<{
    sources?: Array<{
      id: string;
      label: string;
      path: string;
      type: string;
      skillCount: number;
      imported?: boolean;
      lastSyncedAt?: string | null;
      aggregateStrategy?: string | null;
      fileCount?: number;
    }>;
  } | null>;
  scanSkillSources(): Promise<{
    candidates?: Array<{
      path: string;
      label: string;
      exists: boolean;
      skillCount: number;
      alreadyLinked: boolean;
    }>;
  } | null>;
  addSkillSource(input: { path: string; label?: string }): Promise<{
    ok: boolean;
    error?: string;
    source?: { id: string; label: string; path: string };
  } | null>;
  removeSkillSource(id: string): Promise<{ ok: boolean; error?: string } | null>;
  importSkillSource(id: string): Promise<{
    ok: boolean;
    error?: string;
    manifest?: {
      sourceId: string;
      sourcePath: string;
      destPath: string;
      aggregateStrategy: string;
      files: Array<{ rel: string; size: number; mtimeMs: number; strategy: string }>;
    };
  } | null>;
  syncSkillSource(id: string): Promise<{
    ok: boolean;
    error?: string;
    diff?: {
      added: Array<{ rel: string; size: number; mtimeMs: number }>;
      removed: Array<{ rel: string }>;
      modified: Array<{ rel: string; size: number; mtimeMs: number }>;
    };
  } | null>;
  applySkillSourceSync(
    id: string,
    mode: 'append' | 'overwrite',
  ): Promise<{
    ok: boolean;
    error?: string;
    applied?: { added: number; removed: number; modified: number };
  } | null>;
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
  init(): Promise<void> | void;
  backup(): Promise<void>;
  restore(): Promise<void>;
  regenCONTEXTmd(): Promise<void>;
  discover(): Promise<void>;
  indexSkills(): Promise<void>;
  refreshIndexStatus(): Promise<void>;
  smartCompile(): Promise<void>;
  refreshBudget(): Promise<void>;
  loadSessionLog(): Promise<void>;
  applyMode(id: string): Promise<void>;
  deployAvailable(): Promise<void>;
  installGlobals(): Promise<void>;
  openTab(name: string): void;
  loadOutputTokens(): Promise<void>;
};
declare const SkillsTab: {
  init?: () => void;
  refresh?: () => Promise<void> | void;
  render?: () => void;
  handleToggle?: (id: string, enabled: boolean) => Promise<void> | void;
  setFilter?: (key: string, value: string) => void;
  clearFilters?: () => void;
  openFilters?: () => void;
  setView?: (view: string) => void;
  setSource?: (source: string) => void;
  setCategory?: (category: string) => void;
  ingest?: () => Promise<void>;
  quickAdd?: () => Promise<void>;
  toggleSelect?: (id: string) => void;
  selectAll?: () => void;
  selectNone?: () => void;
  bulkEnable?: () => Promise<void>;
  bulkDisable?: () => Promise<void>;
  openDetail?: (id: string) => void;
  applySuggestion?: (id: string) => Promise<void>;
  parseDescriptions?: () => Promise<void>;
  organiseLibrary?: () => Promise<void>;
  openConnectModal?: () => void;
  closeConnectModal?: () => void;
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
declare const SidePanel: {
  open(title: string, contentHTML: string): void;
  close(): void;
  isOpen(): boolean;
};
declare const CompileView: {
  availableTargets(tools: Record<string, ToolRecord>, readiness: TargetReadiness): string[];
  isToolAvailable(id: string, tool?: ToolRecord | null): boolean;
  renderMcpHostActions(host: McpHostRecord): string;
  renderMcpHostConfig(host: McpHostRecord): string;
  renderMcpHosts(hosts: McpHostRecord[], tools?: Record<string, ToolRecord>): string;
  renderToolActions(id: string, tool: ToolRecord): string;
  renderToolConfig(id: string, tool: ToolRecord): string;
  statusLabel(status: string): string;
  targetLabel(id: string): string;
};
declare const CompileConnectionView: {
  renderLogo(host: McpHostRecord): string;
  renderPageStatus(status: IndexStatusView, ctx: { hosts: McpHostRecord[] }): string;
  renderRows(host: McpHostRecord): string;
};
declare function loadSkillData(): Promise<void>;
declare const ModesTab: {
  init(): void;
  apply(id: string): Promise<void>;
  openDetail(id: string): void;
  openFilters(): void;
  setFilter(key: string, value: string): void;
  clearFilters(): void;
  editMode(id: string): void;
  saveEdit(id: string): Promise<void>;
  deleteMode(id: string): Promise<void>;
  createNew(): void;
  openCreateModal(): void;
  closeCreateModal(): void;
  createFromModal(): Promise<void>;
  syncCreateShortcut(): void;
  renderCreateSkills(): void;
  filterCreateSkills(value: string): void;
  updateCreateSkillCount(): void;
};
declare const MemoryTab: {
  init(): void;
  render(): void;
  select(id: string): void;
  setFilter(key: string, value: string): void;
  clearFilters(): void;
  openFilters(): void;
  setView(view: string): void;
  startEdit(id: string): void;
  saveEdit(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  addEntry(): void;
  openAddModal(): void;
  closeAddModal(): void;
  createFromModal(): Promise<void>;
};
declare const ConfigTab: {
  init(): void;
};
declare const CompileTab: {
  init(): Promise<void> | void;
  installGlobal(targets: string[]): Promise<void>;
  installAllDetected(): Promise<void>;
  deployTarget(targetId: string): Promise<void>;
  deployAllAvailable(): Promise<void>;
  copyOutput(targetId: string): Promise<void>;
  renderMcpHosts(): Promise<void>;
  refreshMcpHosts(): Promise<void>;
  refreshConnections(): Promise<void>;
  openHostConfig(hostId: string): void;
  openToolConfig(targetId: string): void;
  closeHostConfig(event?: MouseEvent): void;
  handleCardKey(event: KeyboardEvent, kind: 'host' | 'tool', id: string): void;
  installMcpHost(hostId: string): Promise<void>;
  copyMcpSnippet(hostId: string): Promise<void>;
  previewTarget(targetId: string): Promise<void>;
  compileAllWorkspaces(): Promise<void>;
};
declare const RulesLab: {
  mount(target?: HTMLElement | string): void;
  init(): Promise<void> | void;
  refresh(): void;
  beforeSave(): void;
  saveProfile(): Promise<void>;
  applyProfile(): Promise<void>;
  restoreHistory(index: number): void;
  switchPanel(id: string, button?: HTMLElement): void;
};
declare const SkillsMaintenance: {
  open(): void;
  close(): void;
  run(): Promise<void>;
  updateProvider(provider: string): void;
  applyReview(index: number): Promise<void>;
  applyAllReviews(): Promise<void>;
  resolveDedup(clusterId: string, action: string): Promise<void>;
};
declare const SkillSourcesPanel: {
  init(): Promise<void> | void;
  refresh(): Promise<void> | void;
  linkPath(path: string, label?: string): Promise<void>;
  linkCustom(): Promise<void>;
  browse(): Promise<void>;
  unlink(id: string): Promise<void>;
  import(id: string): Promise<void>;
  check(id: string): Promise<void>;
  closeDiff(id: string): void;
  apply(id: string, mode: 'append' | 'overwrite'): Promise<void>;
  _setPath(value: string): void;
};
declare const Onboarding: {
  init(): Promise<void> | void;
  go(stepId: string): void;
  toggleHost(hostId: string, selected: boolean): void;
  connectHost(hostId: string): Promise<void>;
  buildIndex(): Promise<void>;
  finish(): Promise<void>;
  skip(): Promise<void>;
};
declare function animateCount(element: HTMLElement, value: number): void;
declare function esc(value: unknown): string;
declare function switchTabByName(name: string): void;

// API helper exposed by ui/store.js — every UI module calls into it directly
// instead of going through DS for ad-hoc requests.
declare function apiFetch<T = any>(
  path: string,
  method?: string,
  body?: unknown,
  options?: { returnErrors?: boolean },
): Promise<T>;

// Lightweight stateful UI helpers loaded from sibling UI modules.
declare const ServerStatus: {
  init?: () => void;
  refresh?: () => Promise<void> | void;
  set?: (state: 'online' | 'offline' | 'connecting') => void;
};

declare const ContextFlow: {
  init?: () => void;
  refresh?: () => Promise<void> | void;
  setActive?: (id: string) => void;
};

// Map of toolId → ToolRecord; surfaced by /api/tools/detect.
type ToolMap = Record<string, ToolRecord>;

// Electron preload exposes a small bridge on window.contextEngineDesktop.
interface Window {
  contextEngineDesktop?: {
    onUpdateEvent: (
      cb: (payload: {
        type: string;
        message?: string;
        version?: string;
        percent?: number;
        [key: string]: unknown;
      }) => void,
    ) => void;
    installUpdate: () => void;
    appVersion?: string;
    runtime?: 'electron' | 'browser' | string;
    selectFolder?: (options?: { title?: string }) => Promise<string | null>;
  };
  CESelect?: typeof CESelect;
}
