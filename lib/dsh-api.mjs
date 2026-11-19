import { AppError } from './model.mjs';
import { assertObject, MAX_REQUEST_BYTES, missing } from './workbench.mjs';

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
function methodNotAllowed(response, allow) {
  response.setHeader('Allow', allow);
  throw new AppError(405, 'Method not allowed.', 'method_not_allowed');
}

export function createHandler(workbench, { mount, authorize }) {
  return async function handle(request, response) {
    setCommonHeaders(response);
    try {
      checkPostSite(request);
      const rejection = authorize(request);
      if (rejection) throw new AppError(rejection, 'Open TiinyDecide from your authenticated DSH window.', 'dsh_not_authorized');
      const wirePath = requestPath(request);
      if (!wirePath.startsWith(`${mount}/api/`)) throw missing('Route');
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
      throw missing('Route');
    } catch (error) {
      if (response.destroyed || response.headersSent) return;
      if (!request.complete) response.setHeader('Connection', 'close');
      if (error instanceof AppError) return sendJson(response, error.status, { error: { code: error.code, message: error.message } });
      console.error('TiinyDecide could not complete a request.');
      sendJson(response, 500, { error: { code: 'internal_error', message: 'The DSH Host could not complete this request. Check that the data directory is writable.' } });
    }
  };
}
