// Deliberately synthetic System One endpoint. This is not a model.
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const orderOptions = ['Action needed', 'Return or order issue', 'Just an update', 'Needs review'];

export function demoResponse(payload) {
  const state = JSON.stringify(payload.state).toLowerCase();
  const answers = Object.fromEntries(Object.entries(payload.questions).map(([id, question]) => {
    if (question.type === 'noul') {
      const noul = state.includes('no reply') ? 0.06 : 0.96;
      return [id, { noul, probabilities: { true: noul, false: 1 - noul } }];
    }
    if (question.type === 'score') {
      const weight = 1 / question.criteria.length;
      return [id, {
        score: (question.criteria.length - 1) / 2,
        confidence: 0,
        probabilities: Object.fromEntries(question.criteria.map((_, i) => [i, weight]))
      }];
    }
    const labels = Object.keys(question.criteria);
    let choice = labels[0];
    let probabilities = Object.fromEntries(labels.map(label => [label, label === choice ? 0.94 : 0.06 / (labels.length - 1)]));
    if (labels.length === 4 && orderOptions.every(label => labels.includes(label))) {
      if (state.includes('td-107') || (state.includes('ready for pickup') && state.includes('already been collected'))) {
        choice = 'Action needed';
        probabilities = Object.fromEntries(orderOptions.map((label, i) => [label, [0.45, 0.04, 0.44, 0.07][i]]));
      } else {
        choice = state.includes('return') || state.includes('refund') ? 'Return or order issue'
          : /picked up|already been collected/.test(state) ? 'Just an update' : 'Action needed';
        probabilities = Object.fromEntries(labels.map(label => [label, label === choice ? 0.94 : 0.02]));
      }
    }
    if (id === 'probe' && labels.includes('fruit')) {
      choice = 'fruit';
      probabilities = Object.fromEntries(labels.map(label => [label, label === choice ? 0.99 : 0.01 / (labels.length - 1)]));
    }
    return [id, { choice, probabilities }];
  }));
  return { fixture: 'Synthetic demo — not live model inference', answers };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.TIINY_DECIDE_DEMO_PORT ?? 4181);
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.method !== 'POST' || request.url !== '/v1/systemone') {
      response.writeHead(404).end(JSON.stringify({ message: 'POST /v1/systemone only.' }));
      return;
    }
    try {
      let data = '';
      for await (const chunk of request) {
        data += chunk;
        if (data.length > 1024 * 1024) throw new Error();
      }
      const payload = JSON.parse(data);
      if (payload.model !== 'demo-system-one') {
        response.writeHead(404).end(JSON.stringify({ message: 'Use the synthetic model ID demo-system-one.' }));
        return;
      }
      response.end(JSON.stringify(demoResponse(payload)));
    } catch {
      response.writeHead(400).end(JSON.stringify({ message: 'Malformed demo request.' }));
    }
  });
  server.listen(port, '127.0.0.1', () => console.log(`Synthetic fixture: http://127.0.0.1:${server.address().port}/v1/systemone (no model is running)`));
}
