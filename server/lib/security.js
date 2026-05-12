// security.js — local-server hardening helpers.
//
// CE binds to 127.0.0.1 by default but the loopback bind alone is not enough:
// any local process and any DNS-rebound web page can issue requests to it.
// `assertLocalRequest` enforces Host header + (when present) Origin header
// validation so that DNS-rebinding attacks and cross-origin browser-side
// CSRF are rejected before any handler runs.
//
// `assertSafeWritePath` is a defence-in-depth check applied to user-controlled
// output directories (workspaces, /api/compile outputDir). It blocks writes
// into well-known sensitive locations even when an attacker has somehow
// reached the API surface.

// @ts-check

const os = require('os');
const path = require('path');

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeHost(value) {
  if (!value) return '';
  const trimmed = String(value).trim().toLowerCase();
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']');
    if (end === -1) return trimmed;
    return trimmed.slice(1, end);
  }
  const head = trimmed.split(':')[0];
  return head || '';
}

/**
 * Returns true if the request is safe to handle (Host points at this loopback
 * server and any Origin/Referer is loopback or absent).
 *
 * @param {import('http').IncomingMessage} req
 * @param {number} port
 */
function isLocalRequest(req, port) {
  const allowedHosts = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
  const allowedOriginHosts = new Set(['127.0.0.1', 'localhost', '::1']);

  // The port on which CE actually listens is the request's destination — if a
  // request reached this server, the Host port is informational only. The
  // important check is that the *hostname* is a loopback name. Rejecting on
  // hostname blocks DNS-rebinding attacks (which present a public name in the
  // Host header) without coupling the helper to whichever port the embedded
  // server happens to be using in tests vs. production.
  void port;
  const hostHeader = req.headers.host || '';
  const hostName = normalizeHost(hostHeader);
  if (!allowedHosts.has(hostName) && !allowedHosts.has(`[${hostName}]`)) return false;

  const origin = req.headers.origin;
  if (origin) {
    try {
      const u = new URL(origin);
      if (!allowedOriginHosts.has(u.hostname.toLowerCase())) return false;
    } catch {
      return false;
    }
  }

  return true;
}

const DEFAULT_DENY_FRAGMENTS = [
  // Credential & SSH material.
  '.ssh',
  '.aws',
  '.gnupg',
  '.kube',
  // Host-app config/extension dirs.
  path.join('AppData', 'Roaming', 'Claude'),
  path.join('AppData', 'Roaming', 'Code'),
  path.join('AppData', 'Roaming', 'Cursor'),
  path.join('Library', 'Application Support', 'Claude'),
  path.join('Library', 'Application Support', 'Code'),
  // Browser profile dirs (cookie / token theft surface).
  path.join('AppData', 'Local', 'Google'),
  path.join('AppData', 'Local', 'Microsoft', 'Edge'),
  path.join('Library', 'Application Support', 'Google'),
  path.join('Library', 'Application Support', 'Firefox'),
  // Package manager state.
  '.npm',
  '.cargo',
  '.gradle',
  '.m2',
  // OS-level dirs.
  'System32',
  'Windows',
];

const DEFAULT_DENY_ABSOLUTE = (() => {
  const home = os.homedir();
  return [
    process.env.SystemRoot || 'C:\\Windows',
    'C:\\Windows',
    'C:\\Program Files',
    'C:\\Program Files (x86)',
    '/etc',
    '/usr',
    '/bin',
    '/sbin',
    '/System',
    '/Library/LaunchAgents',
    path.join(home, '.ssh'),
    path.join(home, '.aws'),
    path.join(home, '.gnupg'),
  ].filter(Boolean);
})();

/**
 * Returns `null` if the path is safe to write into, or an error string.
 * @param {string} requestedPath
 */
function checkSafeWritePath(requestedPath) {
  if (!requestedPath || typeof requestedPath !== 'string') return 'path is required';
  let resolved;
  try {
    resolved = path.resolve(requestedPath);
  } catch (e) {
    return `Invalid path: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Strip Windows extended-length and device-path prefixes BEFORE matching.
  // `\\?\C:\Windows` and `\\.\C:\Windows` would otherwise slip past the
  // `C:\Windows` startsWith check because of the leading prefix.
  let stripped = resolved.replace(/^[\\/]+\?[\\/]+/, '').replace(/^[\\/]+\.[\\/]+/, '');
  if (/^\\\\/.test(resolved) || /^\/\//.test(resolved)) {
    return 'Refusing to use UNC / network-share paths';
  }

  // Normalise all separators to the platform separator before comparing so
  // forward-slash inputs on Windows don't bypass segment checks that use
  // `path.sep` as the boundary character.
  const lower = stripped.toLowerCase().replace(/[\\/]/g, path.sep);
  for (const abs of DEFAULT_DENY_ABSOLUTE) {
    const a = abs.toLowerCase().replace(/[\\/]/g, path.sep);
    if (lower === a || lower.startsWith(a + path.sep)) {
      return `Refusing to write into protected location: ${abs}`;
    }
  }
  for (const frag of DEFAULT_DENY_FRAGMENTS) {
    const f = frag.toLowerCase();
    // Match as a path segment, not a substring within a longer name.
    if (lower.includes(path.sep + f + path.sep) || lower.endsWith(path.sep + f) || lower === f) {
      return `Refusing to write into protected directory segment: ${frag}`;
    }
  }
  return null;
}

// CSP shaped to the current UI: inline event handlers, inline <script>/<style>
// blocks in index.html, Google Fonts, and tool logos from public CDNs (https:
// img-src). 'unsafe-eval' is intentionally NOT allowed — that's the most
// valuable constraint we can keep with the current layout. Tighten further
// once inline handlers are migrated to addEventListener.
const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "connect-src 'self' http://127.0.0.1:* http://localhost:*",
    "img-src 'self' data: blob: https:",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};

module.exports = {
  isLocalRequest,
  checkSafeWritePath,
  SECURITY_HEADERS,
};
