import { normalizeConnection, normalizeWorkflow, workflowEnvelope, importWorkflow, makePayload, readState } from './model.mjs';

const viewport = document.getElementById('viewport');
const icons = {
  workflows: ['M5 3v18m0-13h7a3 3 0 0 1 3 3v2m0 0-3-3m3 3 3-3M5 16h6'],
  connections: ['M10 13a4 4 0 0 0 6 .4l3-3a4 4 0 0 0-5.7-5.7l-1.7 1.7','M14 11a4 4 0 0 0-6-.4l-3 3a4 4 0 0 0 5.7 5.7l1.7-1.7'],
  runs: ['M3 12a9 9 0 1 1 2.5 6.2M3 12V6m0 6h6m3-5v5l3 2'],
  shield: ['M12 22s-7-3.5-7-10V5l7-3 7 3v7c0 6.5-7 10-7 10z','m9 12 2 2 4-4'],
  plus: ['M12 5v14M5 12h14'], download: ['M12 3v12m-4-4 4 4 4-4M5 15v5h14v-5'], upload: ['M12 16V4M8 8l4-4 4 4M5 15v5h14v-5'],
  chevron: ['m9 18 6-6-6-6'], duplicate: ['M9 8h11v12H9zM6 16H4V4h11v2'],
  save: ['M4 4h13l3 3v13H4zM8 4v6h8V4M8 20v-6h8v6'], play: ['m8 5 11 7-11 7z'],
  inbox: ['M4 4h16l2 10v5H2v-5zM2 14h6l2 3h4l2-3h6'], message: ['M4 4h16v13H9l-5 3zM8 9h8m-8 4h5'],
  state: ['M5 5h14M5 10h14M5 15h9M5 20h11'], question: ['M8 8a4 4 0 1 1 5.5 3.7c-1 .5-1.5 1.1-1.5 2.3M12 18h.01','M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z'],
  rule: ['M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4m-6 2v4'], code: ['m7 6-5 6 5 6m10-12 5 6-5 6M14 4l-4 16'],
  info: ['M12 7h.01M12 11v6','M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z'],
  stack: ['m12 3 9 5-9 5-9-5 9-5zm-9 9 9 5 9-5m-18 4 9 5 9-5'],
  bolt: ['m13 2-8 12h6l-1 8 9-12h-6z'], test: ['M9 3h6M10 3v7l-5 8a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-8V3M8 15h8'],
  check: ['m5 12 4 4L19 6'], x: ['m6 6 12 12m0-12L6 18'], trash: ['M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5'],
  clock: ['M12 7v5l3 2','M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z'], file: ['M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h6'],
  settings: ['M4 6h16m-16 6h16m-16 6h16','M8 4v4m8 2v4m-5 2v4'],
};
const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  return element;
}
function icon(name) {
  const element = svg('svg', { class: 'icon', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
  element.append(...(icons[name] ?? icons.file).map(d => svg('path', { d })));
  return element;
}
for (const host of document.querySelectorAll('[data-icon]')) host.append(icon(host.dataset.icon));
function node(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== null && value !== undefined && value !== false) element.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child !== null && child !== undefined && child !== false) element.append(child instanceof Node ? child : String(child));
  }
  return element;
}
const div = (cls, ...children) => node('div', { class: cls }, ...children);
const p = (text, cls) => node('p', { class: cls }, text);
const badge = (text, tone = '') => node('span', { class: `badge ${tone}` }, text);
function button(label, action, { symbol, cls = '', disabled, id, iconOnly = false } = {}) {
  const element = node('button', { type: 'button', class: `button ${cls}${iconOnly ? ' icon-button' : ''}`, title: iconOnly ? label : null, 'aria-label': iconOnly ? label : null, disabled, id }, symbol && icon(symbol), !iconOnly && label);
  element.addEventListener('click', event => action(event));
  return element;
}
let fieldCounter = 0;
function field(label, input, help, cls = '') {
  if (!input.id) input.id = `field-${++fieldCounter}`;
  if (help) input.setAttribute('aria-describedby', `${input.id}-help`);
  return div(`field ${cls}`, node('label', { class: 'field-label', for: input.id }, label), input, help && node('span', { class: 'help', id: `${input.id}-help` }, help));
}
function inputText(value, onInput, attrs = {}) {
  const input = node('input', { type: 'text', ...attrs });
  input.value = value ?? '';
  input.addEventListener('input', () => onInput(input.value));
  return input;
}
function textarea(value, onInput, attrs = {}) {
  const element = node('textarea', attrs);
  element.value = value ?? '';
  element.addEventListener('input', () => onInput(element.value));
  return element;
}
function select(value, options, onChange, attrs = {}) {
  const element = node('select', attrs, options.map(([option, label]) => node('option', { value: option }, label)));
  element.value = value ?? '';
  element.addEventListener('change', () => onChange(element.value));
  return element;
}
function check(label, value, onChange) {
  const element = node('input', { type: 'checkbox', checked: value });
  element.addEventListener('change', () => onChange(element.checked));
  return node('label', { class: 'inline-check' }, element, label);
}
function notice(content, tone = '', symbol = 'info') {
  return div(`notice ${tone}`, icon(symbol), div('notice-content', content));
}
function empty(title, content, symbol = 'stack', action) {
  return div('empty', div('empty-icon', icon(symbol)), node('h3', {}, title), p(content), action);
}
function section(title, description, ...actions) {
  return div('section-heading', div('', node('h3', {}, title), description && p(description)), actions.length ? div('toolbar', ...actions) : null);
}
function library(title, actions, list) {
  return node('aside', { class: 'panel library', 'aria-label': title }, div('library-head', node('h2', {}, title)), actions.length ? div('library-actions', actions) : null, div('library-list', list));
}
function tile(title, subtitle, symbol, current, action) {
  const element = node('button', { type: 'button', class: 'library-item', 'aria-current': current ? 'true' : null }, div('tile-icon', icon(symbol)), div('', node('strong', {}, title), node('small', {}, subtitle)), div('list-chevron', icon('chevron')));
  element.addEventListener('click', action);
  return element;
}
function panelHead(name, description, flags, ...actions) {
  return div('panel-head', div('panel-head-copy', div('title-line', node('h2', {}, name), flags), description && p(description)), div('toolbar', actions));
}
function pageHeading(label, heading, body, ...actions) {
  return div('page-heading', div('', node('span', { class: 'eyebrow' }, label), node('h1', {}, heading), p(body)), actions.length ? div('toolbar', actions) : null);
}
function heroArt() {
  const graphic = svg('svg', { class: 'hero-art', width: '370', height: '184', viewBox: '0 0 370 184', fill: 'none', 'aria-hidden': 'true' });
  graphic.append(svg('path', { d: 'M92 92h77m51 0h33q14 0 14-15V57q0-12 12-12h38m-97 47h33q14 0 14 15v20q0 12 12 12h38M31 0v184M81 0v184m50 0V0m50 0v184m50 0V0m50 0v184m50 0V0M0 20h370M0 68h370M0 116h370M0 164h370', stroke: '#8cbd9b', 'stroke-opacity': '.20' }));
  graphic.append(svg('path', { d: 'M100 92h75m47 0h31q14 0 14-15V57q0-12 12-12h38m-95 47h31q14 0 14 15v20q0 12 12 12h38', stroke: '#9bd4ad', 'stroke-opacity': '.64', 'stroke-width': '1.25', 'stroke-dasharray': '4 5' }));
  for (const [x, y, dim, active] of [[55, 71, 42, false], [174, 67, 49, true], [314, 27, 37, false], [314, 121, 37, false]]) {
    graphic.append(svg('rect', { x, y, width: dim, height: dim, rx: '9', fill: active ? '#a4dfb9' : '#285a45', stroke: '#91c3a1', 'stroke-opacity': '.65' }));
  }
  graphic.append(svg('path', { d: 'M68 85h16m-16 7h16m-16 7h10m113-14h5a4 4 0 0 1 4 4v7m0-4h6l3-3m-9 7a4 4 0 0 1-4 4h-5m135-54 4 4 9-10m-12 94h11m-11 6h11m-11 6h7', stroke: '#caefd4', 'stroke-width': '1.55', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  graphic.append(svg('path', { d: 'M188 83h6a4 4 0 0 1 4 4v11m0-5h7l4-4m-11 4v5a4 4 0 0 1-4 4h-6', stroke: '#1e563f', 'stroke-width': '2', 'stroke-linecap': 'round' }));
  return graphic;
}
function hero() {
  return node('header', { class: 'hero' }, div('hero-content', node('span', { class: 'eyebrow' }, icon('workflows'), 'Decision workbench'), node('h1', {}, 'Workflows'), p('Turn real inputs into consistent, inspectable decisions.')), heroArt());
}
function toast(message, tone = 'success') {
  const box = div(`notice toast ${tone}`, icon(tone === 'success' ? 'check' : 'info'), div('toast-text', message));
  box.append(button('Dismiss notification', () => box.remove(), { symbol: 'x', cls: 'ghost', iconOnly: true }));
  document.getElementById('toast-stack').append(box);
  setTimeout(() => box.remove(), tone === 'error' ? 8500 : 4500);
}
function pretty(data) { return JSON.stringify(data, null, 2) ?? ''; }
function code(data, cls = '') { return node('pre', { class: `code ${cls}`, tabindex: '0' }, node('code', {}, pretty(data))); }
function jsonDetails(label, data) {
  return node('details', { class: 'details' }, node('summary', {}, label, icon('chevron')), code(data));
}
function saveFile(data, name) {
  const safeName = String(name ?? 'export').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'export';
  const url = URL.createObjectURL(new Blob([`${pretty(data)}\n`], { type: 'application/json' }));
  const anchor = node('a', { href: url, download: `${safeName}.json` });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function api(path, body) {
  let response;
  try { response = await fetch(`/api${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  catch { throw new Error('Could not reach the workbench server. Check that it is running and try again.'); }
  let data;
  try { data = await response.json(); }
  catch { throw new Error(`The workbench returned an unexpected response (HTTP ${response.status}).`); }
  if (!response.ok) throw new Error(data?.error?.message || `The workbench request failed (HTTP ${response.status}).`);
  return data;
}
const builtInIds = new Set(['order-inbox', 'message-review']);
const tabs = { workflows: 'Workflows', connections: 'Connections', runs: 'Runs' };
const wfPanes = { state: ['State & samples', 'state'], questions: ['Questions', 'question'], rules: ['Review rules', 'rule'], request: ['Request JSON', 'code'] };
const types = { choice: 'Choice', noul: 'Noul (true/false)', score: 'Score' };
const modelDefaults = { url: 'http://api.tiiny/v1/systemone', model: 'vllm-sr/d3-edge', timeoutSeconds: 120 };
const ui = {
  tab: 'workflows', loading: true, loadError: '', workflows: [], connections: [], runs: [],
  workDrafts: new Map(), connDrafts: new Map(), tests: new Map(), runCache: new Map(), modelDiscovery: null,
  workflowId: '', busyWorkflow: '', activeConnectionId: '', editingConnectionId: '', selectedRun: '', busyConnection: '',
  busyRun: false, pendingRun: '', runLoading: '', runError: '', sequence: 0,
};
function localId() { return `draft:${++ui.sequence}`; }
const isDraft = id => id?.startsWith('draft:');
const urlId = id => encodeURIComponent(id);
const currentWork = () => ui.workDrafts.get(ui.workflowId);
const currentConn = () => ui.connDrafts.get(ui.editingConnectionId);
const activeConn = () => ui.connections.find(connection => connection.id === ui.activeConnectionId);
function updateRecord(records, value) {
  const i = records.findIndex(item => item.id === value.id);
  if (i < 0) records.push(value); else records[i] = value;
}
function fromHash() {
  const tab = location.hash.slice(1);
  return Object.hasOwn(tabs, tab) ? tab : 'workflows';
}
function showTab(tab) {
  if (fromHash() !== tab) location.hash = tab;
  ui.tab = tab;
  render();
  window.scrollTo(0, 0);
  if (tab === 'runs') ensureRun();
}
window.addEventListener('hashchange', () => {
  if (location.hash === '#main') return;
  const next = fromHash();
  if (next === ui.tab) return;
  ui.tab = next;
  render();
  window.scrollTo(0, 0);
  if (ui.tab === 'runs') ensureRun();
});
function updateChrome() {
  for (const link of document.querySelectorAll('[data-tab]')) {
    if (link.dataset.tab === ui.tab) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  document.getElementById('breadcrumb-page').textContent = tabs[ui.tab];
  const active = activeConn();
  const test = active && !ui.connDrafts.get(active.id)?.dirty && ui.tests.get(active.id);
  const indicator = document.getElementById('connection-indicator');
  indicator.replaceChildren(node('span', { class: `status-dot ${test ? (test.ok ? '' : 'failed') : 'muted'}` }), node('span', {}, active?.name || 'No connection selected'));
  if (active) indicator.title = test ? (test.ok ? 'Last test passed' : 'Last test failed') : 'Selected connection · Not tested';
  else indicator.removeAttribute('title');
  const count = document.getElementById('run-count');
  count.hidden = !ui.runs.length;
  count.textContent = ui.runs.length;
}
function render() {
  updateChrome();
  if (ui.loading) viewport.replaceChildren(p('Opening your workbench…', 'startup'));
  else if (ui.loadError) viewport.replaceChildren(pageHeading('Workspace', 'Could not load the workbench', 'Check that the local server is running and try again.'), notice(ui.loadError, 'error'), div('toolbar startup', button('Try again', load, { symbol: 'runs', cls: 'primary' })));
  else viewport.replaceChildren(...(ui.tab === 'connections' ? renderConnections() : ui.tab === 'runs' ? renderRuns() : renderWorkflows()));
}
async function load() {
  ui.loading = true;
  ui.loadError = '';
  ui.tab = fromHash();
  render();
  try {
    const [w, c, r] = await Promise.all([api('/workflows'), api('/connections'), api('/runs')]);
    ui.workflows = w.workflows;
    ui.connections = c.connections;
    ui.runs = r.runs;
    ui.activeConnectionId = ui.connections.find(item => item.id === 'tiiny-pocket')?.id ?? ui.connections[0]?.id ?? '';
    ui.editingConnectionId = ui.activeConnectionId;
    if (ui.editingConnectionId) openConnection(ui.editingConnectionId, false);
    const first = ui.workflows.find(item => item.id === 'order-inbox') ?? ui.workflows[0];
    if (first) openWorkflow(first.id, false);
  } catch (error) { ui.loadError = error.message; }
  finally {
    ui.loading = false;
    render();
    if (!ui.loadError && ui.tab === 'runs') ensureRun();
  }
}

function stateDraft(value) {
  return typeof value === 'string' ? { mode: 'text', text: value } : { mode: 'json', text: pretty(value) };
}
function editQuestion(question) {
  return {
    id: question.id, type: question.type, instructions: question.instructions,
    choices: question.type === 'choice' ? Object.entries(question.criteria ?? {}).map(([label, description]) => ({ label, description: description ?? '' })) : [],
    boolean: question.type === 'noul' ? { true: question.criteria?.true ?? '', false: question.criteria?.false ?? '' } : { true: '', false: '' },
    levels: question.type === 'score' ? [...question.criteria] : [],
  };
}
function editWorkflow(record, id = record.id) {
  const examples = (record.examples ?? []).map(example => ({ name: example.name, ...stateDraft(example.state) }));
  return {
    id, name: record.name, description: record.description ?? '',
    questions: record.questions.map(editQuestion), rules: (record.rules ?? []).map(item => ({ ...item, threshold: String(item.threshold) })), examples,
    state: examples.length ? { mode: examples[0].mode, text: examples[0].text } : { mode: 'text', text: '' },
    sampleIndex: examples.length ? 0 : -1, dirty: isDraft(id), pane: 'state', openQuestions: new Set(),
  };
}
function workflowValue(draft) {
  const questions = draft.questions.map(item => {
    const question = { id: item.id, type: item.type, instructions: item.instructions };
    if (item.type === 'choice') {
      const labels = item.choices.map(choice => choice.label.trim());
      if (labels.some(label => !label)) throw new Error(`Enter a label for every choice in “${item.id || 'Untitled'}”.`);
      if (new Set(labels).size !== labels.length) throw new Error(`Choice labels must be unique in “${item.id || 'Untitled'}”.`);
      question.criteria = Object.fromEntries(item.choices.map((choice, i) => [labels[i], choice.description.trim() || null]));
    } else if (item.type === 'noul' && (item.boolean.true.trim() || item.boolean.false.trim())) {
      question.criteria = Object.fromEntries(Object.entries(item.boolean).filter(([, value]) => value.trim()));
    } else if (item.type === 'score') question.criteria = item.levels;
    return question;
  });
  const rules = draft.rules.map(rule => {
    if (rule.enabled && !String(rule.threshold).trim()) throw new Error('Enter a threshold for each enabled review rule.');
    return { ...rule, threshold: Number(rule.threshold || 0) };
  });
  const examples = draft.examples.map(example => {
    try { return { name: example.name, state: readState(example.mode, example.text) }; }
    catch (error) { throw new Error(`Sample “${example.name || 'Untitled'}”: ${error.message}`); }
  });
  return normalizeWorkflow({ name: draft.name, description: draft.description, questions, rules, examples });
}
function openWorkflow(id, repaint = true) {
  ui.workflowId = id;
  if (!ui.workDrafts.has(id)) {
    const record = ui.workflows.find(item => item.id === id);
    if (record) ui.workDrafts.set(id, editWorkflow(record));
  }
  if (repaint) render();
}
function newWorkflow() {
  const id = localId();
  const draft = editWorkflow({ name: 'Untitled workflow', description: '', questions: [{ id: 'decision', type: 'choice', instructions: 'Which option best describes this input?', criteria: { Accept: null, 'Needs review': null } }] }, id);
  draft.pane = 'questions';
  draft.openQuestions.add(0);
  ui.workDrafts.set(id, draft);
  openWorkflow(id);
  document.getElementById('workflow-name')?.select();
}
function duplicateWorkflow(source) {
  try {
    const draft = editWorkflow(workflowValue(source), localId());
    draft.name = `${source.name.trim().slice(0, 85)} copy`;
    draft.state = { ...source.state };
    draft.pane = 'questions';
    ui.workDrafts.set(draft.id, draft);
    openWorkflow(draft.id);
    toast('Workflow duplicated as a draft.');
  } catch (error) { toast(error.message, 'error'); }
}
function dirtyWorkflow(draft) {
  draft.dirty = true;
  const flag = document.getElementById('workflow-draft-flag');
  if (flag) flag.hidden = false;
  const save = document.getElementById('workflow-save');
  if (save && !ui.busyWorkflow && !ui.busyRun) save.disabled = false;
}
async function persistWorkflow(draft) {
  const previousId = draft.id;
  const body = workflowValue(draft);
  if (!isDraft(previousId)) body.id = previousId;
  const { workflow } = await api('/workflows', body);
  updateRecord(ui.workflows, workflow);
  if (workflow.id !== previousId) ui.workDrafts.delete(previousId);
  draft.id = workflow.id;
  draft.dirty = false;
  ui.workDrafts.set(draft.id, draft);
  if (ui.workflowId === previousId) ui.workflowId = draft.id;
  return workflow;
}
async function saveWorkflow(draft) {
  if (ui.busyWorkflow || ui.busyRun) return;
  ui.busyWorkflow = draft.id;
  render();
  try { await persistWorkflow(draft); toast('Workflow saved.'); }
  catch (error) { toast(error.message, 'error'); }
  finally { ui.busyWorkflow = ''; render(); }
}
async function chooseImport(input) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 500_000) throw new Error('Workflow files must be under 500 KB.');
    let parsed;
    try { parsed = JSON.parse(await file.text()); }
    catch { throw new Error('That file does not contain valid JSON.'); }
    importWorkflow(parsed);
    const { workflow } = await api('/workflows/import', parsed);
    updateRecord(ui.workflows, workflow);
    openWorkflow(workflow.id);
    toast('Workflow imported.');
  } catch (error) { toast(error.message, 'error'); }
  finally { input.value = ''; }
}
function exportWorkflow(draft) {
  try { saveFile(workflowEnvelope(workflowValue(draft)), `${draft.name}-workflow`); }
  catch (error) { toast(error.message, 'error'); }
}
function changePane(draft, pane, focus = false) {
  draft.pane = pane;
  render();
  if (focus) document.getElementById(`editor-${pane}`)?.focus();
}
function editorTabs(draft) {
  const keys = Object.keys(wfPanes);
  return div('editor-tabs', keys.map((key, index) => {
    const [label, symbol] = wfPanes[key];
    const tab = node('button', { type: 'button', role: 'tab', id: `editor-${key}`, class: 'editor-tab', 'aria-selected': String(draft.pane === key), tabindex: draft.pane === key ? '0' : '-1', 'aria-controls': 'editor-pane' }, icon(symbol), label);
    tab.addEventListener('click', () => changePane(draft, key, true));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowLeft') next = keys[(index + keys.length - 1) % keys.length];
      if (event.key === 'ArrowRight') next = keys[(index + 1) % keys.length];
      if (event.key === 'Home') next = keys[0];
      if (event.key === 'End') next = keys.at(-1);
      if (next) { event.preventDefault(); changePane(draft, next, true); }
    });
    return tab;
  }));
}
function connectionRuntime() {
  const active = activeConn();
  const status = active && !ui.connDrafts.get(active.id)?.dirty && ui.tests.get(active.id);
  return div('runtime',
    field('Run with connection', select(ui.activeConnectionId, ui.connections.length ? ui.connections.map(item => [item.id, item.name]) : [['', 'No saved connections']], value => { ui.activeConnectionId = value; render(); document.getElementById('runtime-connection')?.focus(); }, { id: 'runtime-connection', disabled: !ui.connections.length || ui.busyRun })),
    div('runtime-info', icon(status ? (status.ok ? 'check' : 'info') : 'connections'), active ? `${active.model} · ${status ? (status.ok ? 'Last test passed' : 'Last test failed') : 'Not tested'}` : node('a', { href: '#connections' }, 'Set up a connection')));
}
function renderWorkflows() {
  const draft = currentWork();
  const file = node('input', { type: 'file', accept: '.json,application/json', hidden: true });
  file.addEventListener('change', () => chooseImport(file));
  const makeTile = item => tile(item.name, `${item.questions.length} ${item.questions.length === 1 ? 'question' : 'questions'}${isDraft(item.id) ? ' · Draft' : ''}`, item.id === 'order-inbox' ? 'inbox' : item.id === 'message-review' ? 'message' : 'workflows', ui.workflowId === item.id, () => openWorkflow(item.id));
  const builtins = ui.workflows.filter(item => builtInIds.has(item.id));
  const users = [...ui.workflows.filter(item => !builtInIds.has(item.id)), ...[...ui.workDrafts.values()].filter(item => isDraft(item.id))];
  const workLibrary = library('Workflow library', [button('New workflow', newWorkflow, { symbol: 'plus', cls: 'subtle' }), button('Import JSON', () => file.click(), { symbol: 'upload', iconOnly: true }), file], [
    builtins.length ? p('Built-in examples', 'overline list-label') : null, builtins.map(makeTile),
    users.length ? p('Your workflows', 'overline list-label') : null, users.map(makeTile),
  ]);
  if (!draft) return [hero(), div('workspace-grid', workLibrary, div('panel', empty('Choose a workflow', 'Open an example or create a new workflow.', 'workflows')))];
  const locked = Boolean(ui.busyWorkflow || ui.busyRun);
  const actionGroup = panelHead(draft.name || 'Untitled workflow', draft.description || 'Set up the input, decision questions, and review rules.', [builtInIds.has(draft.id) && badge('Built-in', 'neutral'), node('span', { id: 'workflow-draft-flag', class: 'badge warning', hidden: !draft.dirty }, 'Unsaved')],
    button('Duplicate workflow', () => duplicateWorkflow(draft), { symbol: 'duplicate', iconOnly: true, disabled: locked }),
    button('Export workflow JSON', () => exportWorkflow(draft), { symbol: 'download', iconOnly: true, disabled: locked }),
    button(ui.busyWorkflow === draft.id ? 'Saving…' : 'Save', () => saveWorkflow(draft), { id: 'workflow-save', symbol: 'save', disabled: !draft.dirty || locked }),
    button(ui.busyRun ? 'Running…' : 'Run workflow', () => executeWorkflow(draft), { symbol: 'play', cls: 'primary', disabled: !activeConn() || locked }));
  const tablist = editorTabs(draft);
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', 'Workflow editor');
  const panel = node('section', { class: 'panel', 'aria-label': 'Workflow editor' }, actionGroup, connectionRuntime(),
    ui.busyRun && node('div', { class: 'running-note', role: 'status' }, notice('Waiting for the model endpoint. You can browse the workbench while the run finishes.', '', 'clock')), tablist,
    node('div', { class: 'panel-body', id: 'editor-pane', role: 'tabpanel', 'aria-labelledby': `editor-${draft.pane}` },
      draft.pane === 'questions' ? questionPane(draft) : draft.pane === 'rules' ? rulesPane(draft) : draft.pane === 'request' ? requestPane(draft) : statePane(draft)));
  if (locked) {
    panel.querySelector('#editor-pane').inert = true;
    panel.setAttribute('aria-busy', 'true');
  }
  return [hero(), div('workspace-grid', workLibrary, panel)];
}

function modeSwitch(value, onChange, label) {
  return node('div', { class: 'segmented', role: 'group', 'aria-label': label }, ['text', 'json'].map(mode => {
    const toggle = node('button', { type: 'button', 'aria-pressed': String(mode === value) }, mode === 'text' ? 'Text' : 'JSON');
    toggle.addEventListener('click', () => { if (mode !== value) onChange(mode); });
    return toggle;
  }));
}
function sampleEditor(draft, item, index) {
  return div('sample-card block',
    field('Sample name', inputText(item.name, value => { item.name = value; dirtyWorkflow(draft); }, { id: 'example-title', placeholder: 'Example name' })),
    div('state-actions', node('span', { class: 'field-label' }, 'Saved sample state'), modeSwitch(item.mode, mode => { item.mode = mode; dirtyWorkflow(draft); render(); }, 'Saved sample state format')),
    textarea(item.text, value => { item.text = value; dirtyWorkflow(draft); }, { 'aria-label': 'Saved sample state', class: item.mode === 'json' ? 'mono' : null, rows: 3, spellcheck: item.mode === 'text' ? 'true' : 'false' }),
    div('toolbar', button('Use this sample', () => { draft.state = { mode: item.mode, text: item.text }; render(); }, { symbol: 'check', cls: 'subtle' }), button('Remove sample', () => { draft.examples.splice(index, 1); draft.sampleIndex = -1; dirtyWorkflow(draft); render(); }, { symbol: 'trash', cls: 'danger ghost' })));
}
function addSample(draft) {
  try { readState(draft.state.mode, draft.state.text); }
  catch (error) { toast(`Enter valid state before adding a sample. ${error.message}`, 'error'); return; }
  draft.sampleIndex = draft.examples.length;
  draft.examples.push({ name: `Sample ${draft.sampleIndex + 1}`, ...draft.state });
  draft.editSample = true;
  dirtyWorkflow(draft);
  render();
  document.getElementById('example-title')?.select();
}
function statePane(draft) {
  const chosen = draft.examples[draft.sampleIndex];
  return [div('block',
    section('Input state', 'Paste text or JSON, or start with a sample.'),
    div('sample-toolbar', field('Saved sample', select(String(draft.sampleIndex), [['-1', 'Custom input'], ...draft.examples.map((example, i) => [String(i), example.name || 'Untitled sample'])], value => {
      draft.sampleIndex = Number(value);
      const picked = draft.examples[draft.sampleIndex];
      draft.editSample = false;
      if (picked) draft.state = { mode: picked.mode, text: picked.text };
      render();
      document.getElementById('sample-select')?.focus();
    }, { id: 'sample-select' })), div('toolbar',
      chosen && button(draft.editSample ? 'Hide sample editor' : 'Edit sample', () => { draft.editSample = !draft.editSample; render(); if (draft.editSample) document.getElementById('example-title')?.focus(); }, { cls: 'ghost' }),
      button('Save as sample', () => addSample(draft), { symbol: 'plus', cls: 'subtle' }))),
    draft.editSample && chosen && sampleEditor(draft, chosen, draft.sampleIndex),
    div('state-actions', node('span', { class: 'field-label' }, 'State for this run'), modeSwitch(draft.state.mode, mode => { draft.state.mode = mode; render(); document.getElementById('run-state')?.focus(); }, 'Run state format')),
    textarea(draft.state.text, value => { draft.state.text = value; }, { id: 'run-state', 'aria-label': 'State for this run', class: `state-text${draft.state.mode === 'json' ? ' mono' : ''}`, rows: 5,
      placeholder: draft.state.mode === 'json' ? '{"message": "Review this input"}' : 'Enter the text you want the workflow to evaluate…', spellcheck: draft.state.mode === 'text' ? 'true' : 'false' }),
    p(draft.state.mode === 'json' ? 'Enter a JSON object, array, or quoted string.' : 'This input is sent as a string. Edits do not change the saved sample.', 'help')),
  div('block', section('Decision outline', 'Questions are evaluated together in one System One request.'),
    div('toolbar', draft.questions.map((item, i) => button(`${item.id || `Question ${i + 1}`} · ${types[item.type]}`, () => { draft.openQuestions.add(i); changePane(draft, 'questions'); document.getElementById(`question-summary-${i}`)?.focus(); }, { symbol: 'question', cls: 'subtle' }))),
    draft.rules.some(rule => rule.enabled) && notice('Low-margin review is enabled. A close choice can be routed to review without changing the model answer.', '', 'rule'))];
}
function addQuestion(draft) {
  let i = draft.questions.length + 1;
  while (draft.questions.some(question => question.id === `decision_${i}`)) i++;
  draft.openQuestions.add(draft.questions.length);
  draft.questions.push(editQuestion({ id: `decision_${i}`, type: 'choice', instructions: '', criteria: { Accept: null, 'Needs review': null } }));
  dirtyWorkflow(draft);
  render();
  document.getElementById(`question-id-${draft.questions.length - 1}`)?.select();
}
function choiceOptions(draft, item) {
  return div('criteria-list', section('Choice options', 'Labels become model answers. Descriptions are optional.'),
    item.choices.map((option, i) => div('criteria-row',
      field(`Option ${i + 1}`, inputText(option.label, value => { option.label = value; dirtyWorkflow(draft); }, { placeholder: 'Option label' })),
      field('Description', inputText(option.description, value => { option.description = value; dirtyWorkflow(draft); }, { placeholder: 'Optional context' })),
      button(`Remove option ${i + 1}`, () => { item.choices.splice(i, 1); dirtyWorkflow(draft); render(); }, { symbol: 'trash', cls: 'danger', iconOnly: true, disabled: item.choices.length <= 2 }))),
    div('toolbar', button('Add option', () => { item.choices.push({ label: '', description: '' }); dirtyWorkflow(draft); render(); }, { symbol: 'plus', cls: 'subtle' })));
}
function scoreLevels(draft, item) {
  return div('criteria-list', section('Score levels', 'Define 2–10 levels, from lowest to highest.'),
    item.levels.map((value, i) => div('criteria-row score-row', node('span', { class: 'score-number', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')),
      field(`Level ${i + 1}`, inputText(value, text => { item.levels[i] = text; dirtyWorkflow(draft); }, { placeholder: 'Describe this level' })),
      button(`Remove level ${i + 1}`, () => { item.levels.splice(i, 1); dirtyWorkflow(draft); render(); }, { symbol: 'trash', cls: 'danger', iconOnly: true, disabled: item.levels.length <= 2 }))),
    div('toolbar', button('Add level', () => { item.levels.push(''); dirtyWorkflow(draft); render(); }, { symbol: 'plus', cls: 'subtle', disabled: item.levels.length >= 10 })));
}
function noulDescriptions(draft, item) {
  return div('block', section('Boolean criteria', 'Optionally explain what true and false mean in this context.'), div('field-grid',
    ['true', 'false'].map(value => field(`${value} description`, inputText(item.boolean[value], text => { item.boolean[value] = text; dirtyWorkflow(draft); }, { placeholder: 'Optional' })))));
}
function questionCard(draft, item, index) {
  const flag = node('code', { class: 'mono' }, item.id || `Question ${index + 1}`);
  const details = node('details', { class: 'question-card', open: draft.openQuestions.has(index) }, node('summary', { id: `question-summary-${index}` }, node('span', {}, flag, badge(types[item.type], 'neutral')), icon('chevron')),
    div('question-body', div('field-grid',
      field('Question ID', inputText(item.id, value => { item.id = value; flag.textContent = value || `Question ${index + 1}`; dirtyWorkflow(draft); }, { id: `question-id-${index}`, placeholder: 'decision_id', spellcheck: 'false' })),
      field('Type', select(item.type, Object.entries(types), value => {
        item.type = value;
        if (value === 'choice' && !item.choices.length) item.choices = [{ label: 'Accept', description: '' }, { label: 'Needs review', description: '' }];
        if (value === 'score' && !item.levels.length) item.levels = ['Low', 'High'];
        draft.openQuestions.add(index);
        dirtyWorkflow(draft);
        render();
        document.getElementById(`question-type-${index}`)?.focus();
      }, { id: `question-type-${index}` })),
      field('Question instructions', textarea(item.instructions, value => { item.instructions = value; dirtyWorkflow(draft); }, { rows: 2, placeholder: 'Explain what the model should decide.' }), null, 'wide')),
    item.type === 'choice' ? choiceOptions(draft, item) : item.type === 'score' ? scoreLevels(draft, item) : noulDescriptions(draft, item),
    div('toolbar', button('Remove question', () => {
      draft.questions.splice(index, 1);
      draft.openQuestions = new Set([...draft.openQuestions].filter(i => i !== index).map(i => i > index ? i - 1 : i));
      dirtyWorkflow(draft); render();
    }, { symbol: 'trash', cls: 'danger ghost', disabled: draft.questions.length <= 1 }))));
  details.addEventListener('toggle', () => {
    if (details.open) draft.openQuestions.add(index); else draft.openQuestions.delete(index);
  });
  return details;
}
function questionPane(draft) {
  return [div('block', section('Workflow details', 'Give this configuration a readable name.'), div('field-grid',
    field('Workflow name', inputText(draft.name, value => { draft.name = value; dirtyWorkflow(draft); }, { id: 'workflow-name' })),
    field('Description', inputText(draft.description, value => { draft.description = value; dirtyWorkflow(draft); }, { placeholder: 'What decisions does it make?' })))),
  div('block', section('Decision questions', 'Use a unique ID for each question.', button('Add question', () => addQuestion(draft), { symbol: 'plus', cls: 'subtle' })), div('question-list', draft.questions.map((item, index) => questionCard(draft, item, index))))];
}
function rulesPane(draft) {
  const choiceQuestions = draft.questions.filter(item => item.type === 'choice' && item.id.trim());
  return div('block', section('Review rules', 'Route close choice results to human review.', button('Add low-margin rule', () => {
    const question = choiceQuestions[0];
    const result = question.choices.find(choice => choice.label === 'Needs review') ?? question.choices.at(-1);
    draft.rules.push({ type: 'low-margin-review', enabled: true, questionId: question.id.trim(), threshold: '0.12', result: result?.label.trim() ?? '' });
    dirtyWorkflow(draft);
    render();
  }, { symbol: 'plus', cls: 'subtle', disabled: !choiceQuestions.length })),
  notice('A low-margin rule applies when the gap between the two highest choice probabilities is below the threshold. The original model answer stays visible. If the probabilities are unavailable, the rule does not run.'),
  !draft.rules.length && empty('No review rules', choiceQuestions.length ? 'Add a rule to route uncertain choices to a review option.' : 'Add a choice question before configuring this rule.', 'rule'),
  draft.rules.map((rule, index) => {
    const question = choiceQuestions.find(item => item.id.trim() === rule.questionId);
    const results = question?.choices.map(choice => choice.label.trim()).filter(Boolean) ?? [];
    const options = choiceQuestions.map(item => [item.id.trim(), item.id.trim()]);
    if (rule.questionId && !question) options.unshift([rule.questionId, `${rule.questionId} (missing)`]);
    const resultOptions = [...new Set(results)].map(result => [result, result]);
    if (rule.result && !results.includes(rule.result)) resultOptions.unshift([rule.result, `${rule.result} (missing)`]);
    return div('rule-card', div('state-actions', node('strong', {}, `Low-margin review${draft.rules.length > 1 ? ` ${index + 1}` : ''}`),
      button('Remove rule', () => { draft.rules.splice(index, 1); dirtyWorkflow(draft); render(); }, { symbol: 'trash', cls: 'danger ghost', iconOnly: true })),
    check('Enable this rule', rule.enabled, value => { rule.enabled = value; dirtyWorkflow(draft); }), div('field-grid',
      field('Choice question', select(rule.questionId, [['', 'Choose a question'], ...options], value => {
        rule.questionId = value; rule.result = ''; dirtyWorkflow(draft); render();
      })),
      field('Route to option', select(rule.result, [['', 'Choose the review option'], ...resultOptions], value => { rule.result = value; dirtyWorkflow(draft); })),
      field('Probability gap threshold', inputText(rule.threshold, value => { rule.threshold = value; dirtyWorkflow(draft); }, { type: 'number', min: '0', max: '1', step: 'any', inputmode: 'decimal' }), 'Use a decimal from 0 to 1. For example, 0.12 means 12 percentage points.', 'wide')));
  }));
}
async function copyPayload(payload) {
  try { await navigator.clipboard.writeText(pretty(payload)); toast('Request JSON copied.'); }
  catch { toast('Clipboard access is unavailable. Select the request JSON to copy it manually.', 'warning'); }
}
function requestPane(draft) {
  let payload, problem;
  try {
    const connection = activeConn();
    if (!connection) throw new Error('Select a saved connection to populate the request model.');
    payload = makePayload(connection, workflowValue(draft), readState(draft.state.mode, draft.state.text));
  } catch (error) { problem = error.message; }
  return div('block', section('Live request JSON', 'This is the request body sent to the selected model endpoint. Connection credentials are not included.', payload && button('Copy JSON', () => copyPayload(payload), { symbol: 'duplicate', cls: 'subtle' })),
    payload ? code(payload, 'preview') : notice(problem, 'warning'),
    p('Low-margin rules are applied by the workbench after a response, so they are not part of the model request.', 'help'));
}

function editConnection(record, id = record.id) {
  return { id, name: record.name, preset: record.preset, url: record.url, model: record.model, timeoutSeconds: String(record.timeoutSeconds), auth: { ...record.auth }, sessionKey: '', clearKey: false, dirty: isDraft(id) };
}
function openConnection(id, repaint = true) {
  if (ui.editingConnectionId !== id) ui.modelDiscovery = null;
  ui.editingConnectionId = id;
  if (!ui.connDrafts.has(id)) {
    const record = ui.connections.find(item => item.id === id);
    if (record) ui.connDrafts.set(id, editConnection(record));
  }
  if (repaint) render();
}
function newConnection() {
  const id = localId();
  const draft = editConnection({ name: 'New Tiiny connection', preset: 'tiiny', ...modelDefaults, auth: { mode: 'none', envVar: 'TIINY_API_KEY' } }, id);
  ui.connDrafts.set(id, draft);
  openConnection(id);
  document.getElementById('connection-name')?.select();
}
function dirtyConnection(draft, { invalidateModels = false } = {}) {
  draft.dirty = true;
  if (invalidateModels && ui.modelDiscovery?.connectionId === draft.id) {
    ui.modelDiscovery = null;
    document.getElementById('pocket-model-discovery')?.replaceChildren();
  }
  if (ui.tests.delete(draft.id)) {
    document.getElementById('connection-test-result')?.replaceChildren(notice('Connection settings changed. Test this draft to check the new configuration.'));
    updateChrome();
  }
  const flag = document.getElementById('connection-draft-flag');
  if (flag) flag.hidden = false;
  const save = document.getElementById('connection-save');
  if (save && !ui.busyConnection) save.disabled = false;
}
function connectionValue(draft) {
  if (!draft.timeoutSeconds.trim()) throw new Error('Enter a timeout in seconds.');
  const body = normalizeConnection({ ...draft, timeoutSeconds: Number(draft.timeoutSeconds) });
  if (!isDraft(draft.id)) body.id = draft.id;
  if (draft.auth.mode === 'session') {
    if (draft.clearKey) body.sessionKey = '';
    else if (draft.sessionKey) body.sessionKey = draft.sessionKey;
  }
  return body;
}
async function saveConnection(draft) {
  if (ui.busyConnection) return;
  const old = draft.id;
  ui.busyConnection = old;
  ui.connectionTask = 'save';
  render();
  try {
    const { connection } = await api('/connections', connectionValue(draft));
    updateRecord(ui.connections, connection);
    const next = editConnection(connection);
    ui.connDrafts.delete(old);
    ui.connDrafts.set(next.id, next);
    if (old !== next.id && ui.tests.has(old)) { ui.tests.set(next.id, ui.tests.get(old)); ui.tests.delete(old); }
    if (ui.editingConnectionId === old) ui.editingConnectionId = next.id;
    if (ui.modelDiscovery?.connectionId === old) ui.modelDiscovery.connectionId = next.id;
    if (!activeConn()) ui.activeConnectionId = next.id;
    toast('Connection saved.');
  } catch (error) { toast(error.message, 'error'); }
  finally { ui.busyConnection = ''; ui.connectionTask = ''; render(); }
}
async function testConnection(draft) {
  if (ui.busyConnection) return;
  let body;
  try { body = connectionValue(draft); }
  catch (error) { toast(error.message, 'error'); return; }
  ui.busyConnection = draft.id;
  ui.connectionTask = 'test';
  render();
  try {
    const { test } = await api('/connections/test', body);
    ui.tests.set(draft.id, test);
  } catch (error) { ui.tests.set(draft.id, { ok: false, error: { message: error.message } }); }
  finally { ui.busyConnection = ''; ui.connectionTask = ''; render(); }
}
async function discoverPocketModels(draft) {
  if (ui.busyConnection) return;
  let body;
  try {
    body = connectionValue({ ...draft, model: modelDefaults.model });
    delete body.model;
  } catch (error) { toast(error.message, 'error'); return; }
  const lookup = { connectionId: draft.id, result: null };
  ui.modelDiscovery = lookup;
  ui.busyConnection = draft.id;
  ui.connectionTask = 'models';
  render();
  try { lookup.result = (await api('/connections/models', body)).discovery; }
  catch (error) { lookup.result = { ok: false, error: { message: error.message } }; }
  finally {
    ui.busyConnection = '';
    ui.connectionTask = '';
    render();
    if (ui.tab === 'connections' && ui.modelDiscovery === lookup) {
      document.getElementById('discover-pocket-models')?.focus();
    }
  }
}

function pocketModelResult(draft) {
  if (ui.modelDiscovery?.connectionId !== draft.id) return null;
  const result = ui.modelDiscovery.result;
  if (!result) return p('Checking the Pocket model list…', 'help');
  const details = [result.upstreamStatus != null ? `HTTP ${result.upstreamStatus}` : null, Number.isFinite(result.elapsedMs) ? elapsed(result.elapsedMs) : null].filter(Boolean).join(' · ');
  if (!result.ok) {
    return notice([node('strong', {}, 'Could not list Pocket models'), details && p(details), p(result.error?.message ?? 'Check the endpoint and authentication.')], 'error');
  }
  const options = result.models.map(({ id }) => [id, id]);
  if (!options.length) {
    return notice([node('strong', {}, 'No decision models listed'), details && p(details), p('Check Text Classification models in TiinyOS, or enter the Model ID manually.')]);
  }
  const selected = options.some(([id]) => id === draft.model) ? draft.model : '';
  return div('block',
    p(`${options.length} decision ${options.length === 1 ? 'model' : 'models'} listed${details ? ` · ${details}` : ''}`, 'help'),
    field('Listed decision models', select(selected, [['', 'Choose a Model ID'], ...options], value => {
      if (!value || value === draft.model) return;
      draft.model = value;
      dirtyConnection(draft);
      render();
      document.getElementById('pocket-model-picker')?.focus();
    }, { id: 'pocket-model-picker' })));
}

function elapsed(ms) {
  if (!Number.isFinite(ms)) return 'Elapsed unavailable';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}
function connectionTestResult(draft) {
  if (ui.busyConnection === draft.id && ui.connectionTask === 'test') return notice(`Testing the endpoint… This can take up to ${draft.timeoutSeconds} seconds.`, '', 'clock');
  const test = ui.tests.get(draft.id);
  if (!test) return notice('Not tested yet. Send a small sample request to check the endpoint, credentials, and model.', '', 'test');
  const meta = [test.upstreamStatus != null ? `HTTP ${test.upstreamStatus}` : null, Number.isFinite(test.elapsedMs) ? elapsed(test.elapsedMs) : null].filter(Boolean).join(' · ');
  return div('block', notice([node('strong', {}, test.ok ? 'Connection test passed' : 'Connection test failed'), meta && p(meta), !test.ok && p(test.error?.message ?? 'The endpoint did not return a usable response.')], test.ok ? 'success' : 'error', test.ok ? 'check' : 'info'),
    test.error?.retryAfter != null && p(`Retry-After: ${test.error.retryAfter}`, 'help'),
    test.results != null && jsonDetails('Test results', test.results), test.response != null && jsonDetails('Test response JSON', test.response));
}
function renderConnections() {
  const draft = currentConn();
  const heading = pageHeading('Runtime setup', 'Connections', 'Connect to Tiiny or another System One compatible endpoint.');
  const list = [...ui.connections, ...[...ui.connDrafts.values()].filter(item => isDraft(item.id))];
  const connLibrary = library('Saved connections', [button('New connection', newConnection, { symbol: 'plus', cls: 'subtle', disabled: !!ui.busyConnection })], list.length ? list.map(item => tile(item.name, `${isDraft(item.id) ? 'Draft' : ui.activeConnectionId === item.id ? 'Selected' : 'Saved'} · ${item.preset === 'tiiny' ? 'Tiiny' : 'Custom'}`, item.preset === 'tiiny' ? 'bolt' : 'connections', item.id === ui.editingConnectionId, () => openConnection(item.id))) : empty('No connections yet', 'Add a connection to run workflows.', 'connections'));
  if (!draft) return [heading, div('workspace-grid', connLibrary, div('panel', empty('Add a connection', 'Start with the Tiiny preset or configure your own endpoint.', 'connections', button('New connection', newConnection, { symbol: 'plus', cls: 'primary' }))))];
  const tiiny = draft.preset === 'tiiny';
  const locked = !!ui.busyConnection;
  const active = ui.activeConnectionId === draft.id;
  const form = div('connection-form', div('field-grid',
    field('Connection name', inputText(draft.name, value => { draft.name = value; dirtyConnection(draft); }, { id: 'connection-name' })),
    field('Preset', select(draft.preset, [['tiiny', 'Tiiny Pocket'], ['custom', 'Custom System One']], value => { draft.preset = value; dirtyConnection(draft, { invalidateModels: true }); render(); document.getElementById('connection-preset')?.focus(); }, { id: 'connection-preset' }))),
    tiiny && div('preset-guide', node('strong', {}, 'Set up Tiiny Pocket'),
      node('ol', {},
        node('li', {}, 'In ', node('strong', {}, 'TiinyOS → Model Store'), ', download a ', node('strong', {}, 'Text Classification'), ' model.'),
        node('li', {}, 'Load the model and confirm it is ', node('strong', {}, 'Running'), '. See ', node('a', { href: 'https://dev.tiiny.ai/#/concepts-model-management', target: '_blank', rel: 'noopener noreferrer' }, 'Model Management'), '.'),
        node('li', {}, 'Enter the full URL, ', node('code', {}, modelDefaults.url), ' or ', node('code', {}, 'http://<device-ip>/v1/systemone'), ', and configure an API key if required.'),
        node('li', {}, 'Enter the running Model ID or find it on your Pocket below.')),
      div('toolbar', button('Apply Tiiny defaults', () => {
        if (draft.url !== modelDefaults.url) draft.sessionKey = '';
        Object.assign(draft, modelDefaults, { timeoutSeconds: String(modelDefaults.timeoutSeconds) });
        dirtyConnection(draft, { invalidateModels: true });
        render();
        document.getElementById('connection-url')?.focus();
      }, { symbol: 'bolt' }))),
    field('System One endpoint URL', inputText(draft.url, value => {
      draft.url = value;
      draft.sessionKey = '';
      const keyField = document.getElementById('connection-session-key');
      if (keyField) keyField.value = '';
      dirtyConnection(draft, { invalidateModels: true });
    }, { type: 'url', id: 'connection-url', placeholder: 'http://api.tiiny/v1/systemone', spellcheck: 'false', autocapitalize: 'off' }), 'Use the full URL, including its /v1/systemone path.'),
    div('field-grid', field('Model ID', inputText(draft.model, value => {
      draft.model = value;
      const picker = document.getElementById('pocket-model-picker');
      if (picker) picker.value = [...picker.options].some(option => option.value === value) ? value : '';
      dirtyConnection(draft);
    }, { spellcheck: 'false', placeholder: 'vllm-sr/d3-edge' })),
      field('Timeout (seconds)', inputText(draft.timeoutSeconds, value => { draft.timeoutSeconds = value; dirtyConnection(draft); }, { type: 'number', min: tiiny ? '60' : '1', step: '1', inputmode: 'numeric' }), tiiny ? 'Tiiny requests need at least 60 seconds.' : null)),
    tiiny && div('block',
      section('Pocket model list', 'Choose a listed model, then use Test connection to confirm it can run.',
        button(ui.connectionTask === 'models' && ui.busyConnection === draft.id ? 'Finding…' : 'Find Pocket models', () => discoverPocketModels(draft), { symbol: 'stack', cls: 'subtle', id: 'discover-pocket-models', disabled: locked })),
      node('div', { id: 'pocket-model-discovery', 'aria-live': 'polite' }, pocketModelResult(draft))),
    field('Authentication', select(draft.auth.mode, [['none', 'No authentication'], ['env', 'Server environment variable'], ['session', 'Current session key']], value => { draft.auth.mode = value; if (value !== 'session') { draft.sessionKey = ''; draft.clearKey = false; } dirtyConnection(draft, { invalidateModels: true }); render(); document.getElementById('connection-auth')?.focus(); }, { id: 'connection-auth' })),
    draft.auth.mode === 'env' && field('Environment variable name', inputText(draft.auth.envVar ?? (tiiny ? 'TIINY_API_KEY' : ''), value => { draft.auth.envVar = value; dirtyConnection(draft, { invalidateModels: true }); }, { placeholder: 'TIINY_API_KEY', spellcheck: 'false', autocapitalize: 'off' }), 'Enter the name of a variable available to the workbench server, not the secret itself.'),
    draft.auth.mode === 'session' && div('block', field('Session API key', inputText(draft.sessionKey, value => { draft.sessionKey = value; dirtyConnection(draft, { invalidateModels: true }); }, { type: 'password', id: 'connection-session-key', autocomplete: 'new-password', disabled: draft.clearKey, placeholder: isDraft(draft.id) ? 'Enter key for this session' : 'Leave blank to keep the current key' }), 'A session key is not written to workflow files or shown in run history. Changing the endpoint URL requires a new key.'),
      !isDraft(draft.id) && check('Clear the current session key on save', draft.clearKey, value => { draft.clearKey = value; if (value) draft.sessionKey = ''; dirtyConnection(draft, { invalidateModels: true }); render(); })),
    div('block connection-footer', section('Connection test', 'Test draft settings before or after saving.', button(ui.connectionTask === 'test' && ui.busyConnection === draft.id ? 'Testing…' : 'Test connection', () => testConnection(draft), { symbol: 'test', cls: 'subtle', disabled: locked })),
      node('div', { id: 'connection-test-result', 'aria-live': 'polite' }, connectionTestResult(draft))));
  if (draft.auth.mode === 'env' && draft.auth.envVar == null && tiiny) draft.auth.envVar = 'TIINY_API_KEY';
  // Keep the test result readable while the editable fields are locked.
  if (locked) for (const input of form.querySelectorAll('input,select,button')) input.disabled = true;
  const panel = node('section', { class: 'panel', 'aria-label': 'Connection editor', 'aria-busy': locked ? 'true' : null },
    panelHead(draft.name || 'Untitled connection', 'Configure and verify the endpoint used by your workflows.', [active && badge('Selected'), node('span', { id: 'connection-draft-flag', class: 'badge warning', hidden: !draft.dirty }, 'Unsaved')],
      button(active ? 'Selected for runs' : 'Select for runs', () => { ui.activeConnectionId = draft.id; render(); toast('Connection selected for runs.'); }, { symbol: active ? 'check' : 'connections', disabled: active || isDraft(draft.id) || locked, cls: 'subtle' }),
      button(ui.connectionTask === 'save' && ui.busyConnection === draft.id ? 'Saving…' : 'Save connection', () => saveConnection(draft), { symbol: 'save', id: 'connection-save', disabled: !draft.dirty || locked, cls: 'primary' })),
    div('panel-body', form));
  return [heading, div('workspace-grid', connLibrary, panel)];
}

function runSummary(run) {
  return { id: run.id, createdAt: run.createdAt, workflowName: run.workflow?.name, sampleName: run.sampleName, connectionName: run.connection?.name, model: run.request?.model ?? run.connection?.model, ok: run.ok, elapsedMs: run.elapsedMs, upstreamStatus: run.upstreamStatus };
}
function addRun(run) {
  ui.runCache.set(run.id, run);
  ui.runs = [runSummary(run), ...ui.runs.filter(item => item.id !== run.id)];
  ui.selectedRun = run.id;
  ui.runError = '';
  ui.runLoading = '';
}
async function executeWorkflow(draft) {
  if (ui.busyRun || ui.busyWorkflow || !activeConn()) return;
  const connectionId = ui.activeConnectionId;
  let state;
  try { state = readState(draft.state.mode, draft.state.text); workflowValue(draft); }
  catch (error) { toast(error.message, 'error'); return; }
  ui.busyRun = true;
  ui.pendingRun = draft.name || 'Workflow';
  render();
  try {
    if (draft.dirty || isDraft(draft.id)) await persistWorkflow(draft);
    const { run } = await api('/run', { connectionId, workflowId: draft.id, state });
    addRun(run);
    if (ui.tab === 'workflows') showTab('runs');
    else if (ui.tab !== 'runs') toast(run.ok ? 'Run complete. Open Runs to inspect the result.' : 'Run failed. Open Runs to inspect the error.', run.ok ? 'success' : 'error');
  } catch (error) { toast(error.message, 'error'); }
  finally { ui.busyRun = false; ui.pendingRun = ''; render(); }
}
async function ensureRun() {
  if (ui.loading || ui.loadError || !ui.runs.length) return;
  if (!ui.selectedRun) ui.selectedRun = ui.runs[0].id;
  const id = ui.selectedRun;
  if (ui.runCache.has(id) || ui.runLoading === id) return;
  ui.runLoading = id;
  ui.runError = '';
  if (ui.tab === 'runs') render();
  try { const { run } = await api(`/runs/${urlId(id)}`); ui.runCache.set(id, run); }
  catch (error) { if (ui.selectedRun === id) ui.runError = error.message; }
  finally {
    if (ui.runLoading === id) ui.runLoading = '';
    if (ui.tab === 'runs' && ui.selectedRun === id) render();
  }
}
function chooseRun(id) {
  ui.selectedRun = id;
  ui.runError = '';
  render();
  ensureRun();
}
async function rerunSnapshot(run) {
  if (ui.busyRun || ui.busyWorkflow) return;
  ui.busyRun = true;
  ui.pendingRun = run.workflow?.name ?? 'Snapshot';
  render();
  try {
    const { run: next } = await api(`/runs/${urlId(run.id)}/rerun`, {});
    addRun(next);
    if (ui.tab !== 'runs') toast(next.ok ? 'Rerun complete.' : 'Rerun failed. Open Runs to inspect the error.', next.ok ? 'success' : 'error');
  } catch (error) { toast(error.message, 'error'); }
  finally { ui.busyRun = false; ui.pendingRun = ''; render(); }
}
async function exportRun(run) {
  try { saveFile(await api(`/runs/${urlId(run.id)}/export`), `${run.workflow?.name || 'workflow'}-${run.id}`); }
  catch (error) { toast(error.message, 'error'); }
}
const detailDate = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });
const historyDate = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'medium' });
function formattedDate(date, formatter = detailDate) {
  if (!date) return 'Time unavailable';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return String(date);
  return formatter.format(parsed);
}
const points = value => `${+(value * 100).toFixed(3)} pp`;
function metric(value) {
  if (value === null || value === undefined) return 'Unavailable';
  if (typeof value === 'number' && value >= 0 && value <= 1) return `${+(value * 100).toFixed(2)}%`;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : pretty(value);
}
function displayValue(value) {
  if (value === null || value === undefined) return 'Unavailable';
  if (typeof value === 'object') return pretty(value);
  if (value === '') return 'Empty string';
  return String(value);
}
function resultCard(result) {
  const question = typeof result.question === 'string' ? result.question : result.question?.instructions;
  const title = node('code', { class: 'mono result-id' }, result.id);
  const values = div('result-split',
    div('', node('span', { class: 'overline' }, 'Model answer'), div('result-value', displayValue(result.modelAnswer))),
    div('', node('span', { class: 'overline' }, 'Workflow result'), div('result-value', displayValue(result.workflowResult))));
  const available = result.available !== false;
  return div('result-card', div('result-header', div('title-line', title, badge(types[result.type] ?? result.type ?? 'Question', 'neutral')), result.ruleApplied ? badge('Routed to review', 'warning') : !available ? badge('Unavailable', 'neutral') : null),
    question && p(question, 'result-question'), values,
    div('result-metrics', node('span', {}, node('strong', {}, 'Confidence: '), metric(result.confidence)),
      node('span', {}, node('strong', {}, 'Probabilities: '), result.probabilities == null ? 'Unavailable' : 'Available')),
    result.ruleApplied && div('result-rule', notice(`Review rule applied: the probability gap (${points(result.ruleApplied.gap)}) was below the threshold (${points(result.ruleApplied.threshold)}).`, 'warning', 'rule')),
    result.probabilities != null && div('result-rule', jsonDetails('Probabilities JSON', result.probabilities)));
}
function meta(symbol, value) { return node('span', { class: 'meta-item' }, icon(symbol), node('span', {}, value)); }
function renderRunDetail(run) {
  const description = [run.connection?.name, run.request?.model ?? run.connection?.model].filter(Boolean).join(' · ');
  return node('section', { class: 'panel', 'aria-label': 'Run detail' },
    panelHead(run.workflow?.name ?? 'Workflow run', description, badge(run.ok ? 'Succeeded' : 'Failed', run.ok ? '' : 'error'),
      button('Export run JSON', () => exportRun(run), { symbol: 'download', iconOnly: true }),
      button('Rerun snapshot', () => rerunSnapshot(run), { symbol: 'runs', cls: 'primary', disabled: ui.busyRun || !!ui.busyWorkflow })),
    div('panel-body', div('block',
      div('run-meta', meta('clock', formattedDate(run.createdAt)), meta('bolt', elapsed(run.elapsedMs)), run.upstreamStatus != null && meta('connections', `HTTP ${run.upstreamStatus}`), run.rerunOf && meta('runs', `Rerun of ${run.rerunOf}`)),
      run.error && notice([node('strong', {}, 'Run failed'), p(run.error.message ?? 'The endpoint did not return an answer.'), run.error.code && p(`Error: ${run.error.code}`), run.error.retryAfter != null && p(`Retry-After: ${run.error.retryAfter}`)], 'error'),
      run.results?.length ? [section('Decision results', 'Compare what the model returned with what the workflow decided.'), run.results.map(resultCard)] : (!run.error && empty('No decision results', 'The response did not include readable results for this workflow.', 'question'))),
    div('block', section('Run JSON', 'Inspect the exact request, upstream response, and stored configuration.'),
      run.request != null && jsonDetails('Request JSON', run.request),
      run.response != null ? jsonDetails('Response JSON', run.response) : notice('Upstream response JSON is unavailable.'),
      jsonDetails('Workflow and connection snapshot', { workflow: run.workflow, connection: run.connection }))));
}
async function refreshRuns() {
  if (ui.refreshingRuns || ui.busyRun) return;
  ui.refreshingRuns = true;
  render();
  try {
    const { runs } = await api('/runs');
    ui.runs = runs;
    if (!ui.runs.some(item => item.id === ui.selectedRun)) ui.selectedRun = ui.runs[0]?.id ?? '';
    await ensureRun();
  } catch (error) { toast(error.message, 'error'); }
  finally { ui.refreshingRuns = false; render(); }
}
function runHistoryTile(item) {
  const subtitle = [
    node('span', { class: 'run-history-meta' },
      item.sampleName && node('span', {}, item.workflowName),
      node('span', { class: item.ok ? null : 'run-history-failed' }, item.ok ? 'Succeeded' : 'Failed')),
    node('span', { class: 'run-history-meta' },
      node('time', { datetime: item.createdAt }, formattedDate(item.createdAt, historyDate)),
      node('span', {}, elapsed(item.elapsedMs))),
  ];
  return tile(item.sampleName || item.workflowName || 'Workflow run', subtitle, item.ok ? 'check' : 'info',
    ui.selectedRun === item.id, () => chooseRun(item.id));
}
function renderRuns() {
  const heading = pageHeading('Execution history', 'Runs', 'Review model answers, workflow results, and the configuration behind each run.',
    button(ui.refreshingRuns ? 'Refreshing…' : 'Refresh runs', refreshRuns, { symbol: 'runs', disabled: ui.refreshingRuns || ui.busyRun }));
  const pending = ui.busyRun && notice(`Running ${ui.pendingRun}… Waiting for the model endpoint.`, '', 'clock');
  const list = library('Run history', [], ui.runs.length ? ui.runs.map(runHistoryTile) : empty('No runs yet', 'Start a workflow to create your first run.', 'runs'));
  list.classList.add('run-history');
  const run = ui.runCache.get(ui.selectedRun);
  const detail = run ? renderRunDetail(run)
    : div('panel', ui.runError ? empty('Could not load this run', ui.runError, 'info', button('Try again', ensureRun, { symbol: 'runs' }))
      : ui.runs.length ? empty('Loading run details…', 'Retrieving the saved decision and request snapshot.', 'clock')
        : empty('Inspect a decision', 'Once a workflow has run, its model answers and final decisions appear here.', 'runs', node('a', { class: 'button primary', href: '#workflows' }, icon('workflows'), 'Browse workflows')));
  return [heading, pending ? div('run-pending', pending) : div('', ''), div('workspace-grid', list, detail)];
}

load();
