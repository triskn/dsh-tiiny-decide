import { realpath } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler } from './lib/dsh-api.mjs';
import { createAuth } from './lib/auth.mjs';
import { assertObject, MAX_REQUEST_BYTES, openWorkbench } from './lib/workbench.mjs';

export const inject = ['webServer', 'connection', 'tools'];
const MOUNT = '/plugins/tiiny-decide';
const API_PATH = `${MOUNT}/api/`;
const noBrowserSession = { headers: {} };

function dataPath(env = process.env) {
  if (env.TIINY_DECIDE_DSH_DATA_DIR) return resolve(env.TIINY_DECIDE_DSH_DATA_DIR);
  if (env.DSH_PROFILE_DIR && isAbsolute(env.DSH_PROFILE_DIR)) return join(env.DSH_PROFILE_DIR, 'tiiny-decide');
  return join(homedir(), '.tiiny-decide', 'dsh');
}

async function resolveExistingParents(path) {
  try { return await realpath(path); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return resolve(await resolveExistingParents(dirname(path)), basename(path));
  }
}

async function validateDataDirectory(configuredDirectory) {
  const dataDirectory = await resolveExistingParents(configuredDirectory);
  const projectRoot = await realpath(dirname(fileURLToPath(import.meta.url)));
  const projectLocation = relative(dataDirectory, projectRoot);
  const containsProject = !isAbsolute(projectLocation) && projectLocation !== '..' && !projectLocation.startsWith(`..${sep}`);
  const systemTemp = await realpath(tmpdir());
  const home = await realpath(homedir());
  if (containsProject || [home, systemTemp, '/tmp', '/private/tmp', '/var/tmp'].includes(dataDirectory)) {
    throw new Error('Choose a dedicated TiinyDecide data directory.');
  }
  return dataDirectory;
}

function runView(run) {
  return {
    id: run.id, workflow: run.workflow.name, connection: run.connection.name,
    model: run.request.model, elapsedMs: run.elapsedMs, upstreamStatus: run.upstreamStatus,
    ok: run.ok, ...(run.results ? { results: run.results } : {}), ...(run.error ? { error: run.error } : {}),
  };
}

function tool(workbench) {
  return {
    name: 'tiiny_decide',
    description: 'Use the local TiinyDecide workbench. Discover its saved workflow and connection IDs, manage workflow definitions, or run a decision and save it to Runs. Run and rerun send input to the stated saved connection; use them only with the user’s direction. Use a DSH Host environment variable for authenticated agent calls.',
    deferLoading: true,
    timeoutMs: 610_000,
    parameters: {
      type: 'object', additionalProperties: false, required: ['action'],
      properties: {
        action: { type: 'string', enum: ['list', 'preview', 'save_workflow', 'import_workflow', 'export_workflow', 'run', 'rerun', 'get_run'] },
        connectionId: { type: 'string', description: 'Saved connection ID for run or preview.' },
        workflowId: { type: 'string', description: 'Saved workflow ID for run, preview, or export.' },
        runId: { type: 'string', description: 'Saved run ID for rerun or lookup.' },
        state: { oneOf: [{ type: 'string' }, { type: 'object' }, { type: 'array', items: {} }], description: 'Input material for run or preview.' },
        workflow: { type: 'object', description: 'Workflow name, description, questions, rules and examples. Omit id to create a copy; specify id to edit. Also accepted as a draft for preview.' },
        document: { type: 'object', description: 'Versioned workflow JSON for import.' },
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render(_args, value) { return [{ type: 'text', text: JSON.stringify(value) }]; },
    },
    async execute(input, { signal }) {
      const args = assertObject(input);
      if (Buffer.byteLength(JSON.stringify(args)) > MAX_REQUEST_BYTES) throw new Error('The input exceeds 1 MiB.');
      switch (args.action) {
        case 'list': return {
          workflows: workbench.workflows().map(({ id, name }) => ({ id, name })),
          connections: workbench.connections().map(({ id, name, model, auth }) => ({ id, name, model, authentication: auth.mode })),
          recentRuns: workbench.runs().slice(0, 20),
        };
        case 'preview': return { request: workbench.preview(args) };
        case 'save_workflow': {
          const { id, name } = await workbench.saveWorkflow(args.workflow);
          return { id, name };
        }
        case 'import_workflow': {
          const { id, name } = await workbench.importWorkflow(args.document);
          return { id, name };
        }
        case 'export_workflow': return workbench.exportWorkflow(args.workflowId);
        case 'run': return runView(await workbench.run(args, noBrowserSession, signal));
        case 'rerun': return runView(await workbench.rerun(args.runId, noBrowserSession, signal));
        case 'get_run': return runView(await workbench.getRun(args.runId));
        default: throw new Error('Choose a TiinyDecide action.');
      }
    },
  };
}

export async function apply(ctx) {
  const dataDirectory = await validateDataDirectory(dataPath());
  const auth = createAuth({
    cookieName: 'tiiny_decide_dsh_session', cookiePath: API_PATH,
    sessionHeader: 'x-tiiny-decide-session',
    secure: ctx.webServer.getOrigin().startsWith('https:'),
    envHint: 'the DSH Host environment and restart DSH, or choose a current-session key',
  });
  const workbench = await openWorkbench(dataDirectory, auth);
  const handler = createHandler(workbench, {
    mount: MOUNT,
    authorize: request => ctx.connection.requestRejection(request),
  });
  // DSH prefix routes match the route itself and descendants separated by '/'.
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: `${MOUNT}/api`, handler }));
  ctx.effect(() => ctx.tools.register(tool(workbench)));
}
