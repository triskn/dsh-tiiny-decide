import { once } from 'node:events';
import { createServer } from 'node:http';
import { apply } from '../../dsh-host.js';

export async function listen(handler) {
  const server = createServer(handler).listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
}

export const origin = server => `http://127.0.0.1:${server.address().port}`;
export const close = server => new Promise(resolve => {
  server.close(resolve);
  server.closeAllConnections();
});

export async function startDshHost() {
  let route;
  let agent;
  await apply({
    webServer: { getOrigin: () => 'http://127.0.0.1:9000', register: value => { route = value; } },
    connection: { requestRejection: request => request.headers['x-test-peer'] === 'owner' ? undefined : 401 },
    tools: { register: value => { agent = value; } },
    effect: callback => callback(),
  });
  const server = await listen((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === route.path || path.startsWith(`${route.path}/`)) return route.handler(request, response);
    response.writeHead(404).end();
  });
  return { server, route, agent };
}
