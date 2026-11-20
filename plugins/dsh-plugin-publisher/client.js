window.__ModuleLoader__.load({
  id: '@local/dsh-plugin-publisher',
  factory(require) {
    const React = require('react');
    const { Button, IconCordisPluginOutlineRegular, Modal, PluginArtworkDefault } = require('@deepseek-ai/dsh-client-ui-primitives');
    const h = React.createElement;
    const namespace = 'dshPluginPublisher';
    const panelId = 'my-plugins';
    const endpoint = '/api/dsh-plugin-publisher';

    const zh = {
      title: '我的插件', refresh: '刷新', loading: '正在读取插件…',
      empty: '仓库的 plugins 目录中没有可管理的插件。', localVersion: '本地版本',
      profile: '当前配置', enabled: '已启用', disabled: '未启用', broken: '加载异常',
      notInstalled: '未安装', unknown: '状态暂不可用', manage: '管理安装', installLocal: '安装本地版',
      releases: '发布记录', noReleases: '还没有发布记录。', showReleases: '查看发布记录', hideReleases: '收起发布记录',
      downloads: '发布包下载', count: '{count} 次下载',
      downloadScope: '下载量统计 GitHub Release 插件包的请求次数，包含重复下载。成功安装次数暂无数据来源。',
      published: '已发布', unpublished: '待发布', dirty: '有未提交改动',
      commitFirst: '提交该插件的改动并推送到默认分支后即可发布。',
      publish: '发布版本', publishTitle: '发布到 GitHub',
      publishHelp: '将打包仓库默认分支对应提交中的插件目录，并公开安装链接。',
      notes: '更新说明', cancel: '取消', close: '关闭', publishing: '正在发布…',
      installUnavailable: '暂时无法打开插件安装流程，请稍后重试。',
      installTitle: '安装本地插件', installHelp: 'DSH 会链接到此开发目录。确认后将打开安装流程。',
      copy: '复制安装链接', copied: '已复制安装链接。', copyFailed: '复制失败，请从 GitHub 发布页复制下载地址。',
      releasePage: 'GitHub 发布页', publishDone: '已发布 {plugin} {version}。',
      invalidRepo: '无法读取插件仓库。请从 GitHub 仓库的 plugins 目录安装本插件，或为 DSH Host 设置 DSH_PLUGIN_PUBLISHER_REPO。',
      statsUnavailable: '暂时无法获取 GitHub 发布记录和下载量。若遇到访问限额，可登录 GitHub CLI 后刷新。',
      invalidRequest: '发布信息无效，请重新打开发布窗口。',
      sourceChanged: '本地包已变更或还有未提交改动。刷新后重新确认。',
      pushFirst: 'GitHub 默认分支上的插件与本地提交不同。请先推送并合入默认分支。',
      ghLogin: 'GitHub CLI 无法读取该仓库。请先运行 gh auth login，并检查网络。',
      missingGh: 'DSH Host 找不到 GitHub CLI。请安装 gh 后重启 DSH。',
      repoPermission: '发布需要公开的 GitHub 仓库及有写权限的 GitHub CLI 账号。',
      githubSource: '无法查询 GitHub 默认分支的插件源码。',
      alreadyPublished: '此版本已发布。请更新 package.json 的版本号后再发布。',
      draftConflict: '已有同名草稿，内容与本次发布不一致。请在 GitHub 检查该草稿。',
      tagConflict: '已有同名 Git 标签指向其他提交。请在 GitHub 检查标签。',
      invalidBundle: '无法打包已提交的插件。请检查清单、双语元数据和包内文件。',
      preflightRequired: '请先在仓库运行 npm run check:release，验证该提交对应的安装包后再发布。',
      releaseLookup: '无法确认 GitHub 发布状态。请刷新后重试。',
      releaseCreate: '无法创建 GitHub 发布草稿。请检查仓库发布权限。',
      releaseUpload: '上传失败。GitHub 上可能已有草稿，可以重新提交此版本以继续。',
      assetConflict: '草稿中的插件包校验失败。请在 GitHub 检查附件。',
      releasePublish: '无法完成发布，可重新提交此版本以继续。',
      busy: '已有版本正在发布，请稍后重试。', unexpected: '暂时无法连接发布服务，请重试。',
    };
    const en = {
      title: 'My plugins', refresh: 'Refresh', loading: 'Loading plugins…',
      empty: 'No plugin bundles were found under the repository’s plugins directory.', localVersion: 'Local version',
      profile: 'Current profile', enabled: 'Enabled', disabled: 'Disabled', broken: 'Load error',
      notInstalled: 'Not installed', unknown: 'Status unavailable', manage: 'Manage installation', installLocal: 'Install local copy',
      releases: 'Release history', noReleases: 'No releases yet.', showReleases: 'Show releases', hideReleases: 'Hide releases',
      downloads: 'Release downloads', count: '{count} downloads',
      downloadScope: 'Downloads count requests for GitHub Release assets, including repeat downloads. Successful installation counts are unavailable.',
      published: 'Published', unpublished: 'Unreleased', dirty: 'Uncommitted changes',
      commitFirst: 'Commit the plugin changes and push them to the default branch before publishing.',
      publish: 'Publish version', publishTitle: 'Publish to GitHub',
      publishHelp: 'A release packages the plugin directory from the matching default-branch commit and creates a public install link.',
      notes: 'Release notes', cancel: 'Cancel', close: 'Close', publishing: 'Publishing…',
      installUnavailable: 'The plugin installer is temporarily unavailable. Try again shortly.',
      installTitle: 'Install local plugin', installHelp: 'DSH links to this development directory. Confirm to start installation.',
      copy: 'Copy install link', copied: 'Install link copied.', copyFailed: 'Could not copy the link. Copy the asset URL from the GitHub release page.',
      releasePage: 'GitHub release', publishDone: 'Published {plugin} {version}.',
      invalidRepo: 'Could not read the plugin repository. Install from the checkout’s plugins directory or set DSH_PLUGIN_PUBLISHER_REPO on the Host.',
      statsUnavailable: 'GitHub release history and download counts are temporarily unavailable. If GitHub has rate-limited requests, sign into GitHub CLI and refresh.',
      invalidRequest: 'Invalid release details. Reopen the publish dialog.',
      sourceChanged: 'The local package has changed or still has uncommitted changes. Refresh before publishing.',
      pushFirst: 'The plugin on GitHub’s default branch differs from the local commit. Push and merge into the default branch first.',
      ghLogin: 'GitHub CLI could not read the repository. Run gh auth login and check your network connection.',
      missingGh: 'GitHub CLI was not found. Install gh and restart DSH.',
      repoPermission: 'Publishing requires a public GitHub repository and a GitHub CLI account with write access.',
      githubSource: 'Could not verify the plugin source on GitHub’s default branch.',
      alreadyPublished: 'This version has been published. Update the version in package.json before publishing again.',
      draftConflict: 'A draft with this name contains different release details. Check the draft on GitHub.',
      tagConflict: 'An existing Git tag has this name and points to another commit. Check the tag on GitHub.',
      invalidBundle: 'Could not package the committed bundle. Check its manifest, localized metadata, and package files.',
      preflightRequired: 'Run npm run check:release in the repository to verify the package for this commit before publishing.',
      releaseLookup: 'Could not verify GitHub release status. Refresh and retry.',
      releaseCreate: 'Could not create the GitHub draft. Check your release permissions.',
      releaseUpload: 'Upload failed. A draft may exist on GitHub. Submit this version again to resume.',
      assetConflict: 'The draft asset failed verification. Check the attachment on GitHub.',
      releasePublish: 'Could not finish publishing. Submit this version again to resume.',
      busy: 'Another release is in progress. Try again shortly.', unexpected: 'Could not reach the publisher. Try again.',
    };

    const styles = [
      '.dsh-publisher-page{height:100%;min-height:0;overflow-y:auto;box-sizing:border-box;padding:28px clamp(20px,4vw,48px) 48px;color:var(--dsw-alias-label-primary)}',
      '.dsh-publisher-page-inner{max-width:960px;margin-inline:auto}',
      '.dsh-publisher-page h1{margin:0 0 24px;font-size:24px;line-height:1.3;font-weight:600}',
      '.dsh-publisher{display:grid;gap:14px;font-size:13px;line-height:1.5;min-width:0}',
      '.dsh-publisher-toolbar,.dsh-publisher-actions,.dsh-publisher-release{display:flex;align-items:center;flex-wrap:wrap;gap:8px}',
      '.dsh-publisher-toolbar,.dsh-publisher-release{justify-content:space-between}',
      '.dsh-publisher-row{display:grid;grid-template-columns:40px minmax(0,1fr);gap:8px 12px;padding:14px 0;border-bottom:1px solid var(--dsw-alias-border-l3)}',
      '.dsh-publisher-row>*{grid-column:2}',
      '.dsh-publisher-row>.dsh-publisher-artwork{grid-column:1;grid-row:1/span 2;align-self:start;display:flex}',
      '.dsh-publisher-artwork img{display:block;object-fit:contain}',
      '.dsh-publisher-row:last-child{border-bottom:0}',
      '.dsh-publisher-heading{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:4px 16px}',
      '.dsh-publisher-heading strong{font-size:14px;font-weight:600;overflow-wrap:anywhere}',
      '.dsh-publisher a{color:inherit;text-underline-offset:2px}',
      '.dsh-publisher-meta,.dsh-publisher-note{color:var(--dsw-alias-label-tertiary);margin:0;overflow-wrap:anywhere}',
      '.dsh-publisher-description{color:var(--dsw-alias-label-secondary);margin:0;overflow-wrap:anywhere}',
      '.dsh-publisher-error{color:var(--dsw-alias-state-error-primary);margin:0}',
      '.dsh-publisher-status{font-variant-numeric:tabular-nums}',
      '.dsh-publisher-release{padding:6px 0}',
      '.dsh-publisher-history{margin:0;padding:4px 0;list-style:none}',
      '.dsh-publisher-history li+li{border-top:1px solid var(--dsw-alias-border-l3)}',
      '.dsh-publisher-dialog{display:grid;gap:10px;line-height:1.5;overflow-wrap:anywhere}',
      '.dsh-publisher-dialog p{margin:0}',
      '.dsh-publisher-notes{width:100%;box-sizing:border-box;resize:vertical;font:inherit;color:inherit;background:transparent;border:1px solid var(--dsw-alias-border-l3);border-radius:8px;padding:8px}',
    ].join('\n');

    async function request(options) {
      const response = await fetch(endpoint, { credentials: 'same-origin', ...options });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) throw new Error(payload?.error ?? 'unexpected');
      return payload;
    }

    function profileState(inventory, name) {
      if (!inventory) return { status: 'unknown' };
      const bundle = inventory.find(item => item.name === name && item.installed);
      if (!bundle) return { status: 'notInstalled' };
      if (bundle.availability === 'missing' || (bundle.enabled && bundle.error)) return { bundle, status: 'broken' };
      return { bundle, status: bundle.enabled ? 'enabled' : 'disabled' };
    }

    function localizedText(ctx, values) {
      if (typeof values === 'string') return values.trim();
      const texts = Object.fromEntries(Object.entries(values ?? {}).filter(([, text]) => typeof text === 'string' && text.trim()));
      return Object.keys(texts).length ? ctx.locale.resolveText(texts) : '';
    }

    function PluginIcon({ sources }) {
      const [failed, setFailed] = React.useState([]);
      const src = sources.find(source => source && !failed.includes(source));
      return h('span', { className: 'dsh-publisher-artwork', 'aria-hidden': true },
        src
          ? h('img', { src, width: 40, height: 40, alt: '', onError: () => setFailed(previous => [...previous, src]) })
          : h(PluginArtworkDefault, { size: 40 }),
      );
    }

    function PublisherContent({ ctx, t, openPackage, install }) {
      const [view, setView] = React.useState(null);
      const [inventory, setInventory] = React.useState(null);
      const [refresh, setRefresh] = React.useState(0);
      const [loading, setLoading] = React.useState(true);
      const [error, setError] = React.useState('');
      const [history, setHistory] = React.useState(null);
      const [dialog, setDialog] = React.useState(null);
      const [notes, setNotes] = React.useState('');
      const [publishing, setPublishing] = React.useState(false);
      const [dialogError, setDialogError] = React.useState('');
      const [notice, setNotice] = React.useState('');

      React.useEffect(() => {
        let active = true;
        let inventoryRequest = 0;
        const controller = new AbortController();
        const syncInventory = async () => {
          const current = ++inventoryRequest;
          const result = await ctx.remote.pluginManager.listBundles().catch(() => null);
          if (active && current === inventoryRequest) setInventory(result?.ok ? result.value : null);
        };
        const dispose = ctx.remote.$on('plugin-manager/changed', syncInventory);
        void syncInventory();
        setLoading(true);
        setError('');
        void request({ signal: controller.signal }).then(
          data => { if (active) setView(data); },
          error => { if (active) setError(error.message); },
        ).finally(() => { if (active) setLoading(false); });
        return () => { active = false; controller.abort(); dispose(); };
      }, [ctx, refresh]);

      function openDialog(action, plugin, title) {
        setDialog({ action, plugin, title });
        setNotes('');
        setDialogError('');
        setNotice('');
      }

      async function publish() {
        if (publishing || !notes.trim()) return;
        const plugin = dialog.plugin;
        setPublishing(true);
        setDialogError('');
        try {
          const row = await request({
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-dsh-plugin-publisher': '1' },
            body: JSON.stringify({ repo: view.repo, id: plugin.id, version: plugin.version, tree: plugin.tree, notes }),
          });
          setHistory(plugin.id);
          setNotice(t('publishDone', { plugin: dialog.title, version: row.version }));
          setDialog(null);
          setRefresh(current => current + 1);
        } catch (error) {
          setDialogError(error.message);
        } finally {
          setPublishing(false);
        }
      }

      async function copy(url) {
        try {
          await navigator.clipboard.writeText(url);
          setNotice(t('copied'));
        } catch {
          setNotice(t('copyFailed'));
        }
      }

      const locale = document.documentElement.lang || undefined;
      const releaseList = rows => h('ul', { className: 'dsh-publisher-history', 'aria-label': t('releases') }, rows.map(row =>
        h('li', { key: row.version, className: 'dsh-publisher-release' },
          h('span', null, 'v' + row.version, ' · ', new Date(row.publishedAt).toLocaleDateString(locale), ' · ',
            t('count', { count: row.downloads.toLocaleString(locale) })),
          h('div', { className: 'dsh-publisher-actions' },
            h(Button, { variant: 'outline', onClick: () => copy(row.installUrl) }, t('copy')),
            h('a', { href: row.releaseUrl, target: '_blank', rel: 'noreferrer' }, t('releasePage')),
          ),
        ),
      ));

      const renderPlugin = plugin => {
        const current = profileState(inventory, plugin.name);
        const installedMeta = current.bundle?.meta;
        const title = localizedText(ctx, plugin.titles) || localizedText(ctx, installedMeta?.title) || plugin.id;
        const description = localizedText(ctx, plugin.descriptions)
          || localizedText(ctx, installedMeta?.description)
          || current.bundle?.description;
        const releases = view.releases?.filter(release => release.id === plugin.id);
        const published = releases?.some(release => release.version === plugin.version);
        const total = releases?.reduce((sum, release) => sum + release.downloads, 0);
        const expanded = history === plugin.id;
        const status = published ? 'published' : plugin.dirty ? 'dirty' : releases ? 'unpublished' : 'unknown';
        return h('section', { key: plugin.id, className: 'dsh-publisher-row' },
          h(PluginIcon, { sources: [plugin.icon, installedMeta?.icon] }),
          h('div', { className: 'dsh-publisher-heading' },
            h('strong', null, title),
            h('span', { className: 'dsh-publisher-status' }, t('downloads'), ' ',
              total === undefined ? '—' : total.toLocaleString(locale)),
          ),
          description && h('p', { className: 'dsh-publisher-description' }, description),
          h('p', { className: 'dsh-publisher-meta' },
            plugin.name, ' · ', t('localVersion'), ' ', plugin.version, ' · ', t(status),
            published && plugin.dirty ? ' · ' + t('dirty') : ''),
          h('p', { className: 'dsh-publisher-meta' },
            t('profile'), ' · ', t(current.status), current.bundle?.version ? ' · v' + current.bundle.version : ''),
          h('div', { className: 'dsh-publisher-actions' },
            current.bundle
              ? h(Button, { variant: 'outline', onClick: () => openPackage(plugin.name) }, t('manage'))
              : h(Button, { variant: 'outline', disabled: !inventory, onClick: () => openDialog('install', plugin, title) }, t('installLocal')),
            h(Button, {
              variant: 'outline', 'aria-expanded': expanded, disabled: !releases,
              onClick: () => setHistory(expanded ? null : plugin.id),
            }, t(expanded ? 'hideReleases' : 'showReleases')),
            h(Button, {
              variant: 'outline', disabled: loading || !!error || plugin.dirty || published || publishing,
              title: plugin.dirty ? t('commitFirst') : undefined,
              onClick: () => openDialog('publish', plugin, title),
            }, t('publish')),
          ),
          expanded && (releases?.length ? releaseList(releases) : h('p', { className: 'dsh-publisher-note' }, t('noReleases'))),
        );
      };

      const publishDialog = dialog?.action === 'publish';
      const close = () => { if (!publishing) setDialog(null); };
      const confirm = () => {
        if (publishDialog) return publish();
        const plugin = dialog.plugin;
        if (install({ spec: plugin.folder, title: dialog.title, version: plugin.version })) {
          setDialog(null);
        } else {
          setDialogError('installUnavailable');
        }
      };

      return h('div', { className: 'dsh-publisher', 'aria-busy': loading },
        h('div', { className: 'dsh-publisher-toolbar' },
          view ? h('a', { href: 'https://github.com/' + view.repo, target: '_blank', rel: 'noreferrer' }, view.repo) : h('span', null),
          h(Button, { variant: 'outline', disabled: loading || publishing,
            onClick: () => setRefresh(current => current + 1) }, t('refresh')),
        ),
        h('p', { className: 'dsh-publisher-note' }, t('downloadScope')),
        notice && h('p', { role: 'status', className: 'dsh-publisher-note' }, notice),
        error && h('p', { role: 'alert', className: 'dsh-publisher-error' }, t(Object.hasOwn(en, error) ? error : 'unexpected')),
        view?.releases === null && h('p', { role: 'status', className: 'dsh-publisher-note' }, t('statsUnavailable')),
        !view && loading && h('p', { role: 'status', className: 'dsh-publisher-note' }, t('loading')),
        view && h('div', null, view.plugins.length ? view.plugins.map(renderPlugin) : t('empty')),
        dialog && h(Modal, {
          open: true, onClose: close, closeLabel: t('close'),
          title: t(publishDialog ? 'publishTitle' : 'installTitle'),
          footer: h(React.Fragment, null,
            h(Button, { variant: 'outline', disabled: publishing, onClick: close }, t('cancel')),
            h(Button, { variant: 'primary', disabled: publishing || (publishDialog && !notes.trim()), onClick: confirm },
              t(publishing ? 'publishing' : publishDialog ? 'publish' : 'installLocal')),
          ),
        }, h('div', { className: 'dsh-publisher-dialog' },
          h('strong', null, dialog.title, ' · v', dialog.plugin.version),
          h('p', { className: 'dsh-publisher-meta' }, publishDialog ? view.repo : dialog.plugin.folder),
          h('p', null, t(publishDialog ? 'publishHelp' : 'installHelp')),
          publishDialog && h('label', null, t('notes'),
            h('textarea', { className: 'dsh-publisher-notes', rows: 4, maxLength: 2000, disabled: publishing,
              value: notes, onChange: event => setNotes(event.target.value) }),
          ),
          dialogError && h('p', { role: 'alert', className: 'dsh-publisher-error' }, t(Object.hasOwn(en, dialogError) ? dialogError : 'unexpected')),
        )),
      );
    }

    function PublisherPage({ ctx, t }) {
      const openPackage = name => ctx.pluginNavigation.openBundle(name);
      const install = target => {
        // In rc.5, the native controller exposes its installer through the Plugins main slot.
        const manager = ctx.slots.entriesOfSlot('main').find(entry => entry.options.key === 'plugins');
        const installFrom = manager?.inject?.()?.installFrom;
        if (typeof installFrom !== 'function') return false;
        ctx.pluginNavigation.openList();
        installFrom(target);
        return true;
      };
      return h('section', { className: 'dsh-publisher-page', 'aria-labelledby': 'dsh-my-plugins-title' },
        h('div', { className: 'dsh-publisher-page-inner' },
          h('h1', { id: 'dsh-my-plugins-title' }, t('title')),
          h(PublisherContent, { ctx, t, openPackage, install }),
        ),
      );
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.pluginManager', 'pluginNavigation'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(namespace, { zh, en }), 'plugin-publisher: dictionaries');
        ctx.effect(() => {
          const style = document.createElement('style');
          style.textContent = styles;
          document.head.append(style);
          return () => style.remove();
        }, 'plugin-publisher: styles');
        const t = ctx.locale.bind(namespace);
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: panelId, locale: namespace,
        }, () => h(PublisherPage, { t, ctx })));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: panelId, order: 5, label: () => t('title'), locale: namespace,
        }, ({ size }) => h(IconCordisPluginOutlineRegular, { size, 'aria-hidden': true })));
      },
    };
  },
});
