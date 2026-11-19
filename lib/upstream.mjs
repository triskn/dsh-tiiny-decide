import { AppError, analyzeResponse } from './model.mjs';

const MAX_UPSTREAM_BYTES = 2 * 1024 * 1024;
const MAX_RAW_TEXT = 4000;
const PROBE_CHOICE = 'fruit';
export const PROBE_STATE = 'The item is an apple.';
export const PROBE_WORKFLOW = {
  questions: [{ id: 'probe', type: 'choice', instructions: 'Is the apple a fruit or a vehicle?', criteria: { fruit: null, vehicle: null } }],
  rules: [],
};

const statusMessages = new Map([
  [400, 'The endpoint rejected the request or question definitions.'],
  [401, 'The endpoint did not accept the API key. Check the connection authentication.'],
  [403, 'The endpoint refused access. Check the API key and its permissions.'],
  [404, 'The endpoint or model was not found. Check the complete endpoint URL and use the exact running model ID, not a cloud alias.'],
  [413, 'The endpoint rejected the request because it is too large. Shorten the state.'],
  [415, 'The endpoint rejected the request content type or encoding.'],
  [422, 'Check that the model ID is unambiguous and is a Text Classification (decision) model.'],
  [429, 'The endpoint is temporarily rate-limited. Try again after the retry interval.'],
  [500, 'The device could not process the request. Try a shorter state or fewer options to fit the model context window.'],
  [501, 'The model does not support a feature required to process this request.'],
  [502, 'The endpoint could not reach the model or NPU. Check the device and model.'],
  [503, 'The endpoint is temporarily unavailable. Check the device and running model.'],
  [504, 'The endpoint timed out waiting for the decision model.'],
  [529, 'No decision model is available, or it is still loading. Check the device and try again.'],
]);

const sensitiveField = /^(?:authorization|proxyauthorization|cookie|setcookie|apikey|token|accesstoken|refreshtoken|bearer|bearertoken|password|sessionkey|credential|credentials|xapikey)$/;

function responseSanitizer(token) {
  // JSON parsing happens first so even escaped strings and property names are scrubbed.
  const variants = new Set();
  if (token) {
    variants.add(token);
    if (token.length >= 6) {
      const escaped = encodeURIComponent(token);
      variants.add(escaped);
      variants.add(escaped.replace(/%[A-F0-9]{2}/g, (match) => match.toLowerCase()));
      variants.add(Buffer.from(token).toString('base64'));
      variants.add(Buffer.from(`Bearer ${token}`).toString('base64'));
      variants.add(Buffer.from(token).toString('base64url'));
      variants.add(Buffer.from(`Bearer ${token}`).toString('base64url'));
      variants.add(JSON.stringify(token).slice(1, -1));
    }
  }
  const secrets = [...variants].sort((a, b) => b.length - a.length);
  function text(value) {
    return secrets.reduce((result, secret) => result.replaceAll(secret, '[redacted]'), value)
      .replace(/\bBearer[ \t]+[\w.~+/=-]+/gi, 'Bearer [redacted]');
  }
  function value(node, depth = 0, isOptionMap = false) {
    if (typeof node === 'string') return text(node);
    if (node === null || typeof node !== 'object') return node;
    if (depth >= 48) return '[omitted: response too deeply nested]';
    if (Array.isArray(node)) return node.map((item) => value(item, depth + 1));
    const entries = Object.entries(node);
    return Object.fromEntries(entries.map(([key, item]) => [
      text(key),
      !isOptionMap && sensitiveField.test(key.toLowerCase().replace(/[^a-z]/g, ''))
        ? '[redacted]'
        : value(item, depth + 1, key === 'probabilities' || key === 'answers'),
    ]));
  }
  return { text, value };
}

function cleanMessage(value) {
  return value.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 320);
}

function retryAfter(headers) {
  const value = headers.get('retry-after')?.trim();
  if (!value) return undefined;
  if (/^\d{1,9}$/.test(value)) return value;
  if (/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value) && Number.isFinite(Date.parse(value))) return value;
  return undefined;
}

async function readUpstreamBody(response, sanitizer) {
  if (!response.body) return { json: false };
  const reader = response.body.getReader();
  let bytes = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_UPSTREAM_BYTES) {
        await reader.cancel().catch(() => {});
        return { tooLarge: true };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const text = Buffer.concat(chunks, bytes).toString('utf8').replace(/^\uFEFF/, '');
  if (!text.trim()) return { json: false };
  let parsed;
  try { parsed = JSON.parse(text); } catch { return { json: false, value: sanitizer.text(text).slice(0, MAX_RAW_TEXT) }; }
  return { json: true, value: sanitizer.value(parsed) };
}

