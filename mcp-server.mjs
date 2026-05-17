// @ts-check

// mcp-server.mjs — Context Engine local stdio MCP bridge.
//
// Spawned by local host apps (Claude Desktop, Codex CLI, compatible IDE MCP
// clients). The tool contract lives in mcp-tools.mjs so stdio and HTTP
// transports expose identical tools.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CE_BASE, createContextEngineMcpServer } from './mcp-tools.mjs';

const server = createContextEngineMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);

// stderr is the only safe channel under stdio MCP; stdout is protocol traffic.
process.stderr.write(`context-engine MCP server connected (CE_BASE=${CE_BASE})\n`);
