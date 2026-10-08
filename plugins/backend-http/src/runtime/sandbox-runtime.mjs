/**
 * Runtime HTTP em memória compatível com um subconjunto de Express e Fastify.
 *
 * O código do aluno é executado de verdade (handlers, middlewares, lógica), mas as requisições
 * não passam por sockets: são despachadas diretamente para as rotas registradas.
 * Este arquivo é JavaScript puro, sem dependências, para rodar em:
 *  - Web Worker no navegador (feedback imediato e cliente HTTP do aluno);
 *  - processo Node filho com permissões restritas (validação oficial no servidor).
 */

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

const STATUS_TEXT = {
  200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found',
  304: 'Not Modified', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
  405: 'Method Not Allowed', 409: 'Conflict', 422: 'Unprocessable Entity', 429: 'Too Many Requests',
  500: 'Internal Server Error', 501: 'Not Implemented', 503: 'Service Unavailable',
};

/** @param {string} pattern */
export function compilePath(pattern) {
  const parts = String(pattern).split('/').filter(Boolean);
  /** @param {string} pathname @param {boolean} [prefix] */
  return (pathname, prefix = false) => {
    const segs = pathname.split('/').filter(Boolean);
    /** @type {Record<string, string>} */
    const params = {};
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part === '*') return { params, rest: '/' + segs.slice(i).join('/') };
      const seg = segs[i];
      if (part.startsWith(':')) {
        const optional = part.endsWith('?');
        const name = part.slice(1, optional ? -1 : undefined);
        if (seg === undefined) {
          if (optional) continue;
          return null;
        }
        params[name] = decodeURIComponent(seg);
        continue;
      }
      if (seg !== part) return null;
    }
    if (!prefix && segs.length !== parts.length) return null;
    return { params, rest: '/' + segs.slice(parts.length).join('/') };
  };
}

/** @param {unknown} err */
export function formatError(err) {
  if (err && typeof err === 'object') {
    const e = /** @type {{name?: string, message?: string}} */ (err);
    return `${e.name ?? 'Error'}: ${e.message ?? String(err)}`;
  }
  return String(err);
}

