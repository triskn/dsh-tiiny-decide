// Shared by the browser preview and the local API.
export class AppError extends Error {
  constructor(status, message, code = 'invalid_request') {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new AppError(400, message); };
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ENV = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const probability = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

function text(value, label, max, optional = false) {
  if (optional && (value === undefined || value === null)) return '';
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) {
    fail(`${label} must be ${optional ? 'text' : 'non-empty text'} (up to ${max} characters).`);
  }
  return value.trim();
}

export function normalizeConnection(connection) {
  if (!object(connection)) fail('Provide a connection object.');
  const { preset, timeoutSeconds } = connection;
  if (preset !== 'tiiny' && preset !== 'custom') fail('Choose a connection preset.');
  const name = text(connection.name, 'Connection name', 100);
  const url = text(connection.url, 'Endpoint URL', 2048);
  let parsed;
  try { parsed = new URL(url); } catch { fail('Enter a complete HTTP or HTTPS endpoint URL.'); }
  if (!/^https?:\/\//i.test(url) || !['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash || url.includes('#')) {
    fail('Use a complete HTTP(S) endpoint URL with no credentials or fragment.');
  }
  for (const key of parsed.searchParams.keys()) {
    if (/(?:^|[-_])(?:key|token|secret|password|authorization)(?:$|[-_])/i.test(key) || /^(?:apiKey|accessToken|authToken)$/i.test(key)) {
      fail('Put credentials in Bearer authentication, not the URL.');
    }
    if (key.toLowerCase() === 'model') fail('Set the model in Model ID, not the URL.');
  }
  const model = text(connection.model, 'Model ID', 256);
  if (model.toLowerCase() === 'default') fail('Enter an explicit Model ID instead of “default”.');
  const minimum = preset === 'tiiny' ? 60 : 1;
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < minimum || timeoutSeconds > 600) {
    fail(`Timeout must be a whole number of seconds from ${minimum} to 600.`);
  }
  const mode = connection.auth?.mode ?? 'none';
  if (!['none', 'env', 'session'].includes(mode)) fail('Choose an authentication mode.');
  const auth = { mode };
  if (mode === 'env') {
    auth.envVar = text(connection.auth?.envVar, 'Environment variable name', 64);
    if (!ENV.test(auth.envVar)) fail('Use a valid environment variable name (letters, digits, and underscores).');
  }
  return { name, preset, url: parsed.href, model, timeoutSeconds, auth };
}

function normalizeQuestion(question, index) {
  if (!object(question)) fail(`Question ${index + 1} must be an object.`);
  const id = text(question.id, `ID for question ${index + 1}`, 64);
  if (!ID.test(id) || forbidden.has(id)) fail(`Question ID “${id}” must start with a letter or digit and may contain letters, digits, dots, underscores, or hyphens.`);
  const { type } = question;
  if (!['choice', 'noul', 'score'].includes(type)) fail(`Choose a valid type for “${id}”.`);
  const instructions = text(question.instructions, `Instructions for “${id}”`, 4000);
  const result = { id, type, instructions };
  const { criteria } = question;
  if (type === 'choice') {
    if (!object(criteria) || Object.keys(criteria).length < 2 || Object.keys(criteria).length > 20) {
      fail(`Choice question “${id}” needs 2–20 unique options.`);
    }
    const entries = Object.entries(criteria).map(([label, description]) => {
      const option = text(label, `Option in “${id}”`, 100);
      if (forbidden.has(option)) fail(`Use a different option label in “${id}”.`);
      return [option, text(description, `Description for “${option}”`, 1000, true) || null];
    });
    if (new Set(entries.map(([option]) => option)).size !== entries.length) fail(`Option labels in “${id}” must be unique.`);
    result.criteria = Object.fromEntries(entries);
  } else if (type === 'score') {
    if (!Array.isArray(criteria) || criteria.length < 2 || criteria.length > 10) fail(`Score question “${id}” needs 2–10 levels.`);
    result.criteria = criteria.map((label, i) => text(label, `Score level ${i + 1} in “${id}”`, 300));
  } else if (criteria !== undefined && criteria !== null) {
    if (!object(criteria) || Object.keys(criteria).some(key => !['true', 'false'].includes(key))) fail(`Noul descriptions in “${id}” must use “true” and “false”.`);
    const labels = Object.fromEntries(['true', 'false'].flatMap(key => {
      const description = text(criteria[key], `Noul ${key} description in “${id}”`, 1000, true);
      return description ? [[key, description]] : [];
    }));
    if (Object.keys(labels).length) result.criteria = labels;
  }
  return result;
}

export function validateState(state) {
  if (typeof state !== 'string' && !object(state) && !Array.isArray(state)) {
    fail('State must be text or a JSON string, object, or array.');
  }
  if (typeof state === 'string' && !state.trim()) fail('Enter some input state.');
  return state;
}

export function readState(mode, value) {
  if (mode === 'text') return validateState(value);
  if (mode !== 'json') fail('Choose Text or JSON for the state.');
  let parsed;
  try { parsed = JSON.parse(value); } catch { fail('Input state is not valid JSON.'); }
  return validateState(parsed);
}

