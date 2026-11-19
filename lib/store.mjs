import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, readdir, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const RUN_FILE = new RegExp(`^${UUID}\\.json$`);
const TEMP_FILE = new RegExp(`^\\.write-${UUID}\\.tmp$`);

async function privateDirectory(directory) {
  await mkdir(directory, { mode: 0o700, recursive: true });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || (process.getuid && stat.uid !== process.getuid())) {
    throw new Error('Not a private directory owned by this user');
  }
  if (process.platform !== 'win32' && (stat.mode & 0o777) !== 0o700) {
    await chmod(directory, 0o700);
  }
}

async function readPrivateJson(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK | NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || (process.getuid && stat.uid !== process.getuid())) {
      throw new Error('Not a private file owned by this user');
    }
    if (process.platform !== 'win32' && (stat.mode & 0o777) !== 0o600) {
      await file.chmod(0o600);
    }
    return JSON.parse(await file.readFile('utf8'));
  } finally {
    await file.close();
  }
}

async function writePrivateJson(directory, filename, value) {
  const target = join(directory, filename);
  const temporary = join(directory, `.write-${randomUUID()}.tmp`);
  const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o600);
  let committed = false;
  try {
    try {
      await file.writeFile(`${JSON.stringify(value)}\n`, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, target);
    committed = true;
    // The rename is the commit point. Some filesystems don't support syncing a directory.
    if (process.platform !== 'win32') {
      try {
        const parent = await open(directory, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | NOFOLLOW);
        try { await parent.sync(); } finally { await parent.close(); }
      } catch { /* File contents were synced before the atomic rename. */ }
    }
  } finally {
    if (!committed) await unlink(temporary).catch(() => {});
  }
}

function summary(run) {
  const samples = (run.workflow.examples ?? []).filter(example => isDeepStrictEqual(example.state, run.request.state));
  return {
    id: run.id,
    createdAt: run.createdAt,
    workflowName: run.workflow.name,
    ...(samples.length === 1 ? { sampleName: samples[0].name } : {}),
    connectionName: run.connection.name,
    model: run.request.model,
    ok: run.ok,
    elapsedMs: run.elapsedMs,
    upstreamStatus: run.upstreamStatus,
  };
}

export async function openStore(directory, seeds) {
  await privateDirectory(directory);
  const runsDir = join(directory, 'runs');
  await privateDirectory(runsDir);
  // A single server owns this store. Interrupted writes never become visible records.
  for (const location of [directory, runsDir]) {
    for (const entry of await readdir(location, { withFileTypes: true })) {
      if (entry.isFile() && TEMP_FILE.test(entry.name)) await unlink(join(location, entry.name));
    }
  }
  let config;
  try {
    config = await readPrivateJson(join(directory, 'config.json'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    config = { version: 1, ...seeds };
    await writePrivateJson(directory, 'config.json', config);
  }
  if (config?.version !== 1 || !Array.isArray(config.connections) || !Array.isArray(config.workflows)) {
    throw new Error('Invalid data store');
  }
  const runIndex = new Map();
  for (const name of await readdir(runsDir)) {
    if (!RUN_FILE.test(name)) continue;
    const run = await readPrivateJson(join(runsDir, name));
    if (`${run?.id}.json` !== name) throw new Error('Invalid run record');
    runIndex.set(run.id, summary(run));
  }
  let updateQueue = Promise.resolve();
  return {
    list(section) { return config[section]; },
    get(section, id) { return config[section].find((record) => record.id === id); },
    save(section, record, assertExisting) {
      const update = updateQueue.then(async () => {
        const records = config[section].slice();
        const index = records.findIndex(({ id }) => id === record.id);
        assertExisting?.(index !== -1);
        if (index === -1) records.push(record);
        else records[index] = record;
        const next = { ...config, [section]: records };
        await writePrivateJson(directory, 'config.json', next);
        config = next;
        return record;
      });
      updateQueue = update.catch(() => {});
      return update;
    },
    listRuns() {
      return [...runIndex.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async getRun(id) {
      const record = runIndex.get(id);
      if (!record) return undefined;
      const run = await readPrivateJson(join(runsDir, `${id}.json`));
      return record.sampleName ? { ...run, sampleName: record.sampleName } : run;
    },
    async saveRun(run) {
      await writePrivateJson(runsDir, `${run.id}.json`, run);
      const record = summary(run);
      runIndex.set(run.id, record);
      return record.sampleName ? { ...run, sampleName: record.sampleName } : run;
    },
  };
}
