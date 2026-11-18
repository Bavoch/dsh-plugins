/**
 * Host half: serves a project's icon to the sidebar, mirroring how PandaGO's
 * `/api/projects/:name/icon` route serves its project icons.
 *
 * Discovery is one directory scan per project (`findProjectIcon`, ported from
 * PandaGO's `findIcon`) cached for a minute, because every sidebar row of a
 * project asks for the same answer. The response is the chosen file with its
 * content type, exactly as PandaGO streams it back.
 *
 * Security: the route rides Connection's `/api` Fetch channel, which admits
 * only authenticated browser or API peers and applies the Host/Origin checks
 * before this handler runs. On top of that the handler answers only GET/HEAD
 * and only ever serves a file the finder accepted inside a directory that a
 * registered Workspace actually owns, so it cannot be used to read arbitrary
 * paths.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { findProjectIcon } from './icon-finder.js';

/** Cordis plugin name, matching the package name in the profile patch. */
const name = '@local/dsh-project-icons';

/** The authenticated Fetch channel and the Workspace registry are both required. */
const inject = ['connection', 'workspaceRegistry'];

/** Exact Fetch route served on the `/api` channel. */
const ROUTE_PATH = '/api/project-icon';

/** How long a discovered icon path is reused before the directory is scanned again. */
const CACHE_MS = 60_000;

/** Content types for every format the finder can return. */
const MIME = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

/**
 * Resolve the requested project directory to a Workspace the Host knows.
 *
 * The query is matched by exact string against the registered paths rather
 * than resolved first: resolving would let `.../Chat/../../Coding/Other`
 * satisfy the check by aliasing onto a different registered project, which
 * would then serve that project's icon under this project's row.
 * @param registry - `ctx.workspaceRegistry`.
 * @param requested - absolute directory from the query string.
 * @returns the registered Workspace path, or undefined when unregistered.
 */
function ownedProjectPath(registry, requested) {
  if (typeof requested !== 'string' || requested === '' || !path.isAbsolute(requested)) return undefined;
  if (requested.includes('\0')) return undefined;
  // Trim exactly one trailing separator so a UI that appends `/` still matches.
  const candidate = requested.length > 1 && (requested.endsWith('/') || requested.endsWith(path.sep))
    ? requested.slice(0, -1)
    : requested;
  // Reject any `..` segment before matching. A directory genuinely named `..x`
  // is legal, so this looks at whole segments rather than substrings.
  if (candidate.split(/[\\/]/).includes('..')) return undefined;
  const registered = registry.list().map((workspace) => String(workspace.path));
  return registered.includes(candidate) ? candidate : undefined;
}

/**
 * Plugin entry: register the authenticated icon route.
 * @param ctx - Host context carrying `connection` and `workspaceRegistry`.
 */
function apply(ctx) {
  /** Discovery results by project path, so row bursts scan once per minute. */
  const discovered = new Map();

  /**
   * The icon file for one project, reusing a recent scan.
   * @param projectPath - registered Workspace directory.
   * @returns the project-relative icon path, or null when the project has none.
   */
  const locate = async (projectPath) => {
    const hit = discovered.get(projectPath);
    if (hit !== undefined && Date.now() - hit.at < CACHE_MS) return hit.iconPath;
    const iconPath = await findProjectIcon(projectPath);
    discovered.set(projectPath, { at: Date.now(), iconPath });
    // Keep the map from growing with every project the user has ever opened.
    if (discovered.size > 200) discovered.delete(discovered.keys().next().value);
    return iconPath;
  };

  /**
   * Answer one icon request.
   * @param request - an admitted Fetch request on the `/api` channel.
   * @returns the icon bytes, or a 404/405/500 response.
   */
  const handle = async (request) => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
      }

      const url = new URL(request.url);
      const projectPath = ownedProjectPath(ctx.workspaceRegistry, url.searchParams.get('path') ?? '');
      if (projectPath === undefined) return new Response(null, { status: 404 });

      const iconPath = await locate(projectPath);
      if (iconPath === null) return new Response(null, { status: 404 });

      const body = await fs.readFile(path.join(projectPath, iconPath));
      return new Response(request.method === 'HEAD' ? null : body, {
        status: 200,
        headers: {
          'content-type': MIME[path.extname(iconPath).toLowerCase()] ?? 'application/octet-stream',
          'content-length': String(body.byteLength),
          'cache-control': 'private, max-age=60',
          'x-content-type-options': 'nosniff',
        },
      });
    } catch (error) {
      ctx.logger?.warn?.(error instanceof Error ? error : new Error(String(error)));
      return new Response(null, { status: 500 });
    }
  };

  ctx.effect(() => ctx.connection.fetch.register({
    path: ROUTE_PATH,
    methods: ['GET', 'HEAD'],
    requestBody: 'buffered',
    fetch: handle,
  }), 'project-icons: icon route');
}

export { apply, inject, name };
