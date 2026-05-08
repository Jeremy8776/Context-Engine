// @ts-check

const http = require('http');

process.env.CE_PORT = process.env.CE_SMOKE_PORT || '3857';

const { PORT } = require('../server/lib/config');
const { startServer } = require('../server/server');

const ROUTES = [
  '/',
  '/api/health',
  '/api/skills',
  '/api/onboarding',
  '/api/index/status',
  '/api/mcp/hosts',
  '/api/tools/detect',
  '/api/workspaces',
];

/**
 * @param {string} path
 * @returns {Promise<number | undefined>}
 */
function get(path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path, timeout: 5000 }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('timeout', () => req.destroy(new Error(`Timeout: ${path}`)));
    req.on('error', reject);
  });
}

async function run() {
  const server = startServer({ port: PORT, refresh: false });
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    for (const route of ROUTES) {
      const status = await get(route);
      if (status === undefined || status < 200 || status >= 300) {
        throw new Error(`${route} returned ${status}`);
      }
      console.log(`${route} ${status}`);
    }
  } finally {
    server.close();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
