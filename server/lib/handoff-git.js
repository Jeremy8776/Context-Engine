// @ts-check

const fs = require('fs');
const { execFileSync } = require('child_process');

const COMMIT_TIMELINE_LIMIT = 12;

/** @param {string | undefined} repoPath */
function repoExists(repoPath) {
  if (!repoPath) return false;
  try {
    return fs.statSync(repoPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * @param {string} repoPath
 * @returns {string | undefined}
 */
function currentHeadSha(repoPath) {
  if (!repoExists(repoPath)) return undefined;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoPath,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
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
  try {
    const output = execFileSync('git', ['rev-list', `${sha}..HEAD`, '--count'], {
      cwd: repoPath,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
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
  const capped = Math.min(Math.max(Number(limit) || COMMIT_TIMELINE_LIMIT, 1), 50);
  try {
    const output = execFileSync(
      'git',
      [
        'log',
        '--date=iso-strict',
        '--pretty=format:%H%x1f%h%x1f%ad%x1f%s',
        `--max-count=${capped}`,
        `${sha}..HEAD`,
      ],
      {
        cwd: repoPath,
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf8',
      },
    );
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
  currentHeadSha,
  commitsPastSha,
  commitTimeline,
};
