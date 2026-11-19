// Synthetic System One responses for automated tests.
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