/** @param {unknown[]} args */
function formatArgs(args) {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

/** @param {Array<{level: string, message: string}>} logs */
function createConsole(logs) {
  /** @param {string} level */
  const make = (level) => (/** @type {unknown[]} */ ...args) => {
    if (logs.length < 200) logs.push({ level, message: formatArgs(args).slice(0, 2000) });
  };
  return { log: make('log'), info: make('info'), warn: make('warn'), error: make('error'), debug: make('debug') };
}

/* ------------------------------------------------------------------ */
/* Express                                                              */
/* ------------------------------------------------------------------ */

const JSON_MW = Symbol('json');

function jsonMiddleware(/** @type {any} */ req, /** @type {any} */ _res, /** @type {Function} */ next) {
  const type = String(req.headers['content-type'] ?? '');
  if (req._rawBody && type.includes('json')) {
    try {
      req.body = JSON.parse(req._rawBody);
    } catch {
      const err = Object.assign(new SyntaxError('Unexpected token in JSON'), { status: 400 });
      return next(err);
    }
  } else if (req.body === undefined) {
    req.body = {};
  }
  next();
}
// @ts-ignore marcador usado para detectar express.json()
jsonMiddleware[JSON_MW] = true;

function urlencodedMiddleware(/** @type {any} */ req, /** @type {any} */ _res, /** @type {Function} */ next) {
  const type = String(req.headers['content-type'] ?? '');
  if (req._rawBody && type.includes('application/x-www-form-urlencoded')) {
    req.body = Object.fromEntries(new URLSearchParams(req._rawBody));
  } else if (req.body === undefined) {
    req.body = {};
  }
  next();
}

/** @param {any} ctx */
function createExpress(ctx) {
  function express() {
    const app = createRouter(ctx, true);
    ctx.apps.push(app);
    return app;
  }
  express.json = () => jsonMiddleware;
  express.urlencoded = () => urlencodedMiddleware;
  express.text = () => (/** @type {any} */ req, /** @type {any} */ _res, /** @type {Function} */ next) => {
    if (req.body === undefined) req.body = req._rawBody ?? '';
    next();
  };
  express.static = () => (/** @type {any} */ _req, /** @type {any} */ _res, /** @type {Function} */ next) => next();
  express.Router = () => createRouter(ctx, false);
  express.default = express;
  return express;
}

/** @param {any} ctx @param {boolean} isApp */
function createRouter(ctx, isApp) {
  /** @type {any[]} */
  const stack = [];
  /** @type {any} */
  const router = function (/** @type {any} */ req, /** @type {any} */ res, /** @type {Function} */ next) {
    runStack(stack, req, res, next);
  };
  router.__kind = 'express';
  router.__stack = stack;
  router.locals = {};
  /** @type {Record<string, unknown>} */
  const settings = {};

  /** @param {string} method @param {string} path @param {any[]} handlers */
  const addRoute = (method, path, handlers) => {
    const fns = handlers.flat(Infinity).filter((h) => typeof h === 'function');
    stack.push({ kind: 'route', method, path: String(path), match: compilePath(String(path)), handlers: fns });
  };

  for (const method of METHODS) {
    router[method] = (/** @type {any} */ path, /** @type {any[]} */ ...handlers) => {
      if (method === 'get' && isApp && handlers.length === 0 && typeof path === 'string' && !path.startsWith('/')) {
        return settings[path];
      }
      addRoute(method.toUpperCase(), path, handlers);
      return router;
    };
  }
  router.all = (/** @type {any} */ path, /** @type {any[]} */ ...handlers) => {
    addRoute('ALL', path, handlers);
    return router;
  };
  router.route = (/** @type {string} */ path) => {
    /** @type {any} */
    const chain = {};
    for (const method of [...METHODS, 'all']) {
      chain[method] = (/** @type {any[]} */ ...handlers) => {
        addRoute(method === 'all' ? 'ALL' : method.toUpperCase(), path, handlers);
        return chain;
      };
    }
    return chain;
  };
  router.use = (/** @type {any[]} */ ...args) => {
    let path = '/';
    if (typeof args[0] === 'string' || Array.isArray(args[0])) path = String(args.shift());
    for (const fn of args.flat(Infinity)) {
      if (typeof fn !== 'function') continue;
      if (fn[JSON_MW]) ctx.usesJson = true;
      stack.push({ kind: 'mw', path, match: compilePath(path), fn });
    }
    return router;
  };
  router.param = () => router;
  if (isApp) {
    router.set = (/** @type {string} */ key, /** @type {unknown} */ value) => {
      settings[key] = value;
      return router;
    };
    router.enable = (/** @type {string} */ key) => router.set(key, true);
    router.disable = (/** @type {string} */ key) => router.set(key, false);
    router.listen = (/** @type {any[]} */ ...args) => {
      const port = typeof args[0] === 'number' || typeof args[0] === 'string' ? Number(args[0]) : 3000;
      const cb = args.find((a) => typeof a === 'function');
      ctx.listening = { port, app: router };
      if (cb) ctx.timers.setTimeout(() => cb(), 0);
      return { close: (/** @type {Function} */ fn) => fn && fn(), address: () => ({ port }), on: () => undefined };
    };
  }
  return router;
}

/** @param {any[]} stack @param {any} req @param {any} res @param {Function} done */
function runStack(stack, req, res, done) {
  let i = 0;
  const basePath = req.path;
  const baseUrl = req.baseUrl ?? '';
  /** @param {unknown} [err] */
  const next = (err) => {
    if (res.headersSent) return;
    req.path = basePath;
    req.baseUrl = baseUrl;
    if (err === 'route' || err === 'router') err = undefined;
    const layer = stack[i++];
    if (!layer) return done(err);
    if (layer.kind === 'route') {
      if (err) return next(err);
      const methodOk =
        layer.method === 'ALL' || layer.method === req.method || (layer.method === 'GET' && req.method === 'HEAD');
      if (!methodOk) return next();
      const matched = layer.match(req.path);
      if (!matched) return next();
      req.params = { ...matched.params };
      req.route = { path: layer.path, method: layer.method };
      return runHandlers(layer.handlers, req, res, next);
    }
    const matched = layer.match(req.path, true);
    if (!matched) return next(err);
    const fn = layer.fn;
    const isErrorHandler = fn.length === 4;
    if (err && !isErrorHandler) return next(err);
    if (!err && isErrorHandler) return next();
    if (fn.__kind === 'express') {
      req.baseUrl = baseUrl + (layer.path === '/' ? '' : layer.path.replace(/\/$/, ''));
      req.path = matched.rest;
    }
    invoke(() => (err ? fn(err, req, res, next) : fn(req, res, next)), next);
  };
  next();
}

/** @param {Function[]} handlers @param {any} req @param {any} res @param {Function} done */
function runHandlers(handlers, req, res, done) {
  let i = 0;
  /** @param {unknown} [err] */
  const next = (err) => {
    if (res.headersSent) return;
    if (err === 'route') return done();
    if (err) return done(err);
    const fn = handlers[i++];
    if (!fn) return done();
    invoke(() => fn(req, res, next), next);
  };
  next();
}

/** @param {() => unknown} call @param {Function} next */
function invoke(call, next) {
  try {
    const result = call();
    if (result && typeof (/** @type {any} */ (result).then) === 'function') {
      /** @type {Promise<unknown>} */ (result).then(undefined, (e) => next(e ?? new Error('Promise rejeitada')));
    }
  } catch (e) {
    next(e);
  }
}

/** @param {Function} finish */
function createExpressResponse(finish) {
  /** @type {Record<string, string>} */
  const headers = {};
  /** @type {any} */
  const res = {
    statusCode: 200,
    headersSent: false,
    locals: {},
    status(/** @type {number} */ code) {
      res.statusCode = Number(code);
      return res;
    },
    set(/** @type {any} */ key, /** @type {any} */ value) {
      if (key && typeof key === 'object') {
        for (const [k, v] of Object.entries(key)) headers[k.toLowerCase()] = String(v);
      } else headers[String(key).toLowerCase()] = String(value);
      return res;
    },
    get: (/** @type {string} */ key) => headers[String(key).toLowerCase()],
    getHeader: (/** @type {string} */ key) => headers[String(key).toLowerCase()],
    type(/** @type {string} */ t) {
      const map = { json: 'application/json', text: 'text/plain', html: 'text/html' };
      // @ts-ignore
      headers['content-type'] = map[t] ?? t;
      return res;
    },
    json(/** @type {unknown} */ body) {
      if (!headers['content-type']) headers['content-type'] = 'application/json; charset=utf-8';
      const text = JSON.stringify(body);
      return res.end(text === undefined ? '' : text);
    },
    send(/** @type {unknown} */ body) {
      if (body === undefined || body === null) return res.end('');
      if (typeof body === 'object' || typeof body === 'boolean') return res.json(body);
      if (typeof body === 'number') {
        if (!headers['content-type']) headers['content-type'] = 'text/plain; charset=utf-8';
        return res.end(String(body));
      }
      if (!headers['content-type']) headers['content-type'] = 'text/html; charset=utf-8';
      return res.end(String(body));
    },
    sendStatus(/** @type {number} */ code) {
      res.statusCode = code;
      if (!headers['content-type']) headers['content-type'] = 'text/plain; charset=utf-8';
      // @ts-ignore
      return res.end(STATUS_TEXT[code] ?? String(code));
    },
    redirect(/** @type {any} */ a, /** @type {any} */ b) {
      const [code, url] = typeof a === 'number' ? [a, b] : [302, a];
      res.statusCode = code;
      headers.location = String(url);
      return res.end('');
    },
    cookie: () => res,
    clearCookie: () => res,
    end(/** @type {unknown} */ data) {
      if (res.headersSent) return res;
      res.headersSent = true;
      finish({ status: res.statusCode, headers: { ...headers }, body: data === undefined ? '' : String(data) });
      return res;
    },
  };
  res.header = res.set;
  res.setHeader = res.set;
  res.writeHead = (/** @type {number} */ code, /** @type {any} */ hdrs) => {
    res.statusCode = code;
    if (hdrs) res.set(hdrs);
    return res;
  };
  res.write = () => true;
  return res;
}

/** @param {any} app @param {any} request */
function dispatchExpress(app, request) {
  return new Promise((resolve) => {
    const res = createExpressResponse(resolve);
    const req = {
      method: request.method,
      url: request.url,
      originalUrl: request.url,
      path: request.path,
      baseUrl: '',
      query: request.query,
      params: {},
      headers: request.headers,
      body: undefined,
      _rawBody: request.body,
      ip: '127.0.0.1',
      protocol: 'http',
      hostname: 'localhost',
      get: (/** @type {string} */ name) => request.headers[String(name).toLowerCase()],
      header: (/** @type {string} */ name) => request.headers[String(name).toLowerCase()],
      is: (/** @type {string} */ type) => String(request.headers['content-type'] ?? '').includes(type),
    };
    runStack(app.__stack, req, res, (/** @type {any} */ err) => {
      if (res.headersSent) return;
      if (err) {
        const status = Number(err.status ?? err.statusCode ?? 500);
        res.status(status >= 400 ? status : 500).type('text/html; charset=utf-8').end(
          status === 400 ? 'Bad Request' : `Internal Server Error: ${formatError(err)}`,
        );
        request.onError?.(err);
        return;
      }
      res.status(404).type('text/html; charset=utf-8').end(`Cannot ${req.method} ${request.path}`);
    });
  });
}

/* ------------------------------------------------------------------ */
/* Fastify                                                              */
/* ------------------------------------------------------------------ */

/** @param {any} ctx */
function createFastify(ctx) {
  function fastify() {
    /** @type {any[]} */
    const routes = [];
    /** @type {Record<string, Function[]>} */
    const hooks = { onRequest: [], preHandler: [] };
    /** @type {Promise<unknown>[]} */
    const pending = [];
    /** @type {any} */
    const instance = { __kind: 'fastify', __routes: routes, __hooks: hooks, __pending: pending };
    const addRoute = (/** @type {string} */ method, /** @type {string} */ url, /** @type {Function} */ handler) => {
      routes.push({ method: method.toUpperCase(), path: String(url), match: compilePath(String(url)), handler });
    };
    for (const method of [...METHODS, 'all']) {
      instance[method] = (/** @type {string} */ url, /** @type {any} */ optsOrHandler, /** @type {any} */ maybeHandler) => {
        const handler =
          typeof optsOrHandler === 'function' ? optsOrHandler : (maybeHandler ?? optsOrHandler?.handler);
        addRoute(method === 'all' ? 'ALL' : method, url, handler);
        return instance;
      };
    }
    instance.route = (/** @type {any} */ opts) => {
      const methods = Array.isArray(opts.method) ? opts.method : [opts.method];
      for (const m of methods) addRoute(String(m), opts.url ?? opts.path, opts.handler);
      return instance;
    };
    instance.addHook = (/** @type {string} */ name, /** @type {Function} */ fn) => {
      if (hooks[name]) hooks[name].push(fn);
      return instance;
    };
    instance.register = (/** @type {any} */ plugin, /** @type {any} */ opts) => {
      const fn = typeof plugin === 'function' ? plugin : plugin?.default;
      if (typeof fn === 'function') {
        const result = new Promise((resolve, reject) => {
          try {
            const r = fn(instance, opts ?? {}, (/** @type {unknown} */ err) => (err ? reject(err) : resolve(undefined)));
            if (r && typeof r.then === 'function') r.then(resolve, reject);
            else if (fn.length < 3) resolve(undefined);
          } catch (e) {
            reject(e);
          }
        });
        pending.push(result);
      }
      return instance;
    };
    instance.decorate = (/** @type {string} */ name, /** @type {unknown} */ value) => {
      instance[name] = value;
      return instance;
    };
    instance.decorateRequest = () => instance;
    instance.decorateReply = () => instance;
    instance.log = ctx.console;
    instance.ready = (/** @type {Function} */ cb) => {
      const p = Promise.all(pending).then(() => instance);
      if (cb) p.then(() => cb(), (/** @type {unknown} */ e) => cb(e));
      return p;
    };
    instance.listen = (/** @type {any} */ opts, /** @type {any} */ cb) => {
      const port = typeof opts === 'object' && opts ? Number(opts.port ?? 3000) : Number(opts ?? 3000);
      ctx.listening = { port, app: instance };
      const address = `http://127.0.0.1:${port}`;
      const callback = typeof opts === 'function' ? opts : cb;
      if (callback) ctx.timers.setTimeout(() => callback(null, address), 0);
      return Promise.resolve(address);
    };
    instance.close = () => Promise.resolve();
    instance.inject = (/** @type {any} */ req) => dispatchFastify(instance, normalizeRequest(req));
    ctx.apps.push(instance);
    return instance;
  }
  fastify.default = fastify;
  fastify.fastify = fastify;
  return fastify;
}

/** @param {any} instance @param {any} request */
async function dispatchFastify(instance, request) {
  await Promise.all(instance.__pending);
  /** @type {Record<string, string>} */
  const headers = {};
  let resolveSent = /** @type {(v: any) => void} */ (() => undefined);
  const sentPromise = new Promise((r) => (resolveSent = r));
  /** @type {any} */
  const reply = {
    statusCode: 200,
    sent: false,
    code(/** @type {number} */ c) {
      reply.statusCode = Number(c);
      return reply;
    },
    header(/** @type {string} */ k, /** @type {unknown} */ v) {
      headers[String(k).toLowerCase()] = String(v);
      return reply;
    },
    headers(/** @type {Record<string, unknown>} */ obj) {
      for (const [k, v] of Object.entries(obj)) reply.header(k, v);
      return reply;
    },
    getHeader: (/** @type {string} */ k) => headers[String(k).toLowerCase()],
    type(/** @type {string} */ t) {
      headers['content-type'] = t;
      return reply;
    },
    redirect(/** @type {any} */ a, /** @type {any} */ b) {
      const [url, code] = typeof a === 'number' ? [b, a] : [a, b ?? 302];
      reply.statusCode = code;
      headers.location = String(url);
      return reply.send('');
    },
    send(/** @type {unknown} */ payload) {
      if (reply.sent) return reply;
      reply.sent = true;
      let body = '';
      if (payload === undefined || payload === null) body = '';
      else if (typeof payload === 'object') {
        if (!headers['content-type']) headers['content-type'] = 'application/json; charset=utf-8';
        body = JSON.stringify(payload);
      } else {
        if (!headers['content-type']) headers['content-type'] = 'text/plain; charset=utf-8';
        body = String(payload);
      }
      resolveSent({ status: reply.statusCode, headers: { ...headers }, body });
      return reply;
    },
  };
  reply.status = reply.code;

  /** @param {any} err */
  const sendError = (err) => {
    const status = Number(err?.statusCode ?? err?.status ?? 500);
    request.onError?.(err);
    reply.sent = false;
    reply.code(status >= 400 ? status : 500).send({
      statusCode: status >= 400 ? status : 500,
      error: STATUS_TEXT[/** @type {keyof typeof STATUS_TEXT} */ (status)] ?? 'Internal Server Error',
      message: err?.message ?? String(err),
    });
  };

  const route = instance.__routes.find(
    (/** @type {any} */ r) =>
      (r.method === 'ALL' || r.method === request.method || (r.method === 'GET' && request.method === 'HEAD')) &&
      r.match(request.path),
  );
  if (!route) {
    reply.code(404).send({ message: `Route ${request.method}:${request.path} not found`, error: 'Not Found', statusCode: 404 });
    return sentPromise;
  }

  let body = request.body;
  const type = String(request.headers['content-type'] ?? '');
  if (body && type.includes('json')) {
    try {
      body = JSON.parse(body);
    } catch {
      reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Body is not valid JSON' });
      return sentPromise;
    }
  }
  const req = {
    method: request.method,
    url: request.url,
    params: route.match(request.path).params,
    query: request.query,
    headers: request.headers,
    body: body === '' ? undefined : body,
    routeOptions: { url: route.path, method: route.method },
    routerPath: route.path,
    log: instance.log,
    ip: '127.0.0.1',
  };

  try {
    for (const hook of [...instance.__hooks.onRequest, ...instance.__hooks.preHandler]) {
      if (reply.sent) return sentPromise;
      await new Promise((resolve, reject) => {
        const r = hook.call(instance, req, reply, (/** @type {unknown} */ err) => (err ? reject(err) : resolve(undefined)));
        if (r && typeof r.then === 'function') r.then(resolve, reject);
        else if (hook.length < 3) resolve(undefined);
      });
    }
    if (reply.sent) return sentPromise;
    const result = route.handler.call(instance, req, reply);
    if (result && typeof result.then === 'function') {
      const value = await result;
      if (!reply.sent && value !== undefined) reply.send(value);
    } else if (!reply.sent && result !== undefined && result !== reply) {
      reply.send(result);
    }
  } catch (err) {
    sendError(err);
  }
  return sentPromise;
}

/* ------------------------------------------------------------------ */
/* Programa                                                             */
/* ------------------------------------------------------------------ */

/**
 * @typedef {{ method?: string, path?: string, url?: string, headers?: Record<string, string>, query?: Record<string, string>, body?: unknown }} RequestInput
 */

/** @param {RequestInput} input */
export function normalizeRequest(input) {
  const method = String(input.method ?? 'GET').toUpperCase();
  const rawUrl = String(input.url ?? input.path ?? '/');
  const url = new URL(rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`, 'http://localhost');
  for (const [k, v] of Object.entries(input.query ?? {})) url.searchParams.set(k, String(v));
  /** @type {Record<string, string>} */
  const headers = {};
  for (const [k, v] of Object.entries(input.headers ?? {})) headers[k.toLowerCase()] = String(v);
  let body = input.body;
  if (body !== undefined && body !== null && typeof body !== 'string') {
    body = JSON.stringify(body);
    if (!headers['content-type']) headers['content-type'] = 'application/json';
  }
  return {
    method,
    path: url.pathname,
    url: url.pathname + url.search,
    query: Object.fromEntries(url.searchParams),
    headers,
    body: /** @type {string | undefined} */ (body === null ? undefined : body),
    /** @type {((err: unknown) => void) | undefined} */
    onError: undefined,
  };
}

/** @param {any} app */
function listRoutes(app) {
  if (app.__kind === 'fastify') return app.__routes.map((/** @type {any} */ r) => ({ method: r.method, path: r.path }));
  /** @type {{method: string, path: string}[]} */
  const routes = [];
  /** @param {any[]} stack @param {string} prefix */
  const visit = (stack, prefix) => {
    for (const layer of stack) {
      if (layer.kind === 'route') routes.push({ method: layer.method, path: joinPath(prefix, layer.path) });
      else if (layer.fn.__kind === 'express') visit(layer.fn.__stack, joinPath(prefix, layer.path));
    }
  };
  visit(app.__stack, '');
  return routes;
}

/** @param {string} a @param {string} b */
function joinPath(a, b) {
  const joined = `${a.replace(/\/$/, '')}/${b.replace(/^\//, '')}`;
  return joined.length > 1 ? joined.replace(/\/$/, '') : '/';
}

/**
 * @typedef {(code: string, scope: Record<string, unknown>) => void} Evaluator
 * @typedef {{ setTimeout: Function, clearTimeout: Function, setInterval: Function, clearInterval: Function }} Timers
 */

/**
 * Executa o código (CommonJS) do aluno e devolve um programa capaz de responder requisições.
 * @param {string} compiledCode
 * @param {{ evaluate: Evaluator, timers: Timers, randomUUID?: () => string, requestTimeoutMs?: number }} options
 */
export async function loadProgram(compiledCode, options) {
  /** @type {Array<{level: string, message: string}>} */
  const logs = [];
  const consoleShim = createConsole(logs);
  /** @type {any} */
  const ctx = { apps: [], listening: null, console: consoleShim, timers: options.timers, usesJson: false };
  const express = createExpress(ctx);
  const fastify = createFastify(ctx);
  const noopMiddleware = () => (/** @type {any} */ _req, /** @type {any} */ _res, /** @type {Function} */ next) => next();
  const cryptoShim = {
    randomUUID: options.randomUUID ?? (() => globalThis.crypto.randomUUID()),
    randomInt: (/** @type {number} */ a, /** @type {number} */ b) =>
      b === undefined ? Math.floor(Math.random() * a) : a + Math.floor(Math.random() * (b - a)),
  };
  /** @type {Record<string, unknown>} */
  const modules = {
    express,
    fastify,
    cors: Object.assign(noopMiddleware, { default: noopMiddleware }),
    '@fastify/cors': Object.assign(async () => undefined, { default: async () => undefined }),
    'body-parser': { json: () => jsonMiddleware, urlencoded: () => urlencodedMiddleware },
    crypto: cryptoShim,
    'node:crypto': cryptoShim,
    dotenv: { config: () => ({ parsed: {} }) },
    http: {
      createServer: (/** @type {any} */ app) => ({
        listen: (/** @type {any[]} */ ...args) => (app?.listen ? app.listen(...args) : undefined),
        close: () => undefined,
      }),
    },
  };
  modules['node:http'] = modules.http;

  /** @param {string} name */
  const requireShim = (name) => {
    if (Object.prototype.hasOwnProperty.call(modules, name)) return modules[name];
    throw new Error(
      `O módulo "${name}" não está disponível no runner. Disponíveis: express, fastify, cors, body-parser, crypto, http.`,
    );
  };
  const module = { exports: /** @type {any} */ ({}) };
  const processShim = {
    env: { PORT: '3000', NODE_ENV: 'development' },
    argv: ['node', 'server.js'],
    platform: 'codearena',
    cwd: () => '/app',
    nextTick: (/** @type {Function} */ fn, /** @type {unknown[]} */ ...args) => Promise.resolve().then(() => fn(...args)),
    exit: () => {
      throw new Error('process.exit() não é permitido no runner');
    },
    on: () => undefined,
  };

  try {
    options.evaluate(compiledCode, {
      require: requireShim,
      module,
      exports: module.exports,
      console: consoleShim,
      process: processShim,
      __filename: '/app/server.js',
      __dirname: '/app',
      setTimeout: options.timers.setTimeout,
      clearTimeout: options.timers.clearTimeout,
      setInterval: options.timers.setInterval,
      clearInterval: options.timers.clearInterval,
    });
  } catch (err) {
    return { ok: false, error: formatError(err), logs, routes: [], listening: null, dispatch: null };
  }

  const exported = module.exports?.default ?? module.exports;
  const app =
    ctx.listening?.app ??
    (exported && (exported.__kind === 'express' || exported.__kind === 'fastify') ? exported : null) ??
    ctx.apps[ctx.apps.length - 1] ??
    null;
  if (!app) {
    return {
      ok: false,
      error: 'Nenhum servidor foi criado. Crie um app com express() ou fastify().',
      logs,
      routes: [],
      listening: null,
      dispatch: null,
    };
  }
  if (app.__kind === 'fastify') {
    try {
      await Promise.all(app.__pending);
    } catch (err) {
      return { ok: false, error: formatError(err), logs, routes: [], listening: null, dispatch: null };
    }
  }

  const requestTimeoutMs = options.requestTimeoutMs ?? 2000;
  /** @param {RequestInput} input */
  const dispatch = async (input) => {
    const request = normalizeRequest(input);
    const before = logs.length;
    request.onError = (err) => consoleShim.error(formatError(err));
    const started = Date.now();
    /** @type {any} */
    let timer;
    const timeout = new Promise((resolve) => {
      timer = options.timers.setTimeout(
        () =>
          resolve({
            error: 'timeout',
            message: `A rota não respondeu em ${requestTimeoutMs} ms. Faltou chamar res.send()/res.json() (ou reply.send())?`,
          }),
        requestTimeoutMs,
      );
    });
    const handled = (app.__kind === 'fastify' ? dispatchFastify(app, request) : dispatchExpress(app, request)).then(
      (/** @type {any} */ response) => ({ response }),
      (/** @type {unknown} */ err) => ({ error: 'exception', message: formatError(err) }),
    );
    /** @type {any} */
    const outcome = await Promise.race([handled, timeout]);
    options.timers.clearTimeout(timer);
    const result = { ...outcome, durationMs: Date.now() - started, logs: logs.slice(before) };
    if (result.response && request.method === 'HEAD') result.response.body = '';
    return result;
  };

  return {
    ok: true,
    error: null,
    logs: [...logs],
    routes: listRoutes(app),
    listening: ctx.listening ? { port: ctx.listening.port } : null,
    framework: app.__kind,
    usesJsonParser: app.__kind === 'fastify' ? true : ctx.usesJson,
    dispatch,
  };
}
