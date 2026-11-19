export const DEFAULT_CONNECTION = {
  id: 'tiiny-pocket',
  name: 'Tiiny Pocket',
  preset: 'tiiny',
  url: 'http://api.tiiny/v1/systemone',
  model: 'vllm-sr/d3-edge',
  timeoutSeconds: 120,
  auth: { mode: 'env', envVar: 'TIINY_API_KEY' }
};

export const BUILTIN_WORKFLOWS = [
  {
    id: 'order-inbox',
    name: 'Order Inbox',
    description: 'Route order and parcel notifications by the next step the recipient can take.',
    questions: [
      {
        id: 'route',
        type: 'choice',
        instructions: 'What should the recipient do about the order now? If notices about the same order conflict and there is no reliable way to tell which is current, choose Needs review.',
        criteria: {
          'Action needed': 'The recipient has a clear next step, such as picking up a parcel.',
          'Return or order issue': 'A return, refund, or other order problem is still pending.',
          'Just an update': 'Informational only; no next step is needed, such as a completed pickup.',
          'Needs review': 'The notices conflict or do not provide enough information for a clear next step.'
        }
      }
    ],
    rules: [{ type: 'low-margin-review', enabled: true, questionId: 'route', threshold: 0.12, result: 'Needs review' }],
    examples: [
      { name: 'Ready for pickup', state: 'Order TD-104: Your parcel is at North Station Locker. Pick it up by Friday at 6 p.m. Bring the pickup code from your order receipt.' },
      { name: 'Already collected', state: 'Order TD-105: Your parcel was picked up from North Station Locker at 2:18 p.m. No further action is required.' },
      { name: 'Return pending', state: 'Order TD-106: The store received your return. An inspection is pending and your refund has not been issued.' },
      { name: 'Conflicting notices', state: { orderId: 'TD-107', notices: ['Your parcel is ready for pickup at North Station Locker.', 'Your parcel has already been collected from North Station Locker.'], timestamps: 'Both notices arrived at the same time.' } }
    ]
  },
  {
    id: 'message-review',
    name: 'Message Review',
    description: 'Ask a reusable yes/no question about a message, regardless of where it came from.',
    questions: [
      { id: 'reply_requested', type: 'noul', instructions: 'Does the sender explicitly ask the recipient to reply or confirm something?', criteria: { true: 'The sender asks for a reply or confirmation.', false: 'The message is informational or explicitly says no reply is needed.' } }
    ],
    rules: [],
    examples: [
      { name: 'Confirmation requested', state: 'Could you reply by Thursday to confirm how many guests you are bringing?' },
      { name: 'Informational only', state: 'The project calendar has moved to the team drive. No reply is needed.' }
    ]
  }
];
