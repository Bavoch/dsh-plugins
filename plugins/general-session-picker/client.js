/**
 * Client half: completes the blank-session Hero's workspace picker with
 *
 * - a "不在项目中工作" entry in the menu, and
 * - the Codex-style clear chip: hovering the workspace chip turns its folder
 *   glyph into an ×, and clicking that × clears the project.
 *
 * "Not working in a project" resolves to the dedicated general Workspace — the
 * one titled 通用对话 (path ~/Documents/Chat-General). It is looked up by
 * title/path and never created, so repeated use is stable and mints no
 * timestamped directories.
 *
 * That Workspace is deliberately NOT a project: it is filtered out of the menu
 * list, never carries the checkmark, and — while the Session sits in it — the
 * chip is relabelled 不在项目中工作 instead of naming it. It stays stored and
 * usable, reachable only through this affordance.
 *
 * The chip is rendered by the shipped Conversation, so this plugin cannot
 * re-render it. It decorates the live element instead:
 *
 *   - a span is inserted as the chip's first child, exactly where the folder
 *     glyph sits, and a React portal renders the × button into it;
 *   - a stylesheet keeps the × out of layout until the chip is hovered, at
 *     which point the × appears and the glyph is hidden.
 *
 * The × must be its own click target: a pseudo-element cannot receive a click,
 * and letting the whole chip clear would leave the menu unreachable. The button
 * stops propagation on both pointerdown and click so the shipped toggle never
 * sees them.
 *
 * "添加工作区…" drives the Host's directory-picker pick primitive directly, then
 * adopts the picked path (createWorkspace + onPick), matching the shipped owner
 * semantics. The flow hole stays declared by the shipped entry, so the occupant
 * is not reused; the affordance is re-implemented on the same primitives.
 */
