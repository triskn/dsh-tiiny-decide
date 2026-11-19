import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { test } from 'node:test';
import { close, listen, origin, startDshHost } from './fixtures/dsh-host.mjs';
import { demoResponse } from './fixtures/system-one.mjs';

test('DSH Host binds a protected native route and shares state with the agent tool', async t => {
  const parent = await realpath(tmpdir());
  const data = await mkdtemp(join(parent, 'tiiny-decide-dsh-check-'));
  process.env.TIINY_DECIDE_DSH_DATA_DIR = data;
  t.after(async () => {
    delete process.env.TIINY_DECIDE_DSH_DATA_DIR;
    if (dirname(data) === parent && basename(data).startsWith('tiiny-decide-dsh-check-')) {
      await rm(data, { recursive: true, force: true });
    }
  });
  const { server: web, route, agent: registered } = await startDshHost();
  t.after(() => close(web));
  assert.equal(route.path, '/plugins/tiiny-decide/api');
  assert.equal(route.kind, 'prefix');
  assert.equal(registered.name, 'tiiny_decide');
  const actualKeys = [];
  const fixture = await listen(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks));
    actualKeys.push(request.headers.authorization);
    response.end(JSON.stringify(demoResponse(payload)));
  });
  t.after(() => close(fixture));
  const api = async (path, body, addHeaders = {}, authorized = true) => {
    const response = await fetch(`${origin(web)}${route.path}${path}`, {
      ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
      headers: { ...(authorized ? { 'X-Test-Peer': 'owner' } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...addHeaders },
    });
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
  const agent = input => registered.execute(input, { signal: new AbortController().signal });
  assert.equal((await api('/workflows', undefined, {}, false)).status, 401);
  assert.equal((await api('/preview', {}, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  const { workflows } = (await api('/workflows')).data;
  assert.deepEqual(workflows.map(item => item.id), (await agent({ action: 'list' })).workflows.map(item => item.id));
  const original = workflows[0];
  const changed = await agent({action:'save_workflow', workflow:{ ...original, name:'Edited via Agent' }});
  assert.equal((await api('/workflows')).data.workflows[0].name, changed.name);
  const exported = (await api(`/workflows/${original.id}/export`)).data;
  const { workflow } = (await api('/workflows/import', exported)).data;
  assert.ok((await agent({ action:'list' })).workflows.find(item => item.id === workflow.id));

  const connectionDraft = { name: 'Fixture', preset: 'custom', url: `${origin(fixture)}/v1/systemone`, model: 'demo-system-one', timeoutSeconds: 2, auth: { mode: 'none' } };
  const connection = (await api('/connections', connectionDraft)).data.connection;
  const runArgs = { workflowId:workflow.id, connectionId:connection.id, state:workflow.examples[3].state };
  assert.deepEqual((await api('/preview', { ...runArgs, workflow })).data, await agent({action:'preview', ...runArgs}));
  const result = await agent({ action:'run', ...runArgs });
  const httpRun = (await api(`/runs/${result.id}`)).data.run;
  assert.equal(httpRun.results[0].modelAnswer, 'Action needed');
  assert.equal(httpRun.results[0].workflowResult, 'Needs review');
  assert.deepEqual(httpRun.results, result.results);
  const replay = (await api(`/runs/${result.id}/rerun`, {})).data.run;
  assert.equal(replay.rerunOf, result.id);
  assert.deepEqual((await agent({action:'get_run', runId:replay.id})).results, replay.results);

  const fakeKey = 'not-a-real-device-key';
  const sessionSave = await api('/connections', { ...connectionDraft, auth:{mode:'session'}, sessionKey:fakeKey });
  const setCookie = sessionSave.headers.get('set-cookie');
  assert.match(setCookie, /Path=\/plugins\/tiiny-decide\/api\/; HttpOnly; SameSite=Strict/);
  assert.doesNotMatch(JSON.stringify(sessionSave.data), new RegExp(fakeKey));
  const request = { ...runArgs, connectionId:sessionSave.data.connection.id };
  assert.equal((await agent({action:'run', ...request})).error.code, 'missing_auth');
  const sessionRun = (await api('/run', request, { Cookie:setCookie.split(';', 1)[0] })).data.run;
  assert.equal(sessionRun.ok, true);
  assert.equal(actualKeys.at(-1), `Bearer ${fakeKey}`);
  assert.doesNotMatch(JSON.stringify((await api(`/runs/${sessionRun.id}/export`)).data), new RegExp(fakeKey));

  // The native desktop bridge forwards custom headers, with only its own Host cookie.
  const headerName = 'x-tiiny-decide-session';
  const desktopSave = await api('/connections', {
    ...connectionDraft, name: 'Desktop fixture', auth: { mode: 'session' }, sessionKey: fakeKey,
  }, { [headerName]: 'new' });
  const desktopId = desktopSave.headers.get(headerName);
  assert.match(desktopId, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(desktopSave.headers.get('set-cookie'), null);
  assert.doesNotMatch(JSON.stringify(desktopSave.data), new RegExp(fakeKey));
  const desktopRequest = { ...runArgs, connectionId: desktopSave.data.connection.id };
  const priorCalls = actualKeys.length;
  assert.equal((await api('/run', desktopRequest, { [headerName]: 'new' })).data.run.error.code, 'missing_auth');
  assert.equal((await api('/run', desktopRequest, { [headerName]: desktopId }, false)).status, 401);
  assert.equal(actualKeys.length, priorCalls);
  const desktopRun = (await api('/run', desktopRequest, { [headerName]: desktopId })).data.run;
  assert.equal(desktopRun.ok, true);
  assert.equal(actualKeys.at(-1), `Bearer ${fakeKey}`);
  assert.doesNotMatch(JSON.stringify((await api(`/runs/${desktopRun.id}/export`)).data), new RegExp(fakeKey));
});
