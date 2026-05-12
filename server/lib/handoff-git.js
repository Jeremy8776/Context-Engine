// @ts-check

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const COMMIT_TIMELINE_LIMIT = 12;

// Hard cap on every git subprocess so a hostile or hung repo (network mounts,
// stuck fsmonitor, broken .git) cannot freeze /api/handoffs.
const GIT_TIMEOUT_MS = 5000;

// Defensive git flags. `protocol.allow=never` prevents remote-helper spawn on
// commands that don't need network. `core.fsmonitor=false` blocks attacker-
// controlled fsmonitor hooks from running on read-only commands. Inserted via
// `-c` overrides so they apply to a single invocation without changing the
// repo's own config.
const SAFE_GIT_ARGS = ['-c', 'protocol.allow=never', '-c', 'core.fsmonitor=false'];

/** @param {string | undefined} repoPath */
function repoExists(repoPath) {
  if (!repoPath) return false;
  // UNC paths are refused upstream by skill-sources/handoff create, but
  // double-check at the spawn boundary since this is what's about to invoke
  // git with the path as cwd.
  if (/^\\\\/.test(repoPath) || /^\/\//.test(repoPath)) return false;
  if (!path.isAbsolute(repoPath)) return false;
  try {
    return fs.statSync(repoPath).isDirectory();
  } catch {
    return false;
  }
}

/** @param {string} repoPath @param {string[]} args */
function runGit(repoPath, args) {
  return execFileSync('git', [...SAFE_GIT_ARGS, ...args], {
    cwd: repoPath,
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    windowsHide: true,
  });
}

/**
 * @param {string} repoPath
 * @returns {string | undefined}
 */
function currentHeadSha(repoPath) {
  if (!repoExists(repoPath)) return undefined;
  try {
    return runGit(repoPath, ['rev-parse', 'HEAD']).trim();
  } catch {
    return undefined;
  }
}

/**
 * Count commits between the recorded head_sha and current HEAD.
 *
 * @param {string} repoPath
 * @param {string} sha
 * @returns {number | null}
 */
function commitsPastSha(repoPath, sha) {
  if (!repoExists(repoPath) || !sha) return null;
  // Sha format check — refuse anything that isn't 7–40 hex chars so a
  // crafted sha can't smuggle additional args even though execFile already
  // arg-quotes properly.
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) return null;
  try {
    const output = runGit(repoPath, ['rev-list', `${sha}..HEAD`, '--count']);
    const count = parseInt(output.trim(), 10);
    return Number.isFinite(count) ? count : null;
  } catch {
    return null;
  }
}

/**
 * Recent commits since the handoff's recorded head. Bounded because this data
 * is also returned to LLM hosts via MCP.
 *
 * @param {string} repoPath
 * @param {string} sha
 * @param {number=} limit
 * @returns {{ sha: string, short_sha: string, date: string, subject: string }[]}
 */
function commitTimeline(repoPath, sha, limit = COMMIT_TIMELINE_LIMIT) {
  if (!repoExists(repoPath) || !sha) return [];
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) return [];
  const capped = Math.min(Math.max(Number(limit) || COMMIT_TIMELINE_LIMIT, 1), 50);
  try {
    const output = runGit(repoPath, [
      'log',
      '--date=iso-strict',
      '--pretty=format:%H%x1f%h%x1f%ad%x1f%s',
      `--max-count=${capped}`,
      `${sha}..HEAD`,
    ]);
    return output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [fullSha = '', shortSha = '', date = '', subject = ''] = line.split('\x1f');
        return { sha: fullSha, short_sha: shortSha, date, subject };
      })
      .filter((commit) => commit.sha && commit.short_sha);
  } catch {
    return [];
  }
}

module.exports = {
  COMMIT_TIMELINE_LIMIT,
  GIT_TIMEOUT_MS,
  currentHeadSha,
  commitsPastSha,
  commitTimeline,
};