window.__ModuleLoader__.load({
  id: '@local/general-session-picker',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;
    const {
      Menu, Modal, Button,
      IconFolderCloseRegular, IconPlusOutlineRegular, IconCloseOutlineRegular,
    } = require('@deepseek-ai/dsh-client-ui-primitives');

    const NS = 'general-picker';
    const ADD_WORKSPACE = '::add-workspace';
    const NO_PROJECT = '::no-project';

    /** Class of the injected × button; the stylesheet keys on it. */
    const CROSS_CLASS = 'dsh-gsp-chip-clear';
    /** Class of the span the × renders into, placed where the glyph was. */
    const CROSS_HOST_CLASS = 'dsh-gsp-chip-clear-host';
    /** Class of the span carrying the 不在项目中工作 replacement label. */
    const LABEL_HOST_CLASS = 'dsh-gsp-chip-label';
    /** Class of the text span rendered into that host. */
    const LABEL_TEXT_CLASS = 'dsh-gsp-chip-label-text';
    /** Set on the chip while clearing is offered, so CSS can swap the glyph. */
    const CLEAR_ATTR = 'data-gsp-clearable';
    /** Set on the chip while the Session sits in the general Workspace. */
    const NO_PROJECT_ATTR = 'data-gsp-no-project';

    /** Browse dialog classes. */
    const CSS_BROWSE = 'dsh-gsp-browse';
    const CSS_BROWSE_PATH = 'dsh-gsp-browse-path';
    const CSS_BROWSE_LIST = 'dsh-gsp-browse-list';
    const CSS_BROWSE_ROW = 'dsh-gsp-browse-row';

    /** Title carried by the general Workspace this plugin clears to. */
    const GENERAL_TITLE = '通用对话';
    /** Path fallback when the Workspace was renamed but still points here. */
    const GENERAL_PATH_SUFFIX = '/Documents/Chat-General';

    /**
     * The general Workspace, or undefined while none exists.
     * @param items - Workspace summaries from the live store.
     */
    const generalWorkspace = (items) => items.find(
      (item) => item.title === GENERAL_TITLE
        || (typeof item.path === 'string' && item.path.endsWith(GENERAL_PATH_SUFFIX)),
    );

    /**
     * The chip element inside the hero workspace row.
     * @param anchor - the chip's own ref cell.
     */
    const chipOf = (anchor) => {
      const element = anchor?.current;
      return element instanceof HTMLElement ? element : undefined;
    };

    /**
     * Stylesheet. The × is a real, separately clickable node this plugin injects
     * into the chip — a pseudo-element cannot receive its own click, and letting
     * the whole chip clear would make the menu unreachable. So:
     *
     *   - the injected node covers the folder glyph's slot and is hidden;
     *   - hovering the chip shows it and hides the glyph;
     *   - the node carries no hit area until hovering, so a plain chip click
     *     still opens the menu (it lands on the glyph or the label, not here).
     */
    const STYLESHEET = `
.${CROSS_CLASS} {
  flex: none;
  width: 16px;
  height: 16px;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: var(--dsw-radius-xs, 4px);
  background: 0 0;
  color: var(--dsw-alias-label-secondary, currentColor);
  cursor: pointer;
}
.${CROSS_HOST_CLASS} {
  display: none;
  flex: none;
}
[${CLEAR_ATTR}="true"]:hover .${CROSS_HOST_CLASS} {
  display: inline-flex;
}
[${CLEAR_ATTR}="true"]:hover .${CROSS_CLASS} {
  display: inline-flex;
}
/* The chip holds exactly two svgs: the folder glyph, then the chevron. Hide
   only the first — the chevron keeps its place so the chip keeps its width. */
[${CLEAR_ATTR}="true"]:hover > svg:nth-of-type(1) {
  display: none;
}
.${CROSS_CLASS}:hover {
  color: var(--dsw-alias-label-primary, currentColor);
}
/* In the general Workspace the chip must not name it: hide the shipped label
   and show the replacement rendered into .${LABEL_HOST_CLASS}. */
[${NO_PROJECT_ATTR}="true"] > span:not(.${CROSS_HOST_CLASS}):not(.${LABEL_HOST_CLASS}) {
  display: none;
}
.${LABEL_HOST_CLASS} {
  display: inline-flex;
  min-width: 0;
}
.${LABEL_TEXT_CLASS} {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
/* "No project" must read as a default placeholder, not a real project. A real
   project chip shows a normal folder glyph and label; here both are muted — the
   folder glyph and the replacement label drop to the secondary label colour at
   reduced opacity, and the folder glyph is dashed instead of solid — so the
   no-project state is visibly weaker than an actual project directory. */
[${NO_PROJECT_ATTR}="true"] {
  color: var(--dsw-alias-label-secondary, currentColor);
  opacity: 0.72;
}
[${NO_PROJECT_ATTR}="true"] > svg:nth-of-type(1) {
  color: var(--dsw-alias-state-idle-primary, var(--dsw-alias-label-secondary, currentColor));
  stroke-dasharray: 2 1.5;
  opacity: 0.85;
}
/* Keep the hover affordance legible even while the chip is muted. */
[${NO_PROJECT_ATTR}="true"]:hover {
  opacity: 0.9;
}
/* In-app browse dialog: a scrollable level listing above the footer. */
.${CSS_BROWSE} {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 340px;
}
.${CSS_BROWSE_PATH} {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.${CSS_BROWSE_LIST} {
  display: flex;
  flex-direction: column;
  max-height: 320px;
  overflow-y: auto;
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-md, 8px);
}
.${CSS_BROWSE_ROW} {
  width: 100%;
  box-sizing: border-box;
  text-align: left;
  padding: 7px 10px;
  border: none;
  background: 0 0;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 13px;
  line-height: 22px;
  min-height: 32px;
  display: flex;
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.${CSS_BROWSE_ROW}:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.16));
}
`;

    function GeneralWorkspacePicker(props) {
      const {
        open, anchorRef, selectedId, onPick, onClose,
        createWorkspace, renameWorkspace, pickDirectory, listDirectory,
        t, useWorkspaces,
      } = props;

      const workspaceSnapshot = useWorkspaces((state) => state);
      const workspaces = workspaceSnapshot.items;
      const general = generalWorkspace(workspaces);
      const getAnchorRect = React.useCallback(
        () => (anchorRef && anchorRef.current ? anchorRef.current.getBoundingClientRect() : null),
        [anchorRef],
      );

      const [errorOpen, setErrorOpen] = React.useState(false);
      const [modalError, setModalError] = React.useState(null);
      const [busy, setBusy] = React.useState(false);

      // Which pick verb this Host actually serves (probed on first use).
      const preferredPickRef = React.useRef(undefined);
      const preferredPick = preferredPickRef.current;
      // In-app browse dialog state: its root listing, the current listing, and
      // whether a level is loading.
      const [browseRoot, setBrowseRoot] = React.useState(null);
      const [browseOpen, setBrowseOpen] = React.useState(false);
      const [browseListing, setBrowseListing] = React.useState(null);
      const [browseBusy, setBrowseBusy] = React.useState(false);
      const [browseTrail, setBrowseTrail] = React.useState([]);

      const closeModal = () => { setErrorOpen(false); setModalError(null); };
      const showError = (reason) => {
        setModalError(reason instanceof Error ? reason.message : String(reason));
        setErrorOpen(true);
        onClose();
      };

      /**
       * Offer the × on the chip while a Workspace other than the general one is
       * selected. The attribute is what the stylesheet keys on; the × node
       * itself is portalled in below, once the chip element exists.
       */
      const clearable = general !== undefined && general.workspaceId !== selectedId;
      React.useEffect(() => {
        const chip = chipOf(anchorRef);
        if (chip === undefined) return undefined;
        if (clearable) chip.setAttribute(CLEAR_ATTR, 'true');
        else chip.removeAttribute(CLEAR_ATTR);
        return () => chip.removeAttribute(CLEAR_ATTR);
      }, [anchorRef, clearable]);

      /**
       * Mount the × into the chip. The chip's ref is populated by the time this
       * child renders, but a retried frame covers the case where the host
       * mounts the chip one commit later.
       */
      const [chipHost, setChipHost] = React.useState(null);
      React.useEffect(() => {
        let frame = 0;
        let host;
        let live = true;
        const attach = () => {
          if (!live) return;
          const chip = chipOf(anchorRef);
          if (chip === undefined) { frame = requestAnimationFrame(attach); return; }
          host = document.createElement('span');
          host.className = CROSS_HOST_CLASS;
          // First child, so it occupies the folder glyph's slot.
          chip.insertBefore(host, chip.firstChild);
          setChipHost(host);
        };
        attach();
        return () => {
          live = false;
          cancelAnimationFrame(frame);
          host?.remove();
          setChipHost(null);
        };
      }, [anchorRef]);

      /**
       * Relabel the chip while the Session sits in the general Workspace. That
       * Workspace is deliberately not a project, so the chip must not announce it
       * by name — it reads as 不在项目中工作 instead.
       *
       * The shipped label is React-owned, so its text is never rewritten (React
       * would revert it). Instead the chip is flagged, CSS hides the shipped
       * label there, and a sibling span this plugin owns renders the replacement.
       */
      const inGeneral = general !== undefined && general.workspaceId === selectedId;
      React.useEffect(() => {
        const chip = chipOf(anchorRef);
        if (chip === undefined) return undefined;
        if (inGeneral) chip.setAttribute(NO_PROJECT_ATTR, 'true');
        else chip.removeAttribute(NO_PROJECT_ATTR);
        return () => chip.removeAttribute(NO_PROJECT_ATTR);
      }, [anchorRef, inGeneral]);

      const [labelHost, setLabelHost] = React.useState(null);
      React.useEffect(() => {
        if (!inGeneral) return undefined;
        let frame = 0;
        let host;
        let live = true;
        const attach = () => {
          if (!live) return;
          const chip = chipOf(anchorRef);
          if (chip === undefined) { frame = requestAnimationFrame(attach); return; }
          host = document.createElement('span');
          host.className = `${LABEL_HOST_CLASS} ${LABEL_TEXT_CLASS}`;
          // Plain DOM text inside the chip button, never a React portal: a
          // portal's synthetic events travel the portal owner's React tree, not
          // the chip button's, so a click on the label never reached the
          // button's onClick — only the shipped folder glyph did. A plain text
          // node is a normal DOM child of the button, so a click bubbles to the
          // button's own React handler exactly like clicking the glyph.
          host.textContent = t('menu.noProject');
          // Place the replacement label just before the chevron svg, so the
          // chip reads [glyph] 不在项目中工作 [chevron] — the label sits to the
          // LEFT of the caret.
          const chevron = chip.querySelector(':scope > svg:nth-of-type(2)');
          if (chevron !== null) chip.insertBefore(host, chevron);
          else chip.appendChild(host);
          setLabelHost(host);
        };
        attach();
        return () => {
          live = false;
          cancelAnimationFrame(frame);
          host?.remove();
          setLabelHost(null);
        };
      }, [anchorRef, inGeneral, t]);

      const pickWorkspace = async (path, title) => {
        const workspace = await createWorkspace({ path });
        if (title !== undefined) {
          try { await renameWorkspace(workspace.workspaceId, title); } catch { /* keep folder name */ }
        }
        onClose();
        onPick(workspace.workspaceId);
      };

      /**
       * 添加工作区 through the composed directory-flow occupant.
       *
       * This entry shadows the hero picker but cannot declare the
       * `conversation.hero.workspace.directoryFlow` hole: that hole declares
       * exactly once and the shipped entry already owns it. So the pick is made
       * on the primitives the Host actually serves, chosen at click time:
       *   - browse backend: `listDirectory` (an in-app dialog is drawn below);
       *   - native backend: `pickDirectory` (the OS panel).
       * The two verbs each throw on the other backend, so the successful one is
       * remembered for the session and tried first next time.
       */
      const startAdd = async () => {
        // A native backend answers pickDirectory; a browse backend answers
        // listDirectory. Ask the remembered winner first, then the other.
        const order = preferredPick === 'browse'
          ? ['browse', 'native']
          : ['native', 'browse'];
        setBusy(true);
        setErrorOpen(false);
        setModalError(null);
        onClose();
        for (const mode of order) {
          try {
            if (mode === 'native') {
              const path = await pickDirectory();
              preferredPickRef.current = 'native';
              if (path !== null) await pickWorkspace(path);
              setBusy(false);
              return;
            }
            // Browse: prove the capability with one listing, then open the
            // dialog rooted at the home directory.
            const home = await listDirectory(undefined);
            preferredPickRef.current = 'browse';
            setBrowseRoot(home);
            setBrowseListing(home);
            setBrowseTrail([home]);
            setBrowseOpen(true);
            setBusy(false);
            return;
          } catch {
            // Capability mismatch or a transient failure: try the other verb.
          }
        }
        setBusy(false);
        showError(new Error(t('folderError.unavailable')));
      };

      const adoptBrowsed = (path) => {
        setBrowseOpen(false);
        setBusy(true);
        Promise.resolve()
          .then(() => pickWorkspace(path))
          .catch((reason) => showError(reason))
          .finally(() => setBusy(false));
      };

      /** Load one level of the browse dialog; failures land in the error modal. */
      const openLevel = async (path, trail) => {
        setBrowseBusy(true);
        try {
          const listing = await listDirectory(path);
          setBrowseListing(listing);
          setBrowseTrail(trail);
        } catch (reason) {
          showError(reason);
        } finally {
          setBrowseBusy(false);
        }
      };
      const closeBrowse = () => { setBrowseOpen(false); setBrowseListing(null); setBrowseTrail([]); };

      // The general Workspace stays stored and usable, but it does not read as a
      // project: it is reachable only through 不在项目中工作, never listed.
      const items = workspaces
        .filter((workspace) => workspace.workspaceId !== general?.workspaceId)
        .map((workspace) => ({
          id: workspace.workspaceId,
          label: workspace.displayTitle ?? workspace.title ?? workspace.workspaceId,
          icon: h(IconFolderCloseRegular, { size: 16 }),
          disabled: busy,
        }));
      const addEntries = [{
        id: ADD_WORKSPACE,
        label: t('menu.addWorkspace'),
        icon: h(IconPlusOutlineRegular, { size: 16 }),
        disabled: busy,
      }];
      // 不在项目中工作 mirrors the chip's ×; hidden when there is nowhere to go.
      const noProjectEntries = general === undefined ? [] : [{
        id: NO_PROJECT,
        label: t('menu.noProject'),
        icon: h(IconCloseOutlineRegular, { size: 16 }),
        disabled: busy || general.workspaceId === selectedId,
      }];

      // The general Workspace is not listed, so it must not carry the checkmark
      // either; 不在项目中工作 speaks for it instead.
      const menuSelectedId = items.some((item) => item.id === selectedId) ? selectedId : undefined;

      const handleSelect = (id) => {
        if (id === ADD_WORKSPACE) { void startAdd(); return; }
        if (id === NO_PROJECT) { onClose(); onPick(general.workspaceId); return; }
        onPick(id);
      };

      return h(React.Fragment, null,
        h(Menu, {
          open: open && (items.length > 0 || addEntries.length > 0),
          anchor: null,
          items,
          footer: [...addEntries, ...noProjectEntries],
          selectedId: menuSelectedId,
          onSelect: handleSelect,
          onClose,
          side: 'bottom',
          portal: true,
          getAnchorRect,
        }),
        open && items.length > 0 && workspaceSnapshot.phase === 'pending'
          ? h('div', { role: 'status', style: { padding: '8px 12px', fontSize: 12, opacity: 0.7 } }, t('picker.loading'))
          : null,
        h(Modal, {
          open: browseOpen,
          onClose: closeBrowse,
          closeLabel: t('close'),
          title: t('browse.title'),
          footer: h(React.Fragment, null,
            h(Button, { variant: 'outline', onClick: closeBrowse }, t('cancel')),
            h(Button, {
              variant: 'primary',
              disabled: browseBusy || browseListing === null,
              onClick: () => { if (browseListing !== null) adoptBrowsed(browseListing.path); },
            }, t('browse.chooseHere')),
          ),
        },
        browseListing === null ? null : h('div', { className: CSS_BROWSE },
          h('div', { className: CSS_BROWSE_PATH, title: browseListing.path }, browseListing.path),
          h('div', { className: CSS_BROWSE_LIST, role: 'list' },
            (browseListing.path !== browseListing.home)
              ? h('button', {
                type: 'button',
                className: CSS_BROWSE_ROW,
                onClick: () => {
                  const parent = browseListing.crumbs.length > 1
                    ? browseListing.crumbs[browseListing.crumbs.length - 2]
                    : undefined;
                  if (parent !== undefined) void openLevel(parent.path, browseTrail.slice(0, -1));
                },
              }, '\u2191 ' + t('browse.up'))
              : null,
            (browseListing.entries ?? []).map((entry) => h('button', {
              key: entry.path,
              type: 'button',
              className: CSS_BROWSE_ROW,
              role: 'listitem',
              onClick: () => {
                // Navigate into the child level; the primary button adopts it.
                void openLevel(entry.path, [...browseTrail, browseListing]);
              },
            }, entry.name)),
          ),
        )),
        h(Modal, {
          open: errorOpen,
          onClose: closeModal,
          closeLabel: t('close'),
          title: t('folderError.title'),
          footer: h(React.Fragment, null,
            h(Button, { variant: 'outline', onClick: closeModal }, t('cancel')),
            h(Button, { variant: 'primary', onClick: startAdd }, t('folderError.retry')),
          ),
        }, h('div', { role: 'alert', style: { whiteSpace: 'pre-wrap' } }, modalError)),
        // The picker-dialog occupant the composition serves (browser dialog or
        // native panel). Rendering it here is what lets 添加工作区 stay on
        // whichever capability the Host actually implements.
        chipHost === null ? null : ReactDOM.createPortal(
          h('button', {
            type: 'button',
            className: CROSS_CLASS,
            'aria-label': t('menu.noProject'),
            tabIndex: -1,
            onClick: (event) => {
              // Own both events so the chip's own toggle never sees them.
              event.preventDefault();
              event.stopPropagation();
              if (general === undefined) return;
              onClose();
              onPick(general.workspaceId);
            },
            onPointerDown: (event) => { event.stopPropagation(); },
          }, h(IconCloseOutlineRegular, { size: 16 })),
          chipHost,
        ),
      );
    }

    return {
      inject: ['slots', 'uiWorkspace', 'workspaces', 'locale'],
      apply(ctx) {
        try {
          ctx.effect(() => {
            const style = document.createElement('style');
            style.dataset.plugin = '@local/general-session-picker';
            style.textContent = STYLESHEET;
            document.head.appendChild(style);
            return () => style.remove();
          }, 'general-session-picker: stylesheet');

          // Dictionary registration: a rival namespace owner rolls the pair back.
          ctx.effect(() => {
            const disposers = [];
            const dictionaries = [
              ['zh', {
                'menu.addWorkspace': '添加工作区…',
                'menu.noProject': '不在项目中工作',
                'picker.loading': '正在加载工作区…',
                'folderError.title': '无法打开文件夹',
                'folderError.retry': '重新选择',
                'folderError.unavailable': '目录选择器不可用，请稍后重试',
                'browse.title': '选择工作区目录',
                'browse.chooseHere': '选择此文件夹',
                'browse.up': '上一级',
                'close': '关闭',
                'cancel': '取消',
              }],
              ['en', {
                'menu.addWorkspace': 'Add workspace…',
                'menu.noProject': 'Work without a project',
                'picker.loading': 'Loading workspaces…',
                'folderError.title': 'Couldn’t open folder',
                'folderError.retry': 'Choose again',
                'folderError.unavailable': 'The directory picker is unavailable. Try again later.',
                'browse.title': 'Select workspace directory',
                'browse.chooseHere': 'Choose this folder',
                'browse.up': 'Up',
                'close': 'Close',
                'cancel': 'Cancel',
              }],
            ];
            try {
              for (const [locale, dict] of dictionaries) disposers.push(ctx.locale.register(NS, locale, dict));
            } catch (error) {
              for (const dispose of disposers.reverse()) dispose();
              throw error;
            }
            return () => { for (const dispose of disposers) dispose(); };
          }, 'general-session-picker: dictionaries');

          const injected = () => ({
            createWorkspace: (input) => ctx.get('workspaces').create(input),
            renameWorkspace: (id, title) => ctx.get('workspaces').rename(id, title),
            pickDirectory: () => ctx.uiWorkspace.pickDirectory(),
            listDirectory: (path, signal) => ctx.uiWorkspace.listDirectory(path, signal),
          });

          // Shadow the shipped single seat (the lowest priority renders, so
          // -1 wins and the shipped picker at 0 stays as the fallback). This
          // entry declares nothing, so the directory-flow hole it renders stays
          // owned by the shipped entry — `renderSlot` only authorizes declared
          // children, so the hole is reached through the shipped declaration
          // while our shadow renders its occupant.
          ctx.slots.inject('conversation.hero.workspace', () => ctx.slots.register({
            name: 'conversation.hero.workspace',
            priority: -1,
            inject: injected,
            locale: NS,
          }, GeneralWorkspacePicker));
        } catch (error) {
          window.__GSP_ERR__ = (error && (error.stack || error.message)) || String(error);
          throw error;
        }
      },
    };
  },
});
