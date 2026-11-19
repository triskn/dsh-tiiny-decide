// DSH Client half. All durable state and all inference belong to the Host.
window.__ModuleLoader__.load({
  id: 'dsh-tiiny-decide',
  factory(require) {
    const React = require('react');
    const { createElement: h, useState, useEffect, useRef } = React;
    const ID = 'tiiny-decide';
    const API = '/plugins/tiiny-decide/api';
    const nativeDesktop = window.location.protocol === 'dsh-app:';
    const SESSION_HEADER = 'x-tiiny-decide-session';
    // The desktop bridge substitutes its own Host cookie. Keep an opaque
    // plugin session ID in this renderer's memory so credentials stay on the Host.
    let desktopSessionId = '';
    const TIINY_URL = 'http://api.tiiny/v1/systemone';
    const TIINY_MODEL = 'vllm-sr/d3-edge';
    const BUILTINS = ['order-inbox', 'message-review'];
    const TABS = { workflows: 'workflows', connections: 'connections', runs: 'runs' };
    const EN = {
      product: 'TiinyDecide', subtitle: 'Run reusable System One decisions on Tiiny Pocket from this workspace.',
      workflows: 'Workflows', connections: 'Connections', runs: 'Runs', library: 'Workflow library',
      newWorkflow: 'New workflow', import: 'Import JSON', duplicate: 'Duplicate', exportWorkflow: 'Export workflow',
      builtIns: 'Built-in examples', savedWorkflows: 'Your workflows', noWorkflow: 'Select or create a workflow to get started.',
      workflowName: 'Workflow name', workflowDescription: 'Description', namePrompt: 'Untitled workflow', copySuffix: 'copy',
      questionsCount: 'Questions', samplesCount: 'Samples', builtIn: 'Built-in', unsaved: 'Unsaved', save: 'Save',
      saveWorkflow: 'Save workflow', workflowSaved: 'Workflow saved.', duplicated: 'Workflow copied as a draft. Save it to keep it.',
      imported: 'Workflow imported.', badImport: 'Select a valid JSON workflow export (up to 1 MiB).',
      questionName: 'Question', questions: 'Questions', questionId: 'Question ID', questionType: 'Question type', instructions: 'Instructions',
      addQuestion: 'Add question', removeQuestion: 'Remove question', choice: 'Choice', noul: 'Noul (yes/no)', score: 'Score',
      choices: 'Choice options', optionLabel: 'Option label', optionDescription: 'Optional description', addOption: 'Add option',
      removeOption: 'Remove option', noulHelp: 'Optional descriptions define what yes and no mean.', yes: 'True / yes', false: 'False / no',
      scoreHelp: 'List 2–10 ordered levels, from lowest to highest.', level: 'Score level', addLevel: 'Add level', removeLevel: 'Remove level',
      duplicateOptions: 'Every Choice option needs a unique, non-empty label.',
      input: 'Input state', stateMode: 'State format', text: 'Text', json: 'JSON', chooseSample: 'Choose a sample', customInput: 'Custom input',
      samples: 'Saved samples', editSamples: 'Manage saved samples', addSample: 'Save input as a sample', sampleName: 'Sample name',
      sampleState: 'Sample state', sample: 'Sample', useSample: 'Use sample', removeSample: 'Remove sample',
      stateHelp: 'JSON state may be a string, object, or array. Current input is not saved unless you add it as a sample.',
      badState: 'Enter a non-empty text input or a valid JSON string, object, or array.',
      connectedModel: 'Run with connection', selectConnection: 'Select a saved connection', noSavedConnections: 'No saved connections.',
      connectionTesting: 'Testing connection…', preview: 'Preview request', previewWorking: 'Preparing request preview…',
      request: 'Request JSON', run: 'Run workflow', running: 'Running workflow…', runSaved: 'Run recorded in local history.',
      ruleTitle: 'Review rules', ruleHelp: 'With a complete distribution, route a close Choice result to review without changing the model answer.',
      addRule: 'Add low-margin rule', removeRule: 'Remove rule', enableRule: 'Enable low-margin review', ruleQuestion: 'Choice question',
      ruleResult: 'Review outcome', ruleThreshold: 'Probability gap threshold (0–1)', chooseQuestion: 'Select question', chooseOutcome: 'Select outcome',
      thresholdNeeded: 'Enter a threshold for each enabled review rule.', missingRuleTarget: 'Choose an existing Choice question and review outcome, or turn this rule off.', missing: 'missing',
      draftTest: 'Testing this draft does not change the saved connection. Save to use these settings in runs.', failedRecorded: 'The run failed and was saved in history.',
      saveBeforeLeaving: 'Save workflow edits before leaving this panel.',
      connectionLibrary: 'Saved connections', newConnection: 'New connection', connectionName: 'Connection name',
      connectionSaved: 'Connection saved.', useConnection: 'Use for runs', selectedConnection: 'Selected for runs',
      noConnection: 'Select or create a connection to get started.', preset: 'Connection preset', tiiny: 'Tiiny Pocket', custom: 'Custom System One',
      setup: 'Set up Tiiny Pocket', downloadModel: 'In TiinyOS → Model Store, download a Text Classification model.',
      loadModel: 'Load the model and verify it is running.', manageModels: 'Model Management',
      fullUrl: 'Enter the full URL and use the key from TiinyOS → Settings → API Key.', chooseModel: 'Enter the actual running Model ID.',
      cloudAlias: 'The cloud alias jev-latest returns 404 on the device.', useDefaults: 'Apply Tiiny defaults',
      endpoint: 'System One endpoint URL', model: 'Model ID', modelHint: 'Use the full inference URL, not a chat-completions endpoint.',
      timeout: 'Timeout (seconds)', timeoutHint: 'Tiiny requests require at least 60 seconds.', authentication: 'Authentication',
      noAuth: 'No authentication', env: 'Environment variable', session: 'Current session key', envName: 'Environment variable name',
      envHint: 'Enter the name, not the credential. The value is read by the Host.', sessionKey: 'Session API key',
      sessionHint: 'Held in memory after saving. Leave blank to use the saved session key for this URL.',
      clearKey: 'Clear the current session key on save', saveConnection: 'Save connection', testConnection: 'Test connection',
      testPassed: 'Connection test passed', testFailed: 'Connection test failed', testResponse: 'Test response JSON', retryAfter: 'Retry-After',
      findPocketModels: 'Find Pocket models', findingPocketModels: 'Finding Pocket models…',
      pickPocketModel: 'Choose a Pocket model', selectPocketModel: 'Select a discovered model',
      pocketModelHint: 'Use your Pocket address and API key to list decision models. Test the selected model before running a workflow.',
      noPocketModels: 'Pocket reported no Text Classification models. Download and load one in TiinyOS, then check again.',
      pocketModelsFailed: 'Could not list Pocket models',
      pocketModelsFound: 'Text Classification models reported by Pocket',
      history: 'Run history', refresh: 'Refresh runs', noRuns: 'No runs yet. Run a workflow to create a local history item.',
      runDetail: 'Run detail', runLoading: 'Loading run…', refreshWorking: 'Refreshing run history…', rerun: 'Rerun snapshot',
      rerunning: 'Rerunning snapshot…', rerunOf: 'Rerun of', exportRun: 'Export run', success: 'Succeeded', failed: 'Failed',
      runFailed: 'Run failed', rawAnswer: 'Model answer', result: 'Workflow result', elapsed: 'Elapsed', unavailable: 'Unavailable',
      confidence: 'Confidence', probabilities: 'Probabilities', routed: 'Routed to review', gap: 'Probability gap', threshold: 'Threshold',
      response: 'Response JSON', snapshot: 'Saved configuration', loading: 'Opening TiinyDecide…', working: 'Saving…', tryAgain: 'Try again',
      networkError: 'Could not reach the TiinyDecide Host API.', invalidResponse: 'The Host did not return valid JSON.', hostError: 'Host request failed.',
    };
    const CSS = `
      .tdec{--td-ink:var(--dsw-alias-label-primary);--td-muted:var(--dsw-alias-label-secondary);--td-bg:var(--dsw-alias-bg-base);--td-card:var(--dsw-alias-bg-layer-1);--td-fill:var(--dsw-alias-bg-layer-2);--td-line:var(--dsw-alias-border-l1);--td-line2:var(--dsw-alias-border-l2);--td-brand:var(--dsw-alias-brand-primary);--td-danger:var(--dsw-alias-state-error-primary);--td-warn:var(--dsw-alias-state-warn-primary);--td-good:var(--dsw-alias-state-success-primary);display:flex;flex:1 1 auto;min-width:0;min-height:0;height:100%;width:100%;overflow:auto;container:tiinydecide / inline-size;background:var(--td-bg);color:var(--td-ink);font-size:13px;line-height:1.45}
      .tdec *,.tdec *:before,.tdec *:after{box-sizing:border-box}
      .tdec [hidden]{display:none!important}
      .tdec h1,.tdec h2,.tdec h3,.tdec p{margin:0}
      .tdec button,.tdec input,.tdec select,.tdec textarea{font:inherit;color:inherit}
      .tdec :focus-visible{outline:2px solid var(--td-brand);outline-offset:2px}
      .tdec a{color:var(--td-brand);text-underline-offset:3px}
      .td-wrap{width:min(100%,1120px);padding:22px clamp(14px,3vw,40px) 40px;margin:0 auto}
      .td-hero{display:flex;gap:14px;align-items:center;margin-bottom:18px}
      .td-logo{display:grid;place-items:center;flex:none;width:42px;height:42px;border-radius:12px;background:var(--td-fill);color:var(--td-brand);border:1px solid var(--td-line)}
      .tdec h1{font-size:23px;line-height:1.2;letter-spacing:-.02em;font-weight:700}
      .td-caption,.td-muted{color:var(--td-muted)}
      .td-caption{font-size:12px;margin-top:4px!important}
      .td-tabs{display:flex;gap:7px;border-bottom:1px solid var(--td-line);margin-bottom:16px;overflow:auto}
      .td-tabs .td-btn{border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;padding:8px 12px;color:var(--td-muted);white-space:nowrap}
      .td-tabs .td-btn[aria-pressed=true]{border-bottom-color:var(--td-brand);color:var(--td-ink);font-weight:650}
      .td-layout{display:grid;grid-template-columns:minmax(145px,218px) minmax(0,1fr);gap:14px;align-items:start}
      .td-panel,.td-block{min-width:0;border:1px solid var(--td-line);border-radius:12px;background:var(--td-card)}
      .td-panel{padding:14px}
      .td-block{padding:11px;background:var(--td-bg)}
      .td-stack{display:flex;flex-direction:column;gap:11px;min-width:0}
      .td-row{display:flex;gap:7px;align-items:center;flex-wrap:wrap;min-width:0}
      .td-spread{justify-content:space-between}
      .td-subhead{font-size:13px;font-weight:650}
      .td-heading{font-size:16px;font-weight:680;overflow-wrap:anywhere}
      .td-label{font-size:11px;color:var(--td-muted);font-weight:600}
      .td-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:32px;padding:4px 9px;border:1px solid var(--td-line2);border-radius:7px;color:var(--td-ink);background:var(--td-card);text-decoration:none;text-align:center;cursor:pointer;font-weight:570;line-height:1.24}
      .tdec a.td-btn{color:var(--td-ink)}
      .td-btn:hover:not(:disabled){background:var(--td-fill)}
      .td-btn:disabled{cursor:not-allowed;opacity:.5}
      .td-btn.td-primary{border-color:var(--td-brand);color:var(--td-brand);font-weight:650}
      .td-btn.td-destruct{color:var(--td-danger)}
      .td-item{display:flex;flex-direction:column;align-items:flex-start;width:100%;text-align:left;gap:3px;padding:7px 8px;min-width:0}
      .td-item[aria-current=true]{border-color:var(--td-brand);background:var(--td-fill)}
      .td-item > span{width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .td-list{display:flex;flex-direction:column;gap:5px;min-width:0;max-height:52vh;overflow:auto;padding:2px}
      .td-list > .td-item{flex:none}
      .td-run-item > span{overflow:visible;white-space:normal;overflow-wrap:anywhere}
      .td-run-title{font-weight:650}
      .td-run-meta{display:flex;align-items:baseline;flex-wrap:wrap;gap:2px 7px;font-size:11px;font-weight:400}
      .td-run-meta time{font-variant-numeric:tabular-nums}
      .td-run-failed{color:var(--td-danger)}
      .td-field{display:grid;gap:4px;min-width:0;color:var(--td-ink);font-size:12px;font-weight:560}
      .td-field .td-muted{font-weight:400}
      .td-field input:not([type=checkbox]),.td-field select,.td-field textarea{min-width:0;width:100%;border:1px solid var(--td-line2);background:var(--td-bg);border-radius:7px;padding:6px 8px;line-height:1.45;min-height:33px}
      .td-field textarea{resize:vertical;min-height:60px;font-weight:400}
      .td-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;align-items:start}
      .td-grid .td-wide{grid-column:1/-1}
      .td-check{display:flex;align-items:center;gap:7px;width:fit-content}
      .td-check input{accent-color:var(--td-brand)}
      .td-badge{display:inline-flex;align-items:center;border:1px solid var(--td-line);border-radius:30px;padding:2px 6px;color:var(--td-muted);font-size:11px;line-height:1.25;max-width:100%;overflow-wrap:anywhere}
      .td-note{padding:8px 9px;border:1px solid var(--td-line);border-radius:7px;background:var(--td-fill);white-space:pre-wrap;overflow-wrap:anywhere}
      .td-warn{border-inline-start:3px solid var(--td-warn)} .td-error{border-inline-start:3px solid var(--td-danger)} .td-success{border-inline-start:3px solid var(--td-good)}
      .td-detail{min-width:0;overflow-wrap:anywhere}
      .td-detail summary{cursor:pointer;font-weight:620;color:var(--td-ink);padding:3px 0}
      .td-detail[open] > summary{margin-bottom:7px}
      .td-code{max-height:360px;overflow:auto;white-space:pre;margin:0;padding:8px;border:1px solid var(--td-line);border-radius:7px;background:var(--td-bg);color:var(--td-ink);font-family:ui-monospace,monospace;font-size:11px;font-weight:400}
      .td-mono{font-family:ui-monospace,monospace!important}
      .td-choice-row{display:grid;grid-template-columns:minmax(64px,.7fr) minmax(85px,1.3fr) auto;gap:7px;align-items:end}
      .td-level-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:end}
      .td-answers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border:1px solid var(--td-line);border-radius:8px;overflow:hidden}
      .td-answers>div{padding:8px;min-width:0;overflow-wrap:anywhere}
      .td-answers>div+div{border-left:1px solid var(--td-line);background:var(--td-fill)}
      .td-probabilities{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;margin:0}
      .td-probabilities>div{display:flex;justify-content:space-between;gap:8px;padding:3px 7px;border:1px solid var(--td-line);min-width:0;border-radius:6px;overflow-wrap:anywhere}
      .td-probabilities dd{margin:0}
      @container tiinydecide (max-width:680px){.td-layout{grid-template-columns:minmax(0,1fr)}.td-list{max-height:140px}.td-wrap{padding-top:13px}}
      @container tiinydecide (max-width:430px){.td-grid,.td-probabilities{grid-template-columns:minmax(0,1fr)}.td-choice-row{grid-template-columns:minmax(0,1fr) auto}.td-choice-row>.td-field:nth-child(2){grid-column:1;grid-row:2}.td-choice-row>.td-btn{grid-column:2;grid-row:2}.td-grid .td-wide{grid-column:auto}}
    `;

    const cls = (...names) => names.filter(Boolean).join(' ');
    const replaceAt = (list, index, item) => list.map((value, i) => i === index ? item : value);
    const dropAt = (list, index) => list.filter((_, i) => i !== index);
    const put = (list, item) => list.some(value => value.id === item.id) ? list.map(value => value.id === item.id ? item : value) : [...list, item];
    const formatJson = value => JSON.stringify(value, null, 2) ?? '';
    const pathId = id => encodeURIComponent(id);
    const snapshotDate = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });
    const formatDate = value => Number.isFinite(Date.parse(value)) ? snapshotDate.format(new Date(value)) : '';
    const historyDate = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'medium' });
    const duration = value => !Number.isFinite(value) ? null : value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(2)} s`;
    const percent = value => typeof value === 'number' && value >= 0 && value <= 1 ? `${+(value * 100).toFixed(3)}%` : String(value);
    const points = value => `${+(value * 100).toFixed(3)} pp`;
    const http = value => value == null ? null : `HTTP ${value}`;
    const errText = (error, t) => error?.message || t('hostError');
    const activeState = state => typeof state === 'string' ? { mode: 'text', text: state } : { mode: 'json', text: formatJson(state) };
    const defaultQuestion = (id = 'decision') => ({ id, type: 'choice', instructions: 'Which option best describes the input?', criteria: { Accept: null, 'Needs review': null } });
    const defaultWorkflow = () => ({ name: 'Untitled workflow', description: '', questions: [defaultQuestion()], rules: [], examples: [] });
    const defaultConnection = () => ({ name: 'Tiiny Pocket', preset: 'tiiny', url: TIINY_URL, model: TIINY_MODEL, timeoutSeconds: '120', auth: { mode: 'env', envVar: 'TIINY_API_KEY' } });

    function Icon({ size = 20, active = false } = {}) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true, focusable: false },
        h('path', { d: 'M8 12h3m0 0v-4.5A2.5 2.5 0 0 1 13.5 5H16m-5 7v4.5a2.5 2.5 0 0 0 2.5 2.5H16', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        h('path', { d: 'M4.5 9.5h3A1.5 1.5 0 0 1 9 11v2a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 3 13v-2a1.5 1.5 0 0 1 1.5-1.5Z', stroke: 'currentColor', strokeWidth: 1.6, fill: active ? 'currentColor' : 'none' }),
        h('path', { d: 'm17 4.8 1.55 1.55L21.2 3.7M17 18h4m-4 2.5h2.75', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }));
    }
    function Button({ children, tone, className, ...props }) {
      return h('button', { type: 'button', className: cls('td-btn', tone && `td-${tone}`, className), ...props }, children);
    }
    function Download({ path, children }) {
      return h('a', { className: 'td-btn', href: API + path, download: true }, children);
    }
    function Field({ label, help, wide, children }) {
      return h('label', { className: cls('td-field', wide && 'td-wide') }, h('span', null, label), children, help && h('span', { className: 'td-muted' }, help));
    }
    function TextField({ label, help, wide, value, onValue, multiline, ...props }) {
      return h(Field, { label, help, wide }, h(multiline ? 'textarea' : 'input', { ...props, value: value ?? '', onChange: event => onValue(event.target.value) }));
    }
    function SelectField({ label, help, value, onValue, options, ...props }) {
      return h(Field, { label, help }, h('select', { ...props, value: value ?? '', onChange: event => onValue(event.target.value) },
        options.map(([key, name]) => h('option', { key, value: key }, name))));
    }
    function Check({ label, checked, onValue }) {
      return h('label', { className: 'td-check' }, h('input', { type: 'checkbox', checked: Boolean(checked), onChange: event => onValue(event.target.checked) }), label);
    }
    function Item({ title, desc, current, onClick }) {
      return h(Button, { className: 'td-item', 'aria-current': current ? 'true' : undefined, onClick }, h('span', null, title), desc && h('span', { className: 'td-muted' }, desc));
    }
    function RunItem({ item, t, current, onClick }) {
      const date = new Date(item.createdAt);
      return h(Button, { className: 'td-item td-run-item', 'aria-current': current ? 'true' : undefined, onClick },
        h('span', { className: 'td-run-title' }, item.sampleName || item.workflowName),
        h('span', { className: 'td-run-meta td-muted' },
          item.sampleName && h('span', null, item.workflowName),
          h('span', { className: item.ok ? undefined : 'td-run-failed' }, t(item.ok ? 'success' : 'failed'))),
        h('span', { className: 'td-run-meta td-muted' },
          Number.isFinite(date.getTime()) && h('time', { dateTime: item.createdAt }, historyDate.format(date)),
          h('span', null, duration(item.elapsedMs))));
    }
    function Note({ children, tone, urgent = false }) {
      return h('div', { className: cls('td-note', tone && `td-${tone}`), role: urgent ? 'alert' : 'status' }, children);
    }
    const badge = (text, tone, key) => h('span', { key, className: cls('td-badge', tone && `td-${tone}`) }, text);
    const code = value => h('pre', { className: 'td-code', tabIndex: 0 }, formatJson(value));
    const details = (name, content) => h('details', { className: 'td-detail td-block' }, h('summary', null, name), content);

    async function api(t, route, body, signal) {
      const headers = new Headers();
      if (nativeDesktop) headers.set(SESSION_HEADER, desktopSessionId || 'new');
      const options = { credentials: 'same-origin', redirect: 'error', signal, headers };
      if (body !== undefined) {
        headers.set('Content-Type', 'application/json');
        Object.assign(options, { method: 'POST', body: JSON.stringify(body) });
      }
      let response;
      try { response = await fetch(API + route, options); }
      catch (error) { if (signal?.aborted) throw error; throw new Error(t('networkError')); }
      let result;
      try { result = await response.json(); }
      catch { throw new Error(`${t('invalidResponse')} (${http(response.status)})`); }
      if (!response.ok) throw new Error(result?.error?.message || `${t('hostError')} (${http(response.status)})`);
      if (nativeDesktop) {
        const sessionId = response.headers.get(SESSION_HEADER);
        if (sessionId && /^[A-Za-z0-9_-]{43}$/.test(sessionId)) desktopSessionId = sessionId;
      }
      return result;
    }

    function readState(value, t) {
      let parsed = value.text;
      if (value.mode === 'json') {
        try { parsed = JSON.parse(parsed); } catch { throw new Error(t('badState')); }
      }
      if (typeof parsed === 'string' ? !parsed.trim() : !(parsed && typeof parsed === 'object')) throw new Error(t('badState'));
      return parsed;
    }
    function questionDraft(q, uid) {
      return { key: uid(), id: q.id ?? '', instructions: q.instructions ?? '', type: q.type,
        choices: q.type === 'choice' ? Object.entries(q.criteria || {}).map(([label, description]) => ({ key: uid(), label, description: description ?? '' })) : [],
        booleans: q.type === 'noul' ? { ...q.criteria } : {},
        levels: q.type === 'score' ? (q.criteria || []).map(label => ({ key: uid(), label })) : [] };
    }
    function workflowDraft(record, uid) {
      return { id: record.id, draftKey: record.id ? undefined : uid(), name: record.name, description: record.description ?? '',
        questions: record.questions.map(q => questionDraft(q, uid)),
        rules: (record.rules || []).map(rule => ({ ...rule, key: uid(), threshold: String(rule.threshold) })),
        examples: (record.examples || []).map(example => ({ ...activeState(example.state), name: example.name, key: uid() })) };
    }
    function workflowValue(workflow, t, includeId = true) {
      const questions = workflow.questions.map(q => {
        const item = { id: q.id, instructions: q.instructions, type: q.type };
        if (q.type === 'choice') {
          const entries = q.choices.map(({ label, description }) => [label.trim(), description.trim() || null]);
          if (entries.some(([label]) => !label) || new Set(entries.map(([label]) => label)).size !== entries.length) throw new Error(t('duplicateOptions'));
          item.criteria = Object.fromEntries(entries);
        } else if (q.type === 'score') item.criteria = q.levels.map(level => level.label);
        else {
          const entries = Object.entries(q.booleans).filter(([, value]) => value?.trim());
          if (entries.length) item.criteria = Object.fromEntries(entries);
        }
        return item;
      });
      return { ...(includeId && workflow.id ? { id: workflow.id } : {}), name: workflow.name, description: workflow.description, questions,
        rules: workflow.rules.map(({ key, threshold, ...rule }) => {
          if (rule.enabled && !String(threshold).trim()) throw new Error(t('thresholdNeeded'));
          return { ...rule, threshold: Number(threshold) };
        }),
        examples: workflow.examples.map(sample => ({ name: sample.name, state: readState(sample, t) })) };
    }
    function connectionDraft(record) {
      return { ...record, timeoutSeconds: String(record.timeoutSeconds), auth: { ...record.auth }, sessionKey: '', clearKey: false };
    }
    function connectionValue(draft) {
      const { id, name, preset, url, model, timeoutSeconds, auth, sessionKey, clearKey } = draft;
      return { ...(id ? { id } : {}), name, preset, url, model, timeoutSeconds: Number(timeoutSeconds),
        auth: auth.mode === 'env' ? { mode: auth.mode, envVar: auth.envVar } : { mode: auth.mode },
        ...(auth.mode === 'session' && (clearKey || sessionKey.trim()) ? { sessionKey: clearKey ? '' : sessionKey } : {}) };
    }

    function StateField({ t, label, value, onValue }) {
      return h('div', { className: 'td-stack' },
        h(SelectField, { label: t('stateMode'), value: value.mode, onValue: mode => onValue({ ...value, mode }), options: [['text', t('text')], ['json', t('json')]] }),
        h(TextField, { label, value: value.text, onValue: text => onValue({ ...value, text }), multiline: true, rows: 4,
          className: value.mode === 'json' ? 'td-mono' : undefined, spellCheck: value.mode !== 'json' }));
    }
    function QuestionEditor({ t, q, index, multiple, uid, update, remove }) {
      function setType(type) {
        update({ ...q, type,
          choices: type === 'choice' && !q.choices.length ? ['Accept', 'Needs review'].map(label => ({ label, description: '', key: uid() })) : q.choices,
          levels: type === 'score' && !q.levels.length ? ['Low', 'High'].map(label => ({ label, key: uid() })) : q.levels });
      }
      const updateChoice = (i, patch) => update({ ...q, choices: replaceAt(q.choices, i, { ...q.choices[i], ...patch }) });
      return h('div', { className: 'td-block td-stack' },
        h('div', { className: 'td-row td-spread' }, h('div', { className: 'td-row' }, h('h3', { className: 'td-subhead' }, `${t('questionName')} ${index + 1}`), badge(t(q.type))),
          h(Button, { tone: 'destruct', onClick: remove, disabled: !multiple }, t('removeQuestion'))),
        h('div', { className: 'td-grid' },
          h(TextField, { label: t('questionId'), value: q.id, onValue: id => update({ ...q, id }), className: 'td-mono', spellCheck: false }),
          h(SelectField, { label: t('questionType'), value: q.type, onValue: setType, options: ['choice', 'noul', 'score'].map(type => [type, t(type)]) }),
          h(TextField, { label: t('instructions'), value: q.instructions, onValue: instructions => update({ ...q, instructions }), multiline: true, rows: 2, wide: true })),
        q.type === 'choice' && h('div', { className: 'td-stack' }, h('h3', { className: 'td-subhead' }, t('choices')),
          q.choices.map((option, i) => h('div', { className: 'td-choice-row', key: option.key },
            h(TextField, { label: `${t('optionLabel')} ${i + 1}`, value: option.label, onValue: label => updateChoice(i, { label }) }),
            h(TextField, { label: t('optionDescription'), value: option.description, onValue: description => updateChoice(i, { description }) }),
            h(Button, { tone: 'destruct', title: t('removeOption'), 'aria-label': `${t('removeOption')} ${i + 1}`, disabled: q.choices.length <= 2,
              onClick: () => update({ ...q, choices: dropAt(q.choices, i) }) }, '−'))),
          h('div', null, h(Button, { disabled: q.choices.length >= 20, onClick: () => update({ ...q, choices: [...q.choices, { key: uid(), label: '', description: '' }] }) }, t('addOption')))),
        q.type === 'noul' && h('div', { className: 'td-stack' }, h('p', { className: 'td-muted' }, t('noulHelp')),
          h('div', { className: 'td-grid' }, [['true', 'yes'], ['false', 'false']].map(([key, caption]) =>
            h(TextField, { key, label: t(caption), value: q.booleans[key], onValue: value => update({ ...q, booleans: { ...q.booleans, [key]: value } }) })))),
        q.type === 'score' && h('div', { className: 'td-stack' }, h('p', { className: 'td-muted' }, t('scoreHelp')),
          q.levels.map((level, i) => h('div', { className: 'td-level-row', key: level.key },
            h(TextField, { label: `${t('level')} ${i + 1}`, value: level.label, onValue: label => update({ ...q, levels: replaceAt(q.levels, i, { ...level, label }) }) }),
            h(Button, { tone: 'destruct', title: t('removeLevel'), 'aria-label': `${t('removeLevel')} ${i + 1}`, disabled: q.levels.length <= 2,
              onClick: () => update({ ...q, levels: dropAt(q.levels, i) }) }, '−'))),
          h('div', null, h(Button, { disabled: q.levels.length >= 10, onClick: () => update({ ...q, levels: [...q.levels, { key: uid(), label: '' }] }) }, t('addLevel')))));
    }
    function RuleEditor({ t, rules, questions, update, uid }) {
      const targets = questions.filter(q => q.type === 'choice' && q.id.trim());
      const targetOptions = [...new Set(targets.map(q => q.id.trim()))];
      const defaultResult = q => (q?.choices.find(option => option.label.trim() === 'Needs review') ?? q?.choices.at(-1))?.label.trim() ?? '';
      const withExisting = (options, existing) => existing && !options.includes(existing) ? [...options, existing] : options;
      return h('div', { className: 'td-stack' },
        h('div', { className: 'td-row td-spread' }, h('h3', { className: 'td-subhead' }, t('ruleTitle')),
          h(Button, { disabled: !targets.length || rules.length >= 25, onClick: () => {
            const target = targets.find(q => !rules.some(rule => rule.enabled && rule.questionId === q.id.trim())) ?? targets[0];
            update([...rules, { key: uid(), type: 'low-margin-review', enabled: !rules.some(rule => rule.enabled && rule.questionId === target.id.trim()), questionId: target.id.trim(), result: defaultResult(target), threshold: '0.12' }]);
          } }, t('addRule'))),
        h('p', { className: 'td-muted' }, t('ruleHelp')),
        rules.map((rule, i) => {
          const set = patch => update(replaceAt(rules, i, { ...rule, ...patch }));
          const target = targets.find(q => q.id.trim() === rule.questionId);
          const values = [...new Set((target?.choices || []).map(option => option.label.trim()).filter(Boolean))];
          return h('div', { className: 'td-block td-stack', key: rule.key },
            h('div', { className: 'td-row td-spread' }, h(Check, { label: t('enableRule'), checked: rule.enabled, onValue: enabled => set({ enabled }) }),
              h(Button, { tone: 'destruct', onClick: () => update(dropAt(rules, i)) }, t('removeRule'))),
            h('div', { className: 'td-grid' },
              h(SelectField, { label: t('ruleQuestion'), value: rule.questionId, options: [['', t('chooseQuestion')], ...withExisting(targetOptions, rule.questionId).map(id => [id, targetOptions.includes(id) ? id : `${id} (${t('missing')})`])],
                onValue: questionId => set({ questionId, result: defaultResult(targets.find(q => q.id.trim() === questionId)) }) }),
              h(SelectField, { label: t('ruleResult'), value: rule.result, options: [['', t('chooseOutcome')], ...withExisting(values, rule.result).map(value => [value, values.includes(value) ? value : `${value} (${t('missing')})`])], onValue: result => set({ result }) }),
              h(TextField, { label: t('ruleThreshold'), type: 'number', min: 0, max: 1, step: 'any', value: rule.threshold, onValue: threshold => set({ threshold }) })),
            rule.enabled && (!target || !values.includes(rule.result)) && h(Note, { tone: 'warn' }, t('missingRuleTarget')));
        }));
    }

    function WorkflowView({ t, records, workflow, input, sampleId, selected, connections, connectionId, chooseConnection, selectWorkflow,
      parked, selectDraft, newWorkflow, copyWorkflow, onWorkflow, setInput, useSample, uid, dirty, pending, save, preview, request, run, pickImport, fileRef }) {
      const siblings = records.filter(record => !BUILTINS.includes(record.id));
      const currentConnection = connections.find(connection => connection.id === connectionId);
      const group = list => list.map(record => h(Item, { key: record.id, title: record.id === workflow?.id ? workflow.name : record.name,
        desc: `${t('questionsCount')}: ${record.questions.length} · ${t('samplesCount')}: ${record.examples?.length ?? 0}`,
        current: record.id === selected, onClick: () => selectWorkflow(record) }));
      const chooseSample = id => {
        const sample = workflow.examples.find(item => item.key === id);
        if (sample) useSample(sample); else setInput(input, '');
      };
      return h('div', { className: 'td-layout' },
        h('aside', { className: 'td-panel td-stack', 'aria-label': t('library') },
          h('h2', { className: 'td-heading' }, t('library')),
          h('div', { className: 'td-row' }, h(Button, { disabled: Boolean(pending), onClick: newWorkflow }, t('newWorkflow')),
            h(Button, { disabled: Boolean(pending), onClick: () => fileRef.current?.click() }, t('import')),
            h('input', { ref: fileRef, type: 'file', accept: '.json,application/json', hidden: true, onChange: pickImport })),
          h('div', { className: 'td-list' },
            !workflow?.id && workflow && h(Item, { title: workflow.name || t('namePrompt'), desc: t('unsaved'), current: true }),
            parked.map(draft => h(Item, { key: draft.work.draftKey, title: draft.work.name || t('namePrompt'), desc: t('unsaved'), onClick: () => selectDraft(draft) })),
            records.some(record => BUILTINS.includes(record.id)) && h('p', { className: 'td-label' }, t('builtIns')),
            group(records.filter(record => BUILTINS.includes(record.id))),
            Boolean(siblings.length) && h('p', { className: 'td-label' }, t('savedWorkflows')), group(siblings))),
        h('section', { className: 'td-panel td-stack', 'aria-label': t('workflows') }, !workflow ? h('p', { className: 'td-muted' }, t('noWorkflow')) : h(React.Fragment, null,
          h('div', { className: 'td-row td-spread' },
            h('div', { className: 'td-row' }, h('h2', { className: 'td-heading' }, workflow.name || t('namePrompt')),
              BUILTINS.includes(workflow.id) && badge(t('builtIn')), dirty && badge(t('unsaved'), 'warn')),
            h('div', { className: 'td-row' }, h(Button, { disabled: Boolean(pending), onClick: copyWorkflow }, t('duplicate')),
              workflow.id && (dirty ? h(Button, { disabled: true }, t('exportWorkflow')) : h(Download, { path: `/workflows/${pathId(workflow.id)}/export` }, t('exportWorkflow'))),
              h(Button, { disabled: !dirty || Boolean(pending), onClick: save }, t('saveWorkflow')))),
           dirty && h('p', { className: 'td-muted' }, t('saveBeforeLeaving')),
          h('div', { className: 'td-block td-stack' },
            h('div', { className: 'td-grid' },
              h(SelectField, { label: t('connectedModel'), value: connectionId, disabled: Boolean(pending), onValue: chooseConnection,
                options: [['', t('selectConnection')], ...connections.map(connection => [connection.id, connection.name])] }),
              currentConnection && h('div', null, h('p', { className: 'td-label' }, t('model')), h('p', { className: 'td-muted td-mono' }, currentConnection.model))),
            h('div', { className: 'td-row td-spread' }, h('h3', { className: 'td-subhead' }, t('input')),
              h('div', { className: 'td-row' }, h(Button, { disabled: !connectionId || Boolean(pending), onClick: preview }, t('preview')),
                h(Button, { tone: 'primary', disabled: !connectionId || Boolean(pending), onClick: run }, t('run')))),
            h(SelectField, { label: t('chooseSample'), value: sampleId, onValue: chooseSample,
              options: [['', t('customInput')], ...workflow.examples.map(sample => [sample.key, sample.name])] }),
            h(StateField, { t, label: t('input'), value: input, onValue: value => setInput(value, '') }),
            h('p', { className: 'td-muted' }, t('stateHelp')),
            request && h('details', { className: 'td-detail td-block', open: true }, h('summary', null, t('request')), code(request))),
          details(t('editSamples'), h('div', { className: 'td-stack' },
            h('div', null, h(Button, { disabled: workflow.examples.length >= 30, onClick: () => {
              const sample = { ...input, name: `${t('sample')} ${workflow.examples.length + 1}`, key: uid() };
              onWorkflow({ ...workflow, examples: [...workflow.examples, sample] });
            } }, t('addSample'))),
            workflow.examples.map((sample, i) => {
              const updateSample = next => onWorkflow({ ...workflow, examples: replaceAt(workflow.examples, i, next) });
              return h('div', { className: 'td-block td-stack', key: sample.key },
                h(TextField, { label: t('sampleName'), value: sample.name, onValue: name => updateSample({ ...sample, name }) }),
                h(StateField, { t, label: t('sampleState'), value: sample, onValue: updateSample }),
                h('div', { className: 'td-row' }, h(Button, { onClick: () => useSample(sample) }, t('useSample')),
                  h(Button, { tone: 'destruct', onClick: () => {
                    if (sampleId === sample.key) setInput(input, '');
                    onWorkflow({ ...workflow, examples: dropAt(workflow.examples, i) });
                  } }, t('removeSample'))));
            }))),
          h('div', { className: 'td-grid' },
            h(TextField, { label: t('workflowName'), value: workflow.name, onValue: name => onWorkflow({ ...workflow, name }) }),
            h(TextField, { label: t('workflowDescription'), value: workflow.description, onValue: description => onWorkflow({ ...workflow, description }) })),
          h('div', { className: 'td-row td-spread' }, h('h3', { className: 'td-subhead' }, t('questions')),
            h(Button, { disabled: workflow.questions.length >= 25, onClick: () => {
              let n = workflow.questions.length + 1;
              while (workflow.questions.some(q => q.id === `decision_${n}`)) n++;
              onWorkflow({ ...workflow, questions: [...workflow.questions, questionDraft(defaultQuestion(`decision_${n}`), uid)] });
            } }, t('addQuestion'))),
          workflow.questions.map((q, i) => h(QuestionEditor, { key: q.key, t, q, index: i, uid, multiple: workflow.questions.length > 1,
            update: next => {
              const trimmed = next.id.trim();
              const oldId = q.id.trim();
              const questionIdChanged = next.id !== q.id && trimmed && !workflow.questions.some((item, index) => index !== i && item.id.trim() === trimmed);
              onWorkflow({ ...workflow, questions: replaceAt(workflow.questions, i, next), rules: questionIdChanged ? workflow.rules.map(rule => rule.questionId === oldId ? { ...rule, questionId: trimmed } : rule) : workflow.rules });
            }, remove: () => onWorkflow({ ...workflow, questions: dropAt(workflow.questions, i), rules: workflow.rules.filter(rule => rule.questionId !== q.id.trim()) }) })),
          h(RuleEditor, { t, uid, rules: workflow.rules, questions: workflow.questions, update: rules => onWorkflow({ ...workflow, rules }) }))));
    }

    function OutcomeMessage({ t, outcome, test = false }) {
      if (!outcome) return null;
      const status = [http(outcome.upstreamStatus), duration(outcome.elapsedMs)].filter(Boolean).join(' · ');
      const title = test ? t(outcome.ok ? 'testPassed' : 'testFailed') : t('runFailed');
      return h(Note, { tone: outcome.ok ? 'success' : 'error', urgent: !outcome.ok },
        h('strong', null, title, status ? ` · ${status}` : ''),
        outcome.error?.message && h('p', null, outcome.error.message),
        outcome.error?.retryAfter != null && h('p', null, `${t('retryAfter')}: ${outcome.error.retryAfter}`));
    }
    function ConnectionView({ t, records, draft, activeId, selected, dirty, update, select, create, activate, pending, save, test, testResult, discover, discovery }) {
      const set = patch => update({ ...draft, ...patch });
      const tiiny = draft?.preset === 'tiiny';
      const active = selected && selected === activeId;
      return h('div', { className: 'td-layout' },
        h('aside', { className: 'td-panel td-stack', 'aria-label': t('connections') }, h('h2', { className: 'td-heading' }, t('connectionLibrary')),
          h('div', null, h(Button, { onClick: create, disabled: Boolean(pending) }, t('newConnection'))),
          h('div', { className: 'td-list' },
            !draft?.id && draft && h(Item, { current: true, title: draft.name || t('newConnection'), desc: t('unsaved') }),
            records.map(record => h(Item, { key: record.id, current: selected === record.id, title: record.name,
              desc: `${t(record.preset)}${activeId === record.id ? ` · ${t('selectedConnection')}` : ''}`, onClick: () => select(record) })))),
        h('section', { className: 'td-panel td-stack', 'aria-label': t('connections') }, !draft ? h('p', { className: 'td-muted' }, t('noConnection')) : h(React.Fragment, null,
          h('div', { className: 'td-row td-spread' },
            h('div', { className: 'td-row' }, h('h2', { className: 'td-heading' }, draft.name || t('newConnection')), dirty && badge(t('unsaved'), 'warn')),
            h('div', { className: 'td-row' }, h(Button, { disabled: Boolean(!draft.id || dirty || active || pending), onClick: () => activate(draft.id) }, t(active ? 'selectedConnection' : 'useConnection')),
              h(Button, { tone: 'primary', disabled: !dirty || Boolean(pending), onClick: save }, t('saveConnection')))),
          h('div', { className: 'td-grid' },
            h(TextField, { label: t('connectionName'), value: draft.name, onValue: name => set({ name }) }),
            h(SelectField, { label: t('preset'), value: draft.preset, options: ['tiiny', 'custom'].map(preset => [preset, t(preset)]), onValue: preset => set({ preset,
              ...(!draft.id && !dirty ? { name: t(preset) } : {}), ...(draft.name === t('tiiny') || draft.name === t('custom') ? { name: t(preset) } : {}),
              ...(preset === 'tiiny' && Number(draft.timeoutSeconds) < 60 ? { timeoutSeconds: '120' } : {}),
              ...(preset === 'custom' && !draft.id && draft.auth.mode === 'env' && draft.auth.envVar === 'TIINY_API_KEY' ? { auth: { mode: 'none' } } : {}) }) })),
          tiiny && h('div', { className: 'td-block' }, h('h3', { className: 'td-subhead' }, t('setup')),
            h('ol', null, h('li', null, t('downloadModel')), h('li', null, t('loadModel'), ' ',
              h('a', { href: 'https://dev.tiiny.ai/#/concepts-model-management', target: '_blank', rel: 'noopener noreferrer' }, t('manageModels'))),
              h('li', null, t('fullUrl'), ' ', h('code', null, TIINY_URL), ' · ', h('code', null, 'http://<device-ip>/v1/systemone')),
              h('li', null, t('chooseModel'), ' ', h('code', null, TIINY_MODEL), ' · ', t('cloudAlias'))),
            h(Button, { onClick: () => set({ url: TIINY_URL, model: TIINY_MODEL, timeoutSeconds: '120' }) }, t('useDefaults'))),
          h(TextField, { label: t('endpoint'), value: draft.url, onValue: url => set({ url, sessionKey: '', clearKey: false }), type: 'url', className: 'td-mono', spellCheck: false, placeholder: TIINY_URL, help: t('modelHint') }),
          h('div', { className: 'td-grid' },
            h(TextField, { label: t('model'), value: draft.model, onValue: model => set({ model }), className: 'td-mono', spellCheck: false, placeholder: TIINY_MODEL }),
            h(TextField, { label: t('timeout'), value: draft.timeoutSeconds, onValue: timeoutSeconds => set({ timeoutSeconds }), type: 'number', min: tiiny ? 60 : 1, max: 600, step: 1, help: tiiny ? t('timeoutHint') : undefined })),
          h(SelectField, { label: t('authentication'), value: draft.auth.mode, options: [['none', t('noAuth')], ['env', t('env')], ['session', t('session')]],
            onValue: mode => set({ auth: { mode, envVar: draft.auth.envVar ?? (tiiny ? 'TIINY_API_KEY' : '') }, sessionKey: '', clearKey: false }) }),
          draft.auth.mode === 'env' && h(TextField, { label: t('envName'), value: draft.auth.envVar, onValue: envVar => set({ auth: { ...draft.auth, envVar } }), className: 'td-mono', spellCheck: false, help: t('envHint') }),
          draft.auth.mode === 'session' && h(React.Fragment, null,
            h(TextField, { label: t('sessionKey'), value: draft.sessionKey, onValue: sessionKey => set({ sessionKey }), type: 'password', autoComplete: 'new-password', disabled: draft.clearKey, help: t('sessionHint') }),
            draft.id && h(Check, { label: t('clearKey'), checked: draft.clearKey, onValue: clearKey => set({ clearKey, ...(clearKey ? { sessionKey: '' } : {}) }) })),
          tiiny && h('section', { className: 'td-block td-stack', 'aria-label': t('findPocketModels') },
            h('div', { className: 'td-row' }, h(Button, { onClick: discover, disabled: Boolean(pending) }, t('findPocketModels'))),
            h('p', { className: 'td-muted' }, t('pocketModelHint')),
            discovery && (discovery.ok
              ? discovery.models.length
                ? h(React.Fragment, null,
                  h(Note, { tone: 'success' }, `${discovery.models.length} ${t('pocketModelsFound')}`),
                  h(SelectField, { label: t('pickPocketModel'), value: discovery.models.some(item => item.id === draft.model) ? draft.model : '',
                    options: [['', t('selectPocketModel')], ...discovery.models.map(({ id }) => [id, id])],
                    onValue: model => { if (model) set({ model }); } }))
                : h(Note, null, t('noPocketModels'))
              : h(Note, { tone: 'error', urgent: true }, h('strong', null, t('pocketModelsFailed')),
                discovery.error?.message && h('p', null, discovery.error.message)))),
          h('div', { className: 'td-row' }, h(Button, { onClick: test, disabled: Boolean(pending) }, t('testConnection'))),
          dirty && h('p', { className: 'td-muted' }, t('draftTest')),
           h(OutcomeMessage, { outcome: testResult, t, test: true }),
          testResult?.response !== undefined && details(t('testResponse'), code(testResult.response)))));
    }

    function RunResult({ t, item }) {
      const answer = value => value == null ? t('unavailable') : typeof value === 'object' ? formatJson(value) : String(value);
      const probabilities = item.probabilities && typeof item.probabilities === 'object' ? Object.entries(item.probabilities) : [];
      return h('div', { className: 'td-block td-stack' },
        h('div', { className: 'td-row td-spread' }, h('div', { className: 'td-row' }, h('code', null, item.id), badge(t(item.type))),
          item.ruleApplied && badge(t('routed'), 'warn')),
        item.question && h('p', { className: 'td-muted' }, item.question),
        h('div', { className: 'td-answers' },
          h('div', null, h('h3', { className: 'td-label' }, t('rawAnswer')), h('strong', null, answer(item.modelAnswer))),
          h('div', null, h('h3', { className: 'td-label' }, t('result')), h('strong', null, answer(item.workflowResult)))),
        h('p', { className: 'td-muted' }, `${t('confidence')}: ${item.confidence == null ? t('unavailable') : percent(item.confidence)}`),
        item.ruleApplied && h(Note, { tone: 'warn' }, `${t('gap')}: ${points(item.ruleApplied.gap)} · ${t('threshold')}: ${points(item.ruleApplied.threshold)}`),
        probabilities.length ? h('div', { className: 'td-stack' }, h('h3', { className: 'td-label' }, t('probabilities')),
          h('dl', { className: 'td-probabilities' }, probabilities.map(([key, value]) => h('div', { key }, h('dt', null, key), h('dd', null, typeof value === 'number' ? percent(value) : answer(value)))))
        ) : h('p', { className: 'td-muted' }, `${t('probabilities')}: ${t('unavailable')}`));
    }
    function RunsView({ t, records, select, selected, run, detailError, detailLoading, refresh, rerun, pending }) {
      return h('div', { className: 'td-layout' },
        h('aside', { className: 'td-panel td-stack', 'aria-label': t('history') }, h('h2', { className: 'td-heading' }, t('history')),
          h('div', null, h(Button, { onClick: refresh, disabled: Boolean(pending) }, t('refresh'))),
          records.length ? h('div', { className: 'td-list' }, records.map(item => h(RunItem, { key: item.id, item, t,
            current: item.id === selected, onClick: () => select(item.id) }))) : h('p', { className: 'td-muted' }, t('noRuns'))),
        h('section', { className: 'td-panel td-stack', 'aria-label': t('runDetail') },
          detailLoading ? h(Note, null, t('runLoading')) : detailError ? h(Note, { urgent: true, tone: 'error' }, detailError) : !run ? h('p', { className: 'td-muted' }, t('noRuns')) : h(React.Fragment, null,
            h('div', { className: 'td-row td-spread' },
              h('div', null, h('div', { className: 'td-row' }, h('h2', { className: 'td-heading' }, run.workflow.name), badge(t(run.ok ? 'success' : 'failed'), run.ok ? 'success' : 'error')),
                h('p', { className: 'td-muted' }, `${run.connection.name} · ${run.request.model}`)),
              h('div', { className: 'td-row' }, h(Download, { path: `/runs/${pathId(run.id)}/export` }, t('exportRun')),
                h(Button, { tone: 'primary', onClick: rerun, disabled: Boolean(pending) }, t('rerun')))),
            h('div', { className: 'td-row' }, [formatDate(run.createdAt), http(run.upstreamStatus), `${t('elapsed')}: ${duration(run.elapsedMs) ?? t('unavailable')}`].filter(Boolean).map(item => badge(item, undefined, item))),
            run.rerunOf && h('p', { className: 'td-muted' }, `${t('rerunOf')} ${run.rerunOf}`),
            !run.ok && h(OutcomeMessage, { t, outcome: run }),
            run.results?.map(item => h(RunResult, { key: item.id, t, item })),
            run.request && details(t('request'), code(run.request)),
            details(t('response'), run.response == null ? h('p', { className: 'td-muted' }, t('unavailable')) : code(run.response)),
            details(t('snapshot'), code({ workflow: run.workflow, connection: run.connection })))));
    }

    function Panel({ t }) {
      const [tab, setTab] = useState(TABS.workflows);
      const [workflows, setWorkflows] = useState([]);
      const [connections, setConnections] = useState([]);
      const [runs, setRuns] = useState([]);
      const [loading, setLoading] = useState(true);
      const [initialError, setInitialError] = useState('');
      const [version, setVersion] = useState(0);
      const [work, setWork] = useState(null);
      const [dirty, setDirty] = useState(false);
      const [input, setInput] = useState({ mode: 'text', text: '' });
      const [sampleId, setSampleId] = useState('');
      const [request, setRequest] = useState(null);
      const [connection, setConnection] = useState(null);
      const [connectionDirty, setConnectionDirty] = useState(false);
      const [activeId, setActiveId] = useState('');
      const [testResult, setTestResult] = useState(null);
      const [discovery, setDiscovery] = useState(null);
      const discoveryRequest = useRef(null);
      const [selectedRun, setSelectedRun] = useState('');
      const [runDetail, setRunDetail] = useState(null);
      const [detailError, setDetailError] = useState('');
      const [detailLoading, setDetailLoading] = useState(false);
      const [pending, setPending] = useState('');
      const [flash, setFlash] = useState(null);
      const sequence = useRef(0);
      const fileRef = useRef(null);
      const inFlight = useRef(null);
      const workDrafts = useRef(new Map());
      const runCache = useRef(new Map());
      const uid = () => `td-${++sequence.current}`;

      function restoreWorkflow(draft) {
        setWork(draft.work); setDirty(draft.dirty); setInput(draft.input); setSampleId(draft.sampleId); setRequest(null);
      }
      function applyWorkflow(record, restore = false) {
        const restored = restore && workDrafts.current.get(record.id);
        if (restored) {
          restoreWorkflow(restored);
        } else {
          const draft = workflowDraft(record, uid);
          const example = draft.examples[0];
          setWork(draft); setDirty(!record.id); setInput({ mode: example?.mode ?? 'text', text: example?.text ?? '' }); setSampleId(example?.key ?? '');
        }
        setRequest(null);
      }
      function rememberWorkflow() {
        if (work) workDrafts.current.set(work.id ?? work.draftKey, { work, dirty, input, sampleId });
      }
      function resetDiscovery() {
        discoveryRequest.current = null;
        setDiscovery(null);
      }
      function updateConnection(draft) {
        if (['id', 'preset', 'url', 'sessionKey', 'clearKey'].some(field => draft[field] !== connection[field]) ||
            draft.auth.mode !== connection.auth.mode || draft.auth.envVar !== connection.auth.envVar) resetDiscovery();
        setConnection(draft);
        setConnectionDirty(true);
        setTestResult(null);
      }
      function resetConnection(record) {
        resetDiscovery();
        setConnection(record ? connectionDraft(record) : null);
        setTestResult(null);
        setConnectionDirty(Boolean(record && !record.id));
      }
      function switchTab(next) {
        if (next !== TABS.connections) {
          resetDiscovery();
          setConnection(current => current && { ...current, sessionKey: '', clearKey: false });
        }
        setFlash(null);
        setTab(next);
      }
      function chooseConnection(id) { setActiveId(id); setRequest(null); }
      function chooseWorkflow(record) {
        if (record.id === work?.id) return;
        rememberWorkflow(); applyWorkflow(record, true); setFlash(null);
      }
      function changeWorkflow(workflow) { setWork(workflow); setDirty(true); setRequest(null); }
      function changeInput(next, id = '') { setInput(next); setSampleId(id); setRequest(null); }
      function useSample(sample) { changeInput({ mode: sample.mode, text: sample.text }, sample.key); }

      useEffect(() => () => inFlight.current?.abort(), []);
      useEffect(() => {
        const ctrl = new AbortController();
        setLoading(true); setInitialError('');
        Promise.all(['/workflows', '/connections', '/runs'].map(route => api(t, route, undefined, ctrl.signal))).then(([w, c, r]) => {
          if (ctrl.signal.aborted) return;
          setWorkflows(w.workflows); setConnections(c.connections); setRuns(r.runs);
          const first = w.workflows.find(item => item.id === 'order-inbox') ?? w.workflows[0];
          if (first) applyWorkflow(first);
          const conn = c.connections.find(item => item.id === 'tiiny-pocket') ?? c.connections[0];
          chooseConnection(conn?.id ?? ''); resetConnection(conn);
          setSelectedRun(r.runs[0]?.id ?? '');
        }).catch(error => { if (!ctrl.signal.aborted) setInitialError(errText(error, t)); })
          .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
        return () => ctrl.abort();
      }, [version]);
      useEffect(() => {
        if (tab !== TABS.runs || !selectedRun) return;
        const ctrl = new AbortController();
        const cached = runCache.current.get(selectedRun);
        setDetailError('');
        if (cached) { setRunDetail(cached); setDetailLoading(false); return; }
        setRunDetail(null); setDetailLoading(true);
        api(t, `/runs/${pathId(selectedRun)}`, undefined, ctrl.signal).then(({ run }) => {
          if (ctrl.signal.aborted) return;
          runCache.current.set(run.id, run); setRunDetail(run);
        }).catch(error => { if (!ctrl.signal.aborted) setDetailError(errText(error, t)); })
          .finally(() => { if (!ctrl.signal.aborted) setDetailLoading(false); });
        return () => ctrl.abort();
      }, [tab, selectedRun]);

      async function doAction(label, action) {
        if (inFlight.current) return;
        const ctrl = new AbortController();
        inFlight.current = ctrl;
        setPending(label); setFlash(null);
        try { await action(ctrl.signal); }
        catch (error) { if (!ctrl.signal.aborted) setFlash({ tone: 'error', text: errText(error, t) }); }
        finally {
          if (inFlight.current === ctrl) inFlight.current = null;
          if (!ctrl.signal.aborted) setPending('');
        }
      }
      function showSuccess(key) { setFlash({ tone: 'success', text: t(key) }); }
      function saveWorkflow(signal) {
        const body = workflowValue(work, t);
        return api(t, '/workflows', body, signal).then(({ workflow }) => {
          if (signal.aborted) return workflow;
          setWorkflows(items => put(items, workflow));
          workDrafts.current.delete(work.id ?? work.draftKey);
          setWork({ ...work, id: workflow.id, draftKey: undefined }); setDirty(false);
          return workflow;
        });
      }
      function duplicateWorkflow() {
        try {
          const definition = workflowValue(work, t, false);
          const copy = { ...definition, name: `${definition.name.trim().slice(0, 90)} ${t('copySuffix')}` };
          rememberWorkflow();
          const draft = workflowDraft(copy, uid);
          setWork(draft); setDirty(true); setSampleId(''); setRequest(null);
          showSuccess('duplicated');
        } catch (error) { setFlash({ tone: 'error', text: errText(error, t) }); }
      }
      function pickImport(event) {
        const element = event.currentTarget;
        const file = element.files?.[0];
        element.value = '';
        if (!file) return;
        doAction('working', async signal => {
          if (file.size > 1024 * 1024) throw new Error(t('badImport'));
          let document;
          try { document = JSON.parse(await file.text()); } catch { throw new Error(t('badImport')); }
          if (signal.aborted) return;
          const { workflow } = await api(t, '/workflows/import', document, signal);
          if (signal.aborted) return;
          rememberWorkflow(); setWorkflows(items => put(items, workflow)); applyWorkflow(workflow); showSuccess('imported');
        });
      }
      function previewWorkflow() {
        doAction('previewWorking', async signal => {
          setRequest(null);
          const { request } = await api(t, '/preview', { connectionId: activeId, workflow: workflowValue(work, t, false), state: readState(input, t) }, signal);
          if (!signal.aborted) setRequest(request);
        });
      }
      function recordRun(run) {
        runCache.current.set(run.id, run); setRunDetail(run); setDetailError(''); setDetailLoading(false);
        setRuns(items => [{ id: run.id, createdAt: run.createdAt, workflowName: run.workflow.name, sampleName: run.sampleName, connectionName: run.connection.name,
          model: run.request.model, ok: run.ok, elapsedMs: run.elapsedMs, upstreamStatus: run.upstreamStatus }, ...items.filter(item => item.id !== run.id)]);
        setSelectedRun(run.id);
      }
      function execute() {
        doAction('running', async signal => {
          const state = readState(input, t);
          const workflow = dirty || !work.id ? await saveWorkflow(signal) : work;
          if (signal.aborted) return;
          const { run } = await api(t, '/run', { connectionId: activeId, workflowId: workflow.id, state }, signal);
          if (signal.aborted) return;
          recordRun(run); switchTab(TABS.runs);
          if (run.ok) showSuccess('runSaved'); else setFlash({ tone: 'error', text: t('failedRecorded') });
        });
      }
      function saveConnection() {
        doAction('working', async signal => {
          const body = connectionValue(connection);
          const { connection: saved } = await api(t, '/connections', body, signal);
          if (signal.aborted) return;
          setConnections(items => put(items, saved)); resetConnection(saved); setTestResult(testResult); setDiscovery(discovery);
          chooseConnection(activeId || saved.id); showSuccess('connectionSaved');
        });
      }
      function discoverModels() {
        doAction('findingPocketModels', async signal => {
          setDiscovery(null);
          const request = {};
          discoveryRequest.current = request;
          const { discovery: result } = await api(t, '/connections/models', connectionValue(connection), signal);
          if (!signal.aborted && discoveryRequest.current === request) setDiscovery(result);
        });
      }
      function testConnection() {
        doAction('connectionTesting', async signal => {
          setTestResult(null);
          const { test } = await api(t, '/connections/test', connectionValue(connection), signal);
          if (!signal.aborted) setTestResult(test);
        });
      }
      function refreshRuns() {
        doAction('refreshWorking', async signal => {
          const { runs: refreshed } = await api(t, '/runs', undefined, signal);
          if (signal.aborted) return;
          setRuns(refreshed);
          setSelectedRun(current => refreshed.some(item => item.id === current) ? current : refreshed[0]?.id ?? '');
          if (detailError && selectedRun && refreshed.some(item => item.id === selectedRun)) {
            const { run } = await api(t, `/runs/${pathId(selectedRun)}`, undefined, signal);
            if (signal.aborted) return;
            runCache.current.set(run.id, run); setRunDetail(run); setDetailError('');
          }
        });
      }
      function rerun() {
        doAction('rerunning', async signal => {
          const { run } = await api(t, `/runs/${pathId(selectedRun)}/rerun`, {}, signal);
          if (!signal.aborted) recordRun(run);
        });
      }
      function renderView() {
        if (loading) return h(Note, null, t('loading'));
        if (initialError) return h('div', { className: 'td-stack' }, h(Note, { tone: 'error', urgent: true }, initialError),
          h('div', null, h(Button, { onClick: () => setVersion(current => current + 1) }, t('tryAgain'))));
        if (tab === TABS.connections) return h(ConnectionView, { t, records: connections, draft: connection, disabled: Boolean(pending), activeId,
          selected: connection?.id, dirty: connectionDirty, update: updateConnection,
          select: record => { resetConnection(record); setFlash(null); }, create: () => { resetConnection(defaultConnection()); setFlash(null); },
          activate: chooseConnection, testResult, pending, save: saveConnection, test: testConnection, discover: discoverModels, discovery });
        if (tab === TABS.runs) return h(RunsView, { t, records: runs, select: setSelectedRun, selected: selectedRun,
          run: runDetail?.id === selectedRun ? runDetail : null, detailLoading, detailError, refresh: refreshRuns, rerun, pending });
        return h(WorkflowView, { t, records: workflows, workflow: work, selected: work?.id, connections, connectionId: activeId,
          chooseConnection, selectWorkflow: chooseWorkflow,
          parked: [...workDrafts.current.values()].filter(draft => !draft.work.id && draft.work.draftKey !== work?.draftKey),
          selectDraft: draft => { rememberWorkflow(); restoreWorkflow(draft); setFlash(null); },
          newWorkflow: () => { rememberWorkflow(); applyWorkflow(defaultWorkflow()); setFlash(null); },
          copyWorkflow: duplicateWorkflow, onWorkflow: changeWorkflow, input, sampleId, setInput: changeInput, useSample, uid,
          dirty, pending, save: () => doAction('working', async signal => { await saveWorkflow(signal); if (!signal.aborted) showSuccess('workflowSaved'); }),
          request, preview: previewWorkflow, run: execute, pickImport, fileRef });
      }
      return h('div', { className: 'tdec', lang: 'en' }, h('style', null, CSS),
        h('div', { className: 'td-wrap' },
          h('header', { className: 'td-hero' }, h('div', { className: 'td-logo' }, h(Icon, { size: 24 })),
            h('div', null, h('h1', null, t('product')), h('p', { className: 'td-caption' }, t('subtitle')))),
          h('nav', { className: 'td-tabs', 'aria-label': t('product') }, Object.values(TABS).map(key =>
            h(Button, { key, onClick: () => switchTab(key), disabled: Boolean(pending), 'aria-pressed': tab === key }, t(key)))),
          h('div', { className: 'td-stack' },
            pending && h(Note, null, t(pending)),
            flash && h(Note, { tone: flash.tone, urgent: flash.tone === 'error' }, flash.text),
            h('fieldset', { style: { border: 0, padding: 0, margin: 0, minInlineSize: 0 }, disabled: Boolean(pending), 'aria-busy': Boolean(pending) }, renderView()))));
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(ID, { en: EN, zh: EN }), 'TiinyDecide text');
        const t = ctx.locale.bind(ID);
        const Main = () => h(Panel, { t });
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: ID }, Main));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: ID, order: 22, label: () => t('product') }, Icon));
      },
    };
  },
});
