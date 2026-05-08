import crypto from 'node:crypto';

const SCOPE = 'context:read';
const TOKEN_TTL_SECONDS = 3600;

// Redirect URIs proposed by Dynamic Client Registration are accepted only when
// they match this allowlist. Prevents a phishing page from registering its own
// redirect target to harvest authorization codes after the user enters the
// operator passphrase.
const REDIRECT_HOST_PATTERNS = [
  /^https:\/\/claude\.ai(\/|$)/i,
  /^https:\/\/[a-z0-9-]+\.claude\.ai(\/|$)/i,
  /^https:\/\/chatgpt\.com(\/|$)/i,
  /^https:\/\/[a-z0-9-]+\.chatgpt\.com(\/|$)/i,
  /^https:\/\/chat\.openai\.com(\/|$)/i,
  /^http:\/\/127\.0\.0\.1(:\d+)?(\/|$)/i,
  /^http:\/\/localhost(:\d+)?(\/|$)/i,
];

function isAllowedRedirectUri(uri) {
  if (typeof uri !== 'string' || uri.length > 512) return false;
  return REDIRECT_HOST_PATTERNS.some((pattern) => pattern.test(uri));
}

function timingSafeStringEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) {
    // Still touch a constant-time compare against itself so the failure path
    // takes a similar amount of time as a same-length mismatch.
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function json(res, status, payload, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(payload));
}

function html(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (ch) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[ch],
  );
}

async function readParams(req) {
  const chunks = await collect(req);
  const text = Buffer.concat(chunks).toString('utf8');
  const contentType = req.headers['content-type'] || '';
  if (String(contentType).includes('application/json')) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(JSON.parse(text || '{}'))) {
      params.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
    return params;
  }
  return new URLSearchParams(text);
}

