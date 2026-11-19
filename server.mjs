import { readFile, realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from './public/model.mjs';
import { createAuth } from './lib/auth.mjs';
import { assertObject, MAX_REQUEST_BYTES, missing, openWorkbench } from './lib/workbench.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const LOOPBACK = '127.0.0.1';
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon',
};

function setCommonHeaders(response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
}
function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}
function download(response, filename, body) {
  response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  sendJson(response, 200, body);
}

function checkPostSite(request) {
  if (request.method !== 'POST') return;
  const fetchSites = request.headersDistinct['sec-fetch-site'];
  if (fetchSites && (fetchSites.length !== 1 || !['same-origin', 'none'].includes(fetchSites[0]))) {
    throw new AppError(403, 'Cross-origin requests are not accepted.', 'cross_origin');
  }
}
function standaloneGuard(request) {
  const port = request.socket.localPort;
  const hosts = request.headersDistinct.host;
  const host = hosts?.[0]?.toLowerCase();
  const suffix = port === 80 ? '' : `:${port}`;
  const allowed = new Set([`${LOOPBACK}${suffix}`, `localhost${suffix}`, `${LOOPBACK}:${port}`, `localhost:${port}`]);
  if (hosts?.length !== 1 || !allowed.has(host)) throw new AppError(403, 'Use the local server address.', 'invalid_host');
  if (request.method === 'POST') {
    const origins = request.headersDistinct.origin;
    const origin = `http://${host.replace(/:80$/, '')}`;
    if (origins && (origins.length !== 1 || origins[0] !== origin)) {
      throw new AppError(403, 'Cross-origin requests are not accepted.', 'cross_origin');
    }
  }
}
function requestPath(request) {
  if (!request.url?.startsWith('/') || request.url.startsWith('//')) throw new AppError(400, 'Invalid request target.');
  return request.url.split('?', 1)[0];
}
async function receiveJson(request) {
  const type = request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase();
  if (type !== 'application/json') throw new AppError(415, 'Send application/json.', 'unsupported_media_type');
  if (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity') {
    throw new AppError(415, 'Compressed request bodies are not supported.', 'unsupported_media_type');
  }
  function tooLarge() { return new AppError(413, 'The request body exceeds 1 MiB.', 'request_too_large'); }
  if (Number(request.headers['content-length']) > MAX_REQUEST_BYTES) throw tooLarge();
  let bytes = 0;
  const chunks = [];
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > MAX_REQUEST_BYTES) throw tooLarge();
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks, bytes).toString('utf8')); }
  catch { throw new AppError(400, 'The request body is not valid JSON.'); }
  return assertObject(body);
}
function isWithin(directory, file) {
  const path = relative(directory, file);
  return !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`);
}
async function serveStatic(publicRoot, pathname, request, response) {
  const staticPath = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!/^[A-Za-z0-9_-][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*$/.test(staticPath)) throw missing('Page');
  const type = contentTypes[extname(staticPath)];
  if (!type) throw missing('Page');
  let data;
  try {
    const file = await realpath(resolve(publicRoot, staticPath));
    if (!isWithin(publicRoot, file) || !(await stat(file)).isFile()) throw missing('Page');
    data = await readFile(file);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') throw missing('Page');
    throw error;
  }
  response.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length });
  response.end(request.method === 'HEAD' ? undefined : data);
}
function methodNotAllowed(response, allow) {
  response.setHeader('Allow', allow);
  throw new AppError(405, 'Method not allowed.', 'method_not_allowed');
}

// The standalone server and the authenticated DSH Web route use the same transport and operations.
export function createHandler(workbench, { publicRoot, mount = '', authorize } = {}) {
  return async function handle(request, response) {
    setCommonHeaders(response);
    try {
      checkPostSite(request);
      if (authorize) {
        const rejection = authorize(request);
        if (rejection) throw new AppError(rejection, 'Open TiinyDecide from your authenticated DSH window.', 'dsh_not_authorized');
      } else {
        standaloneGuard(request);
      }
      const wirePath = requestPath(request);
      if (mount && !wirePath.startsWith(`${mount}/api/`)) throw missing('Route');
      const pathname = wirePath.slice(mount.length);
      const method = request.method;
      if (pathname === '/api/health') {
        if (method !== 'GET') methodNotAllowed(response, 'GET');
        return sendJson(response, 200, { ok: true });
      }
      if (pathname === '/api/connections') {
        if (method === 'GET') return sendJson(response, 200, { connections: workbench.connections() });
        if (method !== 'POST') methodNotAllowed(response, 'GET, POST');
        return sendJson(response, 200, { connection: await workbench.saveConnection(await receiveJson(request), request, response) });
      }
      if (pathname === '/api/connections/models') {
        if (method !== 'POST') methodNotAllowed(response, 'POST');
        return sendJson(response, 200, { discovery: await workbench.discoverModels(await receiveJson(request), request) });
      }
      if (pathname === '/api/connections/test') {
        if (method !== 'POST') methodNotAllowed(response, 'POST');
        return sendJson(response, 200, { test: await workbench.testConnection(await receiveJson(request), request) });
      }
      if (pathname === '/api/workflows') {
        if (method === 'GET') return sendJson(response, 200, { workflows: workbench.workflows() });
        if (method !== 'POST') methodNotAllowed(response, 'GET, POST');
        return sendJson(response, 200, { workflow: await workbench.saveWorkflow(await receiveJson(request)) });
      }
      if (pathname === '/api/workflows/import') {
        if (method !== 'POST') methodNotAllowed(response, 'POST');
        return sendJson(response, 200, { workflow: await workbench.importWorkflow(await receiveJson(request)) });
      }
      const workflowExport = /^\/api\/workflows\/([^/]+)\/export$/.exec(pathname);
      if (workflowExport) {
        if (method !== 'GET') methodNotAllowed(response, 'GET');
        const id = workflowExport[1];
        return download(response, `${id}.workflow.json`, workbench.exportWorkflow(id));
      }
      if (pathname === '/api/runs') {
        if (method !== 'GET') methodNotAllowed(response, 'GET');
        return sendJson(response, 200, { runs: workbench.runs() });
      }
      if (pathname === '/api/preview') {
        if (method !== 'POST') methodNotAllowed(response, 'POST');
        return sendJson(response, 200, { request: workbench.preview(await receiveJson(request)) });
      }
      if (pathname === '/api/run') {
        if (method !== 'POST') methodNotAllowed(response, 'POST');
        return sendJson(response, 200, { run: await workbench.run(await receiveJson(request), request) });
      }
      const runPath = /^\/api\/runs\/([^/]+)(?:\/(export|rerun))?$/.exec(pathname);
      if (runPath) {
        const [, id, action] = runPath;
        if (method !== (action === 'rerun' ? 'POST' : 'GET')) methodNotAllowed(response, action === 'rerun' ? 'POST' : 'GET');
        if (action === 'rerun') {
          const body = await receiveJson(request);
          if (Object.keys(body).length) throw new AppError(400, 'Send an empty object to rerun the saved request.');
          return sendJson(response, 200, { run: await workbench.rerun(id, request) });
        }
        if (action === 'export') return download(response, `${id}.run.json`, await workbench.exportRun(id));
        return sendJson(response, 200, { run: await workbench.getRun(id) });
      }
      if (!publicRoot || pathname === '/api' || pathname.startsWith('/api/')) throw missing('Route');
      if (method !== 'GET' && method !== 'HEAD') methodNotAllowed(response, 'GET, HEAD');
      return await serveStatic(publicRoot, pathname, request, response);
    } catch (error) {
      if (response.destroyed || response.headersSent) return;
      if (!request.complete) response.setHeader('Connection', 'close');
      if (error instanceof AppError) return sendJson(response, error.status, { error: { code: error.code, message: error.message } });
      console.error('TiinyDecide could not complete a request.');
      sendJson(response, 500, { error: { code: 'internal_error', message: 'The local server could not complete this request. Check that the data directory is writable.' } });
    }
  };
}

async function resolveExistingParents(path) {
  try { return await realpath(path); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return resolve(await resolveExistingParents(dirname(path)), basename(path));
  }
}
export async function validateDataDirectory(configuredDirectory) {
  const publicRoot = await realpath(resolve(ROOT, 'public'));
  const dataDirectory = await resolveExistingParents(configuredDirectory);
  const projectRoot = dirname(publicRoot);
  const systemTemp = await realpath(tmpdir());
  const home = await realpath(homedir());
  if (isWithin(dataDirectory, projectRoot) || isWithin(publicRoot, dataDirectory) ||
    [home, systemTemp, '/tmp', '/private/tmp', '/var/tmp'].includes(dataDirectory)) {
    throw new Error('Choose a dedicated data directory outside the public directory.');
  }
  return { dataDirectory, publicRoot };
}

export async function startServer() {
  try { process.loadEnvFile(resolve(ROOT, '.env')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Could not read the project .env file.'); }
  const portValue = process.env.TIINY_DECIDE_PORT ?? process.env.PORT ?? '4173';
  if (!/^\d{1,5}$/.test(portValue) || Number(portValue) > 65535) throw new Error('Use a port from 0 to 65535.');
  const { dataDirectory, publicRoot } = await validateDataDirectory(resolve(ROOT, process.env.TIINY_DECIDE_DATA_DIR || '.data'));
  const workbench = await openWorkbench(dataDirectory, createAuth());
  const server = createServer({ requestTimeout: 15_000, headersTimeout: 10_000 }, createHandler(workbench, { publicRoot }));
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(Number(portValue), LOOPBACK, () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const server = await startServer();
    console.log(`TiinyDecide is available at http://${LOOPBACK}:${server.address().port}`);
  } catch (error) {
    const message = error.code === 'EADDRINUSE' ? 'The local port is already in use.' : error.message;
    console.error(`Could not start TiinyDecide: ${message}`);
    process.exitCode = 1;
  }
}
