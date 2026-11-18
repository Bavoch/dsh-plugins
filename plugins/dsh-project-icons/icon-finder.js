/**
 * Project icon discovery for one project directory, modeled on PandaGO's
 * `findIcon` (`server/lib/analyzer.ts`) and its `/api/projects/:name/icon`
 * route: the Host scans the directory once, picks the best icon file, and the
 * Client renders the bytes it gets back.
 *
 * Order, most specific first:
 *   1. `manifest.json` `icons` (Chrome-style, largest size), then
 *      `action.default_icon` / `browser_action.default_icon`
 *   2. well-known paths at the root and under `public/`, `src/assets/`,
 *      `assets/`, `static/`, plus the Next.js app-router `icon.*` convention.
 *      SVG ranks before PNG inside each name family: a 32px favicon.png
 *      scaled into a 16px row turns to mush, and ICO needs a decoder the row
 *      does not have.
 *   3. a shallow `public/` scan for `logo*` / `favicon*` only — `public/icons`
 *      is usually a whole icon pack and would pick the wrong one almost always
 *   4. `src-tauri/icons` (Tauri), then `icons/`
 *   5. loose logo/icon/favicon images in the project root
 *
 * A candidate only wins when it is a regular file inside the project and its
 * extension is one the row can paint.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Formats a 16px row can paint directly. */
const RENDERABLE = ['.svg', '.png', '.webp', '.jpg', '.jpeg'];

/** Format preference inside one name family (lower wins). */
const FORMAT_RANK = { '.svg': 0, '.png': 1, '.webp': 2, '.jpg': 3, '.jpeg': 3 };

/** Skip anything big enough to make a per-row read pointless. */
const MAX_ICON_BYTES = 2 * 1024 * 1024;

/** Well-known locations, most specific first. */
const WELL_KNOWN = [
  // project root
  'favicon.svg', 'favicon.png',
  'logo.svg', 'logo.png',
  'icon.svg', 'icon.png',
  'app-icon.png', 'apple-touch-icon.png',
  // public/ (the usual web-app home)
  'public/favicon.svg', 'public/favicon.png',
  'public/logo.svg', 'public/logo.png',
  'public/icon.svg', 'public/icon.png', 'public/apple-touch-icon.png',
  // src/assets/
  'src/assets/logo.svg', 'src/assets/logo.png',
  'src/assets/icon.svg', 'src/assets/icon.png',
  'src/assets/favicon.svg', 'src/assets/favicon.png',
  // assets/
  'assets/favicon.svg', 'assets/favicon.png',
  'assets/logo.svg', 'assets/logo.png',
  'assets/icon.svg', 'assets/icon.png',
  // static/
  'static/favicon.svg', 'static/favicon.png', 'static/logo.png',
  // Next.js app router convention: app/icon.* is the site icon
  'src/app/icon.svg', 'src/app/icon.png',
  'app/icon.svg', 'app/icon.png',
];

/** Whether a file name carries an extension the row can paint. */
const isRenderable = (fileName) => RENDERABLE.includes(path.extname(fileName).toLowerCase());

/**
 * Read one directory without letting a missing or unreadable one throw.
 * @param directory - absolute directory.
 * @returns its entries, or an empty list.
 */
async function readDir(directory) {
  try {
    return await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Accept a candidate path if it is a regular, reasonably sized image inside the
 * project.
 * @param projectPath - absolute project root.
 * @param relativePath - candidate from any rule; may be absolute or escape with `..`.
 * @returns the normalized project-relative path, or null when rejected.
 */
async function accept(projectPath, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.trim() === '') return null;
  const absolute = path.resolve(projectPath, relativePath);
  const relative = path.relative(projectPath, absolute);
  // An icon never lives outside its project: that would let a manifest name any file.
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  if (!isRenderable(relative)) return null;
  try {
    const stat = await fs.stat(absolute);
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_ICON_BYTES) return null;
  } catch {
    return null;
  }
  return relative.split(path.sep).join('/');
}

