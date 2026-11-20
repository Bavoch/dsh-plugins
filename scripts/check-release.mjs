import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { _electron } from 'playwright';
import { Publisher, releaseCheckPaths } from '../plugins/dsh-plugin-publisher/publisher.js';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const pluginRoot = path.join(root, 'plugins');
const timeout = 60_000;
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const git = async (cwd, args) => (await exec('git', args, { cwd, timeout, windowsHide: true })).stdout;

function desktopExecutable(explicit) {
  if (explicit) return path.resolve(explicit);
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'Programs', 'DeepSeek Harness', 'DeepSeek Harness.exe');
  }
  if (process.platform === 'darwin') return '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness';
  throw new Error('Provide the packaged DeepSeek Harness executable with --desktop.');
}

async function snapshotWorktree(directory, ids) {
  await mkdir(directory);
  await git(directory, ['init', '--quiet']);
  // Match the project's line-ending normalization so a later commit can reuse these checks.
  const autocrlf = await git(root, ['config', '--get', 'core.autocrlf']).catch(() => '');
  if (autocrlf.trim()) await git(directory, ['config', 'core.autocrlf', autocrlf.trim()]);
  const listed = await git(root, [
    'ls-files', '--cached', '--others', '--exclude-standard', '-z', '--',
    '.gitattributes', ...ids.map(id => 'plugins/' + id),
  ]);
  for (const relative of new Set(listed.split('\0').filter(Boolean))) {
    const source = path.join(root, relative);
    const stat = await lstat(source).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!stat) continue;
    assert.ok(stat.isFile(), 'Expected a regular file: ' + relative);
    const destination = path.join(directory, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
  await git(directory, ['add', '--all']);
  return (await git(directory, ['write-tree'])).trim();
}

async function collectPackages(ids, worktree, temporary) {
  const source = worktree ? path.join(temporary, 'snapshot') : root;
  const ref = worktree ? await snapshotWorktree(source, ids) : 'HEAD';
  const publisher = new Publisher(source);
  const packages = [];
  for (const id of ids) {
    const relative = 'plugins/' + id;
    if (!worktree) {
      const changed = await git(root, ['status', '--porcelain', '--untracked-files=all', '--', relative]);
      if (changed) throw new Error(id + ' has uncommitted changes. Use --worktree to check the current snapshot.');
    }
    const manifest = await readJson(path.join(source, relative, 'package.json'));
    const tree = (await git(source, ['rev-parse', '--verify', ref + ':' + relative])).trim();
    const plugin = { id, tree, name: manifest.name, version: manifest.version };
    const titles = await Promise.all(['en', 'zh'].map(async lang =>
      (await readJson(path.join(source, relative, 'locale', lang + '.json'))).meta?.title));
    let archive;
    try {
      archive = await publisher.archive(plugin);
    } catch (error) {
      throw new Error('Package validation failed for ' + id + ': ' + (error.cause?.message ?? error.message), { cause: error });
    }
    const asset = path.join(temporary, id + '-' + plugin.version.replace('+', '_') + '.tgz');
    await writeFile(asset, archive);
    packages.push({ ...plugin, asset, archive, titles });
  }
  return packages;
}

async function withDesktop(executable, userData, env, run) {
  const electron = await _electron.launch({
    executablePath: executable,
    args: ['--user-data-dir=' + userData],
    env,
    timeout,
  });
  try {
    const page = await electron.firstWindow({ timeout });
    page.setDefaultTimeout(timeout);
    await page.locator('[data-slot="main"]').waitFor({ state: 'attached' });
    await run(electron, page);
  } finally {
    await electron.close();
  }
}

async function skipOptionalSignIn(electron, page) {
  const welcome = electron.windows().find(window => window !== page && window.url().endsWith('/welcome.html'))
    ?? await electron.waitForEvent('window', {
      predicate: window => window !== page, timeout: 5000,
    }).catch(error => {
      if (error.name === 'TimeoutError') return null;
      throw error;
    });
  if (!welcome) return;
  await welcome.waitForURL(/\/welcome\.html$/);
  await welcome.locator('#api-key').click();
  await welcome.locator('#skip-key').click();
}

async function checkInstalledBundles(electron, page, packages) {
  await skipOptionalSignIn(electron, page);
  await page.getByRole('button', { name: /^(Plugins|插件)$/i }).click();
  await page.locator('[data-plugin-panel]').waitFor({ state: 'visible' });
  for (const plugin of packages) {
    const card = page.locator('[data-plugin-package=' + JSON.stringify(plugin.name) + ']');
    await card.waitFor();
    assert.equal(await card.getAttribute('data-plugin-status'), 'running', plugin.name + ' is not running');
    assert.equal(await card.getByRole('switch').getAttribute('aria-checked'), 'true', plugin.name + ' is disabled');
    const button = card.getByRole('button').first();
    const title = (await button.innerText()).trim();
    assert.ok(plugin.titles.includes(title), plugin.name + ' displayed the wrong title: ' + title);

    await button.click();
    const detail = page.locator('[data-plugin-detail=' + JSON.stringify(plugin.name) + ']');
    const rows = detail.locator('[data-plugin-row]');
    await rows.first().waitFor();
    assert.equal(await detail.locator('[data-plugin-row][data-state]').count(), 0, plugin.name + ' has a failed or disabled component');
    await detail.getByRole('button', { name: /^(Back to plugins|返回插件)$/i }).click();
    console.log('PASS ' + plugin.name + '@' + plugin.version + ' · installed and enabled');
  }
}

async function checkDesktop(executable, temporary, packages) {
  const userData = path.join(temporary, 'electron');
  const home = path.join(temporary, 'dsh');
  const resources = process.platform === 'darwin'
    ? path.resolve(path.dirname(executable), '../Resources')
    : path.join(path.dirname(executable), 'resources');
  const asar = path.join(resources, 'app.asar');
  const cli = path.join(asar, 'dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js');
  const env = { ...process.env, DSH_HOME: home, DSH_PLUGIN_PUBLISHER_REPO: root };
  delete env.ELECTRON_RUN_AS_NODE;
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'no_proxy') delete env[key];
  env.NO_PROXY = [process.env.NO_PROXY ?? process.env.no_proxy, 'localhost', '127.0.0.1', '::1'].filter(Boolean).join(',');
  const cliEnv = { ...env, ELECTRON_RUN_AS_NODE: '1' };
  const run = args => exec(executable, args, { cwd: root, env: cliEnv, timeout, windowsHide: true });
  const version = await run(['-e', 'process.stdout.write(require(process.argv[1]).version)', path.join(asar, 'dsh/package.json')]);
  const dshVersion = version.stdout.trim();
  assert.match(dshVersion, /^\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/, 'Could not read the desktop runtime version');
  console.log('Checking DeepSeek Harness Desktop ' + dshVersion + ' in an isolated profile');

  // Desktop must initialize its own profile before the CLI can install bundles into it.
  await withDesktop(executable, userData, env, async () => {});
  const installation = await run([
    '--expose-internals', cli, 'plugin', '--profile', 'desktop', 'add', '--offline',
    ...packages.map(plugin => plugin.asset),
  ]);
  process.stdout.write(installation.stdout);
  const profile = await readJson(path.join(home, 'profiles/desktop/package.json'));
  for (const plugin of packages) {
    assert.ok(profile.dependencies?.[plugin.name]?.startsWith('file:'), plugin.name + ' was not installed from a tarball');
  }

  await withDesktop(executable, userData, env, (electron, page) => checkInstalledBundles(electron, page, packages));
  return dshVersion;
}