function publicOrigin(req) {
  if (process.env.MCP_PUBLIC_URL) return process.env.MCP_PUBLIC_URL.replace(/\/+$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host || '127.0.0.1';
  const proto =
    req.headers['x-forwarded-proto'] || (String(host).includes('trycloudflare.com') ? 'https' : 'http');
  return `${proto}://${String(host).split(',')[0]}`;
}

function codeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export function createOAuthProvider({ password }) {
  // In-memory only by design: this is a local broker, not a multi-tenant IdP.
  // A CE restart invalidates connected sessions; hosts must reauthorize.
  const clients = new Map();
  const codes = new Map();
  const tokens = new Map();
  const refreshTokens = new Map();

  function resource(req) {
    return `${publicOrigin(req)}/mcp`;
  }

  function protectedResourceMetadata(req) {
    return {
      resource: resource(req),
      authorization_servers: [publicOrigin(req)],
      scopes_supported: [SCOPE],
      bearer_methods_supported: ['header'],
      resource_name: 'Context Engine MCP',
    };
  }

  function authorizationServerMetadata(req) {
    const origin = publicOrigin(req);
    return {
      issuer: origin,
      authorization_endpoint: `${origin}/authorize`,
      token_endpoint: `${origin}/token`,
      registration_endpoint: `${origin}/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [SCOPE],
    };
  }

  function challenge(req, res) {
    const metadataUrl = `${publicOrigin(req)}/.well-known/oauth-protected-resource`;
    json(
      res,
      401,
      { ok: false, error: 'OAuth bearer token required.' },
      {
        'WWW-Authenticate': `Bearer resource_metadata="${metadataUrl}"`,
      },
    );
  }

  function validate(req) {
    const header = req.headers.authorization || '';
    if (!String(header).startsWith('Bearer ')) return false;
    const token = String(header).slice('Bearer '.length);
    const record = tokens.get(token);
    if (!record || record.expiresAt <= Date.now()) return false;
    return record.resource === resource(req);
  }

  async function register(req, res) {
    const params = await readParams(req);
    const redirectUris = params.get('redirect_uris') ? JSON.parse(params.get('redirect_uris')) : null;
    if (!Array.isArray(redirectUris) || !redirectUris.length) {
      json(res, 400, { error: 'invalid_client_metadata', error_description: 'redirect_uris is required' });
      return;
    }
    const rejected = redirectUris.filter((uri) => !isAllowedRedirectUri(uri));
    if (rejected.length) {
      json(res, 400, {
        error: 'invalid_redirect_uri',
        error_description: `redirect_uri not in allowlist: ${rejected.join(', ')}`,
      });
      return;
    }
    const clientId = `ce-${randomToken(18)}`;
    const client = {
      client_id: clientId,
      client_name: params.get('client_name') || 'Claude',
      redirect_uris: redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    };
    clients.set(clientId, client);
    json(res, 201, client);
  }

  function authorizePage(req, res, query) {
    const client = clients.get(query.get('client_id'));
    if (!client) {
      html(res, 400, '<h1>Unknown OAuth client</h1>');
      return;
    }
    const hidden = [...query.entries()]
      .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}" />`)
      .join('\n');
    html(
      res,
      200,
      `<!doctype html>
<html><head><title>Connect Context Engine</title></head>
<body style="font-family:system-ui;background:#060607;color:#e2e2e7;display:grid;place-items:center;min-height:100vh">
  <form method="post" action="/authorize" style="width:min(440px,92vw);border:1px solid #333;padding:24px;border-radius:12px;background:#111114">
    <h1 style="margin-top:0">Connect Context Engine</h1>
    <p>Approve read-only MCP access for ${escapeHtml(client.client_name || client.client_id)}.</p>
    ${hidden}
    <label style="display:block;margin:18px 0 8px">Operator passphrase</label>
    <input name="password" type="password" autofocus required style="box-sizing:border-box;width:100%;padding:10px;background:#050506;color:#e2e2e7;border:1px solid #444;border-radius:8px" />
    <button type="submit" style="margin-top:18px;padding:10px 14px;border-radius:8px;border:0;background:#7c3aed;color:white">Approve</button>
  </form>
</body></html>`,
    );
  }

  async function authorize(req, res) {
    const params = await readParams(req);
    if (!timingSafeStringEqual(params.get('password') || '', password)) {
      html(res, 403, '<h1>Invalid passphrase</h1>');
      return;
    }
    const client = clients.get(params.get('client_id'));
    const redirectUri = params.get('redirect_uri');
    if (!client || !client.redirect_uris.includes(redirectUri) || !isAllowedRedirectUri(redirectUri)) {
      html(res, 400, '<h1>Invalid OAuth request</h1>');
      return;
    }
    const code = randomToken(24);
    codes.set(code, {
      client_id: client.client_id,
      redirect_uri: redirectUri,
      code_challenge: params.get('code_challenge'),
      resource: params.get('resource') || resource(req),
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    const next = new URL(redirectUri);
    next.searchParams.set('code', code);
    if (params.get('state')) next.searchParams.set('state', params.get('state'));
    res.writeHead(302, { location: next.toString() });
    res.end();
  }

  async function token(req, res) {
    const params = await readParams(req);
    if (params.get('grant_type') === 'refresh_token') return refresh(req, res, params);
    const code = params.get('code');
    const record = codes.get(code);
    if (!record || record.expiresAt <= Date.now()) {
      json(res, 400, { error: 'invalid_grant' });
      return;
    }
    if (record.client_id !== params.get('client_id') || record.redirect_uri !== params.get('redirect_uri')) {
      json(res, 400, { error: 'invalid_grant' });
      return;
    }
    if (record.code_challenge !== codeChallenge(params.get('code_verifier') || '')) {
      json(res, 400, { error: 'invalid_grant', error_description: 'PKCE verification failed' });
      return;
    }
    codes.delete(code);
    issueTokens(req, res, record);
  }

  function refresh(req, res, params) {
    const presented = params.get('refresh_token');
    const record = refreshTokens.get(presented);
    if (!record) {
      json(res, 400, { error: 'invalid_grant' });
      return;
    }
    // Rotate: invalidate the presented refresh token before issuing the next pair.
    refreshTokens.delete(presented);
    issueTokens(req, res, record);
  }

  function issueTokens(req, res, baseRecord) {
    const accessToken = randomToken(32);
    const refreshToken = randomToken(32);
    const record = {
      client_id: baseRecord.client_id,
      resource: baseRecord.resource || resource(req),
      scope: SCOPE,
      expiresAt: Date.now() + TOKEN_TTL_SECONDS * 1000,
    };
    tokens.set(accessToken, record);
    refreshTokens.set(refreshToken, record);
    json(res, 200, {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: SCOPE,
    });
  }

  return {
    authorizationServerMetadata,
    authorize,
    authorizePage,
    challenge,
    protectedResourceMetadata,
    register,
    token,
    validate,
  };
}

async function collect(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks;
}