/** `manifest.json` icons: largest declared size first, then any declared entry. */
async function fromManifest(projectPath) {
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(projectPath, 'manifest.json'), 'utf8'));
  } catch {
    return null;
  }
  if (manifest === null || typeof manifest !== 'object') return null;

  const icons = manifest.icons;
  if (icons !== null && typeof icons === 'object' && !Array.isArray(icons)) {
    const sizes = Object.keys(icons)
      .map(Number)
      .filter((size) => Number.isFinite(size))
      .sort((a, b) => b - a);
    for (const size of sizes) {
      const found = await accept(projectPath, icons[size]); // eslint-disable-line no-await-in-loop
      if (found !== null) return found;
    }
    for (const value of Object.values(icons)) {
      const found = await accept(projectPath, value); // eslint-disable-line no-await-in-loop
      if (found !== null) return found;
    }
  }

  const actionIcon = manifest.action?.default_icon ?? manifest.browser_action?.default_icon;
  if (typeof actionIcon === 'string') return accept(projectPath, actionIcon);
  if (actionIcon !== null && typeof actionIcon === 'object') {
    for (const value of Object.values(actionIcon)) {
      const found = await accept(projectPath, value); // eslint-disable-line no-await-in-loop
      if (found !== null) return found;
    }
  }
  return null;
}

/**
 * Shallow `public/` scan: only `logo*` / `favicon*` names. Depth 3 matches
 * PandaGO, so a mark kept at `public/assets/brand/logo.png` still resolves.
 */
async function fromPublic(projectPath) {
  const hits = [];
  const walk = async (directory, relativeDir, depth) => {
    if (depth > 3) return;
    for (const entry of await readDir(directory)) {
      const relative = relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(path.join(directory, entry.name), relative, depth + 1); // eslint-disable-line no-await-in-loop
        continue;
      }
      if (!entry.isFile() || !isRenderable(entry.name)) continue;
      if (!/logo|favicon/i.test(entry.name)) continue;
      hits.push({
        relative,
        depth,
        isLogo: /logo/i.test(entry.name),
        rank: FORMAT_RANK[path.extname(entry.name).toLowerCase()] ?? 9,
      });
    }
  };
  await walk(path.join(projectPath, 'public'), '', 1);
  hits.sort((a, b) => (
    a.depth - b.depth || Number(b.isLogo) - Number(a.isLogo) || a.rank - b.rank || a.relative.localeCompare(b.relative)
  ));
  return hits.length === 0 ? null : hits[0].relative;
}

/** Best file in a fixed icon directory, ordered by the caller's score. */
async function fromDirectory(projectPath, relativeDir, score) {
  const files = (await readDir(path.join(projectPath, relativeDir)))
    .filter((entry) => entry.isFile() && isRenderable(entry.name))
    .map((entry) => entry.name);
  if (files.length === 0) return null;
  files.sort((a, b) => score(a) - score(b) || a.localeCompare(b));
  return `${relativeDir}/${files[0]}`;
}

/** Best file in the project root whose name says it is the mark. */
async function fromRoot(projectPath) {
  for (const entry of await readDir(projectPath)) {
    if (!entry.isFile() || !isRenderable(entry.name)) continue;
    if (!/logo|icon|favicon/i.test(entry.name)) continue;
    return entry.name;
  }
  return null;
}

/**
 * Find the icon a project should be shown with.
 * @param projectPath - absolute project directory.
 * @returns the icon's project-relative path, or null when the project has none.
 */
export async function findProjectIcon(projectPath) {
  if (typeof projectPath !== 'string' || projectPath === '') return null;
  try {
    const stat = await fs.stat(projectPath);
    if (!stat.isDirectory()) return null;
  } catch {
    return null;
  }

  const steps = [
    () => fromManifest(projectPath),
    async () => {
      for (const candidate of WELL_KNOWN) {
        const found = await accept(projectPath, candidate); // eslint-disable-line no-await-in-loop
        if (found !== null) return found;
      }
      return null;
    },
    () => fromPublic(projectPath),
    () => fromDirectory(projectPath, 'src-tauri/icons', (file) => (
      /^icon\.(png|svg)$/i.test(file) ? 0 : /128/i.test(file) ? 1 : 2
    )),
    () => fromDirectory(projectPath, 'icons', (file) => (/128/i.test(file) ? 0 : /icon/i.test(file) ? 1 : 2)),
    () => fromRoot(projectPath),
  ];

  for (const step of steps) {
    const found = await step(); // eslint-disable-line no-await-in-loop
    if (found !== null) return found;
  }
  return null;
}
