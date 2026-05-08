# MCP Bridge

Context Engine exposes its skill index to AI host apps through a shared read-only tool contract. The first transport is local MCP over stdio: Claude Desktop, Codex CLI, Cursor, and compatible desktop/IDE hosts spawn `mcp-server.mjs` as a child process, and the MCP server forwards each tool call to the local CE HTTP server on `127.0.0.1:3847`.

This means CE works inside local chat-style apps that don't read project files (CLAUDE.md, AGENTS.md, etc.) — the host calls into CE on demand instead of being preloaded with a giant compiled context.

Claude Desktop has two local paths:

- `claude_desktop_config.json` for manual stdio MCP registration.
- A local desktop extension bundle (`.mcpb`) for the Blender-style install flow, where Claude Desktop launches a local wrapper and the user only configures the Context Engine port.

ChatGPT app support is a separate transport, not a different reading of the same local setup. ChatGPT's current custom MCP/app flow is remote-server oriented and cannot spawn this local stdio server directly. Use `mcp-http-server.mjs` behind HTTPS for that path.

---

## Prerequisites

1. **CE must be running.** Start the desktop app, or run `npm start` from the `app/` directory. The MCP server is a thin client; without CE behind it, every tool call returns `CE_UNREACHABLE`.
2. **Index must be built** for `context_engine_search` to return results. From the desktop app, click "Reindex," or `POST /api/index` from a terminal.
3. **Node 22+** must be on `PATH` (the host needs to spawn `node mcp-server.mjs`).

---

## Tools exposed

| Tool                         | Purpose                                                           |
| ---------------------------- | ----------------------------------------------------------------- |
| `context_engine_search`      | Vector search over indexed skill chunks. Top-k ranked results.    |
| `context_engine_list_skills` | Manifest of all skills (id, name, category, description, active). |
| `context_engine_get_skill`   | Full skill body, optionally a single `## section` slice.          |
| `context_engine_status`      | Index health: chunk count, model, last-indexed timestamp.         |

The expected usage pattern is **status → list/search → get_skill**: a model calls `context_engine_status` to confirm the index is fresh, narrows candidates with `context_engine_search` or `context_engine_list_skills`, then pulls full text for the one or two skills that matter via `context_engine_get_skill`. This is the token-saver: nothing irrelevant ever enters the context window.

---

## Claude Desktop

### Local Desktop Extension

For the Blender-style local connector flow, install:

```text
dist/context-engine-claude-desktop.mcpb
```

Build it from source:

```bash
npm run mcpb:pack
```

During installation, set **Context Engine Port** to `3847` unless CE is running on a different port. Claude Desktop launches the bundled stdio wrapper locally; the wrapper forwards tool calls to `http://127.0.0.1:<port>`.

This path does not need HTTPS, OAuth, Cloudflare, or a public URL. It is desktop-local only, like Blender's connector.

### Manual Config

Edit `claude_desktop_config.json`:

- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

Add a `mcpServers` entry. Replace `<ABSOLUTE_PATH_TO_APP>` with the absolute path to your CE checkout's `app/` directory:

```json
{
  "mcpServers": {
    "context-engine": {
      "command": "node",
      "args": ["<ABSOLUTE_PATH_TO_APP>/mcp-server.mjs"],
      "env": {
        "CE_HOST": "127.0.0.1",
        "CE_PORT": "3847"
      }
    }
  }
}
```

Restart Claude Desktop. The four tools should appear in the tools menu. If they don't, check Claude Desktop's MCP log — typical issues are an absolute path with the wrong slashes on Windows (use forward slashes or escape backslashes) or a stale Node version.

---

## Codex CLI

Edit `~/.codex/config.toml`:

```toml
[mcp_servers.context-engine]
command = "node"
args = ["<ABSOLUTE_PATH_TO_APP>/mcp-server.mjs"]

[mcp_servers.context-engine.env]
CE_HOST = "127.0.0.1"
CE_PORT = "3847"
```

Restart any active Codex session.

> Note: Codex CLI also reads `AGENTS.md` from the current repo. CE already produces AGENTS.md via the existing compile flow, so inside a repo with a CE-compiled `AGENTS.md` you have **two** bridges available (file + MCP). MCP is preferred for token economy; the file is the fallback when the model would benefit from baseline context up-front.

---

## ChatGPT app / web

The ChatGPT app path is not covered by local stdio MCP. Current ChatGPT custom MCP support is gated by plan/workspace settings and expects a remote server/connector flow rather than a local child process. Context Engine ships a Streamable HTTP adapter exposing the same tool contract:

- `context_engine_search`
- `context_engine_list_skills`
- `context_engine_get_skill`
- `context_engine_status`

Run it locally:

```bash
set MCP_OAUTH_PASSWORD=<operator-passphrase>
npm run mcp:http
```

Defaults:

- URL: `http://127.0.0.1:3850/mcp`
- Health check: `http://127.0.0.1:3850/health`
- Auth: OAuth authorization-code + PKCE when `MCP_OAUTH_PASSWORD` is set. Claude discovers this through OAuth protected-resource metadata, dynamically registers a client, opens the consent page, then sends bearer tokens to `/mcp`.
- Legacy local smoke auth: static bearer token when `MCP_HTTP_TOKEN` is set and `MCP_OAUTH_PASSWORD` is not set.

For Claude/ChatGPT remote connectors, put this server behind a trusted HTTPS tunnel or hosted endpoint, then register the HTTPS `/mcp` URL in the connector settings. Do not expose the adapter without OAuth or another auth layer.

### ChatGPT remote connector — runbook

This is the validated end-to-end flow for connecting ChatGPT app/web to your local CE via a Cloudflare Tunnel. Cloudflare is recommended over ngrok for this use case because it issues a stable, unauthenticated `*.trycloudflare.com` URL with no install state, and CE's OAuth provides the auth layer.

