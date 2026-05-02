// @ts-check

const fs = require('fs');
const path = require('path');
const os = require('os');
const { TOOL_REGISTRY } = require('./tool-registry');

/**
 * @typedef {Object} Adapter
 * @property {(context: unknown) => string} fn
 * @property {string} filename
 *
 * @typedef {Object} DetectionOptions
 * @property {string=} dataDir
 * @property {string=} skillsDir
 * @property {(() => unknown)=} scanSkills
 * @property {Record<string, Adapter>=} adapters
 * @property {((options: DetectionOptions) => unknown)=} buildContext
 * @property {((content: string) => number)=} estimateTokens
 */

/**
 * @param {string=} homedir
 * @param {DetectionOptions} opts
 */
function detectTools(homedir, opts = {}) {
  homedir = homedir || os.homedir();
  const results = {};
  let ctx = null;
  if (opts.dataDir && opts.scanSkills && opts.buildContext) {
    try { ctx = opts.buildContext(opts); } catch {
      ctx = null;
    }
  }
  for (const [id, reg] of Object.entries(TOOL_REGISTRY)) {
    const adapter = opts.adapters?.[id];
    const tool = baseTool(id, reg, homedir, adapter);
    for (const dp of reg.detectPaths) {
      const full = path.join(homedir, dp);
      if (fs.existsSync(full)) { tool.installed = true; tool.signals.push(dp); }
    }
    if (tool.globalPath && fs.existsSync(tool.globalPath)) tool.globalInstalled = true;
    if (tool.globalPath) tool.globalWritable = canWriteNear(tool.globalPath);
    validateAdapter(tool, adapter, ctx, opts.estimateTokens);
    tool.fileStandard = !!(!tool.detectionRequired && tool.supportsProject && !tool.supportsGlobal && reg.category !== 'manual');
    tool.available = !!(tool.installed || tool.globalInstalled || tool.fileStandard || reg.category === 'manual');
    tool.detected = !!(tool.installed || tool.globalInstalled);
    tool.projectReady = !!(tool.supportsProject && tool.compileReady && tool.available);
    tool.globalReady = !!(tool.supportsGlobal && tool.compileReady && tool.available && tool.globalPath && tool.globalWritable);
    tool.outputReady = !!(tool.compileReady && tool.available);
    tool.status = statusFor(tool);
    results[id] = tool;
  }
  return results;
}

/**
 * @param {string} id
 * @param {import('./tool-registry').ToolRegistryEntry} reg
 * @param {string} homedir
 * @param {Adapter | undefined} adapter
 */
function baseTool(id, reg, homedir, adapter) {
  return {
    id,
    label: reg.label,
    installed: false,
    signals: [],
    supportsGlobal: reg.supportsGlobal,
    supportsProject: reg.supportsProject,
    category: reg.category,
    detectionRequired: !!reg.detectPaths.length,
    detected: false,
    fileStandard: false,
    available: false,
    globalPath: reg.globalPath ? path.join(homedir, reg.globalPath) : null,
    globalInstalled: false,
    adapterReady: !!adapter,
    compileReady: false,
    compileError: null,
    previewTokens: null,
    globalReady: false,
    globalWritable: false,
    projectReady: false,
    outputReady: false,
    status: 'unavailable',
  };
}

/**
 * @param {ReturnType<typeof baseTool>} tool
 * @param {Adapter | undefined} adapter
 * @param {unknown} ctx
 * @param {((content: string) => number) | undefined} estimateTokens
 */
function validateAdapter(tool, adapter, ctx, estimateTokens) {
  if (!adapter) return;
  if (!ctx) {
    tool.compileReady = true;
    return;
  }
  try {
    const content = adapter.fn(ctx);
    tool.compileReady = typeof content === 'string' && content.trim().length > 0;
    tool.previewTokens = tool.compileReady && estimateTokens ? estimateTokens(content) : 0;
  } catch (e) {
    tool.compileError = e.message;
  }
}

/**
 * @param {string} filePath
 */
function canWriteNear(filePath) {
  let dir = path.dirname(filePath);
  while (dir && !fs.existsSync(dir)) {
    const next = path.dirname(dir);
    if (next === dir) break;
    dir = next;
  }
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {ReturnType<typeof baseTool>} tool
 */
function statusFor(tool) {
  if (!tool.adapterReady) return 'missing-adapter';
  if (!tool.compileReady) return 'compile-error';
  if (tool.outputReady) return tool.detected ? 'detected-ready' : 'output-ready';
  if (tool.globalPath && !tool.globalWritable) return 'global-blocked';
  if (!tool.available) return 'not-available';
  return 'unavailable';
}

module.exports = { detectTools };
