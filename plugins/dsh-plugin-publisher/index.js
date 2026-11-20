import path from 'node:path';
import { realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Publisher, PublisherError } from './publisher.js';

export const name = '@local/dsh-plugin-publisher';
export const inject = ['connection'];
const route = '/api/dsh-plugin-publisher';

function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { 'cache-control': 'no-store' } });
}

export function apply(ctx) {
  const lifetime = new AbortController();
  const root = realpath(fileURLToPath(import.meta.url))
    .then(file => process.env.DSH_PLUGIN_PUBLISHER_REPO || path.resolve(path.dirname(file), '../..'));
  const publisher = new Publisher(root, lifetime.signal);
  let publication;

  ctx.effect(() => () => lifetime.abort(), 'plugin-publisher: lifetime');
  ctx.effect(() => ctx.connection.fetch.register({
    path: route,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    async fetch(request) {
      try {
        if (request.method === 'GET') return json(await publisher.dashboard());
        // A same-origin JSON request from the publisher tab is required for writes.
        if (request.headers.get('x-dsh-plugin-publisher') !== '1'
          || !/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')) {
          return json({ error: 'invalidRequest' }, 400);
        }
        const input = await request.json().catch(() => null);
        if (publication) return json({ error: 'busy' }, 409);
        publication = publisher.publish(input);
        try {
          return json(await publication);
        } finally {
          publication = undefined;
        }
      } catch (error) {
        if (error instanceof PublisherError) return json({ error: error.code }, error.status);
        return json({ error: 'unexpected' }, 500);
      }
    },
  }), 'plugin-publisher: owner routes');
}