async function saveChecks(packages, dshVersion) {
  for (const plugin of packages) {
    const { directory, archive, receipt } = releaseCheckPaths(root, plugin);
    await mkdir(directory, { recursive: true });
    await writeFile(archive, plugin.archive);
    await writeFile(receipt, JSON.stringify({
      name: plugin.name,
      version: plugin.version,
      tree: plugin.tree,
      dshVersion,
      sha256: createHash('sha256').update(plugin.archive).digest('hex'),
    }, null, 2) + '\n');
  }
  console.log('Checked archives and receipts saved under .dsh-release-check/');
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { desktop: { type: 'string' }, worktree: { type: 'boolean' } },
  });
  const available = (await readdir(pluginRoot, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && /^[a-z0-9][a-z0-9-]*$/.test(entry.name)).map(entry => entry.name);
  const ids = [...new Set(positionals.length ? positionals : available)].sort();
  assert.ok(ids.length && ids.every(id => available.includes(id)), 'Choose plugin directory names from plugins/.');
  const executable = desktopExecutable(values.desktop);
  await lstat(executable).catch(error => {
    throw new Error('Cannot find DeepSeek Harness Desktop. Use --desktop to provide its executable.', { cause: error });
  });
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'dsh-release-check-'));
  try {
    const packages = await collectPackages(ids, values.worktree, temporary);
    const dshVersion = await checkDesktop(executable, temporary, packages);
    await saveChecks(packages, dshVersion);
  } finally {
    await rm(temporary, { recursive: true, force: true, maxRetries: 3 });
  }
}

main().catch(error => {
  console.error(error.message);
  if (error.stdout) console.error(error.stdout.trim());
  if (error.stderr) console.error(error.stderr.trim());
  process.exitCode = 1;
});
