import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONNECTION, BUILTIN_WORKFLOWS } from '../examples/builtins.mjs';
import { demoResponse } from '../examples/demo-upstream.mjs';
import { normalizeConnection, normalizeWorkflow, workflowEnvelope, importWorkflow, makePayload, readState, analyzeResponse } from '../public/model.mjs';

const [orderInbox, messageReview] = BUILTIN_WORKFLOWS.map(normalizeWorkflow);

test('transition between text and native JSON state; reject unsupported JSON scalars', () => {
  assert.equal(readState('text', '  Note.\n'), '  Note.\n');
  assert.deepEqual(readState('json', '[{"role":"user","content":"Hi"}]'), [{ role: 'user', content: 'Hi' }]);
  assert.equal(readState('json', '"A note"'), 'A note');
  assert.throws(() => readState('json', 'false'), /State must be/);
  assert.throws(() => readState('json', '{'), /not valid JSON/);
  assert.throws(() => readState('text', '   '), /input state/);
});

test('build a question-ID map for all Jev types and key results by question ID', () => {
  const workflow = normalizeWorkflow({ name: 'Combined', questions: [
    orderInbox.questions[0], messageReview.questions[0],
    { id: 'urgency.v2', type: 'score', instructions: 'How urgent?', criteria: ['Soon', 'Now'] }
  ] });
  const payload = makePayload(DEFAULT_CONNECTION, workflow, { text: 'Please respond.' });
  assert.deepEqual(Object.keys(payload.questions), ['route', 'reply_requested', 'urgency.v2']);
  assert.deepEqual(payload.questions['urgency.v2'], { type: 'score', instructions: 'How urgent?', criteria: ['Soon', 'Now'] });
  const response = { answers: { 'urgency.v2': { score: 0.42, confidence: 0 }, reply_requested: { noul: 0 }, route: { choice: 'Just an update' }, extra: { noul: 0.7 } } };
  const results = analyzeResponse(payload, workflow, response);
  assert.deepEqual(results.map(result => result.modelAnswer), ['Just an update', 0, 0.42]);
  assert.equal(results[2].confidence, 0);
  assert.equal(results[0].probabilities, null);
  assert.equal(results[0].confidence, null);
  const partial = analyzeResponse(payload, workflow, { answers: { reply_requested: { noul: 0.8 } } });
  assert.deepEqual(partial.map(result => result.available), [false, true, false]);
  assert.throws(() => analyzeResponse(payload, workflow, { answers: { route: { choice: 'unexpected' } } }), /valid answer/);
});

test('Order Inbox fixture exercises all example routes and keeps model choice unchanged', () => {
  const outcomes = orderInbox.examples.map(({ state }) => {
    const payload = makePayload(DEFAULT_CONNECTION, orderInbox, state);
    const [result] = analyzeResponse(payload, orderInbox, demoResponse(payload));
    return [result.modelAnswer, result.workflowResult];
  });
  assert.deepEqual(outcomes, [
    ['Action needed', 'Action needed'], ['Just an update', 'Just an update'],
    ['Return or order issue', 'Return or order issue'], ['Action needed', 'Needs review']
  ]);
});

test('review rule requires complete, numeric probabilities and a strict margin; can be disabled', () => {
  const workflow = structuredClone(orderInbox);
  workflow.rules[0].threshold = 0.25;
  const payload = makePayload(DEFAULT_CONNECTION, workflow, workflow.examples[3].state);
  const probabilities = { 'Action needed': 0.5, 'Return or order issue': 0.1, 'Just an update': 0.25, 'Needs review': 0.15 };
  const answer = { choice: 'Action needed', probabilities };
  const result = () => analyzeResponse(payload, workflow, { answers: { route: answer } })[0];
  assert.equal(result().workflowResult, 'Action needed'); // Equality must not trigger.
  probabilities['Just an update'] = 0.4;
  assert.equal(result().workflowResult, 'Needs review');
  assert.equal(result().probabilities, probabilities); // Report what the server returned, not a generated distribution.
  workflow.rules[0].enabled = false;
  assert.equal(result().workflowResult, 'Action needed');
  workflow.rules[0].enabled = true;
  probabilities['Needs review'] = '0.15';
  assert.equal(result().workflowResult, 'Action needed');
  delete probabilities['Needs review'];
  assert.equal(result().workflowResult, 'Action needed');
});

test('portability envelope validates versions, fields, and references independently of connection', () => {
  const document = workflowEnvelope({ ...orderInbox, id: 'local-id', connectionId: 'local-link', sessionKey: 'test-token' });
  assert.deepEqual(importWorkflow(structuredClone(document)), orderInbox);
  assert.equal(document.version, 1);
  assert.doesNotMatch(JSON.stringify(document), /local-id|local-link|test-token/);
  assert.throws(() => importWorkflow({ ...document, version: 2 }), /version 1/);
  assert.throws(() => normalizeWorkflow({ ...orderInbox, questions: [orderInbox.questions[0], orderInbox.questions[0]] }), /unique/);
  assert.throws(() => normalizeWorkflow({ ...orderInbox, rules: [{ ...orderInbox.rules[0], questionId: 'unknown' }] }), /Choose a Choice question/);
});

test('connections require explicit models, safe HTTP(S) URLs, and the Tiiny timeout floor', () => {
  assert.deepEqual(normalizeConnection(DEFAULT_CONNECTION), Object.fromEntries(Object.entries(DEFAULT_CONNECTION).filter(([key]) => key !== 'id')));
  assert.throws(() => normalizeConnection({ ...DEFAULT_CONNECTION, timeoutSeconds: 59 }), /60 to 600/);
  assert.throws(() => normalizeConnection({ ...DEFAULT_CONNECTION, model: 'default' }), /explicit/);
  for (const url of ['file:///data', 'http://user:secret@api.tiiny/v1/systemone', 'http://api.tiiny/v1/systemone?api_key=secret']) {
    assert.throws(() => normalizeConnection({ ...DEFAULT_CONNECTION, url }), /endpoint URL|credentials/);
  }
});
