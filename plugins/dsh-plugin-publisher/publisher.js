import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, open, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { gunzipSync, gzipSync } from 'node:zlib';

const exec = promisify(execFile);
const slugPattern = /^[a-z0-9][a-z0-9-]{0,62}$/;
const shaPattern = /^[a-f0-9]{40}$/;
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const gitHubOrigin = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([a-z\d-]+\/[a-z\d_.-]+?)(?:\.git)?\/?$/i;
const iconTypes = new Map([
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.webp', 'image/webp'],
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.gif', 'image/gif'],
]);
const maxIconBytes = 128 * 1024;

export class PublisherError extends Error {
  constructor(code, status = 400, options) {
    super(code, options);
    this.code = code;
    this.status = status;
  }
}

function releaseTag(id, version) {
  return id + '@' + version;
}

function assetName(id, version) {
  return id + '-' + version.replace('+', '_') + '.tgz';
}

export function releaseCheckPaths(root, plugin) {
  const directory = path.join(root, '.dsh-release-check', plugin.id);
  return {
    directory,
    archive: path.join(directory, plugin.tree + '.tgz'),
    receipt: path.join(directory, plugin.tree + '.json'),
  };
}

function matchesFile(pattern, file) {
  if (typeof pattern !== 'string' || !pattern.trim()) return false;
  const relative = pattern.replace(/^\.\//, '').replace(/\/$/, '');
  return file === relative || file.startsWith(relative + '/') || path.posix.matchesGlob(file, relative);
}

function validMetadata(input) {
  const meta = JSON.parse(input)?.meta;
  return [meta?.title, meta?.description].every(value => typeof value === 'string' && value.trim());
}

function parseManifest(text) {
  try {
    const manifest = JSON.parse(text);
    if (typeof manifest.name === 'string' && typeof manifest.version === 'string'
      && manifest.version.length <= 120 && versionPattern.test(manifest.version)
      && typeof manifest.dsh?.bundle?.patch === 'string') return manifest;
  } catch {
    return null;
  }
  return null;
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function readIcon(folder, reference) {
  if (typeof reference !== 'string' || !reference.startsWith('./')) return undefined;
  const type = iconTypes.get(path.extname(reference).toLowerCase());
  if (!type) return undefined;
  try {
    const base = await realpath(folder);
    const file = await realpath(path.resolve(base, reference));
    const relative = path.relative(base, file);
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return undefined;
    const icon = await open(file);
    try {
      const stat = await icon.stat();
      if (!stat.isFile() || stat.size === 0 || stat.size > maxIconBytes) return undefined;
      const buffer = Buffer.alloc(stat.size);
      const { bytesRead } = await icon.read({ buffer, position: 0 });
      if (bytesRead !== buffer.length) return undefined;
      return 'data:' + type + ';base64,' + buffer.toString('base64');
    } finally {
      await icon.close();
    }
  } catch {
    return undefined;
  }
}

async function github(endpoint, signal) {
  const response = await fetch('https://api.github.com/' + endpoint, {
    headers: { 'user-agent': 'dsh-plugin-publisher', accept: 'application/vnd.github+json' },
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
  });
  if (!response.ok) throw new PublisherError('statsUnavailable', 502);
  return response.json();
}

function releaseRows(repo, releases) {
  return releases.flatMap(release => {
    if (release.draft || typeof release.tag_name !== 'string') return [];
    const [id, version, extra] = release.tag_name.split('@');
    if (extra !== undefined || !slugPattern.test(id) || !versionPattern.test(version ?? '')) return [];
    const filename = assetName(id, version);
    const asset = release.assets?.find(item => item.name === filename && item.state === 'uploaded');
    if (!asset || !Number.isSafeInteger(asset.download_count) || asset.download_count < 0) return [];
    const tag = encodeURIComponent(release.tag_name);
    const releasesUrl = 'https://github.com/' + repo + '/releases/';
    return [{
      id, version, publishedAt: release.published_at, downloads: asset.download_count,
      releaseUrl: releasesUrl + 'tag/' + tag,
      installUrl: releasesUrl + 'download/' + tag + '/' + filename,
    }];
  }).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

export class Publisher {
  constructor(root, signal) {
    this.root = root;
    this.signal = signal;
  }

  async command(program, args, { binary = false, timeout = 12_000, trim = true } = {}) {
    const { stdout } = await exec(program, args, {
      cwd: await this.root,
      env: { ...process.env, GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0' },
      encoding: binary ? 'buffer' : 'utf8',
      maxBuffer: binary ? 24 * 1024 * 1024 : 4 * 1024 * 1024,
      timeout, signal: this.signal, windowsHide: true,
    });
    return binary || !trim ? stdout : stdout.trim();
  }

  git(args, options) {
    return this.command('git', ['--no-optional-locks', ...args], options);
  }

  async repo() {
    try {
      const root = await realpath(await this.root);
      const [top, origin, pushOrigin] = await Promise.all([
        this.git(['rev-parse', '--show-toplevel']),
        this.git(['remote', 'get-url', 'origin']),
        this.git(['remote', 'get-url', '--push', 'origin']),
      ]);
      const match = gitHubOrigin.exec(origin);
      if (root === await realpath(top) && match && match[1].toLowerCase() === gitHubOrigin.exec(pushOrigin)?.[1].toLowerCase()) {
        return match[1];
      }
    } catch {
      // The published bundle can be installed without a local checkout.
    }
    throw new PublisherError('invalidRepo');
  }

  async plugins() {
    const root = await this.root;
    const base = path.join(root, 'plugins');
    try {
      const [entries, changes, tracked] = await Promise.all([
        readdir(base, { withFileTypes: true }),
        this.git(['status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all', '--', 'plugins']),
        this.git(['ls-tree', 'HEAD:plugins']),
      ]);
      const edited = new Set(changes.split('\0').map(entry => entry.slice(3).split('/')[1]));
      const trees = new Map(tracked.split('\n').flatMap(line => {
        const match = /^040000 tree ([a-f0-9]{40})\t([a-z0-9-]+)$/.exec(line.trimEnd());
        return match ? [[match[2], match[1]]] : [];
      }));
      const rows = await Promise.all(entries.filter(entry => entry.isDirectory() && slugPattern.test(entry.name))
        .map(async ({ name: id }) => {
          const folder = path.join(base, id);
          const manifest = parseManifest(await readFile(path.join(folder, 'package.json'), 'utf8').catch(() => ''));
          if (!manifest) return null;
          const [zh, en, icon] = await Promise.all([
            readJson(path.join(folder, 'locale', 'zh.json')),
            readJson(path.join(folder, 'locale', 'en.json')),
            readIcon(folder, manifest.exports?.['./icon']),
          ]);
          return {
            id, name: manifest.name, version: manifest.version, folder,
            titles: { zh: zh?.meta?.title ?? zh?.plugin?.name, en: en?.meta?.title ?? en?.plugin?.name },
            descriptions: {
              zh: zh?.meta?.description ?? zh?.plugin?.description,
              en: en?.meta?.description ?? en?.plugin?.description ?? manifest.description,
            },
            icon,
            dirty: edited.has(id) || !trees.has(id),
            tree: trees.get(id),
          };
        }));
      return rows.filter(Boolean).sort((a, b) => a.id.localeCompare(b.id));
    } catch {
      throw new PublisherError('invalidRepo');
    }
  }

  async stats(repo) {
    const endpoint = 'repos/' + repo + '/releases?per_page=100';
    try {
      const pages = await this.ghJson(['--paginate', '--slurp', endpoint], 'statsUnavailable');
      return releaseRows(repo, pages.flat());
    } catch {
      // Public release history remains available without logging into GitHub CLI.
    }
    const releases = [];
    for (let page = 1; page <= 20; page += 1) {
      const batch = await github(endpoint + '&page=' + page, this.signal);
      if (!Array.isArray(batch)) break;
      releases.push(...batch);
      if (batch.length < 100) return releaseRows(repo, releases);
    }
    throw new PublisherError('statsUnavailable', 502);
  }

  async dashboard() {
    const repo = await this.repo();
    const [plugins, releases] = await Promise.all([
      this.plugins(),
      this.stats(repo).catch(() => null),
    ]);
    return { repo, plugins, releases };
  }

  async gh(args, error, timeout) {
    try {
      return await this.command('gh', args, { timeout });
    } catch (failure) {
      if (failure.code === 'ENOENT') throw new PublisherError('missingGh');
      throw new PublisherError(error, 502);
    }
  }

  async ghJson(args, error, timeout) {
    const output = await this.gh(['api', '--hostname', 'github.com', ...args], error, timeout);
    try {
      return JSON.parse(output);
    } catch {
      throw new PublisherError(error, 502);
    }
  }

  async prepareGitHub(repo, plugin, tag, filename) {
    const endpoint = 'repos/' + repo;
    const repository = await this.ghJson([endpoint], 'ghLogin');
    if (repository.private || !repository.permissions?.push) throw new PublisherError('repoPermission');
    const defaultBranch = await this.ghJson(
      [endpoint + '/branches/' + encodeURIComponent(repository.default_branch)], 'githubSource');
    const commit = defaultBranch.commit?.sha;
    if (!shaPattern.test(commit ?? '')) throw new PublisherError('githubSource');
    const files = await this.ghJson([endpoint + '/contents/plugins?ref=' + commit], 'githubSource');
    const remoteTree = files.find(file => file.type === 'dir' && file.name === plugin.id);
    if (remoteTree?.sha !== plugin.tree) throw new PublisherError('pushFirst', 409);

    const releases = await this.ghJson(['--paginate', '--slurp', endpoint + '/releases?per_page=100'], 'releaseLookup');
    const matches = releases.flat().filter(release => release.tag_name === tag);
    if (matches.some(release => !release.draft)) throw new PublisherError('alreadyPublished', 409);
    const draft = matches[0];
    const marker = '<!-- dsh-plugin-publisher ' + plugin.tree + ' -->';
    if (matches.length > 1 || (draft && (
      !draft.body?.startsWith(marker + '\n') || !shaPattern.test(draft.target_commitish)
      || draft.assets?.some(asset => asset.name !== filename)
    ))) throw new PublisherError('draftConflict', 409);

    const target = draft?.target_commitish ?? commit;
    const refs = await this.ghJson(
      [endpoint + '/git/matching-refs/tags/' + encodeURIComponent(tag)], 'releaseLookup');
    const existingTag = refs.find(ref => ref.ref === 'refs/tags/' + tag);
    if (existingTag && (existingTag.object?.type !== 'commit' || existingTag.object.sha !== target)) {
      throw new PublisherError('tagConflict', 409);
    }
    return { endpoint, draft, target, marker };
  }

  async archiveTar(plugin) {
    try {
      const list = await this.git(['ls-tree', '-r', '--full-tree', '-z', plugin.tree], { trim: false });
      const files = list.split('\0').filter(Boolean).map(entry => {
        const match = /^100(?:644|755) blob [a-f0-9]{40}\t(.+)$/s.exec(entry);
        if (!match) throw new PublisherError('invalidBundle');
        return match[1];
      });
      const read = file => this.git(['show', plugin.tree + ':' + file], { trim: false });
      const manifest = parseManifest(await read('package.json'));
      if (manifest?.name !== plugin.name || manifest?.version !== plugin.version
        || typeof manifest.engines?.dsh !== 'string' || !manifest.engines.dsh.trim()
        || !Array.isArray(manifest.files) || !manifest.files.length
        || manifest.exports?.['./package.json'] !== './package.json'
        || manifest.exports?.['./locale/*.json'] !== './locale/*.json') {
        throw new PublisherError('invalidBundle');
      }
      const required = [
        'locale/en.json', 'locale/zh.json', manifest.dsh.bundle.patch,
        manifest.exports['.'], ...(manifest.dsh.client ? [manifest.exports['./client']] : []),
      ];
      if (manifest.exports['./icon']) required.push(manifest.exports['./icon']);
      if (required.some(file => typeof file !== 'string' || !files.includes(file.replace(/^\.\//, '')))
        || files.some(file => file !== 'package.json' && !manifest.files.some(pattern => matchesFile(pattern, file)))) {
        throw new PublisherError('invalidBundle');
      }
      const locales = await Promise.all(['en', 'zh'].map(lang => read('locale/' + lang + '.json')));
      if (!locales.every(validMetadata)) throw new PublisherError('invalidBundle');
      return await this.git([
        'archive', '--format=tar', '--prefix=package/', '--mtime=2000-01-01T00:00:00Z', plugin.tree,
      ], { binary: true });
    } catch (error) {
      throw new PublisherError('invalidBundle', 400, { cause: error });
    }
  }

  async archive(plugin) {
    return gzipSync(await this.archiveTar(plugin));
  }

  async checkedArchive(plugin) {
    const expected = await this.archiveTar(plugin);
    const files = releaseCheckPaths(await this.root, plugin);
    try {
      const [archive, receipt] = await Promise.all([readFile(files.archive), readJson(files.receipt)]);
      if (receipt?.name !== plugin.name || receipt?.version !== plugin.version || receipt?.tree !== plugin.tree
        || typeof receipt?.dshVersion !== 'string' || !versionPattern.test(receipt.dshVersion)
        || receipt.sha256 !== createHash('sha256').update(archive).digest('hex')
        || !gunzipSync(archive, { maxOutputLength: expected.length }).equals(expected)) {
        throw new PublisherError('preflightRequired', 409);
      }
      return archive;
    } catch {
      throw new PublisherError('preflightRequired', 409);
    }
  }

  async publish(input) {
    if (!input || typeof input.id !== 'string' || !slugPattern.test(input.id)
      || typeof input.version !== 'string' || typeof input.tree !== 'string' || !shaPattern.test(input.tree)
      || typeof input.notes !== 'string' || input.notes.length > 2000 || !input.notes.trim()) {
      throw new PublisherError('invalidRequest');
    }
    const repo = await this.repo();
    const plugin = (await this.plugins()).find(item => item.id === input.id);
    if (repo !== input.repo || !plugin || plugin.version !== input.version || plugin.tree !== input.tree || plugin.dirty) {
      throw new PublisherError('sourceChanged', 409);
    }
    const tag = releaseTag(plugin.id, plugin.version);
    const filename = assetName(plugin.id, plugin.version);
    const archive = await this.checkedArchive(plugin);
    const { endpoint, draft, target, marker } = await this.prepareGitHub(repo, plugin, tag, filename);
    const digest = 'sha256:' + createHash('sha256').update(archive).digest('hex');
    const body = [
      marker, input.notes.trim(),
      'DeepSeek Harness → Plugins → Add plugin',
      'https://github.com/' + repo + '/releases/download/' + encodeURIComponent(tag) + '/' + filename,
    ].join('\n\n');
    const release = draft ?? await this.ghJson([
      '--method', 'POST', endpoint + '/releases',
      '-f', 'tag_name=' + tag, '-f', 'target_commitish=' + target,
      '-f', 'name=' + plugin.id + ' ' + plugin.version,
      '-f', 'body=' + body, '-F', 'draft=true',
      '-F', 'prerelease=' + Boolean(versionPattern.exec(plugin.version)[4]),
    ], 'releaseCreate');
    if (!Number.isSafeInteger(release.id)) throw new PublisherError('releaseLookup', 502);

    const releaseEndpoint = endpoint + '/releases/' + release.id;
    const packageAsset = release.assets?.find(item => item.name === filename);
    if (!packageAsset) {
      const temp = await mkdtemp(path.join(os.tmpdir(), 'dsh-plugin-publisher-'));
      try {
        const file = path.join(temp, filename);
        await writeFile(file, archive);
        await this.ghJson([
          '--method', 'POST', 'https://uploads.github.com/' + releaseEndpoint + '/assets?name=' + encodeURIComponent(filename),
          '--header', 'Content-Type: application/octet-stream', '--input', file,
        ], 'releaseUpload', 60_000);
      } finally {
        await rm(temp, { recursive: true, force: true }).catch(() => {});
      }
    }

    const uploaded = await this.ghJson([releaseEndpoint], 'releaseLookup');
    if (!uploaded.draft || uploaded.tag_name !== tag) throw new PublisherError('alreadyPublished', 409);
    const asset = uploaded.assets?.find(item => item.name === filename);
    if (asset?.state !== 'uploaded' || asset.digest !== digest) throw new PublisherError('assetConflict', 409);
    const published = await this.ghJson([
      '--method', 'PATCH', releaseEndpoint, '-f', 'body=' + body, '-F', 'draft=false', '-f', 'make_latest=false',
    ], 'releasePublish');
    const [row] = releaseRows(repo, [published]);
    if (!row) throw new PublisherError('releaseLookup', 502);
    return row;
  }
}
