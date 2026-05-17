// @ts-check

// security-smoke.js — Smoke test for request validation and write-path protection

const assert = require('assert');
const path = require('path');

const { isLocalRequest, checkSafeWritePath } = require('../server/lib/security');

/** @type {(headers: Record<string, string>) => import('http').IncomingMessage} */
function mockReq(headers) {
  return /** @type {import('http').IncomingMessage} */ ({ headers });
}

// ---- isLocalRequest ----

// GIVEN a request with loopback Host header
// WHEN isLocalRequest checks it
assert.strictEqual(
  isLocalRequest(mockReq({ host: '127.0.0.1:3847' }), 3847),
  true,
  '127.0.0.1 host is local',
);
assert.strictEqual(
  isLocalRequest(mockReq({ host: 'localhost:3847' }), 3847),
  true,
  'localhost host is local',
);
assert.strictEqual(
  isLocalRequest(mockReq({ host: '[::1]:3847' }), 3847),
  true,
  'IPv6 loopback host is local',
);

// GIVEN a request with external Host header
assert.strictEqual(
  isLocalRequest(mockReq({ host: 'evil.example.com' }), 3847),
  false,
  'external hostname is not local',
);
assert.strictEqual(isLocalRequest(mockReq({ host: '192.168.1.1:3847' }), 3847), false, 'LAN IP is not local');

// GIVEN a request with no Host header
assert.strictEqual(isLocalRequest(mockReq({}), 3847), false, 'missing host header is not local');

// GIVEN a request with loopback Origin header and loopback Host
assert.strictEqual(
  isLocalRequest(mockReq({ host: '127.0.0.1', origin: 'http://localhost:3847' }), 3847),
  true,
  'loopback origin + loopback host is local',
);

// GIVEN a request with external Origin header and loopback Host (CSRF)
assert.strictEqual(
  isLocalRequest(mockReq({ host: '127.0.0.1', origin: 'https://evil.example.com' }), 3847),
  false,
  'external origin with loopback host is CSRF',
);

// GIVEN a request with malformed Origin header
assert.strictEqual(
  isLocalRequest(mockReq({ host: '127.0.0.1', origin: 'not-a-url' }), 3847),
  false,
  'malformed origin is rejected',
);

// ---- checkSafeWritePath ----

// GIVEN a normal project directory
assert.strictEqual(
  checkSafeWritePath(path.join(process.cwd(), 'my-project')),
  null,
  'normal project path is safe',
);

// GIVEN no path
assert.strictEqual(checkSafeWritePath(''), 'path is required', 'empty path is rejected');
assert.strictEqual(
  checkSafeWritePath(/** @type {string} */ (/** @type {unknown} */ (null))),
  'path is required',
  'null path is rejected',
);

// GIVEN Windows system directories (only meaningful on win32 where path.resolve
// produces an absolute Windows path that matches DEFAULT_DENY_ABSOLUTE entries)
if (process.platform === 'win32') {
  const sysResult = checkSafeWritePath('C:\\Windows\\System32\\drivers');
  assert.ok(sysResult !== null, 'Windows system dir is blocked');
  assert.ok(
    sysResult && sysResult.includes('Refusing to write into protected location'),
    'error mentions protected location',
  );

  const pfResult = checkSafeWritePath('C:\\Program Files\\MyApp');
  assert.ok(pfResult !== null, 'Program Files is blocked');
}

// GIVEN SSH directory
const homeSsh = path.join(require('os').homedir(), '.ssh');
assert.strictEqual(
  checkSafeWritePath(homeSsh),
  'Refusing to write into protected location: ' + homeSsh,
  'user .ssh dir is blocked',
);

// GIVEN a path with a protected fragment
assert.strictEqual(
  checkSafeWritePath(path.join(process.cwd(), 'my-project', '.ssh', 'keys')),
  'Refusing to write into protected directory segment: .ssh',
  '.ssh fragment in path is blocked',
);
assert.strictEqual(
  checkSafeWritePath(path.join(process.cwd(), 'my-project', '.aws', 'config')),
  'Refusing to write into protected directory segment: .aws',
  '.aws fragment in path is blocked',
);

// GIVEN a UNC path (Windows-specific — Linux collapses // to /)
if (process.platform === 'win32') {
  assert.strictEqual(
    checkSafeWritePath('\\\\server\\share\\path'),
    'Refusing to use UNC / network-share paths',
    'UNC path is blocked',
  );
}

// GIVEN a path that starts with protected but is different (e.g. ".sshconfig")
const safeButSimilar = path.join(process.cwd(), 'sshconfig-project');
assert.strictEqual(
  checkSafeWritePath(safeButSimilar),
  null,
  'path containing ssh as substring but not segment is safe',
);

console.log('security smoke ok');
