import { randomBytes } from 'node:crypto';
import { AppError } from './model.mjs';

const SESSION_TTL = 12 * 60 * 60 * 1000;
const MAX_SESSIONS = 256;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const KEY_PATTERN = /^[\x21-\x7e]{1,8192}$/;

function sessionId(request, cookieName, sessionHeader) {
  const forwardedId = sessionHeader && request.headers[sessionHeader];
  if (forwardedId !== undefined) {
    return typeof forwardedId === 'string' && SESSION_ID_PATTERN.test(forwardedId) ? forwardedId : undefined;
  }
  const cookies = (request.headers.cookie ?? '').split(';').map((pair) => pair.trim());
  const candidates = cookies.filter((pair) => pair.startsWith(`${cookieName}=`));
  if (candidates.length !== 1) return undefined;
  const id = candidates[0].slice(cookieName.length + 1);
  return SESSION_ID_PATTERN.test(id) ? id : undefined;
}

export function sessionKeyInput(body, connection) {
  if (!Object.hasOwn(body, 'sessionKey')) return undefined;
  if (typeof body.sessionKey !== 'string') {
    throw new AppError(400, 'Session API key must be text.');
  }
  const key = body.sessionKey.trim();
  if (key && !KEY_PATTERN.test(key)) {
    throw new AppError(400, 'Session API key must contain only printable non-space characters (up to 8192 characters).');
  }
  if (key && connection.auth.mode !== 'session') {
    throw new AppError(400, 'Select session authentication before providing a session API key.');
  }
  return key;
}

export function createAuth({ cookieName, cookiePath, secure = false, sessionHeader, readEnv = name => process.env[name], envHint }) {
  const sessions = new Map();
  function sweep(now) {
    for (const [id, session] of sessions) {
      if (session.expires <= now) sessions.delete(id);
    }
  }
  function getSession(request, now) {
    const id = sessionId(request, cookieName, sessionHeader);
    const session = sessions.get(id);
    if (session) {
      // Refresh expiration and least-recently-used order.
      session.expires = now + SESSION_TTL;
      sessions.delete(id);
      sessions.set(id, session);
    }
    return session;
  }
  return {
    save(request, response, connection, input) {
      const now = Date.now();
      sweep(now);
      let session = getSession(request, now);
      if (connection.auth.mode !== 'session' || input === '') {
        session?.keys.delete(connection.id);
        return;
      }
      // Omission leaves the previous key tied to its original URL. It is never
      // forwarded to a changed destination; saved runs can still use their original URL.
      if (input === undefined) return;
      if (!session) {
        if (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
        const id = randomBytes(32).toString('base64url');
        session = { keys: new Map(), expires: now + SESSION_TTL };
        sessions.set(id, session);
        if (sessionHeader && Object.hasOwn(request.headers, sessionHeader)) {
          response.setHeader(sessionHeader, id);
        } else {
          response.setHeader('Set-Cookie', `${cookieName}=${id}; Path=${cookiePath}; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`);
        }
      }
      session.keys.set(connection.id, { url: connection.url, key: input });
    },
    resolve(request, connection, input) {
      const { mode, envVar } = connection.auth;
      if (mode === 'none') return { token: null };
      if (mode === 'env') {
        const token = readEnv(envVar)?.trim();
        if (!token) return { error: { code: 'missing_auth', message: `Set ${envVar} in ${envHint}.` } };
        if (!KEY_PATTERN.test(token)) {
          return { error: { code: 'invalid_auth', message: `The API key in ${envVar} is not a valid bearer credential.` } };
        }
        return { token };
      }
      if (input !== undefined && input !== '') return { token: input };
      const now = Date.now();
      sweep(now);
      const session = getSession(request, now);
      const saved = input === undefined ? session?.keys.get(connection.id) : undefined;
      if (saved?.url === connection.url) return { token: saved.key };
      return { error: { code: 'missing_auth', message: 'No session API key for this connection in the current DSH session. Enter a session API key and save the connection.' } };
    },
  };
}