export function normalizeWorkflow(workflow) {
  if (!object(workflow)) fail('Provide a workflow object.');
  const name = text(workflow.name, 'Workflow name', 100);
  const description = text(workflow.description, 'Workflow description', 1000, true);
  if (!Array.isArray(workflow.questions) || workflow.questions.length < 1 || workflow.questions.length > 25) {
    fail('Add 1–25 questions.');
  }
  const questions = workflow.questions.map(normalizeQuestion);
  const questionMap = new Map(questions.map(question => [question.id, question]));
  if (questionMap.size !== questions.length) fail('Question IDs must be unique.');
  const sourceRules = workflow.rules ?? [];
  if (!Array.isArray(sourceRules) || sourceRules.length > 25) fail('Rules must be an array of at most 25 entries.');
  const enabledRules = new Set();
  const rules = sourceRules.map(rule => {
    if (!object(rule) || rule.type !== 'low-margin-review' || typeof rule.enabled !== 'boolean') fail('Invalid review rule.');
    const questionId = text(rule.questionId, 'Review rule question ID', 64, !rule.enabled);
    const result = text(rule.result, 'Review outcome', 100, !rule.enabled);
    if (!probability(rule.threshold)) fail('The review threshold must be a number between 0 and 1.');
    if (rule.enabled) {
      const target = questionMap.get(questionId);
      if (target?.type !== 'choice' || !Object.hasOwn(target.criteria, result)) {
        fail('Choose a Choice question and one of its options for the review rule.');
      }
      if (enabledRules.has(questionId)) fail('Only one enabled review rule is allowed per question.');
      enabledRules.add(questionId);
    }
    return { type: rule.type, enabled: rule.enabled, questionId, threshold: rule.threshold, result };
  });
  const sourceExamples = workflow.examples ?? [];
  if (!Array.isArray(sourceExamples) || sourceExamples.length > 30) fail('Examples must be an array of at most 30 entries.');
  const examples = sourceExamples.map((example, i) => {
    if (!object(example)) fail(`Example ${i + 1} must be an object.`);
    return { name: text(example.name, `Name of example ${i + 1}`, 100), state: validateState(example.state) };
  });
  return { name, description, questions, rules, examples };
}

export function workflowEnvelope(workflow) {
  return { format: 'tiiny-decide.workflow', version: 1, workflow: normalizeWorkflow(workflow) };
}

export function importWorkflow(envelope) {
  if (!object(envelope) || envelope.format !== 'tiiny-decide.workflow' || envelope.version !== 1) {
    fail('Select a TiinyDecide workflow export with format tiiny-decide.workflow and version 1.');
  }
  return normalizeWorkflow(envelope.workflow);
}

export function makePayload(connection, workflow, state) {
  return {
    model: connection.model,
    state: validateState(state),
    questions: Object.fromEntries(workflow.questions.map(({ id, ...question }) => [id, question]))
  };
}

export function analyzeResponse(payload, workflow, response) {
  const invalid = message => new AppError(502, message, 'invalid_response');
  if (!object(response) || !object(response.answers)) throw invalid('The endpoint did not return an answers object. Check that this is a System One endpoint.');
  const results = workflow.questions.map(({ id }) => {
    const question = payload.questions[id];
    const answer = Object.hasOwn(response.answers, id) ? response.answers[id] : null;
    const reported = object(answer) && Object.hasOwn(answer, question.type) ? answer[question.type] : null;
    const available = question.type === 'choice' ? typeof reported === 'string' && Object.hasOwn(question.criteria, reported)
      : question.type === 'noul' ? probability(reported)
        : typeof reported === 'number' && Number.isFinite(reported);
    const modelAnswer = available ? reported : null;
    const probabilities = object(answer) && (object(answer.probabilities) || Array.isArray(answer.probabilities)) ? answer.probabilities : null;
    const confidence = object(answer) && typeof answer.confidence === 'number' && Number.isFinite(answer.confidence) ? answer.confidence : null;
    let workflowResult = modelAnswer;
    let ruleApplied = null;
    const rule = workflow.rules?.find(rule => rule.enabled && rule.type === 'low-margin-review' && rule.questionId === id);
    if (available && rule && question.type === 'choice' && object(probabilities)) {
      const options = Object.keys(question.criteria);
      if (options.length >= 2 && options.every(option => Object.hasOwn(probabilities, option) && probability(probabilities[option]))) {
        const [first, second] = options.map(option => probabilities[option]).sort((a, b) => b - a);
        const gap = first - second;
        // Treat a decimal subtraction at the threshold as equal, not below; exact ties still count for any positive threshold.
        if ((gap === 0 && rule.threshold > 0) || rule.threshold - gap > Number.EPSILON) {
          workflowResult = rule.result;
          ruleApplied = { gap, threshold: rule.threshold };
        }
      }
    }
    return { id, type: question.type, question: question.instructions, modelAnswer, workflowResult, probabilities, confidence, ruleApplied, available };
  });
  if (!results.some(result => result.available)) {
    throw invalid('None of the requested question IDs had a valid answer. Check the response JSON and the System One schema.');
  }
  return results;
}
