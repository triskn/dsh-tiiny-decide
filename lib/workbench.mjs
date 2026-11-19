import { randomUUID } from 'node:crypto';
import { AppError, importWorkflow, makePayload, normalizeConnection, normalizeWorkflow, workflowEnvelope } from './model.mjs';
import { BUILTIN_WORKFLOWS, DEFAULT_CONNECTION } from '../examples/builtins.mjs';
import { sessionKeyInput } from './auth.mjs';
import { openStore } from './store.mjs';
import { discoverTiinyModels, evaluate, PROBE_STATE, PROBE_WORKFLOW } from './upstream.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
export const MAX_REQUEST_BYTES = 1024 * 1024;

export function missing(thing) {
  return new AppError(404, `${thing} not found.`, 'not_found');
}

export function assertObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError(400, 'The request body must be a JSON object.');
  function checkDepth(node, depth) {
    if (!node || typeof node !== 'object') return;
    if (depth > 64) throw new AppError(400, 'The request JSON is nested too deeply.');
    for (const member of Object.values(node)) checkDepth(member, depth + 1);
  }
  checkDepth(value, 0);
  return value;
}

function requireId(id, label) {
  if (typeof id !== 'string' || !ID.test(id)) throw new AppError(400, `${label} is invalid.`);
  return id;
}

export async function openWorkbench(dataDirectory, auth) {
  const seeds = {
    connections: [{ ...normalizeConnection(DEFAULT_CONNECTION), id: DEFAULT_CONNECTION.id }],
    workflows: BUILTIN_WORKFLOWS.map(workflow => ({ ...normalizeWorkflow(workflow), id: workflow.id })),
  };
  let store;
  try { store = await openStore(dataDirectory, seeds); }
  catch { throw new Error('Could not open the private data store. Check its permissions and contents.'); }

  function get(section, id, label) {
    const record = store.get(section, requireId(id, `${label} ID`));
    if (!record) throw missing(label);
    return record;
  }
  function save(section, full, data, label) {
    const hasId = Object.hasOwn(data, 'id');
    const id = hasId ? requireId(data.id, `${label} ID`) : randomUUID();
    return store.save(section, { id, ...full }, exists => {
      if (hasId && !exists) throw missing(label);
    });
  }
  const getConnection = id => get('connections', id, 'Connection');
  const getWorkflow = id => get('workflows', id, 'Workflow');
  async function getRun(id) {
    const run = await store.getRun(requireId(id, 'Run ID'));
    if (!run) throw missing('Run');
    return run;
  }
  async function saveRun(request, connection, workflow, payload, { rerunOf, signal } = {}) {
    signal?.throwIfAborted();
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const outcome = await evaluate(connection, workflow, payload, auth.resolve(request, connection), { signal });
    signal?.throwIfAborted();
    return store.saveRun({ id, createdAt, connection, workflow, request: payload, ...outcome, ...(rerunOf ? { rerunOf } : {}) });
  }

  return {
    connections: () => store.list('connections'),
    workflows: () => store.list('workflows'),
    runs: () => store.listRuns(),
    getRun,
    async saveConnection(body, request, response) {
      const normalized = normalizeConnection(body);
      const key = sessionKeyInput(body, normalized);
      const connection = await save('connections', normalized, body, 'Connection');
      auth.save(request, response, connection, key);
      return connection;
    },
    discoverModels(body, request) {
      // Browsing the catalogue does not require a selected model.
      const normalized = normalizeConnection({ ...body, model: DEFAULT_CONNECTION.model });
      const id = Object.hasOwn(body, 'id') ? requireId(body.id, 'Connection ID') : undefined;
      const connection = { id, ...normalized };
      return discoverTiinyModels(connection, auth.resolve(request, connection, sessionKeyInput(body, connection)));
    },
    testConnection(body, request, signal) {
      const normalized = normalizeConnection(body);
      const id = Object.hasOwn(body, 'id') ? requireId(body.id, 'Connection ID') : undefined;
      const connection = { id, ...normalized };
      const key = sessionKeyInput(body, connection);
      const payload = makePayload(connection, PROBE_WORKFLOW, PROBE_STATE);
      return evaluate(connection, PROBE_WORKFLOW, payload, auth.resolve(request, connection, key), { probe: true, signal });
    },
    saveWorkflow: body => save('workflows', normalizeWorkflow(body), body, 'Workflow'),
    importWorkflow: envelope => save('workflows', importWorkflow(envelope), {}, 'Workflow'),
    exportWorkflow: id => workflowEnvelope(getWorkflow(id)),
    async exportRun(id) { return { format: 'tiiny-decide.run', version: 1, run: await getRun(id) }; },
    preview({ connectionId, workflow, workflowId, state }) {
      return makePayload(getConnection(connectionId), workflow !== undefined ? normalizeWorkflow(workflow) : getWorkflow(workflowId), state);
    },
    run({ connectionId, workflowId, state }, request, signal) {
      const connection = getConnection(connectionId);
      const workflow = getWorkflow(workflowId);
      return saveRun(request, connection, workflow, makePayload(connection, workflow, state), { signal });
    },
    async rerun(id, request, signal) {
      const original = await getRun(id);
      return saveRun(request, original.connection, original.workflow, original.request, { rerunOf: original.id, signal });
    },
  };
}
