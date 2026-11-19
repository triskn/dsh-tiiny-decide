import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, realpath, rm, stat } from 'node:fs/promises';
import { createServer, get } from 'node:http';
import { join, basename, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { startServer } from '../server.mjs';
import { demoResponse } from '../examples/demo-upstream.mjs';

async function stop(server) {
  if (!server?.listening) return;
  await new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  });
}

async function listen(handler) {
  const server = createServer(handler).listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
}
const address = server => `http://127.0.0.1:${server.address().port}`;

const sessionToken = 'fixture-session-key-not-real';
const envToken = 'fixture-env-key-not-real';
const common = { name: 'Fixture A', preset: 'custom', model: 'fixture-a', timeoutSeconds: 2, auth: { mode: 'none' } };

test('standalone API acceptance, migration, auth, errors, and persistence', async t => {
  const parent = await realpath(tmpdir());
  const data = await mkdtemp(join(parent, 'tiiny-decide-acceptance-'));
  process.env.TIINY_DECIDE_PORT = '0';
  process.env.TIINY_DECIDE_DATA_DIR = data;
  process.env.TIINY_DECIDE_FIXTURE_KEY = envToken;
  const seen = [];
  let app;
  let upstream;
  t.after(async () => {
    await stop(app);
    await stop(upstream);
    if (dirname(data) === parent && basename(data).startsWith('tiiny-decide-acceptance-')) {
      await rm(data, { recursive: true, force: true });
    }
  });
  upstream = await listen(async (request, response) => {
    let input = '';
    for await (const chunk of request) input += chunk;
    const payload = input ? JSON.parse(input) : null;
    seen.push({ url: request.url, method: request.method, payload, authorization: request.headers.authorization });
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/v1/models') {
      if (request.headers.authorization !== `Bearer ${sessionToken}`) {
        response.writeHead(401).end(JSON.stringify({ message: 'Key required' }));
      } else {
        response.end(JSON.stringify({ data: [
          { id: 'vllm-sr/d3-lite', type: 'Text Classification' },
          { id: 'vllm-sr/d3-edge', type: 'text_classification' },
          { id: 'vllm-sr/d3-edge', type: 'Text Classification' },
          { id: 'Qwen/text-chat', type: 'Text Generation' },
          { id: sessionToken, type: 'Text Classification' },
        ] }));
      }
    } else if (request.url === '/v1/systemone' && payload?.model === 'unloaded-model') {
      response.writeHead(404).end(JSON.stringify({ message: '"unloaded-model" is not loaded.' }));
    } else if (request.url === '/loading') {
      response.writeHead(529, { 'Retry-After': '6' }).end(JSON.stringify({ message: 'Model is loading.' }));
    } else if (request.url === '/unauthorized') {
      response.writeHead(401).end(JSON.stringify({ message: 'Key required' }));
    } else if (request.url === '/bad-json') {
      response.end('<html>Not a model</html>');
    } else if (request.url === '/wrong-shape') {
      response.end(JSON.stringify({ answers: { wrong_id: {} } }));
    } else if (request.url === '/redirect') {
      response.writeHead(307, { Location: '/redirect-target' }).end();
    } else if (request.url === '/timeout') {
      const timer = setTimeout(() => response.end(JSON.stringify(demoResponse(payload))), 3000);
      response.once('close', () => clearTimeout(timer));
    } else {
      response.end(JSON.stringify({ ...demoResponse(payload), ...(request.headers.authorization ? { authEcho: request.headers.authorization, apiKey: request.headers.authorization.slice(7) } : {}) }));
    }
  });
  const fixtureUrl = `${address(upstream)}/v1/systemone`;
  app = await startServer();

  const call = async (path, body, headers = {}) => {
    const response = await fetch(address(app) + path, { ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...headers } }) });
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
  const saveConnection = async body => {
    const response = await call('/api/connections', { ...common, url: fixtureUrl, ...body });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    return response;
  };
  const workflows = (await call('/api/workflows')).data.workflows;
  const order = workflows.find(workflow => workflow.id === 'order-inbox');
  assert.equal(order.examples.length, 4);
  assert.equal(workflows.find(workflow => workflow.id === 'message-review').questions[0].type, 'noul');
  const seededConnection = (await call('/api/connections')).data.connections.find(connection => connection.id === 'tiiny-pocket');
  assert.equal(seededConnection.timeoutSeconds, 120);

  const tiinyDraft = { ...seededConnection, url: fixtureUrl, auth: { mode: 'session' } };
  const discovery = (await call('/api/connections/models', { ...tiinyDraft, model: '', sessionKey: sessionToken })).data.discovery;
  assert.equal(discovery.upstreamStatus, 200);
  assert.deepEqual(discovery.models, [{ id: 'vllm-sr/d3-edge' }, { id: 'vllm-sr/d3-lite' }]);
  assert.equal(seen.at(-1).method, 'GET');
  assert.equal(seen.at(-1).url, '/v1/models');
  assert.equal(seen.at(-1).authorization, `Bearer ${sessionToken}`);
  assert.doesNotMatch(JSON.stringify(discovery), new RegExp(sessionToken));
  const noKey = (await call('/api/connections/models', tiinyDraft)).data.discovery;
  assert.equal(noKey.error.code, 'missing_auth');
  assert.equal((await call('/api/connections/models', { ...tiinyDraft, preset: 'custom' })).status, 400);
  const unavailable = (await call('/api/connections/test', { ...tiinyDraft, model: 'unloaded-model', sessionKey: sessionToken })).data.test;
  assert.equal(unavailable.upstreamStatus, 404);
  assert.match(unavailable.error.message, /Open Model Management in TiinyOS/);

  // Edit the built-in, export it, import it as a separate workflow, and run it on two connections.
  order.questions[0].instructions += ' Judge only the current notice.';
  order.questions.push({ id: 'follow_up', type: 'noul', instructions: 'Did the sender ask for a reply?' });
  const saved = await call('/api/workflows', order);
  assert.equal(saved.status, 200);
  const exported = await call('/api/workflows/order-inbox/export');
  assert.match(exported.headers.get('content-disposition'), /attachment/);
  assert.equal(exported.data.version, 1);
  const imported = (await call('/api/workflows/import', exported.data)).data.workflow;
  assert.notEqual(imported.id, order.id);
  assert.deepEqual(imported.questions, order.questions);
  assert.deepEqual(imported.examples, order.examples);
  assert.deepEqual(imported.rules, order.rules);

  const connA = (await saveConnection({})).data.connection;
  const testA = (await call('/api/connections/test', connA)).data.test;
  assert.equal(testA.ok, true);
  assert.equal(testA.upstreamStatus, 200);
  assert.equal(seen.at(-1).payload.questions.probe.type, 'choice');
  const connB = (await saveConnection({ name: 'Fixture B', model: 'fixture-b', url: `${address(upstream)}/second/v1/systemone`, auth: { mode: 'env', envVar: 'TIINY_DECIDE_FIXTURE_KEY' } })).data.connection;
  const state = imported.examples[3].state;
  const runInput = { connectionId: connA.id, workflowId: imported.id, state };
  const runA = (await call('/api/run', runInput)).data.run;
  const runB = (await call('/api/run', { ...runInput, connectionId: connB.id })).data.run;
  assert.equal(runA.ok, true);
  assert.equal(runB.ok, true);
  assert.deepEqual(runA.request.state, state);
  assert.deepEqual(runA.request.questions, runB.request.questions);
  assert.equal(runA.request.model, 'fixture-a');
  assert.equal(runB.request.model, 'fixture-b');
  assert.equal(seen.at(-1).url, '/second/v1/systemone');
  assert.equal(seen.at(-1).authorization, `Bearer ${envToken}`);
  assert.doesNotMatch(JSON.stringify(runB), new RegExp(envToken));
  assert.equal(runA.results[0].modelAnswer, 'Action needed');
  assert.equal(runA.results[0].workflowResult, 'Needs review');
  assert.equal(runA.results[1].id, 'follow_up');
  assert.ok(runA.elapsedMs >= 0);
  assert.deepEqual((await call(`/api/runs/${runA.id}`)).data.run, runA);
  const runExport = (await call(`/api/runs/${runA.id}/export`)).data;
  assert.equal(runExport.format, 'tiiny-decide.run');
  assert.equal(runExport.version, 1);
  assert.deepEqual(runExport.run, runA);

  await saveConnection({ ...connA, model: 'changed-after-run' });
  await call('/api/workflows', { ...imported, name: 'Changed after run' });
  const replay = (await call(`/api/runs/${runA.id}/rerun`, {})).data.run;
  assert.deepEqual(replay.request, runA.request);
  assert.deepEqual(replay.connection, runA.connection);
  assert.deepEqual(replay.workflow, runA.workflow);
  assert.equal(replay.rerunOf, runA.id);

  // Session keys are scoped to an opaque cookie and endpoint; raw echo is not persisted.
  const secretSave = await saveConnection({ auth: { mode: 'session' }, sessionKey: sessionToken });
  const sessionConnection = secretSave.data.connection;
  const cookie = secretSave.headers.get('set-cookie').split(';', 1)[0];
  assert.match(secretSave.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.doesNotMatch(cookie, new RegExp(sessionToken));
  const sessionRunInput = { ...runInput, connectionId: sessionConnection.id };
  assert.equal((await call('/api/run', sessionRunInput)).data.run.error.code, 'missing_auth');
  const sessionRun = (await call('/api/run', sessionRunInput, { Cookie: cookie })).data.run;
  assert.equal(seen.at(-1).authorization, `Bearer ${sessionToken}`);
  assert.equal(sessionRun.ok, true);
  assert.doesNotMatch(JSON.stringify(sessionRun), new RegExp(sessionToken));
  assert.doesNotMatch(JSON.stringify((await call(`/api/runs/${sessionRun.id}/export`)).data), new RegExp(sessionToken));
  const differentDestination = (await call('/api/connections/test', { ...sessionConnection, url: `${address(upstream)}/other` }, { Cookie: cookie })).data.test;
  assert.equal(differentDestination.error.code, 'missing_auth');

  for (const [path, code, status] of [
    ['/unauthorized', 'upstream_http_401', 401], ['/loading', 'upstream_http_529', 529],
    ['/bad-json', 'invalid_upstream_response', 200], ['/wrong-shape', 'invalid_upstream_response', 200],
    ['/redirect', 'upstream_redirect', 307], ['/timeout', 'upstream_timeout', null],
  ]) {
    const { data: { test } } = await call('/api/connections/test', { ...common, timeoutSeconds: 1, url: address(upstream) + path });
    assert.equal(test.ok, false, path);
    assert.equal(test.upstreamStatus, status, path);
    assert.equal(test.error.code, code, path);
    if (status === 529) assert.equal(test.error.retryAfter, '6');
  }
  assert.ok(!seen.some(record => record.url === '/redirect-target'));
  const closed = await listen((_, response) => response.end());
  const closedUrl = address(closed);
  await stop(closed);
  const unreachable = (await call('/api/connections/test', { ...common, url: closedUrl })).data.test;
  assert.equal(unreachable.error.code, 'upstream_unreachable');
  assert.equal(unreachable.upstreamStatus, null);
  assert.equal((await call('/api/run', runInput, { Origin: 'http://outside.invalid' })).status, 403);
  const invalidHost = await new Promise((resolve, reject) => {
    get(`${address(app)}/api/health`, { headers: { Host: 'outside.invalid' } }, response => {
      response.resume();
      resolve(response.statusCode);
    }).on('error', reject);
  });
  assert.equal(invalidHost, 403);
  assert.equal((await call('/api/run', { ...runInput, state: false })).status, 400);
  assert.equal((await call('/api/workflows/import', { ...exported.data, version: 99 })).status, 400);

  const configPath = join(data, 'config.json');
  assert.doesNotMatch(await readFile(configPath, 'utf8'), /fixture-(?:session|env)-key-not-real/);
  for (const file of await readdir(join(data, 'runs'))) {
    assert.doesNotMatch(await readFile(join(data, 'runs', file), 'utf8'), /fixture-(?:session|env)-key-not-real/);
  }
  if (process.platform !== 'win32') assert.equal((await stat(configPath)).mode & 0o777, 0o600);
  await stop(app);
  app = await startServer();
  assert.ok((await call('/api/runs')).data.runs.find(run => run.id === runB.id));
  assert.ok((await call('/api/workflows')).data.workflows.find(workflow => workflow.id === imported.id));
  assert.equal((await call('/api/run', sessionRunInput, { Cookie: cookie })).data.run.error.code, 'missing_auth');
});