**1. Run the HTTP adapter with OAuth.**

```bash
# Windows (PowerShell)
$env:MCP_OAUTH_PASSWORD = "<operator-passphrase>"
$env:MCP_PUBLIC_URL = "https://<your-tunnel>.trycloudflare.com"
npm run mcp:http

# macOS / Linux
export MCP_OAUTH_PASSWORD=<operator-passphrase>
export MCP_PUBLIC_URL=https://<your-tunnel>.trycloudflare.com
npm run mcp:http
```

`MCP_PUBLIC_URL` is required: the OAuth metadata endpoints have to advertise the tunnel URL, not `http://127.0.0.1:3850`, or ChatGPT's connector will redirect to a localhost page and fail. CE refuses to bind a non-loopback host without auth, so do not unset `MCP_OAUTH_PASSWORD`.

**2. Open the Cloudflare Tunnel.** In a second terminal:

```bash
cloudflared tunnel --url http://127.0.0.1:3850
```

`cloudflared` prints a `https://<random>.trycloudflare.com` URL after a few seconds. That's the value to plug into `MCP_PUBLIC_URL` (restart the adapter so it picks it up — the metadata bakes in at startup). The same URL is what ChatGPT will register.

**3. Register the connector in ChatGPT.**

1. Open ChatGPT (web or desktop).
2. Settings → Connectors → Developer mode → "Add a custom connector."
3. Connector name: `Context Engine` (any label is fine).
4. URL: `https://<your-tunnel>.trycloudflare.com/mcp` — note the trailing `/mcp`.
5. Click Connect. ChatGPT performs OAuth dynamic client registration; the consent page appears in a popup.
6. Enter your `MCP_OAUTH_PASSWORD` and click Approve.

**4. Verify.** In a new ChatGPT chat, ask something that should require a CE skill (e.g. "use context engine to find any active skills about Python testing"). The tool transcript should show `context_engine_search` firing and returning ranked chunks.

**Common failure modes:**

- ChatGPT shows "Couldn't connect" → check that `MCP_PUBLIC_URL` exactly matches the tunnel URL and the adapter was restarted after setting it.
- OAuth approval succeeds but tools never appear → ChatGPT cached an old discovery doc; remove the connector and re-add it after restarting the adapter.
- Tools list is empty / `context_engine_status` returns `ready: false` → the index isn't built. Open the CE desktop app, go to Outputs → Vector index → "Build / rebuild," wait for the indeterminate bar to finish, then retry the chat.
- `cloudflared` prints "tunnel not found" → leftover state from a prior session; close all `cloudflared` processes and retry.

**Production deployment.** For anything beyond developer testing, swap `cloudflared tunnel --url ...` for a named Cloudflare Tunnel bound to your own domain, or host the adapter behind your own HTTPS reverse proxy. Either way, keep `MCP_OAUTH_PASSWORD` set and the bind address loopback.

## Host coverage matrix

| Host surface                      | Bridge path                                                                         | Status                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Claude Desktop                    | Local desktop extension (`.mcpb`) or local MCP stdio (`claude_desktop_config.json`) | MVP supported; extension bundle smoke-tested                    |
| Codex CLI                         | Local MCP stdio (`~/.codex/config.toml`)                                            | MVP supported                                                   |
| Cursor / compatible IDE MCP hosts | Local MCP stdio or host-specific MCP config                                         | Same server, config TBD                                         |
| Legacy file-based tools           | Existing compile outputs (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, etc.)           | Existing fallback                                               |
| ChatGPT app / web                 | Streamable HTTP MCP adapter (`mcp-http-server.mjs`) behind HTTPS                    | Adapter implemented; connector/tunnel validation still required |

---

## Verification

From the `app/` directory, with no host attached:

```bash
npm run smoke:mcp
npm run smoke:mcpb
npm run smoke:mcp:http
```

The stdio smoke test starts an in-process CE HTTP server on port 3858, spawns `mcp-server.mjs`, performs the stdio handshake, lists tools, validates each tool's schema, and exercises every tool with at least one call. The MCPB smoke test starts CE on port 3864, spawns the desktop-extension wrapper, lists tools, and calls `context_engine_status`. The HTTP smoke test starts CE on port 3861, spawns `mcp-http-server.mjs` on port 3862, checks bearer-token rejection, connects over Streamable HTTP, and calls `context_engine_status`.

To exercise the running production server (port 3847) instead, with CE already running:

```bash
node mcp-server.mjs
```

then drive it manually with an MCP client. The Anthropic MCP Inspector is the simplest way to do this interactively.

---

## Environment variables

| Variable  | Default     | Purpose                     |
| --------- | ----------- | --------------------------- |
| `CE_HOST` | `127.0.0.1` | Host of the CE HTTP server. |
| `CE_PORT` | `3847`      | Port of the CE HTTP server. |

Both can be overridden in the host config's `env` block, useful when CE runs on a non-default port or is reverse-proxied.

---

## Troubleshooting

- **`CE_UNREACHABLE` on every call** — CE HTTP server isn't running. Start the desktop app or `npm start`.
- **`Index is empty`** — the vector index hasn't been built. Trigger `POST /api/index` or use the desktop app's reindex action.
- **Tools list is empty in the host** — the host didn't spawn the MCP server. Check the host's MCP log; typical cause is a wrong absolute path or `node` not on PATH.
- **`Cannot find module '@modelcontextprotocol/sdk/...'`** — run `npm install` in the `app/` directory. The SDK is a runtime dependency.
- **stdout pollution warnings** — the MCP server writes only to stderr; stdout is reserved for the protocol. If you see protocol errors, check that no library you've added is logging to stdout from inside the MCP process.
