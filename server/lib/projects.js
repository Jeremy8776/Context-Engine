// @ts-nocheck — Path-A backlog: file in tsconfig include, opt out until incremental typing is done. See docs/llm-handoff.md.

// projects.js — Project-scoped context directories

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');

const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');

function ensureDirs() {
  if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

function readRegistry() {
  try {
    return JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
  } catch {
    return { version: '1.0', projects: [] };
  }
}

function writeRegistry(data) {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function uniqueSlug(seed, taken) {
  const base =
    String(seed)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'project';
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function listProjects() {
  const reg = readRegistry();
  return Array.isArray(reg.projects) ? reg.projects : [];
}

function getProject(slug) {
  const projects = listProjects();
  return projects.find((p) => p.slug === slug) || null;
}

function createProject(input) {
  ensureDirs();
  const name = String(input?.name || '').trim();
  const repoPath = input?.path ? String(input.path).trim() : '';
  if (!name) return { ok: false, error: 'name is required' };

  const reg = readRegistry();
  const taken = new Set((reg.projects || []).map((p) => p.slug));
  const slug = uniqueSlug(name, taken);
  const now = new Date().toISOString();

  const projectDir = path.join(PROJECTS_DIR, slug);
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'handoffs'), { recursive: true });

  const defaultMemory = { version: '1.1', entries: [] };
  const defaultRules = { coding: '', general: '', soul: '' };
  fs.writeFileSync(path.join(projectDir, 'memory.json'), JSON.stringify(defaultMemory, null, 2), 'utf8');
  fs.writeFileSync(path.join(projectDir, 'rules.json'), JSON.stringify(defaultRules, null, 2), 'utf8');

  const project = {
    slug,
    name,
    path: repoPath || undefined,
    created: now,
    last_touched: now,
  };
  if (!Array.isArray(reg.projects)) reg.projects = [];
  reg.projects.push(project);
  writeRegistry(reg);
  return { ok: true, project };
}

function deleteProject(slug) {
  const reg = readRegistry();
  if (!Array.isArray(reg.projects)) return { ok: false, error: 'No projects' };
  const idx = reg.projects.findIndex((p) => p.slug === slug);
  if (idx === -1) return { ok: false, error: 'Project not found' };

  const projectDir = path.join(PROJECTS_DIR, slug);
  let dirError = null;
  try {
    fs.rmSync(projectDir, { recursive: true, force: true });
  } catch (e) {
    dirError = e instanceof Error ? e.message : String(e);
  }

  reg.projects.splice(idx, 1);
  writeRegistry(reg);

  if (dirError) return { ok: true, warning: `Directory removal failed: ${dirError}` };
  return { ok: true };
}

function updateProject(slug, patch) {
  const reg = readRegistry();
  if (!Array.isArray(reg.projects)) return { ok: false, error: 'No projects' };
  const project = reg.projects.find((p) => p.slug === slug);
  if (!project) return { ok: false, error: 'Project not found' };
  if (patch?.name) project.name = String(patch.name).trim();
  if (patch?.path !== undefined) project.path = String(patch.path).trim() || undefined;
  project.last_touched = new Date().toISOString();
  writeRegistry(reg);
  return { ok: true, project };
}

module.exports = {
  PROJECTS_DIR,
  PROJECTS_FILE,
  listProjects,
  getProject,
  createProject,
  deleteProject,
  updateProject,
};