function networkMessage(error) {
  const code = error?.cause?.code;
  if (code === 'ECONNREFUSED') return 'The host refused the connection. Check the endpoint URL and that the device is running.';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'The endpoint hostname could not be resolved. Check the endpoint URL and network.';
  if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT') return 'The connection timed out. Check that the device is reachable.';
  if (['DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(code)) {
    return 'The endpoint TLS certificate could not be verified. Check the endpoint URL and trusted certificates.';
  }
  return 'Could not complete the request to the endpoint. Check the endpoint URL and network.';
}

async function requestJson(connection, auth, { url = connection.url, payload, signal: callerSignal } = {}) {
  const began = performance.now();
  let upstreamStatus = null;
  const report = (fields) => ({ upstreamStatus, elapsedMs: Math.round(performance.now() - began), ...fields });
  const failure = (code, message, fields = {}, retry) => report({
    ok: false, error: { code, message, ...(retry === undefined ? {} : { retryAfter: retry }) }, ...fields,
  });
  if (auth.error) return report({ ok: false, error: auth.error });

  const { token } = auth;
  const sanitizer = responseSanitizer(token);
  const timeout = AbortSignal.timeout(Math.round(connection.timeoutSeconds * 1000));
  const signal = callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout;
  let upstream;
  let body;
  try {
    upstream = await fetch(url, {
      method: payload === undefined ? 'GET' : 'POST',
      redirect: 'manual',
      signal,
      headers: {
        ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    upstreamStatus = upstream.status;
    if (upstreamStatus >= 300 && upstreamStatus < 400) {
      await upstream.body?.cancel().catch(() => {});
      return failure('upstream_redirect', `The endpoint returned a redirect (HTTP ${upstreamStatus}). Use the final endpoint URL directly.`);
    }
    body = await readUpstreamBody(upstream, sanitizer);
  } catch (error) {
    if (signal.aborted) return failure('upstream_timeout', `The endpoint exceeded the ${connection.timeoutSeconds}-second timeout.`);
    return failure('upstream_unreachable', networkMessage(error));
  }

  const responseFields = body.value === undefined ? {} : { response: body.value };
  if (!upstream.ok) {
    const retry = retryAfter(upstream.headers);
    const detail = body.json
      ? [body.value?.error?.message, body.value?.message, body.value?.error].find((candidate) => typeof candidate === 'string' && candidate.trim())
      : undefined;
    const needsLoad = connection.preset === 'tiiny' && payload !== undefined &&
      (upstreamStatus === 529 || (upstreamStatus === 404 && /not (?:yet )?loaded/i.test(detail ?? '')));
    const message = needsLoad
      ? 'Open Model Management in TiinyOS and load the selected Text Classification model, then test this connection again.'
      : statusMessages.get(upstreamStatus) ?? `The endpoint returned HTTP ${upstreamStatus}.`;
    const suffix = detail === undefined ? '' : cleanMessage(detail);
    return failure(`upstream_http_${upstreamStatus}`, `${message}${suffix ? ` ${suffix}` : ''}`, responseFields,
      retry && sanitizer.text(retry) === retry ? retry : undefined);
  }
  if (body.tooLarge) return failure('upstream_response_too_large', 'The endpoint response exceeded 2 MiB.');
  if (!body.json) {
    const message = payload === undefined
      ? 'Pocket did not return a JSON model list. Check the device address.'
      : 'The endpoint did not return a JSON decision response. Check that the URL points to the System One endpoint.';
    return failure('invalid_upstream_response', message, responseFields);
  }
  return report({ ok: true, ...responseFields });
}

// Probes and runs share the same decision request path.
export async function evaluate(connection, workflow, payload, auth, { probe = false, signal } = {}) {
  const outcome = await requestJson(connection, auth, { payload, signal });
  if (!outcome.ok) return outcome;
  let results;
  try {
    results = analyzeResponse(payload, workflow, outcome.response);
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    const message = cleanMessage(responseSanitizer(auth.token).text(error.message));
    return { ...outcome, ok: false, error: { code: 'invalid_upstream_response', message } };
  }
  if (probe && results.find((result) => result.id === 'probe')?.modelAnswer !== PROBE_CHOICE) {
    const message = 'The endpoint returned decisions, but the probe did not classify an apple as fruit. Check the model.';
    return { ...outcome, ok: false, error: { code: 'unexpected_probe_answer', message }, results };
  }
  return { ...outcome, results };
}

export async function discoverTiinyModels(connection, auth) {
  const url = new URL(connection.url);
  if (connection.preset !== 'tiiny' || !/\/v1\/systemone\/?$/.test(url.pathname)) {
    throw new AppError(400, 'Select Tiiny Pocket and enter its full /v1/systemone URL.');
  }
  url.pathname = url.pathname.replace(/\/systemone\/?$/, '/models');
  url.search = '';
  const { response, ...outcome } = await requestJson(connection, auth, { url });
  if (!outcome.ok) return { ...outcome, models: [] };
  if (!Array.isArray(response?.data)) {
    return {
      ...outcome, ok: false, models: [],
      error: { code: 'invalid_upstream_response', message: 'Pocket did not return a valid /v1/models list.' },
    };
  }
  const ids = new Set();
  for (const model of response.data) {
    if (typeof model?.type !== 'string' || model.type.trim().toLowerCase().replace(/[_-]/g, ' ') !== 'text classification') continue;
    if (typeof model.id === 'string' && /^[^\s\x00-\x1f\x7f]{1,256}$/.test(model.id) && model.id !== '[redacted]') ids.add(model.id);
  }
  return { ...outcome, models: [...ids].sort().map(id => ({ id })) };
}
